import { describe, expect, it } from 'vitest';
import { DemoClock, HOUR } from '../src/clock.js';
import { AuditLog } from '../src/audit.js';

describe('DemoClock', () => {
  it('fires due jobs in time order and sets now() to each job time', async () => {
    const c = new DemoClock(0);
    const seen: Array<[string, number]> = [];
    c.schedule(3 * HOUR, 'b', () => void seen.push(['b', c.now()]));
    c.schedule(1 * HOUR, 'a', () => void seen.push(['a', c.now()]));
    c.schedule(10 * HOUR, 'later', () => void seen.push(['later', c.now()]));
    const fired = await c.advanceTo(5 * HOUR);
    expect(fired).toEqual(['a', 'b']);
    expect(seen).toEqual([
      ['a', HOUR],
      ['b', 3 * HOUR],
    ]);
    expect(c.now()).toBe(5 * HOUR);
    expect(c.pending().map((j) => j.name)).toEqual(['later']);
  });

  it('runs jobs scheduled by jobs when they are due', async () => {
    const c = new DemoClock(0);
    c.schedule(HOUR, 'first', () => void c.schedule(2 * HOUR, 'chained', () => {}));
    expect(await c.advanceTo(3 * HOUR)).toEqual(['first', 'chained']);
  });

  it('refuses to go backwards and supports cancel', async () => {
    const c = new DemoClock(100);
    const id = c.schedule(200, 'x', () => {});
    c.cancel(id);
    expect(await c.advanceBy(500)).toEqual([]);
    await expect(c.advanceTo(0)).rejects.toThrow();
  });
});

describe('AuditLog', () => {
  it('appends frozen entries, filters by booking, notifies subscribers', () => {
    let t = 5;
    const log = new AuditLog(() => t);
    const got: string[] = [];
    log.subscribe((e) => got.push(e.summary));
    log.add('paypal', 'authorized', { bookingId: 'b1' });
    t = 6;
    log.add('engine', 'decided', { bookingId: 'b2' });
    expect(log.forBooking('b1')).toHaveLength(1);
    expect(log.all()[1]).toMatchObject({ seq: 2, at: 6, kind: 'engine' });
    expect(Object.isFrozen(log.all()[0])).toBe(true);
    expect(got).toEqual(['authorized', 'decided']);
  });
});
