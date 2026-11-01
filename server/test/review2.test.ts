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
});
