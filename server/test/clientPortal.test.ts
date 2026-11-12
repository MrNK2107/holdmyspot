import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

let app: FastifyInstance;
let ws: Workspaces;
beforeEach(async () => {
  ws = new Workspaces();
  await ws.create('demo');
  app = await buildApp({ workspaces: ws });
});
afterEach(async () => app.close());

const book = async (name: string, start?: number) => {
  const slots: number[] = (await app.inject('/api/ws/demo/slots?service=gel&n=8')).json();
  const r = (await app.inject({ method: 'POST', url: '/api/ws/demo/book', payload: { name, serviceId: 'gel', start: start ?? slots[0] } })).json();
  return r.result as { id: string; clientToken: string };
};

describe("a client's private link", () => {
  it('the booking hands back a token, and the link shows only that client their own visits', async () => {
    const a = await book('Jordan Lee');
    const slots: number[] = (await app.inject('/api/ws/demo/slots?service=gel&n=8')).json();
    const b = await book('Alex Morgan', slots[3]);
    expect(a.clientToken).toBeTruthy();
    expect(a.clientToken).not.toBe(b.clientToken);
    const mine = (await app.inject(`/api/ws/demo/me/${a.clientToken}`)).json();
    expect(mine.name).toBe('Jordan Lee');
    expect(mine.bookings.map((x: { id: string }) => x.id)).toEqual([a.id]);
    expect(JSON.stringify(mine)).not.toContain('Alex');
    expect(JSON.stringify(mine)).not.toContain(b.clientToken);
  });

  it('a wrong or malformed token is a plain 404 and reveals nothing', async () => {
    await book('Jordan Lee');
    for (const t of ['nope', 'x'.repeat(30), '..%2f..%2fstate']) {
      const r = await app.inject(`/api/ws/demo/me/${t}`);
      expect(r.statusCode).toBe(404);
    }
  });

  it('the client can message the studio; it reaches the owner and the reply lands in the same thread', async () => {
    const a = await book('Jordan Lee');
    const r = await app.inject({ method: 'POST', url: `/api/ws/demo/me/${a.clientToken}/messages`, payload: { text: "so sorry, kiddo threw up all night, can't make it" } });
    expect(r.statusCode).toBe(200);
    const thread = r.json().result.messages as Array<{ from: string; text: string }>;
    expect(thread[0]).toMatchObject({ from: 'client' });
    expect(thread.some((m) => m.from === 'frontdesk')).toBe(true);
    // the owner sees the same message in the console state
    const state = (await app.inject('/api/ws/demo/state')).json();
    expect(state.messages.some((m: { text: string }) => m.text.includes('kiddo'))).toBe(true);
  });

  it('empty and oversized messages are handled, and the token never appears in the owner state', async () => {
    const a = await book('Jordan Lee');
    const empty = await app.inject({ method: 'POST', url: `/api/ws/demo/me/${a.clientToken}/messages`, payload: { text: '   ' } });
    expect(empty.statusCode).toBe(400);
    const long = await app.inject({ method: 'POST', url: `/api/ws/demo/me/${a.clientToken}/messages`, payload: { text: 'a'.repeat(5000) } });
    expect(long.statusCode).toBe(200);
    const sent = long.json().result.messages.find((m: { from: string }) => m.from === 'client');
    expect(sent.text.length).toBe(500);
    expect(JSON.stringify((await app.inject('/api/ws/demo/state')).json())).not.toContain(a.clientToken);
  });

  it('a private studio does not need the owner token for a client link, but still guards the console', async () => {
    const r = (await app.inject({ method: 'POST', url: '/api/workspaces', payload: { business: 'Glow', owner: 'Asha' } })).json();
    await ws.get(r.id)!.engine.addServiceChecked({ name: 'Cut', durationMin: 60, priceCents: 3000 });
    const slots: number[] = (await app.inject(`/api/ws/${r.id}/slots?service=cut&n=3`)).json();
    const b = (await app.inject({ method: 'POST', url: `/api/ws/${r.id}/book`, payload: { name: 'Sam Rivera', serviceId: 'cut', start: slots[0] } })).json().result;
    expect((await app.inject(`/api/ws/${r.id}/me/${b.clientToken}`)).statusCode).toBe(200);
    expect((await app.inject(`/api/ws/${r.id}/state`)).statusCode).toBe(403);
  });
});

describe('with no AI configured (real payments, no key)', () => {
  it('a client text is handled honestly: a plain reply, and it waits for the owner', async () => {
    const { NoAiProvider } = await import('../src/ai/noai.js');
    const w2 = new Workspaces({ llm: () => new NoAiProvider() });
    await w2.create('demo');
    const a2 = await buildApp({ workspaces: w2 });
    try {
      const slots: number[] = (await a2.inject('/api/ws/demo/slots?service=gel&n=8')).json();
      const b = (await a2.inject({ method: 'POST', url: '/api/ws/demo/book', payload: { name: 'Jordan Lee', serviceId: 'gel', start: slots[0] } })).json().result;
      const r = await a2.inject({ method: 'POST', url: `/api/ws/demo/me/${b.clientToken}/messages`, payload: { text: "can't make it, kid is sick" } });
      expect(r.json().error).toBeUndefined();
      expect(r.statusCode).toBe(200);
      const thread = r.json().result.messages as Array<{ from: string; text: string }>;
      expect(thread.map((m) => m.from)).toContain('client');
      expect(thread.some((m) => m.from === 'frontdesk')).toBe(true);
      const state = (await a2.inject('/api/ws/demo/state')).json();
      expect(state.aiProvider).toBe('none');
      // nothing is decided on a guess: no outcome, no money; the owner reads it in the inbox
      expect(state.messages.some((m: { from: string; text: string }) => m.from === 'client' && m.text.includes('kid is sick'))).toBe(true);
      expect(state.bookings[0].money).toBe('held'); // untouched: still just a hold
    } finally {
      await a2.close();
    }
  });
});
