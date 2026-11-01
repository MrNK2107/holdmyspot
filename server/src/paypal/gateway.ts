/**
 * The only door to money. The policy engine is the only caller; AI code must never import this.
 * Shapes follow PayPal Orders v2 (intent=AUTHORIZE) and Payments v2. Amounts are integer cents.
 */

export interface HoldRequest {
  /** PayPal-Request-Id: makes the write idempotent */
  requestId: string;
  amountCents: number;
  /** `${workspaceId}:${bookingId}`; routes webhooks back to the booking */
  customId: string;
  description: string;
  /** Merchant-initiated authorize with a vaulted wallet when present; buyer-present otherwise */
  vaultId?: string;
  /** Sandbox negative testing (PayPal-Mock-Response INSTRUMENT_DECLINED). Labelled in the UI. */
  simulateDecline?: boolean;
}

export type HoldResult =
  | {
      status: 'AUTHORIZED';
      orderId: string;
      authorizationId: string;
      amountCents: number;
      /** end of the 3-day honor period */
      honorPeriodEndsAt: number;
      /** authorization expiry (29 days) */
      expiresAt: number;
      vaultId?: string;
    }
  | { status: 'PAYER_ACTION_REQUIRED'; orderId: string; approvalUrl: string }
  /** authorization status PENDING (e.g. PENDING_REVIEW): not a hold until PayPal reports it CREATED */
  | { status: 'PENDING'; orderId: string; authorizationId: string; reason: string }
  | { status: 'DECLINED'; orderId?: string; issue: string };

export interface CaptureRequest {
  requestId: string;
  authorizationId: string;
  amountCents: number;
  finalCapture: boolean;
  /** shown on the buyer's statement / activity */
  noteToPayer?: string;
}

export type CaptureResult =
  | { status: 'COMPLETED'; captureId: string; amountCents: number }
  | { status: 'DECLINED'; issue: string };

export interface ReauthorizeResult {
  status: 'AUTHORIZED' | 'DECLINED';
  authorizationId?: string;
  honorPeriodEndsAt?: number;
  issue?: string;
}

export interface RefundResult {
  status: 'COMPLETED';
  refundId: string;
  amountCents: number;
}

export interface PaymentsGateway {
  readonly mode: 'mock' | 'sandbox';
  /** Buyer-present: create an AUTHORIZE order (store_in_vault ON_SUCCESS); MIT when vaultId is set. */
  placeHold(req: HoldRequest): Promise<HoldResult>;
  /** After the buyer approves a PAYER_ACTION_REQUIRED order. */
  authorizeApprovedOrder(orderId: string, requestId: string): Promise<HoldResult>;
  capture(req: CaptureRequest): Promise<CaptureResult>;
  void(authorizationId: string, requestId: string): Promise<{ status: 'VOIDED' }>;
  reauthorize(authorizationId: string, amountCents: number, requestId: string, simulateDecline?: boolean): Promise<ReauthorizeResult>;
  refund(captureId: string, amountCents: number, requestId: string): Promise<RefundResult>;
  /** Vault v3: save the wallet now, hold later (bookings more than 72h out). */
  createVaultSetup(req: { requestId: string; customId: string; description: string }): Promise<{ setupTokenId: string; approvalUrl: string }>;
  /** After the buyer approves the setup token: exchange it for a payment token (vault id). */
  completeVaultSetup(setupTokenId: string, requestId: string): Promise<{ vaultId: string }>;
}

/** PayPal webhook event, trimmed to the fields we route on. */
export interface WebhookEvent {
  id: string;
  event_type:
    | 'PAYMENT.AUTHORIZATION.CREATED'
    | 'PAYMENT.AUTHORIZATION.VOIDED'
    | 'PAYMENT.CAPTURE.COMPLETED'
    | 'PAYMENT.CAPTURE.DENIED'
    | 'PAYMENT.CAPTURE.REFUNDED'
    | 'PAYMENT.CAPTURE.REVERSED'
    | 'PAYMENT.REFUND.FAILED'
    | 'VAULT.PAYMENT-TOKEN.CREATED';
  create_time: string;
  resource: { id: string; custom_id?: string; status?: string; amount?: { currency_code: string; value: string }; links?: Array<{ rel: string; href: string }> };
}

/** A refund resource names its capture only through its "up" link (it may carry no custom_id). */
export function upCaptureId(e: WebhookEvent): string | undefined {
  if (e.event_type !== 'PAYMENT.CAPTURE.REFUNDED' && e.event_type !== 'PAYMENT.REFUND.FAILED') return undefined;
  return e.resource.links?.find((l) => l.rel === 'up')?.href.match(/\/v2\/payments\/captures\/([^/?#]+)/)?.[1];
}

export class PaymentsError extends Error {
  constructor(
    public issue: string,
    message?: string,
  ) {
    super(message ? `${issue}: ${message}` : issue);
  }
}

export function centsToValue(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new PaymentsError('INVALID_AMOUNT', `bad cents ${cents}`);
  return (cents / 100).toFixed(2);
}

export function valueToCents(value: string): number {
  return Math.round(Number(value) * 100);
}
