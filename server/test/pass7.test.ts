import { describe, expect, it } from 'vitest';
import { Workspaces } from '../src/workspaces.js';

// Leftovers of the 2026-11-02 review follow-up (NIGHT_RUN_NOTES.md "Still open").
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);

describe('PAYMENT.AUTHORIZATION.VOIDED from outside HoldMySpot', () => {
  const alexHeld = async (id: string) => {
    const w = await new Workspaces().create(id);
    const e = w.engine;
    await e.clock.advanceTo(at(5, 11, 10));
    const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
    expect(alex.state).toBe('HELD');
    return { e, alex, mock: w.mock! };
  };
  const view = (e: import('../src/engine/engine.js').Engine, id: string) => e.snapshot().bookings.find((b) => b.id === id)!;
  const voided = (id: string, authId: string, bookingId: string) => ({
    id,
    event_type: 'PAYMENT.AUTHORIZATION.VOIDED' as const,
    create_time: '',
    resource: { id: authId, custom_id: `${id.split(':')[0]}:${bookingId}`, status: 'VOIDED' },
  });

  it('marks the hold voided; a no-show then gets no charge card and nothing is sent to PayPal', async () => {
    const { e, alex, mock } = await alexHeld('v1');
    const r = await e.ingestWebhook(voided('v1:WH-V1', alex.authorizationId!, alex.id));
    expect(r).toBe('processed');
    expect(alex.holdVoided).toMatch(/voided/);
    expect(view(e, alex.id).money).toBe('voided');
    const calls = mock.delivered.length;
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!.id, 'no_show');
    expect(e.openApprovals().some((a) => a.bookingId === alex.id && a.kind === 'capture')).toBe(false);
    expect(alex.state).toBe('EXCUSED');
    expect(alex.captureId).toBeUndefined();
    expect(mock.delivered.length).toBe(calls);
    expect(e.audit.forBooking(alex.id).map((x) => x.summary).join('\n')).toMatch(/voided/);
  });

  it('closes an open charge card for that hold as stale, without calling PayPal', async () => {
    const { e, alex, mock } = await alexHeld('v2');
    await e.resolveApproval(e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!.id, 'no_show');
    const card = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!;
    expect(card).toBeTruthy();
    await e.ingestWebhook(voided('v2:WH-V2', alex.authorizationId!, alex.id));
    expect(e.openApprovals().some((a) => a.id === card.id)).toBe(false);
    expect(alex.state).toBe('EXCUSED');
    const calls = mock.delivered.length;
    await expect(e.resolveApproval(card.id, 'charge')).rejects.toThrow();
    expect(mock.delivered.length).toBe(calls);
    expect(alex.captureId).toBeUndefined();
  });

  it('our own void, and a void of an older authorization, change nothing', async () => {
    const { e, alex } = await alexHeld('v3');
    await e.ingestWebhook(voided('v3:WH-OLD', 'SOMEOLDAUTH1', alex.id));
    expect(alex.holdVoided).toBeUndefined();
    expect(view(e, alex.id).money).toBe('held');
    // a void HoldMySpot asked for itself: its VOIDED webhook (here before the booking moves on) is not an outside void
    const auth = alex.authorizationId!;
    await (e as unknown as { voidHold(b: typeof alex, why: string): Promise<void> }).voidHold(alex, 'test');
    await e.ingestWebhook(voided('v3:WH-OWN', auth, alex.id));
    expect(alex.holdVoided).toBeUndefined();
  });

  it('a fresh hold (re-approval) clears the voided mark', async () => {
    const { e, alex } = await alexHeld('v5');
    await e.ingestWebhook(voided('v5:WH-V5', alex.authorizationId!, alex.id));
    expect(alex.holdVoided).toBeTruthy();
    await e.ingestWebhook({ id: 'v5:WH-NEW', event_type: 'PAYMENT.AUTHORIZATION.CREATED', create_time: '', resource: { id: 'NEWAUTH123', custom_id: `v5:${alex.id}` } });
    expect(alex.authorizationId).toBe('NEWAUTH123');
    expect(alex.holdVoided).toBeUndefined();
    expect(view(e, alex.id).money).toBe('held');
  });
});

describe("free slots in the studio's time zone", () => {
  const local = (ms: number, timeZone: string) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', weekday: 'short', hour: 'numeric', minute: 'numeric' }).formatToParts(ms).map((x) => [x.type, x.value]));
    return { hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
  };

  it('offers 10:00-18:00 local, on the hour, never Sunday local (Los Angeles)', async () => {
    const tz = 'America/Los_Angeles';
    const e = (await new Workspaces({ timeZone: tz }).create('s1')).engine;
    const slots = e.freeSlots('gel', 12);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const l = local(s, tz);
      expect(l.minute).toBe(0);
      expect(l.hour).toBeGreaterThanOrEqual(10);
      expect(l.hour).toBeLessThanOrEqual(18);
      expect(l.weekday).not.toBe('Sun');
      expect(s).toBeGreaterThan(e.now());
    }
    // slot labels read as studio hours, not 2-10 am
    expect(e.suggestSlots([...e.bookings.values()][0], 1)[0]).toMatch(/(10|12|2|4|6):00 (AM|PM)/);
  });

  it('the UTC default is unchanged', async () => {
    const e = (await new Workspaces().create('s2')).engine;
    for (const s of e.freeSlots('gel', 12)) {
      const d = new Date(s);
      expect([10, 12, 14, 16, 18]).toContain(d.getUTCHours());
      expect(d.getUTCDay()).not.toBe(0);
    }
  });
});
