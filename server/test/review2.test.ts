import { beforeEach, describe, expect, it } from 'vitest';
import { approve } from '../src/domain/policy.js';
import type { Engine } from '../src/engine/engine.js';
import type { PaymentsGateway } from '../src/paypal/gateway.js';
import { MockPayPalGateway } from '../src/paypal/mock.js';
import { DEMO_START } from '../src/seed.js';
import { Workspaces } from '../src/workspaces.js';

// Regressions from the 2026-11-02 adversarial review of the money logic.
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);
let e: Engine;
let mock: MockPayPalGateway;
const bk = (c: string) => [...e.bookings.values()].find((x) => x.clientId === c && !x.refillOfBookingId)!;

beforeEach(async () => {
  const ws = await new Workspaces().create('t2');
  e = ws.engine;
  mock = ws.mock!;
});

describe('review 2026-11-02', () => {
  it('a stale card never moves money: "arrived" after a late cancel does not void the hold behind a pending fee card', async () => {
    e.waitlist = [];
    await e.clock.advanceTo(at(5, 11, 10));
    const alex = bk('alex');
    const attendance = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!;
    expect(attendance).toBeTruthy();
    await e.clock.advanceTo(at(5, 11, 15));
    await e.receiveMessage('alex', "so sorry, I forgot and can't make it");
    expect(alex.state).toBe('PENDING_REFILL');
    const capture = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture');
    expect(capture).toBeTruthy();
    const auth = alex.authorizationId!;

    await expect(e.resolveApproval(attendance.id, 'arrived')).rejects.toThrow(/out of date/);
    expect(e.openApprovals().some((a) => a.id === attendance.id)).toBe(false); // closed, cannot be tapped again
    expect(mock.authorizationStatus(auth)).toBe('CREATED'); // the hold was not released behind the fee card
    expect(alex.state).toBe('PENDING_REFILL');
    await e.resolveApproval(capture!.id, 'charge');
    expect(alex.state).toBe('CHARGED');
  });

  it('fees come from the policy version the client booked under, not a later one', async () => {
    const v2 = approve(e.policy, { ...e.policy.rules, noShowFeeCents: 1000, lateCancelFeeCents: 1000 }, 'v2', e.now());
    e.setPolicy(v2);
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(3, 18) });
    expect(b.state).toBe('HELD');
    expect(b.policyVersion).toBe(v2.version);
    e.setPolicy(approve(e.policy, { ...e.policy.rules, noShowFeeCents: 2000, lateCancelFeeCents: 2000 }, 'v3', e.now()));

    await e.clock.advanceTo(at(3, 18, 10));
    const att = e.openApprovals().find((a) => a.bookingId === b.id && a.kind === 'attendance')!;
    await e.resolveApproval(att.id, 'no_show');
    const card = e.openApprovals().find((a) => a.bookingId === b.id && a.kind === 'capture');
    expect(card && card.kind === 'capture' && card.feeCents).toBe(1000);
    await e.resolveApproval(card!.id, 'charge');
    expect(b.capturedCents).toBe(1000);
  });

  it('a replacement hold releases the one it replaces (declined reauthorization, then re-approval)', async () => {
    e.holdStrategy = 'reauth';
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(10, 10) });
    const first = b.authorizationId!;
    expect(b.state).toBe('HELD');
    e.clients.get('chris')!.sandboxDecline = true; // the reauthorization at T-72h is declined
    await e.clock.advanceTo(at(7, 10, 1));
    expect(b.state).toBe('HOLD_FAILED');
    expect(mock.authorizationStatus(first)).toBe('CREATED'); // the original is still holding the client's funds
    const orderId = b.orderId!;
    mock.approve(orderId);
    await e.completeApproval(orderId);
    expect(b.state).toBe('HELD');
    expect(b.authorizationId).not.toBe(first);
    expect(mock.authorizationStatus(first)).toBe('VOIDED'); // no second, orphaned hold on the client's money
  });

  it('a reauthorization at T-72h does not void its own parent twice or drop the new hold', async () => {
    e.holdStrategy = 'reauth';
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(10, 10) });
    const first = b.authorizationId!;
    await e.clock.advanceTo(at(7, 10, 1));
    expect(b.state).toBe('HELD');
    expect(b.authorizationId).not.toBe(first);
    expect(mock.authorizationStatus(b.authorizationId!)).toBe('CREATED');
    expect(e.unreleasedAuths).toEqual([]);
  });

  it('a reset sandbox workspace never reuses the PayPal-Request-Ids of its previous life', async () => {
    const sim = new MockPayPalGateway(() => DEMO_START);
    const seen: string[] = [];
    const customIds: string[] = [];
    // a shared real-mode gateway (as with PayPal sandbox keys); the simulator stands in for PayPal's idempotency
    const sandbox: PaymentsGateway = {
      mode: 'sandbox',
      placeHold: (r) => (seen.push(r.requestId), customIds.push(r.customId), sim.placeHold(r)),
      authorizeApprovedOrder: (o, r) => (seen.push(r), sim.authorizeApprovedOrder(o, r)),
      capture: (r) => (seen.push(r.requestId), sim.capture(r)),
      void: (a, r) => (seen.push(r), sim.void(a, r)),
      reauthorize: (a, c, r, d) => (seen.push(r), sim.reauthorize(a, c, r, d)),
      refund: (c, a, r) => (seen.push(r), sim.refund(c, a, r)),
      createVaultSetup: (r) => (seen.push(r.requestId), sim.createVaultSetup(r)),
      completeVaultSetup: (s, r) => (seen.push(r), sim.completeVaultSetup(s, r)),
    };
    const wss = new Workspaces({ gateway: sandbox, agentToolkit: false });
    const one = await wss.create('demo');
    const firstAuth = [...one.engine.bookings.values()].find((x) => x.clientId === 'riley')!.authorizationId;
    const firstIds = new Set(seen.splice(0));
    const two = await wss.reset('demo');
    const secondAuth = [...two.engine.bookings.values()].find((x) => x.clientId === 'riley')!.authorizationId;
    expect(seen.filter((id) => firstIds.has(id))).toEqual([]);
    expect(secondAuth).not.toBe(firstAuth);
    // a late webhook from the previous life (same workspace id, same booking id) is not applied to the new booking
    const riley2 = [...two.engine.bookings.values()].find((x) => x.clientId === 'riley')!;
    const oldCustom = customIds[0];
    expect(await two.engine.ingestWebhook({ id: 'WH-STALE', event_type: 'PAYMENT.AUTHORIZATION.CREATED', create_time: '', resource: { id: firstAuth!, custom_id: oldCustom } })).toBe('ignored');
    expect(riley2.authorizationId).toBe(secondAuth);
  });
  it('a refilled slot is never charged, even when releasing its hold fails at PayPal', async () => {
    await e.clock.advanceTo(at(5, 9));
    const maya = bk('maya');
    await e.receiveMessage('maya', "I can't make it today, something came up");
    expect(maya.state).toBe('PENDING_REFILL');
    const gw = e.gateway as { void: (a: string, r: string) => Promise<{ status: 'VOIDED' }> };
    const realVoid = gw.void;
    gw.void = async (a, r) => {
      if (a === maya.authorizationId) throw new Error('HTTP 503 temporarily unavailable');
      return realVoid(a, r);
    };
    await e.receiveMessage('chris', 'yes!').catch(() => undefined);
    gw.void = realVoid;
    const claim = [...e.bookings.values()].find((x) => x.refillOfBookingId === maya.id && x.clientId === 'chris')!;
    expect(claim.state).toBe('HELD');
    await e.clock.advanceTo(at(5, 18));
    expect(e.openApprovals().filter((a) => a.bookingId === maya.id && a.kind === 'capture')).toEqual([]);
    expect(maya.state).toBe('REFILLED');
    expect(e.unreleasedAuths.map((u) => u.authorizationId)).toContain(maya.authorizationId);
  });
  it('an authorization that turns up after the fee was captured is released, not adopted', async () => {
    e.waitlist = [];
    await e.clock.advanceTo(at(5, 11, 10));
    const alex = bk('alex');
    const att = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!;
    await e.resolveApproval(att.id, 'no_show');
    const card = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!;
    await e.resolveApproval(card.id, 'charge');
    expect(alex.state).toBe('CHARGED');
    const captured = alex.authorizationId;
    // a stray authorization for the same booking (e.g. a duplicate approval) reaches the engine by webhook
    const stray = await mock.placeHold({ requestId: 'stray', amountCents: 2000, customId: `t2:${alex.id}`, description: 'stray', vaultId: e.clients.get('alex')!.vaultId });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(stray.status).toBe('AUTHORIZED');
    expect(alex.authorizationId).toBe(captured);
    expect(mock.authorizationStatus(stray.status === 'AUTHORIZED' ? stray.authorizationId : '')).toBe('VOIDED');
  });
  it('a free-window cancellation is final even when PayPal fails to release the hold (never left chargeable)', async () => {
    await e.clock.advanceTo(at(4, 15));
    const art = [...e.bookings.values()].find((x) => x.clientId === 'riley' && x.serviceId === 'art')!;
    expect(art.state).toBe('HELD');
    const gw = e.gateway as { void: (a: string, r: string) => Promise<{ status: 'VOIDED' }> };
    const realVoid = gw.void;
    gw.void = async (a, r) => {
      if (a === art.authorizationId) throw new Error('HTTP 503 temporarily unavailable');
      return realVoid(a, r);
    };
    await e.receiveMessage('riley', 'Hi, I need to cancel my appointment please').catch(() => undefined);
    gw.void = realVoid;
    expect(art.state).toBe('CANCELLED_EARLY');
    expect(e.unreleasedAuths.map((u) => u.authorizationId)).toContain(art.authorizationId);
    await e.clock.advanceTo(at(7, 16));
    expect(e.approvals.filter((a) => a.bookingId === art.id)).toEqual([]);
  });
  it("a text that merely starts with a y (\"y'all\") is not a YES to a refill offer, so no hold is placed", async () => {
    await e.clock.advanceTo(at(5, 9));
    const maya = bk('maya');
    await e.receiveMessage('maya', "I can't make it today, something came up");
    expect(e.offers.at(-1)!.offeredTo).toContain('chris');
    const r = await e.receiveMessage('chris', "y'all are the best, but I'm away this week");
    expect(r.claimed).toBeUndefined();
    expect([...e.bookings.values()].filter((x) => x.refillOfBookingId === maya.id && x.clientId === 'chris')).toEqual([]);
    expect((await e.receiveMessage('chris', 'Yes!')).claimed).toBe(true);
  });
});

describe('review 2026-11-02: what the owner reads before a money tap', () => {
  it('a review card quotes the client, never words the model put in their mouth', async () => {
    const { FakeLlmProvider } = await import('../src/ai/fake.js');
    let samId = '';
    class Fabricating extends FakeLlmProvider {
      async run(task: any, input: any): Promise<any> {
        if (task !== 'agent_step') return super.run(task, input);
        if (input.history.length) return { tool: 'finish', argsJson: '{}', why: 'done' };
        const args = { bookingId: samId, intent: 'cancel', reason: 'medical_emergency', confidence: 0.95, evidenceSpan: 'my daughter was rushed to the ER' };
        return { tool: 'propose_settlement', argsJson: JSON.stringify(args), why: 'injected' };
      }
    }
    const w = await new Workspaces({ llm: () => new Fabricating() }).create('t3');
    samId = [...w.engine.bookings.values()].find((x) => x.clientId === 'sam')!.id;
    await w.engine.clock.advanceTo(at(4, 9));
    await w.engine.receiveMessage('sam', "can't come today lol");
    const card = w.engine.openApprovals().find((a) => a.bookingId === samId && a.kind === 'review')!;
    expect(card).toBeTruthy();
    expect(card.prompt).toContain("can't come today lol");
    expect(w.engine.bookings.get(samId)!.lastLabel!.evidenceSpan).not.toBe('my daughter was rushed to the ER');
  });
});
