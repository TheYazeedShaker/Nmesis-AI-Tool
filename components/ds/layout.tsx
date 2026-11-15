'use client';
import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { dsClass } from './button';

// Page header, section card and collapsible section.

/** The title, ONE line saying what the page is for, and the actions on the right. */
export function PageHeader({ title, lede, actions, eyebrow }: { title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <header className="ds-page-head">
      <div>
        {eyebrow && <p className="ds-label-caps">{eyebrow}</p>}
        <h1 className="ds-page-title">{title}</h1>
        {lede && <p className="ds-page-lede">{lede}</p>}
      </div>
      {actions && <div className="ds-page-actions">{actions}</div>}
    </header>
  );
}

/** The box everything sits in. `count` is "6 of 41", pushed to the right. */
export function Section({ title, count, actions, children, className, id }: { title?: React.ReactNode; count?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  const auto = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const headId = `${id || `s${auto}`}-title`;
  return (
    <section className={dsClass('ds-section', className)} id={id} aria-labelledby={title ? headId : undefined}>
      {(title || count || actions) && (
        <div className="ds-section-head">
          {title && <h2 className="ds-section-title" id={headId}>{title}</h2>}
          {count && <span className="ds-section-count">{count}</span>}
          {actions}
        </div>
      )}
      <div className="ds-section-body">{children}</div>
    </section>
  );
}

// Remembered fold state. Storage can be missing or throw (private windows,
// blocked site data); the fold then works and forgets.
const FOLD_KEY = 'ds-fold:';
export function readFold(name: string): boolean | null {
  try { const v = window.localStorage.getItem(FOLD_KEY + name); return v === null ? null : v === '1'; } catch { return null; }
}
const foldListeners = new Set<() => void>();
export function writeFold(name: string, open: boolean) {
  try { window.localStorage.setItem(FOLD_KEY + name, open ? '1' : '0'); } catch { /* storage unavailable: the fold still works, it just forgets */ }
  foldListeners.forEach((l) => l());
}
function subscribeFolds(listener: () => void) {
  foldListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { foldListeners.delete(listener); window.removeEventListener('storage', listener); };
}

/** Open or closed as last left, else `fallback`. The server and the first client
 *  render use `fallback`, so hydration agrees; the remembered state follows. */
export function useRememberedOpen(name: string, fallback: boolean): [boolean, (open: boolean) => void] {
  const saved = React.useSyncExternalStore(subscribeFolds, () => readFold(name), () => null);
  // A storage that throws cannot remember; the choice is kept for this visit.
  const [local, setLocal] = React.useState<boolean | null>(null);
  const open = local ?? saved ?? fallback;
  const set = React.useCallback((next: boolean) => { setLocal(next); writeFold(name, next); }, [name]);
  return [open, set];
}

/** A section that folds. Closed, it still says what is inside it (`summary`). */
export function Fold({ name, title, summary, defaultOpen = false, children, className }: { name: string; title: React.ReactNode; summary: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useRememberedOpen(`fold:${name}`, defaultOpen);
  return (
    <details className={dsClass('ds-fold', className)} open={open} onToggle={(e) => { const now = (e.currentTarget as HTMLDetailsElement).open; if (now !== open) setOpen(now); }}>
      <summary className="ds-fold-head">
        <ChevronRight aria-hidden="true" />
        <span className="ds-fold-title">{title}</span>
        <span className="ds-fold-summary" aria-hidden={open || undefined}>{summary}</span>
      </summary>
      <div className="ds-fold-body">{children}</div>
    </details>
  );
}
