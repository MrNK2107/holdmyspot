import type { PolicyRules } from '../domain/policy.js';
import type { CancelReason, MessageIntent, Service, WaitlistConstraints } from '../domain/types.js';

/**
 * The AI layer produces labels and text only. No task has an amount, an authorization id or a
 * PayPal operation in its output; the front desk strips anything outside these shapes.
 */
export interface Ambiguity {
  id: string;
  question: string;
  /** source span in the prose */
  span: string;
  /** each option maps to a patch on the rules; code validates the patched rules */
  options: Array<{ label: string; patch: Partial<PolicyRules> }>;
}

export interface AiTasks {
  compile_policy: {
    input: { prose: string };
    output: { rules: PolicyRules; ambiguities: Ambiguity[]; spans: Array<{ field: keyof PolicyRules; text: string }> };
  };
  classify_message: {
    input: { text: string; clientName: string; appointment: string };
    output: { intent: MessageIntent; reason: CancelReason; proposedTime?: string; confidence: number; evidenceSpan: string };
  };
  parse_waitlist_entry: {
    input: { text: string; services: Service[] };
    output: WaitlistConstraints;
  };
  rank_and_draft_offer: {
    input: { slot: string; serviceName: string; candidates: Array<{ id: string; name: string; text: string }> };
    output: { order: string[]; offer: string };
  };
  draft_reply: {
    input: { clientName: string; situation: string; facts: Record<string, string> };
    output: { text: string };
  };
}

export type AiTask = keyof AiTasks;

export interface LlmProvider {
  readonly name: string;
  run<K extends AiTask>(task: K, input: AiTasks[K]['input']): Promise<AiTasks[K]['output']>;
}
