// Pure words and numbers for the design-system components: the job card, the
// credit meter and counts. No React, no browser, so tests can hold every
// sentence to the rules in docs/design-system.md.

export const count = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—');
export const credits = (n: number) => `${count(n)} ${Math.round(n) === 1 ? 'credit' : 'credits'}`;
export const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${Math.round(n) === 1 ? one : many}`;

// ── Long-running AI work ────────────────────────────────────────────────
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type Job = {
  title: string;
  state: JobState;
  /** The provider's own step, in words ("Rendering frames"). */
  stage?: string;
  /** 0–1 when the provider reports it; absent when it does not. */
  progress?: number;
  /** Seconds left, when there is an honest estimate. */
  etaSeconds?: number;
  /** Place in the queue, when queued and known. */
  position?: number;
  /** The quote before starting, or the hold while it runs. */
  credits?: number;
  /** After the end: what was actually charged (0 when nothing was). */
  charged?: number;
  /** Plain sentence for a failure, from the server. */
  error?: string;
  /** Whether the provider lets this job be stopped. */
  cancellable?: boolean;
};

export function ordinal(n: number): string {
  const v = Math.round(n), t = v % 100;
  const s = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[v % 10] || 'th';
  return `${count(v)}${s}`;
}

export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'less than a minute';
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `about ${m} ${m === 1 ? 'minute' : 'minutes'}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `about ${h} h${r ? ` ${r} min` : ''}`;
}

/** What the card says: one status line, an optional estimate, and the money. */
export function jobWords(job: Job): { status: string; detail: string | null; money: string | null } {
  const percent = job.progress !== undefined ? Math.max(0, Math.min(100, Math.round(job.progress * 100))) : null;
  switch (job.state) {
    case 'queued':
      return {
        status: job.position ? `Queued · ${job.position === 1 ? 'next' : `${ordinal(job.position)} in line`}` : 'Queued',
        detail: job.etaSeconds ? `Starts in ${duration(job.etaSeconds)}` : 'Starts when the provider has room',
        money: job.credits !== undefined ? `${credits(job.credits)} held, charged only when it finishes` : null,
      };
    case 'running':
      return {
        status: [job.stage || 'Running', percent !== null ? `${percent}%` : null].filter(Boolean).join(' · '),
        detail: job.etaSeconds ? `${duration(job.etaSeconds)} left` : 'The provider has not said how long',
        money: job.credits !== undefined ? `${credits(job.credits)} held` : null,
      };
    case 'done':
      return { status: 'Done', detail: null, money: job.charged !== undefined ? `Used ${credits(job.charged)}` : null };
    case 'failed':
      return {
        status: 'Failed',
        detail: job.error || 'The provider stopped before it finished.',
        money: job.charged ? `${credits(job.charged)} were charged for the part that ran` : 'Nothing was charged',
      };
    case 'cancelled':
      return { status: 'Cancelled', detail: null, money: job.charged ? `${credits(job.charged)} were charged for the part that ran` : 'Nothing was charged' };
  }
}

// ── The credit meter ────────────────────────────────────────────────────
export type Meter = { used: number; total: number; unlimited?: boolean };
export function meterWords(m: Meter): { level: 'ok' | 'warn' | 'out'; percent: number; used: string; left: string; label: string } {
  if (m.unlimited) return { level: 'ok', percent: 0, used: count(m.used), left: 'no limit', label: `${credits(m.used)} used this period, no limit` };
  const total = Math.max(0, m.total), used = Math.max(0, m.used);
  const left = Math.max(0, total - used);
  const percent = total > 0 ? Math.min(100, Math.floor((used / total) * 100)) : 100;
  const level = percent >= 100 || left === 0 ? 'out' : percent >= 80 ? 'warn' : 'ok';
  return { level, percent, used: count(used), left: count(left), label: `${credits(used)} used, ${credits(left)} left this period (${percent}%)` };
}

/** "Available on Growth" — the smallest plan with the feature. */
export const upsellWords = (plan: string) => `Available on ${plan}`;
