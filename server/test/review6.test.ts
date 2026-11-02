import { describe, expect, it } from 'vitest';
import { Workspaces } from '../src/workspaces.js';

// Follow-ups after the 2026-11-02 final check: refund cards after a partial refund made in the PayPal dashboard.

async function charged() {
  const { playNextBeat } = await import('../src/demo.js');
  const reg = new Workspaces();
  const w = await reg.create('r6');
  for (let i = 0; i < 20 && ![...w.engine.bookings.values()].some((b) => b.captureId && b.state === 'CHARGED'); i++) await reg.run('r6', () => playNextBeat(w));
  const b = [...w.engine.bookings.values()].find((x) => x.captureId && x.state === 'CHARGED')!;
  expect(b).toBeTruthy();
  const settle = async () => {
    await new Promise((r) => setImmediate(r));
    await reg.run('r6', async () => undefined);
  };
  const card = () => w.engine.openApprovals().find((a) => a.kind === 'refund' && a.bookingId === b.id) as { id: string; feeCents: number; prompt: string } | undefined;
  return { reg, w, b, settle, card };
}

describe('refund cards after a partial dashboard refund show what is left', () => {
  it("the front desk's prepared refund card names the remaining amount, not the full fee", async () => {
    const { w, b, settle, card } = await charged();
    const fee = b.capturedCents!;
    await w.mock!.refund(b.captureId!, 500, 'dashboard-part');
    await settle();
    const name = w.engine.snapshot().bookings.find((x) => x.id === b.id)!.clientName!.split(' ')[0];
    await w.engine.askAssistant(`${name} apologised, please refund her fee.`);
    const c = card()!;
    expect(c).toBeTruthy();
    expect(c.feeCents).toBe(fee - 500);
    expect(c.prompt).toContain(`$${((fee - 500) / 100).toFixed(2)}`);
    expect(c.prompt).toMatch(/already refunded/i);
  });

  it('an open refund card is updated when a partial refund arrives from the dashboard', async () => {
    const { w, b, settle, card } = await charged();
    const fee = b.capturedCents!;
    const name = w.engine.snapshot().bookings.find((x) => x.id === b.id)!.clientName!.split(' ')[0];
    await w.engine.askAssistant(`${name} apologised, please refund her fee.`);
    expect(card()!.feeCents).toBe(fee);
    await w.mock!.refund(b.captureId!, 300, 'dashboard-part2');
    await settle();
    expect(card()!.feeCents).toBe(fee - 300);
    expect(card()!.prompt).toContain(`$${((fee - 300) / 100).toFixed(2)}`);
    await w.engine.resolveApproval(card()!.id, 'refund');
    expect(w.mock!.readView().captures.find((c) => c.id === b.captureId)!.refundedCents).toBe(fee);
  });

  it('the refund-failed retry card names only the part that is still collected', async () => {
    const { reg, w, b, settle, card } = await charged();
    const fee = b.capturedCents!;
    await w.mock!.refund(b.captureId!, 500, 'dashboard-part3');
    await settle();
    await w.engine.refund(b.id);
    const ours = b.refundId!;
    expect(await reg.routeWebhook({ id: 'WH-RF6', event_type: 'PAYMENT.REFUND.FAILED', create_time: '', resource: { id: ours, status: 'FAILED' } })).toBe('processed');
    const c = card()!;
    expect(c.prompt).toMatch(/failed/i);
    expect(c.feeCents).toBe(fee - 500);
    expect(c.prompt).toContain(`$${((fee - 500) / 100).toFixed(2)}`);
  });
});

describe('a PENDING reauthorization (under review at PayPal) does not replace the hold yet', () => {
  const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);

  it('the REST adapter reports PENDING for a reauthorization PayPal is still reviewing', async () => {
    const { PayPalRestGateway } = await import('../src/paypal/rest.js');
    const tokenRes = { status: 200, json: async () => ({}), text: async () => JSON.stringify({ access_token: 'T', expires_in: 32400 }) };
    const body = { id: 'AUTHRE1', status: 'PENDING', status_details: { reason: 'PENDING_REVIEW' }, create_time: '2026-11-06T09:00:00Z' };
    const g = new PayPalRestGateway({
      clientId: 'id',
      clientSecret: 's',
      returnUrl: 'r',
      cancelUrl: 'c',
      now: () => 0,
      fetch: async (url) => (url.endsWith('/v1/oauth2/token') ? tokenRes : { status: 201, json: async () => ({}), text: async () => JSON.stringify(body) }),
    });
    expect(await g.reauthorize('A1', 2000, 'ra')).toEqual({ status: 'PENDING', authorizationId: 'AUTHRE1', issue: 'PENDING_REVIEW' });
  });

  it('at T-72h the current hold stays; PayPal\'s later CREATED webhook swaps in the new one without voiding either', async () => {
    const w = await new Workspaces().create('rp1');
    const e = w.engine;
    e.holdStrategy = 'reauth';
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(10, 10) });
    const first = b.authorizationId!;
    expect(b.state).toBe('HELD');
    w.mock!.reauthorize = async () => ({ status: 'PENDING', authorizationId: 'AUTHRE1', issue: 'PENDING_REVIEW' }) as never;
    await e.clock.advanceTo(at(7, 10, 1));
    expect(b.state).toBe('HELD');
    expect(b.authorizationId).toBe(first);
    expect(b.pendingAuthorizationId).toBe('AUTHRE1');
    expect(e.snapshot().bookings.find((x) => x.id === b.id)!.money).toBe('held');
    expect(w.mock!.authorizationStatus(first)).toBe('CREATED');
    expect(e.audit.forBooking(b.id).some((a) => /under review/i.test(a.summary))).toBe(true);
    await e.ingestWebhook({ id: 'WH-re1', event_type: 'PAYMENT.AUTHORIZATION.CREATED', create_time: '', resource: { id: 'AUTHRE1', status: 'CREATED', custom_id: e.customIdFor(b.id) } });
    expect(b.authorizationId).toBe('AUTHRE1');
    expect(b.pendingAuthorizationId).toBeUndefined();
    expect(b.reauthorized).toBe(true);
    expect(w.mock!.calls.some((c) => c.op === 'void')).toBe(false); // a reauthorization supersedes its parent at PayPal
  });

  it('a capture after the honor period whose reauthorization is PENDING captures the current hold as-is', async () => {
    const w = await new Workspaces().create('rp2');
    const e = w.engine;
    e.holdStrategy = 'reauth';
    const b = await e.createBooking({ clientId: 'chris', serviceId: 'gel', start: at(4, 10) });
    const first = b.authorizationId!;
    await e.clock.advanceTo(at(4, 10, 10));
    const att = e.openApprovals().find((a) => a.bookingId === b.id && a.kind === 'attendance')!;
    await e.resolveApproval(att.id, 'no_show');
    const cap = e.openApprovals().find((a) => a.bookingId === b.id && a.kind === 'capture')!;
    w.mock!.reauthorize = async () => ({ status: 'PENDING', authorizationId: 'AUTHRE2', issue: 'PENDING_REVIEW' }) as never;
    await e.clock.advanceTo(at(7, 12));
    await e.resolveApproval(cap.id, 'charge');
    expect(b.state).toBe('CHARGED');
    expect(w.mock!.calls.filter((c) => c.op === 'capture').at(-1)!.requestId).toContain(first);
    expect(b.pendingAuthorizationId).toBe('AUTHRE2');
  });
});
