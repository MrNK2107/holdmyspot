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
