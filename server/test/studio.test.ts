import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

let app: FastifyInstance;
beforeEach(async () => {
  const ws = new Workspaces();
  await ws.create('demo');
  app = await buildApp({ workspaces: ws });
});
afterEach(async () => app.close());

const create = (payload?: object) =>
  app.inject({ method: 'POST', url: '/api/workspaces', ...(payload ? { payload } : {}) });

describe('create your studio', () => {
  it('a new workspace takes the studio and owner names and shows them everywhere', async () => {
    const r = (await create({ business: '  Glow Nail Bar  ', owner: 'Asha' })).json();
    const auth = { 'x-owner-token': r.ownerToken, authorization: `Bearer ${r.ownerToken}` };
    const pub = (await app.inject({ url: `/api/ws/${r.id}/public` })).json();
    expect(pub.business).toBe('Glow Nail Bar');
    expect(pub.owner).toBe('Asha');
    void auth;
  });

  it('no body still works and keeps the default names', async () => {
    const r = (await create()).json();
    const pub = (await app.inject({ url: `/api/ws/${r.id}/public` })).json();
    expect(pub.business).toBe('Polished by Priya');
    expect(pub.owner).toBe('Priya');
  });

  it('blank, over-long or non-string names fall back or are trimmed', async () => {
    const r = (await create({ business: '   ', owner: 42 })).json();
    const pub = (await app.inject({ url: `/api/ws/${r.id}/public` })).json();
    expect(pub.business).toBe('Polished by Priya');
    expect(pub.owner).toBe('Priya');
    const long = (await create({ business: 'x'.repeat(200), owner: 'y'.repeat(200) })).json();
    const p2 = (await app.inject({ url: `/api/ws/${long.id}/public` })).json();
    expect(p2.business.length).toBeLessThanOrEqual(60);
    expect(p2.owner.length).toBeLessThanOrEqual(40);
  });

  it('a reset keeps the studio names', async () => {
    const r = (await create({ business: 'Glow Nail Bar', owner: 'Asha' })).json();
    const res = await app.inject({ method: 'POST', url: `/api/ws/${r.id}/reset`, headers: { 'x-owner-token': r.ownerToken, authorization: `Bearer ${r.ownerToken}` } });
    expect(res.statusCode).toBe(200);
    const pub = (await app.inject({ url: `/api/ws/${r.id}/public` })).json();
    expect(pub.business).toBe('Glow Nail Bar');
  });
});
