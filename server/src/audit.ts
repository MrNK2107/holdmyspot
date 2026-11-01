export type AuditKind = 'ai' | 'engine' | 'paypal' | 'webhook' | 'owner' | 'message' | 'system';

export interface AuditEntry {
  seq: number;
  at: number;
  kind: AuditKind;
  bookingId?: string;
  summary: string;
  data?: unknown;
}

/** Entries kept per workspace unless configured (AUDIT_MAX_ENTRIES): the shared demo is never evicted. */
export const DEFAULT_AUDIT_MAX = 5000;

/**
 * Append-only log of every AI output, engine decision, PayPal call and webhook. Retention: the most recent
 * `max` entries are kept (oldest dropped first); seq numbers keep counting, so a gap shows what was dropped.
 */
export class AuditLog {
  private entries: AuditEntry[] = [];
  private listeners = new Set<(e: AuditEntry) => void>();
  private seq = 0;
  private readonly max: number;
  /** entries dropped by retention so far */
  dropped = 0;

  constructor(
    private now: () => number,
    opts: { max?: number } = {},
  ) {
    this.max = Math.max(1, Math.floor(opts.max ?? DEFAULT_AUDIT_MAX));
  }

  add(kind: AuditKind, summary: string, opts: { bookingId?: string; data?: unknown } = {}): AuditEntry {
    const e: AuditEntry = Object.freeze({ seq: ++this.seq, at: this.now(), kind, summary, ...opts });
    this.entries.push(e);
    if (this.entries.length > this.max) {
      const n = this.entries.length - this.max;
      this.entries.splice(0, n);
      this.dropped += n;
    }
    for (const l of this.listeners) l(e);
    return e;
  }

  all(): AuditEntry[] {
    return this.entries.slice();
  }

  forBooking(bookingId: string): AuditEntry[] {
    return this.entries.filter((e) => e.bookingId === bookingId);
  }

  subscribe(fn: (e: AuditEntry) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
