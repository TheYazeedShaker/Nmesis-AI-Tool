'use client';
import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

// One stack of toasts, bottom right (above the phone navigation on a phone),
// aria-live="polite". Six seconds; the clock stops while the pointer is on a
// toast or something in it has focus. Undo is the answer to a reversible
// action: do it at once, then offer Undo here (and a way to restore later).

export type ToastKind = 'info' | 'ok' | 'bad';
export type ToastInput = { message: string; kind?: ToastKind; action?: { label: string; run: () => void }; duration?: number;
  /** It closed without its action (time ran out, Dismiss, or pushed out by newer toasts): a delayed action goes ahead. */
  onExpire?: () => void };
type Toast = ToastInput & { id: number };

type Api = { toast: (t: ToastInput) => number; undo: (message: string, run: () => void) => number; dismiss: (id: number) => void };
const ToastContext = React.createContext<Api | null>(null);
export const TOAST_MS = 6000;

/** theme: the toasts' own light or dark, for screens not on the tokens yet. */
export function ToastProvider({ children, theme }: { children: React.ReactNode; theme?: 'light' | 'dark' }) {
  const [list, setList] = React.useState<Toast[]>([]);
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
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ds-toasts" data-theme={theme} aria-live="polite" aria-relevant="additions" role="region" aria-label="Notifications">
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
