/**
 * PayPal Agent Toolkit (@paypal/agent-toolkit, official) as the agent's *read* window onto PayPal.
 *
 * Safety design (docs/AGENT_TOOLKIT.md):
 *  1. Allow-list. The toolkit is built with only the read actions below, so getTools() advertises
 *     exactly five read tools. Nothing that creates, captures, refunds or accepts a dispute.
 *  2. Dispatch gate. The toolkit's own handleToolCall() runs any method name it is given, whatever
 *     the configuration says (checked in 1.11.0: the action filter only affects getTools()). So we
 *     never hand a model-chosen name to it: `call()` refuses anything outside the allow-list first.
 *  3. HTTP gate. Every request the toolkit makes goes through an axios adapter we install. It lets
 *     through GET and the OAuth token POST only; any other method is refused before it leaves the
 *     process, and logged. With no HoldMySpot call in progress nothing goes out at all.
 *
 * Money still moves only through PaymentsGateway, called by the policy engine after the code gate
 * (auto-release) or the owner's tap. In simulator mode the toolkit's HTTP calls are answered from the
 * simulator's state (read-only copy); with PAYMENTS=sandbox they go to api.sandbox.paypal.com
 * (written against the toolkit's code, not yet run against the live sandbox: no keys).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { PayPalAgentToolkit } from '@paypal/agent-toolkit/openai';
import { centsToValue } from './gateway.js';
import type { MockPayPalGateway } from './mock.js';

export const TOOLKIT_PACKAGE = '@paypal/agent-toolkit';

const require = createRequire(import.meta.url);
const toolkitEntry = require.resolve('@paypal/agent-toolkit/openai');
export const TOOLKIT_VERSION: string = JSON.parse(readFileSync(join(dirname(toolkitEntry), '..', 'package.json'), 'utf8')).version;
/** Loaded on first use (it costs ~110 MB of RSS), so workspaces that never ask PayPal do not pay for it. */
const loadToolkit = () => require('@paypal/agent-toolkit/openai') as typeof import('@paypal/agent-toolkit/openai');

/** The only toolkit tools the agent can see or call. All are HTTP GETs. */
export const TOOLKIT_READ_TOOLS = ['list_transactions', 'get_order', 'get_refund', 'list_disputes', 'get_dispute'] as const;
export type ToolkitReadTool = (typeof TOOLKIT_READ_TOOLS)[number];

/** Toolkit `configuration.actions` that enables exactly TOOLKIT_READ_TOOLS (asserted in test/toolkit.test.ts). */
export const TOOLKIT_READ_ACTIONS = {
  transactions: { list: true },
  orders: { get: true },
  payments: { getRefunds: true },
  disputes: { list: true, get: true },
};

/** Toolkit tools that move money or settle a claim. Never given to the agent; listed for the UI and tests. */
export const TOOLKIT_MONEY_TOOLS = ['create_order', 'pay_order', 'create_refund', 'accept_dispute_claim'] as const;

/** Name prefix in the agent's toolset, so the trace shows where a tool comes from. */
export const TOOLKIT_PREFIX = 'paypal.';

/** Every tool name the installed toolkit can expose (all actions on). Used only to prove what we leave out. */
export function allToolkitToolNames(): string[] {
  const { PayPalAgentToolkit, ALL_TOOLS_ENABLED } = loadToolkit();
  const tk = new PayPalAgentToolkit({ clientId: 'unused', clientSecret: 'unused', configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: true } } });
  return tk.getTools().map((t) => t.function.name);
}

// ---------------- HTTP gate ----------------

export interface ToolkitHttpCall {
  method: string;
  path: string;
  status: number;
  blocked?: boolean;
}

type Backend = { kind: 'simulator'; sim: MockPayPalGateway } | { kind: 'live' };
const als = new AsyncLocalStorage<{ backend: Backend; log: ToolkitHttpCall[] }>();

let installed = false;

function installHttpGate(): void {
  if (installed) return;
  installed = true;
  // the exact axios instance the toolkit loads (hoisted or nested), so the adapter governs its calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const axios: any = createRequire(toolkitEntry)('axios');
  const network = axios.getAdapter(axios.defaults.adapter);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  axios.defaults.adapter = async (config: any) => {
    const store = als.getStore();
    const method = String(config.method ?? 'get').toUpperCase();
    const url = new URL(String(config.url));
    for (const [k, v] of Object.entries(config.params ?? {})) if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
    const respond = (status: number, data: unknown) => {
      const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
      if (status >= 400) throw new axios.AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, {}, response);
      return response;
    };
    if (!store) return respond(403, { name: 'BLOCKED', message: 'PayPal Agent Toolkit call outside HoldMySpot\'s read-only boundary' });
    const isToken = method === 'POST' && url.pathname === '/v1/oauth2/token';
    if (method !== 'GET' && !isToken) {
      store.log.push({ method, path: url.pathname, status: 403, blocked: true });
      return respond(403, { name: 'BLOCKED', message: `HoldMySpot lets the agent read PayPal only; ${method} ${url.pathname} was refused before it left the server` });
    }
    if (store.backend.kind === 'live') {
      const res = await network(config);
      if (!isToken) store.log.push({ method, path: url.pathname, status: res.status });
      return res;
    }
    const { status, data } = simulate(store.backend.sim, method, url);
    if (!isToken) store.log.push({ method, path: url.pathname + (url.search ? '?…' : ''), status });
    return respond(status, data);
  };
}

// ---------------- simulator answers (PayPal REST response shapes, from the simulator's state) ----------------

const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
const usd = (cents: number) => ({ currency_code: 'USD', value: centsToValue(Math.abs(cents)) });
const notFound = (what: string) => ({ status: 404, data: { name: 'RESOURCE_NOT_FOUND', message: `${what} does not exist (simulator)` } });

function simulate(sim: MockPayPalGateway, method: string, url: URL): { status: number; data: unknown } {
  if (method === 'POST') return { status: 200, data: { access_token: 'SIMULATOR-ACCESS-TOKEN', token_type: 'Bearer', expires_in: 32400 } };
  const v = sim.readView();
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/v2\/checkout\/orders\/([^/]+)$/))) {
    const o = v.orders.find((x) => x.id === m![1]);
    if (!o) return notFound(`order ${m[1]}`);
    const auths = v.authorizations.filter((a) => a.orderId === o.id);
    const caps = v.captures.filter((c) => auths.some((a) => a.id === c.authId));
    const refs = v.refunds.filter((r) => caps.some((c) => c.id === r.captureId));
    return {
      status: 200,
      data: {
        id: o.id,
        intent: 'AUTHORIZE',
        status: auths.length ? 'COMPLETED' : o.approved ? 'APPROVED' : 'PAYER_ACTION_REQUIRED',
        purchase_units: [
          {
            custom_id: o.customId,
            description: o.description,
            amount: usd(o.amountCents),
            payments: {
              authorizations: auths.map((a) => ({ id: a.id, status: a.status, amount: usd(a.amountCents), create_time: iso(a.createdAt), expiration_time: iso(a.expiresAt) })),
              captures: caps.map((c) => ({
                id: c.id,
                status: c.refundedCents === 0 ? 'COMPLETED' : c.refundedCents < c.amountCents ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
                amount: usd(c.amountCents),
                create_time: iso(c.createdAt),
              })),
              refunds: refs.map((r) => ({ id: r.id, status: 'COMPLETED', amount: usd(r.amountCents), create_time: iso(r.createdAt) })),
            },
          },
        ],
      },
    };
  }
  if ((m = p.match(/^\/v2\/payments\/refunds\/([^/]+)$/))) {
    const r = v.refunds.find((x) => x.id === m![1]);
    if (!r) return notFound(`refund ${m[1]}`);
    return { status: 200, data: { id: r.id, status: 'COMPLETED', amount: usd(r.amountCents), create_time: iso(r.createdAt), links: [{ rel: 'up', href: `/v2/payments/captures/${r.captureId}`, method: 'GET' }] } };
  }
  if (p === '/v1/reporting/transactions') {
    // Settled money only (captures and refunds); open holds are authorizations, not transactions.
    // The demo runs on its own clock, so the simulator ignores the date range. Event codes are left out
    // rather than guessed.
    const customOf = (authId: string) => v.authorizations.find((a) => a.id === authId)?.customId;
    const rows = [
      ...v.captures.map((c) => ({ at: c.createdAt, info: { transaction_id: c.id, paypal_reference_id: c.authId, transaction_amount: usd(c.amountCents), custom_field: customOf(c.authId) } })),
      ...v.refunds.map((r) => {
        const c = v.captures.find((x) => x.id === r.captureId);
        return { at: r.createdAt, info: { transaction_id: r.id, paypal_reference_id: r.captureId, transaction_amount: { ...usd(r.amountCents), value: `-${centsToValue(r.amountCents)}` }, custom_field: c ? customOf(c.authId) : undefined } };
      }),
    ].sort((a, b) => a.at - b.at);
    return {
      status: 200,
      data: {
        transaction_details: rows.map((r) => ({ transaction_info: { ...r.info, transaction_status: 'S', transaction_initiation_date: iso(r.at), transaction_updated_date: iso(r.at) } })),
        account_number: 'SIMULATOR',
        start_date: url.searchParams.get('start_date'),
        end_date: url.searchParams.get('end_date'),
        page: 1,
        total_items: rows.length,
        total_pages: 1,
      },
    };
  }
  if (p === '/v1/customer/disputes') return { status: 200, data: { items: [], links: [] } };
  if ((m = p.match(/^\/v1\/customer\/disputes\/([^/]+)$/))) return notFound(`dispute ${m[1]}`);
  return { status: 404, data: { name: 'NOT_SUPPORTED_BY_SIMULATOR', message: p } };
}

// ---------------- the reader the engine hands to the agent ----------------

const DESCRIPTIONS: Record<ToolkitReadTool, string> = {
  list_transactions: 'PayPal Agent Toolkit: settled PayPal transactions (captures, refunds). args: {"transaction_id"?: "<capture or refund id>"}',
  get_order: 'PayPal Agent Toolkit: one PayPal order with its authorizations, captures and refunds. args: {"id": "<order id>"}',
  get_refund: 'PayPal Agent Toolkit: one refund and the capture it belongs to. args: {"refund_id": "<id>"}',
  list_disputes: 'PayPal Agent Toolkit: open buyer disputes. args: {}',
  get_dispute: 'PayPal Agent Toolkit: one dispute. args: {"dispute_id": "<id>"}',
};

/** Arguments each read tool may pass on; anything else the model sends is dropped. */
const ARG_KEYS: Record<ToolkitReadTool, string[]> = {
  list_transactions: ['transaction_id', 'start_date', 'end_date'],
  get_order: ['id'],
  get_refund: ['refund_id'],
  list_disputes: ['dispute_state', 'disputed_transaction_id'],
  get_dispute: ['dispute_id'],
};

export interface ToolkitReadToolDef {
  name: string;
  description: string;
  source: 'paypal-agent-toolkit';
  run(args: Record<string, unknown>): Promise<unknown>;
}

/**
 * How the agent's calls reach the toolkit:
 *  - 'functions': the toolkit's function-calling surface (getTools / handleToolCall).
 *  - 'mcp': PayPal's MCP server class from the same package (`@paypal/agent-toolkit/mcp`, what
 *    `npx @paypal/mcp --tools=...` runs), connected in-process over an in-memory MCP transport.
 *    Only the allow-listed tools are registered, so the MCP layer itself rejects any other name.
 *    Its tool schemas validate PayPal id formats; the simulator issues ids in the real formats
 *    (paypal/ids.ts), so get_order / get_refund work in both modes against the simulator too.
 */
export type ToolkitVia = 'functions' | 'mcp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type McpClient = { callTool(p: { name: string; arguments: Record<string, unknown> }): Promise<any>; listTools(): Promise<{ tools: Array<{ name: string }> }>; close(): Promise<void> };

export class PayPalToolkitReader {
  private tk?: PayPalAgentToolkit;
  private mcp?: { client: Promise<McpClient>; at: number };
  /** every HTTP request the toolkit made (or tried) for this workspace */
  readonly http: ToolkitHttpCall[] = [];
  private seq = 0;

  constructor(
    private backend: Backend & { clientId?: string; clientSecret?: string },
    readonly via: ToolkitVia = 'functions',
  ) {}

  /** PayPal's MCP server (toolkit build) with our allow-list, and an MCP client wired to it in memory. */
  private mcpClient(): Promise<McpClient> {
    // sandbox access tokens live 3-8 h; reconnect with a fresh one every hour
    if (this.mcp && Date.now() - this.mcp.at < 3600_000) return this.mcp.client;
    const client = (async () => {
      installHttpGate();
      const accessToken =
        this.backend.kind === 'live' ? await als.run({ backend: this.backend, log: this.http }, () => this.toolkit.client.getAccessToken()) : 'SIMULATOR-ACCESS-TOKEN';
      const { PayPalAgentToolkit: McpServerToolkit } = require('@paypal/agent-toolkit/mcp') as typeof import('@paypal/agent-toolkit/mcp');
      const server = new McpServerToolkit({ accessToken, configuration: { actions: TOOLKIT_READ_ACTIONS, context: { sandbox: true } } });
      const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      const c = new Client({ name: 'holdmyspot-front-desk', version: '1.0.0' });
      await c.connect(clientSide);
      return c as unknown as McpClient;
    })();
    this.mcp = { client, at: Date.now() };
    client.catch(() => {
      this.mcp = undefined;
    });
    return client;
  }

  /** MCP tools/list from PayPal's MCP server as configured here */
  async mcpTools(): Promise<string[]> {
    return (await (await this.mcpClient()).listTools()).tools.map((t) => t.name);
  }

  private get toolkit(): PayPalAgentToolkit {
    if (!this.tk) {
      installHttpGate();
      const { PayPalAgentToolkit } = loadToolkit();
      this.tk = new PayPalAgentToolkit({
        clientId: this.backend.kind === 'live' ? this.backend.clientId! : 'simulator',
        clientSecret: this.backend.kind === 'live' ? this.backend.clientSecret! : 'simulator',
        configuration: { actions: TOOLKIT_READ_ACTIONS, context: { sandbox: true } },
      });
    }
    return this.tk;
  }

  static simulator(sim: MockPayPalGateway, via: ToolkitVia = 'functions'): PayPalToolkitReader {
    return new PayPalToolkitReader({ kind: 'simulator', sim }, via);
  }

  static sandbox(clientId: string, clientSecret: string, via: ToolkitVia = 'functions'): PayPalToolkitReader {
    return new PayPalToolkitReader({ kind: 'live', clientId, clientSecret }, via);
  }

  /** what the toolkit advertises with our configuration (OpenAI function schemas from the toolkit) */
  advertised(): string[] {
    return this.toolkit.getTools().map((t) => t.function.name);
  }

  isAllowed(name: string): name is ToolkitReadTool {
    return (TOOLKIT_READ_TOOLS as readonly string[]).includes(name);
  }

  /** The only way in. Refuses anything outside the allow-list before the toolkit sees it. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.isAllowed(name)) throw new Error(`"${name}" is not on HoldMySpot's read-only toolkit allow-list`);
    const clean: Record<string, unknown> = {};
    for (const k of ARG_KEYS[name]) {
      const val = args[k];
      if (typeof val === 'string' && val.length <= 128) clean[k] = val;
    }
    if (this.http.length > 200) this.http.splice(0, this.http.length - 200);
    const before = this.http.length;
    let text: string;
    if (this.via === 'mcp') {
      const client = await this.mcpClient();
      const out = await als.run({ backend: this.backend, log: this.http }, () => client.callTool({ name, arguments: clean }));
      text = (out.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
      if (out.isError) text = JSON.stringify({ error: text.slice(0, 400) });
    } else {
      const msg = await als.run({ backend: this.backend, log: this.http }, () =>
        this.toolkit.handleToolCall({ id: `call_${++this.seq}`, type: 'function', function: { name, arguments: JSON.stringify(clean) } }),
      );
      text = String(msg.content);
    }
    let result: unknown = text;
    try {
      result = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { via: this.via, result, http: this.http.slice(before).map((h) => `${h.method} ${h.path} → ${h.status}${h.blocked ? ' (blocked)' : ''}`) };
  }

  tools(): ToolkitReadToolDef[] {
    return TOOLKIT_READ_TOOLS.map((name) => ({
      name: `${TOOLKIT_PREFIX}${name}`,
      description: DESCRIPTIONS[name],
      source: 'paypal-agent-toolkit' as const,
      run: (args) => this.call(name, args),
    }));
  }

  /** Test hook: what PayPal's MCP server answers to a name we would never pass. */
  async rawMcpCallForTest(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.mcpClient();
    return als.run({ backend: this.backend, log: this.http }, () => client.callTool({ name, arguments: args }));
  }

  /** Test hook: what the raw toolkit does with a name we would never pass (proves the HTTP gate). */
  async rawToolkitCallForTest(name: string, args: Record<string, unknown>): Promise<unknown> {
    return als.run({ backend: this.backend, log: this.http }, () =>
      this.toolkit.handleToolCall({ id: `raw_${++this.seq}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }),
    );
  }
}
