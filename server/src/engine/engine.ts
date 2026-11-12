import { randomBytes } from 'node:crypto';
import { AuditLog } from '../audit.js';
import { DAY, DemoClock, HOUR, MINUTE } from '../clock.js';
import { DEFAULT_HOURS, validateHours, type StudioHours } from '../domain/hours.js';
import { type AgentTool, MONEY_TOOLS_NOT_GIVEN, type TraceStep } from '../ai/agent.js';
import { FrontDesk } from '../ai/frontdesk.js';
import { type ApprovedPolicy, type Decision, captureViolations, decide } from '../domain/policy.js';
import { assertTransition, canTransition, isTerminal, moneyState } from '../domain/stateMachine.js';
import type { Booking, BookingState, ChatMessage, Client, MessageLabel, Service, WaitlistEntry } from '../domain/types.js';
import { slotMatches } from '../domain/waitlist.js';
import { type HoldResult, type PaymentsGateway, type ReauthorizeResult, type WebhookEvent, PaymentsError, upCaptureId, valueToCents } from '../paypal/gateway.js';
import { type PayPalToolkitReader, TOOLKIT_MONEY_TOOLS, TOOLKIT_PACKAGE, TOOLKIT_PREFIX, TOOLKIT_VERSION } from '../paypal/toolkit.js';

/** Client texts longer than this are cut before they reach the model or the audit log (an SMS thread, not a document). */
export const MAX_MESSAGE_CHARS = 1000;
/** texts kept per workspace (oldest dropped): every action returns the snapshot, and the shared demo is never evicted */
export const MAX_MESSAGES = 500;

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
  /** PayPal Agent Toolkit, read-only allow-list (paypal/toolkit.ts). Owner questions only; never client texts. */
  paypalReader?: PayPalToolkitReader;
  /** the studio's IANA time zone (end-of-day review, slot labels); the demo runs in UTC */
  timeZone?: string;
  /** audit retention: entries kept (default DEFAULT_AUDIT_MAX) */
  auditMax?: number;
}

/** Local wall time minus UTC, in ms, of a time zone at an instant. */
function zoneOffset(ms: number, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** 23:59 on the local day (in timeZone) of the instant ms, as epoch ms. DST-safe. */
export function endOfLocalDay(ms: number, timeZone: string): number {
  const local = new Date(ms + zoneOffset(ms, timeZone));
  return fromLocalWall(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 23, 59), timeZone);
}

/** A local wall-clock time (written as if it were UTC) in timeZone, as epoch ms. DST-safe. */
function fromLocalWall(wall: number, timeZone: string): number {
  return wall - zoneOffset(wall - zoneOffset(wall, timeZone), timeZone);
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
const AUTH_VALIDITY = 29 * DAY;
const OFFER_FANOUT = 3;
// a claim places a hold on the claimer's wallet, so the yes must be a word of its own ("y'all ..." is not a yes)
const YES = /^\s*(yes|yep|yeah|y|i'?ll take it|claim|me!?)(?![\w'’])/i;
// ...and a yes that goes on to decline or cancel ("yes, but I can't do today") is not a claim
const NOT_A_CLAIM = /\b(but|cancel\w*|can'?t|cannot|won'?t|not|unable)\b/i;
const isClaim = (text: string) => YES.test(text) && !NOT_A_CLAIM.test(text.replace(YES, ''));

/**
 * Deterministic policy engine and the only caller of the payments gateway.
 * One instance per demo workspace.
 */
/** Plain-language reason a client text left the money untouched (agent trace gate line). */
export const NO_MONEY_SUMMARY: Partial<Record<Decision['outcome'], string>> = {
  CLARIFY: 'not sure what the client meant, so it asked them to clarify; the hold stays as it is',
  NO_ACTION: 'not a cancellation, so there is nothing to settle; the hold stays as it is',
};

/** A card whose booking has moved on; refused before any PayPal call. */
export class StaleCardError extends Error {}

export class Engine {
  readonly id: string;
  /** '' with the simulator; a random tag per engine with real PayPal (see constructor) */
  private readonly runTag: string;
  readonly clock: DemoClock;
  readonly audit: AuditLog;
  readonly frontdesk: FrontDesk;
  readonly gateway: PaymentsGateway;
  policy: ApprovedPolicy;
  mode: OwnerMode;
  holdStrategy: 'mit' | 'reauth';
  ownerName: string;
  businessName: string;
  readonly timeZone: string;

  hours: StudioHours = { ...DEFAULT_HOURS };
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
  /** every approved policy version: a booking is settled under the version the client booked under */
  private policies = new Map<number, ApprovedPolicy>();
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
  /** authorizations this engine asked PayPal to void: their VOIDED webhooks are not an outside void */
  private ownVoids = new Set<string>();
  private holdAttempts = new Map<string, number>();
  /** authorizations being (or already) reauthorized: their successor replaces them without a void */
  private reauthParents = new Set<string>();
  /** bookingId -> refunds PayPal failed: a retry needs a new PayPal-Request-Id, or PayPal replays the failure */
  private refundRetries = new Map<string, number>();
  /** late authorizations whose void failed: shown to the owner, never silently dropped */
  unreleasedAuths: Array<{ bookingId: string; authorizationId: string; error: string }> = [];
  private baseUrl: string;
  readonly paypalReader?: PayPalToolkitReader;

  constructor(o: EngineOptions) {
    this.id = o.id;
    // Against real PayPal a workspace id outlives its engine (the fixed 'demo' id, a reset, a restart) while
    // booking ids restart at bk_1: without a per-engine run tag, PayPal-Request-Ids and custom_ids would repeat
    // and PayPal would replay the previous life's orders, captures and webhooks. The simulator is per-engine.
    this.runTag = o.gateway.mode === 'sandbox' ? randomBytes(4).toString('hex') : '';
    this.clock = o.clock;
    this.audit = new AuditLog(() => this.clock.now(), { max: o.auditMax });
    this.frontdesk = o.frontdesk(this.audit);
    this.gateway = o.gateway;
    this.policy = o.policy;
    this.policies.set(o.policy.version, o.policy);
    this.mode = o.mode ?? 'ask';
    this.holdStrategy = o.holdStrategy ?? 'mit';
    this.ownerName = o.ownerName;
    this.businessName = o.businessName;
    this.baseUrl = o.baseUrl ?? '';
    this.paypalReader = o.paypalReader;
    this.timeZone = o.timeZone ?? 'UTC';
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

  /** the custom_id this engine puts on a booking's PayPal objects (webhook routing) */
  customIdFor(bookingId: string): string {
    return this.customId(this.booking(bookingId));
  }

  private customId(b: Booking): string {
    return this.runTag ? `${this.id}:${b.id}:${this.runTag}` : `${this.id}:${b.id}`;
  }

  /** New-intent key (each hold attempt is a distinct intent, e.g. a retry after a decline). */
  private requestId(b: Booking, op: string): string {
    const n = (this.holdAttempts.get(`${b.id}:${op}`) ?? 0) + 1;
    this.holdAttempts.set(`${b.id}:${op}`, n);
    return `${this.keyScope()}-${b.id}-${op}-${n}`;
  }

  /** Key derived from the business intent, so a retried capture/void/reauth/refund can never act twice. */
  private intentKey(b: Booking, op: string, target: string): string {
    return `${this.keyScope()}-${b.id}-${op}-${target}`;
  }

  private keyScope(): string {
    return this.runTag ? `${this.id}.${this.runTag}` : this.id;
  }

  private slotLabel(b: Booking): string {
    const d = new Date(b.start);
    const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: this.timeZone });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: this.timeZone });
    return `${day} ${time}`;
  }

  private pushMessage(m: ChatMessage): void {
    this.messages.push(m);
    if (this.messages.length > MAX_MESSAGES) this.messages.splice(0, this.messages.length - MAX_MESSAGES);
  }

  private say(clientId: string, text: string): void {
    this.pushMessage({ id: this.nextId('msg'), at: this.now(), clientId, from: 'frontdesk', text });
    this.audit.add('message', `→ ${this.client(clientId).name}: ${text}`);
    this.emit('message');
  }

  private async reply(b: Booking, situation: string, facts: Record<string, string> = {}): Promise<void> {
    const c = this.client(b.clientId);
    const all: Record<string, string> = { owner: this.ownerName, appointment: this.slotLabel(b), ...facts };
    let text: string;
    try {
      text = await this.frontdesk.draftReply(c.name, situation, all, b.id);
    } catch (err) {
      // Replies come after the money step. A model failure here must not surface as a failed settlement,
      // or the caller's retry would run the money logic a second time (e.g. a second refill offer).
      this.audit.add('ai', `draft_reply (${situation}) failed: ${(err as Error).message}; sent a fixed reply`, { bookingId: b.id });
      text = `Hi ${c.name.split(' ')[0]}, thanks for your message about ${all.appointment}. ${this.ownerName} will follow up shortly.${all.link ? ` ${all.link}` : ''}`;
    }
    this.say(c.id, text);
  }

  // ---------- setup ----------

  addService(s: Service): void {
    this.services.set(s.id, s);
  }

  /** A service typed by the owner: validated here, the id is made from the name. */
  addServiceChecked(input: { name?: unknown; durationMin?: unknown; priceCents?: unknown }): Service {
    const name = typeof input.name === 'string' ? input.name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) : '';
    const durationMin = Number(input.durationMin);
    const priceCents = Number(input.priceCents);
    if (!name) throw new Error('give the service a name');
    if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480 || durationMin % 5) throw new Error('duration must be 15 to 480 minutes, in steps of 5');
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 1_000_000) throw new Error('price must be between 0 and 10,000');
    if (this.services.size >= 12) throw new Error('12 services is the limit');
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'service';
    let id = slug;
    for (let i = 2; this.services.has(id); i++) id = `${slug}-${i}`;
    const svc: Service = { id, name, durationMin, priceCents };
    this.services.set(id, svc);
    this.audit.add('owner', `added service ${name} (${durationMin} min)`);
    this.emit('state');
    return svc;
  }

  removeService(id: string): void {
    if (!this.services.has(id)) throw new Error('unknown service');
    if ([...this.bookings.values()].some((b) => b.serviceId === id)) throw new Error('this service has bookings, so it stays; remove it only before anyone books it');
    this.services.delete(id);
    this.audit.add('owner', `removed service ${id}`);
    this.emit('state');
  }

  setHours(h: unknown): StudioHours {
    this.hours = validateHours(h, this.hours);
    this.audit.add('owner', `opening hours ${this.hours.openHour}:00-${this.hours.closeHour}:00`);
    this.emit('state');
    return this.hours;
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
    this.policies.set(p.version, p);
    this.audit.add('owner', `policy v${p.version} approved (${p.hash})`);
    this.emit('state');
  }

  // ---------- booking + holds ----------

  async createBooking(input: { clientId: string; serviceId: string; start: number; refillOf?: string }): Promise<Booking> {
    const svc = this.services.get(input.serviceId);
    if (!svc) throw new Error(`unknown service ${input.serviceId}`);
    // a past or non-number start would place a hold for a visit that already happened (or NaN timers)
    if (!Number.isSafeInteger(input.start) || input.start <= this.now()) throw new Error('start must be a future time (epoch ms)');
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
    } else if (res.status === 'PENDING') {
      this.onHoldPending(b, res);
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
      const { vaultId } = await this.gateway.completeVaultSetup(orderId, `${this.keyScope()}-${b.id}-vaulttoken-${orderId}`);
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
    const res = await this.gateway.authorizeApprovedOrder(orderId, `${this.keyScope()}-${b.id}-authorize-${orderId}`);
    this.audit.add('paypal', `authorize approved order ${orderId} → ${res.status}`, { bookingId: b.id, data: res });
    this.pendingOrders.delete(orderId);
    if (res.status === 'AUTHORIZED') {
      const c = this.client(b.clientId);
      if (res.vaultId) c.vaultId = res.vaultId;
      c.sandboxDecline = false; // the fresh approval succeeded
      b.approvalLink = undefined;
      await this.onAuthorized(b, res.authorizationId, res.orderId);
    } else if (res.status === 'PENDING') {
      b.approvalLink = undefined;
      this.onHoldPending(b, res);
    } else if (res.status === 'DECLINED') {
      await this.onHoldDeclined(b, res.issue);
    }
    return b;
  }

  /**
   * PayPal created the authorization as PENDING (under review). Nothing is held yet, so no held money and no
   * charge card; it becomes the hold when PayPal reports it CREATED (PAYMENT.AUTHORIZATION.CREATED).
   */
  private onHoldPending(b: Booking, res: { orderId: string; authorizationId: string; reason: string }): void {
    b.orderId = res.orderId;
    b.pendingAuthorizationId = res.authorizationId;
    this.audit.add('paypal', `authorization ${res.authorizationId} is PENDING at PayPal (${res.reason}): not held until PayPal confirms it`, { bookingId: b.id });
    this.emit('state');
  }

  /** Idempotent: called from the synchronous API result and from the PAYMENT.AUTHORIZATION.CREATED webhook. */
  private async onAuthorized(b: Booking, authorizationId: string, orderId?: string): Promise<void> {
    const known = this.knownAuths.get(b.id) ?? new Set<string>();
    this.knownAuths.set(b.id, known);
    if (known.has(authorizationId)) return; // duplicate, or an older auth arriving late
    known.add(authorizationId);
    if (isTerminal(b.state) || (b.state === 'PENDING_REFILL' && !b.authorizationId)) {
      // e.g. an approval that arrives after the booking was cancelled: release it right away
      try {
        this.ownVoids.add(authorizationId);
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
    const prev = b.authorizationId;
    b.authorizationId = authorizationId;
    if (b.pendingAuthorizationId === authorizationId) b.pendingAuthorizationId = undefined;
    b.authorizedAt = this.now();
    b.holdVoided = undefined; // a fresh hold replaces one PayPal voided
    // PayPal authorizations are valid 29 days; a reauthorization keeps its parent's expiry
    if (!(prev && this.reauthParents.has(prev) && b.holdExpiresAt)) b.holdExpiresAt = this.now() + AUTH_VALIDITY;
    if (prev && prev !== authorizationId && !this.reauthParents.has(prev)) {
      // a fresh hold (e.g. the re-approval after a declined reauthorization) replaces one that is still
      // live at PayPal: release it, or the client would carry two holds and only one could ever be settled
      try {
        this.ownVoids.add(prev);
        await this.gateway.void(prev, this.intentKey(b, 'void', prev));
        this.audit.add('paypal', `void replaced authorization ${prev} (now held by ${authorizationId})`, { bookingId: b.id });
      } catch (err) {
        if (!(err instanceof PaymentsError && ['AUTHORIZATION_EXPIRED', 'PREVIOUSLY_VOIDED'].includes(err.issue))) {
          this.unreleasedAuths.push({ bookingId: b.id, authorizationId: prev, error: (err as Error).message });
          this.audit.add('paypal', `VOID FAILED for replaced authorization ${prev} (${(err as Error).message}); needs a manual release`, { bookingId: b.id });
        }
      }
    }
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
      // A refusal (expired authorization, limit reached, PayPal error) leaves no usable hold: treat it as a
      // decline so the client gets a re-approval link, instead of an exception that aborts the clock run.
      const r: ReauthorizeResult = await this.reauthorize(b, !!c.sandboxDecline).catch((err: Error) => ({
        status: 'DECLINED' as const,
        issue: err instanceof PaymentsError ? err.issue : 'REAUTHORIZE_FAILED',
      }));
      this.audit.add('paypal', `reauthorize at T-72h → ${r.status}`, { bookingId: b.id, data: r });
      if (r.status === 'AUTHORIZED' && r.authorizationId) {
        b.reauthorized = true;
        await this.onAuthorized(b, r.authorizationId);
      } else if (r.status === 'PENDING' && r.authorizationId) this.onReauthPending(b, r.authorizationId, r.issue);
      else await this.onHoldDeclined(b, r.issue ?? 'DECLINED');
      return;
    }
    // A PayPal error (5xx, timeout) is not a decline, but it leaves no hold either: an exception here would
    // abort the clock run and leave the visit with no hold and no link. Treat it as a decline (re-approval link).
    // If PayPal did authorize before the error, its AUTHORIZATION.CREATED webhook still attaches that hold.
    const res = await this.placeHold(b).catch(async (err: Error) => {
      const issue = err instanceof PaymentsError ? err.issue : 'HOLD_ERROR';
      this.audit.add('paypal', `hold at T-72h failed → ${issue}`, { bookingId: b.id });
      if (b.authorizationId || !['BOOKED', 'VAULTED'].includes(b.state)) return undefined;
      await this.onHoldDeclined(b, issue).catch((e2: Error) => this.audit.add('engine', `re-approval link could not be created: ${e2.message}`, { bookingId: b.id }));
      return undefined;
    });
    if (res?.status === 'PAYER_ACTION_REQUIRED') await this.reply(b, 'approve_hold', { link: res.approvalUrl });
  }

  // ---------- webhooks ----------

  async ingestWebhook(e: WebhookEvent): Promise<'processed' | 'duplicate' | 'ignored'> {
    if (this.seenEvents.has(e.id)) {
      this.audit.add('webhook', `${e.event_type} ${e.id}: duplicate, ignored`);
      return 'duplicate';
    }
    this.seenEvents.add(e.id);
    const cid = e.resource.custom_id;
    const bookingId = cid?.split(':')[1];
    const b = cid
      ? this.ownsCustomId(cid) && bookingId ? this.bookings.get(bookingId) : undefined
      : // refund resources carry no custom_id: only an object this workspace created
        [...this.bookings.values()].find((x) => x.refundId === e.resource.id || x.captureId === e.resource.id || (!!x.captureId && x.captureId === upCaptureId(e)));
    this.audit.add('webhook', `${e.event_type} ${e.resource.id}`, { bookingId: b?.id, data: e });
    if (!b) return 'ignored';
    try {
      if (e.event_type === 'PAYMENT.AUTHORIZATION.CREATED' && e.resource.status === 'PENDING') {
        if (!b.authorizationId) b.pendingAuthorizationId ??= e.resource.id;
      } else if (e.event_type === 'PAYMENT.AUTHORIZATION.CREATED') await this.onAuthorized(b, e.resource.id);
      else if (e.event_type === 'PAYMENT.CAPTURE.DENIED' || e.event_type === 'PAYMENT.CAPTURE.REVERSED') this.onCaptureLost(b, e);
      else if (e.event_type === 'PAYMENT.REFUND.FAILED') this.onRefundFailed(b, e.resource.id);
      else if (e.event_type === 'PAYMENT.CAPTURE.REFUNDED') this.onCaptureRefunded(b, e);
      else if (e.event_type === 'PAYMENT.AUTHORIZATION.VOIDED') this.onHoldVoided(b, e.resource.id);
    } catch (err) {
      // the route answers 5xx and PayPal redelivers the same event id: that retry must not be deduped away
      this.seenEvents.delete(e.id);
      throw err;
    }
    return 'processed';
  }

  /**
   * PayPal voided the booking's current hold without HoldMySpot asking (e.g. the payer or PayPal released it).
   * Nothing can be collected on it any more: show it, close an open charge card, and never offer a new one.
   */
  private onHoldVoided(b: Booking, authorizationId: string): void {
    if (this.ownVoids.has(authorizationId) || b.authorizationId !== authorizationId || b.captureId || b.holdVoided || isTerminal(b.state)) return;
    b.holdVoided = `PayPal voided hold ${authorizationId} outside HoldMySpot: nothing can be collected on it`;
    this.audit.add('engine', `money: ${b.holdVoided}`, { bookingId: b.id });
    const cards = this.openApprovals().filter((a) => a.bookingId === b.id && a.kind === 'capture');
    for (const a of cards) a.resolved = 'stale';
    if (cards.length && canTransition(b.state, 'EXCUSED')) this.setState(b, 'EXCUSED', 'the hold was voided at PayPal before the fee was charged; nothing collected');
    this.emit('state');
  }

  /** A capture that later is denied (a PENDING capture under review) or reversed (e.g. a dispute): the fee is not collected. */
  private onCaptureLost(b: Booking, e: WebhookEvent): void {
    if (!b.captureId || b.captureId !== e.resource.id || b.paymentIssue) return;
    b.paymentIssue =
      e.event_type === 'PAYMENT.CAPTURE.DENIED' ? `PayPal denied capture ${b.captureId}: no fee was collected` : `capture ${b.captureId} was reversed by PayPal: the fee is no longer collected`;
    this.audit.add('engine', `money: ${b.paymentIssue}`, { bookingId: b.id });
    // nothing left to refund
    for (const a of this.openApprovals()) if (a.bookingId === b.id && a.kind === 'refund') a.resolved = 'stale';
    this.emit('state');
  }

  /**
   * A refund of the booking's capture, ours or one made in the PayPal dashboard. Records the amount (once per
   * refund id) so the booking is not shown as charged; a full refund marks it refunded and closes refund cards.
   */
  private onCaptureRefunded(b: Booking, e: WebhookEvent): void {
    const up = upCaptureId(e);
    if (!b.captureId || (up && up !== b.captureId) || b.refunds?.some((r) => r.id === e.resource.id)) return;
    const fee = b.capturedCents ?? b.holdCents;
    const given = e.resource.amount ? valueToCents(e.resource.amount.value) : NaN;
    // PayPal's refund resource carries its amount; without one, assume the rest of the fee
    const cents = Number.isFinite(given) && given > 0 ? given : fee - (b.refundedCents ?? 0);
    (b.refunds ??= []).push({ id: e.resource.id, cents });
    b.refundedCents = Math.min(fee, (b.refundedCents ?? 0) + cents);
    this.audit.add('engine', `money: PayPal refunded $${(cents / 100).toFixed(2)} of capture ${b.captureId} (refund ${e.resource.id}, made outside HoldMySpot)`, { bookingId: b.id });
    if (b.refundedCents >= fee && !b.refundId) {
      b.refundId = e.resource.id;
      for (const a of this.openApprovals()) if (a.bookingId === b.id && a.kind === 'refund') a.resolved = 'stale';
    } else {
      // an open refund card now sends only the rest: show that amount, not the fee it was made for
      for (const a of this.openApprovals()) {
        if (a.bookingId !== b.id || a.kind !== 'refund') continue;
        const r = this.refundRest(b);
        a.feeCents = r.cents;
        a.prompt = `${a.prompt.replace(/ \(\$[\d.]+ already refunded in PayPal; this sends the remaining \$[\d.]+\)$/, '')} ($${(r.refunded / 100).toFixed(2)} already refunded in PayPal; this sends the remaining $${(r.cents / 100).toFixed(2)})`;
      }
    }
    this.emit('state');
  }

  /** A refund PayPal could not complete: the fee is still collected, so stop showing it as refunded and let the owner retry. */
  private onRefundFailed(b: Booking, refundId: string): void {
    const part = b.refunds?.find((r) => r.id === refundId);
    if (part) {
      b.refunds = b.refunds!.filter((r) => r !== part);
      b.refundedCents = Math.max(0, (b.refundedCents ?? 0) - part.cents);
    }
    if (b.refundId !== refundId) {
      if (part) this.emit('state');
      return;
    }
    b.refundId = undefined;
    this.refundRetries.set(b.id, (this.refundRetries.get(b.id) ?? 0) + 1);
    const rest = this.refundRest(b);
    this.audit.add('engine', `money: refund ${refundId} failed at PayPal; the fee is still collected`, { bookingId: b.id });
    this.addApproval({
      kind: 'refund',
      bookingId: b.id,
      prompt: rest.refunded
        ? `PayPal refund ${refundId} of the remaining $${(rest.cents / 100).toFixed(2)} of ${this.client(b.clientId).name}'s fee failed ($${(rest.refunded / 100).toFixed(2)} was already refunded in PayPal); $${(rest.cents / 100).toFixed(2)} is still collected. Try the refund again?`
        : `PayPal refund ${refundId} of ${this.client(b.clientId).name}'s $${(rest.fee / 100).toFixed(0)} fee failed; the fee is still collected. Try the refund again?`,
      feeCents: rest.cents,
      suggested: 'refund',
      options: ['refund', 'keep'],
    });
    this.emit('state');
  }

  /** custom_id is this engine's: not another workspace's, nor an earlier engine's under the same workspace id */
  ownsCustomId(customId: string | undefined): boolean {
    const [wsId, , tag] = customId?.split(':') ?? [];
    return wsId === this.id && (tag ?? '') === this.runTag;
  }

  /** Every PayPal order, authorization, capture and refund id this workspace knows (scopes the shared toolkit reader). */
  paypalIds(): Set<string> {
    const ids = new Set<string>(this.pendingOrders.keys());
    for (const b of this.bookings.values()) for (const x of [b.orderId, b.authorizationId, b.captureId, b.refundId]) if (x) ids.add(x);
    for (const set of this.knownAuths.values()) for (const x of set) ids.add(x);
    return ids;
  }

  // ---------- client messages ----------

  activeBookingFor(clientId: string): Booking | undefined {
    return [...this.bookings.values()]
      .filter((b) => b.clientId === clientId && ['BOOKED', 'VAULTED', 'HELD', 'HOLD_FAILED'].includes(b.state) && b.end > this.now())
      .sort((a, b) => a.start - b.start)[0];
  }

  /**
   * The visit a client text is about. With several upcoming visits, a text that names a date, a day or a
   * service is about the visit that matches best ("cancel my nail art on Saturday" must not cancel, or
   * late-fee, Wednesday's pedicure); a weekday two visits share means the nearer one, a date ("the 11th")
   * its own week. Nothing named: the next visit, as before. Code, not the model, picks it.
   */
  bookingForText(clientId: string, text: string): Booking | undefined {
    const m = this.matchVisits(clientId, text);
    return m.best[0] ?? m.active[0];
  }

  /**
   * Two or more visits the text names by different days, dates or services ("cancel Wed and Sat"): the
   * nearest visit per distinct match, for a clarifying question. A weekday two visits share is not ambiguous.
   */
  ambiguousVisits(clientId: string, text: string): Booking[] | undefined {
    const { best, sig } = this.matchVisits(clientId, text);
    const seen = new Map<string, Booking>();
    for (const b of best) if (!seen.has(sig(b))) seen.set(sig(b), b);
    return seen.size >= 2 ? [...seen.values()] : undefined;
  }

  /** Upcoming visits, and those that match the text best (nearest first; empty when the text names none). */
  private matchVisits(clientId: string, text: string): { active: Booking[]; best: Booking[]; sig: (b: Booking) => string } {
    const active = [...this.bookings.values()]
      .filter((b) => b.clientId === clientId && ['BOOKED', 'VAULTED', 'HELD', 'HOLD_FAILED'].includes(b.state) && b.end > this.now())
      .sort((a, b) => a.start - b.start);
    if (active.length < 2) return { active, best: [], sig: () => '' };
    const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    const said = (w: string) => t.includes(` ${w} `);
    const DAYS = [['sunday', 'sun'], ['monday', 'mon'], ['tuesday', 'tue', 'tues'], ['wednesday', 'wed'], ['thursday', 'thu', 'thur', 'thurs'], ['friday', 'fri'], ['saturday', 'sat']];
    // days and dates in the studio's time zone (UTC in the demo)
    const local = (ms: number) => new Date(ms + zoneOffset(ms, this.timeZone));
    const dayOf = (ms: number) => local(ms).getUTCDay();
    const today = dayOf(this.now());
    const named = new Set<number>();
    DAYS.forEach((names, d) => names.some(said) && named.add(d));
    if (said('today') || said('tonight')) named.add(today);
    if (said('tomorrow')) named.add((today + 1) % 7);
    const GENERIC = new Set(['full', 'set', 'nail', 'nails', 'the', 'and']);
    const serviceWords = (id: string) => {
      const s = this.services.get(id);
      return [id, ...(s?.name.toLowerCase().split(/[^a-z0-9]+/) ?? [])].filter((w) => w.length >= 3 && !GENERIC.has(w));
    };
    // a date ("the 11th", "Nov 11", "11 November") tells two same-weekday visits apart
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mon = `(${MONTHS.join('|')})[a-z]*`;
    const dates: Array<{ day: number; month?: number }> = [];
    for (const m of t.matchAll(/(?<= )(\d{1,2})(?:st|nd|rd|th)(?= )/g)) dates.push({ day: Number(m[1]) });
    for (const m of t.matchAll(new RegExp(`(?<= )${mon} (\\d{1,2})(?:st|nd|rd|th)?(?= )`, 'g'))) dates.push({ day: Number(m[2]), month: MONTHS.indexOf(m[1]) });
    for (const m of t.matchAll(new RegExp(`(?<= )(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${mon}(?= )`, 'g'))) dates.push({ day: Number(m[1]), month: MONTHS.indexOf(m[2]) });
    const onDate = (ms: number) => {
      const d = local(ms);
      return dates.some((x) => x.day === d.getUTCDate() && (x.month === undefined || x.month === d.getUTCMonth()));
    };
    const score = (b: Booking) => (onDate(b.start) ? 2 : 0) + (named.has(dayOf(b.start)) ? 1 : 0) + (serviceWords(b.serviceId).some(said) ? 1 : 0);
    // what the text matched on: two visits with the same signature (a weekday they share) are one ambiguous cue, not two
    const sig = (b: Booking) => [onDate(b.start) ? `date:${local(b.start).getUTCDate()}` : '', named.has(dayOf(b.start)) ? `day:${dayOf(b.start)}` : '', serviceWords(b.serviceId).some(said) ? `svc:${b.serviceId}` : ''].join('|');
    const top = Math.max(...active.map(score));
    // several equally good matches (a weekday two visits share): the nearest of them, never a visit the text did not name
    return { active, best: top > 0 ? active.filter((b) => score(b) === top) : [], sig };
  }

  async receiveMessage(clientId: string, text: string): Promise<{ label?: MessageLabel; decision?: Decision; claimed?: boolean; rebooked?: string }> {
    const c = this.client(clientId);
    text = String(text ?? '').slice(0, MAX_MESSAGE_CHARS); // bounded model input and audit log
    this.pushMessage({ id: this.nextId('msg'), at: this.now(), clientId, from: 'client', text });
    this.audit.add('message', `← ${c.name}: ${text}`);
    this.emit('message');

    const offer = this.offers.filter((o) => o.offeredTo.includes(clientId) && o.status !== 'closed').at(-1);
    if (offer && isClaim(text)) {
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

    const several = this.ambiguousVisits(clientId, text);
    if (several) {
      // "cancel Wed and Sat": settling either one on a guess could late-fee the wrong visit. Ask; nothing changes.
      const run = this.startRun(clientId, text);
      const list = several.map((x) => `${this.slotLabel(x)} (${this.services.get(x.serviceId)?.name ?? x.serviceId})`).join(' or ');
      run.steps.push({ n: 1, kind: 'code', name: 'route: text names several visits', result: `asked which visit: ${list}; no booking changed, no money moved` });
      run.gate = { kind: 'none', summary: 'clarifying question sent; no money involved' };
      this.say(clientId, `Hi ${c.name.split(' ')[0]}, which visit do you mean: ${list}? Please text again about one visit at a time.`);
      return {};
    }
    const b = this.bookingForText(clientId, text);
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
          label = this.grounded(this.frontdesk.sanitizeLabel(args), text, b);
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
        label = this.grounded(await this.frontdesk.classifyMessage(text, c.name, this.slotLabel(b), b.id), text, b);
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
          : { kind: 'none', summary: NO_MONEY_SUMMARY[d.outcome] ?? `nothing to settle (${d.outcome})` };
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
              chargedCents: sum((b) => (b.captureId && !b.paymentIssue ? (b.capturedCents ?? 0) : 0)),
              refundedCents: sum((b) => (b.refundId ? (b.capturedCents ?? 0) : (b.refundedCents ?? 0))),
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
          if (!b || b.state !== 'CHARGED' || !b.captureId || b.paymentIssue) return { error: 'that booking has no captured fee' };
          if (b.refundId) return { error: 'that fee is already refunded' };
          const open = this.openApprovals().find((a) => a.kind === 'refund' && a.bookingId === b.id);
          if (open) return { status: 'awaiting_owner', approvalId: open.id };
          const rest = this.refundRest(b);
          card = this.addApproval({
            kind: 'refund',
            bookingId: b.id,
            prompt: rest.refunded
              ? `Front desk proposes: refund the remaining $${(rest.cents / 100).toFixed(2)} of ${this.client(b.clientId).name}'s $${(rest.fee / 100).toFixed(0)} fee (capture ${b.captureId}; $${(rest.refunded / 100).toFixed(2)} already refunded in PayPal).`
              : `Front desk proposes: refund ${this.client(b.clientId).name}'s ${`$${(rest.fee / 100).toFixed(0)}`} fee (capture ${b.captureId}).`,
            feeCents: rest.cents,
            suggested: 'refund',
            options: ['refund', 'keep'],
          });
          run.bookingId = b.id;
          return { status: 'awaiting_owner', approvalId: card.id, refundCents: rest.cents };
        },
      },
      // PayPal's own read tools via the official Agent Toolkit (allow-listed GETs; see paypal/toolkit.ts)
      ...(this.paypalReader?.tools() ?? []).map((t): AgentTool => ({ name: t.name, access: 'read', source: t.source, description: t.description, run: t.run })),
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

  /**
   * The evidence span is shown to the owner as the client's words on a review card. A model (or an
   * injected instruction) can return any string there, so keep it only if the client actually wrote it.
   */
  private grounded(label: MessageLabel, text: string, b: Booking): MessageLabel {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!label.evidenceSpan || norm(text).includes(norm(label.evidenceSpan))) return label;
    this.audit.add('engine', `evidence "${label.evidenceSpan.slice(0, 80)}" is not in the client's text; quoting the client verbatim instead`, { bookingId: b.id });
    return { ...label, evidenceSpan: text.slice(0, 200) };
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
    const d = decide({ booking: b, rules: this.rulesFor(b), now: this.now(), kind: 'cancel', label, priorExcusals: this.priorExcusals(b.clientId) });
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
        // a free cancellation is final even if PayPal fails to release the hold right now
        await this.releaseOrFlag(b, 'cancelled outside the fee window');
        this.setState(b, 'CANCELLED_EARLY', d.why);
        await this.reply(b, 'cancelled_early');
        break;
      case 'EXCUSE':
        if (this.mode === 'ask') {
          this.addApproval({ kind: 'review', bookingId: b.id, prompt: `${this.client(b.clientId).name}: "${label.evidenceSpan}". Policy says excuse (no charge).`, suggested: 'excuse', options: ['excuse', 'refill_then_charge'] });
          await this.reply(b, 'received');
        } else {
          // no owner in the loop to retry: the excusal stands even if PayPal fails to release the hold now
          await this.excuse(b, d.why, { autoRelease: true });
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

  /** The rules the client accepted at booking (the capture note cites that version); current rules if unknown. */
  private rulesFor(b: Booking) {
    if (b.policyVersion === this.policy.version) return this.policy.rules;
    const p = this.policies.get(b.policyVersion);
    return p && p.hash === b.policyHash ? p.rules : this.policy.rules;
  }

  private priorExcusals(clientId: string): number {
    const since = this.now() - this.policy.rules.excusalLimit.months * 30 * DAY;
    return this.excusals.filter((e) => e.clientId === clientId && e.at >= since).length;
  }

  /**
   * PayPal created the reauthorization but is reviewing it. The current authorization stays the hold (it is valid
   * until its 29-day expiry); the new one is tracked as pending so evict/reset voids it, and its CREATED webhook
   * swaps it in as the successor (no void of the parent). PayPal allows one reauthorization, so no second try.
   */
  private onReauthPending(b: Booking, authorizationId: string, reason?: string): void {
    b.reauthorized = true;
    b.pendingAuthorizationId = authorizationId;
    this.audit.add('paypal', `reauthorization ${authorizationId} is under review at PayPal (${reason ?? 'PENDING'}); hold ${b.authorizationId} stays in place`, { bookingId: b.id });
    this.emit('state');
  }

  private async reauthorize(b: Booking, simulateDecline = false): Promise<ReauthorizeResult> {
    const parent = b.authorizationId!;
    this.reauthParents.add(parent);
    try {
      const r = await this.gateway.reauthorize(parent, b.holdCents, this.intentKey(b, 'reauth', parent), simulateDecline);
      if (r.status === 'DECLINED') this.reauthParents.delete(parent);
      return r;
    } catch (err) {
      this.reauthParents.delete(parent);
      throw err;
    }
  }

  private async voidHold(b: Booking, why: string): Promise<void> {
    if (!b.authorizationId || b.holdVoided) return; // PayPal already voided it
    await this.voidAuth(b, b.authorizationId, why);
  }

  private async voidAuth(b: Booking, authorizationId: string, why: string): Promise<void> {
    try {
      this.ownVoids.add(authorizationId);
      await this.gateway.void(authorizationId, this.intentKey(b, 'void', authorizationId));
      this.audit.add('paypal', `void authorization ${authorizationId}: ${why}`, { bookingId: b.id });
    } catch (err) {
      if (err instanceof PaymentsError && ['AUTHORIZATION_EXPIRED', 'PREVIOUSLY_VOIDED'].includes(err.issue)) {
        this.audit.add('paypal', `authorization ${authorizationId} already released (${err.issue})`, { bookingId: b.id });
        return;
      }
      this.audit.add('paypal', `void failed: ${(err as Error).message}`, { bookingId: b.id });
      throw err;
    }
  }

  /**
   * Before the workspace is evicted or reset: void every authorization that may still be live at PayPal
   * (uncaptured holds, and holds an earlier void could not release). Already voided or expired ones count
   * as released. Returns the ones PayPal would not release; the caller then keeps the workspace.
   */
  async releaseAllHolds(why: string): Promise<Array<{ bookingId: string; authorizationId: string; error: string }>> {
    const targets: Array<[Booking, string]> = [];
    for (const b of this.bookings.values()) {
      if (b.authorizationId && !b.holdVoided && !b.captureId) targets.push([b, b.authorizationId]);
      if (b.pendingAuthorizationId) targets.push([b, b.pendingAuthorizationId]);
    }
    for (const u of this.unreleasedAuths) {
      const b = this.bookings.get(u.bookingId);
      if (b) targets.push([b, u.authorizationId]);
    }
    const failed: Array<{ bookingId: string; authorizationId: string; error: string }> = [];
    const seen = new Set<string>();
    for (const [b, id] of targets) {
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        await this.voidAuth(b, id, why);
      } catch (err) {
        failed.push({ bookingId: b.id, authorizationId: id, error: (err as Error).message });
      }
    }
    return failed;
  }

  /**
   * Release a hold where the outcome no longer depends on it (free cancel, refilled slot). If PayPal fails,
   * the booking still moves on, so it can never become chargeable; the live hold is shown to the owner.
   */
  private async releaseOrFlag(b: Booking, why: string): Promise<void> {
    try {
      await this.voidHold(b, why);
    } catch (err) {
      this.unreleasedAuths.push({ bookingId: b.id, authorizationId: b.authorizationId!, error: (err as Error).message });
      this.emit('state');
    }
  }

  private async excuse(b: Booking, why: string, opts: { waiver?: boolean; autoRelease?: boolean } = {}): Promise<void> {
    if (opts.autoRelease) await this.releaseOrFlag(b, why);
    else await this.voidHold(b, why);
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

  /** Free slots of the same service in the next 7 days, on the hour, 10:00-18:00 in the studio's time zone. */
  suggestSlots(b: Booking, n = 3): string[] {
    return this.freeSlots(b.serviceId, n).map((start) => this.slotLabel({ ...b, start }));
  }

  freeSlots(serviceId: string, n = 3): number[] {
    const svc = this.services.get(serviceId);
    if (!svc) throw new Error(`unknown service ${serviceId}`);
    const out: number[] = [];
    const hz = this.hours;
    // today's local midnight, as a wall-clock time (studio hours and closed days are local, not UTC)
    const today = new Date(this.now() + zoneOffset(this.now(), this.timeZone));
    const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    for (let d = hz.sameDay ? 0 : 1; d <= 7 && out.length < n; d++) {
      if (hz.closedDays.includes(new Date(base + d * DAY).getUTCDay())) continue;
      for (let m = hz.openHour * 60; m <= hz.closeHour * 60 && out.length < n; m += hz.stepMinutes) {
        // a real studio's visit must end before closing; the demo grid keeps its on-the-hour starts
        if (hz.sameDay && m + svc.durationMin > hz.closeHour * 60) continue;
        const start = fromLocalWall(base + d * DAY + m * MINUTE, this.timeZone);
        if (start < this.now() + hz.leadMinutes * MINUTE) continue;
        const end = start + svc.durationMin * MINUTE;
        const clash = [...this.bookings.values()].some(
          (x) => !['CANCELLED_EARLY', 'EXCUSED', 'REFILLED'].includes(x.state) && x.start < end && start < x.end,
        );
        if (!clash) out.push(start);
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
      let order: string[];
      let offer: string;
      try {
        ({ order, offer } = await this.frontdesk.rankAndDraftOffer(
          this.slotLabel(b),
          svc.name,
          eligible.map((w) => ({ id: w.clientId, name: this.client(w.clientId).name, text: w.text })),
        ));
      } catch (err) {
        // the booking is already PENDING_REFILL: without an offer and a cutoff it would never reach a fee decision
        this.audit.add('ai', `rank_and_draft_offer failed: ${(err as Error).message}; offering in waitlist order`, { bookingId: b.id });
        order = [...new Set(eligible.map((w) => w.clientId))];
        offer = `A ${svc.name} spot just opened: ${this.slotLabel(b)}. Reply YES to claim it. First yes gets it.`;
      }
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
    // the slot is refilled, so the canceller owes nothing whatever PayPal says about the release
    await this.releaseOrFlag(slot, 'slot refilled');
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
    if (b.authorizationId && b.holdVoided) {
      // PayPal voided the hold: there is nothing to charge, so no fee card
      this.setState(b, 'EXCUSED', 'not refilled; the hold was voided at PayPal, so nothing can be collected');
      return;
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
    const fee = decide({ booking: b, rules: this.rulesFor(b), now: this.now(), kind: 'no_show', priorExcusals: 0 });
    // the card is the no-show fee: never more than the policy's no-show fee, even if decide() had nothing to charge
    const feeCents = fee.outcome === 'PENDING_REFILL' || fee.outcome === 'OWNER_REVIEW' ? fee.feeCents : Math.min(this.rulesFor(b).noShowFeeCents, b.holdCents);
    const lateFee = Math.min(this.rulesFor(b).lateCancelFeeCents, b.holdCents);
    this.addApproval({
      kind: 'capture',
      bookingId: b.id,
      prompt: b.cancelledAt
        ? `${this.client(b.clientId).name} cancelled late (${this.slotLabel(b)}) and nobody took the spot. Charge the fee from their PayPal hold?`
        : `${this.client(b.clientId).name} didn't show (${this.slotLabel(b)}). Nobody to refill the spot. Charge the fee from their PayPal hold?`,
      feeCents: b.cancelledAt ? lateFee : feeCents,
      options: ['charge', 'waive'],
    });
  }

  // ---------- attendance ----------

  private async askAttendance(bookingId: string): Promise<void> {
    const b = this.booking(bookingId);
    if (b.state !== 'HELD') return;
    this.addApproval({ kind: 'attendance', bookingId: b.id, prompt: `Did ${this.client(b.clientId).name} show up?`, options: ['arrived', 'no_show'] });
    // the studio's end of day, not UTC's (a 3 pm visit in Los Angeles would go to review at 4 pm local)
    this.clock.schedule(endOfLocalDay(b.start, this.timeZone), `end-of-day review ${b.id}`, () => {
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
      if (err instanceof StaleCardError) {
        // nothing to retry: close the card so it cannot be tapped again later
        a.resolved = 'stale';
        this.audit.add('engine', `"${choice}" refused: ${err.message}`, { bookingId: b.id });
        this.emit('approval');
        throw err;
      }
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
    // A card can outlive the situation it was raised for (a late-cancel text after the attendance card,
    // an excuse after the fee card). Check the booking can still take the card's step before any PayPal call.
    const target: BookingState | undefined =
      a.kind === 'attendance' ? (choice === 'arrived' ? 'ATTENDED' : 'PENDING_REFILL')
      : a.kind === 'review' ? (choice === 'excuse' ? 'EXCUSED' : 'PENDING_REFILL')
      : a.kind === 'capture' ? (choice === 'charge' ? 'CHARGED' : 'EXCUSED')
      : undefined;
    const refundGone = a.kind === 'refund' && choice === 'refund' && (b.state !== 'CHARGED' || !!b.refundId || !!b.paymentIssue);
    if (refundGone || (target && (b.state === target || !canTransition(b.state, target)))) {
      throw new StaleCardError(`this card is out of date: the booking is already ${b.refundId ? "refunded" : b.state}; nothing was changed`);
    }
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
    if (b.holdVoided) {
      this.audit.add('engine', `capture not attempted: ${b.holdVoided}`, { bookingId: b.id });
      this.setState(b, 'EXCUSED', 'the hold was voided at PayPal before the fee was charged; nothing collected');
      throw new StaleCardError(`${b.holdVoided}; nothing was sent to PayPal`);
    }
    if (b.holdExpiresAt !== undefined && this.now() >= b.holdExpiresAt) {
      // every reauthorize/capture would fail from here on: settle it now instead of a card that fails on each tap
      const when = new Date(b.holdExpiresAt).toISOString().slice(0, 10);
      this.audit.add('engine', `capture not attempted: PayPal authorization ${b.authorizationId} expired on ${when} (29-day limit); nothing can be collected`, { bookingId: b.id });
      this.setState(b, 'EXCUSED', 'the hold expired before the fee was charged; nothing collected');
      throw new StaleCardError(`the PayPal authorization expired on ${when} (authorizations last 29 days), so this fee can no longer be charged; nothing was sent to PayPal`);
    }
    const violations = captureViolations({ amountCents: feeCents, authorizedCents: b.holdCents, rules: this.rulesFor(b), label: b.cancelledAt ? b.lastLabel : undefined, ownerApproved: true, kind: b.cancelledAt ? 'late_cancel' : 'no_show' });
    if (violations.length) {
      this.audit.add('engine', `capture blocked: ${violations.join('; ')}`, { bookingId: b.id });
      throw new PaymentsError('ENGINE_INVARIANT', violations.join('; '));
    }
    if (this.now() - (b.authorizedAt ?? 0) > 3 * DAY && !b.reauthorized) {
      // PayPal allows one reauthorization per authorization; after that we capture as-is (best effort)
      const r = await this.reauthorize(b);
      this.audit.add('paypal', `honor period over: reauthorize first → ${r.status}`, { bookingId: b.id, data: r });
      if (r.status === 'PENDING' && r.authorizationId) this.onReauthPending(b, r.authorizationId, r.issue); // capture the current hold as-is
      else {
        if (r.status !== 'AUTHORIZED' || !r.authorizationId) throw new PaymentsError(r.issue ?? 'REAUTHORIZE_FAILED', 'could not refresh the hold before capture');
        b.reauthorized = true;
        await this.onAuthorized(b, r.authorizationId);
      }
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

  /** What a refund of this booking sends: the captured fee less any part already refunded (e.g. in the PayPal dashboard). */
  private refundRest(b: Booking): { fee: number; refunded: number; cents: number } {
    const fee = b.capturedCents ?? b.holdCents;
    const refunded = Math.min(fee, b.refundedCents ?? 0);
    return { fee, refunded, cents: fee - refunded };
  }

  /** Owner relents after a capture. */
  async refund(bookingId: string): Promise<Booking> {
    const b = this.booking(bookingId);
    if (b.state !== 'CHARGED' || !b.captureId) throw new Error('nothing to refund');
    if (b.refundId) throw new Error('already refunded');
    if (b.paymentIssue) throw new Error(`no collected fee to refund: ${b.paymentIssue}`);
    const retry = this.refundRetries.get(b.id) ?? 0;
    // a part may already be refunded in the PayPal dashboard: refund the rest (PayPal refuses more than captured)
    const { fee, cents: rest } = this.refundRest(b);
    const r = await this.gateway.refund(b.captureId, rest, this.intentKey(b, 'refund', retry ? `${b.captureId}-retry${retry}` : b.captureId));
    b.refundId = r.refundId;
    (b.refunds ??= []).push({ id: r.refundId, cents: r.amountCents });
    b.refundedCents = Math.min(fee, (b.refundedCents ?? 0) + r.amountCents);
    this.audit.add('paypal', `refund ${r.refundId} ($${(r.amountCents / 100).toFixed(2)})`, { bookingId: b.id, data: r });
    this.say(b.clientId, `${this.ownerName} refunded your fee. No hard feelings!`);
    this.emit('state');
    return b;
  }

  // ---------- views ----------

  snapshot() {
    const feeDecisionPending = new Set(this.approvals.filter((a) => a.kind === 'capture' && !a.resolved).map((a) => a.bookingId));
    const view = (b: Booking) => ({
      ...b,
      clientName: this.client(b.clientId).name,
      serviceName: this.services.get(b.serviceId)?.name,
      // a booking that never had an authorization has no money at stake, whatever its state
      money: b.paymentIssue
        ? 'reversed'
        : b.holdVoided && !b.captureId && !isTerminal(b.state)
        ? 'voided'
        : b.refundId
        ? 'refunded'
        : b.captureId && b.refundedCents
        ? 'part-refunded'
        : !b.authorizationId && !['VAULTED', 'HOLD_FAILED'].includes(b.state)
          ? 'none'
          : // refill window over and the fee card is waiting: the hold is simply held until the owner decides
            b.state === 'PENDING_REFILL' && feeDecisionPending.has(b.id)
            ? 'held'
            : moneyState(b.state, !!b.captureId),
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
      agentToolkit: this.paypalReader
        ? {
            package: `${TOOLKIT_PACKAGE}@${TOOLKIT_VERSION}`,
            via: this.paypalReader.via,
            tools: this.paypalReader.tools().map((t) => t.name),
            notGiven: TOOLKIT_MONEY_TOOLS.map((n) => `${TOOLKIT_PREFIX}${n}`),
            http: this.paypalReader.http.slice(-20),
          }
        : null,
      unreleasedAuths: this.unreleasedAuths,
      offers: this.offers,
      messages: this.messages,
      jobs: this.clock.pending(),
      clockMode: this.clock.real ? ('real' as const) : ('demo' as const),
      timeZone: this.timeZone,
      hours: this.hours,
    };
  }
}
