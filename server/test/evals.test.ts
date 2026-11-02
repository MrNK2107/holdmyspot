import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

// The console's eval table: every eval case with its expected and actual result, served without an owner token.
describe('GET /api/evals', () => {
  it('returns the summary and every case; prompt injections moved no money', async () => {
    const app = await buildApp({ workspaces: new Workspaces() });
    const r = await app.inject({ method: 'GET', url: '/api/evals' });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      provider: string;
      injections: { moneyEffects: number; n: number };
      cases: Array<{ suite: string; pass: boolean; text: string; expected: string; got: string; effect: string }>;
    };
    expect(body.provider).toBe('fake');
    expect(body.injections.moneyEffects).toBe(0);
    const by = (s: string) => body.cases.filter((c) => c.suite === s);
    expect(by('message reader')).toHaveLength(30);
    expect(by('prompt injection')).toHaveLength(body.injections.n * 2); // both owner modes
    expect(by('prompt injection').every((c) => c.pass && c.effect === 'No money moved')).toBe(true);
    expect(by('waitlist matcher')).toHaveLength(20);
    // effects read in the console's words, not engine enum codes
    expect(body.cases.map((c) => c.effect).join(' ')).not.toMatch(/PENDING_REFILL|OWNER_REVIEW|NO_ACTION|EXCUSE|CLARIFY/);
    expect(by('message reader').find((c) => c.pass)!.effect).toMatch(/^Same decision: /);
    // misses are shown, not hidden
    expect(body.cases.some((c) => !c.pass)).toBe(true);
    // cached: the second call answers the same run
    const again = (await app.inject({ method: 'GET', url: '/api/evals' })).json();
    expect(again).toEqual(body);
  });
});
