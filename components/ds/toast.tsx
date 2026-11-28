'use client';
import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

// One stack of toasts, aria-live="polite". Six seconds; the clock stops while
// the pointer is on a toast or something in it has focus. Undo is the answer to
// a reversible action: do it at once, then offer Undo here (and a way to
// restore later).
//
// The rule, on every screen: a toast never covers a panel, a primary action
// (Generate, Save, Download) or the page strip. Each layout says once where its
// toasts may lie with <ToastSlot/>, its safe corner: the canvas editor's is the
// bottom right of its canvas column, between the notices and the page strip;
// the tools' (Key visual, Line-up, Film, Swap, Story: components/editor/
// editor-screen.tsx) is the top right of the stage, over the picture, above the
// actions under it and the versions strip. A screen without a slot keeps the
// window's bottom right corner (above the phone navigation on a phone), so only
// a screen with nothing of those there may go without one. In its slot the
// stack never leaves the part of the slot that is on screen: never wider,
// never taller (older toasts fold away until there is room; the newest's words
// scroll inside it), and it stops short of a primary action in its way
// (KEEP_CLEAR). Under a sheet laid over the whole screen (a phone's panel)
// there is no such place: the stack keeps the window's corner, as over a
// dialog. It is still the one region at the root, so what it says is
// announced from the same place on every screen; only where it is drawn moves.
// check:ui counts a toast over any of them (editorToastOverPanels, at zero).

export type ToastKind = 'info' | 'ok' | 'bad';
/** Where in its slot the stack sits: from that corner it grows towards the other end. */
export type ToastCorner = 'bottom-right' | 'top-right';
/** Primary actions a stack stops short of in its slot: a primary button (Generate, Use this view…) and a download link. */
export const KEEP_CLEAR = '.ds-btn.primary, a[download]';
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
const PLACE_VARS = ['--ds-toasts-right', '--ds-toasts-top', '--ds-toasts-bottom', '--ds-toasts-room', '--ds-toasts-room-h'];

/** The part of a box that is on screen: cut by every box around it that scrolls or clips (a stage that scrolls), and by the window. */
function onScreen(el: HTMLElement) {
  const r = el.getBoundingClientRect(), root = document.documentElement;
  let left = Math.max(r.left, 0), top = Math.max(r.top, 0), right = Math.min(r.right, root.clientWidth), bottom = Math.min(r.bottom, root.clientHeight);
  for (let p = el.parentElement; p && p !== document.body && p !== root; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
    const b = p.getBoundingClientRect(), x = b.left + p.clientLeft, y = b.top + p.clientTop;
    left = Math.max(left, x); top = Math.max(top, y); right = Math.min(right, x + p.clientWidth); bottom = Math.min(bottom, y + p.clientHeight);
  }
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

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
  // The stack follows the part of its slot that is on screen: on the slot's own resize (a panel opening beside
  // it, a notice above it, the page strip under it wrapping), the stack's, the window's, and any scroll (a stage
  // that scrolls under it). While the slot has nothing on screen, the window's corner. From its corner it has
  // the room up to the slot's other end, or up to the first primary action in its way (KEEP_CLEAR, in the
  // stack's own width): the newest toasts that fit are shown, and older ones fold away until there is room
  // again or their time ends (each keeps its own clock); the newest's words scroll inside the room rather
  // than spill past it. Measured before the paint, and only while there are toasts.
  useLayoutEffectOnClient(() => {
    const el = region.current;
    if (!el || !slot) return;
    const items = () => [...el.children] as HTMLElement[];
    fit.current = () => {
      const stack = items();
      if (!stack.length) return;
      for (const t of stack) delete t.dataset.folded;
      const r = onScreen(slot), root = document.documentElement, top = slot.dataset.corner === 'top-right';
      // Nothing of the slot on screen, or something laid over all of it, corner to corner (a phone's panel, a sheet
      // over the whole screen): the window's corner, as on a screen without a slot. A menu over one corner is not.
      const covered = (x: number, y: number) => { const n = document.elementsFromPoint(x, y).find((m) => !el.contains(m)); return !n || !(slot.parentElement?.contains(n) || n.contains(slot)); };
      if (r.width < 1 || r.height < 1 || (covered(r.right - 1, top ? r.top + 1 : r.bottom - 1) && covered(r.left + 1, top ? r.bottom - 1 : r.top + 1))) { delete el.dataset.placed; return; }
      el.style.setProperty('--ds-toasts-right', `${Math.max(0, root.clientWidth - r.right)}px`);
      el.style.setProperty('--ds-toasts-room', `${r.width}px`);
      el.dataset.placed = top ? 'top' : 'bottom';
      // The primary actions in the stack's width, as distances from the corner (near edge, far edge). The room runs
      // from the corner to the slot's other end, stopping short of the first one in the way; one at the corner itself
      // (a link half scrolled out of the stage), the stack starts past.
      const width = el.getBoundingClientRect().width, gap = parseFloat(getComputedStyle(el).rowGap) || 0;
      const actions = [...(slot.parentElement?.querySelectorAll<HTMLElement>(KEEP_CLEAR) || [])].map((a) => a.getBoundingClientRect())
        .filter((b) => b.width && b.height && b.right > r.right - width && b.left < r.right && b.bottom > r.top && b.top < r.bottom)
        .map((b) => (top ? [b.top - r.top, b.bottom - r.top] : [r.bottom - b.bottom, r.bottom - b.top]))
        .sort((a, b) => a[0] - b[0]);
      let from = 0, to = r.height;
      for (const [near, far] of actions) {
        if (near - gap <= from) { from = Math.max(from, far + gap); continue; }
        to = near - gap;
        break;
      }
      const room = Math.max(0, to - from);
      el.style.setProperty('--ds-toasts-top', `${r.top + (top ? from : 0)}px`);
      el.style.setProperty('--ds-toasts-bottom', `${Math.max(0, root.clientHeight - r.bottom) + (top ? 0 : from)}px`);
      el.style.setProperty('--ds-toasts-room-h', `${room}px`);
      // Newest last. Layout heights (offsetHeight), so a toast still rising in (its scale) measures in full.
      // A toast holding the keyboard focus (someone on its Undo) is never folded away from under it.
      for (let i = stack.length - 1, used = 0; i >= 0; i--) {
        used += stack[i].offsetHeight + (i < stack.length - 1 ? gap : 0);
        if (i < stack.length - 1 && used > room) {
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
    const later = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refit); };
    const scrolled = (e: Event) => { if (!(e.target instanceof Node && el.contains(e.target))) later(); };
    const watch = new ResizeObserver(later);
    watch.observe(slot);
    watch.observe(el);
    window.addEventListener('resize', refit);
    document.addEventListener('scroll', scrolled, { capture: true, passive: true });
    return () => {
      watch.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', refit);
      document.removeEventListener('scroll', scrolled, { capture: true });
      fit.current = () => {};
      for (const t of items()) delete t.dataset.folded;
      delete el.dataset.placed;
      for (const k of PLACE_VARS) el.style.removeProperty(k);
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
 * The toasts' place on this screen, its safe corner: an empty box filling its positioned parent (nothing of its
 * own is drawn or reached), declared once per layout. The stack sits in its `corner`, as wide as it allows up to
 * the usual 400 px, while the slot is on the page; it stops short of a primary action in that parent.
 */
export function ToastSlot({ className, corner = 'bottom-right' }: { className?: string; corner?: ToastCorner }) {
  const place = React.useContext(SlotContext);
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!place || !el) return;
    place(el, true);
    return () => place(el, false);
  }, [place]);
  return <div ref={box} className={className ? `ds-toast-slot ${className}` : 'ds-toast-slot'} data-corner={corner} aria-hidden="true" />;
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
