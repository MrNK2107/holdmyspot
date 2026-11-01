/** Money-state labels and ledger amounts, kept free of React/AG Grid so the server tests can check them. */
export const MONEY_TEXT: Record<string, string> = {
  none: 'no hold',
  vaulted: 'wallet saved',
  held: 'held',
  'pending-refill': 'refilling',
  voided: 'released',
  captured: 'charged',
  failed: 'hold failed',
  refunded: 'refunded',
  'part-refunded': 'partly refunded',
  reversed: 'charge reversed',
};

/** One booking's ledger amounts (cents). A capture PayPal denied or reversed is not money the owner keeps (as on the server). */
export function ledgerAmounts(b: { money: string; holdCents: number; captureId?: string; capturedCents?: number; refundId?: string; refundedCents?: number }) {
  const charged = b.captureId && b.money !== 'reversed' ? (b.capturedCents ?? b.holdCents) : 0;
  // refundId marks a full refund; refundedCents also counts partial refunds made in the PayPal dashboard
  const refunded = b.refundId ? charged : Math.min(charged, b.refundedCents ?? 0);
  return {
    heldCents: b.money === 'held' || b.money === 'pending-refill' ? b.holdCents : 0,
    chargedCents: charged,
    refundedCents: refunded,
    keptCents: charged - refunded,
  };
}

/** Booking state in words; the money outcome wins where the raw state would contradict it. */
export function bookingStateLabel(b: { state: string; money: string; refundId?: string; refillOfBookingId?: string; authorizationId?: string }): string {
  if (b.refundId) return 'refunded';
  if (b.money === 'reversed') return 'charge reversed';
  if (b.money === 'part-refunded') return 'partly refunded';
  if (b.money === 'voided' && (b.state === 'HELD' || b.state === 'PENDING_REFILL')) return 'hold voided at PayPal';
  if (b.refillOfBookingId && b.state === 'CANCELLED_EARLY' && !b.authorizationId) return 'claim closed (no hold)';
  return b.state.replace(/_/g, ' ').toLowerCase();
}
