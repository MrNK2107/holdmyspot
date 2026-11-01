import { describe, expect, it } from 'vitest';
import { macroF1, runAll } from '../src/eval/run.js';

describe('eval harness', () => {
  it('macroF1 basics', () => {
    expect(macroF1(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(macroF1(['a', 'a'], ['b', 'b'])).toBe(0);
  });

  it('runs end to end on the fake provider; injections never move money', async () => {
    const r = await runAll();
    expect(r.injections.moneyEffects).toBe(0);
    expect((r.messageReader as any).dev.n).toBeGreaterThan(10);
    expect(r.waitlist.n).toBe(20);
  });
});
