'use client';
import * as React from 'react';
import { X } from 'lucide-react';
import { Button, IconButton, dsClass } from './button';

// Modal, drawer and bottom sheet, on the native <dialog>: showModal() makes the
// page behind inert (the keyboard stays inside) and Escape cancels. While one is
// open the page does not scroll; focus goes back to whatever opened it. Below
// 480px a modal and a drawer are the whole screen.
//
// A drawer is for working beside the list you came from; a modal is for
// something that has to be finished or abandoned; a sheet is an editor's
// settings on a phone.

let locks = 0;
function lockScroll() {
  locks += 1;
  if (locks === 1) document.documentElement.dataset.dsScrollLock = document.documentElement.style.overflow || ' ';
  document.documentElement.style.overflow = 'hidden';
}
function unlockScroll() {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    const was = document.documentElement.dataset.dsScrollLock;
    document.documentElement.style.overflow = was && was !== ' ' ? was : '';
    delete document.documentElement.dataset.dsScrollLock;
  }
}

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'modal' | 'drawer' | 'sheet';
  wide?: boolean;
  /** The element to focus when it opens; else the first control in the body. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** role="alertdialog" for the dialog that asks before something is lost. */
  alert?: boolean;
  describedBy?: string;
  className?: string;
};

export function Dialog({ open, onClose, title, children, footer, variant = 'modal', wide, initialFocus, alert, describedBy, className }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId().replace(/[^a-zA-Z0-9]/g, '') + '-t';

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement as HTMLElement | null;
      el.showModal();
      lockScroll();
      const target = initialFocus?.current || el.querySelector<HTMLElement>('.ds-dialog-body :is(input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"]))') || el.querySelector<HTMLElement>('.ds-dialog-foot button');
      target?.focus();
      return () => {
        if (el.open) el.close();
        unlockScroll();
        const back = opener.current;
        if (back && document.contains(back)) back.focus();
      };
    }
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      className={dsClass('ds-dialog', variant === 'drawer' && 'ds-drawer', variant === 'sheet' && 'ds-sheet', wide && 'wide', className)}
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current && !alert) onClose(); }}
    >
      {open && (
        <div className="ds-dialog-inner">
          {variant === 'sheet' && <div className="ds-sheet-grip" aria-hidden="true" />}
          <div className="ds-dialog-head">
            <h2 className="ds-dialog-title" id={titleId}>{title}</h2>
            <IconButton label="Close" size="sm" onClick={onClose}><X aria-hidden="true" /></IconButton>
          </div>
          <div className="ds-dialog-body">{children}</div>
          {footer && <div className="ds-dialog-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ── The dialog that asks (replaces confirm()) ───────────────────────────
// For what cannot be undone. Names the object and the consequence; the button
// carries the verb; Cancel has focus, so the safe option is the default;
// Escape cancels; Enter inside the type-to-confirm box does not confirm.
// Type-to-confirm only for the largest ("takes everything with it").

export type ConfirmOptions = {
  title: string;
  body: React.ReactNode;
  verb: string;
  danger?: boolean;
  /** The exact text to type, for the very largest only. */
  typeToConfirm?: string;
  cancel?: string;
};

type Pending = ConfirmOptions & { resolve: (yes: boolean) => void };
const ConfirmContext = React.createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** theme: the dialog's own light or dark, for screens not on the tokens yet. */
export function ConfirmProvider({ children, theme }: { children: React.ReactNode; theme?: 'light' | 'dark' }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const ask = React.useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const done = (yes: boolean) => { pending?.resolve(yes); setPending(null); };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (theme ? <div className="ds-contents" data-theme={theme}><ConfirmDialog {...pending} onAnswer={done} /></div> : <ConfirmDialog {...pending} onAnswer={done} />)}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ask = React.useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm() needs a <ConfirmProvider> above it.');
  return ask;
}

export function ConfirmDialog({ title, body, verb, danger, typeToConfirm, cancel = 'Cancel', onAnswer }: ConfirmOptions & { onAnswer: (yes: boolean) => void }) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = React.useState('');
  const bodyId = React.useId().replace(/[^a-zA-Z0-9]/g, '') + '-b';
  const ready = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <Dialog
      open
      alert
      onClose={() => onAnswer(false)}
      title={title}
      describedBy={bodyId}
      initialFocus={cancelRef}
      footer={<>
        <Button ref={cancelRef} onClick={() => onAnswer(false)}>{cancel}</Button>
        <Button kind={danger ? 'danger' : 'primary'} disabled={!ready} onClick={() => ready && onAnswer(true)}>{verb}</Button>
      </>}
    >
      <div id={bodyId} className="ds-stack">{body}</div>
      {typeToConfirm && (
        <div className="ds-field">
          <label className="ds-label" htmlFor={`${bodyId}-type`}>Type <strong>{typeToConfirm}</strong> to confirm</label>
          <input
            id={`${bodyId}-type`}
            className="ds-input"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          />
        </div>
      )}
    </Dialog>
  );
}
