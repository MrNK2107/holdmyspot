import type { AiTask, AiTasks, LlmProvider } from './provider.js';

/**
 * Used when no AI key is configured and payments are real. It never pretends to understand anything:
 * texts are labelled "other" with zero confidence, so the policy engine sends every one to the owner's review queue,
 * replies are plain templates, and the policy compiler says it is not configured.
 */
export class NoAiProvider implements LlmProvider {
  readonly name = 'none';

  async run<K extends AiTask>(task: K, input: AiTasks[K]['input']): Promise<AiTasks[K]['output']> {
    const who = (input as { clientName?: string }).clientName;
    const out: Record<AiTask, () => unknown> = {
      classify_message: () => ({ intent: 'other', reason: 'none', confidence: 0, evidenceSpan: '' }),
      draft_reply: () => ({ text: `Thanks${who ? `, ${who.split(' ')[0]}` : ''}. Your message reached the studio and the owner will reply soon.` }),
      parse_waitlist_entry: () => ({ serviceIds: [], days: [], earliestMin: 0, latestMin: 1440 }),
      rank_and_draft_offer: () => ({
        order: (input as { candidates: Array<{ id: string }> }).candidates.map((c) => c.id),
        offer: 'A spot just opened up. Reply YES to take it.',
      }),
      agent_step: () => ({ tool: 'finish', argsJson: '{}', why: 'AI is not configured, so this goes to the owner.' }),
      compile_policy: () => {
        throw new Error('AI is not configured: add GEMINI_API_KEY to turn your policy text into rules. The default policy stays live.');
      },
    };
    return out[task]() as AiTasks[K]['output'];
  }
}
