import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

// Follow-up of the suspected issues listed by the 2026-11-02 money review (NIGHT_RUN_NOTES.md).
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('review 2026-11-02 follow-up', () => {
  it('a real webhook waits for the workspace lock instead of interleaving with an owner tap', async () => {
    const reg = new Workspaces();
    const w = await reg.create('demo');
    const app = await buildApp({ workspaces: reg, webhookVerifier: async () => true });
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // an owner tap that is mid-way through a PayPal call
    w.engine.resolveApproval = (async () => {
      order.push('tap start');
      await gate;
      order.push('tap end');
      return [...w.engine.bookings.values()][0];
    }) as typeof w.engine.resolveApproval;
    const ingest = w.engine.ingestWebhook.bind(w.engine);
    w.engine.ingestWebhook = async (ev) => {
      if (ev.id === 'WH-L1') order.push('webhook'); // not the seed's simulated ones
      return ingest(ev);
    };
    const tap = Promise.resolve(app.inject({ method: 'POST', url: '/api/ws/demo/approvals/ap_1', payload: { choice: 'charge' } }));
    await tick();
    const ev = { id: 'WH-L1', event_type: 'PAYMENT.CAPTURE.COMPLETED', create_time: '', resource: { id: 'C1', custom_id: 'demo:bk_1' } };
    const hook = Promise.resolve(app.inject({ method: 'POST', url: '/api/paypal/webhook', payload: ev }));
    await tick();
    release();
    const [, h] = await Promise.all([tap, hook]);
    expect(h.json()).toEqual({ result: 'processed' });
    expect(order).toEqual(['tap start', 'tap end', 'webhook']);
    await app.close();
  });
});

describe('which visit a text is about (several upcoming visits)', () => {
  it('a weekday that two visits share means the nearer one, never an unnamed visit; a date picks its own week', async () => {
    const w = await new Workspaces().create('t3');
    const e = w.engine;
    // Riley: Mon 2 Nov gel 15:00, Wed 4 Nov pedicure, Sat 7 Nov nail art (seed) + Wed 11 Nov gel
    const wed11 = await e.createBooking({ clientId: 'riley', serviceId: 'gel', start: at(11, 15) });
    const wed4 = [...e.bookings.values()].find((b) => b.clientId === 'riley' && b.start === at(4, 11))!;
    expect(e.bookingForText('riley', "I can't make it on Wednesday, sorry")?.id).toBe(wed4.id);
    expect(e.bookingForText('riley', 'please cancel my appointment on the 11th')?.id).toBe(wed11.id);
    expect(e.bookingForText('riley', 'need to cancel Nov 11')?.id).toBe(wed11.id);
    expect(e.bookingForText('riley', 'cancel Wednesday 11th please')?.id).toBe(wed11.id);
    // nothing named: the next visit, as before
    expect(e.bookingForText('riley', 'running 10 min late')?.start).toBe(at(2, 15));
  });
});
