import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isTerminal, moneyState, IllegalTransition } from '../src/domain/stateMachine.js';

describe('booking state machine', () => {
  it('allows the hero paths', () => {
    expect(canTransition('BOOKED', 'VAULTED')).toBe(true);
    expect(canTransition('VAULTED', 'HELD')).toBe(true);
    expect(canTransition('HELD', 'EXCUSED')).toBe(true);
    expect(canTransition('HELD', 'PENDING_REFILL')).toBe(true);
    expect(canTransition('PENDING_REFILL', 'REFILLED')).toBe(true);
    expect(canTransition('PENDING_REFILL', 'CHARGED')).toBe(true);
    expect(canTransition('HOLD_FAILED', 'HELD')).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(() => assertTransition('BOOKED', 'CHARGED')).toThrow(IllegalTransition);
    expect(() => assertTransition('CHARGED', 'HELD')).toThrow(IllegalTransition);
    expect(() => assertTransition('VAULTED', 'CHARGED')).toThrow(IllegalTransition);
    expect(() => assertTransition('BOOKED', 'EXCUSED')).toThrow(IllegalTransition);
  });

  it('terminal states have no exits', () => {
    for (const s of ['ATTENDED', 'CANCELLED_EARLY', 'EXCUSED', 'REFILLED', 'CHARGED'] as const) {
      expect(isTerminal(s)).toBe(true);
    }
    expect(isTerminal('HELD')).toBe(false);
  });

  it('maps to money states for the scheduler chips', () => {
    expect(moneyState('BOOKED')).toBe('none');
    expect(moneyState('VAULTED')).toBe('vaulted');
    expect(moneyState('HELD')).toBe('held');
    expect(moneyState('PENDING_REFILL')).toBe('pending-refill');
    expect(moneyState('REFILLED')).toBe('voided');
    expect(moneyState('CHARGED')).toBe('captured');
    expect(moneyState('HOLD_FAILED')).toBe('failed');
  });
});
