'use client';
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, dsClass, IconButton, type ButtonKind } from './button';

// The overflow menu ("…"), "Move to…" and "Create". ARIA menu button: Enter/Space/↓
// open and focus the first item, ↑/↓ move, Home/End jump, Escape closes and
// returns focus to the button. Delete goes last, below a separator.
// With `text` the button carries words ("Create ▾") and `trigger` is its icon.
// A disabled item stays in the keyboard order (aria-disabled), so its reason
// (`detail`) or its plan chip (`aside`) is read out; choosing it does nothing.

type MenuCtx = { close: () => void };
const Ctx = React.createContext<MenuCtx>({ close: () => {} });

export function Menu({ label, trigger, text, kind, children, size, up, className, listClassName }: { label: string; trigger: React.ReactNode; text?: React.ReactNode; kind?: ButtonKind; children: React.ReactNode; size?: 'sm' | 'md'; up?: boolean; className?: string; listClassName?: string }) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  const items = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
  const close = React.useCallback((refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); }, []);

  // The list hangs from the button's right edge; a button near the left edge
  // (a header that wrapped on a phone) opens it from the left instead.
  const [start, setStart] = React.useState(false);
  React.useLayoutEffect(() => {
    if (!open || !list.current || !button.current) return;
    setStart(button.current.getBoundingClientRect().right - list.current.offsetWidth < 0);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) close(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, close]);

  function onListKey(e: React.KeyboardEvent) {
    const all = items(), at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); all[(at + 1) % all.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); all[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); all[all.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close(false);
  }

  const opener = {
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? `${id}-menu` : undefined,
    onClick: () => setOpen((o) => !o),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } },
  };

  return (
    <div ref={root} className={dsClass('ds-menu', className)}>
      {text ? (
        <Button ref={button} kind={kind} size={size} icon={trigger} {...opener}>
          {text}<ChevronDown aria-hidden="true" className="ds-menu-chevron" />
        </Button>
      ) : (
        <IconButton ref={button} label={label} kind={kind} size={size} {...opener}>
          {trigger}
        </IconButton>
      )}
      {open && (
        <div ref={list} id={`${id}-menu`} role="menu" aria-label={label} className={dsClass('ds-menu-list', up && 'up', start && 'start', listClassName)} onKeyDown={onListKey}>
          <Ctx.Provider value={{ close: () => close() }}>{children}</Ctx.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onSelect, danger, disabled, detail, aside }: {
  icon?: React.ReactNode; children: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean;
  /** A short line under the words, such as why the item is off. */ detail?: React.ReactNode;
  /** At the end of the row, such as a plan chip. */ aside?: React.ReactNode;
}) {
  const { close } = React.useContext(Ctx);
  const mark = React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ 'aria-hidden'?: boolean }>, { 'aria-hidden': true }) : icon;
  return (
    <button type="button" role="menuitem" tabIndex={-1} aria-disabled={disabled || undefined} className={dsClass('ds-menu-item', danger && 'danger')} onClick={() => { if (disabled) return; close(); onSelect(); }}>
      {mark}
      {detail != null ? <span className="ds-menu-text"><span>{children}</span><span className="ds-menu-detail">{detail}</span></span> : children}
      {aside != null && <span className="ds-menu-aside">{aside}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <hr className="ds-menu-sep" role="separator" />;
}
