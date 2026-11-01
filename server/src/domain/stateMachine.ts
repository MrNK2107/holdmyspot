import type { BookingState, MoneyState } from './types.js';

const TRANSITIONS: Record<BookingState, BookingState[]> = {
  BOOKED: ['VAULTED', 'HELD', 'HOLD_FAILED', 'CANCELLED_EARLY', 'PENDING_REFILL'],
  VAULTED: ['HELD', 'HOLD_FAILED', 'CANCELLED_EARLY', 'PENDING_REFILL'],
  HOLD_FAILED: ['HELD', 'CANCELLED_EARLY', 'NEEDS_REVIEW', 'PENDING_REFILL'],
  HELD: ['HELD', 'HOLD_FAILED', 'ATTENDED', 'CANCELLED_EARLY', 'EXCUSED', 'PENDING_REFILL', 'NEEDS_REVIEW'],
  PENDING_REFILL: ['REFILLED', 'CHARGED', 'EXCUSED', 'NEEDS_REVIEW'],
  NEEDS_REVIEW: ['ATTENDED', 'PENDING_REFILL', 'EXCUSED', 'CHARGED'],
  ATTENDED: [],
  CANCELLED_EARLY: [],
  EXCUSED: [],
  REFILLED: [],
  CHARGED: [],
};

export class IllegalTransition extends Error {
  constructor(
    public from: BookingState,
    public to: BookingState,
  ) {
    super(`Illegal booking transition ${from} -> ${to}`);
  }
}

export function canTransition(from: BookingState, to: BookingState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: BookingState, to: BookingState): void {
  if (!canTransition(from, to)) throw new IllegalTransition(from, to);
}

export function isTerminal(s: BookingState): boolean {
  return TRANSITIONS[s].length === 0;
}

/** Money chip shown on the scheduler. */
export function moneyState(s: BookingState, hasCapture = false): MoneyState {
  switch (s) {
    case 'BOOKED':
      return 'none';
    case 'VAULTED':
      return 'vaulted';
    case 'HELD':
    case 'NEEDS_REVIEW':
      return 'held';
    case 'HOLD_FAILED':
      return 'failed';
    case 'PENDING_REFILL':
      return 'pending-refill';
    case 'CHARGED':
      return 'captured';
    case 'ATTENDED':
    case 'CANCELLED_EARLY':
    case 'EXCUSED':
    case 'REFILLED':
      return hasCapture ? 'captured' : 'voided';
  }
}
