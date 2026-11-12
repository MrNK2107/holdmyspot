import { INSTRUCTIONS, SCHEMAS, SYSTEM, finishOutput } from './anthropic.js';
import type { AiTask, AiTasks, LlmProvider } from './provider.js';

/**
 * Real LLM provider: Google Gemini through the REST API (generateContent) with a JSON response schema.
 * Enable with AI=gemini + GEMINI_API_KEY (model: GEMINI_MODEL, default gemini-2.5-flash). Same prompts and
 * schemas as the Claude provider: the model only returns labels and text, and FrontDesk whitelists them again.
 * The key goes in the x-goog-api-key header, never in the URL, and is never echoed in an error.
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

export class GeminiProvider implements LlmProvider {
  readonly name: string;
  private model: string;
  private apiKey: string;
  private fetchFn: FetchFn;
  private timeoutMs: number;
  private base: string;

  constructor(opts: { apiKey: string; model?: string; fetch?: FetchFn; timeoutMs?: number; baseUrl?: string }) {
    if (!opts.apiKey) throw new Error('GeminiProvider needs an API key');
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'gemini-2.5-flash';
    this.name = `gemini:${this.model}`;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init) as ReturnType<FetchFn>);
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.base = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async run<K extends AiTask>(task: K, input: AiTasks[K]['input']): Promise<AiTasks[K]['output']> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchFn(`${this.base}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
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
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Gemini ${res.status} for ${task}: ${String(j?.error?.message ?? 'request failed').slice(0, 200)}`);
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
