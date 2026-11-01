import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { PolicyRules } from './domain/policy.js';
import { approve } from './domain/policy.js';
import { demoStatus, playNextBeat } from './demo.js';
import type { Engine } from './engine/engine.js';
import type { WebhookEvent } from './paypal/gateway.js';
import { Workspaces, type Workspace } from './workspaces.js';

export interface AppOptions {
  workspaces?: Workspaces;
  webDist?: string;
  logger?: boolean;
  /** Verifies real PayPal webhook signatures. Without it the webhook endpoint refuses every event. */
  webhookVerifier?: (headers: Record<string, string | undefined>, event: unknown, rawBody?: string) => Promise<boolean>;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const workspaces = opts.workspaces ?? new Workspaces();

  async function ws(id: string, reply: FastifyReply): Promise<Workspace | undefined> {
    const w = workspaces.get(id);
    if (!w) {
      await reply.code(404).send({ error: `unknown workspace ${id}` });
      return undefined;
    }
    return w;
  }

  const act = async <T>(id: string, reply: FastifyReply, fn: (e: Engine, w: Workspace) => Promise<T>) => {
    const w = await ws(id, reply);
    if (!w) return;
    try {
      const result = await workspaces.run(id, () => fn(w.engine, w));
      return { ok: true, result, state: w.engine.snapshot() };
    } catch (err) {
      return reply.code(400).send({ ok: false, error: (err as Error).message, state: w.engine.snapshot() });
    }
  };

  app.get('/api/health', async () => ({ ok: true, workspaces: workspaces.ids().length }));

  app.post('/api/workspaces', async () => {
    const w = await workspaces.create();
    return { id: w.engine.id };
  });

  app.get<{ Params: { ws: string } }>('/api/ws/:ws/state', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    return w?.engine.snapshot();
  });

  app.get<{ Params: { ws: string }; Querystring: { booking?: string } }>('/api/ws/:ws/audit', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    if (!w) return;
    return req.query.booking ? w.engine.audit.forBooking(req.query.booking) : w.engine.audit.all();
  });

  app.get<{ Params: { ws: string } }>('/api/ws/:ws/events', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    if (!w) return;
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    reply.raw.write(`event: hello\ndata: {}\n\n`);
    let pending = false;
    const off = w.engine.on((e) => {
      // coalesce bursts into one change event per tick
      if (pending) return;
      pending = true;
      setImmediate(() => {
        pending = false;
        reply.raw.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
      });
    });
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      off();
      clearInterval(ping);
    });
    return reply;
  });

  app.post<{ Params: { ws: string }; Body: { clientId: string; text: string } }>('/api/ws/:ws/messages', async (req, reply) =>
    act(req.params.ws, reply, (e) => e.receiveMessage(req.body.clientId, req.body.text)),
  );

  app.post<{ Params: { ws: string; id: string }; Body: { choice: string } }>('/api/ws/:ws/approvals/:id', async (req, reply) =>
    act(req.params.ws, reply, (e) => e.resolveApproval(req.params.id, req.body.choice)),
  );

  app.post<{ Params: { ws: string }; Body: { clientId: string; serviceId: string; start: number } }>('/api/ws/:ws/bookings', async (req, reply) =>
    act(req.params.ws, reply, (e) => e.createBooking(req.body)),
  );

  app.get<{ Params: { ws: string }; Querystring: { service: string; n?: string } }>('/api/ws/:ws/slots', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    if (!w) return;
    try {
      return w.engine.freeSlots(req.query.service, Math.min(12, Number(req.query.n ?? 6)));
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Public booking page: new client books a slot and is sent to PayPal to approve the hold.
  app.post<{ Params: { ws: string }; Body: { name: string; serviceId: string; start: number } }>('/api/ws/:ws/book', async (req, reply) =>
    act(req.params.ws, reply, async (e) => {
      if (!e.freeSlots(req.body.serviceId, 12).includes(req.body.start)) throw new Error('that time is no longer free');
      const c = e.newClient(req.body.name);
      return e.createBooking({ clientId: c.id, serviceId: req.body.serviceId, start: req.body.start });
    }),
  );

  // simulator mode: the exact REST requests the real PayPal adapter builds for each simulated call
  app.get<{ Params: { ws: string } }>('/api/ws/:ws/paypal-requests', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    if (!w) return;
    return w.preview ? w.preview.requests.slice().reverse() : [];
  });

  // the owner asks the front desk agent in plain words; any refund it prepares waits for her tap
  app.post<{ Params: { ws: string }; Body: { text: string } }>('/api/ws/:ws/assistant', async (req, reply) =>
    act(req.params.ws, reply, async (e) => {
      const r = await e.askAssistant(String(req.body?.text ?? ''));
      return { answer: r.answer, runId: r.run.id };
    }),
  );

  app.post<{ Params: { ws: string; id: string } }>('/api/ws/:ws/bookings/:id/refund', async (req, reply) =>
    act(req.params.ws, reply, (e) => e.refund(req.params.id)),
  );

  app.post<{ Params: { ws: string }; Body: { to?: number; byMs?: number } }>('/api/ws/:ws/time', async (req, reply) =>
    act(req.params.ws, reply, async (e) => {
      // a non-number or absurd target would leave the clock NaN/unrepresentable and brick the workspace
      const { to, byMs } = req.body ?? {};
      const target = typeof to === 'number' ? to : typeof byMs === 'number' ? e.now() + byMs : NaN;
      if (!Number.isFinite(target) || target < e.now() || target > e.now() + 400 * 86_400_000) throw new Error('time travel needs a target between now and 400 days ahead');
      return e.clock.advanceTo(target);
    }),
  );

  app.post<{ Params: { ws: string }; Body: { mode: 'ask' | 'autopilot' } }>('/api/ws/:ws/mode', async (req, reply) =>
    act(req.params.ws, reply, async (e) => {
      if (req.body.mode !== 'ask' && req.body.mode !== 'autopilot') throw new Error('mode must be ask or autopilot');
      e.mode = req.body.mode;
      e.audit.add('owner', `mode → ${e.mode}`);
      return e.mode;
    }),
  );

  app.post<{ Params: { ws: string }; Body: { prose: string } }>('/api/ws/:ws/policy/compile', async (req, reply) =>
    act(req.params.ws, reply, (e) => e.frontdesk.compilePolicy(String(req.body.prose ?? '').slice(0, 5000))),
  );

  app.post<{ Params: { ws: string }; Body: { rules: PolicyRules; prose: string } }>('/api/ws/:ws/policy/approve', async (req, reply) =>
    act(req.params.ws, reply, async (e) => {
      const p = approve(e.policy, req.body.rules, req.body.prose, e.now());
      e.setPolicy(p);
      return p;
    }),
  );

  app.post<{ Params: { ws: string } }>('/api/ws/:ws/reset', async (req, reply) => {
    // only an existing workspace: otherwise any caller could mint workspaces with ids of its choosing
    if (!(await ws(req.params.ws, reply))) return;
    const w = await workspaces.reset(req.params.ws);
    return { ok: true, state: w.engine.snapshot() };
  });

  // Guided demo (video script): beats drive the same engine calls as the endpoints above.
  app.get<{ Params: { ws: string } }>('/api/ws/:ws/demo', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    return w && demoStatus(w);
  });
  app.post<{ Params: { ws: string } }>('/api/ws/:ws/demo/next', async (req, reply) =>
    act(req.params.ws, reply, async (_e, w) => {
      if (!w.mock) throw new Error('the guided demo runs on the PayPal simulator only');
      return playNextBeat(w);
    }),
  );

  // Sandbox simulator for buyer approval (mock mode only). The real flow uses the PayPal JS SDK popup.
  app.post<{ Params: { ws: string; orderId: string } }>('/api/ws/:ws/sim/approve/:orderId', async (req, reply) =>
    act(req.params.ws, reply, async (e, w) => {
      if (!w.mock) throw new Error('simulator approval is only available in mock mode');
      w.mock.approve(req.params.orderId);
      return e.completeApproval(req.params.orderId);
    }),
  );

  app.get<{ Params: { ws: string; orderId: string } }>('/sim/:ws/paypal/approve/:orderId', async (req, reply) => {
    const { ws: wsId, orderId } = req.params;
    reply.type('text/html').send(`<!doctype html><meta name=viewport content="width=device-width"><title>PayPal sandbox simulator</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:16px">
<p style="background:#fff3cd;padding:8px;border-radius:6px">Sandbox simulator: no real money. With keys configured this is the PayPal popup.</p>
<h2>Approve a hold</h2><p>Order <code>${orderId.replace(/[^\w-]/g, '')}</code></p>
<button id=b style="background:#ffc439;border:0;border-radius:20px;padding:12px 24px;font-weight:700">Approve with PayPal</button><p id=r></p>
<script>b.onclick=async()=>{const r=await fetch('/api/ws/${wsId.replace(/[^\w-]/g, '')}/sim/approve/${orderId.replace(/[^\w-]/g, '')}',{method:'POST'});document.getElementById('r').textContent=r.ok?'Approved. You can close this tab.':'Failed: '+(await r.json()).error}</script>`);
  });

  // PayPal redirects the buyer here after approval (orders: ?token=; vault setup: ?approval_token_id=).
  app.get<{ Querystring: { token?: string; approval_token_id?: string } }>('/paypal/return', async (req, reply) => {
    const id = req.query.approval_token_id ?? req.query.token ?? '';
    const w = workspaces.findByPendingApproval(id);
    if (!w) return reply.code(404).type('text/html').send('<p>This approval link has expired or was already used.</p>');
    try {
      await workspaces.run(w.engine.id, () => w.engine.completeApproval(id));
      return reply.redirect(`/book?ws=${encodeURIComponent(w.engine.id)}&approved=1`);
    } catch (err) {
      return reply.code(400).type('text/html').send(`<p>PayPal approval failed: ${String((err as Error).message).replace(/[<>&]/g, '')}</p>`);
    }
  });
  app.get('/paypal/cancel', async (_req, reply) => reply.type('text/html').send('<p>No problem: nothing was held. You can close this tab.</p>'));

  // Real PayPal webhooks, verified with POST /v1/notifications/verify-webhook-signature.
  // Unverified events could fake an authorization, so without a verifier nothing is accepted.
  // The raw body is kept (in this route's scope only) because PayPal verifies the exact bytes it signed.
  await app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      try {
        (req as unknown as { rawBody?: string }).rawBody = body as string;
        done(null, JSON.parse(body as string));
      } catch {
        done(Object.assign(new Error('invalid JSON'), { statusCode: 400 }), undefined);
      }
    });
    scope.post<{ Body: WebhookEvent }>('/api/paypal/webhook', async (req, reply) => {
      if (!opts.webhookVerifier) return reply.code(403).send({ error: 'webhook verification not configured' });
      const raw = (req as unknown as { rawBody?: string }).rawBody;
      const ok = await opts.webhookVerifier(req.headers as Record<string, string | undefined>, req.body, raw).catch(() => false);
      if (!ok) return reply.code(401).send({ error: 'invalid webhook signature' });
      return { result: await workspaces.routeWebhook(req.body) };
    });
  });

  const dist = opts.webDist;
  if (dist && existsSync(join(dist, 'index.html'))) {
    await app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
