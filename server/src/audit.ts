export type AuditKind = 'ai' | 'engine' | 'paypal' | 'webhook' | 'owner' | 'message' | 'system';

export interface AuditEntry {
  seq: number;
  at: number;
  kind: AuditKind;
  bookingId?: string;
  summary: string;
  data?: unknown;
}

/** Append-only log of every AI output, engine decision, PayPal call and webhook. */
export class AuditLog {
  private entries: AuditEntry[] = [];
  private listeners = new Set<(e: AuditEntry) => void>();

  constructor(private now: () => number) {}

  add(kind: AuditKind, summary: string, opts: { bookingId?: string; data?: unknown } = {}): AuditEntry {
    const e: AuditEntry = Object.freeze({ seq: this.entries.length + 1, at: this.now(), kind, summary, ...opts });
    this.entries.push(e);
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
