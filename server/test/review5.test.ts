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
