import { describe, expect, it } from 'vitest';
import { HOUR } from '../src/clock.js';
import { DEFAULT_RULES, approve, captureViolations, decide, hashRules, summarize, validateRules, type PolicyRules } from '../src/domain/policy.js';
import type { MessageLabel } from '../src/domain/types.js';

const start = Date.UTC(2026, 10, 5, 15);
const booking = { start, holdCents: 2000 };
const lbl = (p: Partial<MessageLabel>): MessageLabel => ({ intent: 'cancel', reason: 'no_reason', confidence: 0.95, evidenceSpan: '', ...p });

describe('policy rules', () => {
  it('validates fee ceilings and conflicting reason lists', () => {
    expect(validateRules(DEFAULT_RULES)).toEqual([]);
    expect(validateRules({ ...DEFAULT_RULES, noShowFeeCents: 5000 })).toContain('noShowFeeCents must be <= holdCents');
    expect(validateRules({ ...DEFAULT_RULES, excusedReasons: ['bereavement'] })).toContain('a reason cannot be both excused and protected');
  });

  it('hash is stable under key order and changes with content', () => {
    const shuffled = Object.fromEntries(Object.entries(DEFAULT_RULES).reverse()) as PolicyRules;
    expect(hashRules(shuffled)).toBe(hashRules(DEFAULT_RULES));
    expect(hashRules({ ...DEFAULT_RULES, holdCents: 2500 })).not.toBe(hashRules(DEFAULT_RULES));
  });

  it('approve versions rules and builds the summary from code', () => {
    const v1 = approve(undefined, DEFAULT_RULES, 'prose', 1);
    const v2 = approve(v1, { ...DEFAULT_RULES, freeCancelHours: 48 }, 'prose', 2);
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v2.summary).toContain('48+ hours');
    expect(summarize(DEFAULT_RULES)).toContain('If we fill your spot from the waitlist, you pay nothing.');
    expect(() => approve(v2, { ...DEFAULT_RULES, holdCents: 0 }, '', 3)).toThrow();
  });
});

describe('decide() scenario cards', () => {
  const at = (hoursBefore: number) => start - hoursBefore * HOUR;
  const cases: Array<[string, Parameters<typeof decide>[0], string]> = [
    ['early cancel is free', { booking, rules: DEFAULT_RULES, now: at(30), kind: 'cancel', label: lbl({}), priorExcusals: 0 }, 'VOID_EARLY'],
    ['late cancel, no reason -> refill first', { booking, rules: DEFAULT_RULES, now: at(5), kind: 'cancel', label: lbl({}), priorExcusals: 0 }, 'PENDING_REFILL'],
    ['sick kid, first time -> excused', { booking, rules: DEFAULT_RULES, now: at(5), kind: 'cancel', label: lbl({ reason: 'illness_dependent' }), priorExcusals: 0 }, 'EXCUSE'],
    ['sick kid, second time -> owner', { booking, rules: DEFAULT_RULES, now: at(5), kind: 'cancel', label: lbl({ reason: 'illness_dependent' }), priorExcusals: 1 }, 'OWNER_REVIEW'],
    ['bereavement -> owner, never auto', { booking, rules: DEFAULT_RULES, now: at(2), kind: 'cancel', label: lbl({ reason: 'bereavement' }), priorExcusals: 0 }, 'OWNER_REVIEW'],
    ['low confidence -> clarify', { booking, rules: DEFAULT_RULES, now: at(5), kind: 'cancel', label: lbl({ confidence: 0.4 }), priorExcusals: 0 }, 'CLARIFY'],
    ['running late -> no money action', { booking, rules: DEFAULT_RULES, now: at(1), kind: 'cancel', label: lbl({ intent: 'running_late' }), priorExcusals: 0 }, 'NO_ACTION'],
    ['no-show -> refill first', { booking, rules: DEFAULT_RULES, now: start + 10 * 60_000, kind: 'no_show', priorExcusals: 0 }, 'PENDING_REFILL'],
  ];
  it.each(cases)('%s', (_n, input, outcome) => {
    expect(decide(input).outcome).toBe(outcome);
  });

  it('fee never exceeds the hold', () => {
    const d = decide({ booking: { start, holdCents: 1500 }, rules: DEFAULT_RULES, now: at(1), kind: 'cancel', label: lbl({}), priorExcusals: 0 });
    expect(d).toMatchObject({ outcome: 'PENDING_REFILL', feeCents: 1500 });
  });
});

describe('capture invariants', () => {
  const ok = { amountCents: 2000, authorizedCents: 2000, rules: DEFAULT_RULES, ownerApproved: true };
  it('passes a clean owner-approved capture', () => expect(captureViolations(ok)).toEqual([]));
  it('blocks over-capture, over-policy, no owner tap, low confidence', () => {
    expect(captureViolations({ ...ok, amountCents: 2001 })).toEqual(expect.arrayContaining(['amount exceeds authorized amount', 'amount exceeds policy maximum']));
    expect(captureViolations({ ...ok, ownerApproved: false })).toContain('every capture needs an owner tap');
    expect(captureViolations({ ...ok, label: lbl({ confidence: 0.2 }) })).toContain('classifier confidence below threshold');
  });
});
