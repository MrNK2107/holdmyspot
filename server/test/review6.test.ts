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
