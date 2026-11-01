import { beforeEach, describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine/engine.js';
import type { MockPayPalGateway } from '../src/paypal/mock.js';
import { Workspaces } from '../src/workspaces.js';

// Regressions for bugs found in the 2026-11-01 review of the money engine.
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);
let e: Engine;
let mock: MockPayPalGateway;
const bk = (c: string) => [...e.bookings.values()].find((x) => x.clientId === c && !x.refillOfBookingId)!;

beforeEach(async () => {
  const ws = await new Workspaces().create('t1');
  e = ws.engine;
  mock = ws.mock!;
});

describe('review regressions', () => {
  it('late cancel on a booking with no hold cancels cleanly instead of crashing', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    expect(ben.authorizationId).toBeUndefined();
    await e.receiveMessage('ben', "I can't make it today, something came up");
    expect(ben.state).toBe('PENDING_REFILL'); // late cancel: offered to the waitlist, fee waived if unfilled (see noHoldRefill.test.ts)
    expect(ben.approvalLink).toBeUndefined();
  });

  it('refund returns the captured amount, not the hold', async () => {
    e.policy = { ...e.policy, rules: { ...e.policy.rules, lateCancelFeeCents: 1500 } };
    e.waitlist = [];
    await e.clock.advanceTo(at(5, 9));
    const maya = bk('maya');
    await e.receiveMessage('maya', "can't make it, sorry");
    const card = e.openApprovals().find((a) => a.bookingId === maya.id && a.kind === 'capture')!;
    await e.resolveApproval(card.id, 'charge');
    expect(maya.capturedCents).toBe(1500);
    await e.refund(maya.id);
    expect(maya.refundId).toBeTruthy();
  });

  it('a claimer whose hold failed is never offered the spot again', async () => {
    e.clients.get('chris')!.sandboxDecline = true;
    e.addClient({ id: 'zoe', name: 'Zoe Q', vaultId: 'VAULT-ZOE' });
    await e.addWaitlist('zoe', 'gel manicure, any time');
    await e.clock.advanceTo(at(5, 9));
    await e.receiveMessage('maya', "I can't make it today, something came up");
    const o = e.offers[0];
    await e.receiveMessage('eli', 'yes');
    await e.receiveMessage('chris', 'yes');
    expect(o.failed).toEqual(['eli', 'chris']);
    expect(o.offeredTo).not.toContain('eli');
    expect(o.offeredTo).not.toContain('chris');
  });

  it('an approval that arrives after the claim timed out cannot place a hold', async () => {
    e.waitlist = e.waitlist.filter((w) => w.clientId === 'dana');
    await e.clock.advanceTo(at(5, 9));
    await e.receiveMessage('maya', "I can't make it today, something came up");
    await e.receiveMessage('dana', 'yes');
    const nb = [...e.bookings.values()].find((x) => x.clientId === 'dana' && x.refillOfBookingId)!;
    const orderId = nb.approvalLink!.split('/').at(-1)!;
    await e.clock.advanceTo(at(5, 9, 11));
    expect(nb.state).toBe('CANCELLED_EARLY');
    mock.approve(orderId);
    await expect(e.completeApproval(orderId)).rejects.toThrow('no pending order');
    expect(nb.authorizationId).toBeUndefined();
  });

  it('a failed owner action keeps the approval card open', async () => {
    await e.clock.advanceTo(at(5, 9));
    e.waitlist = [];
    const maya = bk('maya');
    await e.receiveMessage('maya', "can't make it, sorry");
    const card = e.openApprovals().find((a) => a.bookingId === maya.id && a.kind === 'capture')!;
    await mock.void(maya.authorizationId!, 'external-void'); // the hold vanished outside the engine
    await expect(e.resolveApproval(card.id, 'charge')).rejects.toThrow();
    expect(e.openApprovals().some((a) => a.id === card.id)).toBe(true);
    await e.resolveApproval(card.id, 'waive');
    expect(maya.state).toBe('EXCUSED');
  });

  it('owner waiver does not use up the client excusal allowance', async () => {
    e.mode = 'autopilot';
    e.waitlist = [];
    await e.clock.advanceTo(at(4, 9));
    const riley = [...e.bookings.values()].find((x) => x.clientId === 'riley' && x.start === at(4, 11))!;
    await e.receiveMessage('riley', 'cancel pls, stuck at work');
    const card = e.openApprovals().find((a) => a.bookingId === riley.id && a.kind === 'capture')!;
    await e.resolveApproval(card.id, 'waive');
    expect(e.excusals).toHaveLength(0);
  });

  it('a stale webhook for a superseded authorization does not roll the hold back', async () => {
    const sam = bk('sam');
    const original = sam.authorizationId!;
    const ev = mock.delivered.find((d) => d.resource.id === original)!;
    await e.clock.advanceTo(sam.start + 10 * 60_000);
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === sam.id)!.id, 'no_show');
    const cap = e.openApprovals().find((a) => a.bookingId === sam.id && a.kind === 'capture')!;
    await e.clock.advanceTo(at(5, 10)); // past the honor period → capture reauthorizes first
    await e.resolveApproval(cap.id, 'charge');
    expect(sam.authorizationId).not.toBe(original);
    const current = sam.authorizationId;
    await e.ingestWebhook({ ...ev, id: 'WH-replayed-with-new-id' });
    expect(sam.authorizationId).toBe(current);
  });
  it('a claim still waiting for approval at the slot cutoff is closed, not left hanging', async () => {
    e.waitlist = e.waitlist.filter((w) => w.clientId === 'dana');
    await e.clock.advanceTo(at(5, 16, 55));
    const maya = bk('maya');
    await e.receiveMessage('maya', 'cancel, sorry');
    await e.receiveMessage('dana', 'yes');
    const nb = [...e.bookings.values()].find((x) => x.clientId === 'dana' && x.refillOfBookingId)!;
    await e.clock.advanceTo(at(5, 17));
    expect(nb.state).toBe('CANCELLED_EARLY');
    expect(e.offers[0].status).toBe('closed');
    expect(e.openApprovals().some((a) => a.bookingId === maya.id && a.kind === 'capture')).toBe(true);
  });

  it('refill claims place the hold immediately even when the slot is more than 72h out', async () => {
    e.policy = { ...e.policy, rules: { ...e.policy.rules, freeCancelHours: 120 } };
    const jordan = bk('jordan'); // Fri 14:00, 101h away at the seed time
    e.clients.get('jordan')!.sandboxDecline = false;
    await e.placeHold(jordan); // as under the authorize-at-booking fallback
    expect(jordan.state).toBe('HELD');
    e.addClient({ id: 'zed', name: 'Zed Z', vaultId: 'VAULT-ZED' });
    await e.addWaitlist('zed', 'nail art, any time');
    await e.receiveMessage('jordan', "can't make it, something came up");
    expect(jordan.state).toBe('PENDING_REFILL');
    await e.receiveMessage('zed', 'yes');
    expect(jordan.state).toBe('REFILLED');
  });
});
