import { describe, expect, it } from 'vitest';
import { MemoryStore, PgStore, type PgLike } from '../src/store.js';
import { Workspaces } from '../src/workspaces.js';

async function studioWithVisit(store: MemoryStore) {
  const ws = new Workspaces({ store, seedMode: 'studio' });
  const w = await ws.create('abc', undefined, { business: 'Glow', owner: 'Asha', timeZone: 'Asia/Kolkata' });
  const e = w.engine;
  e.addServiceChecked({ name: 'Haircut', durationMin: 45, priceCents: 3500 });
  await e.setHours({ openHour: 8, closeHour: 20, closedDays: [0], leadMinutes: 0, stepMinutes: 60 });
  const c = e.newClient('Jordan Lee');
  const [start] = e.freeSlots('haircut', 1);
  const b = await e.createBooking({ clientId: c.id, serviceId: 'haircut', start });
  await e.receiveMessage(c.id, 'can I come ten minutes late?');
  return { ws, w, c, b };
}

describe('studios survive a restart', () => {
  it('a studio, its client link, visit and messages come back from the store', async () => {
    const store = new MemoryStore();
    const { ws, w, c, b } = await studioWithVisit(store);
    await ws.flush();

    const again = new Workspaces({ store, seedMode: 'studio' });
    expect(await again.restoreAll()).toBe(1);
    const r = again.get('abc')!;
    expect(r.ownerToken).toBe(w.ownerToken);
    const s = r.engine.snapshot();
    expect(s.business).toBe('Glow');
    expect(s.owner).toBe('Asha');
    expect(s.timeZone).toBe('Asia/Kolkata');
    expect(s.services.map((x) => x.name)).toEqual(['Haircut']);
    expect(s.hours).toMatchObject({ openHour: 8, closeHour: 20 });
    expect(s.bookings.map((x) => x.id)).toEqual([b.id]);
    expect(s.messages.some((m) => m.text.includes('ten minutes late'))).toBe(true);
    // the client's private link still opens the same person
    expect(r.engine.clientByToken(c.token!)?.name).toBe('Jordan Lee');
    // the audit trail (the booking's timeline) is kept too
    expect(r.engine.audit.forBooking(b.id).length).toBeGreaterThan(0);
  });

  it('the jobs a visit is owed are scheduled again (hold, attendance question)', async () => {
    const store = new MemoryStore();
    const { ws, b } = await studioWithVisit(store);
    await ws.flush();
    const again = new Workspaces({ store, seedMode: 'studio' });
    await again.restoreAll();
    const names = again.get('abc')!.engine.clock.pending().map((j) => j.name);
    expect(names).toContain(`attendance ${b.id}`);
  });

  it('the shared demo workspace is never stored', async () => {
    const store = new MemoryStore();
    const ws = new Workspaces({ store, seedMode: 'studio' });
    await ws.create('demo');
    await ws.flush();
    expect(await store.loadWorkspaces()).toEqual([]);
  });

  it('the owning account is remembered, and a reset keeps both studio and owner', async () => {
    const store = new MemoryStore();
    const ws = new Workspaces({ store, seedMode: 'studio' });
    await ws.create('abc', undefined, { business: 'Glow', owner: 'Asha' });
    const acc = await store.upsertAccount({ googleSub: 'g-1', email: 'a@example.com', name: 'Asha K' });
    ws.linkAccount('abc', acc.id);
    await ws.flush();
    expect((await store.loadWorkspaces())[0].accountId).toBe(acc.id);

    const again = new Workspaces({ store, seedMode: 'studio' });
    await again.restoreAll();
    expect(again.accountOf('abc')).toBe(acc.id);
    expect(again.studiosOf(acc.id)).toEqual([{ id: 'abc', business: 'Glow' }]);
    await again.reset('abc');
    expect(again.accountOf('abc')).toBe(acc.id);
    expect(again.get('abc')!.engine.snapshot().business).toBe('Glow');
  });

  it('a save that fails is retried on the next change, not lost', async () => {
    const store = new MemoryStore();
    const ws = new Workspaces({ store, seedMode: 'studio' });
    await ws.create('abc');
    let fail = true;
    const real = store.saveWorkspace.bind(store);
    const errs = console.error;
    console.error = () => undefined;
    store.saveWorkspace = async (w) => {
      if (fail) throw new Error('db down');
      return real(w);
    };
    try {
      await ws.flush();
      expect(await store.loadWorkspaces()).toEqual([]);
      fail = false;
      await ws.run('abc', async () => undefined); // any change marks it dirty again
      await ws.flush();
      expect((await store.loadWorkspaces()).map((x) => x.id)).toEqual(['abc']);
    } finally {
      console.error = errs;
    }
  });
});

describe('PgStore', () => {
  const fake = () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const pool: PgLike = {
      async query(text, params) {
        calls.push({ text, params });
        if (/SELECT id, owner_token/.test(text)) return { rows: [{ id: 'abc', owner_token: 't', studio: { business: 'Glow' }, account_id: 'acc_1', state: { v: 1 } }] };
        if (/INSERT INTO accounts/.test(text)) return { rows: [{ id: 'acc_g-1', google_sub: 'g-1', email: 'a@example.com', name: 'Asha', picture: null }] };
        return { rows: [] };
      },
    };
    return { pool, calls };
  };

  it('creates its tables, saves with an upsert, and loads back', async () => {
    const { pool, calls } = fake();
    const s = new PgStore(pool);
    await s.init();
    expect(calls.map((c) => c.text).join(' ')).toMatch(/CREATE TABLE IF NOT EXISTS workspaces[\s\S]*CREATE TABLE IF NOT EXISTS accounts/);
    await s.saveWorkspace({ id: 'abc', ownerToken: 't', studio: { business: 'Glow' }, accountId: 'acc_1', state: { v: 1 } });
    const save = calls.at(-1)!;
    expect(save.text).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    expect(save.params).toEqual(['abc', 't', '{"business":"Glow"}', 'acc_1', '{"v":1}']);
    expect(await s.loadWorkspaces()).toEqual([{ id: 'abc', ownerToken: 't', studio: { business: 'Glow' }, accountId: 'acc_1', state: { v: 1 } }]);
  });

  it('upserts an account by its Google id', async () => {
    const { pool } = fake();
    const acc = await new PgStore(pool).upsertAccount({ googleSub: 'g-1', email: 'a@example.com', name: 'Asha' });
    expect(acc).toEqual({ id: 'acc_g-1', googleSub: 'g-1', email: 'a@example.com', name: 'Asha', picture: undefined });
  });

  it('never puts values into the SQL text (parameters only)', async () => {
    const { pool, calls } = fake();
    await new PgStore(pool).saveWorkspace({ id: "x'; DROP TABLE workspaces;--", ownerToken: 't', studio: {}, state: { v: 1 } });
    expect(calls.at(-1)!.text).not.toContain('DROP');
  });
});
