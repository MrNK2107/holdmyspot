import type { EngineState } from './engine/engine.js';

import type { StudioNames } from './workspaces.js';
export type { StudioNames };

export interface StoredWorkspace {
  id: string;
  ownerToken: string;
  studio: StudioNames;
  /** the Google account that owns it, if the owner signed in */
  accountId?: string;
  state: EngineState;
}

export interface Account {
  id: string;
  googleSub: string;
  email: string;
  name: string;
  picture?: string;
}

/** Where studios and accounts live between restarts. */
export interface Store {
  readonly kind: 'memory' | 'postgres';
  init(): Promise<void>;
  loadWorkspaces(): Promise<StoredWorkspace[]>;
  saveWorkspace(w: StoredWorkspace): Promise<void>;
  deleteWorkspace(id: string): Promise<void>;
  upsertAccount(a: Omit<Account, 'id'>): Promise<Account>;
  accountById(id: string): Promise<Account | undefined>;
}

/** Tests and local runs without a database. Data is kept as JSON so it behaves like a real round trip. */
export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private ws = new Map<string, string>();
  private accounts = new Map<string, Account>();
  private seq = 0;

  async init(): Promise<void> {}
  async loadWorkspaces(): Promise<StoredWorkspace[]> {
    return [...this.ws.values()].map((j) => JSON.parse(j));
  }
  async saveWorkspace(w: StoredWorkspace): Promise<void> {
    this.ws.set(w.id, JSON.stringify(w));
  }
  async deleteWorkspace(id: string): Promise<void> {
    this.ws.delete(id);
  }
  async upsertAccount(a: Omit<Account, 'id'>): Promise<Account> {
    const found = [...this.accounts.values()].find((x) => x.googleSub === a.googleSub);
    const acc: Account = { ...a, id: found?.id ?? `acc_${++this.seq}` };
    this.accounts.set(acc.id, acc);
    return acc;
  }
  async accountById(id: string): Promise<Account | undefined> {
    return this.accounts.get(id);
  }
}

/** The part of node-postgres this file uses (so tests can pass a fake). */
export interface PgLike {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export class PgStore implements Store {
  readonly kind = 'postgres' as const;
  constructor(private pool: PgLike) {}

  async init(): Promise<void> {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS workspaces (
      id text PRIMARY KEY,
      owner_token text NOT NULL,
      studio jsonb NOT NULL DEFAULT '{}',
      account_id text,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS accounts (
      id text PRIMARY KEY,
      google_sub text UNIQUE NOT NULL,
      email text NOT NULL,
      name text NOT NULL,
      picture text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async loadWorkspaces(): Promise<StoredWorkspace[]> {
    const r = await this.pool.query('SELECT id, owner_token, studio, account_id, state FROM workspaces ORDER BY updated_at');
    return r.rows.map((x) => ({ id: x.id, ownerToken: x.owner_token, studio: x.studio ?? {}, accountId: x.account_id ?? undefined, state: x.state }));
  }

  async saveWorkspace(w: StoredWorkspace): Promise<void> {
    await this.pool.query(
      `INSERT INTO workspaces (id, owner_token, studio, account_id, state, updated_at) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET owner_token = EXCLUDED.owner_token, studio = EXCLUDED.studio, account_id = EXCLUDED.account_id, state = EXCLUDED.state, updated_at = now()`,
      [w.id, w.ownerToken, JSON.stringify(w.studio), w.accountId ?? null, JSON.stringify(w.state)],
    );
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.pool.query('DELETE FROM workspaces WHERE id = $1', [id]);
  }

  async upsertAccount(a: Omit<Account, 'id'>): Promise<Account> {
    const id = `acc_${a.googleSub}`;
    const r = await this.pool.query(
      `INSERT INTO accounts (id, google_sub, email, name, picture) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture
       RETURNING id, google_sub, email, name, picture`,
      [id, a.googleSub, a.email, a.name, a.picture ?? null],
    );
    const x = r.rows[0];
    return { id: x.id, googleSub: x.google_sub, email: x.email, name: x.name, picture: x.picture ?? undefined };
  }

  async accountById(id: string): Promise<Account | undefined> {
    const r = await this.pool.query('SELECT id, google_sub, email, name, picture FROM accounts WHERE id = $1', [id]);
    const x = r.rows[0];
    return x ? { id: x.id, googleSub: x.google_sub, email: x.email, name: x.name, picture: x.picture ?? undefined } : undefined;
  }
}

/** A connection pool for DATABASE_URL (Render's internal URL needs no TLS; external ones do). */
export async function pgStoreFromUrl(url: string): Promise<PgStore> {
  const { default: pg } = await import('pg');
  const external = /\.render\.com|sslmode=require/.test(url);
  const pool = new pg.Pool({ connectionString: url, max: 5, ssl: external ? { rejectUnauthorized: false } : undefined });
  const store = new PgStore(pool);
  await store.init();
  return store;
}
