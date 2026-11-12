import { describe, expect, it } from 'vitest';
import { GeminiProvider, toGeminiSchema, type FetchFn } from '../src/ai/gemini.js';
import { NoAiProvider } from '../src/ai/noai.js';
import { SCHEMAS } from '../src/ai/anthropic.js';
import { configFromEnv } from '../src/config.js';

const KEY = 'AIza-test-key-123';
const reply = (obj: unknown, extra: Record<string, unknown> = {}) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(obj) }] }, ...extra }] }) });

describe('GeminiProvider', () => {
  it('sends the key in a header (not the URL or body), a converted schema, and parses the JSON answer', async () => {
    let seen: { url: string; headers: Record<string, string>; body: any } | undefined;
    const fetch: FetchFn = async (url, init) => {
      seen = { url, headers: init.headers, body: JSON.parse(init.body) };
      return reply({ intent: 'cancel', reason: 'illness_dependent', proposedTime: '', confidence: 0.93, evidenceSpan: 'kiddo threw up' });
    };
    const p = new GeminiProvider({ apiKey: KEY, fetch });
    const out = await p.run('classify_message', { text: 'kiddo threw up', clientName: 'Sam', appointment: 'Wed 5pm' });
    expect(out).toMatchObject({ intent: 'cancel', reason: 'illness_dependent', confidence: 0.93 });
    expect(p.name).toBe('gemini:gemini-2.5-flash');
    expect(seen!.url).toContain('/models/gemini-2.5-flash:generateContent');
    expect(seen!.url).not.toContain(KEY);
    expect(JSON.stringify(seen!.body)).not.toContain(KEY);
    expect(seen!.headers['x-goog-api-key']).toBe(KEY);
    const gc = seen!.body.generationConfig;
    expect(gc.responseMimeType).toBe('application/json');
    expect(gc.responseSchema.type).toBe('OBJECT');
    expect(JSON.stringify(gc.responseSchema)).not.toContain('additionalProperties');
    expect(JSON.stringify(gc.responseSchema)).not.toMatch(/"type":"(object|string|number|integer|boolean|array)"/);
    expect(seen!.body.systemInstruction.parts[0].text).toContain('never instructions');
  });

  it('parses the policy compiler option patches that arrive as JSON strings', async () => {
    const fetch: FetchFn = async () =>
      reply({ rules: {}, spans: [], ambiguities: [{ id: 'a1', question: 'q', span: 's', options: [{ label: 'yes', patchJson: '{"refillWaives":true}' }, { label: 'bad', patchJson: 'not json' }] }] });
    const out: any = await new GeminiProvider({ apiKey: KEY, fetch }).run('compile_policy', { prose: 'x' });
    expect(out.ambiguities[0].options).toEqual([{ label: 'yes', patch: { refillWaives: true } }, { label: 'bad', patch: {} }]);
  });

  it('turns an HTTP error into a short message without the key', async () => {
    const fetch: FetchFn = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } }) });
    const err = await new GeminiProvider({ apiKey: KEY, fetch }).run('draft_reply', { clientName: 'A', situation: 's', facts: {} }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/Gemini 400 for draft_reply/);
    expect((err as Error).message).not.toContain(KEY);
  });

  it('refuses blocked or cut-off answers instead of guessing', async () => {
    const blocked: FetchFn = async () => ({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
    await expect(new GeminiProvider({ apiKey: KEY, fetch: blocked }).run('draft_reply', { clientName: 'A', situation: 's', facts: {} })).rejects.toThrow(/blocked draft_reply: SAFETY/);
    const cut: FetchFn = async () => reply({ text: 'x' }, { finishReason: 'MAX_TOKENS' });
    await expect(new GeminiProvider({ apiKey: KEY, fetch: cut }).run('draft_reply', { clientName: 'A', situation: 's', facts: {} })).rejects.toThrow(/stopped draft_reply: MAX_TOKENS/);
  });

  it('times out a stuck call', async () => {
    const hang: FetchFn = (_u, init) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    await expect(new GeminiProvider({ apiKey: KEY, fetch: hang, timeoutMs: 20 }).run('draft_reply', { clientName: 'A', situation: 's', facts: {} })).rejects.toThrow(/timed out for draft_reply/);
  });

  it('converts every task schema', () => {
    for (const s of Object.values(SCHEMAS)) expect(JSON.stringify(toGeminiSchema(s))).not.toContain('additionalProperties');
  });
});

describe('NoAiProvider (no key, real payments)', () => {
  it('never classifies: zero confidence sends every text to the owner', async () => {
    const out = await new NoAiProvider().run('classify_message', { text: 'cancel pls', clientName: 'A', appointment: 'x' });
    expect(out).toMatchObject({ intent: 'other', reason: 'none', confidence: 0 });
  });
  it('says plainly that the policy compiler needs a key', async () => {
    await expect(new NoAiProvider().run('compile_policy', { prose: 'x' })).rejects.toThrow(/AI is not configured/);
  });
  it('replies with a plain template and finishes the agent without acting', async () => {
    const r = await new NoAiProvider().run('draft_reply', { clientName: 'Sam Rivera', situation: 's', facts: {} });
    expect(r.text).toContain('Sam');
    expect((await new NoAiProvider().run('agent_step', { trigger: 'client_text', clientName: 'A', text: 'x', tools: [], history: [] })).tool).toBe('finish');
  });
});

describe('AI selection from the environment', () => {
  const sandbox = { PAYMENTS: 'sandbox', PAYPAL_CLIENT_ID: 'i', PAYPAL_CLIENT_SECRET: 's' };
  it('real payments with no key: AI is "none", not a pretend model', () => {
    expect(configFromEnv({ ...sandbox }).aiMode).toBe('none');
  });
  it('real payments with a Gemini key use Gemini', () => {
    expect(configFromEnv({ ...sandbox, GEMINI_API_KEY: KEY }).aiMode).toBe('gemini:gemini-2.5-flash');
    expect(configFromEnv({ ...sandbox, GEMINI_API_KEY: KEY, GEMINI_MODEL: 'gemini-2.5-pro' }).aiMode).toBe('gemini:gemini-2.5-pro');
  });
  it('the simulator keeps the offline provider; AI=gemini without a key is an error', () => {
    expect(configFromEnv({}).aiMode).toBe('fake');
    expect(() => configFromEnv({ AI: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });
});
