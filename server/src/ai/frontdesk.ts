import type { AuditLog } from '../audit.js';
import { validateRules, type PolicyRules } from '../domain/policy.js';
import type { CancelReason, MessageIntent, MessageLabel, Service, WaitlistConstraints } from '../domain/types.js';
import { FrontDeskAgent } from './agent.js';
import type { AiTasks, Ambiguity, LlmProvider } from './provider.js';

const INTENTS: MessageIntent[] = ['cancel', 'reschedule', 'running_late', 'confirm', 'question', 'other'];
const REASONS: CancelReason[] = [
  'illness_self',
  'illness_dependent',
  'medical_emergency',
  'bereavement',
  'emergency_other',
  'work',
  'transport',
  'forgot',
  'no_reason',
  'none',
];

/**
 * The AI front desk. Wraps an LlmProvider, whitelists every output field, and audits it.
 * It returns labels and text. It has no access to the payments gateway (enforced by a test).
 */
export class FrontDesk {
  constructor(
    private llm: LlmProvider,
    private audit: AuditLog,
  ) {
    this.agent = new FrontDeskAgent(llm, audit);
  }

  get providerName(): string {
    return this.llm.name;
  }

  /** The tool-calling loop over the same provider. Its toolset is supplied by the engine per run. */
  readonly agent: FrontDeskAgent;

  /** Whitelist a label from any AI source (classifier output or an agent's proposal arguments). */
  sanitizeLabel(raw: Partial<Record<keyof MessageLabel, unknown>>): MessageLabel {
    return {
      intent: INTENTS.includes(raw.intent as MessageIntent) ? (raw.intent as MessageIntent) : 'other',
      reason: REASONS.includes(raw.reason as CancelReason) ? (raw.reason as CancelReason) : 'none',
      confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
      evidenceSpan: String(raw.evidenceSpan ?? '').slice(0, 200),
      ...(raw.proposedTime ? { proposedTime: String(raw.proposedTime).slice(0, 60) } : {}),
    };
  }

  async classifyMessage(text: string, clientName: string, appointment: string, bookingId?: string): Promise<MessageLabel> {
    const raw = await this.llm.run('classify_message', { text, clientName, appointment });
    const label = this.sanitizeLabel(raw);
    this.audit.add('ai', `classify_message → ${label.intent}/${label.reason} (${label.confidence.toFixed(2)})`, { bookingId, data: label });
    return label;
  }

  async compilePolicy(prose: string): Promise<{ rules: PolicyRules; ambiguities: Ambiguity[]; spans: AiTasks['compile_policy']['output']['spans']; errors: string[] }> {
    const out = await this.llm.run('compile_policy', { prose });
    const errors = validateRules(out.rules);
    this.audit.add('ai', `compile_policy → ${out.ambiguities.length} question(s)${errors.length ? `, ${errors.length} rule error(s)` : ''}`, { data: out });
    return { ...out, errors };
  }

  async parseWaitlistEntry(text: string, services: Service[]): Promise<WaitlistConstraints> {
    const c = await this.llm.run('parse_waitlist_entry', { text, services });
    const ids = new Set(services.map((s) => s.id));
    const clampMin = (n: number) => Math.max(0, Math.min(24 * 60, Math.round(Number(n) || 0)));
    const out: WaitlistConstraints = {
      serviceIds: (c.serviceIds ?? []).filter((x) => ids.has(x)),
      days: (c.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      earliestMin: clampMin(c.earliestMin),
      latestMin: clampMin(c.latestMin ?? 24 * 60),
    };
    this.audit.add('ai', `parse_waitlist_entry → "${text.slice(0, 40)}"`, { data: out });
    return out;
  }

  async rankAndDraftOffer(slot: string, serviceName: string, candidates: Array<{ id: string; name: string; text: string }>): Promise<{ order: string[]; offer: string }> {
    const r = await this.llm.run('rank_and_draft_offer', { slot, serviceName, candidates });
    const valid = new Set(candidates.map((c) => c.id));
    // the AI may only reorder the code-filtered candidates; it cannot add anyone
    const order = [...new Set(r.order.filter((id) => valid.has(id))), ...candidates.map((c) => c.id).filter((id) => !r.order.includes(id))];
    this.audit.add('ai', `rank_and_draft_offer → ${order.join(', ')}`, { data: { order, offer: r.offer } });
    return { order, offer: String(r.offer).slice(0, 400) };
  }

  async draftReply(clientName: string, situation: string, facts: Record<string, string> = {}, bookingId?: string): Promise<string> {
    const r = await this.llm.run('draft_reply', { clientName, situation, facts });
    const text = String(r.text).slice(0, 600);
    this.audit.add('ai', `draft_reply (${situation})`, { bookingId, data: { text } });
    return text;
  }
}
