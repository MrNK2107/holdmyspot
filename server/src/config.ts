import { AnthropicProvider } from './ai/anthropic.js';
import { GeminiProvider } from './ai/gemini.js';
import { NoAiProvider } from './ai/noai.js';
import { PayPalRestGateway } from './paypal/rest.js';
import type { WorkspaceDeps } from './workspaces.js';
import type { AuthOptions } from './auth.js';

/**
 * Picks adapters from env. Defaults are the deterministic simulator and fake LLM, so the app
 * runs with no keys. PAYMENTS=sandbox with PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET switches to real
 * PayPal sandbox traffic. AI=anthropic with ANTHROPIC_API_KEY switches the front desk to Claude.
 */
export function configFromEnv(env: Record<string, string | undefined>): {
  deps: WorkspaceDeps;
  paymentsMode: string;
  aiMode: string;
  webhookVerifier?: (headers: Record<string, string | undefined>, event: unknown, rawBody?: string) => Promise<boolean>;
  /** Google sign-in and session settings (the store is added by the caller) */
  authOptions: AuthOptions;
  /** DATABASE_URL: Postgres for studios and accounts; unset = memory only */
  databaseUrl?: string;
} {
  // Render sets RENDER_EXTERNAL_URL; PUBLIC_URL overrides it (custom domain, tunnels)
  const baseUrl = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '';
  // PayPal Agent Toolkit read tools for the owner's agent: default = the toolkit's function-calling
  // surface; PAYPAL_AGENT_TOOLKIT=mcp = PayPal's MCP server class in-process; =off removes them
  const tk = env.PAYPAL_AGENT_TOOLKIT;
  const deps: WorkspaceDeps = { baseUrl, agentToolkit: tk === 'off' ? false : tk === 'mcp' ? 'mcp' : 'functions' };
  if (env.STUDIO_TIMEZONE) {
    // the studio's IANA zone (e.g. America/Los_Angeles): end-of-day review and slot labels; default UTC
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: env.STUDIO_TIMEZONE });
    } catch {
      throw new Error(`STUDIO_TIMEZONE ${env.STUDIO_TIMEZONE} is not an IANA time zone`);
    }
    deps.timeZone = env.STUDIO_TIMEZONE;
  }
  if (env.AUDIT_MAX_ENTRIES) {
    // audit retention per workspace (the shared demo is never evicted); default DEFAULT_AUDIT_MAX
    const n = Number(env.AUDIT_MAX_ENTRIES);
    if (!Number.isSafeInteger(n) || n < 100) throw new Error(`AUDIT_MAX_ENTRIES must be a whole number >= 100 (got ${env.AUDIT_MAX_ENTRIES})`);
    deps.auditMax = n;
  }
  if (env.CLOCK === 'real') deps.clock = 'real';
  let paymentsMode = 'mock';
  let webhookVerifier: ((headers: Record<string, string | undefined>, event: unknown, rawBody?: string) => Promise<boolean>) | undefined;
  if (env.PAYMENTS === 'sandbox') {
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error('PAYMENTS=sandbox needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET');
    // PayPal needs an absolute URL to send the buyer back to; without PUBLIC_URL / RENDER_EXTERNAL_URL
    // a relative one would strand them on PayPal, so fall back to this server on localhost.
    const origin = (baseUrl || `http://localhost:${env.PORT ?? 18080}`).replace(/\/+$/, '');
    const gw = new PayPalRestGateway({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      returnUrl: `${origin}/paypal/return`,
      cancelUrl: `${origin}/paypal/cancel`,
    });
    deps.gateway = gw;
    deps.seedMode = 'studio';
    // real payments run on real time unless CLOCK=demo
    deps.clock = env.CLOCK === 'demo' ? 'demo' : 'real';
    deps.toolkitCredentials = { clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET };
    paymentsMode = 'sandbox';
    const webhookId = env.PAYPAL_WEBHOOK_ID;
    if (webhookId) webhookVerifier = (headers, event, rawBody) => gw.verifyWebhook(headers, event, webhookId, rawBody);
  }
  // AI defaults: with real payments, Gemini if a key is set, else an honest "not configured" provider; the simulator keeps the offline provider
  const ai = env.AI || (env.PAYMENTS === 'sandbox' ? (env.GEMINI_API_KEY ? 'gemini' : env.ANTHROPIC_API_KEY ? 'anthropic' : 'none') : 'fake');
  let aiMode = 'fake';
  if (ai === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new Error('AI=gemini needs GEMINI_API_KEY');
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    deps.llm = () => new GeminiProvider({ apiKey: env.GEMINI_API_KEY!, model });
    aiMode = `gemini:${model}`;
  } else if (ai === 'none') {
    deps.llm = () => new NoAiProvider();
    aiMode = 'none';
  } else if (ai === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('AI=anthropic needs ANTHROPIC_API_KEY');
    const model = env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
    deps.llm = () => new AnthropicProvider({ model, apiKey: env.ANTHROPIC_API_KEY });
    aiMode = `anthropic:${model}`;
  }
  const authOptions: AuthOptions = {
    baseUrl,
    sessionSecret: env.SESSION_SECRET || undefined,
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),
  };
  return { deps, paymentsMode, aiMode, webhookVerifier, authOptions, databaseUrl: env.DATABASE_URL || undefined };
}
