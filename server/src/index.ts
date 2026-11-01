import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { configFromEnv } from './config.js';
import { Workspaces } from './workspaces.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 18080);
const cfg = configFromEnv(process.env);
const workspaces = new Workspaces(cfg.deps);
await workspaces.create('demo');
const app = await buildApp({ workspaces, webDist: resolve(here, '../../web/dist'), logger: process.env.LOG === '1', webhookVerifier: cfg.webhookVerifier });
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' });
console.log(`HoldMySpot on http://127.0.0.1:${port}  payments=${cfg.paymentsMode} ai=${cfg.aiMode}`);
