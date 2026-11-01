import { beforeEach, describe, expect, it } from 'vitest';
import { DAY } from '../src/clock.js';
import { MockPayPalGateway } from '../src/paypal/mock.js';
import type { WebhookEvent } from '../src/paypal/gateway.js';

let t = 0;
let gw: MockPayPalGateway;
let events: WebhookEvent[];

beforeEach(() => {
  t = Date.UTC(2026, 10, 2, 9);
  gw = new MockPayPalGateway(() => t, { declineVaultIds: new Set(['VAULT-DECLINE']) });
  events = [];
  gw.onWebhook((e) => void events.push(e));
});

async function mitHold(amountCents = 2000, requestId = 'r1') {
  const r = await gw.placeHold({ requestId, amountCents, customId: 'ws1:b1', description: 'hold', vaultId: 'VAULT-OK' });
  if (r.status !== 'AUTHORIZED') throw new Error('expected AUTHORIZED');
  return r;
}

describe('MockPayPalGateway', () => {
  it('merchant-initiated hold with a vaulted wallet authorizes and emits a webhook with custom_id', async () => {
    const r = await mitHold();
    expect(r.amountCents).toBe(2000);
    expect(r.honorPeriodEndsAt).toBe(t + 3 * DAY);
    expect(r.expiresAt).toBe(t + 29 * DAY);
    expect(events.map((e) => e.event_type)).toEqual(['PAYMENT.AUTHORIZATION.CREATED']);
    expect(events[0].resource).toMatchObject({ custom_id: 'ws1:b1', amount: { value: '20.00' } });
  });

  it('buyer-present hold needs approval, then authorizes and vaults the wallet', async () => {
    const r = await gw.placeHold({ requestId: 'r1', amountCents: 2000, customId: 'ws1:b1', description: 'hold' });
    expect(r.status).toBe('PAYER_ACTION_REQUIRED');
    if (r.status !== 'PAYER_ACTION_REQUIRED') return;
    await expect(gw.authorizeApprovedOrder(r.orderId, 'r2')).rejects.toThrow('ORDER_NOT_APPROVED');
    gw.approve(r.orderId);
    const a = await gw.authorizeApprovedOrder(r.orderId, 'r3');
    expect(a.status).toBe('AUTHORIZED');
    if (a.status === 'AUTHORIZED') expect(a.vaultId).toMatch(/^VAULT-/);
    expect(events.map((e) => e.event_type)).toEqual(['VAULT.PAYMENT-TOKEN.CREATED', 'PAYMENT.AUTHORIZATION.CREATED']);
  });

  it('declines via negative testing and for flagged vaulted wallets', async () => {
    const a = await gw.placeHold({ requestId: 'r1', amountCents: 2000, customId: 'x', description: '', vaultId: 'VAULT-OK', simulateDecline: true });
    const b = await gw.placeHold({ requestId: 'r2', amountCents: 2000, customId: 'x', description: '', vaultId: 'VAULT-DECLINE' });
    expect(a).toMatchObject({ status: 'DECLINED', issue: 'INSTRUMENT_DECLINED' });
    expect(b).toMatchObject({ status: 'DECLINED', issue: 'INSTRUMENT_DECLINED' });
    expect(events).toHaveLength(0);
  });

  it('is idempotent by PayPal-Request-Id', async () => {
    const a = await mitHold(2000, 'same');
    const b = await mitHold(2000, 'same');
    expect(b.authorizationId).toBe(a.authorizationId);
    expect(events).toHaveLength(1);
  });

  it('captures up to the authorized amount, never more', async () => {
    const a = await mitHold();
    await expect(gw.capture({ requestId: 'c0', authorizationId: a.authorizationId, amountCents: 2001, finalCapture: true })).rejects.toThrow(
      'AMOUNT_EXCEEDS_AUTHORIZED',
    );
    const c = await gw.capture({ requestId: 'c1', authorizationId: a.authorizationId, amountCents: 2000, finalCapture: true });
    expect(c.status).toBe('COMPLETED');
    expect(gw.authorizationStatus(a.authorizationId)).toBe('CAPTURED');
    await expect(gw.void(a.authorizationId, 'v1')).rejects.toThrow('CANNOT_VOID');
  });

  it('voids an open authorization', async () => {
    const a = await mitHold();
    expect(await gw.void(a.authorizationId, 'v1')).toEqual({ status: 'VOIDED' });
    expect(events.at(-1)?.event_type).toBe('PAYMENT.AUTHORIZATION.VOIDED');
    await expect(gw.capture({ requestId: 'c1', authorizationId: a.authorizationId, amountCents: 100, finalCapture: true })).rejects.toThrow();
  });

  it('reauthorizes only after the 3-day honor period, keeping the 29-day expiry', async () => {
    const a = await mitHold();
    await expect(gw.reauthorize(a.authorizationId, 2000, 'ra1')).rejects.toThrow('REAUTHORIZE_TOO_EARLY');
    t += 4 * DAY;
    const r = await gw.reauthorize(a.authorizationId, 2000, 'ra2');
    expect(r.status).toBe('AUTHORIZED');
    expect(r.authorizationId).not.toBe(a.authorizationId);
    expect(r.honorPeriodEndsAt).toBe(t + 3 * DAY);
    const d = await gw.reauthorize(a.authorizationId, 2000, 'ra3', true);
    expect(d).toMatchObject({ status: 'DECLINED', issue: 'INSTRUMENT_DECLINED' });
  });

  it('expires authorizations after 29 days', async () => {
    const a = await mitHold();
    t += 30 * DAY;
    await expect(gw.capture({ requestId: 'c', authorizationId: a.authorizationId, amountCents: 2000, finalCapture: true })).rejects.toThrow(
      'AUTHORIZATION_EXPIRED',
    );
  });

  it('refunds a capture, not beyond the captured amount', async () => {
    const a = await mitHold();
    const c = await gw.capture({ requestId: 'c1', authorizationId: a.authorizationId, amountCents: 2000, finalCapture: true });
    if (c.status !== 'COMPLETED') throw new Error();
    const r = await gw.refund(c.captureId, 2000, 'rf1');
    expect(r.amountCents).toBe(2000);
    await expect(gw.refund(c.captureId, 1, 'rf2')).rejects.toThrow('REFUND_AMOUNT_EXCEEDED');
    expect(events.at(-1)?.event_type).toBe('PAYMENT.CAPTURE.REFUNDED');
  });
});
