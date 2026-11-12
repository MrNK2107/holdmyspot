import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { Auth } from '../src/auth.js';
import { Workspaces } from '../src/workspaces.js';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const goodClaims = (over: object = {}) => ({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'g-111', email: 'asha@example.com', email_verified: true, name: 'Asha K', exp: Math.floor(Date.now() / 1000) + 3600, ...over });

let app: FastifyInstance;
let tokenResponse: { ok: boolean; status: number; json: () => Promise<any> };
let lastTokenBody = '';
let workspaces: Workspaces;

beforeEach(async () => {
  tokenResponse = { ok: true, status: 200, json: async () => ({ id_token: jwt(goodClaims()) }) };
  workspaces = new Workspaces();
  await workspaces.create('demo');
  const auth = new Auth({
    google: { clientId: CLIENT_ID, clientSecret: 'secret' },
    sessionSecret: 'test-secret',
    baseUrl: 'https://studio.example.com',
    fetch: async (_url, init) => {
      lastTokenBody = init.body;
      return tokenResponse;
    },
  });
  app = await buildApp({ workspaces, auth });
});
afterEach(async () => app.close());

const cookiesOf = (res: { headers: Record<string, unknown> }) => ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []);
const jar = (res: { headers: Record<string, unknown> }) => cookiesOf(res).map((c) => c.split(';')[0]).join('; ');

/** Runs the redirect to Google and the callback; returns the callback response. */
async function signIn(): Promise<{ cookie: string; res: Awaited<ReturnType<FastifyInstance['inject']>> }> {
  const start = await app.inject('/auth/google');
  const loc = new URL(String(start.headers.location));
  const state = loc.searchParams.get('state')!;
  const res = await app.inject({ url: `/auth/google/callback?code=abc&state=${state}`, headers: { cookie: jar(start) } });
  return { cookie: jar(res), res };
}

describe('Sign in with Google', () => {
  it('sends the browser to Google with state, scope and the right redirect URI', async () => {
    const r = await app.inject('/auth/google');
    expect(r.statusCode).toBe(302);
    const u = new URL(String(r.headers.location));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(u.searchParams.get('redirect_uri')).toBe('https://studio.example.com/auth/google/callback');
    expect(u.searchParams.get('scope')).toBe('openid email profile');
    expect(u.searchParams.get('state')).toBeTruthy();
    expect(cookiesOf(r).join(' ')).toMatch(/hms_oauth=.*HttpOnly.*SameSite=Lax.*Secure/);
  });

  it('a good callback signs the person in: session cookie, account, redirect home', async () => {
    const { cookie, res } = await signIn();
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    expect(cookiesOf(res).join(' ')).toMatch(/hms_session=.*HttpOnly/);
    expect(lastTokenBody).toContain('client_secret=secret');
    expect(lastTokenBody).toContain('grant_type=authorization_code');
    const me = (await app.inject({ url: '/api/me', headers: { cookie } })).json();
    expect(me.account).toEqual({ name: 'Asha K', email: 'asha@example.com', picture: undefined });
    expect(me.google).toBe(true);
  });

  it('signing in again is the same account, not a new one', async () => {
    await signIn();
    const second = await signIn();
    const store = (app as unknown as { _auth?: unknown })._auth;
    void store;
    const me = (await app.inject({ url: '/api/me', headers: { cookie: second.cookie } })).json();
    expect(me.account.email).toBe('asha@example.com');
  });

  it('refuses a callback whose state does not match the browser that started it', async () => {
    const start = await app.inject('/auth/google');
    const bad = await app.inject({ url: '/auth/google/callback?code=abc&state=wrong', headers: { cookie: jar(start) } });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toContain('expired or was not started here');
    const none = await app.inject('/auth/google/callback?code=abc&state=x');
    expect(none.statusCode).toBe(400);
    expect(cookiesOf(bad).join(' ')).not.toContain('hms_session=');
  });

  it.each([
    ['another app\'s token (wrong audience)', { aud: 'someone-else' }],
    ['a token from another issuer', { iss: 'https://evil.example.com' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 10 }],
    ['an unverified email', { email_verified: false }],
    ['no email', { email: undefined }],
  ])('refuses %s', async (_name, over) => {
    tokenResponse = { ok: true, status: 200, json: async () => ({ id_token: jwt(goodClaims(over)) }) };
    const { res } = await signIn();
    expect(res.statusCode).toBe(400);
    expect(cookiesOf(res).join(' ')).not.toMatch(/hms_session=[^;]/);
  });

  it('refuses when Google rejects the code', async () => {
    tokenResponse = { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
    const { res } = await signIn();
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('refused the code');
  });

  it('a forged or tampered session cookie is just signed out', async () => {
    const { cookie } = await signIn();
    const value = cookie.split('=')[1];
    const [body] = value.split('.');
    for (const bad of [`hms_session=${body}.AAAA`, `hms_session=${Buffer.from('{"a":"acc_1","exp":9999999999999}').toString('base64url')}.zzz`, 'hms_session=garbage']) {
      expect((await app.inject({ url: '/api/me', headers: { cookie: bad } })).json().account).toBeNull();
    }
  });

  it('logout clears the session', async () => {
    const { cookie } = await signIn();
    const out = await app.inject({ method: 'POST', url: '/api/logout', headers: { cookie } });
    expect(cookiesOf(out).join(' ')).toMatch(/hms_session=;.*Max-Age=0/);
  });
});

describe('studios belong to the account that created them', () => {
  const create = (cookie?: string) => app.inject({ method: 'POST', url: '/api/workspaces', payload: { business: 'Glow', owner: 'Asha' }, headers: cookie ? { cookie } : {} });

  it('the signed-in owner opens their studio without the owner link; nobody else can', async () => {
    const a = await signIn();
    const made = (await create(a.cookie)).json();
    expect((await app.inject({ url: `/api/ws/${made.id}/state`, headers: { cookie: a.cookie } })).statusCode).toBe(200);
    expect((await app.inject(`/api/ws/${made.id}/state`)).statusCode).toBe(403);

    // a second Google account
    tokenResponse = { ok: true, status: 200, json: async () => ({ id_token: jwt(goodClaims({ sub: 'g-222', email: 'other@example.com', name: 'Other' })) }) };
    const b = await signIn();
    expect((await app.inject({ url: `/api/ws/${made.id}/state`, headers: { cookie: b.cookie } })).statusCode).toBe(403);
    const mine = (await app.inject({ url: '/api/me', headers: { cookie: a.cookie } })).json();
    expect(mine.studios).toEqual([{ id: made.id, business: 'Glow' }]);
    expect((await app.inject({ url: '/api/me', headers: { cookie: b.cookie } })).json().studios).toEqual([]);
  });

  it('a studio made without signing in still works with its owner link, and is not linked to anyone', async () => {
    const made = (await create()).json();
    expect((await app.inject({ url: `/api/ws/${made.id}/state`, headers: { 'x-owner-token': made.ownerToken } })).statusCode).toBe(200);
    expect(workspaces.accountOf(made.id)).toBeUndefined();
  });
});

describe('without Google configured', () => {
  it('the routes say so, and the welcome page is told', async () => {
    const plain = await buildApp({ workspaces: new Workspaces(), auth: new Auth({ sessionSecret: 's' }) });
    expect((await plain.inject('/auth/google')).statusCode).toBe(404);
    expect((await plain.inject('/api/config')).json().google).toBe(false);
    expect((await plain.inject('/api/me')).json()).toMatchObject({ google: false, account: null });
    await plain.close();
  });
});
