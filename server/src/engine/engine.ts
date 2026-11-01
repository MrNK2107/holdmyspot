import { AuditLog } from '../audit.js';
import { DAY, DemoClock, HOUR, MINUTE } from '../clock.js';
import { type AgentTool, MONEY_TOOLS_NOT_GIVEN, type TraceStep } from '../ai/agent.js';
import { FrontDesk } from '../ai/frontdesk.js';
import { type ApprovedPolicy, type Decision, captureViolations, decide } from '../domain/policy.js';
import { assertTransition, isTerminal, moneyState } from '../domain/stateMachine.js';
import type { Booking, BookingState, ChatMessage, Client, MessageLabel, Service, WaitlistEntry } from '../domain/types.js';
import { slotMatches } from '../domain/waitlist.js';
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
    }
  | { id: string; kind: 'refund'; bookingId: string; createdAt: number; prompt: string; feeCents: number; suggested: 'refund'; options: ['refund', 'keep']; resolved?: string };

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

/** One inspectable run of the front desk on an inbound client text: tool calls, policy decision, money gate. */
export interface AgentRun {
  id: string;
  at: number;
  clientId: string;
  clientName: string;
  text: string;
  bookingId?: string;
  provider: string;
  steps: TraceStep[];
  /** owner requests: the agent's reply */
  answer?: string;
  /** where money stands after the run */
  gate: { kind: 'none' | 'auto_release' | 'owner_approval' | 'refill' | 'code'; summary: string; approvalId?: string; resolved?: string };
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
  agentRuns: AgentRun[] = [];
  offers: RefillOffer[] = [];
  excusals: Array<{ clientId: string; at: number }> = [];
  private seenEvents = new Set<string>();
  private seq = 0;
  private listeners = new Set<(e: EngineEvent) => void>();
  /** orderId -> bookingId for buyer-present approvals */
  private pendingOrders = new Map<string, string>();
  /** clientId -> slots offered after an excused cancellation */
  private rebookOffers = new Map<string, { serviceId: string; slots: number[] }>();
  /** setupTokenId -> bookingId for Vault v3 approvals */
  private pendingSetups = new Map<string, string>();
  /** bookingId -> every authorization id seen for it (guards against late/duplicate events) */
  private knownAuths = new Map<string, Set<string>>();
  private holdAttempts = new Map<string, number>();
  /** late authorizations whose void failed: shown to the owner, never silently dropped */
  unreleasedAuths: Array<{ bookingId: string; authorizationId: string; error: string }> = [];
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
    if (isTerminal(to)) this.dropPendingApprovals(b);
    this.emit('state');
  }

  /** A finished booking must never be revived by a late PayPal approval. */
  private dropPendingApprovals(b: Booking): void {
    for (const [k, v] of this.pendingOrders) if (v === b.id) this.pendingOrders.delete(k);
    for (const [k, v] of this.pendingSetups) if (v === b.id) this.pendingSetups.delete(k);
    b.approvalLink = undefined;
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

  /** New-intent key (each hold attempt is a distinct intent, e.g. a retry after a decline). */
  private requestId(b: Booking, op: string): string {
    const n = (this.holdAttempts.get(`${b.id}:${op}`) ?? 0) + 1;
    this.holdAttempts.set(`${b.id}:${op}`, n);
    return `${this.id}-${b.id}-${op}-${n}`;
  }

  /** Key derived from the business intent, so a retried capture/void/reauth/refund can never act twice. */
  private intentKey(b: Booking, op: string, target: string): string {
    return `${this.id}-${b.id}-${op}-${target}`;
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

  /** New client from the public booking page (no saved wallet yet). */
  newClient(name: string): Client {
    const clean = name.trim().slice(0, 40);
    if (!clean) throw new Error('name is required');
    const c: Client = { id: this.nextId('cl'), name: clean };
    this.addClient(c);
    return c;
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
    if (lead <= HOLD_LEAD || this.holdStrategy === 'reauth' || input.refillOf) {
      await this.placeHold(b);
    } else if (!c.vaultId) {
      await this.startVaultSetup(b);
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

  /** More than 72h out and no saved wallet: save it now (Vault v3 setup token), hold at T-72h. */
  private async startVaultSetup(b: Booking): Promise<void> {
    const r = await this.gateway.createVaultSetup({
      requestId: this.requestId(b, 'vault'),
      customId: this.customId(b),
      description: `${this.businessName}: save PayPal for a $${(b.holdCents / 100).toFixed(0)} hold 3 days before your visit`,
    });
    b.approvalLink = r.approvalUrl;
    this.pendingSetups.set(r.setupTokenId, b.id);
    this.audit.add('paypal', `vault setup token ${r.setupTokenId} created (save wallet, no hold yet)`, { bookingId: b.id });
  }

  hasPendingApproval(id: string): boolean {
    return this.pendingOrders.has(id) || this.pendingSetups.has(id);
  }

  /** Buyer approved a PAYER_ACTION_REQUIRED order or a vault setup token (PayPal popup / simulator). */
  async completeApproval(orderId: string): Promise<Booking> {
    const setupFor = this.pendingSetups.get(orderId);
    if (setupFor) {
      const b = this.booking(setupFor);
      const { vaultId } = await this.gateway.completeVaultSetup(orderId, `${this.id}-${b.id}-vaulttoken-${orderId}`);
      this.pendingSetups.delete(orderId);
      this.client(b.clientId).vaultId = vaultId;
      b.approvalLink = undefined;
      this.audit.add('paypal', `payment token ${vaultId} created from setup token`, { bookingId: b.id });
      if (b.state === 'BOOKED') this.setState(b, 'VAULTED', 'wallet saved with PayPal; hold will be placed 72h before the visit');
      return b;
    }
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
    const known = this.knownAuths.get(b.id) ?? new Set<string>();
    this.knownAuths.set(b.id, known);
    if (known.has(authorizationId)) return; // duplicate, or an older auth arriving late
    known.add(authorizationId);
    if ((isTerminal(b.state) && b.state !== 'CHARGED') || (b.state === 'PENDING_REFILL' && !b.authorizationId)) {
      // e.g. an approval that arrives after the booking was cancelled: release it right away
      try {
        await this.gateway.void(authorizationId, this.intentKey(b, 'void', authorizationId));
        this.audit.add('paypal', `void late authorization ${authorizationId}: booking is ${b.state}`, { bookingId: b.id });
      } catch (err) {
        // never claim a release that did not happen: keep it visible so the owner can release it
        this.unreleasedAuths.push({ bookingId: b.id, authorizationId, error: (err as Error).message });
        this.audit.add('paypal', `VOID FAILED for late authorization ${authorizationId} (${(err as Error).message}); needs a manual release`, { bookingId: b.id });
        this.emit('state');
      }
      return;
    }
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
      const r = await this.gateway.reauthorize(b.authorizationId, b.holdCents, this.intentKey(b, 'reauth', b.authorizationId), !!c.sandboxDecline);
      this.audit.add('paypal', `reauthorize at T-72h → ${r.status}`, { bookingId: b.id, data: r });
      if (r.status === 'AUTHORIZED' && r.authorizationId) {
        b.reauthorized = true;
        await this.onAuthorized(b, r.authorizationId);
      }
      else await this.onHoldDeclined(b, r.issue ?? 'DECLINED');
      return;
    }
    const res = await this.placeHold(b);
    if (res.status === 'PAYER_ACTION_REQUIRED') await this.reply(b, 'approve_hold', { link: res.approvalUrl });
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

  async receiveMessage(clientId: string, text: string): Promise<{ label?: MessageLabel; decision?: Decision; claimed?: boolean; rebooked?: string }> {
    const c = this.client(clientId);
    this.messages.push({ id: this.nextId('msg'), at: this.now(), clientId, from: 'client', text });
    this.audit.add('message', `← ${c.name}: ${text}`);
    this.emit('message');

    const offer = this.offers.filter((o) => o.offeredTo.includes(clientId) && o.status !== 'closed').at(-1);
    if (offer && YES.test(text)) {
      const run = this.startRun(clientId, text, offer.slotBookingId);
      run.steps.push({ n: 1, kind: 'code', name: 'route: YES to an open refill offer', result: 'claim handled by code, no AI: the slot is theirs only once their own PayPal hold authorizes' });
      const claimed = await this.traced(run, () => this.claim(offer, clientId));
      run.gate = { kind: 'code', summary: claimed ? 'claim started: the slot fills when their PayPal hold authorizes' : 'claim rejected: the offer is no longer open' };
      return { claimed };
    }

    const rebook = this.rebookOffers.get(clientId);
    const pick = text.trim().match(/^([1-3])(?!\d)/);
    if (rebook && pick) {
      const start = rebook.slots[Number(pick[1]) - 1];
      const stillFree = start !== undefined && this.freeSlots(rebook.serviceId, 12).includes(start);
      if (!stillFree) {
        this.say(clientId, 'Sorry, that time was just taken. Want me to send new options?');
        return {};
      }
      this.rebookOffers.delete(clientId);
      const run = this.startRun(clientId, text);
      run.steps.push({ n: 1, kind: 'code', name: `route: picked rebook option ${pick[1]}`, result: 'new booking created by code, no AI' });
      const nb = await this.traced(run, async () => {
        const x = await this.createBooking({ clientId, serviceId: rebook.serviceId, start });
        await this.reply(x, 'rebooked');
        return x;
      });
      run.bookingId = nb.id;
      run.gate = { kind: 'code', summary: 'rebooked; the new visit gets its own hold' };
      return { rebooked: nb.id };
    }

    const b = this.activeBookingFor(clientId);
    const run = this.startRun(clientId, text, b?.id);
    let label: MessageLabel | undefined;
    let decision: Decision | undefined;
    const approvalsBefore = new Set(this.approvals.map((a) => a.id));
    // The agent's whole toolset. Nothing here can authorize, capture, void or refund.
    const tools: AgentTool[] = [
      {
        name: 'get_booking',
        access: 'read',
        description: "The client's next active booking: id, service, time, hold state, hours until start.",
        run: async () =>
          b
            ? {
                bookingId: b.id,
                service: this.services.get(b.serviceId)?.name,
                when: this.slotLabel(b),
                hold: b.authorizationId ? 'authorized' : b.state === 'VAULTED' ? 'wallet saved' : 'none',
                hoursUntilStart: Math.round((b.start - this.now()) / HOUR),
              }
            : { bookingId: null },
      },
      {
        name: 'get_policy',
        access: 'read',
        description: 'The owner-approved cancellation policy: version, hash, free-cancel window, excused reasons.',
        run: async () => ({
          version: this.policy.version,
          hash: this.policy.hash,
          freeCancelHours: this.policy.rules.freeCancelHours,
          excusedReasons: this.policy.rules.excusedReasons,
          minConfidence: this.policy.rules.minConfidence,
        }),
      },
      {
        name: 'classify_message',
        access: 'model',
        description: 'Constrained model call: label intent, reason, confidence and the evidence words. Returns a label only.',
        run: async () => {
          if (!b) return { error: 'no booking' };
          const l = await this.frontdesk.classifyMessage(text, c.name, this.slotLabel(b), b.id);
          return { intent: l.intent, reason: l.reason, confidence: l.confidence, evidenceSpan: l.evidenceSpan, ...(l.proposedTime ? { proposedTime: l.proposedTime } : {}) };
        },
      },
      {
        name: 'propose_settlement',
        access: 'propose',
        description: 'Hand a label to the deterministic policy engine. The engine decides; any charge waits for the owner. Once per message.',
        run: async (args) => {
          if (!b || args.bookingId !== b.id) return { error: "bookingId must be this client's active booking" };
          if (decision) return { error: 'already proposed for this message' };
          label = this.frontdesk.sanitizeLabel(args);
          b.lastLabel = label;
          decision = await this.requestSettlement(b, label);
          return { outcome: decision.outcome, why: decision.why };
        },
      },
      { name: 'finish', access: 'end', description: 'End the turn.', run: async () => ({}) },
    ];
    try {
      await this.traced(run, () =>
        this.frontdesk.agent.run({ trigger: 'client_text', clientName: c.name, text }, tools, (st) => {
          const rec = { ...st, n: run.steps.length + 1 };
          run.steps.push(rec);
          return rec;
        }, b?.id),
      );
    } catch (err) {
      // a provider outage must not drop the client's message: the fixed pipeline below takes over
      run.steps.push({ n: run.steps.length + 1, kind: 'code', name: 'agent error', result: String((err as Error).message).slice(0, 200) });
      this.audit.add('ai', `agent failed: ${(err as Error).message}`, { bookingId: b?.id });
    }

    if (!b) {
      this.say(clientId, `Thanks, ${c.name.split(' ')[0]}! ${this.ownerName} will get back to you.`);
      run.gate = { kind: 'none', summary: 'no upcoming visit: handed to the owner, no money involved' };
      return {};
    }
    if (!decision) {
      // the agent stopped without proposing: run the fixed pipeline rather than drop the message
      run.steps.push({ n: run.steps.length + 1, kind: 'code', name: 'fallback: agent made no proposal', result: 'classify + policy engine run by code' });
      await this.traced(run, async () => {
        label = await this.frontdesk.classifyMessage(text, c.name, this.slotLabel(b), b.id);
        b.lastLabel = label;
        decision = await this.requestSettlement(b, label);
      });
    }
    const d = decision as unknown as Decision;
    const card = this.approvals.find((a) => !approvalsBefore.has(a.id) && a.bookingId === b.id);
    run.gate = card
      ? { kind: 'owner_approval', summary: `waiting for ${this.ownerName}'s tap: ${card.options.join(' / ')}`, approvalId: card.id }
      : b.state === 'PENDING_REFILL'
        ? { kind: 'refill', summary: 'slot offered to the waitlist first; any fee later needs an owner tap' }
        : ['EXCUSED', 'CANCELLED_EARLY'].includes(b.state)
          ? { kind: 'auto_release', summary: 'released automatically: voiding a hold returns money, it never charges' }
          : { kind: 'none', summary: `no money moved (${d.outcome})` };
    return { label, decision: d };
  }

  /**
   * The owner asks the front desk in plain words ("how did this week go?", "Alex apologised, refund her").
   * Same agent loop, owner toolset: read PayPal activity, find a booking, and *propose* a refund, which
   * becomes a card the owner taps. The agent still has no tool that moves money.
   */
  async askAssistant(text: string): Promise<{ answer: string; run: AgentRun }> {
    const ask = String(text ?? '').slice(0, 300);
    if (!ask.trim()) throw new Error('ask the front desk something');
    const run: AgentRun = {
      id: this.nextId('run'),
      at: this.now(),
      clientId: 'owner',
      clientName: `${this.ownerName} (owner)`,
      text: ask,
      provider: this.frontdesk.providerName,
      steps: [],
      gate: { kind: 'none', summary: 'answered; no money moved' },
    };
    this.agentRuns.push(run);
    if (this.agentRuns.length > 60) this.agentRuns.shift();
    this.audit.add('owner', `${this.ownerName} asked the front desk: ${ask}`);
    const charged = () => [...this.bookings.values()].filter((b) => b.state === 'CHARGED' && b.captureId);
    let card: Approval | undefined;
    const tools: AgentTool[] = [
      {
        name: 'list_transactions',
        access: 'read',
        description: "This week's PayPal objects per booking (authorization, capture, refund) and totals.",
        run: async () => {
          const s = this.snapshot();
          const sum = (f: (b: (typeof s.bookings)[number]) => number) => s.bookings.reduce((a, b) => a + f(b), 0);
          return {
            totals: {
              heldCents: sum((b) => (b.money === 'held' || b.money === 'pending-refill' ? b.holdCents : 0)),
              chargedCents: sum((b) => (b.captureId ? (b.capturedCents ?? 0) : 0)),
              refundedCents: sum((b) => (b.refundId ? (b.capturedCents ?? 0) : 0)),
              refilled: s.bookings.filter((b) => b.state === 'REFILLED').length,
              excused: s.bookings.filter((b) => b.state === 'EXCUSED').length,
            },
            transactions: s.bookings
              .filter((b) => b.authorizationId || b.captureId)
              .map((b) => ({ bookingId: b.id, client: b.clientName, money: b.money, authorizationId: b.authorizationId, captureId: b.captureId, refundId: b.refundId })),
          };
        },
      },
      {
        name: 'find_booking',
        access: 'read',
        description: 'Find the most recent charged booking for a client named in the query (first or full name).',
        run: async (args) => {
          const q = String(args.query ?? args.client ?? '').toLowerCase();
          const b = charged()
            .filter((x) => {
              const name = this.client(x.clientId).name.toLowerCase();
              return q.includes(name) || q.split(/\W+/).includes(name.split(' ')[0]);
            })
            .sort((x, y) => y.start - x.start)[0];
          if (!b) return { bookingId: null };
          return { bookingId: b.id, client: this.client(b.clientId).name, when: this.slotLabel(b), capturedCents: b.capturedCents, captureId: b.captureId, refunded: !!b.refundId };
        },
      },
      {
        name: 'propose_refund',
        access: 'propose',
        description: 'Prepare a full refund of a captured fee as a card for the owner to tap. Does not refund anything itself.',
        run: async (args) => {
          const b = this.bookings.get(String(args.bookingId ?? ''));
          if (!b || b.state !== 'CHARGED' || !b.captureId) return { error: 'that booking has no captured fee' };
          if (b.refundId) return { error: 'that fee is already refunded' };
          const open = this.openApprovals().find((a) => a.kind === 'refund' && a.bookingId === b.id);
          if (open) return { status: 'awaiting_owner', approvalId: open.id };
          const fee = b.capturedCents ?? b.holdCents;
          card = this.addApproval({
            kind: 'refund',
            bookingId: b.id,
            prompt: `Front desk proposes: refund ${this.client(b.clientId).name}'s ${`$${(fee / 100).toFixed(0)}`} fee (capture ${b.captureId}).`,
            feeCents: fee,
            suggested: 'refund',
            options: ['refund', 'keep'],
          });
          run.bookingId = b.id;
          return { status: 'awaiting_owner', approvalId: card.id };
        },
      },
      { name: 'finish', access: 'end', description: 'End the turn. args: {"answer": "<short reply to the owner>"}', run: async () => ({}) },
    ];
    const out = await this.traced(run, () =>
      this.frontdesk.agent.run({ trigger: 'owner_request', clientName: this.ownerName, text: ask }, tools, (st) => {
        const rec = { ...st, n: run.steps.length + 1 };
        run.steps.push(rec);
        return rec;
      }),
    ).catch((err: Error) => {
      run.steps.push({ n: run.steps.length + 1, kind: 'code', name: 'agent error', result: String(err.message).slice(0, 200) });
      return { final: undefined };
    });
    const answer = String(out.final?.answer ?? '').slice(0, 400) || 'Sorry, I could not finish that. Nothing was changed.';
    if (card) run.gate = { kind: 'owner_approval', summary: `waiting for ${this.ownerName}'s tap: refund / keep`, approvalId: card.id };
    run.answer = answer;
    this.emit('message');
    return { answer, run };
  }

  private startRun(clientId: string, text: string, bookingId?: string): AgentRun {
    const run: AgentRun = {
      id: this.nextId('run'),
      at: this.now(),
      clientId,
      clientName: this.client(clientId).name,
      text,
      ...(bookingId ? { bookingId } : {}),
      provider: this.frontdesk.providerName,
      steps: [],
      gate: { kind: 'none', summary: '' },
    };
    this.agentRuns.push(run);
    if (this.agentRuns.length > 60) this.agentRuns.shift();
    return run;
  }

  /** Record what the policy engine and PayPal did while fn ran, as effect/gate steps of the run. */
  private async traced<T>(run: AgentRun, fn: () => Promise<T>): Promise<T> {
    const push = (s: Omit<TraceStep, 'n'>) => run.steps.push({ ...s, n: run.steps.length + 1 });
    const off = this.audit.subscribe((e) => {
      if (e.kind === 'paypal') push({ kind: 'effect', name: 'PayPal call (by the engine)', result: e.summary });
      else if (e.kind !== 'engine') return;
      else if (e.summary.startsWith('decide →')) push({ kind: 'effect', name: 'policy check', result: e.summary.replace(/^decide → /, '') });
      else if (e.summary.startsWith('approval card:')) push({ kind: 'gate', name: 'owner approval required', result: e.summary.replace(/^approval card: /, '') });
      else if (/^[A-Z_]+ → [A-Z_]+:/.test(e.summary)) push({ kind: 'effect', name: 'booking state', result: e.summary });
    });
    try {
      return await fn();
    } finally {
      off();
    }
  }

  /** The AI's only lever on money: it proposes a label; the engine decides and acts. */
  async requestSettlement(b: Booking, label: MessageLabel): Promise<Decision> {
    const d = decide({ booking: b, rules: this.policy.rules, now: this.now(), kind: 'cancel', label, priorExcusals: this.priorExcusals(b.clientId) });
    this.audit.add('engine', `decide → ${d.outcome}: ${d.why}`, { bookingId: b.id, data: d });
    if (!b.authorizationId && d.outcome !== 'CLARIFY' && d.outcome !== 'NO_ACTION') {
      // No hold was ever placed (wallet not approved yet, or the T-72h hold is still to come).
      // Nothing can be charged, and a hold must never appear after the client cancelled.
      this.dropPendingApprovals(b);
      if (d.outcome === 'PENDING_REFILL' || d.outcome === 'OWNER_REVIEW') {
        // Late cancel: same refill-then-settle path as a held booking; the settle step is an automatic waiver.
        b.cancelledAt = this.now();
        if (d.outcome === 'OWNER_REVIEW') this.audit.add('engine', `owner not asked: ${d.why}, but no hold is in place, so there is no fee to decide`, { bookingId: b.id });
        await this.startRefill(b, `${d.why}; no hold in place, so no fee is possible`);
        return d;
      }
      this.setState(b, 'CANCELLED_EARLY', `cancelled with no hold in place (${d.outcome} by policy)`);
      await this.reply(b, 'cancelled_early');
      return d;
    }
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
          await this.reply(b, 'received');
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
      await this.gateway.void(b.authorizationId, this.intentKey(b, 'void', b.authorizationId));
      this.audit.add('paypal', `void authorization ${b.authorizationId}: ${why}`, { bookingId: b.id });
    } catch (err) {
      if (err instanceof PaymentsError && ['AUTHORIZATION_EXPIRED', 'PREVIOUSLY_VOIDED'].includes(err.issue)) {
        this.audit.add('paypal', `authorization ${b.authorizationId} already released (${err.issue})`, { bookingId: b.id });
        return;
      }
      this.audit.add('paypal', `void failed: ${(err as Error).message}`, { bookingId: b.id });
      throw err;
    }
  }

  private async excuse(b: Booking, why: string, opts: { waiver?: boolean } = {}): Promise<void> {
    await this.voidHold(b, why);
    this.setState(b, 'EXCUSED', why);
    if (opts.waiver) {
      // the owner chose not to charge: not a policy excusal, so it does not use up the allowance
      this.say(b.clientId, `Hi ${this.client(b.clientId).name.split(' ')[0]}, ${this.ownerName} waived the fee. Your hold is released.`);
      return;
    }
    this.excusals.push({ clientId: b.clientId, at: this.now() });
    const free = this.freeSlots(b.serviceId, 3);
    this.rebookOffers.set(b.clientId, { serviceId: b.serviceId, slots: free });
    const list = free.map((t, i) => `${i + 1}) ${this.slotLabel({ ...b, start: t })}`).join('  ');
    await this.reply(b, 'excused', { slots: free.length ? `Reply 1, 2 or 3: ${list}` : '' });
  }

  /** Free slots of the same service in the next 7 days, on the hour, 10:00-18:00 UTC. */
  suggestSlots(b: Booking, n = 3): string[] {
    return this.freeSlots(b.serviceId, n).map((start) => this.slotLabel({ ...b, start }));
  }

  freeSlots(serviceId: string, n = 3): number[] {
    const svc = this.services.get(serviceId);
    if (!svc) throw new Error(`unknown service ${serviceId}`);
    const out: number[] = [];
    const base = new Date(this.now());
    base.setUTCHours(0, 0, 0, 0);
    for (let d = 1; d <= 7 && out.length < n; d++) {
      for (let h = 10; h <= 18 && out.length < n; h += 2) {
        const start = base.getTime() + d * DAY + h * HOUR;
        const end = start + svc.durationMin * MINUTE;
        const clash = [...this.bookings.values()].some(
          (x) => !['CANCELLED_EARLY', 'EXCUSED', 'REFILLED'].includes(x.state) && x.start < end && start < x.end,
        );
        if (!clash && new Date(start).getUTCDay() !== 0) out.push(start);
      }
    }
    return out;
  }

  // ---------- refill ----------

  eligibleWaitlist(b: Booking): WaitlistEntry[] {
    const svc = this.services.get(b.serviceId)!;
    return this.waitlist.filter((w) => w.parsed && w.clientId !== b.clientId && slotMatches(w.parsed, b.serviceId, b.start, svc.durationMin));
  }

  private async startRefill(b: Booking, why: string): Promise<void> {
    this.setState(b, 'PENDING_REFILL', why);
    // the slot is given up: no older approval link may attach a new hold to it
    this.dropPendingApprovals(b);
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
    await this.reply(slot, slot.authorizationId ? 'refilled' : 'refilled_no_hold');
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
    const next = o.ranked.find((id) => !o.offeredTo.includes(id) && !o.failed.includes(id));
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
    for (const o of this.offers.filter((x) => x.slotBookingId === b.id && (x.status === 'open' || x.status === 'claiming'))) {
      if (o.status === 'claiming' && o.claim?.bookingId) {
        const nb = this.booking(o.claim.bookingId);
        if (['BOOKED', 'VAULTED', 'HOLD_FAILED'].includes(nb.state)) {
          this.setState(nb, 'CANCELLED_EARLY', 'refill claim not confirmed before the slot cutoff');
          this.say(nb.clientId, 'Sorry, we could not confirm your hold in time, so that spot is closed. You are still on the waitlist.');
        }
      }
      o.status = 'closed';
    }
    if (!b.authorizationId) {
      // Late cancel with no hold in place: nothing to capture, so the fee is waived automatically.
      this.setState(b, 'EXCUSED', 'not refilled; no hold was in place, so the fee is waived');
      const tried = this.offers.some((o) => o.slotBookingId === b.id);
      this.say(
        b.clientId,
        `Hi ${this.client(b.clientId).name.split(' ')[0]}, thanks for letting us know. ${tried ? "We couldn't refill your spot, but there's" : "There's"} no fee this time because no PayPal hold was in place for this visit.`,
      );
      return;
    }
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
    const b = this.booking(a.bookingId);
    this.audit.add('owner', `${this.ownerName} tapped "${choice}" on: ${a.prompt}`, { bookingId: b.id });
    const run = this.agentRuns.find((r) => r.gate.approvalId === a.id);
    if (run) run.steps.push({ n: run.steps.length + 1, kind: 'owner', name: `${this.ownerName} tapped "${choice}"`, result: 'the engine acts on the tap' });
    try {
      await (run ? this.traced(run, () => this.applyApproval(a, b, choice)) : this.applyApproval(a, b, choice));
    } catch (err) {
      // keep the card open so the owner can retry or choose differently
      this.audit.add('engine', `"${choice}" failed, card kept open: ${(err as Error).message}`, { bookingId: b.id });
      this.emit('approval');
      throw err;
    }
    a.resolved = choice;
    if (run) run.gate = { ...run.gate, resolved: choice };
    this.emit('approval');
    return b;
  }

  private async applyApproval(a: Approval, b: Booking, choice: string): Promise<void> {
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
      else await this.excuse(b, 'owner waived the fee', { waiver: true });
    } else if (a.kind === 'refund') {
      if (choice === 'refund') await this.refund(b.id);
      else this.audit.add('owner', `${this.ownerName} kept the fee; no refund`, { bookingId: b.id });
    }
  }

  /** Every capture path ends here, after an owner tap. */
  private async capture(b: Booking, feeCents: number): Promise<void> {
    if (!b.authorizationId) throw new Error('no authorization to capture');
    const violations = captureViolations({ amountCents: feeCents, authorizedCents: b.holdCents, rules: this.policy.rules, label: b.cancelledAt ? b.lastLabel : undefined, ownerApproved: true });
    if (violations.length) {
      this.audit.add('engine', `capture blocked: ${violations.join('; ')}`, { bookingId: b.id });
      throw new PaymentsError('ENGINE_INVARIANT', violations.join('; '));
    }
    if (this.now() - (b.authorizedAt ?? 0) > 3 * DAY && !b.reauthorized) {
      // PayPal allows one reauthorization per authorization; after that we capture as-is (best effort)
      const r = await this.gateway.reauthorize(b.authorizationId, b.holdCents, this.intentKey(b, 'reauth', b.authorizationId));
      this.audit.add('paypal', `honor period over: reauthorize first → ${r.status}`, { bookingId: b.id, data: r });
      if (r.status !== 'AUTHORIZED' || !r.authorizationId) throw new PaymentsError(r.issue ?? 'REAUTHORIZE_FAILED', 'could not refresh the hold before capture');
      b.reauthorized = true;
      await this.onAuthorized(b, r.authorizationId);
    }
    const r = await this.gateway.capture({
      requestId: this.intentKey(b, 'capture', b.authorizationId),
      authorizationId: b.authorizationId,
      amountCents: feeCents,
      finalCapture: true,
      noteToPayer: `${this.businessName}: fee per the policy you approved (v${b.policyVersion})`,
    });
    this.audit.add('paypal', `capture $${(feeCents / 100).toFixed(2)} (final_capture) → ${r.status}`, { bookingId: b.id, data: r });
    if (r.status !== 'COMPLETED') throw new PaymentsError(r.issue);
    b.captureId = r.captureId;
    b.capturedCents = r.amountCents;
    this.setState(b, 'CHARGED', `fee captured (${r.captureId})`);
    await this.reply(b, b.cancelledAt ? 'charged' : 'charged_no_show', { fee: `$${(feeCents / 100).toFixed(0)}` });
  }

  /** Owner relents after a capture. */
  async refund(bookingId: string): Promise<Booking> {
    const b = this.booking(bookingId);
    if (b.state !== 'CHARGED' || !b.captureId) throw new Error('nothing to refund');
    if (b.refundId) throw new Error('already refunded');
    const r = await this.gateway.refund(b.captureId, b.capturedCents ?? b.holdCents, this.intentKey(b, 'refund', b.captureId));
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
      // a booking that never had an authorization has no money at stake, whatever its state
      money: b.refundId ? 'refunded' : !b.authorizationId && !['VAULTED', 'HOLD_FAILED'].includes(b.state) ? 'none' : moneyState(b.state, !!b.captureId),
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
      agentRuns: this.agentRuns.slice(-30).reverse(),
      agentToolsNotGiven: MONEY_TOOLS_NOT_GIVEN,
      unreleasedAuths: this.unreleasedAuths,
      offers: this.offers,
      messages: this.messages,
      jobs: this.clock.pending(),
    };
  }
}
