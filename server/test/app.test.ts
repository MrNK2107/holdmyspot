import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';
import { configFromEnv } from '../src/config.js';

let app: FastifyInstance;
const at = (day: number, hour: number) => Date.UTC(2026, 10, day, hour);

beforeEach(async () => {
  const ws = new Workspaces();
  await ws.create('demo');
  app = await buildApp({ workspaces: ws });
});
afterEach(async () => app.close());

const post = (url: string, payload: unknown = {}) => app.inject({ method: 'POST', url, payload: payload as object });

describe('HTTP API', () => {
  it('health and state', async () => {
    expect((await app.inject('/api/health')).json()).toEqual({ ok: true, workspaces: 1 });
    const s = (await app.inject('/api/ws/demo/state')).json();
    expect(s.bookings).toHaveLength(12);
    expect(s.paymentsMode).toBe('mock');
    expect(s.bookings[0]).toHaveProperty('money');
    expect((await app.inject('/api/ws/nope/state')).statusCode).toBe(404);
  });

  it('creates isolated per-visitor workspaces', async () => {
    const { id } = (await post('/api/workspaces')).json();
    expect(id).toMatch(/^ws\d+/);
    expect((await app.inject(`/api/ws/${id}/state`)).json().workspace).toBe(id);
  });

  it('time travel + message + approval drives hero 1 end to end', async () => {
    await post('/api/ws/demo/time', { to: at(4, 9) });
    const m = (await post('/api/ws/demo/messages', { clientId: 'sam', text: "kiddo threw up, can't make it" })).json();
    expect(m.result.decision.outcome).toBe('EXCUSE');
    const card = m.state.approvals.find((a: any) => a.kind === 'review');
    const r = (await post(`/api/ws/demo/approvals/${card.id}`, { choice: 'excuse' })).json();
    expect(r.result.state).toBe('EXCUSED');
    const sam = r.state.bookings.find((b: any) => b.clientId === 'sam');
    expect(sam.money).toBe('voided');
    const audit = (await app.inject(`/api/ws/demo/audit?booking=${sam.id}`)).json();
    expect(audit.some((a: any) => a.kind === 'paypal' && a.summary.startsWith('void'))).toBe(true);
  });

  it('bad input returns 400 with state, not a crash', async () => {
    const r = await post('/api/ws/demo/approvals/ap_999', { choice: 'charge' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain('unknown approval');
    expect((await post('/api/ws/demo/time', { to: 0 })).statusCode).toBe(400);
  });

  it('policy compile returns rules + questions; approve bumps the version', async () => {
    const c = (await post('/api/ws/demo/policy/compile', { prose: '48 hours notice or $30. Emergencies are fine.' })).json();
    expect(c.result.rules.freeCancelHours).toBe(48);
    expect(c.result.ambiguities.length).toBeGreaterThan(0);
    const a = (await post('/api/ws/demo/policy/approve', { rules: c.result.rules, prose: 'x' })).json();
    expect(a.result.version).toBe(2);
  });

  it('simulator approval page and endpoint complete a vault setup (wallet saved, no hold yet)', async () => {
    const s = (await app.inject('/api/ws/demo/state')).json();
    const ben = s.bookings.find((b: any) => b.clientId === 'ben');
    const page = await app.inject(ben.approvalLink);
    expect(page.body).toContain('Approve with PayPal');
    const token = ben.approvalLink.split('/').at(-1);
    const r = (await post(`/api/ws/demo/sim/approve/${token}`)).json();
    expect(r.result.state).toBe('VAULTED');
  });

  it('webhook endpoint refuses events without a verifier, or with a bad signature', async () => {
    const ev = { id: 'WH-9', event_type: 'PAYMENT.AUTHORIZATION.CREATED', create_time: '', resource: { id: 'FAKE', custom_id: 'demo:bk_1' } };
    expect((await post('/api/paypal/webhook', ev)).statusCode).toBe(403);
    const ws = new Workspaces();
    await ws.create('demo');
    const strict = await buildApp({ workspaces: ws, webhookVerifier: async () => false });
    expect((await strict.inject({ method: 'POST', url: '/api/paypal/webhook', payload: ev })).statusCode).toBe(401);
    await strict.close();
  });

  it('webhook endpoint routes by custom_id and dedupes', async () => {
    await app.close();
    const reg = new Workspaces();
    await reg.create('demo');
    app = await buildApp({ workspaces: reg, webhookVerifier: async () => true });
    const ev = { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', create_time: '', resource: { id: 'C1', custom_id: 'demo:bk_1' } };
    expect((await post('/api/paypal/webhook', ev)).json()).toEqual({ result: 'processed' });
    expect((await post('/api/paypal/webhook', ev)).json()).toEqual({ result: 'duplicate' });
    expect((await post('/api/paypal/webhook', { ...ev, id: 'WH-2', resource: { id: 'x', custom_id: 'other:bk_1' } })).json()).toEqual({
      result: 'unknown_workspace',
    });
  });
});

describe('config', () => {
  it('defaults to mock + fake, refuses sandbox without keys', () => {
    expect(configFromEnv({}).paymentsMode).toBe('mock');
    expect(() => configFromEnv({ PAYMENTS: 'sandbox' })).toThrow('PAYPAL_CLIENT_ID');
    expect(configFromEnv({ PAYMENTS: 'sandbox', PAYPAL_CLIENT_ID: 'a', PAYPAL_CLIENT_SECRET: 'b' }).deps.gateway?.mode).toBe('sandbox');
  });
});

describe('public booking page API', () => {
  it('lists free slots and books a new client who then approves the PayPal hold', async () => {
    const slots = (await app.inject('/api/ws/demo/slots?service=gel')).json();
    expect(slots.length).toBeGreaterThan(0);
    const r = (await post('/api/ws/demo/book', { name: 'Zoe Q', serviceId: 'gel', start: slots[0] })).json();
    expect(r.result.state).toBe('BOOKED');
    expect(r.result.approvalLink).toContain('/paypal/approve/');
    const a = (await post(`/api/ws/demo/sim/approve/${r.result.orderId}`)).json();
    expect(a.result.state).toBe('HELD');
    expect((await post('/api/ws/demo/book', { name: 'Late', serviceId: 'gel', start: slots[0] })).statusCode).toBe(400);
  });
});
