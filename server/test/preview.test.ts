import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { playNextBeat } from '../src/demo.js';
import { Workspaces } from '../src/workspaces.js';

// In simulator mode every gateway call is mirrored through the real REST adapter against a capturing
// fetch, so the console can show the exact PayPal request behind each simulated step.
describe('REST request preview (simulator mode)', () => {
  it('records the real Orders v2 / Payments v2 / Vault v3 requests for the whole guided demo, without tokens', async () => {
    const workspaces = new Workspaces();
    const w = await workspaces.create('pv');
    while ((await playNextBeat(w)).step < 13);
    const reqs = w.preview!.requests;
    const find = (method: string, path: RegExp) => reqs.filter((r) => r.method === method && path.test(r.url));

    const buyerPresent = find('POST', /\/v2\/checkout\/orders$/).find((r) => (r.body as any).payment_source.paypal.attributes);
    expect(buyerPresent?.url).toMatch(/^https:\/\/api-m\.sandbox\.paypal\.com/);
    expect((buyerPresent?.body as any).intent).toBe('AUTHORIZE');
    expect((buyerPresent?.body as any).payment_source.paypal.attributes.vault.store_in_vault).toBe('ON_SUCCESS');

    const mit = find('POST', /\/v2\/checkout\/orders$/).find((r) => (r.body as any).payment_source.paypal.vault_id);
    expect((mit?.body as any).payment_source.paypal.stored_credential.payment_initiator).toBe('MERCHANT');

    // Jordan's scripted decline uses PayPal's negative-testing header
    expect(reqs.some((r) => /INSTRUMENT_DECLINED/.test(r.headers['PayPal-Mock-Response'] ?? ''))).toBe(true);

    const capture = find('POST', /\/v2\/payments\/authorizations\/[^/]+\/capture$/)[0];
    expect(capture.body).toMatchObject({ amount: { currency_code: 'USD', value: '20.00' }, final_capture: true });
    expect(find('POST', /\/v2\/payments\/authorizations\/[^/]+\/void$/).length).toBeGreaterThan(0);
    expect(find('POST', /\/v2\/payments\/captures\/[^/]+\/refund$/)).toHaveLength(1);
    expect(find('POST', /\/v3\/vault\/setup-tokens$/).length).toBeGreaterThan(0);

    for (const r of reqs) {
      expect(r.headers.Authorization).toBeUndefined();
      expect(r.headers['PayPal-Request-Id']).toBeTruthy();
    }
    // the simulator still answered every call: the demo ended with the refund
    expect([...w.engine.bookings.values()].find((b) => b.clientId === 'alex')?.refundId).toBeTruthy();
  });

  it('is served newest first over HTTP', async () => {
    const workspaces = new Workspaces();
    await workspaces.create('demo');
    const app = await buildApp({ workspaces });
    try {
      const list = (await app.inject('/api/ws/demo/paypal-requests')).json();
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].seq).toBeGreaterThan(list.at(-1).seq);
      expect((await app.inject('/api/ws/nope/paypal-requests')).statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
