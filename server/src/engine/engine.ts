import { AuditLog } from '../audit.js';
import { DAY, DemoClock, HOUR, MINUTE } from '../clock.js';
import { FrontDesk } from '../ai/frontdesk.js';
import { type ApprovedPolicy, type Decision, captureViolations, decide } from '../domain/policy.js';
import { assertTransition, moneyState } from '../domain/stateMachine.js';
import type { Booking, BookingState, ChatMessage, Client, MessageLabel, Service, WaitlistEntry } from '../domain/types.js';
import { type HoldResult, type PaymentsGateway, type WebhookEvent, PaymentsError } from '../paypal/gateway.js';

export type OwnerMode = 'ask' | 'autopilot';

export type Approval =
  | { id: string; kind: 'attendance'; bookingId: string; createdAt: number; prompt: string; options: ['arrived', 'no_show']; resolved?: string }
  | { id: string; kind: 'capture'; bookingId: string; createdAt: number; prompt: string; feeCents: number; options: ['charge', 'waive']; resolved?: string }
  | {
      id: string;
      kind: 'review';
      bookingId: string;
      createdAt: number;
      prompt: string;
      suggested: 'excuse' | 'refill_then_charge';
      options: ['excuse', 'refill_then_charge'];
      resolved?: string;
    };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewApproval = DistributiveOmit<Approval, 'id' | 'createdAt'>;

export interface RefillOffer {
  id: string;
  slotBookingId: string;
  offeredTo: string[]; // client ids, in rank order
  ranked: string[]; // all eligible candidates in rank order
  failed: string[]; // claimers whose hold was declined
  claim?: { clientId: string; bookingId: string };
  status: 'open' | 'claiming' | 'filled' | 'closed';
  text: string;
}

export interface EngineOptions {
  id: string;
  clock: DemoClock;
  gateway: PaymentsGateway;
  frontdesk: (audit: AuditLog) => FrontDesk;
  policy: ApprovedPolicy;
  ownerName: string;
  businessName: string;
  mode?: OwnerMode;
  /** hold strategy: merchant-initiated at T-72h (primary) or authorize at booking + reauthorize at T-72h (fallback) */
  holdStrategy?: 'mit' | 'reauth';
  baseUrl?: string;
}

export type EngineEvent = { type: 'audit' | 'state' | 'message' | 'approval'; at: number };

const HOLD_LEAD = 72 * HOUR;
const OFFER_FANOUT = 3;
const YES = /^\s*(yes|yep|yeah|y|i'?ll take it|claim|me!?)\b/i;

/**
 * Deterministic policy engine and the only caller of the payments gateway.
 * One instance per demo workspace.
 */
export class Engine {
  readonly id: string;
  readonly clock: DemoClock;
  readonly audit: AuditLog;
  readonly frontdesk: FrontDesk;
  readonly gateway: PaymentsGateway;
  policy: ApprovedPolicy;
  mode: OwnerMode;
  holdStrategy: 'mit' | 'reauth';
  ownerName: string;
  businessName: string;

  services = new Map<string, Service>();
  clients = new Map<string, Client>();
  bookings = new Map<string, Booking>();
  waitlist: WaitlistEntry[] = [];
  messages: ChatMessage[] = [];
  approvals: Approval[] = [];
  offers: RefillOffer[] = [];
  excusals: Array<{ clientId: string; at: number }> = [];
  private seenEvents = new Set<string>();
  private seq = 0;
  private listeners = new Set<(e: EngineEvent) => void>();
  /** orderId -> bookingId for buyer-present approvals */
  private pendingOrders = new Map<string, string>();
  private holdAttempts = new Map<string, number>();
  private baseUrl: string;

  constructor(o: EngineOptions) {
    this.id = o.id;
    this.clock = o.clock;
    this.audit = new AuditLog(() => this.clock.now());
    this.frontdesk = o.frontdesk(this.audit);
    this.gateway = o.gateway;
    this.policy = o.policy;
    this.mode = o.mode ?? 'ask';
    this.holdStrategy = o.holdStrategy ?? 'mit';
    this.ownerName = o.ownerName;
    this.businessName = o.businessName;
    this.baseUrl = o.baseUrl ?? '';
    this.audit.subscribe(() => this.emit('audit'));
  }

  // ---------- plumbing ----------

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(type: EngineEvent['type']): void {
    for (const l of this.listeners) l({ type, at: this.clock.now() });
  }

  private nextId(prefix: string): string {
    return `${prefix}_${++this.seq}`;
  }

  now(): number {
    return this.clock.now();
  }

  private setState(b: Booking, to: BookingState, why: string): void {
    if (b.state === to) return;
    assertTransition(b.state, to);
    const from = b.state;
    b.state = to;
    this.audit.add('engine', `${from} → ${to}: ${why}`, { bookingId: b.id });
    this.emit('state');
  }

  booking(id: string): Booking {
    const b = this.bookings.get(id);
    if (!b) throw new Error(`unknown booking ${id}`);
    return b;
  }

  private client(id: string): Client {
    const c = this.clients.get(id);
    if (!c) throw new Error(`unknown client ${id}`);
    return c;
  }

  private customId(b: Booking): string {
    return `${this.id}:${b.id}`;
  }

  private requestId(b: Booking, op: string): string {
    const n = (this.holdAttempts.get(`${b.id}:${op}`) ?? 0) + 1;
    this.holdAttempts.set(`${b.id}:${op}`, n);
    return `${this.id}-${b.id}-${op}-${n}`;
  }

  private slotLabel(b: Booking): string {
    const d = new Date(b.start);
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
    return `${day} ${time}`;
  }

  private say(clientId: string, text: string): void {
    this.messages.push({ id: this.nextId('msg'), at: this.now(), clientId, from: 'frontdesk', text });
    this.audit.add('message', `→ ${this.client(clientId).name}: ${text}`);
    this.emit('message');
  }

  private async reply(b: Booking, situation: string, facts: Record<string, string> = {}): Promise<void> {
    const c = this.client(b.clientId);
    const text = await this.frontdesk.draftReply(c.name, situation, { owner: this.ownerName, appointment: this.slotLabel(b), ...facts }, b.id);
    this.say(c.id, text);
  }

  // ---------- setup ----------

  addService(s: Service): void {
    this.services.set(s.id, s);
  }

  addClient(c: Client): void {
    this.clients.set(c.id, c);
  }

  async addWaitlist(clientId: string, text: string): Promise<WaitlistEntry> {
    const parsed = await this.frontdesk.parseWaitlistEntry(text, [...this.services.values()]);
    const e: WaitlistEntry = { id: this.nextId('wl'), clientId, text, parsed };
    this.waitlist.push(e);
    return e;
  }

  setPolicy(p: ApprovedPolicy): void {
    this.policy = p;
    this.audit.add('owner', `policy v${p.version} approved (${p.hash})`);
    this.emit('state');
  }

  // ---------- booking + holds ----------

  async createBooking(input: { clientId: string; serviceId: string; start: number; refillOf?: string }): Promise<Booking> {
    const svc = this.services.get(input.serviceId);
    if (!svc) throw new Error(`unknown service ${input.serviceId}`);
    const c = this.client(input.clientId);
    const b: Booking = {
      id: this.nextId('bk'),
      clientId: c.id,
      serviceId: svc.id,
      start: input.start,
      end: input.start + svc.durationMin * MINUTE,
      state: 'BOOKED',
      holdCents: this.policy.rules.holdCents,
      policyVersion: this.policy.version,
      policyHash: this.policy.hash,
      ...(input.refillOf ? { refillOfBookingId: input.refillOf } : {}),
    };
    this.bookings.set(b.id, b);
    this.audit.add('engine', `booked ${c.name}, ${svc.name}, ${this.slotLabel(b)} (policy v${b.policyVersion} ${b.policyHash})`, { bookingId: b.id });
    if (c.vaultId) this.setState(b, 'VAULTED', 'wallet already saved with PayPal');

    const lead = b.start - this.now();
    if (lead <= HOLD_LEAD || this.holdStrategy === 'reauth' || !c.vaultId) {
      await this.placeHold(b);
    }
    if (lead > HOLD_LEAD) {
      this.clock.schedule(b.start - HOLD_LEAD, `T-72h hold ${b.id}`, () => this.t72(b.id));
    }
    this.clock.schedule(b.start + 10 * MINUTE, `attendance ${b.id}`, () => this.askAttendance(b.id));
    this.emit('state');
    return b;
  }

  /** Places (or re-places) the hold. MIT with the vaulted wallet when possible; otherwise a buyer approval link. */
  async placeHold(b: Booking, opts: { buyerPresent?: boolean } = {}): Promise<HoldResult> {
    const c = this.client(b.clientId);
    const useVault = c.vaultId && !opts.buyerPresent;
    const res = await this.gateway.placeHold({
      requestId: this.requestId(b, 'hold'),
      amountCents: b.holdCents,
      customId: this.customId(b),
      description: `${this.businessName}: no-show hold for ${this.slotLabel(b)}`,
      ...(useVault ? { vaultId: c.vaultId, simulateDecline: !!c.sandboxDecline } : {}),
    });
    this.audit.add(
      'paypal',
      useVault ? `authorize with vaulted wallet (merchant-initiated) → ${res.status}` : `create AUTHORIZE order (buyer-present) → ${res.status}`,
      { bookingId: b.id, data: res },
    );
    if (res.status === 'AUTHORIZED') {
      if (res.vaultId && res.vaultId !== c.vaultId) c.vaultId = res.vaultId;
      await this.onAuthorized(b, res.authorizationId, res.orderId);
    } else if (res.status === 'PAYER_ACTION_REQUIRED') {
      b.orderId = res.orderId;
      b.approvalLink = res.approvalUrl;
      this.pendingOrders.set(res.orderId, b.id);
    } else {
      await this.onHoldDeclined(b, res.issue);
    }
    return res;
  }

  private async onHoldDeclined(b: Booking, issue: string): Promise<void> {
    if (b.state !== 'HOLD_FAILED') this.setState(b, 'HOLD_FAILED', `PayPal declined the hold (${issue})${this.gateway.mode === 'mock' || this.client(b.clientId).sandboxDecline ? ' [sandbox negative test]' : ''}`);
    if (b.refillOfBookingId) {
      await this.onRefillClaimFailed(b);
      return;
    }
    const daysLeft = Math.max(0, Math.round((b.start - this.now()) / DAY));
    // buyer-present re-approval link
    const res = await this.gateway.placeHold({
      requestId: this.requestId(b, 'reapprove'),
      amountCents: b.holdCents,
      customId: this.customId(b),
      description: `${this.businessName}: re-approve hold for ${this.slotLabel(b)}`,
    });
    if (res.status === 'PAYER_ACTION_REQUIRED') {
      b.orderId = res.orderId;
      b.approvalLink = res.approvalUrl;
      this.pendingOrders.set(res.orderId, b.id);
    }
    this.audit.add('engine', `hold failed: ${daysLeft} days to fix; re-approval link sent`, { bookingId: b.id });
    await this.reply(b, 'hold_failed', { link: b.approvalLink ?? '' });
  }

  /** Buyer approved a PAYER_ACTION_REQUIRED order (PayPal popup / simulator). */
  async completeApproval(orderId: string): Promise<Booking> {
    const bookingId = this.pendingOrders.get(orderId);
    if (!bookingId) throw new Error(`no pending order ${orderId}`);
    const b = this.booking(bookingId);
    const res = await this.gateway.authorizeApprovedOrder(orderId, `${this.id}-${b.id}-authorize-${orderId}`);
    this.audit.add('paypal', `authorize approved order ${orderId} → ${res.status}`, { bookingId: b.id, data: res });
    this.pendingOrders.delete(orderId);
    if (res.status === 'AUTHORIZED') {
      const c = this.client(b.clientId);
      if (res.vaultId) c.vaultId = res.vaultId;
      c.sandboxDecline = false; // the fresh approval succeeded
      b.approvalLink = undefined;
      await this.onAuthorized(b, res.authorizationId, res.orderId);
    } else if (res.status === 'DECLINED') {
      await this.onHoldDeclined(b, res.issue);
    }
    return b;
  }

  /** Idempotent: called from the synchronous API result and from the PAYMENT.AUTHORIZATION.CREATED webhook. */
  private async onAuthorized(b: Booking, authorizationId: string, orderId?: string): Promise<void> {
    if (b.authorizationId === authorizationId) return;
    b.authorizationId = authorizationId;
    b.authorizedAt = this.now();
    if (orderId) b.orderId = orderId;
    if (['BOOKED', 'VAULTED', 'HOLD_FAILED'].includes(b.state)) this.setState(b, 'HELD', `hold of $${(b.holdCents / 100).toFixed(2)} authorized (${authorizationId})`);
    else this.audit.add('engine', `hold refreshed (${authorizationId})`, { bookingId: b.id });
    if (b.refillOfBookingId) await this.onRefillClaimAuthorized(b);
  }

  /** T-72h job. Primary: merchant-initiated authorize. Fallback: reauthorize the at-booking hold. */
  private async t72(bookingId: string): Promise<void> {
    const b = this.booking(bookingId);
    if (!['BOOKED', 'VAULTED', 'HELD'].includes(b.state)) return;
    if (b.state === 'HELD' && b.authorizationId) {
      if (this.now() - (b.authorizedAt ?? 0) < 3 * DAY) return; // still inside the honor period
      const c = this.client(b.clientId);
      const r = await this.gateway.reauthorize(b.authorizationId, b.holdCents, this.requestId(b, 'reauth'), !!c.sandboxDecline);
      this.audit.add('paypal', `reauthorize at T-72h → ${r.status}`, { bookingId: b.id, data: r });
      if (r.status === 'AUTHORIZED' && r.authorizationId) await this.onAuthorized(b, r.authorizationId);
      else await this.onHoldDeclined(b, r.issue ?? 'DECLINED');
      return;
    }
    await this.placeHold(b);
  }

  // ---------- webhooks ----------

  async ingestWebhook(e: WebhookEvent): Promise<'processed' | 'duplicate' | 'ignored'> {
    if (this.seenEvents.has(e.id)) {
      this.audit.add('webhook', `${e.event_type} ${e.id}: duplicate, ignored`);
      return 'duplicate';
    }
    this.seenEvents.add(e.id);
    const bookingId = e.resource.custom_id?.split(':')[1];
    const b = bookingId ? this.bookings.get(bookingId) : undefined;
    this.audit.add('webhook', `${e.event_type} ${e.resource.id}`, { bookingId: b?.id, data: e });
    if (!b) return 'ignored';
    if (e.event_type === 'PAYMENT.AUTHORIZATION.CREATED') await this.onAuthorized(b, e.resource.id);
    return 'processed';
  }

  // ---------- client messages ----------

  activeBookingFor(clientId: string): Booking | undefined {
    return [...this.bookings.values()]
      .filter((b) => b.clientId === clientId && ['BOOKED', 'VAULTED', 'HELD', 'HOLD_FAILED'].includes(b.state) && b.end > this.now())
      .sort((a, b) => a.start - b.start)[0];
  }

  async receiveMessage(clientId: string, text: string): Promise<{ label?: MessageLabel; decision?: Decision; claimed?: boolean }> {
    const c = this.client(clientId);
    this.messages.push({ id: this.nextId('msg'), at: this.now(), clientId, from: 'client', text });
    this.audit.add('message', `← ${c.name}: ${text}`);
    this.emit('message');

    const offer = this.offers.filter((o) => o.offeredTo.includes(clientId) && o.status !== 'closed').at(-1);
    if (offer && YES.test(text)) return { claimed: await this.claim(offer, clientId) };

    const b = this.activeBookingFor(clientId);
    if (!b) {
      this.say(clientId, `Thanks, ${c.name.split(' ')[0]}! ${this.ownerName} will get back to you.`);
      return {};
    }
    const label = await this.frontdesk.classifyMessage(text, c.name, this.slotLabel(b), b.id);
    b.lastLabel = label;
    const decision = await this.requestSettlement(b, label);
    return { label, decision };
  }

  /** The AI's only lever on money: it proposes a label; the engine decides and acts. */
  async requestSettlement(b: Booking, label: MessageLabel): Promise<Decision> {
    const d = decide({ booking: b, rules: this.policy.rules, now: this.now(), kind: 'cancel', label, priorExcusals: this.priorExcusals(b.clientId) });
    this.audit.add('engine', `decide → ${d.outcome}: ${d.why}`, { bookingId: b.id, data: d });
    switch (d.outcome) {
      case 'CLARIFY':
        await this.reply(b, 'clarify');
        break;
      case 'NO_ACTION':
        await this.reply(b, label.intent === 'running_late' ? 'running_late' : 'ack');
        break;
      case 'VOID_EARLY':
        await this.voidHold(b, 'cancelled outside the fee window');
        this.setState(b, 'CANCELLED_EARLY', d.why);
        await this.reply(b, 'cancelled_early');
        break;
      case 'EXCUSE':
        if (this.mode === 'ask') {
          this.addApproval({ kind: 'review', bookingId: b.id, prompt: `${this.client(b.clientId).name}: "${label.evidenceSpan}". Policy says excuse (no charge).`, suggested: 'excuse', options: ['excuse', 'refill_then_charge'] });
        } else {
          await this.excuse(b, d.why);
        }
        break;
      case 'OWNER_REVIEW':
        this.addApproval({
          kind: 'review',
          bookingId: b.id,
          prompt: `${this.client(b.clientId).name}: "${label.evidenceSpan}". ${d.why}.`,
          suggested: d.suggested === 'EXCUSE' ? 'excuse' : 'refill_then_charge',
          options: ['excuse', 'refill_then_charge'],
        });
        await this.reply(b, 'owner_review');
        break;
      case 'PENDING_REFILL':
        b.cancelledAt = this.now();
        await this.startRefill(b, d.why);
        break;
    }
    return d;
  }

  private priorExcusals(clientId: string): number {
    const since = this.now() - this.policy.rules.excusalLimit.months * 30 * DAY;
    return this.excusals.filter((e) => e.clientId === clientId && e.at >= since).length;
  }

  private async voidHold(b: Booking, why: string): Promise<void> {
    if (!b.authorizationId) return;
    try {
      await this.gateway.void(b.authorizationId, this.requestId(b, 'void'));
      this.audit.add('paypal', `void authorization ${b.authorizationId}: ${why}`, { bookingId: b.id });
    } catch (err) {
      this.audit.add('paypal', `void failed: ${(err as Error).message}`, { bookingId: b.id });
      throw err;
    }
  }

  private async excuse(b: Booking, why: string): Promise<void> {
    await this.voidHold(b, why);
    this.setState(b, 'EXCUSED', why);
    this.excusals.push({ clientId: b.clientId, at: this.now() });
    await this.reply(b, 'excused', { slots: this.suggestSlots(b).join(', ') });
  }

  /** Free slots of the same service in the next 7 days, on the hour, 10:00-18:00 UTC. */
  suggestSlots(b: Booking, n = 3): string[] {
    const svc = this.services.get(b.serviceId)!;
    const out: string[] = [];
    const base = new Date(this.now());
    base.setUTCHours(0, 0, 0, 0);
    for (let d = 1; d <= 7 && out.length < n; d++) {
      for (let h = 10; h <= 18 && out.length < n; h += 2) {
        const start = base.getTime() + d * DAY + h * HOUR;
        const end = start + svc.durationMin * MINUTE;
        const clash = [...this.bookings.values()].some(
          (x) => !['CANCELLED_EARLY', 'EXCUSED', 'REFILLED'].includes(x.state) && x.start < end && start < x.end,
        );
        if (!clash && new Date(start).getUTCDay() !== 0) out.push(this.slotLabel({ ...b, start }));
      }
    }
    return out;
  }

  // ---------- refill ----------

  eligibleWaitlist(b: Booking): WaitlistEntry[] {
    const d = new Date(b.start);
    const dow = d.getUTCDay();
    const startMin = d.getUTCHours() * 60 + d.getUTCMinutes();
    const svc = this.services.get(b.serviceId)!;
    return this.waitlist.filter((w) => {
      const p = w.parsed;
      if (!p || w.clientId === b.clientId) return false;
      if (p.serviceIds.length && !p.serviceIds.includes(b.serviceId)) return false;
      if (p.days.length && !p.days.includes(dow)) return false;
      return startMin >= p.earliestMin && startMin + svc.durationMin <= p.latestMin;
    });
  }

  private async startRefill(b: Booking, why: string): Promise<void> {
    this.setState(b, 'PENDING_REFILL', why);
    const svc = this.services.get(b.serviceId)!;
    const eligible = this.eligibleWaitlist(b);
    if (b.start > this.now() && eligible.length) {
      const { order, offer } = await this.frontdesk.rankAndDraftOffer(
        this.slotLabel(b),
        svc.name,
        eligible.map((w) => ({ id: w.clientId, name: this.client(w.clientId).name, text: w.text })),
      );
      const o: RefillOffer = { id: this.nextId('offer'), slotBookingId: b.id, ranked: order, offeredTo: order.slice(0, OFFER_FANOUT), failed: [], status: 'open', text: offer };
      this.offers.push(o);
      this.audit.add('engine', `refill: offered to ${o.offeredTo.map((id) => this.client(id).name).join(', ')}`, { bookingId: b.id });
      for (const id of o.offeredTo) this.say(id, offer);
      await this.reply(b, 'pending_refill');
      this.clock.schedule(b.start, `refill cutoff ${b.id}`, () => this.refillCutoff(b.id));
    } else {
      this.audit.add('engine', `refill: ${b.start <= this.now() ? 'slot already started' : 'no eligible waitlisters'}`, { bookingId: b.id });
      await this.refillCutoff(b.id);
    }
  }

  private async claim(o: RefillOffer, clientId: string): Promise<boolean> {
    const name = this.client(clientId).name;
    if (o.status !== 'open') {
      this.say(clientId, `Sorry ${name.split(' ')[0]}, that spot was just claimed. You're still on the waitlist.`);
      this.audit.add('engine', `claim by ${name} rejected: offer is ${o.status}`, { bookingId: o.slotBookingId });
      return false;
    }
    const slot = this.booking(o.slotBookingId);
    o.status = 'claiming';
    this.audit.add('engine', `claim by ${name}; slot fills only when their hold is authorized`, { bookingId: slot.id });
    o.claim = { clientId, bookingId: '' };
    const nb = await this.createBooking({ clientId, serviceId: slot.serviceId, start: slot.start, refillOf: slot.id });
    if (o.claim?.clientId === clientId) o.claim.bookingId = nb.id;
    if ((nb.state === 'BOOKED' || nb.state === 'VAULTED') && nb.approvalLink) {
      this.say(clientId, `It's yours if you approve a $${(nb.holdCents / 100).toFixed(0)} PayPal hold in the next 10 minutes: ${nb.approvalLink}`);
      this.clock.schedule(this.now() + 10 * MINUTE, `claim timeout ${nb.id}`, async () => {
        if (o.claim?.bookingId === nb.id && o.status === 'claiming') await this.onRefillClaimFailed(nb, 'approval timed out');
      });
    }
    return true;
  }

  private async onRefillClaimAuthorized(nb: Booking): Promise<void> {
    const o = this.offerForClaim(nb);
    const slot = this.booking(nb.refillOfBookingId!);
    if (!o || o.status !== 'claiming' || slot.state !== 'PENDING_REFILL') return;
    o.status = 'filled';
    slot.refilledByBookingId = nb.id;
    await this.voidHold(slot, 'slot refilled');
    this.setState(slot, 'REFILLED', `refilled by ${this.client(nb.clientId).name}`);
    this.say(nb.clientId, `Confirmed! See you ${this.slotLabel(nb)}.`);
    for (const id of o.offeredTo.filter((x) => x !== nb.clientId)) this.say(id, 'That spot has been filled. You are still on the waitlist.');
    await this.reply(slot, 'refilled');
  }

  private offerForClaim(nb: Booking): RefillOffer | undefined {
    return this.offers.find((x) => x.slotBookingId === nb.refillOfBookingId && x.claim?.clientId === nb.clientId && (x.claim.bookingId === '' || x.claim.bookingId === nb.id));
  }

  private async onRefillClaimFailed(nb: Booking, why = 'hold declined'): Promise<void> {
    const o = this.offerForClaim(nb);
    if (nb.state !== 'CANCELLED_EARLY') this.setState(nb, 'CANCELLED_EARLY', `refill claim failed: ${why}`);
    if (!o) return;
    o.failed.push(nb.clientId);
    o.claim = undefined;
    this.say(nb.clientId, `Sorry, PayPal couldn't place the hold, so we offered the spot to the next person.`);
    const next = o.ranked.find((id) => !o.offeredTo.includes(id));
    o.offeredTo = o.offeredTo.filter((id) => id !== nb.clientId);
    if (next) {
      o.offeredTo.push(next);
      this.say(next, o.text);
    }
    o.status = o.offeredTo.length ? 'open' : 'closed';
    this.audit.add('engine', `refill: ${this.client(nb.clientId).name}'s hold failed (${why}); ${next ? `offered to ${this.client(next).name}` : 'still open to the others'}`, {
      bookingId: o.slotBookingId,
    });
  }

  private async refillCutoff(bookingId: string): Promise<void> {
    const b = this.booking(bookingId);
    if (b.state !== 'PENDING_REFILL') return;
    for (const o of this.offers.filter((x) => x.slotBookingId === b.id && x.status === 'open')) o.status = 'closed';
    const fee = decide({ booking: b, rules: this.policy.rules, now: this.now(), kind: 'no_show', priorExcusals: 0 });
    const feeCents = fee.outcome === 'PENDING_REFILL' || fee.outcome === 'OWNER_REVIEW' ? fee.feeCents : b.holdCents;
    const lateFee = Math.min(this.policy.rules.lateCancelFeeCents, b.holdCents);
    this.addApproval({
      kind: 'capture',
      bookingId: b.id,
      prompt: `${this.client(b.clientId).name}'s spot wasn't refilled. Charge the fee from the hold?`,
      feeCents: b.cancelledAt ? lateFee : feeCents,
      options: ['charge', 'waive'],
    });
  }

  // ---------- attendance ----------

  private async askAttendance(bookingId: string): Promise<void> {
    const b = this.booking(bookingId);
    if (b.state !== 'HELD') return;
    this.addApproval({ kind: 'attendance', bookingId: b.id, prompt: `Did ${this.client(b.clientId).name} show up?`, options: ['arrived', 'no_show'] });
    const endOfDay = new Date(b.start);
    endOfDay.setUTCHours(23, 59, 0, 0);
    this.clock.schedule(endOfDay.getTime(), `end-of-day review ${b.id}`, () => {
      if (b.state === 'HELD') this.setState(b, 'NEEDS_REVIEW', 'attendance not answered; nothing charged or voided automatically');
    });
  }

  // ---------- owner approvals ----------

  private addApproval(a: NewApproval): Approval {
    const full = { ...a, id: this.nextId('ap'), createdAt: this.now() } as Approval;
    this.approvals.push(full);
    this.audit.add('engine', `approval card: ${full.prompt}`, { bookingId: full.bookingId });
    this.emit('approval');
    return full;
  }

  openApprovals(): Approval[] {
    return this.approvals.filter((a) => !a.resolved);
  }

  async resolveApproval(id: string, choice: string): Promise<Booking> {
    const a = this.approvals.find((x) => x.id === id);
    if (!a) throw new Error(`unknown approval ${id}`);
    if (a.resolved) throw new Error(`approval ${id} already resolved (${a.resolved})`);
    if (!(a.options as string[]).includes(choice)) throw new Error(`invalid choice ${choice}`);
    a.resolved = choice;
    const b = this.booking(a.bookingId);
    this.audit.add('owner', `${this.ownerName} tapped "${choice}" on: ${a.prompt}`, { bookingId: b.id });
    if (a.kind === 'attendance') {
      if (choice === 'arrived') {
        await this.voidHold(b, 'client arrived');
        this.setState(b, 'ATTENDED', 'owner marked arrived');
      } else {
        await this.startRefill(b, 'owner marked no-show');
      }
    } else if (a.kind === 'review') {
      if (choice === 'excuse') await this.excuse(b, 'owner excused');
      else {
        b.cancelledAt = this.now();
        await this.startRefill(b, 'owner chose refill-then-charge');
      }
    } else if (a.kind === 'capture') {
      if (choice === 'charge') await this.capture(b, a.feeCents);
      else await this.excuse(b, 'owner waived the fee');
    }
    this.emit('approval');
    return b;
  }

  /** Every capture path ends here, after an owner tap. */
  private async capture(b: Booking, feeCents: number): Promise<void> {
    if (!b.authorizationId) throw new Error('no authorization to capture');
    const violations = captureViolations({ amountCents: feeCents, authorizedCents: b.holdCents, rules: this.policy.rules, label: b.lastLabel, ownerApproved: true });
    if (violations.length) {
      this.audit.add('engine', `capture blocked: ${violations.join('; ')}`, { bookingId: b.id });
      throw new PaymentsError('ENGINE_INVARIANT', violations.join('; '));
    }
    if (this.now() - (b.authorizedAt ?? 0) > 3 * DAY) {
      const r = await this.gateway.reauthorize(b.authorizationId, b.holdCents, this.requestId(b, 'reauth'));
      this.audit.add('paypal', `honor period over: reauthorize first → ${r.status}`, { bookingId: b.id, data: r });
      if (r.status !== 'AUTHORIZED' || !r.authorizationId) throw new PaymentsError(r.issue ?? 'REAUTHORIZE_FAILED', 'could not refresh the hold before capture');
      await this.onAuthorized(b, r.authorizationId);
    }
    const r = await this.gateway.capture({
      requestId: this.requestId(b, 'capture'),
      authorizationId: b.authorizationId,
      amountCents: feeCents,
      finalCapture: true,
      noteToPayer: `${this.businessName}: fee per the policy you approved (v${b.policyVersion})`,
    });
    this.audit.add('paypal', `capture $${(feeCents / 100).toFixed(2)} (final_capture) → ${r.status}`, { bookingId: b.id, data: r });
    if (r.status !== 'COMPLETED') throw new PaymentsError(r.issue);
    b.captureId = r.captureId;
    this.setState(b, 'CHARGED', `fee captured (${r.captureId})`);
    await this.reply(b, 'charged', { fee: `$${(feeCents / 100).toFixed(0)}` });
  }

  /** Owner relents after a capture. */
  async refund(bookingId: string): Promise<Booking> {
    const b = this.booking(bookingId);
    if (b.state !== 'CHARGED' || !b.captureId) throw new Error('nothing to refund');
    if (b.refundId) throw new Error('already refunded');
    const r = await this.gateway.refund(b.captureId, b.holdCents, this.requestId(b, 'refund'));
    b.refundId = r.refundId;
    this.audit.add('paypal', `refund ${r.refundId} ($${(r.amountCents / 100).toFixed(2)})`, { bookingId: b.id, data: r });
    this.say(b.clientId, `${this.ownerName} refunded your fee. No hard feelings!`);
    this.emit('state');
    return b;
  }

  // ---------- views ----------

  snapshot() {
    const view = (b: Booking) => ({
      ...b,
      clientName: this.client(b.clientId).name,
      serviceName: this.services.get(b.serviceId)?.name,
      money: b.refundId ? 'refunded' : moneyState(b.state, !!b.captureId),
    });
    return {
      workspace: this.id,
      now: this.now(),
      mode: this.mode,
      paymentsMode: this.gateway.mode,
      aiProvider: this.frontdesk.providerName,
      owner: this.ownerName,
      business: this.businessName,
      policy: this.policy,
      services: [...this.services.values()],
      clients: [...this.clients.values()].map(({ id, name, vaultId, sandboxDecline }) => ({ id, name, vaulted: !!vaultId, sandboxDecline: !!sandboxDecline })),
      bookings: [...this.bookings.values()].sort((a, b) => a.start - b.start).map(view),
      waitlist: this.waitlist,
      approvals: this.openApprovals(),
      offers: this.offers,
      messages: this.messages,
      jobs: this.clock.pending(),
    };
  }
}
