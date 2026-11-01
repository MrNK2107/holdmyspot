import { AnthropicProvider } from './ai/anthropic.js';
import { PayPalRestGateway } from './paypal/rest.js';
import type { WorkspaceDeps } from './workspaces.js';

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
  if (env.AUDIT_MAX_ENTRIES !== undefined) {
    // audit retention per workspace (the shared demo is never evicted); default DEFAULT_AUDIT_MAX
    const n = Number(env.AUDIT_MAX_ENTRIES);
    if (!Number.isSafeInteger(n) || n < 100) throw new Error(`AUDIT_MAX_ENTRIES must be a whole number >= 100 (got ${env.AUDIT_MAX_ENTRIES})`);
    deps.auditMax = n;
  }
  let paymentsMode = 'mock';
  let webhookVerifier: ((headers: Record<string, string | undefined>, event: unknown, rawBody?: string) => Promise<boolean>) | undefined;
  if (env.PAYMENTS === 'sandbox') {
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error('PAYMENTS=sandbox needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET');
    const gw = new PayPalRestGateway({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      returnUrl: `${baseUrl}/paypal/return`,
      cancelUrl: `${baseUrl}/paypal/cancel`,
    });
    deps.gateway = gw;
    deps.toolkitCredentials = { clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET };
    paymentsMode = 'sandbox';
    const webhookId = env.PAYPAL_WEBHOOK_ID;
    if (webhookId) webhookVerifier = (headers, event, rawBody) => gw.verifyWebhook(headers, event, webhookId, rawBody);
  }
  let aiMode = 'fake';
  if (env.AI === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('AI=anthropic needs ANTHROPIC_API_KEY');
    const model = env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
    deps.llm = () => new AnthropicProvider({ model, apiKey: env.ANTHROPIC_API_KEY });
    aiMode = `anthropic:${model}`;
  }
  return { deps, paymentsMode, aiMode, webhookVerifier };
}
