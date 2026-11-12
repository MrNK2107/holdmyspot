import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { MemoryStore, type Store } from './store.js';
import type { Workspaces } from './workspaces.js';

/**
 * Sign in with Google (OAuth 2.0 authorization code flow + OpenID Connect) and signed-cookie sessions.
 * The browser goes to Google, comes back to /auth/google/callback with a one-time code, and this server exchanges the
 * code for an ID token over TLS with its client secret. That direct exchange is what lets it read the token's claims
 * without checking Google's signature (OpenID Connect Core 3.1.3.7); it still checks issuer, audience, expiry and
 * email_verified, and the state value that ties the callback to the browser that started it.
 */

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface AuthOptions {
  google?: { clientId: string; clientSecret: string };
  /** signs session cookies; without one, a random secret per boot (everyone is signed out on restart) */
  sessionSecret?: string;
  /** public base URL of this server (PUBLIC_URL / RENDER_EXTERNAL_URL); empty = derived from the request */
  baseUrl?: string;
  store?: Store;
  fetch?: FetchFn;
  /** test hook */
  now?: () => number;
}

const SESSION_DAYS = 30;
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export class Auth {
  readonly store: Store;
  private secret: string;
  private fetchFn: FetchFn;
  private now: () => number;

  constructor(private o: AuthOptions) {
    this.store = o.store ?? new MemoryStore();
    this.secret = o.sessionSecret || randomBytes(32).toString('hex');
    this.fetchFn = o.fetch ?? ((url, init) => fetch(url, init) as ReturnType<FetchFn>);
    this.now = o.now ?? Date.now;
  }

  get googleEnabled(): boolean {
    return !!this.o.google;
  }

  // ---------- signed cookies ----------
  private sign(payload: object): string {
    const body = b64(JSON.stringify(payload));
    return `${body}.${createHmac('sha256', this.secret).update(body).digest('base64url')}`;
  }
  private verify<T>(token: string | undefined): T | undefined {
    if (!token) return undefined;
    const [body, sig] = token.split('.');
    if (!body || !sig) return undefined;
    const want = createHmac('sha256', this.secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(want);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
    try {
      const v = JSON.parse(unb64(body)) as T & { exp?: number };
      return v.exp && v.exp < this.now() ? undefined : v;
    } catch {
      return undefined;
    }
  }
  private cookie(req: FastifyRequest, name: string): string | undefined {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return undefined;
  }
  private setCookie(req: FastifyRequest, reply: FastifyReply, name: string, value: string, maxAgeS: number) {
    const secure = this.baseUrl(req).startsWith('https://') ? '; Secure' : '';
    const prev = reply.getHeader('set-cookie');
    const line = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure}`;
    reply.header('set-cookie', Array.isArray(prev) ? [...prev, line] : prev ? [String(prev), line] : [line]);
  }

  private baseUrl(req: FastifyRequest): string {
    if (this.o.baseUrl) return this.o.baseUrl.replace(/\/$/, '');
    const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0];
    return `${proto}://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
  }

  /** The signed-in account's id, from the session cookie. */
  sessionAccountId(req: FastifyRequest): string | undefined {
    return this.verify<{ a: string }>(this.cookie(req, 'hms_session'))?.a;
  }

  // ---------- routes ----------
  register(app: FastifyInstance, workspaces: Workspaces): void {
    app.get('/api/me', async (req) => {
      const id = this.sessionAccountId(req);
      const account = id ? await this.store.accountById(id) : undefined;
      return {
        google: this.googleEnabled,
        account: account ? { name: account.name, email: account.email, picture: account.picture } : null,
        studios: account ? workspaces.studiosOf(account.id) : [],
      };
    });

    app.post('/api/logout', async (req, reply) => {
      this.setCookie(req, reply, 'hms_session', '', 0);
      return { ok: true };
    });

    app.get('/auth/google', async (req, reply) => {
      const g = this.o.google;
      if (!g) return reply.code(404).send({ ok: false, error: 'Google sign-in is not configured on this server' });
      const state = randomBytes(16).toString('base64url');
      this.setCookie(req, reply, 'hms_oauth', this.sign({ state, exp: this.now() + 10 * 60_000 }), 600);
      const q = new URLSearchParams({
        client_id: g.clientId,
        redirect_uri: `${this.baseUrl(req)}/auth/google/callback`,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      });
      return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
    });

    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/auth/google/callback', async (req, reply) => {
      const g = this.o.google;
      const fail = (msg: string) => reply.code(400).type('text/html').send(`<p>Sign-in did not work: ${msg.replace(/[<>&]/g, '')}. <a href="/">Back to the start</a></p>`);
      if (!g) return fail('Google sign-in is not configured');
      if (req.query.error) return fail('Google said: ' + req.query.error);
      const saved = this.verify<{ state: string }>(this.cookie(req, 'hms_oauth'));
      if (!saved || !req.query.state || saved.state !== req.query.state) return fail('this sign-in link expired or was not started here');
      if (!req.query.code) return fail('no code from Google');
      this.setCookie(req, reply, 'hms_oauth', '', 0);

      let claims: Record<string, any>;
      try {
        const r = await this.fetchFn('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: req.query.code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: `${this.baseUrl(req)}/auth/google/callback`, grant_type: 'authorization_code' }).toString(),
        });
        const j = await r.json();
        if (!r.ok || !j.id_token) return fail('Google refused the code');
        claims = JSON.parse(unb64(String(j.id_token).split('.')[1] ?? ''));
      } catch {
        return fail('could not reach Google');
      }
      const issuerOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
      if (!issuerOk || claims.aud !== g.clientId) return fail('the token was not meant for this app');
      if (typeof claims.exp !== 'number' || claims.exp * 1000 < this.now()) return fail('the token expired');
      if (!claims.sub || !claims.email || claims.email_verified !== true) return fail('Google did not verify your email');

      const account = await this.store.upsertAccount({ googleSub: String(claims.sub), email: String(claims.email), name: String(claims.name ?? claims.email), picture: claims.picture ? String(claims.picture) : undefined });
      this.setCookie(req, reply, 'hms_session', this.sign({ a: account.id, exp: this.now() + SESSION_DAYS * 86_400_000 }), SESSION_DAYS * 86_400);
      return reply.redirect('/');
    });
  }
}
