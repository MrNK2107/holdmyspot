export type Money = 'none' | 'vaulted' | 'held' | 'pending-refill' | 'voided' | 'captured' | 'failed' | 'refunded';

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
  jobs: Array<{ id: string; at: number; name: string }>;
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

export class Api {
  constructor(public ws: string) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(`/api/ws/${this.ws}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? r.statusText);
    return j as T;
  }

  state = () => this.req<Snapshot>('GET', '/state');
  audit = (bookingId?: string) => this.req<AuditEntry[]>('GET', `/audit${bookingId ? `?booking=${bookingId}` : ''}`);
  send = (clientId: string, text: string) => this.req<{ state: Snapshot }>('POST', '/messages', { clientId, text });
  resolve = (id: string, choice: string) => this.req<{ state: Snapshot }>('POST', `/approvals/${id}`, { choice });
  travel = (to: number) => this.req<{ state: Snapshot; result: string[] }>('POST', '/time', { to });
  mode = (mode: 'ask' | 'autopilot') => this.req<{ state: Snapshot }>('POST', '/mode', { mode });
  ask = (text: string) => this.req<{ state: Snapshot; result: { answer: string; runId: string } }>('POST', '/assistant', { text });
  refund = (id: string) => this.req<{ state: Snapshot }>('POST', `/bookings/${id}/refund`);
  reset = () => this.req<{ state: Snapshot }>('POST', '/reset');
  compile = (prose: string) =>
    this.req<{ result: { rules: PolicyRules; ambiguities: Ambiguity[]; spans: Array<{ field: string; text: string }>; errors: string[] } }>('POST', '/policy/compile', { prose });
  approvePolicy = (rules: PolicyRules, prose: string) => this.req<{ state: Snapshot }>('POST', '/policy/approve', { rules, prose });
  simApprove = (orderId: string) => this.req<{ state: Snapshot }>('POST', `/sim/approve/${orderId}`);
  demo = () => this.req<DemoStatus>('GET', '/demo');
  demoNext = () => this.req<{ state: Snapshot; result: DemoStatus }>('POST', '/demo/next');
}

export const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
