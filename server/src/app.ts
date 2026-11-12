import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { PolicyRules } from './domain/policy.js';
import { approve } from './domain/policy.js';
import { demoStatus, playNextBeat } from './demo.js';
import { evalReport } from './eval/run.js';
import type { Engine } from './engine/engine.js';
import type { WebhookEvent } from './paypal/gateway.js';
import { Workspaces, cleanStudioNames, type Workspace } from './workspaces.js';

export interface AppOptions {
  workspaces?: Workspaces;
  webDist?: string;
  logger?: boolean;
  /** Verifies real PayPal webhook signatures. Without it the webhook endpoint refuses every event. */
  webhookVerifier?: (headers: Record<string, string | undefined>, event: unknown, rawBody?: string) => Promise<boolean>;
  /** Budget for routes that call the model (client texts, the owner's assistant, policy compile, booking). */
  rateLimit?: { perWorkspacePerMin: number; globalPerMin: number };
  /** Open event streams allowed per workspace (each is a live engine listener). Default 10. */
  maxStreamsPerWorkspace?: number;
}

/** Sliding one-minute windows: per workspace and for the whole server (visitors can create many workspaces). */
function modelBudget(limits: { perWorkspacePerMin: number; globalPerMin: number }) {
  const per = new Map<string, number[]>();
  let all: number[] = [];
  return (wsId: string): boolean => {
    const now = Date.now();
    const recent = (xs: number[]) => xs.filter((t) => now - t < 60_000);
    all = recent(all);
    const mine = recent(per.get(wsId) ?? []);
    if (mine.length >= limits.perWorkspacePerMin || all.length >= limits.globalPerMin) {
      per.set(wsId, mine);
      return false;
    }
    mine.push(now);
    all.push(now);
    per.set(wsId, mine);
    if (per.size > 1000) per.delete(per.keys().next().value!);
    return true;
  };
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

  /** `client`: a booking-link route; the answer carries no studio snapshot (other clients, messages, audit). */
  const act = async <T>(id: string, reply: FastifyReply, fn: (e: Engine, w: Workspace) => Promise<T>, opts: { client?: boolean } = {}) => {
    const w = await ws(id, reply);
    if (!w) return;
    const state = () => (opts.client ? undefined : w.engine.snapshot());
    try {
      const result = await workspaces.run(id, () => fn(w.engine, w));
      return { ok: true, result, state: state() };
    } catch (err) {
      // our own refusals are plain Errors/PaymentsErrors; a JS runtime error (bad body shape) says nothing useful and leaks code
      const internal = err instanceof TypeError || err instanceof RangeError || err instanceof SyntaxError || err instanceof ReferenceError;
      if (internal) app.log.warn({ err }, 'request failed');
      return reply.code(400).send({ ok: false, error: internal ? 'invalid request' : (err as Error).message, state: state() });
    }
  };

  const streams = new Map<string, number>();
  const maxStreams = opts.maxStreamsPerWorkspace ?? 10;

  // The workspace id is the public booking link. Only these routes are reachable with it alone; every other
  // workspace route needs the owner token (header x-owner-token; the event stream may pass ?owner= because
  // EventSource cannot set headers). The shared `demo` workspace is an open public console.
  const clientRoutes = [
    '/api/ws/:ws/public',
    '/api/ws/:ws/slots',
    '/api/ws/:ws/book',
    '/api/ws/:ws/sim/approve/:orderId',
    // a client's private link: their own visits and thread only
    '/api/ws/:ws/me/:token',
    '/api/ws/:ws/me/:token/messages',
  ];
  const sameToken = (given: unknown, want: string) => {
    if (typeof given !== 'string') return false;
    const a = Buffer.from(given);
    const b = Buffer.from(want);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  app.addHook('preHandler', async (req, reply) => {
    const route = req.routeOptions.url;
    if (!route?.startsWith('/api/ws/:ws') || clientRoutes.includes(route)) return;
    const w = workspaces.get((req.params as { ws?: string }).ws ?? '');
    if (!w || w.open) return; // unknown: the route answers 404
    const given = req.headers['x-owner-token'] ?? (route === '/api/ws/:ws/events' ? (req.query as { owner?: string }).owner : undefined);
    if (!sameToken(given, w.ownerToken)) return reply.code(403).send({ ok: false, error: 'owner access needed: open the console from the link it was created with' });
  });

  const allowModelCall = modelBudget(opts.rateLimit ?? { perWorkspacePerMin: 30, globalPerMin: 300 });
  // each of these runs the model (and, for /book, PayPal); without a budget one script could run up the bill
  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'POST') return;
    // match the route the router chose, not the raw URL text (which may be percent-encoded)
    const route = req.routeOptions.url;
    // a new workspace (or a reset) is seeded through the model and, in sandbox mode, PayPal; creating one may evict another visitor's
    if (route === '/api/workspaces') {
      if (!allowModelCall('(new workspace)')) return reply.code(429).send({ ok: false, error: 'too many new demos: try again in a minute' });
      return;
    }
    const wsId = (req.params as { ws?: string }).ws;
    const limited = ['/api/ws/:ws/messages', '/api/ws/:ws/me/:token/messages', '/api/ws/:ws/assistant', '/api/ws/:ws/policy/compile', '/api/ws/:ws/book', '/api/ws/:ws/reset'];
    if (route && limited.includes(route) && wsId && workspaces.get(wsId) && !allowModelCall(wsId)) {
      return reply.code(429).send({ ok: false, error: 'too many requests: try again in a minute' });
    }
  });

  app.get('/api/health', async () => ({ ok: true, workspaces: workspaces.ids().length }));
  // what this server runs on, for the welcome page (no studio data)
  app.get('/api/config', async () => {
    const s = workspaces.get('demo')?.engine.snapshot();
    return { payments: s?.paymentsMode ?? 'mock', ai: s?.aiProvider ?? 'fake', clock: s?.clockMode ?? 'demo' };
  });

  // The eval suite (message reader, prompt injection, waitlist) on the deterministic offline provider: run once
  // per server and cached, so the public console never spends model calls on it. `npm run eval` with AI=anthropic
  // runs the same cases against Claude.
  let evals: ReturnType<typeof evalReport> | undefined;
  app.get('/api/evals', async (_req, reply) => {
    evals ??= evalReport().catch((err) => {
      evals = undefined;
      throw err;
    });
    try {
      return await evals;
    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ ok: false, error: 'eval run failed' });
    }
  });

  app.post<{ Body?: { business?: unknown; owner?: unknown } }>('/api/workspaces', async (req, reply) => {
    let w: Workspace;
    try {
      w = await workspaces.create(undefined, undefined, cleanStudioNames(req.body));
    } catch (err) {
      return reply.code(503).send({ ok: false, error: (err as Error).message });
    }
    return { id: w.engine.id, ownerToken: w.ownerToken };
  });

  // what the public booking page needs, and nothing about other clients
  app.get<{ Params: { ws: string } }>('/api/ws/:ws/public', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    if (!w) return;
    const s = w.engine.snapshot();
    return {
      workspace: s.workspace,
      business: s.business,
      owner: s.owner,
      paymentsMode: s.paymentsMode,
      timeZone: s.timeZone,
      clockMode: s.clockMode,
      services: s.services,
      policy: { version: s.policy.version, hash: s.policy.hash, summary: s.policy.summary, rules: { holdCents: s.policy.rules.holdCents } },
    };
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
    // each stream is a live listener and timer: cap them so one script cannot hold thousands open
    const id = req.params.ws;
    if ((streams.get(id) ?? 0) >= maxStreams) return reply.code(429).send({ error: 'too many open event streams for this workspace' });
    streams.set(id, (streams.get(id) ?? 0) + 1);
    req.raw.on('close', () => {
      const n = (streams.get(id) ?? 1) - 1;
      if (n > 0) streams.set(id, n);
      else streams.delete(id);
    });
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
      const b = await e.createBooking({ clientId: c.id, serviceId: req.body.serviceId, start: req.body.start });
      // the token is the client's private link: returned once, to the browser that booked
      return { ...b, clientToken: c.token };
    }, { client: true }),
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
      if (e.clock.real) throw new Error('this studio runs on real time: time travel is off');
      const { to, byMs } = req.body ?? {};
      const target = typeof to === 'number' ? to : typeof byMs === 'number' ? e.now() + byMs : NaN;
      if (!Number.isFinite(target) || target < e.now() || target > e.now() + 400 * 86_400_000) throw new Error('time travel needs a target between now and 400 days ahead');
      return e.clock.advanceTo(target);
    }),
  );

  // a client's own page: their visits and a thread with the studio (the link is the secret; nothing here shows other clients)
  app.get<{ Params: { ws: string; token: string } }>('/api/ws/:ws/me/:token', async (req, reply) => {
    const w = await ws(req.params.ws, reply);
    if (!w) return;
    const c = w.engine.clientByToken(req.params.token);
    if (!c) return reply.code(404).send({ ok: false, error: 'this link is not valid: open the one from your booking' });
    return w.engine.clientPortal(c);
  });
  app.post<{ Params: { ws: string; token: string }; Body: { text?: unknown } }>('/api/ws/:ws/me/:token/messages', async (req, reply) =>
    act(
      req.params.ws,
      reply,
      async (e) => {
        const c = e.clientByToken(req.params.token);
        if (!c) throw new Error('this link is not valid: open the one from your booking');
        const text = typeof req.body?.text === 'string' ? req.body.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 500) : '';
        if (!text) throw new Error('write a message first');
        await e.receiveMessage(c.id, text);
        return e.clientPortal(c);
      },
      { client: true },
    ),
  );

  // the owner's studio setup: services and opening hours
  app.post<{ Params: { ws: string }; Body: { name?: unknown; durationMin?: unknown; priceCents?: unknown } }>('/api/ws/:ws/services', async (req, reply) =>
    act(req.params.ws, reply, async (e) => e.addServiceChecked(req.body ?? {})),
  );
  app.delete<{ Params: { ws: string; id: string } }>('/api/ws/:ws/services/:id', async (req, reply) =>
    act(req.params.ws, reply, async (e) => e.removeService(req.params.id)),
  );
  app.post<{ Params: { ws: string }; Body: unknown }>('/api/ws/:ws/hours', async (req, reply) => act(req.params.ws, reply, async (e) => e.setHours(req.body)));

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
    try {
      const w = await workspaces.reset(req.params.ws);
      return { ok: true, state: w.engine.snapshot() };
    } catch (err) {
      return reply.code(409).send({ ok: false, error: (err as Error).message });
    }
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
    }, { client: true }),
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
      try {
        return { result: await workspaces.routeWebhook(req.body) };
      } catch (err) {
        // 5xx makes PayPal redeliver; the reason stays in the server log, not the response
        req.log.error({ err }, 'webhook handler failed');
        return reply.code(500).send({ error: 'webhook handler failed' });
      }
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
