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

describe('the ledger shows the server money state', () => {
  it('a reversed capture is neither charged nor kept in the ledger row', async () => {
    const { ledgerAmounts, MONEY_TEXT } = await import('../../web/src/money.js');
    const w = await new Workspaces().create('lg');
    const e = w.engine;
    await e.clock.advanceTo(Date.UTC(2026, 10, 5, 11, 10));
    const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!.id, 'no_show');
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!.id, 'charge');
    const view = () => e.snapshot().bookings.find((b) => b.id === alex.id)!;
    expect(ledgerAmounts(view())).toMatchObject({ chargedCents: 2000, keptCents: 2000 });
    await e.ingestWebhook({ id: 'WH-REV', event_type: 'PAYMENT.CAPTURE.REVERSED', create_time: '', resource: { id: alex.captureId!, custom_id: `lg:${alex.id}`, status: 'REVERSED' } });
    expect(view().money).toBe('reversed');
    expect(ledgerAmounts(view())).toEqual({ heldCents: 0, chargedCents: 0, refundedCents: 0, keptCents: 0 });
    // every money state the server can send has a label
    for (const m of ['none', 'vaulted', 'held', 'pending-refill', 'voided', 'captured', 'failed', 'refunded', 'reversed']) expect(MONEY_TEXT[m]).toBeTruthy();
  });
});

describe('model-backed routes are rate limited', () => {
  it('a burst of client texts to one workspace gets 429 after the per-workspace budget, without reaching the engine', async () => {
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws, rateLimit: { perWorkspacePerMin: 5, globalPerMin: 100 } });
    const e = ws.get('demo')!.engine;
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await app.inject({ method: 'POST', url: '/api/ws/demo/messages', payload: { clientId: 'sam', text: `hello ${i}` } })).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes.slice(5)).toEqual([429, 429]);
    expect(e.messages.filter((m) => m.from === 'client' && m.text.startsWith('hello')).length).toBe(5);
    // the owner's assistant shares the workspace budget; other routes do not
    expect((await app.inject({ method: 'POST', url: '/api/ws/demo/assistant', payload: { text: 'how was the week?' } })).statusCode).toBe(429);
    expect((await app.inject('/api/ws/demo/state')).statusCode).toBe(200);
  });

  it('the global budget caps model calls across many workspaces', async () => {
    const ws = new Workspaces();
    const ids = [(await ws.create('a')).engine.id, (await ws.create('b')).engine.id, (await ws.create('c')).engine.id];
    const app = await buildApp({ workspaces: ws, rateLimit: { perWorkspacePerMin: 5, globalPerMin: 4 } });
    const codes: number[] = [];
    for (const id of ids) for (let i = 0; i < 2; i++) codes.push((await app.inject({ method: 'POST', url: `/api/ws/${id}/messages`, payload: { clientId: 'sam', text: 'hi' } })).statusCode);
    expect(codes.filter((c) => c === 429).length).toBe(2);
  });
});

describe('workspace creation and reset are rate limited (each seeds through the model and, in sandbox mode, PayPal)', () => {
  it('creating workspaces in a loop gets 429 instead of evicting every visitor\'s workspace', async () => {
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws, rateLimit: { perWorkspacePerMin: 2, globalPerMin: 100 } });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await app.inject({ method: 'POST', url: '/api/workspaces' })).statusCode);
    expect(codes).toEqual([200, 200, 429, 429]);
    const resets: number[] = [];
    for (let i = 0; i < 3; i++) resets.push((await app.inject({ method: 'POST', url: '/api/ws/demo/reset', payload: {} })).statusCode);
    expect(resets).toEqual([200, 200, 429]);
  });
});

describe('error responses do not leak internals', () => {
  for (const [url, payload] of [
    ['/api/ws/demo/book', undefined],
    ['/api/ws/demo/book', { name: 123, serviceId: 'gel', start: 1 }],
    ['/api/ws/demo/messages', undefined],
    ['/api/ws/demo/bookings', undefined],
    ['/api/ws/demo/approvals/x', undefined],
  ] as const) {
    it(`${url} with ${JSON.stringify(payload)} gets a plain 400`, async () => {
      const ws = new Workspaces();
      await ws.create('demo');
      const app = await buildApp({ workspaces: ws });
      const r = await app.inject({ method: 'POST', url, ...(payload ? { payload } : {}) });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).not.toMatch(/Cannot read|undefined|is not a function|TypeError/);
    });
  }
});

describe('T-72h hold when PayPal errors (not a decline)', () => {
  it('a 5xx/timeout on the T-72h hold becomes HOLD_FAILED with a re-approval link instead of aborting the clock run', async () => {
    const w = await new Workspaces().create('t72');
    const e = w.engine;
    const riley = [...e.bookings.values()].find((b) => b.clientId === 'riley' && b.serviceId === 'art')!;
    expect(riley.state).toBe('VAULTED');
    const gw = e.gateway as { placeHold: typeof e.gateway.placeHold };
    const real = gw.placeHold.bind(e.gateway);
    let failed = 0;
    gw.placeHold = async (req) => {
      if (req.vaultId && req.customId.endsWith(riley.id) && failed === 0) {
        failed++;
        throw new PaymentsError('TIMEOUT', 'no answer from PayPal');
      }
      return real(req);
    };
    const target = riley.start - 72 * 3_600_000 + 60_000;
    await expect(e.clock.advanceTo(target)).resolves.toBeDefined();
    expect(failed).toBe(1);
    expect(e.now()).toBe(target);
    expect(riley.state).toBe('HOLD_FAILED');
    expect(riley.approvalLink).toBeTruthy();
  });
});

describe('model calls are bounded in time', () => {
  it('a model call that never answers rejects after timeoutMs (it runs inside the workspace lock)', async () => {
    const { AnthropicProvider } = await import('../src/ai/anthropic.js');
    let opts: unknown;
    const p = new AnthropicProvider({
      client: {
        messages: {
          create: (_params: unknown, o?: unknown) => {
            opts = o;
            return new Promise(() => undefined);
          },
        },
      } as never,
      timeoutMs: 50,
    } as never);
    await expect(p.run('draft_reply', { clientName: 'Sam', situation: 'ack', facts: {} })).rejects.toThrow(/timed out/);
    expect(opts).toMatchObject({ timeout: 50 });
  });
});

describe('REST capture response without an amount', () => {
  it('a COMPLETED capture whose body omits amount (minimal representation) is still recorded, at the requested amount', async () => {
    const tokenRes = { status: 200, json: async () => ({}), text: async () => JSON.stringify({ access_token: 'T', expires_in: 32400 }) };
    const g = new PayPalRestGateway({
      clientId: 'id',
      clientSecret: 's',
      returnUrl: 'r',
      cancelUrl: 'c',
      now: () => 0,
      fetch: async (url) => (url.endsWith('/v1/oauth2/token') ? tokenRes : { status: 201, json: async () => ({}), text: async () => JSON.stringify({ id: 'CAP9', status: 'COMPLETED', links: [] }) }),
    });
    expect(await g.capture({ requestId: 'r1', authorizationId: 'A1', amountCents: 1500, finalCapture: true })).toEqual({ status: 'COMPLETED', captureId: 'CAP9', amountCents: 1500 });
  });
});

describe('workspace eviction', () => {
  it('drops the evicted workspace\'s lock queue too (no unbounded growth on a busy hosted demo)', async () => {
    const ws = new Workspaces();
    ws.maxWorkspaces = 2;
    for (let i = 0; i < 6; i++) {
      const w = await ws.create();
      await ws.run(w.engine.id, async () => undefined);
    }
    expect(ws.ids().length).toBe(2);
    expect((ws as unknown as { tails: Map<string, unknown> }).tails.size).toBeLessThanOrEqual(2);
  });
});

describe('ledger state words follow the money outcome', () => {
  it('a reversed capture does not read "charged", and a hold voided at PayPal does not read "held"', async () => {
    const { bookingStateLabel } = await import('../../web/src/money.js');
    const base = { state: 'CHARGED', money: 'reversed' };
    expect(bookingStateLabel(base)).toBe('charge reversed');
    expect(bookingStateLabel({ ...base, state: 'HELD', money: 'voided' })).toBe('hold voided at PayPal');
    expect(bookingStateLabel({ ...base, money: 'captured' })).toBe('charged');
    expect(bookingStateLabel({ ...base, money: 'refunded', refundId: 'R1' })).toBe('refunded');
    expect(bookingStateLabel({ state: 'CANCELLED_EARLY', money: 'none', refillOfBookingId: 'bk_1' })).toBe('claim closed (no hold)');
    expect(bookingStateLabel({ state: 'PENDING_REFILL', money: 'pending-refill' })).toBe('pending refill');
  });
});

describe('the model budget matches routes, not raw URL text', () => {
  it('a percent-encoded route path (/%6Dessages) is still limited', async () => {
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws, rateLimit: { perWorkspacePerMin: 0, globalPerMin: 0 } });
    for (const url of ['/api/ws/demo/%6Dessages', '/api/ws/de%6Do/messages', '/api/ws/demo/%61ssistant', '/api/workspace%73']) {
      expect((await app.inject({ method: 'POST', url, payload: { clientId: 'sam', text: 'hi' } })).statusCode, url).toBe(429);
    }
  });
});

describe('event streams are capped per workspace', () => {
  it('opening many SSE streams on one workspace gets 429 past the cap, and a closed stream frees its slot', async () => {
    const http = await import('node:http');
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws, maxStreamsPerWorkspace: 3 });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;
    const all: import('node:http').ClientRequest[] = [];
    const open = () =>
      new Promise<{ status: number; req: import('node:http').ClientRequest }>((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/api/ws/demo/events' }, (res) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0, req });
        });
        req.on('error', reject);
        all.push(req);
      });
    try {
      const streams = [];
      for (let i = 0; i < 5; i++) streams.push(await open());
      expect(streams.map((s) => s.status)).toEqual([200, 200, 200, 429, 429]);
      streams[0].req.destroy();
      await new Promise((r) => setTimeout(r, 100));
      const again = await open();
      expect(again.status).toBe(200);
    } finally {
      for (const r of all) r.destroy();
      await app.close();
    }
  });
});

describe('message history is bounded', () => {
  it('keeps the most recent MAX_MESSAGES texts so the shared demo snapshot cannot grow without bound', async () => {
    const { MAX_MESSAGES } = await import('../src/engine/engine.js');
    const e = (await new Workspaces().create('mx')).engine;
    for (let i = 0; i < MAX_MESSAGES + 50; i++) await e.receiveMessage('sam', `what time is my visit? #${i}`);
    expect(e.messages.length).toBeLessThanOrEqual(MAX_MESSAGES);
    expect(e.messages.at(-1)!.from).toBe('frontdesk');
    expect(e.messages.some((m) => m.text.endsWith(`#${MAX_MESSAGES + 49}`))).toBe(true);
  });
});
