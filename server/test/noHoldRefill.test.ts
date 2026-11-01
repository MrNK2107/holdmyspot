import { beforeEach, describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine/engine.js';
import type { MockPayPalGateway } from '../src/paypal/mock.js';
import { Workspaces } from '../src/workspaces.js';

// A late cancel on a booking that has no hold yet (wallet never approved, or the T-72h hold still
// to come) follows the same refill-then-settle path as a held booking; settling is an automatic waiver.
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);
let e: Engine;
let mock: MockPayPalGateway;
const bk = (c: string) => [...e.bookings.values()].find((x) => x.clientId === c && !x.refillOfBookingId)!;
const money = (id: string) => e.snapshot().bookings.find((b) => b.id === id)!.money;

beforeEach(async () => {
  const ws = await new Workspaces().create('nh');
  e = ws.engine;
  mock = ws.mock!;
});

describe('late cancel with no hold in place', () => {
  it('offers the slot to the waitlist and fills it when a claimer approves', async () => {
    await e.clock.advanceTo(at(7, 1)); // Ben: Sat 11:00 pedicure, never approved PayPal
    const ben = bk('ben');
    expect(ben.authorizationId).toBeUndefined();
    await e.receiveMessage('ben', "I can't make it today, something came up");
    expect(ben.state).toBe('PENDING_REFILL');
    const o = e.offers.find((x) => x.slotBookingId === ben.id)!;
    expect(o.offeredTo).toContain('dana');
    await e.receiveMessage('dana', 'yes');
    const nb = [...e.bookings.values()].find((x) => x.clientId === 'dana' && x.refillOfBookingId === ben.id)!;
    const orderId = nb.approvalLink!.split('/').at(-1)!;
    mock.approve(orderId);
    await e.completeApproval(orderId);
    expect(nb.state).toBe('HELD');
    expect(ben.state).toBe('REFILLED');
    expect(money(ben.id)).toBe('none');
    expect(e.openApprovals().filter((a) => a.bookingId === ben.id)).toHaveLength(0);
  });

  it('waives automatically at the cutoff when nobody claims: no capture card, nothing charged', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    await e.receiveMessage('ben', "I can't make it today, something came up");
    expect(ben.state).toBe('PENDING_REFILL');
    await e.clock.advanceTo(ben.start);
    expect(ben.state).toBe('EXCUSED');
    expect(ben.captureId).toBeUndefined();
    expect(money(ben.id)).toBe('none');
    expect(e.openApprovals().some((a) => a.bookingId === ben.id)).toBe(false);
    expect(e.excusals).toHaveLength(0); // a waiver, not a policy excusal
    expect(e.messages.at(-1)?.text).toMatch(/no fee/);
  });

  it('waives straight away when nobody on the waitlist matches', async () => {
    e.waitlist = [];
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    await e.receiveMessage('ben', "I can't make it today, something came up");
    expect(ben.state).toBe('EXCUSED');
    expect(e.openApprovals().some((a) => a.bookingId === ben.id)).toBe(false);
  });

  it('the cancelled client can no longer approve a hold for the slot they gave up', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    const orderId = ben.orderId ?? ben.approvalLink?.split('/').at(-1);
    expect(orderId).toBeTruthy(); // T-72h asked Ben to approve a buyer-present hold
    await e.receiveMessage('ben', "I can't make it today, something came up");
    expect(e.hasPendingApproval(orderId!)).toBe(false);
    expect(ben.approvalLink).toBeUndefined();
    mock.approve(orderId!);
    await expect(e.completeApproval(orderId!)).rejects.toThrow('no pending order');
    expect(ben.authorizationId).toBeUndefined();
  });

  it('an authorization webhook arriving after the cancel is voided, not attached', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    const orderId = ben.orderId!;
    await e.receiveMessage('ben', "I can't make it today, something came up");
    mock.approve(orderId);
    const auth = await mock.authorizeApprovedOrder(orderId, 'out-of-band');
    expect(auth.status).toBe('AUTHORIZED');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(ben.authorizationId).toBeUndefined();
    expect(e.audit.forBooking(ben.id).some((x) => /void late authorization/.test(x.summary))).toBe(true);
  });

  it('an early cancel with no hold still just frees the slot', async () => {
    await e.clock.advanceTo(at(4, 9)); // > 24h before Ben's Saturday visit
    const ben = bk('ben');
    await e.receiveMessage('ben', 'need to cancel my saturday appointment');
    expect(ben.state).toBe('CANCELLED_EARLY');
    expect(e.offers.some((o) => o.slotBookingId === ben.id)).toBe(false);
  });
});
