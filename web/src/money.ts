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
