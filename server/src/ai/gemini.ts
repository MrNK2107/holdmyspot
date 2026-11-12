import { INSTRUCTIONS, SCHEMAS, SYSTEM, finishOutput } from './anthropic.js';
import type { AiTask, AiTasks, LlmProvider } from './provider.js';

/**
 * Real LLM provider: Google Gemini through the REST API (generateContent) with a JSON response schema.
 * Enable with AI=gemini + GEMINI_API_KEY (model: GEMINI_MODEL, default gemini-3.5-flash-lite). Same prompts and
 * schemas as the Claude provider: the model only returns labels and text, and FrontDesk whitelists them again.
 * The key goes in the x-goog-api-key header, never in the URL, and is never echoed in an error.
 *
 * Several free-tier keys can be supplied (GEMINI_API_KEYS). The provider stays on one key until Gemini rate-limits
 * it (HTTP 429), then moves to the next, and rests the limited key until its cooldown has passed. A key Gemini
 * calls invalid is retired. One request is sent per attempt: a limited key is never retried while it is cooling.
 */

export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/** Gemini's responseSchema is an OpenAPI subset: upper-case types, no additionalProperties. */
export function toGeminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties') continue;
    out[k] = k === 'type' && typeof v === 'string' ? v.toUpperCase() : toGeminiSchema(v);
  }
  return out;
}

/** Gemini's retryDelay ("32s") from a 429 body, in ms. */
function retryDelayMs(j: any): number | undefined {
  const d = (j?.error?.details ?? []).find((x: any) => typeof x?.retryDelay === 'string')?.retryDelay as string | undefined;
  const m = d && /^(\d+(?:\.\d+)?)s$/.exec(d);
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined;
}

/** All Gemini keys from the environment: GEMINI_API_KEYS (comma, semicolon, space or new line separated) plus GEMINI_API_KEY. */
export function parseGeminiKeys(env: { GEMINI_API_KEYS?: string; GEMINI_API_KEY?: string }): string[] {
  const all = `${env.GEMINI_API_KEYS ?? ''},${env.GEMINI_API_KEY ?? ''}`.split(/[\s,;]+/).filter(Boolean);
  return [...new Set(all)];
}

/**
 * The keys and their state, shared by every provider so a limit found by one studio is known to all.
 * Sticky: it keeps returning the current key until that key is limited or retired.
 */
export class GeminiKeyPool {
  private keys: string[];
  private until: number[];
  private dead: boolean[];
  private cur = 0;

  constructor(keys: string[], private now: () => number = () => Date.now()) {
    if (!keys.length) throw new Error('GeminiKeyPool needs at least one API key');
    this.keys = keys;
    this.until = keys.map(() => 0);
    this.dead = keys.map(() => false);
  }
  get size(): number {
    return this.keys.length;
  }
  key(i: number): string {
    return this.keys[i];
  }
  /** Index of the key to use now, or null when every key is resting or retired. */
  pick(): number | null {
    for (let o = 0; o < this.keys.length; o++) {
      const i = (this.cur + o) % this.keys.length;
      if (!this.dead[i] && this.until[i] <= this.now()) {
        this.cur = i;
        return i;
      }
    }
    return null;
  }
  /** Rest key i for ms (a rate limit). */
  limit(i: number, ms: number): void {
    this.until[i] = Math.max(this.until[i], this.now() + ms);
  }
  /** Retire key i for good (Gemini says it is not valid). */
  retire(i: number): void {
    this.dead[i] = true;
  }
  allRetired(): boolean {
    return this.dead.every(Boolean);
  }
  /** Seconds until the soonest resting key is usable again. */
  soonestSeconds(): number {
    const waits = this.until.filter((_, i) => !this.dead[i]).map((u) => Math.max(0, u - this.now()));
    return Math.ceil(Math.min(...waits) / 1000);
  }
}

export class GeminiProvider implements LlmProvider {
  readonly name: string;
  private model: string;
  private pool: GeminiKeyPool;
  private fetchFn: FetchFn;
  private timeoutMs: number;
  private base: string;

  constructor(opts: { apiKey?: string; apiKeys?: string[]; keys?: GeminiKeyPool; model?: string; fetch?: FetchFn; timeoutMs?: number; baseUrl?: string }) {
    const list = [...new Set([...(opts.apiKeys ?? []), ...(opts.apiKey ? [opts.apiKey] : [])].filter(Boolean))];
    if (!opts.keys && !list.length) throw new Error('GeminiProvider needs an API key');
    this.pool = opts.keys ?? new GeminiKeyPool(list);
    this.model = opts.model ?? 'gemini-3.5-flash-lite';
    this.name = `gemini:${this.model}`;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init) as ReturnType<FetchFn>);
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.base = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async run<K extends AiTask>(task: K, input: AiTasks[K]['input']): Promise<AiTasks[K]['output']> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      let res: Awaited<ReturnType<FetchFn>> | undefined;
      let j: any;
      // at most one request per key, and none to a key that is resting
      for (let attempt = 0; attempt < this.pool.size; attempt++) {
        const k = this.pool.pick();
        if (k === null) break;
        res = await this.fetchFn(`${this.base}/models/${encodeURIComponent(this.model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.pool.key(k) },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: `${INSTRUCTIONS[task]}\n\n<input>\n${JSON.stringify(input)}\n</input>` }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: toGeminiSchema(SCHEMAS[task]),
              temperature: task === 'draft_reply' ? 0.6 : 0.1,
              maxOutputTokens: 4000,
            },
          }),
          signal: ctl.signal,
        });
        j = await res.json().catch(() => ({}));
        if (res.ok) break;
        const msg = String(j?.error?.message ?? '');
        if (res.status === 429) {
          // per-minute limits clear fast; a daily quota needs a long rest
          this.pool.limit(k, retryDelayMs(j) ?? (/per ?day|daily/i.test(msg) ? 3_600_000 : 65_000));
          continue;
        }
        if (/api key not valid|api_key_invalid|key expired/i.test(msg) || res.status === 401) {
          this.pool.retire(k);
          continue;
        }
        if (res.status >= 500) {
          this.pool.limit(k, 15_000); // a hiccup at Gemini: try another key, come back later
          continue;
        }
        break; // a different key would not change this answer
      }
      const limited = `Gemini rate limited on all ${this.pool.size} keys for ${task}; next key is free in about ${this.pool.soonestSeconds()}s`;
      const noKey = `Gemini ${res?.status ?? 400} for ${task}: no working Gemini key (all ${this.pool.size} keys were rejected)`;
      if (!res) throw new Error(this.pool.allRetired() ? noKey : limited);
      if (!res.ok) {
        if (this.pool.allRetired()) throw new Error(noKey);
        if (res.status === 429) throw new Error(limited);
        throw new Error(`Gemini ${res.status} for ${task}: ${String(j?.error?.message ?? 'request failed').slice(0, 200)}`);
      }
      const cand = j?.candidates?.[0];
      if (!cand) throw new Error(`Gemini blocked ${task}: ${j?.promptFeedback?.blockReason ?? 'no candidates'}`);
      if (cand.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(cand.finishReason)) {
        throw new Error(`Gemini stopped ${task}: ${cand.finishReason}`);
      }
      const text = (cand.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
      if (!text) throw new Error(`Gemini returned no JSON for ${task}`);
      return finishOutput(task, JSON.parse(text));
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error(`LLM call timed out for ${task}`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
