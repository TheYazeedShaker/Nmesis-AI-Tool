import * as React from 'react';
import { Ban, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { Button } from './button';
import { jobWords, type Job } from '@/lib/ds/words';

// The job card for long-running AI work: generation, film, swap, upscale,
// storyboards. Progress that tells the truth (queued / running with the
// provider's stage / an estimate only when there is one), Cancel only where the
// provider allows it, credits held while it runs, and after a failure what was
// or was not charged. The card is drawn from the job record on the server, so it
// survives a reload.

const ICONS = { queued: Clock, running: Loader2, done: CheckCircle2, failed: XCircle, cancelled: Ban } as const;

export function JobCard({ job, onCancel, onRetry, onOpen, cancelBusy }: { job: Job; onCancel?: () => void; onRetry?: () => void; onOpen?: () => void; cancelBusy?: boolean }) {
  const words = jobWords(job);
  const Icon = ICONS[job.state];
  const percent = job.progress !== undefined ? Math.max(0, Math.min(1, job.progress)) : null;
  const live = job.state === 'queued' || job.state === 'running';
  return (
    <article className="ds-job" data-state={job.state} aria-label={`${job.title}: ${words.status}`}>
      <div className="ds-job-head">
        <Icon aria-hidden="true" className={job.state === 'running' ? 'ds-spin-icon' : undefined} />
        <h3 className="ds-job-title ds-truncate" title={job.title}>{job.title}</h3>
      </div>
      <p className="ds-job-stage" role="status">{words.status}</p>
      {live && (
        <div
          className="ds-progress"
          role="progressbar"
          aria-label={`${job.title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent !== null ? Math.round(percent * 100) : undefined}
          aria-valuetext={percent !== null ? undefined : job.state === 'queued' ? 'Waiting to start' : 'In progress'}
          data-indeterminate={percent === null || undefined}
        >
          <span className="ds-progress-bar" style={percent !== null ? { transform: `scaleX(${percent})` } : undefined} />
        </div>
      )}
      {(words.detail || words.money) && (
        <div className="ds-job-meta">
          {words.detail && <span className={job.state === 'failed' ? 'ds-job-message' : undefined}>{words.detail}</span>}
          {words.money && <span>{words.money}</span>}
        </div>
      )}
      {(live && job.cancellable && onCancel) || (job.state === 'failed' && onRetry) || (job.state === 'done' && onOpen) ? (
        <div className="ds-job-actions">
          {live && job.cancellable && onCancel && <Button size="sm" busy={cancelBusy} onClick={onCancel}>Cancel</Button>}
          {job.state === 'failed' && onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}
          {job.state === 'done' && onOpen && <Button size="sm" kind="primary" onClick={onOpen}>Open</Button>}
        </div>
      ) : null}
    </article>
  );
}
