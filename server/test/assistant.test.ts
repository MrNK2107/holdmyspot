import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine/engine.js';
import type { MockPayPalGateway } from '../src/paypal/mock.js';
import { buildApp } from '../src/app.js';
import { Workspaces } from '../src/workspaces.js';

// The owner asks the front desk agent in plain words. It can read PayPal activity and *propose* a
// refund; the refund itself only happens when the owner taps the card it creates.
const at = (day: number, hour: number, min = 0) => Date.UTC(2026, 10, day, hour, min);
const refunds = (m: MockPayPalGateway) => m.calls.filter((c) => c.op === 'refund').length;

async function chargedAlex(): Promise<{ e: Engine; mock: MockPayPalGateway; alexId: string }> {
  const w = await new Workspaces().create('as');
  const e = w.engine;
  await e.clock.advanceTo(at(5, 11, 10));
  const alex = [...e.bookings.values()].find((b) => b.clientId === 'alex')!;
  const att = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'attendance')!;
  await e.resolveApproval(att.id, 'no_show');
  const cap = e.openApprovals().find((a) => a.bookingId === alex.id && a.kind === 'capture')!;
  await e.resolveApproval(cap.id, 'charge');
  expect(alex.state).toBe('CHARGED');
  return { e, mock: w.mock!, alexId: alex.id };
}

describe('owner asks the front desk agent', () => {
  it('a refund request becomes a card; no money moves until the owner taps', async () => {
    const { e, mock, alexId } = await chargedAlex();
    const before = refunds(mock);
    const { answer, run } = await e.askAssistant('Alex apologised, please refund her no-show fee.');
    expect(run.steps.filter((s) => s.kind === 'tool').map((s) => s.name)).toEqual(['find_booking', 'propose_refund', 'finish']);
    expect(run.steps.find((s) => s.name === 'propose_refund')?.access).toBe('propose');
    expect(refunds(mock)).toBe(before); // proposing is not refunding
    expect(e.bookings.get(alexId)!.refundId).toBeUndefined();
    const card = e.openApprovals().find((a) => a.kind === 'refund' && a.bookingId === alexId)!;
    expect(card.options).toEqual(['refund', 'keep']);
    expect(run.gate).toMatchObject({ kind: 'owner_approval', approvalId: card.id });
    expect(answer).toMatch(/Tap "Refund"/);
    expect(run.answer).toBe(answer);

    await e.resolveApproval(card.id, 'refund');
    expect(refunds(mock)).toBe(before + 1);
    expect(e.bookings.get(alexId)!.refundId).toBeTruthy();
    expect(e.snapshot().bookings.find((b) => b.id === alexId)!.money).toBe('refunded');
    const tap = run.steps.findIndex((s) => s.kind === 'owner');
    const paypal = run.steps.findIndex((s) => s.name.startsWith('PayPal') && /refund/.test(s.result ?? ''));
    expect(tap).toBeGreaterThan(-1);
    expect(paypal).toBeGreaterThan(tap);
    expect(run.gate.resolved).toBe('refund');
  });

  it('"keep" closes the card without refunding', async () => {
    const { e, mock, alexId } = await chargedAlex();
    await e.askAssistant('refund Alex');
    const card = e.openApprovals().find((a) => a.kind === 'refund')!;
    await e.resolveApproval(card.id, 'keep');
    expect(refunds(mock)).toBe(0);
    expect(e.bookings.get(alexId)!.state).toBe('CHARGED');
  });

  it('asking twice does not create a second card, and an already refunded fee is refused', async () => {
    const { e } = await chargedAlex();
    await e.askAssistant('refund Alex');
    await e.askAssistant('refund Alex please');
    expect(e.openApprovals().filter((a) => a.kind === 'refund')).toHaveLength(1);
    await e.resolveApproval(e.openApprovals().find((a) => a.kind === 'refund')!.id, 'refund');
    const { answer } = await e.askAssistant('refund Alex again');
    expect(answer).toMatch(/already refunded/);
    expect(e.openApprovals().filter((a) => a.kind === 'refund')).toHaveLength(0);
  });

  it('cannot refund someone who was never charged', async () => {
    const { e } = await chargedAlex();
    const { answer, run } = await e.askAssistant('refund Sam Rivera');
    expect(answer).toMatch(/could not find a charged booking/);
    expect(run.gate.kind).toBe('none');
    expect(e.openApprovals().some((a) => a.kind === 'refund')).toBe(false);
  });

  it('answers a summary question from list_transactions without proposing anything', async () => {
    const { e } = await chargedAlex();
    const { answer, run } = await e.askAssistant('How did this week go?');
    expect(run.steps.filter((s) => s.kind === 'tool').map((s) => s.name)).toEqual(['list_transactions', 'finish']);
    expect(answer).toMatch(/\$20 charged/);
    expect(run.gate.kind).toBe('none');
  });

  it('is reachable over HTTP and returns the agent answer with the new state', async () => {
    const ws = new Workspaces();
    await ws.create('demo');
    const app = await buildApp({ workspaces: ws });
    try {
      const r = await app.inject({ method: 'POST', url: '/api/ws/demo/assistant', payload: { text: 'How did this week go?' } });
      expect(r.statusCode).toBe(200);
      const j = r.json();
      expect(j.result.answer).toMatch(/This week/);
      expect(j.state.agentRuns[0].clientId).toBe('owner');
      const empty = await app.inject({ method: 'POST', url: '/api/ws/demo/assistant', payload: { text: '  ' } });
      expect(empty.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
