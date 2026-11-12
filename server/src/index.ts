import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { Auth } from './auth.js';
import { configFromEnv } from './config.js';
import { pgStoreFromUrl } from './store.js';
import { Workspaces } from './workspaces.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 18080);
const cfg = configFromEnv(process.env);

// Postgres keeps studios and accounts across restarts; without DATABASE_URL everything lives in memory
const store = cfg.databaseUrl ? await pgStoreFromUrl(cfg.databaseUrl) : undefined;
const workspaces = new Workspaces({ ...cfg.deps, store });
const restored = await workspaces.restoreAll();
await workspaces.create('demo');
// accounts are required: studios made before that have no owner, so they are retired (live holds released first)
if (cfg.requireAccount) {
  const retired = await workspaces.retireAnonymous();
  if (retired) console.log(`retired ${retired} studio(s) with no owner account`);
}
const auth = new Auth({ ...cfg.authOptions, store });
if (!cfg.authOptions.sessionSecret && cfg.authOptions.google) console.warn('SESSION_SECRET is not set: everyone is signed out whenever the server restarts');

const app = await buildApp({
  workspaces,
  auth,
  storeKind: store?.kind,
  requireAccount: cfg.requireAccount,
  webDist: resolve(here, '../../web/dist'),
  logger: process.env.LOG === '1',
  webhookVerifier: cfg.webhookVerifier,
});
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
// a graceful stop (a redeploy) writes any change still waiting for its save
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    void workspaces.flush().finally(() => process.exit(0));
  });
}
console.log(
  `HoldMySpot on http://127.0.0.1:${port}  payments=${cfg.paymentsMode} ai=${cfg.aiMode} storage=${store?.kind ?? 'memory only'}${store ? ` (${restored} studios restored)` : ''} google=${auth.googleEnabled ? 'on' : 'off'}`,
);
if (cfg.paymentsMode === 'mock') console.log(`Guided demo (13 beats, ~3 min): http://127.0.0.1:${port}/?demo=1   (press → or N; add &autoplay=12 to run hands-free)`);
