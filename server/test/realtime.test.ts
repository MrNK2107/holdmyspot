import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { RealClock } from '../src/clock.js';
import { MockPayPalGateway } from '../src/paypal/mock.js';
import { Workspaces } from '../src/workspaces.js';
import { validateHours, STUDIO_HOURS } from '../src/domain/hours.js';

let clock: RealClock | undefined;
let app: FastifyInstance | undefined;
afterEach(async () => {
  clock?.stop();
  clock = undefined;
  await app?.close();
  app = undefined;
});

describe('RealClock', () => {
  it('fires a due job through the runner, and reads the wall clock', async () => {
    let ran = 0;
    let viaRunner = 0;
    clock = new RealClock(async (fn) => {
      viaRunner++;
      return fn();
    }, 10);
    const before = Date.now();
    expect(clock.now()).toBeGreaterThanOrEqual(before);
    expect(clock.real).toBe(true);
    clock.schedule(Date.now() + 40, 'soon', () => void ran++);
    clock.schedule(Date.now() + 60_000, 'later', () => void ran++);
    await new Promise((r) => setTimeout(r, 250));
    expect(ran).toBe(1);
    expect(viaRunner).toBeGreaterThan(1);
    expect(clock.pending().map((j) => j.name)).toEqual(['later']);
  });

  it('a failing job is reported, does not stop the ticker, and later jobs still run', async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => void errs.push(String(a[1] ?? a[0]));
    try {
      let ok = 0;
      clock = new RealClock(async (fn) => fn(), 10);
      clock.schedule(Date.now() + 20, 'boom', () => {
        throw new Error('paypal down');
      });
      await new Promise((r) => setTimeout(r, 100));
      clock.schedule(Date.now() + 10, 'fine', () => void ok++);
      await new Promise((r) => setTimeout(r, 150));
      expect(ok).toBe(1);
      expect(errs.join(' ')).toContain('paypal down');
    } finally {
      console.error = orig;
    }
  });
});

describe('a real studio', () => {
  async function studio() {
    const ws = new Workspaces({ gateway: new MockPayPalGateway(() => Date.now()), seedMode: 'studio', clock: 'real' });
    const w = await ws.create('demo', undefined, { business: 'Glow', owner: 'Asha', timeZone: 'Asia/Kolkata' });
    clock = w.engine.clock as RealClock;
    app = await buildApp({ workspaces: ws });
    return { ws, w };
  }
  const post = (url: string, payload?: unknown) => app!.inject({ method: 'POST', url, ...(payload ? { payload: payload as object } : {}) });

  it('starts empty and on real time, with its own time zone and a neutral policy', async () => {
    const { w } = await studio();
    const s = w.engine.snapshot();
    expect(s.clockMode).toBe('real');
    expect(s.timeZone).toBe('Asia/Kolkata');
    expect(s.services).toEqual([]);
    expect(s.bookings).toEqual([]);
    expect(Math.abs(s.now - Date.now())).toBeLessThan(2000);
    expect(s.policy.prose).not.toContain('loves');
    expect(s.hours.sameDay).toBe(true);
  });

  it('time travel is off', async () => {
    await studio();
    const r = await post('/api/ws/demo/time', { byMs: 3_600_000 });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.json().error).toMatch(/real time/);
  });

  it('services are validated, get an id from the name, and cannot be removed once booked', async () => {
    const { w } = await studio();
    expect((await post('/api/ws/demo/services', { name: '', durationMin: 60, priceCents: 4500 })).statusCode).toBe(400);
    expect((await post('/api/ws/demo/services', { name: 'Cut', durationMin: 7, priceCents: 4500 })).statusCode).toBe(400);
    expect((await post('/api/ws/demo/services', { name: 'Cut', durationMin: 60, priceCents: -1 })).statusCode).toBe(400);
    const a = (await post('/api/ws/demo/services', { name: ' Haircut <b>', durationMin: 45, priceCents: 3500 })).json();
    expect(a.ok).toBe(true);
    expect(a.result).toMatchObject({ id: 'haircut-b', name: 'Haircut b', durationMin: 45, priceCents: 3500 });
    const b = (await post('/api/ws/demo/services', { name: 'Haircut b', durationMin: 30, priceCents: 2500 })).json();
    expect(b.result.id).toBe('haircut-b-2');
    expect(w.engine.snapshot().services).toHaveLength(2);
    const del = await app!.inject({ method: 'DELETE', url: '/api/ws/demo/services/haircut-b-2' });
    expect(del.json().ok).toBe(true);
    expect(w.engine.snapshot().services).toHaveLength(1);
  });

  it('offers today\'s later slots after the notice time, inside opening hours, in the studio\'s zone', async () => {
    const { w } = await studio();
    w.engine.addServiceChecked({ name: 'Cut', durationMin: 60, priceCents: 3000 });
    await w.engine.setHours({ openHour: 0, closeHour: 24, closedDays: [], leadMinutes: 120, stepMinutes: 60 });
    const slots = w.engine.freeSlots('cut', 5);
    expect(slots).toHaveLength(5);
    expect(slots[0]).toBeGreaterThanOrEqual(Date.now() + 120 * 60_000);
    expect(slots[0]).toBeLessThan(Date.now() + 4 * 3_600_000);
    for (let i = 1; i < slots.length; i++) expect(slots[i] - slots[i - 1]).toBe(3_600_000);
  });

  it('a visit that would end after closing is not offered', async () => {
    const { w } = await studio();
    w.engine.addServiceChecked({ name: 'Long', durationMin: 120, priceCents: 9000 });
    await w.engine.setHours({ openHour: 9, closeHour: 17, closedDays: [], leadMinutes: 0, stepMinutes: 60 });
    const zone = 'Asia/Kolkata';
    for (const t of w.engine.freeSlots('long', 40)) {
      const local = new Date(t).toLocaleString('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false });
      const [h] = local.split(':').map(Number);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThanOrEqual(15); // starts at 15:00 at the latest: ends 17:00
    }
  });
});

describe('validateHours', () => {
  it('accepts sane hours and rejects the rest', () => {
    expect(validateHours({ openHour: 8, closeHour: 20, closedDays: [0, 6], stepMinutes: 30 }, STUDIO_HOURS)).toMatchObject({ openHour: 8, closeHour: 20, closedDays: [0, 6], stepMinutes: 30, sameDay: true });
    for (const bad of [{ openHour: 20, closeHour: 8 }, { openHour: -1 }, { closeHour: 25 }, { stepMinutes: 45 }, { closedDays: [0, 1, 2, 3, 4, 5, 6] }, { closedDays: [9] }, { leadMinutes: 99999 }]) {
      expect(() => validateHours(bad, STUDIO_HOURS)).toThrow();
    }
  });
});
