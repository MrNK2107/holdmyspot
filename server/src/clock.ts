export interface Job {
  id: string;
  seq: number;
  at: number;
  name: string;
  run: () => Promise<void> | void;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Controllable clock. Demo time and real time use the same code path: jobs are scheduled
 * at absolute times and fired by advanceTo(). The time-travel control calls advanceTo().
 */
export class DemoClock {
  /** true for the wall clock: no time travel */
  readonly real: boolean = false;
  protected current: number;
  private jobs: Job[] = [];
  private seq = 0;

  constructor(start: number) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  schedule(at: number, name: string, run: Job['run']): string {
    const seq = ++this.seq;
    const id = `job_${seq}`;
    this.jobs.push({ id, seq, at, name, run });
    return id;
  }

  cancel(id: string): void {
    this.jobs = this.jobs.filter((j) => j.id !== id);
  }

  pending(): Array<{ id: string; at: number; name: string }> {
    return [...this.jobs].sort(byTime).map(({ id, at, name }) => ({ id, at, name }));
  }

  async advanceBy(ms: number): Promise<string[]> {
    return this.advanceTo(this.current + ms);
  }

  /** Moves time forward, firing due jobs in time order (including jobs scheduled by jobs). */
  async advanceTo(target: number): Promise<string[]> {
    if (target < this.current) throw new Error('DemoClock cannot go backwards');
    const fired: string[] = [];
    for (;;) {
      const due = this.jobs.filter((j) => j.at <= target).sort(byTime)[0];
      if (!due) break;
      this.jobs = this.jobs.filter((j) => j !== due);
      this.current = Math.max(this.current, due.at);
      await due.run();
      fired.push(due.name);
    }
    this.current = target;
    return fired;
  }
}

function byTime(a: Job, b: Job): number {
  return a.at - b.at || a.seq - b.seq;
}

/**
 * The wall clock. Same jobs, same code path as DemoClock, but time is Date.now() and a ticker fires due jobs.
 * Every tick runs through the workspace lock (`runner`), so a job that talks to PayPal never interleaves with an HTTP action.
 */
export class RealClock extends DemoClock {
  override readonly real: boolean = true;
  private timer: ReturnType<typeof setInterval>;
  private busy = false;

  constructor(private runner: <T>(fn: () => Promise<T>) => Promise<T>, tickMs = 1000) {
    super(Date.now());
    this.timer = setInterval(() => void this.tick(), tickMs);
    this.timer.unref?.();
  }

  override now(): number {
    return Date.now();
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runner(() => this.advanceTo(Math.max(Date.now(), this.current)));
    } catch (err) {
      console.error('scheduled job failed:', (err as Error).message);
    } finally {
      this.busy = false;
    }
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
