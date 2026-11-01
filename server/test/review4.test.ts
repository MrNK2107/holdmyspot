import { describe, expect, it } from 'vitest';
import { AuditLog } from '../src/audit.js';
import { FrontDesk } from '../src/ai/frontdesk.js';
import type { AiTask, AiTasks, LlmProvider } from '../src/ai/provider.js';
import { DEFAULT_RULES } from '../src/domain/policy.js';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

// Review round 2 (2026-11-02): HTTP surface, REST adapter, AI output and UI rendering.

function stubLlm(out: Partial<{ [K in AiTask]: AiTasks[K]['output'] }>): LlmProvider {
  return {
    name: 'stub',
    run: async (task) => {
      const o = out[task];
      if (!o) throw new Error(`no stub for ${task}`);
      return o as never;
    },
  };
}

describe('compile_policy spans are whitelisted', () => {
  it('drops spans whose field is not a rule name or whose text is not in the prose', async () => {
    const fd = new FrontDesk(
      stubLlm({
        compile_policy: {
          rules: structuredClone(DEFAULT_RULES),
          ambiguities: [],
          spans: [
            { field: 'holdCents" onmouseover="alert(1)' as never, text: '$20' },
            { field: 'holdCents', text: '$20' },
            { field: 'noShowFeeCents', text: '<img src=x onerror=alert(1)>' },
            { field: 'freeCancelHours', text: 7 as never },
          ],
        },
      }),
      new AuditLog(() => 0),
    );
    const r = await fd.compilePolicy('We hold $20 for every visit.');
    expect(r.spans).toEqual([{ field: 'holdCents', text: '$20' }]);
  });
});

describe('POST /policy/approve validates the whole rule shape', () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ['missing excusalLimit', { excusalLimit: undefined }],
    ['negative excusal count', { excusalLimit: { count: -1, months: 6 } }],
    ['string hours', { freeCancelHours: '24' }],
    ['string confidence', { minConfidence: '0.5' }],
    ['non-boolean refillWaives', { refillWaives: 'no' }],
    ['unknown reason', { excusedReasons: ['illness_self', 'vibes'] }],
    ['reasons not a list', { protectedReasons: 'bereavement' }],
    ['extra key', { holdCentsOverride: 1 }],
  ];
  for (const [name, patch] of bad) {
    it(`rejects ${name} and keeps the live policy`, async () => {
      const ws = new Workspaces();
      await ws.create('demo');
      const app = await buildApp({ workspaces: ws });
      const before = ws.get('demo')!.engine.policy.version;
      const rules = { ...structuredClone(DEFAULT_RULES), ...patch };
      const r = await app.inject({ method: 'POST', url: '/api/ws/demo/policy/approve', payload: { rules, prose: 'x' } });
      expect(r.statusCode).toBe(400);
      expect(ws.get('demo')!.engine.policy.version).toBe(before);
    });
  }
});
