import { PayPalRestGateway } from './paypal/rest.js';
import type { WorkspaceDeps } from './workspaces.js';

/**
 * Picks adapters from env. Defaults are the deterministic simulator and fake LLM, so the app
 * runs with no keys. PAYMENTS=sandbox with PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET switches to real
 * PayPal sandbox traffic. (The Anthropic provider is plan task 16.)
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
  return { deps, paymentsMode, aiMode: 'fake' };
}
