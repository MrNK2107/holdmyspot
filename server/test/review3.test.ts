import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

// Follow-up of the suspected issues listed by the 2026-11-02 money review (NIGHT_RUN_NOTES.md).
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('review 2026-11-02 follow-up', () => {
  it('a real webhook waits for the workspace lock instead of interleaving with an owner tap', async () => {
    const reg = new Workspaces();
    const w = await reg.create('demo');
    const app = await buildApp({ workspaces: reg, webhookVerifier: async () => true });
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // an owner tap that is mid-way through a PayPal call
    w.engine.resolveApproval = (async () => {
      order.push('tap start');
      await gate;
      order.push('tap end');
      return [...w.engine.bookings.values()][0];
    }) as typeof w.engine.resolveApproval;
    const ingest = w.engine.ingestWebhook.bind(w.engine);
    w.engine.ingestWebhook = async (ev) => {
      if (ev.id === 'WH-L1') order.push('webhook'); // not the seed's simulated ones
      return ingest(ev);
    };
    const tap = Promise.resolve(app.inject({ method: 'POST', url: '/api/ws/demo/approvals/ap_1', payload: { choice: 'charge' } }));
    await tick();
    const ev = { id: 'WH-L1', event_type: 'PAYMENT.CAPTURE.COMPLETED', create_time: '', resource: { id: 'C1', custom_id: 'demo:bk_1' } };
    const hook = Promise.resolve(app.inject({ method: 'POST', url: '/api/paypal/webhook', payload: ev }));
    await tick();
    release();
    const [, h] = await Promise.all([tap, hook]);
    expect(h.json()).toEqual({ result: 'processed' });
    expect(order).toEqual(['tap start', 'tap end', 'webhook']);
    await app.close();
  });
});

describe('which visit a text is about (several upcoming visits)', () => {
  it('a weekday that two visits share means the nearer one, never an unnamed visit; a date picks its own week', async () => {
    const w = await new Workspaces().create('t3');
    const e = w.engine;
    // Riley: Mon 2 Nov gel 15:00, Wed 4 Nov pedicure, Sat 7 Nov nail art (seed) + Wed 11 Nov gel
    const wed11 = await e.createBooking({ clientId: 'riley', serviceId: 'gel', start: at(11, 15) });
    const wed4 = [...e.bookings.values()].find((b) => b.clientId === 'riley' && b.start === at(4, 11))!;
    expect(e.bookingForText('riley', "I can't make it on Wednesday, sorry")?.id).toBe(wed4.id);
    expect(e.bookingForText('riley', 'please cancel my appointment on the 11th')?.id).toBe(wed11.id);
    expect(e.bookingForText('riley', 'need to cancel Nov 11')?.id).toBe(wed11.id);
    expect(e.bookingForText('riley', 'cancel Wednesday 11th please')?.id).toBe(wed11.id);
    // nothing named: the next visit, as before
    expect(e.bookingForText('riley', 'running 10 min late')?.start).toBe(at(2, 15));
  });
});

describe('capture invariant', () => {
  it('caps a capture at the fee for its kind, not just at the hold', async () => {
    const rules = { ...(await import('../src/domain/policy.js')).DEFAULT_RULES, holdCents: 2000, noShowFeeCents: 1000, lateCancelFeeCents: 1500 };
    const { captureViolations } = await import('../src/domain/policy.js');
    const check = (amountCents: number, kind: 'no_show' | 'late_cancel') => captureViolations({ amountCents, authorizedCents: 2000, rules, kind, ownerApproved: true });
    expect(check(1000, 'no_show')).toEqual([]);
    expect(check(2000, 'no_show').join()).toMatch(/no-show fee/);
    expect(check(1500, 'late_cancel')).toEqual([]);
    expect(check(1600, 'late_cancel').join()).toMatch(/late-cancel fee/);
  });

  it('a fee card whose amount exceeds the no-show fee is blocked at capture', async () => {
    const { approve } = await import('../src/domain/policy.js');
    const w = await new Workspaces().create('t4');
    const e = w.engine;
    e.setPolicy(approve(e.policy, { ...e.policy.rules, noShowFeeCents: 1000, lateCancelFeeCents: 1000 }, 'v2', e.now()));
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(3, 18) });
    await e.clock.advanceTo(at(3, 18, 10));
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === b.id && a.kind === 'attendance')!.id, 'no_show');
    const card = e.openApprovals().find((a) => a.bookingId === b.id && a.kind === 'capture')!;
    if (card.kind !== 'capture') throw new Error('no capture card');
    card.feeCents = b.holdCents; // e.g. a card built from the wrong rule
    await expect(e.resolveApproval(card.id, 'charge')).rejects.toThrow(/no-show fee/);
    expect(b.captureId).toBeUndefined();
  });
});

describe('shared sandbox account: the Agent Toolkit reads only the asking workspace', () => {
  const chargeAlex = async (e: import('../src/engine/engine.js').Engine) => {
    await e.clock.advanceTo(at(5, 11, 10));
    const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!.id, 'no_show');
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!.id, 'charge');
    return alex;
  };

  it('each workspace gets its own scoped view of the one toolkit client', async () => {
    const { MockPayPalGateway } = await import('../src/paypal/mock.js');
    const { DEMO_START } = await import('../src/seed.js');
    const reg = new Workspaces({ gateway: new MockPayPalGateway(() => DEMO_START), toolkitCredentials: { clientId: 'x', clientSecret: 'y' } });
    const a = await reg.create('A');
    const b = await reg.create('B');
    expect(a.engine.paypalReader).toBeTruthy();
    expect(a.engine.paypalReader).not.toBe(b.engine.paypalReader); // no network: the toolkit loads on first call
  });

  it("one workspace's owner questions cannot list or fetch another workspace's PayPal objects", async () => {
    const { MockPayPalGateway } = await import('../src/paypal/mock.js');
    const { PayPalToolkitReader } = await import('../src/paypal/toolkit.js');
    let active: import('../src/engine/engine.js').Engine | undefined; // the account's clock follows the workspace acting
    const account = new MockPayPalGateway(() => active?.now() ?? Date.UTC(2026, 10, 2, 9));
    const reg = new Workspaces({ gateway: account, agentToolkit: false });
    const A = (await reg.create('A')).engine;
    const B = (await reg.create('B')).engine;
    active = A;
    const alexA = await chargeAlex(A);
    active = B;
    const alexB = await chargeAlex(B);
    const reader = PayPalToolkitReader.simulator(account).forWorkspace({ owns: (c) => A.ownsCustomId(c), ids: () => A.paypalIds() });
    type Tx = { result: { transaction_details?: Array<{ transaction_info: { transaction_id: string } }>; error?: string } };
    const all = (await reader.call('list_transactions', {})) as Tx;
    expect(all.result.transaction_details!.map((r) => r.transaction_info.transaction_id)).toEqual([alexA.captureId]);
    const other = (await reader.call('list_transactions', { transaction_id: alexB.captureId })) as Tx;
    expect(other.result.error).toMatch(/not one of this studio/);
    const order = (await reader.call('get_order', { id: alexB.orderId })) as Tx & { http: string[] };
    expect(order.result.error).toMatch(/not one of this studio/);
    expect(order.http).toEqual([]); // refused before any request
    const mine = (await reader.call('get_order', { id: alexA.orderId })) as { result: { id: string } };
    expect(mine.result.id).toBe(alexA.orderId);
  });
});

describe('money webhooks other than AUTHORIZATION.CREATED', () => {
  const charged = async () => {
    const w = await new Workspaces().create('t5');
    const e = w.engine;
    await e.clock.advanceTo(at(5, 11, 10));
    const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!.id, 'no_show');
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!.id, 'charge');
    expect(alex.state).toBe('CHARGED');
    return { e, alex, mock: w.mock! };
  };
  const view = (e: import('../src/engine/engine.js').Engine, id: string) => e.snapshot().bookings.find((b) => b.id === id)!;

  it.each(['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REVERSED'] as const)('%s: the booking no longer shows a collected fee, and it cannot be "refunded"', async (type) => {
    const { e, alex } = await charged();
    expect(view(e, alex.id).money).toBe('captured');
    const r = await e.ingestWebhook({ id: `WH-${type}`, event_type: type, create_time: '', resource: { id: alex.captureId!, custom_id: `t5:${alex.id}`, status: type.endsWith('DENIED') ? 'DECLINED' : 'REVERSED' } });
    expect(r).toBe('processed');
    expect(view(e, alex.id).money).toBe('reversed');
    expect(alex.paymentIssue).toMatch(type.endsWith('DENIED') ? /denied/ : /reversed/);
    await expect(e.refund(alex.id)).rejects.toThrow(/no collected fee to refund/);
    const run = await e.askAssistant('how did this week go?');
    expect(JSON.stringify(run.run.steps)).not.toMatch(/"chargedCents":2000/);
  });

  it('a capture event for another capture id (an older one) changes nothing', async () => {
    const { e, alex } = await charged();
    await e.ingestWebhook({ id: 'WH-X', event_type: 'PAYMENT.CAPTURE.DENIED', create_time: '', resource: { id: 'SOMEOTHERCAPTURE1', custom_id: `t5:${alex.id}` } });
    expect(view(e, alex.id).money).toBe('captured');
    expect(alex.paymentIssue).toBeUndefined();
  });

  it('a failed refund is no longer shown as refunded, and the owner gets a card to try again with a new request id', async () => {
    const { e, alex, mock } = await charged();
    await e.refund(alex.id);
    const refundId = alex.refundId!;
    // the simulator has no failing refunds: undo its bookkeeping, as PayPal would for a FAILED refund
    (mock as unknown as { captures: Map<string, { refundedCents: number }> }).captures.get(alex.captureId!)!.refundedCents = 0;
    expect(view(e, alex.id).money).toBe('refunded');
    // refund resources carry no custom_id: matched by the refund id this workspace created
    const reg = new Workspaces();
    (reg as unknown as { map: Map<string, unknown> }).map.set('t5', { engine: e });
    expect(await reg.routeWebhook({ id: 'WH-RF', event_type: 'PAYMENT.REFUND.FAILED', create_time: '', resource: { id: refundId, status: 'FAILED' } })).toBe('processed');
    expect(alex.refundId).toBeUndefined();
    expect(view(e, alex.id).money).toBe('captured');
    const card = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'refund');
    expect(card?.prompt).toMatch(/refund .* failed/i);
    await e.resolveApproval(card!.id, 'refund');
    expect(alex.refundId).toBeTruthy();
    expect(alex.refundId).not.toBe(refundId); // a new request, not a replay of the failed one
  });
});

describe("end-of-day review in the studio's time zone", () => {
  it('a 3 pm visit in Los Angeles is not sent to review at 23:59 UTC (4 pm local)', async () => {
    const w = await new Workspaces({ timeZone: 'America/Los_Angeles' }).create('t6');
    const e = w.engine;
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(3, 23) }); // 15:00 PST
    await e.clock.advanceTo(at(3, 23, 15));
    expect(e.openApprovals().some((a) => a.bookingId === b.id && a.kind === 'attendance')).toBe(true);
    await e.clock.advanceTo(at(4, 0, 30)); // 16:30 in Los Angeles: the studio's day is not over
    expect(b.state).toBe('HELD');
    await e.clock.advanceTo(at(4, 8, 0)); // 00:00 in Los Angeles
    expect(b.state).toBe('NEEDS_REVIEW');
  });

  it('the UTC default is unchanged', async () => {
    const e = (await new Workspaces().create('t7')).engine;
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(3, 18) });
    await e.clock.advanceTo(at(3, 23, 58));
    expect(b.state).toBe('HELD');
    await e.clock.advanceTo(at(4, 0, 0));
    expect(b.state).toBe('NEEDS_REVIEW');
  });
});

describe('STUDIO_TIMEZONE', () => {
  it('is validated and passed to the workspaces', async () => {
    const { configFromEnv } = await import('../src/config.js');
    expect(configFromEnv({ STUDIO_TIMEZONE: 'America/Los_Angeles' }).deps.timeZone).toBe('America/Los_Angeles');
    expect(configFromEnv({}).deps.timeZone).toBeUndefined();
    expect(() => configFromEnv({ STUDIO_TIMEZONE: 'Mars/Olympus' })).toThrow(/IANA/);
  });
});
