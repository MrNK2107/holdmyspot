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
  /** one toolkit client for the real sandbox account (shared, like the real gateway) */
  private toolkitShared?: PayPalToolkitReader;

  constructor(private deps: WorkspaceDeps = {}) {}

  /** Hosted demo safety: keep at most this many workspaces, evicting the oldest visitor workspace. */
  maxWorkspaces = 100;

  async create(id = `ws${++this.seq}`): Promise<Workspace> {
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
        paypalReader = this.toolkitShared ??= PayPalToolkitReader.sandbox(this.deps.toolkitCredentials.clientId, this.deps.toolkitCredentials.clientSecret, via);
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
          engine.ingestWebhook(e).catch((err) => engine.audit.add('webhook', `${e.event_type} ${e.id}: handler error ${(err as Error).message}`));
        });
      });
    }
    const ws = { engine, mock, preview };
    this.map.set(id, ws);
    await seed(engine);
    return ws;
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
    const ws = wsId ? this.map.get(wsId) : undefined;
    if (!ws) return 'unknown_workspace';
    return ws.engine.ingestWebhook(e);
  }
}
