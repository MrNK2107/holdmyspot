import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { FakeLlmProvider } from '../src/ai/fake.js';
import type { AiTask, AiTasks, LlmProvider } from '../src/ai/provider.js';
import type { Engine } from '../src/engine/engine.js';
import { PAYPAL_ID_FORMATS, simPayPalId } from '../src/paypal/ids.js';
import { MockPayPalGateway } from '../src/paypal/mock.js';
import {
  PayPalToolkitReader,
  TOOLKIT_MONEY_TOOLS,
  TOOLKIT_PREFIX,
  TOOLKIT_READ_TOOLS,
  allToolkitToolNames,
} from '../src/paypal/toolkit.js';
import { Workspaces } from '../src/workspaces.js';

// The official PayPal Agent Toolkit gives the owner's agent five read tools. These tests prove that no
// toolkit tool that moves money (or anything else outside the allow-list) is reachable by the model:
// not advertised, refused before dispatch, and refused again at the HTTP layer.

const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);
const moneyOps = (m: MockPayPalGateway) => m.calls.filter((c) => ['capture', 'refund', 'void', 'reauthorize', 'placeHold', 'authorizeOrder'].includes(c.op)).length;

class ScriptedAgent extends FakeLlmProvider {
  calls: AiTasks['agent_step']['input'][] = [];
  constructor(private script: Array<{ tool: string; args?: Record<string, unknown> }>) {
    super();
  }
  async run<K extends AiTask>(task: K, input: AiTasks[K]['input']): Promise<AiTasks[K]['output']> {
    if (task !== 'agent_step') return super.run(task, input);
    const i = input as AiTasks['agent_step']['input'];
    this.calls.push(i);
    const next = this.script[i.history.length];
    if (!next) return { tool: 'finish', argsJson: '{"answer":"done"}', why: 'done' } as AiTasks[K]['output'];
    return { tool: next.tool, argsJson: JSON.stringify(next.args ?? {}), why: 'scripted' } as AiTasks[K]['output'];
  }
}

async function chargedAlex(llm?: () => LlmProvider, extra: { agentToolkit?: boolean } = {}): Promise<{ e: Engine; mock: MockPayPalGateway; captureId: string }> {
  const w = await new Workspaces({ ...(llm ? { llm } : {}), ...extra }).create('tk');
  const e = w.engine;
  await e.clock.advanceTo(at(5, 11, 10));
  const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
  await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!.id, 'no_show');
  await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!.id, 'charge');
  expect(alex.state).toBe('CHARGED');
  return { e, mock: w.mock!, captureId: alex.captureId! };
}

describe('PayPal Agent Toolkit: read-only allow-list', () => {
  it('the toolkit, configured with our actions, advertises exactly the five read tools', () => {
    const r = PayPalToolkitReader.simulator(new MockPayPalGateway(() => 0));
    expect([...r.advertised()].sort()).toEqual([...TOOLKIT_READ_TOOLS].sort());
  });

  it('every other toolkit tool, including the money-moving ones, is left out', () => {
    const all = allToolkitToolNames();
    expect(all.length).toBeGreaterThan(40);
    for (const t of TOOLKIT_READ_TOOLS) expect(all).toContain(t);
    for (const t of TOOLKIT_MONEY_TOOLS) {
      expect(all).toContain(t); // our list is not stale against the installed toolkit
      expect(TOOLKIT_READ_TOOLS as readonly string[]).not.toContain(t);
    }
  });

  it('call() refuses any tool outside the allow-list before the toolkit sees it (no HTTP at all)', async () => {
    const r = PayPalToolkitReader.simulator(new MockPayPalGateway(() => 0));
    const outside = allToolkitToolNames().filter((n) => !(TOOLKIT_READ_TOOLS as readonly string[]).includes(n));
    for (const name of outside) await expect(r.call(name, {})).rejects.toThrow(/not on HoldMySpot's read-only toolkit allow-list/);
    expect(r.http).toEqual([]);
  });

  it("the raw toolkit would dispatch create_refund / pay_order despite the config; the HTTP gate refuses the POST", async () => {
    const { mock, captureId } = await chargedAlex();
    const before = moneyOps(mock);
    const r = PayPalToolkitReader.simulator(mock);
    const refund = JSON.stringify(await r.rawToolkitCallForTest('create_refund', { capture_id: captureId }));
    const pay = JSON.stringify(await r.rawToolkitCallForTest('pay_order', { id: '5O190127TN364715T' }));
    expect(refund).toMatch(/refused before it left the server/);
    expect(pay).toMatch(/refused before it left the server/);
    expect(r.http.filter((h) => h.blocked).map((h) => `${h.method} ${h.path}`)).toEqual([
      `POST /v2/payments/captures/${captureId}/refund`,
      'POST /v2/checkout/orders/5O190127TN364715T/capture',
    ]);
    expect(moneyOps(mock)).toBe(before);
  });

  it('a toolkit HTTP call outside a HoldMySpot call never reaches the network', async () => {
    const r = PayPalToolkitReader.simulator(new MockPayPalGateway(() => 0));
    r.advertised(); // loads the toolkit and installs the gate
    const req = createRequire(createRequire(import.meta.url).resolve('@paypal/agent-toolkit/openai'));
    const axios = req('axios');
    await expect(axios.get('https://api-m.sandbox.paypal.com/v1/reporting/transactions')).rejects.toMatchObject({ response: { status: 403 } });
  });
});

describe('simulator ids have the real PayPal formats (the toolkit MCP schemas validate them)', () => {
  it('order, authorization, capture, refund, setup token, vault token and webhook ids', async () => {
    const { e, mock, captureId } = await chargedAlex();
    const alex = [...e.bookings.values()].find((b) => b.captureId === captureId)!;
    expect(alex.orderId).toMatch(PAYPAL_ID_FORMATS.order);
    expect(alex.orderId).toMatch(PAYPAL_ID_FORMATS.resource17);
    expect(alex.authorizationId).toMatch(PAYPAL_ID_FORMATS.resource17);
    expect(captureId).toMatch(PAYPAL_ID_FORMATS.capture);
    expect(captureId).toMatch(PAYPAL_ID_FORMATS.resource17);
    const refund = await mock.refund(captureId, 500, 'fmt-refund');
    expect(refund.refundId).toMatch(PAYPAL_ID_FORMATS.refund);
    expect(refund.refundId).toMatch(PAYPAL_ID_FORMATS.resource17);
    expect(mock.delivered.length).toBeGreaterThan(0);
    for (const ev of mock.delivered) expect(ev.id).toMatch(PAYPAL_ID_FORMATS.webhookEvent);
    for (const c of e.snapshot().clients) if (c.vaulted) expect(e.clients.get(c.id)!.vaultId).toMatch(PAYPAL_ID_FORMATS.vaultPaymentToken);
  });

  it('ids are unique and repeatable', () => {
    const ids = new Set<string>();
    for (const kind of ['ORDER', 'AUTH', 'CAPTURE', 'REFUND', 'VSETUP', 'WH'] as const) for (let i = 1; i <= 5000; i++) ids.add(simPayPalId(kind, i));
    expect(ids.size).toBe(6 * 5000);
    expect(simPayPalId('ORDER', 42)).toBe(simPayPalId('ORDER', 42));
  });
});

describe.each(['functions', 'mcp'] as const)('PayPal Agent Toolkit (%s): read tools answer from the simulator through the toolkit code', (via) => {
  it('list_transactions, get_order and get_refund return PayPal-shaped data', async () => {
    const { e, mock, captureId } = await chargedAlex();
    const r = PayPalToolkitReader.simulator(mock, via);
    const tx = (await r.call('list_transactions', { transaction_id: captureId })) as { result: { found: boolean; transaction_details: Array<{ transaction_info: { transaction_id: string } }> } };
    expect(tx.result.found).toBe(true);
    expect(tx.result.transaction_details[0].transaction_info.transaction_id).toBe(captureId);
    const alex = [...e.bookings.values()].find((b) => b.captureId === captureId)!;
    const order = (await r.call('get_order', { id: alex.orderId })) as { result: { intent: string; purchase_units: Array<{ payments: { captures: Array<{ id: string; status: string }> } }> } };
    expect(order.result.intent).toBe('AUTHORIZE');
    expect(order.result.purchase_units[0].payments.captures[0]).toMatchObject({ id: captureId, status: 'COMPLETED' });
    const refund = await mock.refund(captureId, 2000, 'test-refund');
    const got = (await r.call('get_refund', { refund_id: refund.refundId })) as { result: { status: string }; http: string[] };
    expect(got.result.status).toBe('COMPLETED');
    expect(got.http).toEqual([`GET /v2/payments/refunds/${refund.refundId} → 200`]);
    expect((order as unknown as { via: string }).via).toBe(via);
    expect(r.http.every((h) => h.method === 'GET' || h.path.includes('oauth2'))).toBe(true);
    expect(r.http.some((h) => h.blocked)).toBe(false);
  });
});

describe('PayPal Agent Toolkit in the owner agent', () => {
  it('the trace shows the toolkit tool, its source and the GET it made', async () => {
    const { e, captureId } = await chargedAlex();
    const { run } = await e.askAssistant('Alex apologised, please refund her no-show fee.');
    const step = run.steps.find((s) => s.name === 'paypal.list_transactions')!;
    expect(step).toMatchObject({ kind: 'tool', access: 'read', source: 'paypal-agent-toolkit' });
    expect(step.result).toContain(captureId);
    expect(step.result).toMatch(/GET \/v1\/reporting\/transactions/);
    expect(e.snapshot().agentToolkit?.tools).toEqual(TOOLKIT_READ_TOOLS.map((t) => `${TOOLKIT_PREFIX}${t}`));
  });

  it('no money-moving toolkit tool is reachable by the model: not offered, and denied when asked for', async () => {
    const asks = [
      ...TOOLKIT_MONEY_TOOLS.map((t) => ({ tool: `${TOOLKIT_PREFIX}${t}`, args: {} })),
      { tool: 'create_refund', args: {} },
      { tool: 'pay_order', args: {} },
      { tool: 'paypal.handleToolCall', args: { name: 'create_refund' } },
    ]; // 7 asks, then finish (MAX_STEPS is 8)
    const llm = new ScriptedAgent(asks);
    const { e, mock, captureId } = await chargedAlex(() => llm);
    asks[0].args = { capture_id: captureId };
    const before = moneyOps(mock);
    const { run } = await e.askAssistant('Refund Alex now.');
    // what the model was offered
    const offered = llm.calls.at(-1)!.tools.map((t) => t.name);
    for (const t of TOOLKIT_MONEY_TOOLS) {
      expect(offered).not.toContain(t);
      expect(offered).not.toContain(`${TOOLKIT_PREFIX}${t}`);
    }
    expect(offered.filter((n) => n.startsWith(TOOLKIT_PREFIX)).sort()).toEqual(TOOLKIT_READ_TOOLS.map((t) => `${TOOLKIT_PREFIX}${t}`).sort());
    expect(llm.calls.at(-1)!.tools.filter((t) => t.name.startsWith(TOOLKIT_PREFIX)).every((t) => t.access === 'read')).toBe(true);
    // what happened when it asked anyway
    expect(run.steps.filter((s) => s.kind === 'denied').map((s) => s.name)).toEqual(asks.map((a) => a.tool));
    expect(moneyOps(mock)).toBe(before);
    expect(e.paypalReader!.http).toEqual([]);
    expect(e.openApprovals().some((a) => a.kind === 'refund')).toBe(false);
  });

  it("client texts never get PayPal toolkit tools (least privilege: only the owner's questions do)", async () => {
    const llm = new ScriptedAgent([]);
    const w = await new Workspaces({ llm: () => llm }).create('tk2');
    await w.engine.clock.advanceTo(at(4, 9));
    await w.engine.receiveMessage('sam', "so sorry, can't make it today");
    expect(llm.calls.length).toBeGreaterThan(0);
    for (const c of llm.calls) expect(c.tools.some((t) => t.name.startsWith(TOOLKIT_PREFIX))).toBe(false);
  });

  it('flag off (PAYPAL_AGENT_TOOLKIT=off): no toolkit tools, snapshot says so', async () => {
    const { e } = await chargedAlex(undefined, { agentToolkit: false });
    const { run } = await e.askAssistant('How did this week go?');
    expect(run.steps.some((s) => s.name.startsWith(TOOLKIT_PREFIX))).toBe(false);
    expect(e.snapshot().agentToolkit).toBeNull();
  });
});

describe("PayPal Agent Toolkit over MCP (PayPal's MCP server class, in-process)", () => {
  it('tools/list from the MCP server, built with our actions, is exactly the five read tools', async () => {
    const r = PayPalToolkitReader.simulator(new MockPayPalGateway(() => 0), 'mcp');
    expect((await r.mcpTools()).sort()).toEqual([...TOOLKIT_READ_TOOLS].sort());
  });

  it('the MCP layer itself rejects money tools (not registered); nothing is sent', async () => {
    const { mock, captureId } = await chargedAlex();
    const before = moneyOps(mock);
    const r = PayPalToolkitReader.simulator(mock, 'mcp');
    for (const name of TOOLKIT_MONEY_TOOLS) {
      const out = (await r.rawMcpCallForTest(name, { capture_id: captureId, id: 'ORDER0000000000000001' })) as { isError?: boolean; content: Array<{ text: string }> };
      expect(out.isError).toBe(true);
      expect(out.content[0].text).toMatch(/not found/i);
    }
    expect(r.http).toEqual([]);
    expect(moneyOps(mock)).toBe(before);
  });

  it('a read tool answers through MCP from the simulator, and the GET passes the HTTP gate', async () => {
    const { mock, captureId } = await chargedAlex();
    const r = PayPalToolkitReader.simulator(mock, 'mcp');
    const tx = (await r.call('list_transactions', { transaction_id: captureId })) as { via: string; result: { found: boolean }; http: string[] };
    expect(tx.via).toBe('mcp');
    expect(tx.result.found).toBe(true);
    expect(tx.http[0]).toMatch(/^GET \/v1\/reporting\/transactions/);
  });

  it('PAYPAL_AGENT_TOOLKIT=mcp: the owner agent reads PayPal through the MCP server', async () => {
    const w = await new Workspaces({ agentToolkit: 'mcp' }).create('tk3');
    const e = w.engine;
    await e.clock.advanceTo(at(5, 11, 10));
    const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!.id, 'no_show');
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!.id, 'charge');
    const { answer, run } = await e.askAssistant('How did this week go?');
    const step = run.steps.find((s) => s.name === 'paypal.list_transactions')!;
    expect(step.result).toMatch(/"via":"mcp"/);
    expect(answer).toMatch(/PayPal's report shows 1 settled transaction/);
    expect(e.snapshot().agentToolkit?.via).toBe('mcp');
  });
});
