import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { DEMO_BEATS } from '../src/demo.js';
import { Workspaces } from '../src/workspaces.js';

// End-to-end: a real Fastify server on a real socket, driven with fetch, PayPal simulator underneath.
// Each test gets its own visitor workspace, the way a judge's browser would.
let app: FastifyInstance;
let base: string;
let ws: string;
let owner: string;
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);

beforeAll(async () => {
  app = await buildApp({ workspaces: new Workspaces() });
  await app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => app.close());
beforeEach(async () => {
  const created = await (await fetch(`${base}/api/workspaces`, { method: 'POST' })).json();
  ws = created.id;
  owner = created.ownerToken;
});

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${base}${path.startsWith('/') ? path : `/api/ws/${ws}/${path}`}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'x-owner-token': owner },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${j.error}`);
  return j;
}
const get = (p: string) => call('GET', p);
const post = (p: string, b: unknown = {}) => call('POST', p, b);
const booking = (s: any, client: string) => s.bookings.find((b: any) => b.clientId === client && !b.refillOfBookingId);
const lastTo = (s: any, client: string) => s.messages.filter((m: any) => m.clientId === client && m.from === 'frontdesk').at(-1)?.text ?? '';
const cardFor = (s: any, bookingId: string, kind: string) => s.approvals.find((a: any) => a.bookingId === bookingId && a.kind === kind);
const auditFor = async (id: string) => (await get(`audit?booking=${id}`)) as Array<{ kind: string; summary: string }>;

describe('e2e over HTTP: hero flows on the PayPal simulator', () => {
  it('hero 1: sick-child excuse → owner card → one tap voids the authorization', async () => {
    await post('time', { to: at(4, 9) });
    const m = await post('messages', { clientId: 'sam', text: "so sorry, kiddo threw up all night, can't make it today" });
    expect(m.result.decision.outcome).toBe('EXCUSE');
    const sam = booking(m.state, 'sam');
    expect(sam.money).toBe('held');
    const card = cardFor(m.state, sam.id, 'review');
    expect(card.suggested).toBe('excuse');
    const r = await post(`approvals/${card.id}`, { choice: 'excuse' });
    const after = booking(r.state, 'sam');
    expect(after.state).toBe('EXCUSED');
    expect(after.money).toBe('voided');
    expect(after.captureId).toBeUndefined();
    expect(lastTo(r.state, 'sam')).toContain('No charge');
    expect((await auditFor(sam.id)).some((a) => a.kind === 'paypal' && a.summary.startsWith(`void authorization ${sam.authorizationId}`))).toBe(true);
    // Sam picks a rebook option by replying "2": a new booking with its own hold
    const rb = await post('messages', { clientId: 'sam', text: '2' });
    const fresh = rb.state.bookings.find((b: any) => b.id === rb.result.rebooked);
    expect(fresh.clientId).toBe('sam');
    expect(['held', 'vaulted']).toContain(fresh.money);
  });

  it('hero 2 + failure 2: late cancel, first claimer declines, next claimer refills, canceller pays $0', async () => {
    await post('time', { to: at(5, 9) });
    const m = await post('messages', { clientId: 'maya', text: "I can't make it today, something came up" });
    const maya = booking(m.state, 'maya');
    expect(maya.state).toBe('PENDING_REFILL');
    expect(maya.money).toBe('pending-refill');
    expect(m.state.offers[0].offeredTo).toEqual(['eli', 'chris', 'dana']);

    const eli = await post('messages', { clientId: 'eli', text: 'YES' });
    expect(eli.result.claimed).toBe(true);
    expect(eli.state.offers[0].failed).toEqual(['eli']);
    expect(booking(eli.state, 'maya').state).toBe('PENDING_REFILL');
    expect(lastTo(eli.state, 'eli')).toContain("couldn't place the hold");

    const chris = await post('messages', { clientId: 'chris', text: 'yes!' });
    const after = booking(chris.state, 'maya');
    expect(after.state).toBe('REFILLED');
    expect(after.money).toBe('voided');
    expect(after.captureId).toBeUndefined();
    const refill = chris.state.bookings.find((b: any) => b.refillOfBookingId === maya.id && b.clientId === 'chris');
    expect(refill.state).toBe('HELD');
    expect(lastTo(chris.state, 'maya')).toContain('$0');
    const late = await post('messages', { clientId: 'dana', text: 'yes' });
    expect(late.result.claimed).toBe(false);
    expect(chris.state.approvals.some((a: any) => a.bookingId === maya.id)).toBe(false);
  });

  it('hero 3: no-show → attendance card → capture card → charge, then refund', async () => {
    await post('time', { to: at(5, 11, 10) });
    let s = await get('state');
    const alex = booking(s, 'alex');
    const att = cardFor(s, alex.id, 'attendance');
    expect(att.options).toEqual(['arrived', 'no_show']);
    s = (await post(`approvals/${att.id}`, { choice: 'no_show' })).state;
    const cap = cardFor(s, alex.id, 'capture');
    expect(cap.feeCents).toBe(2000);
    expect(booking(s, 'alex').captureId).toBeUndefined(); // nothing charged before the tap
    s = (await post(`approvals/${cap.id}`, { choice: 'charge' })).state;
    const charged = booking(s, 'alex');
    expect(charged.state).toBe('CHARGED');
    expect(charged.money).toBe('captured');
    expect(charged.capturedCents).toBe(2000);
    s = (await post(`bookings/${alex.id}/refund`)).state;
    expect(booking(s, 'alex').money).toBe('refunded');
    await expect(post(`bookings/${alex.id}/refund`)).rejects.toThrow('already refunded');
    const audit = await auditFor(alex.id);
    expect(audit.some((a) => /capture \$20\.00 \(final_capture\) → COMPLETED/.test(a.summary))).toBe(true);
    expect(audit.some((a) => /^refund /.test(a.summary))).toBe(true);
  });

  it('failure 1: T-72h hold declines, client approves the re-approval link through the simulator page', async () => {
    await post('time', { to: at(3, 14) });
    let s = await get('state');
    const jordan = booking(s, 'jordan');
    expect(jordan.money).toBe('failed');
    const token = jordan.approvalLink.split('/').at(-1);
    const page = await fetch(`${base}${jordan.approvalLink}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Sandbox simulator: no real money');
    await post(`sim/approve/${token}`);
    s = await get('state');
    expect(booking(s, 'jordan').money).toBe('held');
  });

  it('booking page: new client books a free slot and approves the hold', async () => {
    await post('time', { to: at(4, 9) });
    const slots: number[] = await get('slots?service=gel&n=3');
    expect(slots.length).toBe(3);
    const b = await post('book', { name: 'Judge Test', serviceId: 'gel', start: slots[0] });
    expect(b.result.approvalLink).toBeTruthy();
    const token = b.result.approvalLink.split('/').at(-1);
    const r = await post(`sim/approve/${token}`);
    expect(['HELD', 'VAULTED']).toContain(r.result.state);
    await expect(post('book', { name: 'Second', serviceId: 'gel', start: slots[0] })).rejects.toThrow('no longer free');
  });

  it('server-sent events announce changes', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/ws/${ws}/events?owner=${encodeURIComponent(owner)}`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const seen: string[] = [];
    const reading = (async () => {
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        seen.push(dec.decode(value));
        if (seen.join('').includes('event: change')) break;
      }
    })();
    await post('time', { to: at(3, 14) });
    await Promise.race([reading, new Promise((r) => setTimeout(r, 2000))]);
    ctrl.abort();
    expect(seen.join('')).toContain('event: change');
  });
});

describe('e2e over HTTP: guided demo', () => {
  it('plays every beat in order and ends in the expected money states', async () => {
    const st = await get('demo');
    expect(st.total).toBe(DEMO_BEATS.length);
    expect(st.step).toBe(0);
    let last: any;
    for (let i = 0; i < st.total; i++) last = await post('demo/next');
    expect(last.result.step).toBe(st.total);
    const s = last.state;
    expect(booking(s, 'jordan').money).toBe('held');
    expect(booking(s, 'sam').money).toBe('voided');
    expect(booking(s, 'maya').state).toBe('REFILLED');
    const taylorThu = s.bookings.find((b: any) => b.clientId === 'taylor' && b.start === at(5, 14));
    expect(taylorThu.money).toBe('held'); // prompt injection moved nothing
    expect(last.result.bookingIds.taylor).toBe(taylorThu.id);
    expect(booking(s, 'alex').money).toBe('refunded');
    expect(s.bookings.filter((b: any) => b.money === 'captured')).toHaveLength(0);
    expect(s.approvals).toHaveLength(0);
    expect(s.unreleasedAuths).toHaveLength(0);
    await expect(post('demo/next')).rejects.toThrow('demo finished');
    // reset replays from the top
    await post('reset');
    expect((await get('demo')).step).toBe(0);
  });

  it('refuses to continue if the workspace was driven off-script, without moving money', async () => {
    await post('demo/next');
    await post('demo/next');
    await post('time', { to: at(4, 9) });
    await post('messages', { clientId: 'sam', text: "kiddo threw up, can't make it" });
    const card = (await get('state')).approvals.find((a: any) => a.kind === 'review');
    await post(`approvals/${card.id}`, { choice: 'excuse' });
    await post('demo/next'); // jordan beat still fine
    await post('demo/next');
    await post('demo/next'); // sam texts again: no active booking, polite reply
    const before = (await get('state')).bookings.map((b: any) => [b.id, b.money, b.captureId]);
    await expect(post('demo/next')).rejects.toThrow('off-script');
    const after = (await get('state')).bookings.map((b: any) => [b.id, b.money, b.captureId]);
    expect(after).toEqual(before);
    expect(after.some(([, , cap]: any[]) => cap)).toBe(false);
  });

  it("never taps 'arrived' on a booking it did not seed (e.g. a judge's own booking)", async () => {
    const slots: number[] = await get('slots?service=pedi&n=1');
    const b = await post('book', { name: 'Judge Visit', serviceId: 'pedi', start: slots[0] }); // Tue 3 Nov, within 72h
    const token = b.result.approvalLink.split('/').at(-1);
    await post(`sim/approve/${token}`);
    for (let i = 0; i < 7; i++) await post('demo/next'); // past Thu 9 AM
    const s = await get('state');
    const judge = s.bookings.find((x: any) => x.id === b.result.id);
    // left for a real owner tap: unanswered by end of day it becomes NEEDS_REVIEW, still held, nothing released or charged
    expect(judge.state).toBe('NEEDS_REVIEW');
    expect(judge.money).toBe('held');
    expect(judge.captureId).toBeUndefined();
  });
});
