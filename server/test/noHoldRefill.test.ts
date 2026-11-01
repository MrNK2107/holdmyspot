import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, validateRules } from '../src/domain/policy.js';
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
    expect(mock.authorizationStatus(auth.status === 'AUTHORIZED' ? auth.authorizationId : '')).toBe('VOIDED');
    expect(e.audit.forBooking(ben.id).some((x) => /void late authorization/.test(x.summary))).toBe(true);
  });

  it('a failed void of a late authorization is surfaced, never logged as released', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    const orderId = ben.orderId!;
    await e.receiveMessage('ben', "I can't make it today, something came up");
    mock.approve(orderId);
    const realVoid = mock.void.bind(mock);
    mock.void = async () => {
      throw new Error('INTERNAL_SERVER_ERROR');
    };
    const auth = await mock.authorizeApprovedOrder(orderId, 'out-of-band');
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    mock.void = realVoid;
    const id = auth.status === 'AUTHORIZED' ? auth.authorizationId : '';
    expect(e.unreleasedAuths).toEqual([expect.objectContaining({ bookingId: ben.id, authorizationId: id })]);
    expect(e.snapshot().unreleasedAuths).toHaveLength(1);
    expect(e.audit.forBooking(ben.id).some((x) => /^void late authorization/.test(x.summary))).toBe(false);
    expect(e.audit.forBooking(ben.id).some((x) => /VOID FAILED/.test(x.summary))).toBe(true);
  });

  it('shows no money at stake while a no-hold booking waits for a refill', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    await e.receiveMessage('ben', "I can't make it today, something came up");
    expect(ben.state).toBe('PENDING_REFILL');
    expect(money(ben.id)).toBe('none');
  });

  it('a booking whose T-72h hold failed (re-approval link pending) follows the same path', async () => {
    await e.clock.advanceTo(at(6, 9)); // Jordan: Fri 14:00, MIT hold declined at T-72h, link not used
    const jordan = bk('jordan');
    expect(jordan.state).toBe('HOLD_FAILED');
    const orderId = jordan.approvalLink!.split('/').at(-1)!;
    e.waitlist = [];
    await e.receiveMessage('jordan', "can't make it today, sorry");
    expect(jordan.state).toBe('EXCUSED');
    expect(jordan.captureId).toBeUndefined();
    expect(e.openApprovals().some((a) => a.bookingId === jordan.id)).toBe(false);
    expect(e.hasPendingApproval(orderId)).toBe(false);
  });

  it('a claim that times out on a no-hold slot passes the offer on, then waives at the cutoff', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    await e.receiveMessage('ben', "I can't make it today, something came up");
    await e.receiveMessage('dana', 'yes'); // Dana has no saved wallet: buyer approval needed within 10 min
    const nb = [...e.bookings.values()].find((x) => x.clientId === 'dana' && x.refillOfBookingId === ben.id)!;
    await e.clock.advanceTo(at(7, 1, 11));
    expect(nb.state).toBe('CANCELLED_EARLY');
    expect(ben.state).toBe('PENDING_REFILL');
    await e.clock.advanceTo(ben.start);
    expect(ben.state).toBe('EXCUSED');
    expect(e.openApprovals().some((a) => a.bookingId === ben.id)).toBe(false);
  });

  it('a refilled no-hold client is not told about a hold being released', async () => {
    await e.clock.advanceTo(at(7, 1));
    const ben = bk('ben');
    await e.receiveMessage('ben', "I can't make it today, something came up");
    await e.receiveMessage('dana', 'yes');
    const nb = [...e.bookings.values()].find((x) => x.clientId === 'dana' && x.refillOfBookingId === ben.id)!;
    const orderId = nb.approvalLink!.split('/').at(-1)!;
    mock.approve(orderId);
    await e.completeApproval(orderId);
    expect(ben.state).toBe('REFILLED');
    const last = e.messages.filter((m) => m.clientId === 'ben').at(-1)!.text;
    expect(last).toMatch(/nothing to pay/);
    expect(last).not.toMatch(/hold/);
  });

  it('the policy cannot set a fee window longer than the 72h hold lead', () => {
    expect(validateRules({ ...DEFAULT_RULES, freeCancelHours: 96 })).toEqual([expect.stringContaining('0..72')]);
    expect(validateRules({ ...DEFAULT_RULES, freeCancelHours: 72 })).toEqual([]);
  });

  it('an early cancel with no hold still just frees the slot', async () => {
    await e.clock.advanceTo(at(4, 9)); // > 24h before Ben's Saturday visit
    const ben = bk('ben');
    await e.receiveMessage('ben', 'need to cancel my saturday appointment');
    expect(ben.state).toBe('CANCELLED_EARLY');
    expect(e.offers.some((o) => o.slotBookingId === ben.id)).toBe(false);
  });
});
