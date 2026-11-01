import { randomBytes } from 'node:crypto';
import { FakeLlmProvider } from './ai/fake.js';
import { FrontDesk } from './ai/frontdesk.js';
import type { LlmProvider } from './ai/provider.js';
import { DemoClock } from './clock.js';
import { Engine } from './engine/engine.js';
import type { PaymentsGateway, WebhookEvent } from './paypal/gateway.js';
import { MockPayPalGateway } from './paypal/mock.js';
import { RequestPreview } from './paypal/preview.js';
import { PayPalToolkitReader, type ToolkitVia } from './paypal/toolkit.js';
import { DEMO_START, SEED_POLICY, seed } from './seed.js';

export interface WorkspaceDeps {
  llm?: () => LlmProvider;
  /** shared real gateway; when absent each workspace gets its own deterministic simulator */
  gateway?: PaymentsGateway;
  baseUrl?: string;
  /**
   * PayPal Agent Toolkit read tools for the owner's questions (on unless false). In simulator mode the
   * toolkit's HTTP calls are answered from the workspace's simulator; with a real gateway it needs
   * toolkitCredentials and calls api.sandbox.paypal.com (GET only).
   */
  agentToolkit?: boolean | ToolkitVia;
  toolkitCredentials?: { clientId: string; clientSecret: string };
}

export interface Workspace {
  engine: Engine;
  mock?: MockPayPalGateway;
  /** simulator mode: the REST requests the real adapter would have sent (see paypal/preview.ts) */
  preview?: RequestPreview;
  /** beats of the guided demo already played (see demo.ts) */
  demoStep?: number;
}

/** Per-visitor demo workspaces (design §12.1): each has its own bookings, clock and audit log. */
export class Workspaces {
  private map = new Map<string, Workspace>();
  private seq = 0;
  /** per-workspace tail of the operation queue (see run) */
  private tails = new Map<string, Promise<unknown>>();
  /** one toolkit client for the real sandbox account (shared, like the real gateway) */
  private toolkitShared?: PayPalToolkitReader;

  constructor(private deps: WorkspaceDeps = {}) {}

  /** Hosted demo safety: keep at most this many workspaces, evicting the oldest visitor workspace. */
  maxWorkspaces = 100;

  // visitor workspace ids carry 48 random bits so one visitor cannot guess and drive another's workspace
  async create(id = `ws${++this.seq}-${randomBytes(6).toString('hex')}`): Promise<Workspace> {
    while (this.map.size >= this.maxWorkspaces) {
      const oldest = [...this.map.keys()].find((k) => k !== 'demo');
      if (!oldest) break;
      this.map.delete(oldest);
    }
    const clock = new DemoClock(DEMO_START);
    let mock: MockPayPalGateway | undefined;
    let preview: RequestPreview | undefined;
    let gateway = this.deps.gateway;
    if (!gateway) {
      mock = new MockPayPalGateway(() => clock.now(), { baseUrl: `${this.deps.baseUrl ?? ''}/sim/${id}` });
      preview = new RequestPreview(() => clock.now(), this.deps.baseUrl ?? '');
      gateway = preview.wrap(mock);
    }
    const llm = this.deps.llm ?? (() => new FakeLlmProvider());
    let paypalReader: PayPalToolkitReader | undefined;
    if (this.deps.agentToolkit !== false) {
      const via: ToolkitVia = this.deps.agentToolkit === 'mcp' ? 'mcp' : 'functions';
      if (mock) paypalReader = PayPalToolkitReader.simulator(mock, via);
      else if (this.deps.toolkitCredentials) {
        // one client for the shared sandbox account; each workspace reads only its own objects through it
        this.toolkitShared ??= PayPalToolkitReader.sandbox(this.deps.toolkitCredentials.clientId, this.deps.toolkitCredentials.clientSecret, via);
        paypalReader = this.toolkitShared.forWorkspace({ owns: (c) => engine.ownsCustomId(c), ids: () => engine.paypalIds() });
      }
    }
    const engine = new Engine({
      id,
      clock,
      gateway,
      frontdesk: (audit) => new FrontDesk(llm(), audit),
      policy: SEED_POLICY,
      ownerName: 'Priya',
      businessName: 'Polished by Priya',
      baseUrl: this.deps.baseUrl,
      paypalReader,
    });
    if (mock) {
      // Deliver simulated webhooks after the API call returns, as PayPal does.
      mock.onWebhook((e) => {
        setImmediate(() => {
          this.run(id, () => engine.ingestWebhook(e)).catch((err) => engine.audit.add('webhook', `${e.event_type} ${e.id}: handler error ${(err as Error).message}`));
        });
      });
    }
    const ws = { engine, mock, preview };
    this.map.set(id, ws);
    await seed(engine);
    return ws;
  }

  /**
   * Serializes engine operations per workspace (HTTP actions, PayPal returns, webhooks real and simulated)
   * so money logic never interleaves at a network await.
   */
  run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.tails.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  }

  get(id: string): Workspace | undefined {
    return this.map.get(id);
  }

  async reset(id: string): Promise<Workspace> {
    this.map.delete(id);
    return this.create(id);
  }

  /** Finds the workspace waiting on a PayPal approval (order id or vault setup token). */
  findByPendingApproval(id: string): Workspace | undefined {
    return [...this.map.values()].find((w) => w.engine.hasPendingApproval(id));
  }

  ids(): string[] {
    return [...this.map.keys()];
  }

  /** Real PayPal webhooks: route by custom_id = "<workspace>:<booking>". */
  async routeWebhook(e: WebhookEvent): Promise<'processed' | 'duplicate' | 'ignored' | 'unknown_workspace'> {
    const wsId = e.resource.custom_id?.split(':')[0];
    // refund resources carry no custom_id: find the workspace that created the object
    const ws = wsId ? this.map.get(wsId) : [...this.map.values()].find((w) => w.engine.paypalIds().has(e.resource.id));
    if (!ws) return 'unknown_workspace';
    return this.run(ws.engine.id, () => ws.engine.ingestWebhook(e));
  }
}
