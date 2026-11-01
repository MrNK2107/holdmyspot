export type BookingState =
  | 'BOOKED'
  | 'VAULTED'
  | 'HELD'
  | 'HOLD_FAILED'
  | 'ATTENDED'
  | 'CANCELLED_EARLY'
  | 'EXCUSED'
  | 'PENDING_REFILL'
  | 'REFILLED'
  | 'CHARGED'
  | 'NEEDS_REVIEW';

export type MoneyState = 'none' | 'vaulted' | 'held' | 'pending-refill' | 'voided' | 'captured' | 'failed' | 'reversed';

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
}

export interface Client {
  id: string;
  name: string;
  /** PayPal vault payment-token id, when the wallet is saved */
  vaultId?: string;
  /** Sandbox persona flag: holds for this client are declined (PayPal negative testing). */
  sandboxDecline?: boolean;
}

export interface Booking {
  id: string;
  clientId: string;
  serviceId: string;
  start: number; // epoch ms
  end: number;
  state: BookingState;
  holdCents: number;
  policyVersion: number;
  policyHash: string;
  orderId?: string;
  authorizationId?: string;
  authorizedAt?: number;
  captureId?: string;
  refundId?: string;
  capturedCents?: number;
  /** end of the hold's 29-day authorization validity (a reauthorization does not extend it) */
  holdExpiresAt?: number;
  /** PayPal allows one reauthorization per authorization */
  reauthorized?: boolean;
  refilledByBookingId?: string;
  refillOfBookingId?: string;
  approvalLink?: string;
  cancelledAt?: number;
  /** PayPal took back a captured fee (capture denied or reversed): it is no longer collected */
  paymentIssue?: string;
  /** PayPal voided the current hold outside HoldMySpot (PAYMENT.AUTHORIZATION.VOIDED): nothing can be collected on it */
  holdVoided?: string;
  lastLabel?: MessageLabel;
}

export interface WaitlistConstraints {
  serviceIds: string[];
  /** days of week 0-6 (Sun=0); empty = any */
  days: number[];
  /** minutes from midnight (UTC in the demo) */
  earliestMin: number;
  latestMin: number;
}

export interface WaitlistEntry {
  id: string;
  clientId: string;
  text: string;
  parsed?: WaitlistConstraints;
}

export type MessageIntent = 'cancel' | 'reschedule' | 'running_late' | 'confirm' | 'question' | 'other';
export type CancelReason =
  | 'illness_self'
  | 'illness_dependent'
  | 'medical_emergency'
  | 'bereavement'
  | 'emergency_other'
  | 'work'
  | 'transport'
  | 'forgot'
  | 'no_reason'
  | 'none';

export interface MessageLabel {
  intent: MessageIntent;
  reason: CancelReason;
  proposedTime?: string;
  confidence: number;
  evidenceSpan: string;
}

export interface ChatMessage {
  id: string;
  at: number;
  clientId: string;
  from: 'client' | 'frontdesk';
  text: string;
}
