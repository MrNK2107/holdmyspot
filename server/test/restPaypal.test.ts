import { describe, expect, it } from 'vitest';
import { PayPalRestGateway, type FetchLike } from '../src/paypal/rest.js';

/**
 * Recorded-HTTP tests. Response bodies are trimmed from the shapes in PayPal's Orders v2 /
 * Payments v2 reference; no network is touched.
 */
type Rec = { method: string; path: string; status: number; body: unknown; check?: (req: Seen) => void };
type Seen = { url: string; method: string; headers: Record<string, string>; body: any };

function recorder(script: Rec[]) {
  const seen: Seen[] = [];
  const fetch: FetchLike = async (url, init) => {
    const req: Seen = { url, method: init.method, headers: init.headers, body: init.body?.startsWith('{') ? JSON.parse(init.body) : init.body };
    seen.push(req);
    const next = script.shift();
    if (!next) throw new Error(`unexpected request ${init.method} ${url}`);
    expect(`${init.method} ${new URL(url).pathname}`).toBe(`${next.method} ${next.path}`);
    next.check?.(req);
    return { status: next.status, json: async () => next.body, text: async () => (next.body === null ? '' : JSON.stringify(next.body)) };
  };
  return { fetch, seen, script };
}

const TOKEN: Rec = { method: 'POST', path: '/v1/oauth2/token', status: 200, body: { access_token: 'A21.token', expires_in: 32400 } };

const AUTHORIZED_ORDER = {
  id: '5O190127TN364715T',
  status: 'COMPLETED',
  payment_source: { paypal: { attributes: { vault: { id: '8kk8451t', status: 'VAULTED' } } } },
  purchase_units: [
    {
      payments: {
        authorizations: [
          {
            id: '0AW2184448108334S',
            status: 'CREATED',
            amount: { currency_code: 'USD', value: '20.00' },
            create_time: '2026-11-02T09:00:00Z',
            expiration_time: '2026-12-01T09:00:00Z',
          },
        ],
      },
    },
  ],
};

function gw(script: Rec[]) {
  const r = recorder(script);
  const g = new PayPalRestGateway({
    clientId: 'id',
    clientSecret: 'secret',
    returnUrl: 'http://localhost/return',
    cancelUrl: 'http://localhost/cancel',
    fetch: r.fetch,
    now: () => Date.parse('2026-11-02T09:00:00Z'),
  });
  return { g, ...r };
}

describe('PayPalRestGateway (recorded HTTP)', () => {
  it('Vault v3: setup token with approve link, then payment token', async () => {
    const { g } = gw([
      TOKEN,
      {
        method: 'POST',
        path: '/v3/vault/setup-tokens',
        status: 201,
        body: { id: '5C991763VB2781612', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/agreements/approve?approval_session_id=5C9' }] },
        check: (r) => expect(r.body.payment_source.paypal).toMatchObject({ usage_type: 'MERCHANT', customer_type: 'CONSUMER' }),
      },
      {
        method: 'POST',
        path: '/v3/vault/payment-tokens',
        status: 201,
        body: { id: 'jwgvx42', customer: { id: 'C1' } },
        check: (r) => expect(r.body).toEqual({ payment_source: { token: { id: '5C991763VB2781612', type: 'SETUP_TOKEN' } } }),
      },
    ]);
    expect(await g.createVaultSetup({ requestId: 'v1', customId: 'ws:b', description: 'd' })).toEqual({
      setupTokenId: '5C991763VB2781612',
      approvalUrl: 'https://sandbox.paypal.com/agreements/approve?approval_session_id=5C9',
    });
    expect(await g.completeVaultSetup('5C991763VB2781612', 'v2')).toEqual({ vaultId: 'jwgvx42' });
  });

  it('verifies webhook signatures via PayPal', async () => {
    const { g } = gw([
      TOKEN,
      {
        method: 'POST',
        path: '/v1/notifications/verify-webhook-signature',
        status: 200,
        body: { verification_status: 'SUCCESS' },
        check: (r) => expect(r.body).toMatchObject({ transmission_id: 't1', webhook_id: 'WHID', auth_algo: 'SHA256withRSA' }),
      },
    ]);
    const ok = await g.verifyWebhook(
      { 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'u', 'paypal-transmission-id': 't1', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 'x' },
      { id: 'e' },
      'WHID',
    );
    expect(ok).toBe(true);
  });

  it('webhook verification embeds the raw event bytes PayPal signed (no re-serialising)', async () => {
    const raw = '{ "id": "WH-1", "resource": { "amount": { "value": 20.0 } } }';
    let sent = '';
    const { g } = gw([
      TOKEN,
      { method: 'POST', path: '/v1/notifications/verify-webhook-signature', status: 200, body: { verification_status: 'SUCCESS' } },
    ]);
    const orig = (g as unknown as { fetch: FetchLike }).fetch;
    (g as unknown as { fetch: FetchLike }).fetch = async (url, init) => {
      if (url.endsWith('verify-webhook-signature')) sent = init.body ?? '';
      return orig(url, init);
    };
    expect(await g.verifyWebhook({ 'paypal-transmission-id': 't1' }, JSON.parse(raw), 'WHID', raw)).toBe(true);
    expect(sent.endsWith(`"webhook_event":${raw}}`)).toBe(true); // 20.0 kept, spacing kept
    expect(JSON.parse(sent)).toMatchObject({ transmission_id: 't1', webhook_id: 'WHID', webhook_event: { id: 'WH-1' } });
  });

  it('gets an OAuth token once and reuses it', async () => {
    const { g, seen } = gw([
      { ...TOKEN, check: (r) => expect(r.headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`) },
      { method: 'POST', path: '/v2/payments/authorizations/A1/void', status: 204, body: null },
      { method: 'POST', path: '/v2/payments/authorizations/A2/void', status: 204, body: null },
    ]);
    await g.void('A1', 'v1');
    await g.void('A2', 'v2');
    expect(seen.filter((s) => s.url.endsWith('/oauth2/token'))).toHaveLength(1);
    expect(seen[1].headers['PayPal-Request-Id']).toBe('v1');
    expect(seen[1].headers.Authorization).toBe('Bearer A21.token');
  });

  it('merchant-initiated hold: AUTHORIZE order with vault_id and stored_credential', async () => {
    const { g } = gw([
      TOKEN,
      {
        method: 'POST',
        path: '/v2/checkout/orders',
        status: 201,
        body: AUTHORIZED_ORDER,
        check: (r) => {
          expect(r.body.intent).toBe('AUTHORIZE');
          expect(r.body.purchase_units[0]).toMatchObject({ custom_id: 'ws1:b1', amount: { currency_code: 'USD', value: '20.00' } });
          expect(r.body.payment_source.paypal).toEqual({
            vault_id: '8kk8451t',
            stored_credential: { payment_initiator: 'MERCHANT', usage: 'SUBSEQUENT', usage_pattern: 'UNSCHEDULED_POSTPAID' },
          });
          expect(r.headers['PayPal-Request-Id']).toBe('hold-b1-1');
          expect(r.headers['PayPal-Mock-Response']).toBeUndefined();
        },
      },
    ]);
    const res = await g.placeHold({ requestId: 'hold-b1-1', amountCents: 2000, customId: 'ws1:b1', description: 'No-show hold', vaultId: '8kk8451t' });
    expect(res).toMatchObject({ status: 'AUTHORIZED', authorizationId: '0AW2184448108334S', amountCents: 2000, vaultId: '8kk8451t' });
    if (res.status === 'AUTHORIZED') expect(res.honorPeriodEndsAt - Date.parse('2026-11-02T09:00:00Z')).toBe(3 * 86_400_000);
  });

  it('vaulted order that comes back un-authorized is authorized in a second call', async () => {
    const { g } = gw([
      TOKEN,
      { method: 'POST', path: '/v2/checkout/orders', status: 201, body: { id: 'O9', status: 'APPROVED' } },
      { method: 'POST', path: '/v2/checkout/orders/O9/authorize', status: 201, body: { ...AUTHORIZED_ORDER, id: 'O9' } },
    ]);
    const res = await g.placeHold({ requestId: 'h', amountCents: 2000, customId: 'c', description: 'd', vaultId: 'V' });
    expect(res).toMatchObject({ status: 'AUTHORIZED', orderId: 'O9' });
  });

  it('buyer-present hold asks for approval with store_in_vault ON_SUCCESS', async () => {
    const { g } = gw([
      TOKEN,
      {
        method: 'POST',
        path: '/v2/checkout/orders',
        status: 200,
        body: { id: 'O1', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=O1' }] },
        check: (r) => expect(r.body.payment_source.paypal.attributes.vault.store_in_vault).toBe('ON_SUCCESS'),
      },
    ]);
    const res = await g.placeHold({ requestId: 'h', amountCents: 2000, customId: 'c', description: 'd' });
    expect(res).toEqual({ status: 'PAYER_ACTION_REQUIRED', orderId: 'O1', approvalUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=O1' });
  });

  it('negative testing: sends PayPal-Mock-Response and maps 422 INSTRUMENT_DECLINED', async () => {
    const { g } = gw([
      TOKEN,
      {
        method: 'POST',
        path: '/v2/checkout/orders',
        status: 422,
        body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'INSTRUMENT_DECLINED' }] },
        check: (r) => expect(JSON.parse(r.headers['PayPal-Mock-Response'])).toEqual({ mock_application_codes: 'INSTRUMENT_DECLINED' }),
      },
    ]);
    const res = await g.placeHold({ requestId: 'h', amountCents: 2000, customId: 'c', description: 'd', vaultId: 'V', simulateDecline: true });
    expect(res).toEqual({ status: 'DECLINED', issue: 'INSTRUMENT_DECLINED' });
  });

  it('captures with final_capture and maps the capture id', async () => {
    const { g } = gw([
      TOKEN,
      {
        method: 'POST',
        path: '/v2/payments/authorizations/A1/capture',
        status: 201,
        body: { id: '2GG279541U471931P', status: 'COMPLETED', amount: { currency_code: 'USD', value: '20.00' } },
        check: (r) => expect(r.body).toMatchObject({ amount: { value: '20.00' }, final_capture: true }),
      },
    ]);
    expect(await g.capture({ requestId: 'c', authorizationId: 'A1', amountCents: 2000, finalCapture: true })).toEqual({
      status: 'COMPLETED',
      captureId: '2GG279541U471931P',
      amountCents: 2000,
    });
  });

  it('reauthorize returns the new authorization; refund maps id; errors carry the PayPal issue', async () => {
    const { g } = gw([
      TOKEN,
      { method: 'POST', path: '/v2/payments/authorizations/A1/reauthorize', status: 201, body: { id: 'A1b', status: 'CREATED', create_time: '2026-11-06T09:00:00Z' } },
      { method: 'POST', path: '/v2/payments/captures/C1/refund', status: 201, body: { id: 'R1', status: 'COMPLETED', amount: { value: '20.00' } } },
      { method: 'POST', path: '/v2/payments/authorizations/A9/void', status: 422, body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'PREVIOUSLY_VOIDED' }] } },
    ]);
    expect(await g.reauthorize('A1', 2000, 'ra')).toMatchObject({ status: 'AUTHORIZED', authorizationId: 'A1b' });
    expect(await g.refund('C1', 2000, 'rf')).toEqual({ status: 'COMPLETED', refundId: 'R1', amountCents: 2000 });
    await expect(g.void('A9', 'v')).rejects.toThrow('PREVIOUSLY_VOIDED');
  });
});

describe('PayPalRestGateway: capture outcomes (review 2026-11-02)', () => {
  it('a capture PayPal reports as FAILED is not booked as a completed charge', async () => {
    const { g } = gw([
      TOKEN,
      { method: 'POST', path: '/v2/payments/authorizations/A1/capture', status: 201, body: { id: '2GG279541U471931P', status: 'FAILED', amount: { currency_code: 'USD', value: '20.00' } } },
    ]);
    expect(await g.capture({ requestId: 'c', authorizationId: 'A1', amountCents: 2000, finalCapture: true })).toMatchObject({ status: 'DECLINED' });
  });
});
