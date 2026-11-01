import { DAY } from '../clock.js';
import {
  type CaptureRequest,
  type CaptureResult,
  type HoldRequest,
  type HoldResult,
  type PaymentsGateway,
  type ReauthorizeResult,
  type RefundResult,
  PaymentsError,
  centsToValue,
  valueToCents,
} from './gateway.js';

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}>;

export interface PayPalRestConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string; // default sandbox
  returnUrl: string;
  cancelUrl: string;
  fetch?: FetchLike;
  now?: () => number;
}

export const SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const DECLINE_HEADER = JSON.stringify({ mock_application_codes: 'INSTRUMENT_DECLINED' });

/**
 * Real PayPal adapter: Orders v2 (intent=AUTHORIZE) + Payments v2 against the sandbox.
 * Only exercised in tests through recorded HTTP; a live smoke script runs once keys exist.
 */
export class PayPalRestGateway implements PaymentsGateway {
  readonly mode = 'sandbox' as const;
  private token?: { value: string; expiresAt: number };
  private readonly base: string;
  private readonly fetch: FetchLike;
  private readonly now: () => number;

  constructor(private cfg: PayPalRestConfig) {
    this.base = cfg.baseUrl ?? SANDBOX_BASE;
    this.fetch = cfg.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.now = cfg.now ?? Date.now;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const res = await this.fetch(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (res.status !== 200) throw new PaymentsError('AUTHENTICATION_FAILURE', `oauth status ${res.status}`);
    const j = await res.json();
    this.token = { value: j.access_token, expiresAt: this.now() + j.expires_in * 1000 };
    return this.token.value;
  }

  private async call(
    method: string,
    path: string,
    requestId: string | undefined,
    body?: unknown,
    extra: Record<string, string> = {},
  ): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.accessToken()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extra,
    };
    if (requestId) headers['PayPal-Request-Id'] = requestId;
    const res = await this.fetch(`${this.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    return { status: res.status, json };
  }

  private static issueOf(json: any): string {
    return json?.details?.[0]?.issue ?? json?.name ?? 'UNKNOWN_ERROR';
  }

  private static fail(status: number, json: any): never {
    throw new PaymentsError(PayPalRestGateway.issueOf(json), `HTTP ${status} ${json?.message ?? ''}`.trim());
  }

  private holdFromOrder(json: any): HoldResult {
    const auth = json?.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) throw new PaymentsError('UNEXPECTED_RESPONSE', `order ${json?.id} has no authorization`);
    if (auth.status !== 'CREATED' && auth.status !== 'PENDING') {
      return { status: 'DECLINED', orderId: json.id, issue: auth.status_details?.reason ?? auth.status };
    }
    const created = auth.create_time ? Date.parse(auth.create_time) : this.now();
    return {
      status: 'AUTHORIZED',
      orderId: json.id,
      authorizationId: auth.id,
      amountCents: valueToCents(auth.amount.value),
      honorPeriodEndsAt: created + 3 * DAY,
      expiresAt: auth.expiration_time ? Date.parse(auth.expiration_time) : created + 29 * DAY,
      vaultId: json?.payment_source?.paypal?.attributes?.vault?.id,
    };
  }

  async placeHold(req: HoldRequest): Promise<HoldResult> {
    const purchase_units = [
      {
        custom_id: req.customId,
        description: req.description,
        amount: { currency_code: 'USD', value: centsToValue(req.amountCents) },
      },
    ];
    const payment_source = req.vaultId
      ? {
          paypal: {
            vault_id: req.vaultId,
            stored_credential: { payment_initiator: 'MERCHANT', usage: 'SUBSEQUENT', usage_pattern: 'UNSCHEDULED_POSTPAID' },
          },
        }
      : {
          paypal: {
            attributes: { vault: { store_in_vault: 'ON_SUCCESS', usage_type: 'MERCHANT', customer_type: 'CONSUMER' } },
            experience_context: { return_url: this.cfg.returnUrl, cancel_url: this.cfg.cancelUrl, user_action: 'CONTINUE', shipping_preference: 'NO_SHIPPING' },
          },
        };
    const extra = req.simulateDecline ? { 'PayPal-Mock-Response': DECLINE_HEADER } : undefined;
    const r = await this.call('POST', '/v2/checkout/orders', req.requestId, { intent: 'AUTHORIZE', purchase_units, payment_source }, extra);
    if (r.status === 422 && PayPalRestGateway.issueOf(r.json) === 'INSTRUMENT_DECLINED') {
      return { status: 'DECLINED', issue: 'INSTRUMENT_DECLINED' };
    }
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    if (r.json.status === 'PAYER_ACTION_REQUIRED' || r.json.status === 'CREATED') {
      const link = (r.json.links ?? []).find((l: any) => l.rel === 'payer-action' || l.rel === 'approve');
      if (!req.vaultId) return { status: 'PAYER_ACTION_REQUIRED', orderId: r.json.id, approvalUrl: link?.href ?? '' };
    }
    if (r.json?.purchase_units?.[0]?.payments?.authorizations?.length) return this.holdFromOrder(r.json);
    // vaulted order created but not yet authorized: authorize it now (merchant-initiated)
    return this.authorizeApprovedOrder(r.json.id, `${req.requestId}:auth`, extra);
  }

  async authorizeApprovedOrder(orderId: string, requestId: string, extra?: Record<string, string>): Promise<HoldResult> {
    const r = await this.call('POST', `/v2/checkout/orders/${orderId}/authorize`, requestId, {}, extra);
    if (r.status === 422 && PayPalRestGateway.issueOf(r.json) === 'INSTRUMENT_DECLINED') {
      return { status: 'DECLINED', orderId, issue: 'INSTRUMENT_DECLINED' };
    }
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    return this.holdFromOrder(r.json);
  }

  async capture(req: CaptureRequest): Promise<CaptureResult> {
    const r = await this.call('POST', `/v2/payments/authorizations/${req.authorizationId}/capture`, req.requestId, {
      amount: { currency_code: 'USD', value: centsToValue(req.amountCents) },
      final_capture: req.finalCapture,
      ...(req.noteToPayer ? { note_to_payer: req.noteToPayer } : {}),
    });
    if (r.status === 422 && PayPalRestGateway.issueOf(r.json) === 'INSTRUMENT_DECLINED') return { status: 'DECLINED', issue: 'INSTRUMENT_DECLINED' };
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    if (r.json.status === 'DECLINED') return { status: 'DECLINED', issue: 'CAPTURE_DECLINED' };
    return { status: 'COMPLETED', captureId: r.json.id, amountCents: valueToCents(r.json.amount.value) };
  }

  async void(authorizationId: string, requestId: string): Promise<{ status: 'VOIDED' }> {
    const r = await this.call('POST', `/v2/payments/authorizations/${authorizationId}/void`, requestId);
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    return { status: 'VOIDED' };
  }

  async reauthorize(authorizationId: string, amountCents: number, requestId: string, simulateDecline = false): Promise<ReauthorizeResult> {
    const extra = simulateDecline ? { 'PayPal-Mock-Response': DECLINE_HEADER } : undefined;
    const r = await this.call(
      'POST',
      `/v2/payments/authorizations/${authorizationId}/reauthorize`,
      requestId,
      { amount: { currency_code: 'USD', value: centsToValue(amountCents) } },
      extra,
    );
    if (r.status === 422) return { status: 'DECLINED', issue: PayPalRestGateway.issueOf(r.json) };
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    const created = r.json.create_time ? Date.parse(r.json.create_time) : this.now();
    return { status: 'AUTHORIZED', authorizationId: r.json.id, honorPeriodEndsAt: created + 3 * DAY };
  }

  async createVaultSetup(req: { requestId: string; customId: string; description: string }): Promise<{ setupTokenId: string; approvalUrl: string }> {
    const r = await this.call('POST', '/v3/vault/setup-tokens', req.requestId, {
      payment_source: {
        paypal: {
          description: req.description,
          usage_type: 'MERCHANT',
          customer_type: 'CONSUMER',
          permit_multiple_payment_tokens: false,
          experience_context: { return_url: this.cfg.returnUrl, cancel_url: this.cfg.cancelUrl, shipping_preference: 'NO_SHIPPING' },
        },
      },
    });
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    const link = (r.json.links ?? []).find((l: any) => l.rel === 'approve');
    return { setupTokenId: r.json.id, approvalUrl: link?.href ?? '' };
  }

  async completeVaultSetup(setupTokenId: string, requestId: string): Promise<{ vaultId: string }> {
    const r = await this.call('POST', '/v3/vault/payment-tokens', requestId, { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } });
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    return { vaultId: r.json.id };
  }

  /** POST /v1/notifications/verify-webhook-signature. Headers are the PAYPAL-* transmission headers. */
  async verifyWebhook(headers: Record<string, string | undefined>, event: unknown, webhookId: string): Promise<boolean> {
    const h = (k: string) => headers[k] ?? headers[k.toLowerCase()];
    const r = await this.call('POST', '/v1/notifications/verify-webhook-signature', undefined, {
      auth_algo: h('PAYPAL-AUTH-ALGO'),
      cert_url: h('PAYPAL-CERT-URL'),
      transmission_id: h('PAYPAL-TRANSMISSION-ID'),
      transmission_sig: h('PAYPAL-TRANSMISSION-SIG'),
      transmission_time: h('PAYPAL-TRANSMISSION-TIME'),
      webhook_id: webhookId,
      webhook_event: event,
    });
    return r.status === 200 && r.json.verification_status === 'SUCCESS';
  }

  async refund(captureId: string, amountCents: number, requestId: string): Promise<RefundResult> {
    const r = await this.call('POST', `/v2/payments/captures/${captureId}/refund`, requestId, {
      amount: { currency_code: 'USD', value: centsToValue(amountCents) },
    });
    if (r.status >= 300) PayPalRestGateway.fail(r.status, r.json);
    return { status: 'COMPLETED', refundId: r.json.id, amountCents: valueToCents(r.json.amount?.value ?? centsToValue(amountCents)) };
  }
}
