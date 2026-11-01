import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

// Round 2 follow-up (2026-11-02): the open items of review round 2.

async function privateWorkspace() {
  const workspaces = new Workspaces();
  await workspaces.create('demo');
  const app = await buildApp({ workspaces });
  const r = (await app.inject({ method: 'POST', url: '/api/workspaces' })).json() as { id: string; ownerToken: string };
  return { app, workspaces, ...r };
}

describe('the booking link is not the owner capability', () => {
  it('a new workspace answers with a separate unguessable owner token', async () => {
    const { id, ownerToken } = await privateWorkspace();
    expect(ownerToken).toMatch(/^[\w-]{32,}$/);
    expect(ownerToken).not.toContain(id);
  });

  it('owner routes refuse a caller holding only the workspace id (the booking link)', async () => {
    const { app, id } = await privateWorkspace();
    const owner: Array<[string, string, unknown?]> = [
      ['GET', 'state'],
      ['GET', 'audit'],
      ['GET', 'events'],
      ['GET', 'demo'],
      ['GET', 'paypal-requests'],
      ['POST', 'messages', { clientId: 'sam', text: 'hi' }],
      ['POST', 'approvals/x', { choice: 'a' }],
      ['POST', 'bookings', { clientId: 'sam', serviceId: 'gel', start: 1 }],
      ['POST', 'assistant', { text: 'hi' }],
      ['POST', 'bookings/b1/refund'],
      ['POST', 'time', { byMs: 1000 }],
      ['POST', 'mode', { mode: 'autopilot' }],
      ['POST', 'policy/compile', { prose: 'x' }],
      ['POST', 'policy/approve', { rules: {}, prose: 'x' }],
      ['POST', 'reset'],
      ['POST', 'demo/next'],
    ];
    for (const [method, path, payload] of owner) {
      const r = await app.inject({ method: method as 'GET', url: `/api/ws/${id}/${path}`, payload: payload as object });
      expect(r.statusCode, `${method} ${path}`).toBe(403);
    }
    // a wrong token is refused too
    expect((await app.inject({ url: `/api/ws/${id}/state`, headers: { 'x-owner-token': 'nope' } })).statusCode).toBe(403);
  });

  it('the owner token opens the owner routes (header, or query for the event stream)', async () => {
    const { app, id, ownerToken } = await privateWorkspace();
    const h = { 'x-owner-token': ownerToken };
    expect((await app.inject({ url: `/api/ws/${id}/state`, headers: h })).json().workspace).toBe(id);
    expect((await app.inject({ method: 'POST', url: `/api/ws/${id}/mode`, headers: h, payload: { mode: 'autopilot' } })).json().state.mode).toBe('autopilot');
    expect((await app.inject({ method: 'POST', url: `/api/ws/${id}/demo/next`, headers: h })).statusCode).toBe(200);
    // the token of another workspace does not open this one
    const other = (await app.inject({ method: 'POST', url: '/api/workspaces' })).json() as { id: string; ownerToken: string };
    expect((await app.inject({ url: `/api/ws/${id}/state`, headers: { 'x-owner-token': other.ownerToken } })).statusCode).toBe(403);
    // reset keeps the token
    expect((await app.inject({ method: 'POST', url: `/api/ws/${id}/reset`, headers: h })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/ws/${id}/state`, headers: h })).statusCode).toBe(200);
  });

  it('the booking link reaches the client routes without the token, and they leak no owner data', async () => {
    const { app, id } = await privateWorkspace();
    const pub = (await app.inject(`/api/ws/${id}/public`)).json();
    expect(pub.business).toBeTruthy();
    expect(pub.services.length).toBeGreaterThan(0);
    expect(pub.policy.rules.holdCents).toBeGreaterThan(0);
    expect(pub.policy.summary).toBeTruthy();
    for (const k of ['bookings', 'clients', 'messages', 'approvals', 'agentRuns', 'jobs', 'waitlist']) expect(pub).not.toHaveProperty(k);
    const slots = (await app.inject(`/api/ws/${id}/slots?service=gel&n=2`)).json() as number[];
    expect(slots.length).toBe(2);
    const booked = await app.inject({ method: 'POST', url: `/api/ws/${id}/book`, payload: { name: 'Ana New', serviceId: 'gel', start: slots[0] } });
    expect(booked.statusCode).toBe(200);
    const body = booked.json();
    expect(body.result.id).toBeTruthy();
    // the whole-studio snapshot is not handed to a client
    expect(body).not.toHaveProperty('state');
    // buyer approval in the simulator is a client step
    const token = body.result.approvalLink.split('/').at(-1);
    const ap = await app.inject({ method: 'POST', url: `/api/ws/${id}/sim/approve/${token}` });
    expect(ap.statusCode).toBe(200);
    expect(ap.json()).not.toHaveProperty('state');
    expect(['HELD', 'VAULTED']).toContain(ap.json().result.state);
  });

  it('the shared demo workspace stays open (public console) so the guided demo works without a token', async () => {
    const { app } = await privateWorkspace();
    expect((await app.inject('/api/ws/demo/state')).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/ws/demo/demo/next' })).statusCode).toBe(200);
  });
});

describe('evicting or resetting a workspace releases its live holds first', () => {
  const liveAuths = (w: Awaited<ReturnType<Workspaces['create']>>) =>
    [...w.engine.bookings.values()].filter((b) => b.authorizationId && !b.captureId && w.mock!.authorizationStatus(b.authorizationId) === 'CREATED').map((b) => b.authorizationId!);

  it('eviction voids every live authorization at PayPal (simulator)', async () => {
    const reg = new Workspaces();
    reg.maxWorkspaces = 2;
    await reg.create('demo');
    const a = await reg.create();
    const held = liveAuths(a);
    expect(held.length).toBeGreaterThan(0);
    await reg.create();
    expect(reg.get(a.engine.id)).toBeUndefined();
    for (const id of held) expect(a.mock!.authorizationStatus(id)).toBe('VOIDED');
  });

  it('a workspace whose holds PayPal will not release is not evicted', async () => {
    const reg = new Workspaces();
    reg.maxWorkspaces = 2;
    await reg.create('demo');
    const a = await reg.create();
    a.mock!.void = async () => {
      throw new Error('PayPal unavailable');
    };
    await expect(reg.create()).rejects.toThrow(/release/);
    expect(reg.get(a.engine.id)).toBe(a);
  });

  it('reset voids the live holds, and refuses (409) when PayPal will not release them', async () => {
    const reg = new Workspaces();
    await reg.create('demo');
    const app = await buildApp({ workspaces: reg });
    const first = reg.get('demo')!;
    const held = liveAuths(first);
    expect(held.length).toBeGreaterThan(0);
    expect((await app.inject({ method: 'POST', url: '/api/ws/demo/reset' })).statusCode).toBe(200);
    for (const id of held) expect(first.mock!.authorizationStatus(id)).toBe('VOIDED');
    const second = reg.get('demo')!;
    second.mock!.void = async () => {
      throw new Error('PayPal unavailable');
    };
    const r = await app.inject({ method: 'POST', url: '/api/ws/demo/reset' });
    expect(r.statusCode).toBe(409);
    expect(reg.get('demo')).toBe(second);
  });
});

describe('live PayPal toolkit reads time out like the REST adapter (20 s policy)', () => {
  it('a hung PayPal answer is cut off at the timeout, and the request carries axios\'s own timeout', async () => {
    const { PayPalToolkitReader, TOOLKIT_TIMEOUT_MS, toolkitLiveNetworkForTests } = await import('../src/paypal/toolkit.js');
    expect(TOOLKIT_TIMEOUT_MS).toBe(20_000);
    const seen: number[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const restore = toolkitLiveNetworkForTests((config: any) => {
      seen.push(config.timeout);
      return new Promise(() => undefined); // never answers
    }, 50);
    try {
      const r = PayPalToolkitReader.sandbox('offline-client', 'offline-secret');
      const t0 = Date.now();
      const out = await r.call('get_order', { id: 'NOPE' }).then(
        (x) => JSON.stringify(x),
        (e: Error) => e.message,
      );
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(out).toMatch(/timeout|timed out/i);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((t) => t === 50)).toBe(true);
      expect(r.http.some((h) => h.status === 0)).toBe(true);
    } finally {
      restore();
    }
  });
});

describe('the ?ws= value is encoded into API paths (web client)', () => {
  it('a crafted workspace id cannot aim a request at another route', async () => {
    const { Api, wsPath } = await import('../../web/src/api.js');
    const evil = 'demo/bookings/b1/refund?x=#';
    expect(wsPath(evil, '/state')).toBe('/api/ws/demo%2Fbookings%2Fb1%2Frefund%3Fx%3D%23/state');
    const urls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (u: string) => {
      urls.push(u);
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    try {
      const api = new Api(evil);
      await api.state();
      await api.resolve('a/../../x', 'ok');
      await api.refund('b?1');
      await api.audit('b&x=1');
    } finally {
      globalThis.fetch = realFetch;
    }
    const enc = encodeURIComponent(evil);
    expect(urls).toEqual([
      `/api/ws/${enc}/state`,
      `/api/ws/${enc}/approvals/a%2F..%2F..%2Fx`,
      `/api/ws/${enc}/bookings/b%3F1/refund`,
      `/api/ws/${enc}/audit?booking=b%26x%3D1`,
    ]);
  });
});

describe('a refund made in the PayPal dashboard (PAYMENT.CAPTURE.REFUNDED) is recorded', () => {
  async function charged() {
    const { playNextBeat } = await import('../src/demo.js');
    const reg = new Workspaces();
    const w = await reg.create('rf');
    for (let i = 0; i < 20 && ![...w.engine.bookings.values()].some((b) => b.captureId && b.state === 'CHARGED'); i++) await reg.run('rf', () => playNextBeat(w));
    const b = [...w.engine.bookings.values()].find((x) => x.captureId && x.state === 'CHARGED')!;
    expect(b).toBeTruthy();
    const settle = async () => {
      await new Promise((r) => setImmediate(r));
      await reg.run('rf', async () => undefined);
    };
    const view = () => w.engine.snapshot().bookings.find((x) => x.id === b.id)!;
    return { reg, w, b, settle, view };
  }

  it('a partial dashboard refund shows the refunded part; the owner can refund only the rest', async () => {
    const { ledgerAmounts } = await import('../../web/src/money.js');
    const { w, b, settle, view } = await charged();
    const fee = b.capturedCents!;
    await w.mock!.refund(b.captureId!, 500, 'dashboard-1');
    await settle();
    expect(view().money).toBe('part-refunded');
    expect(view().refundedCents).toBe(500);
    expect(ledgerAmounts(view())).toMatchObject({ chargedCents: fee, refundedCents: 500, keptCents: fee - 500 });
    // the owner's refund button refunds the remainder (PayPal would refuse the full amount)
    await w.engine.refund(b.id);
    await settle();
    expect(view().money).toBe('refunded');
    expect(view().refundedCents).toBe(fee);
    expect(w.mock!.readView().captures.find((c) => c.id === b.captureId)!.refundedCents).toBe(fee);
    expect(ledgerAmounts(view())).toMatchObject({ refundedCents: fee, keptCents: 0 });
  });

  it('a full dashboard refund marks the booking refunded and the refund button is refused', async () => {
    const { w, b, settle, view } = await charged();
    await w.mock!.refund(b.captureId!, b.capturedCents!, 'dashboard-full');
    await settle();
    expect(view().money).toBe('refunded');
    await expect(w.engine.refund(b.id)).rejects.toThrow(/already refunded/);
  });

  it('our own refund is not counted twice when its webhook arrives', async () => {
    const { w, b, settle, view } = await charged();
    await w.engine.refund(b.id);
    await settle();
    expect(view().refundedCents).toBe(b.capturedCents);
  });

  it('a real refund resource without custom_id is routed by its "up" link to the capture', async () => {
    const { reg, b, view } = await charged();
    const r = await reg.routeWebhook({
      id: 'WH-dash-refund-1',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      create_time: new Date().toISOString(),
      resource: {
        id: '1JU08902781691411',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '3.00' },
        links: [
          { rel: 'self', href: 'https://api.sandbox.paypal.com/v2/payments/refunds/1JU08902781691411' },
          { rel: 'up', href: `https://api.sandbox.paypal.com/v2/payments/captures/${b.captureId}` },
        ],
      },
    });
    expect(r).toBe('processed');
    expect(view().refundedCents).toBe(300);
    expect(view().money).toBe('part-refunded');
  });
});

describe('a PENDING authorization (under review at PayPal) is not a hold yet', () => {
  const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);

  it('the REST adapter reports PENDING, not AUTHORIZED', async () => {
    const { PayPalRestGateway } = await import('../src/paypal/rest.js');
    const tokenRes = { status: 200, json: async () => ({}), text: async () => JSON.stringify({ access_token: 'T', expires_in: 32400 }) };
    const order = {
      id: 'ORDER1',
      status: 'COMPLETED',
      purchase_units: [{ payments: { authorizations: [{ id: 'AUTHP', status: 'PENDING', status_details: { reason: 'PENDING_REVIEW' }, amount: { currency_code: 'USD', value: '20.00' } }] } }],
    };
    const g = new PayPalRestGateway({
      clientId: 'id',
      clientSecret: 's',
      returnUrl: 'r',
      cancelUrl: 'c',
      now: () => 0,
      fetch: async (url) => (url.endsWith('/v1/oauth2/token') ? tokenRes : { status: 201, json: async () => ({}), text: async () => JSON.stringify(order) }),
    });
    expect(await g.authorizeApprovedOrder('ORDER1', 'rq1')).toEqual({ status: 'PENDING', orderId: 'ORDER1', authorizationId: 'AUTHP', reason: 'PENDING_REVIEW' });
  });

  it('no held money and no charge card until PayPal confirms the authorization (CREATED)', async () => {
    const w = await new Workspaces().create('pend');
    const e = w.engine;
    let n = 0;
    w.mock!.placeHold = async () => ({ status: 'PENDING', orderId: `OP${++n}`, authorizationId: `AUTHPENDING${n}`, reason: 'PENDING_REVIEW' }) as never;
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(3, 18) });
    const view = () => e.snapshot().bookings.find((x) => x.id === b.id)!;
    expect(b.state).not.toBe('HELD');
    expect(b.authorizationId).toBeUndefined();
    expect(view().money).not.toBe('held');
    // the PENDING authorization's own CREATED webhook (status still PENDING) does not attach it
    await e.ingestWebhook({ id: 'WH-p1', event_type: 'PAYMENT.AUTHORIZATION.CREATED', create_time: '', resource: { id: 'AUTHPENDING1', status: 'PENDING', custom_id: e.customIdFor(b.id) } });
    expect(b.authorizationId).toBeUndefined();
    // no-show: no charge card (nothing is held)
    await e.clock.advanceTo(at(3, 18, 10));
    const att = e.openApprovals().find((a) => a.bookingId === b.id && a.kind === 'attendance');
    if (att) await e.resolveApproval(att.id, 'no_show');
    expect(e.openApprovals().some((a) => a.bookingId === b.id && a.kind === 'capture')).toBe(false);
  });

  it('once PayPal reports the authorization CREATED, it becomes the hold', async () => {
    const w = await new Workspaces().create('pend2');
    const e = w.engine;
    w.mock!.placeHold = async () => ({ status: 'PENDING', orderId: 'OP1', authorizationId: 'AUTHPENDING1', reason: 'PENDING_REVIEW' }) as never;
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(3, 18) });
    expect(b.pendingAuthorizationId).toBe('AUTHPENDING1');
    await e.ingestWebhook({ id: 'WH-c1', event_type: 'PAYMENT.AUTHORIZATION.CREATED', create_time: '', resource: { id: 'AUTHPENDING1', status: 'CREATED', custom_id: e.customIdFor(b.id) } });
    expect(b.authorizationId).toBe('AUTHPENDING1');
    expect(b.state).toBe('HELD');
    expect(b.pendingAuthorizationId).toBeUndefined();
  });
});

describe('audit retention', () => {
  it('keeps the most recent `max` entries; seq stays monotonic and per-booking reads use what is kept', async () => {
    const { AuditLog, DEFAULT_AUDIT_MAX } = await import('../src/audit.js');
    expect(DEFAULT_AUDIT_MAX).toBeGreaterThan(0);
    const log = new AuditLog(() => 0, { max: 3 });
    for (let i = 1; i <= 5; i++) log.add('engine', `e${i}`, { bookingId: i % 2 ? 'odd' : 'even' });
    expect(log.all().map((e) => e.summary)).toEqual(['e3', 'e4', 'e5']);
    expect(log.all().map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(log.forBooking('odd').map((e) => e.summary)).toEqual(['e3', 'e5']);
    expect(log.dropped).toBe(2);
  });

  it('the limit is configurable per server (AUDIT_MAX_ENTRIES) and reaches each workspace', async () => {
    const { configFromEnv } = await import('../src/config.js');
    expect(configFromEnv({ AUDIT_MAX_ENTRIES: '150' }).deps.auditMax).toBe(150);
    expect(() => configFromEnv({ AUDIT_MAX_ENTRIES: 'lots' })).toThrow(/AUDIT_MAX_ENTRIES/);
    const w = await new Workspaces({ auditMax: 50 }).create('au');
    for (let i = 0; i < 200; i++) w.engine.audit.add('system', `x${i}`);
    expect(w.engine.audit.all()).toHaveLength(50);
    expect(w.engine.audit.all().at(-1)!.summary).toBe('x199');
  });
});
