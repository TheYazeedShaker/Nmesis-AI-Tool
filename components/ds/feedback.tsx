import * as React from 'react';
import { AlertTriangle, Inbox, Lock, SearchX } from 'lucide-react';
import { dsClass } from './button';
import { upsellWords } from '@/lib/ds/words';

// Empty / no results / error, skeletons, badges and the upsell chip.

/** Three different things with three different answers:
 *  empty → the way to make the first one; no results → Clear filters;
 *  error → what broke, in words, and Try again. Never one message for all three. */
export function State({ kind, title, children, actions, icon }: { kind: 'empty' | 'no-results' | 'error'; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode }) {
  const mark = icon ?? (kind === 'error' ? <AlertTriangle /> : kind === 'no-results' ? <SearchX /> : <Inbox />);
  return (
    <div className={dsClass('ds-state', kind === 'error' && 'error')} role={kind === 'error' ? 'alert' : undefined}>
      {React.isValidElement(mark) ? React.cloneElement(mark as React.ReactElement<{ 'aria-hidden'?: boolean }>, { 'aria-hidden': true }) : mark}
      <p className="ds-state-title">{title}</p>
      {children && <div className="ds-state-body">{children}</div>}
      {actions && <div className="ds-row">{actions}</div>}
    </div>
  );
}

export type BadgeKind = 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'quiet';
/** Always a word; where there is a mark, a mark AND a word. */
export function Badge({ kind = 'quiet', icon, children }: { kind?: BadgeKind; icon?: React.ReactNode; children: React.ReactNode }) {
  return <span className={dsClass('ds-badge', kind !== 'quiet' && kind)}>{icon}{children}</span>;
}

/** A tool not on the plan: "Available on Growth → Ask Nmesis". With neither
 *  href nor onAsk it is words only, for inside a tile that is itself the link. */
export function Upsell({ plan, onAsk, href }: { plan: string; onAsk?: () => void; href?: string }) {
  return (
    <span className="ds-upsell">
      <Lock aria-hidden="true" />
      {upsellWords(plan)}
      <span aria-hidden="true">·</span>
      {href ? <a href={href}>Ask Nmesis</a> : onAsk ? <button type="button" onClick={onAsk}>Ask Nmesis</button> : <span className="ds-upsell-ask">Ask Nmesis</span>}
    </span>
  );
}

// Skeletons: the shape of what is coming, in the place it is coming to.
// aria-hidden, because the region around them says "Loading …" once.
export function SkeletonTile() {
  return <div className="ds-skel-tile" aria-hidden="true"><div className="ds-skel" /><div className="ds-skel ds-skel-line mid" /><div className="ds-skel ds-skel-line short" /></div>;
}
export function SkeletonRow() {
  return <div className="ds-skel-row" aria-hidden="true"><div className="ds-skel" /><div className="ds-stack"><div className="ds-skel ds-skel-line mid" /><div className="ds-skel ds-skel-line short" /></div><div className="ds-skel ds-skel-line" /></div>;
}
export function SkeletonPanel() {
  return <div className="ds-skel-panel" aria-hidden="true"><div className="ds-skel ds-skel-line short" /><div className="ds-skel block" /><div className="ds-skel ds-skel-line" /><div className="ds-skel ds-skel-line mid" /></div>;
}
/** The region that holds skeletons: announces loading once, politely. */
export function Loading({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className} role="status" aria-busy="true"><span className="ds-sr-only">{label}</span>{children}</div>;
}
