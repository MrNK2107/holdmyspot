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
  reversed: 'charge reversed',
};

/** One booking's ledger amounts (cents). A capture PayPal denied or reversed is not money the owner keeps (as on the server). */
export function ledgerAmounts(b: { money: string; holdCents: number; captureId?: string; capturedCents?: number; refundId?: string }) {
  const charged = b.captureId && b.money !== 'reversed' ? (b.capturedCents ?? b.holdCents) : 0;
  return {
    heldCents: b.money === 'held' || b.money === 'pending-refill' ? b.holdCents : 0,
    chargedCents: charged,
    refundedCents: b.refundId ? charged : 0,
    keptCents: b.refundId ? 0 : charged,
  };
}

/** Booking state in words; the money outcome wins where the raw state would contradict it. */
export function bookingStateLabel(b: { state: string; money: string; refundId?: string; refillOfBookingId?: string; authorizationId?: string }): string {
  if (b.refundId) return 'refunded';
  if (b.money === 'reversed') return 'charge reversed';
  if (b.money === 'voided' && (b.state === 'HELD' || b.state === 'PENDING_REFILL')) return 'hold voided at PayPal';
  if (b.refillOfBookingId && b.state === 'CANCELLED_EARLY' && !b.authorizationId) return 'claim closed (no hold)';
  return b.state.replace(/_/g, ' ').toLowerCase();
}
