import { describe, expect, it } from 'vitest';
import { AnthropicProvider, SCHEMAS, type MessagesClient } from '../src/ai/anthropic.js';

function fakeClient(reply: unknown, stop = 'end_turn') {
  const calls: any[] = [];
  const client: MessagesClient = {
    messages: {
      async create(p: any) {
        calls.push(p);
        return { stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(reply) }] };
      },
    },
  };
  return { client, calls };
}

describe('AnthropicProvider (no network)', () => {
  it('sends a structured-output request and parses the JSON', async () => {
    const { client, calls } = fakeClient({ intent: 'cancel', reason: 'illness_dependent', proposedTime: '', confidence: 0.9, evidenceSpan: 'kid is sick' });
    const p = new AnthropicProvider({ client });
    const out = await p.run('classify_message', { text: 'kid is sick, cancel', clientName: 'Sam', appointment: 'Wed 5pm' });
    expect(out.reason).toBe('illness_dependent');
    expect(calls[0].model).toBe('claude-sonnet-5-5');
    expect(calls[0].output_config.format).toEqual({ type: 'json_schema', schema: SCHEMAS.classify_message });
    expect(calls[0].tool_choice).toBeUndefined();
    expect(calls[0].messages[0].content).toContain('<input>');
  });

  it('surfaces refusals and truncation as errors', async () => {
    await expect(new AnthropicProvider({ client: fakeClient({}, 'refusal').client }).run('draft_reply', { clientName: 'a', situation: 'x', facts: {} })).rejects.toThrow('refused');
    await expect(new AnthropicProvider({ client: fakeClient({}, 'max_tokens').client }).run('draft_reply', { clientName: 'a', situation: 'x', facts: {} })).rejects.toThrow(
      'truncated',
    );
  });

  it('every schema is strict (additionalProperties false, all required)', () => {
    for (const s of Object.values(SCHEMAS) as any[]) {
      expect(s.additionalProperties).toBe(false);
      expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
    }
  });
});
