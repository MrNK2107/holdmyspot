import { describe, expect, it } from 'vitest';
import { Workspaces } from '../src/workspaces.js';
import { MockPayPalGateway } from '../src/paypal/mock.js';
import type { PaymentsGateway } from '../src/paypal/gateway.js';

/** With a real gateway (PAYMENTS=sandbox) the demo seed must not touch PayPal: its fake wallet ids made PayPal answer 403 at startup. */
describe('sandbox (real gateway) workspace', () => {
  it('starts with services and policy only, and makes no PayPal call', async () => {
    const mock = new MockPayPalGateway(() => Date.UTC(2026, 10, 2, 9));
    const calls: string[] = [];
    const spy = new Proxy(mock, {
      get(t, p, r) {
        const v = Reflect.get(t, p, r);
        return typeof v === 'function' && typeof p === 'string' && !['onWebhook'].includes(p)
          ? (...a: unknown[]) => {
              calls.push(p);
              return v.apply(t, a);
            }
          : v;
      },
    }) as unknown as PaymentsGateway;
    const ws = new Workspaces({ gateway: spy, seedMode: 'studio' });
    const w = await ws.create('demo');
    const s = w.engine.snapshot();
    expect(calls).toEqual([]);
    expect(s.bookings).toHaveLength(0);
    expect(s.services.map((x) => x.id).sort()).toEqual(['art', 'gel', 'pedi']);
    expect(s.policy.version).toBe(1);
  });

  it('keeps the full seeded demo for the simulator', async () => {
    const w = await new Workspaces().create('demo');
    expect(w.engine.snapshot().bookings).toHaveLength(12);
  });
});
