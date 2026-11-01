import { beforeEach, describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine/engine.js';
import type { MockPayPalGateway } from '../src/paypal/mock.js';
import { Workspaces } from '../src/workspaces.js';

// A client books more than 72 hours out, saves their PayPal wallet (Vault, no hold yet), then cancels
// before the T-72h merchant-initiated hold. No hold may be placed afterwards and nothing can be charged.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let e: Engine;
let mock: MockPayPalGateway;

beforeEach(async () => {
  const ws = await new Workspaces().create('vc');
  e = ws.engine;
  mock = ws.mock!;
});

async function bookAndSaveWallet() {
  const start = e.freeSlots('gel', 40).find((t) => t - e.now() > 5 * DAY)!;
  expect(start).toBeDefined();
  const c = e.newClient('Riley Park');
  const b = await e.createBooking({ clientId: c.id, serviceId: 'gel', start });
  expect(b.state).toBe('BOOKED');
  const token = b.approvalLink!.split('/').at(-1)!;
  expect(token).toMatch(/^[A-Z0-9]{17}$/);
  mock.approve(token);
  await e.completeApproval(token);
  expect(b.state).toBe('VAULTED');
  expect(b.authorizationId).toBeUndefined();
  return { b, c };
}

describe('wallet saved, then cancelled before the 72h hold', () => {
  it('frees the slot with no fee and never places the T-72h hold', async () => {
    const { b, c } = await bookAndSaveWallet();
    const holdsFor = () => mock.calls.filter((x) => x.op === 'placeHold' && x.requestId.includes(b.id)).length;
    expect(holdsFor()).toBe(0);

    await e.receiveMessage(c.id, "Hi, I can't make it to my appointment anymore, sorry");
    expect(b.state).toBe('CANCELLED_EARLY');
    expect(e.openApprovals().some((a) => a.bookingId === b.id)).toBe(false);
    expect(e.freeSlots('gel', 60)).toContain(b.start); // the slot is bookable again

    // run the clock past T-72h and past the visit itself
    await e.clock.advanceTo(b.start - 72 * HOUR + 1);
    await e.clock.advanceTo(b.end + HOUR);

    expect(holdsFor()).toBe(0);
    expect(b.authorizationId).toBeUndefined();
    expect(b.captureId).toBeUndefined();
    expect(b.state).toBe('CANCELLED_EARLY');
    expect(e.snapshot().bookings.find((x) => x.id === b.id)!.money).toBe('none');
    expect(e.openApprovals().some((a) => a.bookingId === b.id)).toBe(false);
  });

  it('keeps the saved wallet for the next booking (cancel does not revoke the vault token)', async () => {
    const { c } = await bookAndSaveWallet();
    const vaultId = e.clients.get(c.id)!.vaultId;
    expect(vaultId).toBeTruthy();
    await e.receiveMessage(c.id, "I can't make it, sorry");
    expect(e.clients.get(c.id)!.vaultId).toBe(vaultId);
  });

  it('a wallet approval that arrives after the cancel does not revive the booking', async () => {
    const start = e.freeSlots('gel', 40).find((t) => t - e.now() > 5 * DAY)!;
    const c = e.newClient('Quinn Lee');
    const b = await e.createBooking({ clientId: c.id, serviceId: 'gel', start });
    const token = b.approvalLink!.split('/').at(-1)!;
    await e.receiveMessage(c.id, "I can't make it, need to cancel");
    expect(b.state).toBe('CANCELLED_EARLY');
    mock.approve(token);
    await e.completeApproval(token).catch(() => undefined);
    expect(b.state).toBe('CANCELLED_EARLY');
    await e.clock.advanceTo(b.start - 72 * HOUR + 1);
    expect(b.authorizationId).toBeUndefined();
  });
});
