import { AnthropicProvider } from './ai/anthropic.js';
import { PayPalRestGateway } from './paypal/rest.js';
import type { WorkspaceDeps } from './workspaces.js';

/**
 * Picks adapters from env. Defaults are the deterministic simulator and fake LLM, so the app
 * runs with no keys. PAYMENTS=sandbox with PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET switches to real
 * PayPal sandbox traffic. AI=anthropic with ANTHROPIC_API_KEY switches the front desk to Claude.
 */
export function configFromEnv(env: Record<string, string | undefined>): { deps: WorkspaceDeps; paymentsMode: string; aiMode: string } {
  const baseUrl = env.PUBLIC_URL ?? '';
  const deps: WorkspaceDeps = { baseUrl };
  let paymentsMode = 'mock';
  if (env.PAYMENTS === 'sandbox') {
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error('PAYMENTS=sandbox needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET');
    deps.gateway = new PayPalRestGateway({
      clientId: env.PAYPAL_CLIENT_ID,
      clientSecret: env.PAYPAL_CLIENT_SECRET,
      returnUrl: `${baseUrl}/paypal/return`,
      cancelUrl: `${baseUrl}/paypal/cancel`,
    });
    paymentsMode = 'sandbox';
  }
  let aiMode = 'fake';
  if (env.AI === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('AI=anthropic needs ANTHROPIC_API_KEY');
    const model = env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
    deps.llm = () => new AnthropicProvider({ model, apiKey: env.ANTHROPIC_API_KEY });
    aiMode = `anthropic:${model}`;
  }
  return { deps, paymentsMode, aiMode };
}
