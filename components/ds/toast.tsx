'use client';
import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

// One stack of toasts, bottom right (above the phone navigation on a phone),
// aria-live="polite". Six seconds; the clock stops while the pointer is on a
// toast or something in it has focus. Undo is the answer to a reversible
// action: do it at once, then offer Undo here (and a way to restore later).
// A screen with panels down its sides gives the stack a place of its own with
// <ToastSlot/> (the canvas editor: its canvas column, clear of both panels and
// of the controls under the canvas): the stack then sits in that box's bottom
// right corner. It is still the one region at the root, so what it says is
// announced from the same place on every screen; only where it is drawn moves.

export type ToastKind = 'info' | 'ok' | 'bad';
export type ToastInput = { message: string; kind?: ToastKind; action?: { label: string; run: () => void }; duration?: number;
  /** It closed without its action (time ran out, Dismiss, or pushed out by newer toasts): a delayed action goes ahead. */
  onExpire?: () => void };
type Toast = ToastInput & { id: number };

type Api = { toast: (t: ToastInput) => number; undo: (message: string, run: () => void) => number; dismiss: (id: number) => void };
const ToastContext = React.createContext<Api | null>(null);
/** The box a screen gave the stack (ToastSlot): the latest one wins; leaving clears only its own. */
const SlotContext = React.createContext<((el: HTMLElement, on: boolean) => void) | null>(null);
export const TOAST_MS = 6000;
// The slot's measurements run before the paint in the browser; on the server there is nothing to measure.
const useLayoutEffectOnClient = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/** theme: the toasts' own light or dark, for screens not on the tokens yet. */
export function ToastProvider({ children, theme }: { children: React.ReactNode; theme?: 'light' | 'dark' }) {
  const [list, setList] = React.useState<Toast[]>([]);
  const [slot, setSlot] = React.useState<HTMLElement | null>(null);
  const region = React.useRef<HTMLDivElement>(null);
  const next = React.useRef(1);
  const dismiss = React.useCallback((id: number) => setList((l) => l.filter((t) => t.id !== id)), []);
  const toast = React.useCallback((t: ToastInput) => {
    const id = next.current++;
    // Newest last; at most four, so the stack never covers the page.
    setList((l) => { for (const old of l.slice(0, -3)) old.onExpire?.(); return [...l.slice(-3), { ...t, id }]; });
    return id;
  }, []);
  const undo = React.useCallback((message: string, run: () => void) => toast({ message, kind: 'ok', action: { label: 'Undo', run } }), [toast]);
  const api = React.useMemo(() => ({ toast, undo, dismiss }), [toast, undo, dismiss]);
  const place = React.useCallback((el: HTMLElement, on: boolean) => setSlot((s) => (on ? el : s === el ? null : s)), []);
  const fit = React.useRef(() => {});
  // The stack follows its slot's box: on the slot's own resize (a panel opening beside it, a notice above it,
  // the page strip under it wrapping), the stack's and the window's. Until then, or while the slot has no
  // box, the corner. It never grows past the slot's top: the newest toasts that fit are shown, and older ones
  // fold away until there is room again or their time ends (each keeps its own clock). Measured before the paint.
  useLayoutEffectOnClient(() => {
    const el = region.current;
    if (!el || !slot) return;
    const items = () => [...el.children] as HTMLElement[];
    fit.current = () => {
      for (const t of items()) delete t.dataset.folded;
      const r = slot.getBoundingClientRect(), root = document.documentElement;
      if (r.width < 1 || r.height < 1) { delete el.dataset.placed; return; }
      el.style.setProperty('--ds-toasts-right', `${Math.max(0, root.clientWidth - r.right)}px`);
      el.style.setProperty('--ds-toasts-bottom', `${Math.max(0, root.clientHeight - r.bottom)}px`);
      el.style.setProperty('--ds-toasts-room', `${r.width}px`);
      el.dataset.placed = '';
      // Newest last. Layout heights (offsetHeight), so a toast still rising in (its scale) measures in full.
      // A toast holding the keyboard focus (someone on its Undo) is never folded away from under it.
      const stack = items(), gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      for (let i = stack.length - 1, used = 0; i >= 0; i--) {
        used += stack[i].offsetHeight + (i < stack.length - 1 ? gap : 0);
        if (i < stack.length - 1 && used > r.height) {
          for (const t of stack.slice(0, i + 1)) if (!t.contains(document.activeElement)) t.dataset.folded = '';
          break;
        }
      }
    };
    fit.current();
    const refit = () => fit.current();
    // The slot, and the stack itself (a toast's words reflowing when its font arrives). In the next frame, not in
    // the observer's own callback: folding changes the stack's size, which there would be a resize loop.
    let frame = 0;
    const watch = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refit); });
    watch.observe(slot);
    watch.observe(el);
    window.addEventListener('resize', refit);
    return () => {
      watch.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', refit);
      fit.current = () => {};
      for (const t of items()) delete t.dataset.folded;
      delete el.dataset.placed;
      for (const k of ['--ds-toasts-right', '--ds-toasts-bottom', '--ds-toasts-room']) el.style.removeProperty(k);
    };
  }, [slot]);
  // A toast came or went: the stack is measured again (in the slot; in the corner this does nothing).
  useLayoutEffectOnClient(() => { fit.current(); }, [list]);
  return (
    <ToastContext.Provider value={api}>
      <SlotContext.Provider value={place}>{children}</SlotContext.Provider>
      <div ref={region} className="ds-toasts" data-theme={theme} aria-live="polite" aria-relevant="additions" role="region" aria-label="Notifications">
        {list.map((t) => <ToastItem key={t.id} toast={t} onDone={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const api = React.useContext(ToastContext);
  if (!api) throw new Error('useToast() needs a <ToastProvider> above it.');
  return api;
}

/**
 * The toasts' place on this screen: an empty box laid out where they may lie (nothing of its own is drawn or
 * reached). The stack sits in its bottom right corner, as wide as it allows up to the usual 400 px, while the
 * slot is on the page.
 */
export function ToastSlot({ className }: { className?: string }) {
  const place = React.useContext(SlotContext);
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!place || !el) return;
    place(el, true);
    return () => place(el, false);
  }, [place]);
  return <div ref={box} className={className ? `ds-toast-slot ${className}` : 'ds-toast-slot'} aria-hidden="true" />;
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const [held, setHeld] = React.useState(false);
  const left = React.useRef(toast.duration ?? TOAST_MS);
  React.useEffect(() => {
    if (held) return;
    const started = Date.now();
    const timer = window.setTimeout(() => { toast.onExpire?.(); onDone(); }, left.current);
    return () => { window.clearTimeout(timer); left.current -= Date.now() - started; };
  }, [held, onDone, toast]);
  const Icon = toast.kind === 'bad' ? AlertCircle : toast.kind === 'ok' ? CheckCircle2 : Info;
  return (
    <div
      className={`ds-toast${toast.kind && toast.kind !== 'info' ? ` ${toast.kind}` : ''}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false); }}
    >
      <Icon aria-hidden="true" />
      <p className="ds-toast-text">{toast.message}</p>
      {toast.action && (
        <button type="button" className="ds-toast-action" onClick={() => { toast.action?.run(); onDone(); }}>{toast.action.label}</button>
      )}
      <button type="button" className="ds-toast-close" aria-label="Dismiss" onClick={() => { toast.onExpire?.(); onDone(); }}><X aria-hidden="true" /></button>
    </div>
  );
}
