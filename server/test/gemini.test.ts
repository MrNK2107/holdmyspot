import { describe, expect, it } from 'vitest';
import { GeminiKeyPool, GeminiProvider, parseGeminiKeys, toGeminiSchema, type FetchFn } from '../src/ai/gemini.js';
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
    expect(p.name).toBe('gemini:gemini-3.5-flash-lite');
    expect(seen!.url).toContain('/models/gemini-3.5-flash-lite:generateContent');
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
    expect(configFromEnv({ ...sandbox, GEMINI_API_KEY: KEY }).aiMode).toBe('gemini:gemini-3.5-flash-lite');
    expect(configFromEnv({ ...sandbox, GEMINI_API_KEY: KEY, GEMINI_MODEL: 'gemini-2.5-pro' }).aiMode).toBe('gemini:gemini-2.5-pro');
  });
  it('the simulator keeps the offline provider; AI=gemini without a key is an error', () => {
    expect(configFromEnv({}).aiMode).toBe('fake');
    expect(() => configFromEnv({ AI: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });
});

describe('Gemini key rotation (several free-tier keys)', () => {
  const K = ['AIza-key-one', 'AIza-key-two', 'AIza-key-three'];
  const rate = (msg = 'Resource has been exhausted (e.g. check quota).') => ({ ok: false, status: 429, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: msg } }) });
  const ok = () => reply({ text: 'hi' });
  const input = { clientName: 'A', situation: 's', facts: {} };
  const recorder = (answers: Array<(key: string) => unknown>) => {
    const used: string[] = [];
    const fetch: FetchFn = async (_u, init) => {
      const key = init.headers['x-goog-api-key'];
      used.push(key);
      return (answers[used.length - 1] ?? answers[answers.length - 1])(key) as any;
    };
    return { fetch, used };
  };

  it('switches to the next key on a rate limit, and stays on the working key afterwards', async () => {
    const { fetch, used } = recorder([() => rate(), () => ok(), () => ok()]);
    const p = new GeminiProvider({ apiKeys: K, fetch });
    await p.run('draft_reply', input);
    await p.run('draft_reply', input);
    expect(used).toEqual([K[0], K[1], K[1]]); // one wasted call on key one, then sticky on key two
  });

  it('does not hit a limited key again until its cooldown has passed', async () => {
    let t = 1_000_000;
    const pool = new GeminiKeyPool(K.slice(0, 2), () => t);
    const { fetch, used } = recorder([() => rate(), () => rate(), () => ok()]);
    const p = new GeminiProvider({ keys: pool, fetch });
    await expect(p.run('draft_reply', input)).rejects.toThrow(/rate limited on all 2 keys/); // 2 calls, both limited
    expect(used).toHaveLength(2);
    await expect(p.run('draft_reply', input)).rejects.toThrow(/rate limited on all 2 keys/); // zero calls: all cooling
    expect(used).toHaveLength(2);
    t += 66_000; // per-minute limit has reset
    await p.run('draft_reply', input);
    expect(used).toHaveLength(3);
  });

  it('honours the retry delay Gemini reports, and rests a key for an hour on a daily quota', async () => {
    let t = 0;
    const pool = new GeminiKeyPool(K.slice(0, 2), () => t);
    const retry = { ok: false, status: 429, json: async () => ({ error: { message: 'slow down', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }] } }) };
    const { fetch, used } = recorder([() => retry, () => ok(), () => ok(), () => ok()]);
    const p = new GeminiProvider({ keys: pool, fetch });
    await p.run('draft_reply', input); // key one limited for 7s, key two answers
    t = 8_000;
    await p.run('draft_reply', input); // stays on key two (sticky); key one is free again but not needed
    expect(used.slice(0, 2)).toEqual([K[0], K[1]]);
    const daily = new GeminiKeyPool(['a', 'b'], () => t);
    daily.limit(0, 3_600_000);
    t += 61_000;
    expect(daily.pick()).toBe(1); // key a still resting
  });

  it('retires a key Gemini says is invalid and keeps going on the others', async () => {
    const bad = { ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } }) };
    const { fetch, used } = recorder([() => bad, () => ok(), () => ok()]);
    const p = new GeminiProvider({ apiKeys: K, fetch });
    await p.run('draft_reply', input);
    await p.run('draft_reply', input);
    expect(used).toEqual([K[0], K[1], K[1]]);
  });

  it('reports a clear message when every key is invalid, without echoing any key', async () => {
    const bad = { ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid.' } }) };
    const { fetch } = recorder([() => bad]);
    const err = (await new GeminiProvider({ apiKeys: K, fetch }).run('draft_reply', input).catch((e: Error) => e)) as Error;
    expect(err.message).toMatch(/no working Gemini key/i);
    for (const k of K) expect(err.message).not.toContain(k);
  });

  it('does not rotate on errors a different key cannot fix', async () => {
    const blocked: FetchFn = async () => ({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
    const used: string[] = [];
    const spy: FetchFn = (u, i) => { used.push(i.headers['x-goog-api-key']); return blocked(u, i); };
    await expect(new GeminiProvider({ apiKeys: K, fetch: spy }).run('draft_reply', input)).rejects.toThrow(/blocked draft_reply/);
    expect(used).toHaveLength(1);
  });

  it('parses GEMINI_API_KEYS (commas, spaces, new lines) with GEMINI_API_KEY, dropping duplicates', () => {
    expect(parseGeminiKeys({ GEMINI_API_KEYS: ' a1 ,b2' + String.fromCharCode(10) + 'c3;  a1 ', GEMINI_API_KEY: 'd4' })).toEqual(['a1', 'b2', 'c3', 'd4']);
    expect(parseGeminiKeys({})).toEqual([]);
  });

  it('configFromEnv uses the pool: one key pool shared by every studio provider', () => {
    const sandbox = { PAYMENTS: 'sandbox', PAYPAL_CLIENT_ID: 'i', PAYPAL_CLIENT_SECRET: 's' };
    const cfg = configFromEnv({ ...sandbox, GEMINI_API_KEYS: 'k1,k2,k3' });
    expect(cfg.aiMode).toBe('gemini:gemini-3.5-flash-lite');
    const a: any = (cfg.deps.llm as any)();
    const b: any = (cfg.deps.llm as any)();
    expect(a.pool).toBe(b.pool);
    expect(a.pool.size).toBe(3);
  });
});
