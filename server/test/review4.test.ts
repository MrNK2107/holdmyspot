import { describe, expect, it } from 'vitest';
import { AuditLog } from '../src/audit.js';
import { FrontDesk } from '../src/ai/frontdesk.js';
import type { AiTask, AiTasks, LlmProvider } from '../src/ai/provider.js';
import { DEFAULT_RULES } from '../src/domain/policy.js';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';
import { PaymentsError } from '../src/paypal/gateway.js';
import { PayPalRestGateway, type FetchLike } from '../src/paypal/rest.js';

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

describe('POST /time validates the target', () => {
  for (const body of [{ to: 'abc' }, { to: 1e300 }, { byMs: 'x' }, { byMs: -5 }, {}]) {
    it(`rejects ${JSON.stringify(body)} and leaves the clock a number`, async () => {
      const ws = new Workspaces();
      await ws.create('demo');
      const app = await buildApp({ workspaces: ws });
      const e = ws.get('demo')!.engine;
      const before = e.now();
      const r = await app.inject({ method: 'POST', url: '/api/ws/demo/time', payload: body });
      expect(r.statusCode).toBe(400);
      expect(e.now()).toBe(before);
      expect((await app.inject('/api/ws/demo/state')).statusCode).toBe(200);
    });
  }
  it('still travels to a valid time', async () => {
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws });
    const e = ws.get('demo')!.engine;
    const to = e.now() + 3_600_000;
    expect((await app.inject({ method: 'POST', url: '/api/ws/demo/time', payload: { to } })).statusCode).toBe(200);
    expect(e.now()).toBe(to);
  });
});

describe('POST /bookings validates the start time', () => {
  for (const start of ['abc', '1700000000000', null, 1.5, -1]) {
    it(`rejects start=${JSON.stringify(start)} without placing a hold`, async () => {
      const ws = new Workspaces();
      await ws.create('demo');
      const app = await buildApp({ workspaces: ws });
      const e = ws.get('demo')!.engine;
      const n = e.bookings.size;
      const r = await app.inject({ method: 'POST', url: '/api/ws/demo/bookings', payload: { clientId: 'sam', serviceId: 'gel', start } });
      expect(r.statusCode).toBe(400);
      expect(e.bookings.size).toBe(n);
    });
  }
  it('rejects a visit that already started (it would hold the wallet and then ask about attendance)', async () => {
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws });
    const e = ws.get('demo')!.engine;
    const n = e.bookings.size;
    const r = await app.inject({ method: 'POST', url: '/api/ws/demo/bookings', payload: { clientId: 'sam', serviceId: 'gel', start: e.now() - 3_600_000 } });
    expect(r.statusCode).toBe(400);
    expect(e.bookings.size).toBe(n);
  });
});

describe('POST /reset only resets an existing workspace', () => {
  it('404s for an unknown id instead of creating a workspace with a chosen id', async () => {
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws });
    const r = await app.inject({ method: 'POST', url: '/api/ws/attacker-chosen/reset', payload: {} });
    expect(r.statusCode).toBe(404);
    expect(ws.get('attacker-chosen')).toBeUndefined();
    expect((await app.inject({ method: 'POST', url: '/api/ws/demo/reset', payload: {} })).statusCode).toBe(200);
  });
});

describe('PayPalRestGateway transport errors', () => {
  const captureReq = { requestId: 'rq-cap-1', authorizationId: 'AUTH1', amountCents: 2000, finalCapture: true };
  const make = (fetch: FetchLike, extra: Record<string, unknown> = {}) =>
    new PayPalRestGateway({ clientId: 'id', clientSecret: 's', returnUrl: 'r', cancelUrl: 'c', fetch, now: () => 0, ...extra });
  const tokenRes = { status: 200, json: async () => ({}), text: async () => JSON.stringify({ access_token: 'T', expires_in: 32400 }) };

  it('a 401 on a cached token refreshes the token once and replays the call with the same PayPal-Request-Id', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    let captures = 0;
    const g = make(async (url, init) => {
      seen.push({ url, headers: init.headers });
      if (url.endsWith('/v1/oauth2/token')) return tokenRes;
      captures++;
      if (captures === 1) return { status: 401, json: async () => ({}), text: async () => JSON.stringify({ name: 'AUTHENTICATION_FAILURE' }) };
      return { status: 201, json: async () => ({}), text: async () => JSON.stringify({ id: 'CAP1', status: 'COMPLETED', amount: { value: '20.00' } }) };
    });
    const r = await g.capture(captureReq);
    expect(r).toEqual({ status: 'COMPLETED', captureId: 'CAP1', amountCents: 2000 });
    const caps = seen.filter((s) => s.url.includes('/capture'));
    expect(caps).toHaveLength(2);
    expect(caps.map((c) => c.headers['PayPal-Request-Id'])).toEqual(['rq-cap-1', 'rq-cap-1']);
    expect(seen.filter((s) => s.url.endsWith('/v1/oauth2/token'))).toHaveLength(2);
  });

  it('a non-JSON error page maps to a PaymentsError with the HTTP status, not a SyntaxError', async () => {
    const g = make(async (url) => (url.endsWith('/v1/oauth2/token') ? tokenRes : { status: 503, json: async () => ({}), text: async () => '<html>Service Unavailable</html>' }));
    const err = await g.capture(captureReq).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentsError);
    expect(String(err.message)).toContain('503');
  });

  it('a network failure maps to a PaymentsError', async () => {
    const g = make(async (url) => {
      if (url.endsWith('/v1/oauth2/token')) return tokenRes;
      throw new TypeError('fetch failed');
    });
    const err = await g.capture(captureReq).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentsError);
    expect(err.issue).toBe('NETWORK_ERROR');
  });

  it('a call PayPal never answers times out instead of holding the workspace lock forever', async () => {
    const g = make(async (url) => (url.endsWith('/v1/oauth2/token') ? tokenRes : new Promise(() => undefined)), { timeoutMs: 50 });
    const err = await g.capture(captureReq).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentsError);
    expect(err.issue).toBe('TIMEOUT');
  });
});

describe('webhook event-id dedupe', () => {
  it('an event whose handler failed is not burned: PayPal\'s retry of the same id is processed', async () => {
    const w = await new Workspaces().create('wh');
    const e = w.engine;
    await e.clock.advanceTo(Date.UTC(2026, 10, 5, 11, 10));
    const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
    expect(alex.state).toBe('HELD');
    const ev = {
      id: 'WH-RETRY-1',
      event_type: 'PAYMENT.AUTHORIZATION.VOIDED' as const,
      create_time: '',
      resource: { id: alex.authorizationId!, custom_id: `wh:${alex.id}`, status: 'VOIDED' },
    };
    const engine = e as unknown as { onHoldVoided: (...a: unknown[]) => void };
    const real = engine.onHoldVoided;
    engine.onHoldVoided = () => {
      throw new Error('transient failure');
    };
    await expect(e.ingestWebhook(ev)).rejects.toThrow('transient failure');
    engine.onHoldVoided = real;
    expect(await e.ingestWebhook(ev)).toBe('processed');
    expect(alex.holdVoided).toMatch(/voided/);
    expect(await e.ingestWebhook(ev)).toBe('duplicate');
  });
});
