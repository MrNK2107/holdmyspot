import { DAY } from '../clock.js';
import {
  type CaptureRequest,
  type CaptureResult,
  type HoldRequest,
  type HoldResult,
  type PaymentsGateway,
  type ReauthorizeResult,
  type RefundResult,
  type WebhookEvent,
  PaymentsError,
  centsToValue,
} from './gateway.js';

interface Auth {
  id: string;
  orderId: string;
  customId: string;
  amountCents: number;
  createdAt: number;
  honorPeriodEndsAt: number;
  expiresAt: number;
  status: 'CREATED' | 'CAPTURED' | 'PARTIALLY_CAPTURED' | 'VOIDED' | 'EXPIRED';
  capturedCents: number;
  /** id of the original auth for reauthorizations */
  parentId?: string;
}

interface Order {
  id: string;
  req: HoldRequest;
  approved: boolean;
}

/**
 * Deterministic PayPal sandbox simulator. Implements the documented rules the engine relies on:
 * 3-day honor period, 29-day validity, reauthorize only from day 4, capture <= authorized amount,
 * void only an uncaptured authorization, idempotency by PayPal-Request-Id, webhooks with custom_id.
 * IDs are sequential so tests and demo screenshots are repeatable.
 */
export class MockPayPalGateway implements PaymentsGateway {
  readonly mode = 'mock' as const;
  private seq = 0;
  private orders = new Map<string, Order>();
  private auths = new Map<string, Auth>();
  private captures = new Map<string, { id: string; authId: string; amountCents: number; refundedCents: number }>();
  private idem = new Map<string, unknown>();
  private listeners = new Set<(e: WebhookEvent) => void | Promise<void>>();
  readonly calls: Array<{ op: string; requestId: string }> = [];

  constructor(
    private now: () => number,
    private opts: { declineVaultIds?: Set<string>; baseUrl?: string } = {},
  ) {}

  onWebhook(fn: (e: WebhookEvent) => void | Promise<void>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Delivered events, kept so tests can replay duplicates. */
  readonly delivered: WebhookEvent[] = [];

  private id(prefix: string): string {
    return `${prefix}-${String(++this.seq).padStart(6, '0')}`;
  }

  private async once<T>(op: string, requestId: string, fn: () => Promise<T> | T): Promise<T> {
    this.calls.push({ op, requestId });
    const key = `${op}:${requestId}`;
    if (this.idem.has(key)) return this.idem.get(key) as T;
    const r = await fn();
    this.idem.set(key, r);
    return r;
  }

  private async emit(event_type: WebhookEvent['event_type'], resource: WebhookEvent['resource']): Promise<void> {
    const e: WebhookEvent = { id: this.id('WH'), event_type, create_time: new Date(this.now()).toISOString(), resource };
    this.delivered.push(e);
    for (const l of this.listeners) await l(e);
  }

  async redeliver(eventId: string): Promise<void> {
    const e = this.delivered.find((x) => x.id === eventId);
    if (!e) throw new Error(`unknown event ${eventId}`);
    for (const l of this.listeners) await l(e);
  }

  placeHold(req: HoldRequest): Promise<HoldResult> {
    return this.once('placeHold', req.requestId, async () => {
      centsToValue(req.amountCents);
      const orderId = this.id('ORDER');
      this.orders.set(orderId, { id: orderId, req, approved: !!req.vaultId });
      if (!req.vaultId) {
        const base = this.opts.baseUrl ?? '';
        return { status: 'PAYER_ACTION_REQUIRED', orderId, approvalUrl: `${base}/paypal/approve/${orderId}` } as const;
      }
      return this.authorize(orderId);
    });
  }

  /** Simulated buyer approval in the PayPal popup. */
  approve(orderId: string): void {
    const setup = this.setups.get(orderId);
    if (setup) {
      setup.approved = true;
      return;
    }
    const o = this.orders.get(orderId);
    if (!o) throw new PaymentsError('RESOURCE_NOT_FOUND', `order ${orderId}`);
    o.approved = true;
  }

  private setups = new Map<string, { customId: string; approved: boolean; vaultId?: string }>();

  createVaultSetup(req: { requestId: string; customId: string; description: string }): Promise<{ setupTokenId: string; approvalUrl: string }> {
    return this.once('createVaultSetup', req.requestId, () => {
      const setupTokenId = this.id('VSETUP');
      this.setups.set(setupTokenId, { customId: req.customId, approved: false });
      return { setupTokenId, approvalUrl: `${this.opts.baseUrl ?? ''}/paypal/approve/${setupTokenId}` };
    });
  }

  completeVaultSetup(setupTokenId: string, requestId: string): Promise<{ vaultId: string }> {
    return this.once('completeVaultSetup', requestId, async () => {
      const s = this.setups.get(setupTokenId);
      if (!s) throw new PaymentsError('RESOURCE_NOT_FOUND', `setup token ${setupTokenId}`);
      if (!s.approved) throw new PaymentsError('SETUP_TOKEN_NOT_APPROVED');
      s.vaultId ??= this.id('VAULT');
      await this.emit('VAULT.PAYMENT-TOKEN.CREATED', { id: s.vaultId, custom_id: s.customId });
      return { vaultId: s.vaultId };
    });
  }

  authorizeApprovedOrder(orderId: string, requestId: string): Promise<HoldResult> {
    return this.once('authorizeOrder', requestId, () => {
      const o = this.orders.get(orderId);
      if (!o) throw new PaymentsError('RESOURCE_NOT_FOUND', `order ${orderId}`);
      if (!o.approved) throw new PaymentsError('ORDER_NOT_APPROVED');
      return this.authorize(orderId);
    });
  }

  private async authorize(orderId: string): Promise<HoldResult> {
    const o = this.orders.get(orderId)!;
    const declined = o.req.simulateDecline || (o.req.vaultId && this.opts.declineVaultIds?.has(o.req.vaultId));
    if (declined) return { status: 'DECLINED', orderId, issue: 'INSTRUMENT_DECLINED' };
    const t = this.now();
    const auth: Auth = {
      id: this.id('AUTH'),
      orderId,
      customId: o.req.customId,
      amountCents: o.req.amountCents,
      createdAt: t,
      honorPeriodEndsAt: t + 3 * DAY,
      expiresAt: t + 29 * DAY,
      status: 'CREATED',
      capturedCents: 0,
    };
    this.auths.set(auth.id, auth);
    let vaultId = o.req.vaultId;
    if (!vaultId) {
      vaultId = this.id('VAULT');
      await this.emit('VAULT.PAYMENT-TOKEN.CREATED', { id: vaultId, custom_id: o.req.customId });
    }
    await this.emit('PAYMENT.AUTHORIZATION.CREATED', {
      id: auth.id,
      custom_id: auth.customId,
      status: 'CREATED',
      amount: { currency_code: 'USD', value: centsToValue(auth.amountCents) },
    });
    return {
      status: 'AUTHORIZED',
      orderId,
      authorizationId: auth.id,
      amountCents: auth.amountCents,
      honorPeriodEndsAt: auth.honorPeriodEndsAt,
      expiresAt: auth.expiresAt,
      vaultId,
    };
  }

  private liveAuth(id: string): Auth {
    const a = this.auths.get(id);
    if (!a) throw new PaymentsError('RESOURCE_NOT_FOUND', `authorization ${id}`);
    if (a.status === 'CREATED' && this.now() > a.expiresAt) a.status = 'EXPIRED';
    return a;
  }

  capture(req: CaptureRequest): Promise<CaptureResult> {
    return this.once('capture', req.requestId, async () => {
      const a = this.liveAuth(req.authorizationId);
      if (a.status === 'VOIDED') throw new PaymentsError('AUTHORIZATION_VOIDED');
      if (a.status === 'EXPIRED') throw new PaymentsError('AUTHORIZATION_EXPIRED');
      if (a.status === 'CAPTURED') throw new PaymentsError('AUTHORIZATION_ALREADY_CAPTURED');
      if (req.amountCents <= 0 || a.capturedCents + req.amountCents > a.amountCents) {
        throw new PaymentsError('AMOUNT_EXCEEDS_AUTHORIZED');
      }
      const captureId = this.id('CAPTURE');
      a.capturedCents += req.amountCents;
      a.status = req.finalCapture || a.capturedCents === a.amountCents ? 'CAPTURED' : 'PARTIALLY_CAPTURED';
      this.captures.set(captureId, { id: captureId, authId: a.id, amountCents: req.amountCents, refundedCents: 0 });
      await this.emit('PAYMENT.CAPTURE.COMPLETED', {
        id: captureId,
        custom_id: a.customId,
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: centsToValue(req.amountCents) },
      });
      return { status: 'COMPLETED', captureId, amountCents: req.amountCents } as const;
    });
  }

  void(authorizationId: string, requestId: string): Promise<{ status: 'VOIDED' }> {
    return this.once('void', requestId, async () => {
      const a = this.liveAuth(authorizationId);
      if (a.status !== 'CREATED') throw new PaymentsError('CANNOT_VOID', `authorization is ${a.status}`);
      a.status = 'VOIDED';
      await this.emit('PAYMENT.AUTHORIZATION.VOIDED', { id: a.id, custom_id: a.customId, status: 'VOIDED' });
      return { status: 'VOIDED' } as const;
    });
  }

  reauthorize(authorizationId: string, amountCents: number, requestId: string, simulateDecline = false): Promise<ReauthorizeResult> {
    return this.once('reauthorize', requestId, async () => {
      const a = this.liveAuth(authorizationId);
      if (a.status !== 'CREATED') throw new PaymentsError('CANNOT_REAUTHORIZE', `authorization is ${a.status}`);
      if (this.now() < a.honorPeriodEndsAt) throw new PaymentsError('REAUTHORIZE_TOO_EARLY', 'reauthorize is allowed from day 4');
      if (amountCents > a.amountCents) throw new PaymentsError('AMOUNT_EXCEEDS_AUTHORIZED');
      if (simulateDecline) return { status: 'DECLINED', issue: 'INSTRUMENT_DECLINED' } as const;
      const t = this.now();
      const next: Auth = {
        ...a,
        id: this.id('AUTH'),
        amountCents,
        createdAt: t,
        honorPeriodEndsAt: t + 3 * DAY,
        // a reauthorization keeps the original 29-day validity
        expiresAt: a.expiresAt,
        status: 'CREATED',
        capturedCents: 0,
        parentId: a.parentId ?? a.id,
      };
      this.auths.set(next.id, next);
      await this.emit('PAYMENT.AUTHORIZATION.CREATED', {
        id: next.id,
        custom_id: next.customId,
        status: 'CREATED',
        amount: { currency_code: 'USD', value: centsToValue(amountCents) },
      });
      return { status: 'AUTHORIZED', authorizationId: next.id, honorPeriodEndsAt: next.honorPeriodEndsAt } as const;
    });
  }

  refund(captureId: string, amountCents: number, requestId: string): Promise<RefundResult> {
    return this.once('refund', requestId, async () => {
      const c = this.captures.get(captureId);
      if (!c) throw new PaymentsError('RESOURCE_NOT_FOUND', `capture ${captureId}`);
      if (amountCents <= 0 || c.refundedCents + amountCents > c.amountCents) throw new PaymentsError('REFUND_AMOUNT_EXCEEDED');
      c.refundedCents += amountCents;
      const refundId = this.id('REFUND');
      const a = this.auths.get(c.authId)!;
      await this.emit('PAYMENT.CAPTURE.REFUNDED', {
        id: refundId,
        custom_id: a.customId,
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: centsToValue(amountCents) },
      });
      return { status: 'COMPLETED', refundId, amountCents } as const;
    });
  }

  authorizationStatus(id: string): Auth['status'] {
    return this.liveAuth(id).status;
  }
}
