export type Money = 'none' | 'vaulted' | 'held' | 'pending-refill' | 'voided' | 'captured' | 'failed' | 'refunded' | 'part-refunded' | 'reversed';

export interface BookingView {
  id: string;
  clientId: string;
  clientName: string;
  serviceName: string;
  serviceId: string;
  start: number;
  end: number;
  state: string;
  money: Money;
  holdCents: number;
  authorizationId?: string;
  captureId?: string;
  capturedCents?: number;
  refundId?: string;
  /** refunded so far (ours and refunds made in the PayPal dashboard) */
  refundedCents?: number;
  approvalLink?: string;
  orderId?: string;
  refillOfBookingId?: string;
  refilledByBookingId?: string;
  policyVersion: number;
  policyHash: string;
}

export interface Approval {
  id: string;
  kind: 'attendance' | 'capture' | 'review' | 'refund';
  bookingId: string;
  createdAt: number;
  prompt: string;
  options: string[];
  feeCents?: number;
  suggested?: string;
}

export interface ChatMessage {
  id: string;
  at: number;
  clientId: string;
  from: 'client' | 'frontdesk';
  text: string;
}

export interface AuditEntry {
  seq: number;
  at: number;
  kind: string;
  bookingId?: string;
  summary: string;
}

export interface TraceStep {
  n: number;
  kind: 'tool' | 'denied' | 'code' | 'effect' | 'gate' | 'owner';
  name: string;
  access?: 'read' | 'model' | 'propose' | 'end';
  /** 'paypal-agent-toolkit' for PayPal's official toolkit tools */
  source?: string;
  why?: string;
  args?: Record<string, unknown>;
  result?: string;
}

export interface AgentRun {
  id: string;
  at: number;
  clientId: string;
  clientName: string;
  text: string;
  bookingId?: string;
  provider: string;
  steps: TraceStep[];
  answer?: string;
  gate: { kind: 'none' | 'auto_release' | 'owner_approval' | 'refill' | 'code'; summary: string; approvalId?: string; resolved?: string };
}

export interface PolicyRules {
  holdCents: number;
  freeCancelHours: number;
  lateCancelFeeCents: number;
  noShowFeeCents: number;
  excusedReasons: string[];
  excusalLimit: { count: number; months: number };
  protectedReasons: string[];
  refillWaives: boolean;
  minConfidence: number;
}

export interface Snapshot {
  workspace: string;
  now: number;
  mode: 'ask' | 'autopilot';
  paymentsMode: 'mock' | 'sandbox';
  aiProvider: string;
  owner: string;
  business: string;
  policy: { version: number; hash: string; rules: PolicyRules; prose: string; summary: string };
  services: Array<{ id: string; name: string; durationMin: number; priceCents: number }>;
  clients: Array<{ id: string; name: string; vaulted: boolean; sandboxDecline: boolean }>;
  bookings: BookingView[];
  waitlist: Array<{ id: string; clientId: string; text: string; parsed?: { serviceIds: string[]; days: number[]; earliestMin: number; latestMin: number } }>;
  approvals: Approval[];
  unreleasedAuths?: Array<{ bookingId: string; authorizationId: string; error: string }>;
  messages: ChatMessage[];
  agentRuns?: AgentRun[];
  agentToolsNotGiven?: string[];
  /** PayPal Agent Toolkit read tools in the owner's agent (null when PAYPAL_AGENT_TOOLKIT=off) */
  agentToolkit?: { package: string; via?: 'functions' | 'mcp'; tools: string[]; notGiven: string[]; http: Array<{ method: string; path: string; status: number; blocked?: boolean }> } | null;
  jobs: Array<{ id: string; at: number; name: string }>;
}

/** GET /api/ws/:ws/public: what the booking link may see (no other clients, messages or audit). */
export interface PublicInfo {
  workspace: string;
  business: string;
  owner: string;
  paymentsMode: 'mock' | 'sandbox';
  services: Snapshot['services'];
  policy: { version: number; hash: string; summary: string; rules: { holdCents: number } };
}

export interface Ambiguity {
  id: string;
  question: string;
  span: string;
  options: Array<{ label: string; patch: Partial<PolicyRules> }>;
}

export interface DemoStatus {
  step: number;
  total: number;
  beats: Array<{ id: string; title: string; say: string; view: { tab?: 'console' | 'policy' | 'agent' | 'ledger'; sel?: string; phone?: string }; done: boolean }>;
  bookingIds: Record<string, string>;
}

/**
 * The owner token of a private workspace (the workspace id alone is the public booking link). It arrives
 * from POST /api/workspaces or once in the URL fragment (#owner=...), and is kept in this browser.
 */
export function ownerToken(ws: string): string | undefined {
  try {
    return localStorage.getItem(`hms-owner:${ws}`) ?? undefined;
  } catch {
    return memTokens.get(ws);
  }
}
const memTokens = new Map<string, string>();
export function rememberOwnerToken(ws: string, token: string) {
  memTokens.set(ws, token);
  try {
    localStorage.setItem(`hms-owner:${ws}`, token);
  } catch {
    /* private window: kept for this page only */
  }
}

/** `/api/ws/<ws><rest>` with the workspace id encoded: a crafted ?ws= must not reach another route. */
export const wsPath = (ws: string, rest = '') => `/api/ws/${encodeURIComponent(ws)}${rest}`;
const enc = encodeURIComponent;

export class Api {
  constructor(public ws: string) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = ownerToken(this.ws) ?? memTokens.get(this.ws);
    const headers: Record<string, string> = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers['x-owner-token'] = token;
    const r = await fetch(wsPath(this.ws, path), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? r.statusText);
    return j as T;
  }

  state = () => this.req<Snapshot>('GET', '/state');
  audit = (bookingId?: string) => this.req<AuditEntry[]>('GET', `/audit${bookingId ? `?booking=${enc(bookingId)}` : ''}`);
  send = (clientId: string, text: string) => this.req<{ state: Snapshot }>('POST', '/messages', { clientId, text });
  resolve = (id: string, choice: string) => this.req<{ state: Snapshot }>('POST', `/approvals/${enc(id)}`, { choice });
  travel = (to: number) => this.req<{ state: Snapshot; result: string[] }>('POST', '/time', { to });
  mode = (mode: 'ask' | 'autopilot') => this.req<{ state: Snapshot }>('POST', '/mode', { mode });
  ask = (text: string) => this.req<{ state: Snapshot; result: { answer: string; runId: string } }>('POST', '/assistant', { text });
  refund = (id: string) => this.req<{ state: Snapshot }>('POST', `/bookings/${enc(id)}/refund`);
  reset = () => this.req<{ state: Snapshot }>('POST', '/reset');
  compile = (prose: string) =>
    this.req<{ result: { rules: PolicyRules; ambiguities: Ambiguity[]; spans: Array<{ field: string; text: string }>; errors: string[] } }>('POST', '/policy/compile', { prose });
  approvePolicy = (rules: PolicyRules, prose: string) => this.req<{ state: Snapshot }>('POST', '/policy/approve', { rules, prose });
  simApprove = (orderId: string) => this.req<{ state: Snapshot }>('POST', `/sim/approve/${enc(orderId)}`);
  demo = () => this.req<DemoStatus>('GET', '/demo');
  paypalRequests = <T>() => this.req<T[]>('GET', '/paypal-requests');
  demoNext = () => this.req<{ state: Snapshot; result: DemoStatus }>('POST', '/demo/next');
}

export const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
