import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { Auth } from '../src/auth.js';
import { MemoryStore, PgStore, type PgLike } from '../src/store.js';
import { Workspaces } from '../src/workspaces.js';

let app: FastifyInstance;
let workspaces: Workspaces;
let store: MemoryStore;
let auth: Auth;
let clock = 1_800_000_000_000;

beforeEach(async () => {
  clock = 1_800_000_000_000;
  store = new MemoryStore();
  workspaces = new Workspaces({ store });
  await workspaces.create('demo');
  auth = new Auth({ sessionSecret: 'test-secret', baseUrl: 'https://studio.example.com', store, now: () => clock });
  app = await buildApp({ workspaces, auth, requireAccount: true });
});
afterEach(async () => app.close());

type Res = Awaited<ReturnType<FastifyInstance['inject']>>;
const cookiesOf = (res: Res) => ([] as string[]).concat((res.headers['set-cookie'] as string[] | string | undefined) ?? []);
const jar = (res: Res) => cookiesOf(res).map((c) => c.split(';')[0]).join('; ');
const post = (url: string, payload: object, cookie = '') => app.inject({ method: 'POST', url, payload, headers: cookie ? { cookie } : {} });
const PW = 'correct horse battery';

const signup = (email = 'priya@example.com', name = 'Priya', password = PW) => post('/api/auth/signup', { name, email, password });
const login = (email = 'priya@example.com', password = PW) => post('/api/auth/login', { email, password });

describe('email + password accounts', () => {
  it('sign-up creates the account and signs the person in with an HttpOnly session cookie', async () => {
    const r = await signup();
    expect(r.statusCode).toBe(200);
    expect(r.json().ok).toBe(true);
    expect(cookiesOf(r).join(' ')).toMatch(/hms_session=.*HttpOnly.*SameSite=Lax.*Secure/);
    const me = (await app.inject({ url: '/api/me', headers: { cookie: jar(r) } })).json();
    expect(me.account).toMatchObject({ name: 'Priya', email: 'priya@example.com' });
    expect(me.requireAccount).toBe(true);
    expect(me.password).toBe(true);
    expect(JSON.stringify(me)).not.toContain(PW);
  });

  it('stores only a salted scrypt hash, never the password', async () => {
    await signup();
    const acc = await store.accountByEmail('priya@example.com');
    expect(acc?.passwordHash).toMatch(/^scrypt\$/);
    expect(acc?.passwordHash).not.toContain(PW);
    await signup('asha@example.com', 'Asha');
    const other = await store.accountByEmail('asha@example.com');
    expect(other?.passwordHash).not.toBe(acc?.passwordHash); // a fresh salt for each account
  });

  it('refuses weak or malformed sign-ups and a repeated email', async () => {
    expect((await signup('priya@example.com', 'Priya', 'short')).statusCode).toBe(400);
    expect((await signup('not-an-email')).statusCode).toBe(400);
    expect((await signup('priya@example.com', '   ')).statusCode).toBe(400);
    expect((await signup()).statusCode).toBe(200);
    const again = await signup('PRIYA@example.com'); // email is not case sensitive
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/already/i);
  });

  it('login accepts the right password and gives one generic answer for every failure', async () => {
    await signup();
    const ok = await login();
    expect(ok.statusCode).toBe(200);
    expect(cookiesOf(ok).join(' ')).toMatch(/hms_session=/);
    const wrong = await login('priya@example.com', 'wrong password!!');
    const unknown = await login('nobody@example.com', PW);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error).toBe(unknown.json().error); // does not reveal which emails exist
    expect(cookiesOf(wrong)).toHaveLength(0);
  });

  it('locks an email out for a while after repeated wrong passwords, even for the right one', async () => {
    await signup();
    for (let i = 0; i < 8; i++) expect((await login('priya@example.com', `wrong-password-${i}`)).statusCode).toBe(401);
    const locked = await login(); // correct password, but too many tries
    expect(locked.statusCode).toBe(429);
    clock += 16 * 60_000;
    expect((await login()).statusCode).toBe(200);
  });

  it('sign-out clears the session', async () => {
    const s = await signup();
    const out = await post('/api/logout', {}, jar(s));
    expect(cookiesOf(out).join(' ')).toMatch(/hms_session=;.*Max-Age=0/);
  });
});

describe('studios belong to one account', () => {
  const createStudio = (cookie: string, business = 'Polished by Priya') => post('/api/workspaces', { business, owner: 'Priya' }, cookie);

  it('creating a studio needs an account, and the studio is linked to it', async () => {
    expect((await post('/api/workspaces', { business: 'x', owner: 'y' })).statusCode).toBe(401);
    const s = await signup();
    const r = await createStudio(jar(s));
    expect(r.statusCode).toBe(200);
    const id = r.json().id;
    expect(workspaces.accountOf(id)).toBeTruthy();
    const me = (await app.inject({ url: '/api/me', headers: { cookie: jar(s) } })).json();
    expect(me.studios.map((x: { id: string }) => x.id)).toEqual([id]);
  });

  it('only the owning account can open it: not a stranger, not another account, not the old owner token', async () => {
    const priya = await signup();
    const created = (await createStudio(jar(priya))).json();
    const url = `/api/ws/${created.id}/state`;
    expect((await app.inject({ url, headers: { cookie: jar(priya) } })).statusCode).toBe(200);
    expect((await app.inject(url)).statusCode).toBe(403); // nobody signed in
    const asha = await signup('asha@example.com', 'Asha');
    expect((await app.inject({ url, headers: { cookie: jar(asha) } })).statusCode).toBe(403); // someone else's studio
    // the owner token no longer opens anything once accounts are required
    expect((await app.inject({ url, headers: { 'x-owner-token': created.ownerToken } })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/ws/${created.id}/events?owner=${created.ownerToken}` })).statusCode).toBe(403);
  });

  it('the public booking page and the shared demo stay open', async () => {
    const created = (await createStudio(jar(await signup()))).json();
    expect((await app.inject(`/api/ws/${created.id}/public`)).statusCode).toBe(200);
    expect((await app.inject(`/api/ws/${created.id}/slots?service=gel`)).statusCode).not.toBe(403);
    expect((await app.inject('/api/ws/demo/state')).statusCode).toBe(200);
  });

  it('one account cannot see another account in /api/me or its studio list', async () => {
    const priya = await signup();
    await createStudio(jar(priya));
    const asha = await signup('asha@example.com', 'Asha');
    const me = (await app.inject({ url: '/api/me', headers: { cookie: jar(asha) } })).json();
    expect(me.studios).toEqual([]);
  });

  it('retires studios that have no owner account (and keeps the demo and owned studios)', async () => {
    const owned = await workspaces.create(undefined, undefined, { business: 'Mine' }, { accountId: 'acc_1' });
    const orphan = await workspaces.create(undefined, undefined, { business: 'Nobody' });
    await workspaces.flush();
    expect((await store.loadWorkspaces()).map((w) => w.id)).toContain(orphan.engine.id);
    expect(await workspaces.retireAnonymous()).toBe(1);
    expect(workspaces.get(orphan.engine.id)).toBeUndefined();
    expect((await store.loadWorkspaces()).map((w) => w.id)).not.toContain(orphan.engine.id);
    expect(workspaces.get(owned.engine.id)).toBeDefined();
    expect(workspaces.get('demo')).toBeDefined();
  });
});

describe('accounts are still optional when not required (local demo)', () => {
  it('without requireAccount, anyone can create a studio and the owner token still works', async () => {
    const open = await buildApp({ workspaces: new Workspaces(), auth: new Auth({ sessionSecret: 's' }) });
    const r = (await open.inject({ method: 'POST', url: '/api/workspaces', payload: { business: 'x', owner: 'y' } })).json();
    expect((await open.inject({ url: `/api/ws/${r.id}/state`, headers: { 'x-owner-token': r.ownerToken } })).statusCode).toBe(200);
    expect((await open.inject({ url: '/api/me' })).json().requireAccount).toBe(false);
    await open.close();
  });
});

describe('Postgres account rows', () => {
  it('uses parameters for the email and hash, and returns the stored hash', async () => {
    const seen: Array<{ text: string; params?: unknown[] }> = [];
    const pool: PgLike = {
      async query(text, params) {
        seen.push({ text, params });
        if (/^INSERT INTO accounts/.test(text.trim())) return { rows: [{ id: params![0], google_sub: null, email: params![1], name: params![2], picture: null, password_hash: params![3] }] };
        return { rows: [] };
      },
    };
    const email = "o'brien@example.com";
    const acc = await new PgStore(pool).createPasswordAccount({ email, name: 'Aoife', passwordHash: 'scrypt$x' });
    expect(acc).toMatchObject({ email, name: 'Aoife', passwordHash: 'scrypt$x' });
    const insert = seen.find((q) => /^INSERT INTO accounts/.test(q.text.trim()))!;
    expect(insert.text).not.toContain("o'brien");
    expect(insert.params).toContain(email);
  });
});
