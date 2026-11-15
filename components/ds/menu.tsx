'use client';
import * as React from 'react';
import { dsClass, IconButton } from './button';

// The overflow menu ("…") and "Move to…". ARIA menu button: Enter/Space/↓ open
// and focus the first item, ↑/↓ move, Home/End jump, Escape closes and returns
// focus to the button. Delete goes last, below a separator.

type MenuCtx = { close: () => void };
const Ctx = React.createContext<MenuCtx>({ close: () => {} });

export function Menu({ label, trigger, children, size, up, className }: { label: string; trigger: React.ReactNode; children: React.ReactNode; size?: 'sm' | 'md'; up?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');

  const items = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
  const close = React.useCallback((refocus = true) => { setOpen(false); if (refocus) button.current?.focus(); }, []);

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

  return (
    <div ref={root} className={dsClass('ds-menu', className)}>
      <IconButton
        ref={button}
        label={label}
        size={size}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        {trigger}
      </IconButton>
      {open && (
        <div ref={list} id={`${id}-menu`} role="menu" aria-label={label} className={dsClass('ds-menu-list', up && 'up')} onKeyDown={onListKey}>
          <Ctx.Provider value={{ close: () => close() }}>{children}</Ctx.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onSelect, danger, disabled }: { icon?: React.ReactNode; children: React.ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }) {
  const { close } = React.useContext(Ctx);
  const mark = React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ 'aria-hidden'?: boolean }>, { 'aria-hidden': true }) : icon;
  return (
    <button type="button" role="menuitem" tabIndex={-1} disabled={disabled} className={dsClass('ds-menu-item', danger && 'danger')} onClick={() => { close(); onSelect(); }}>
      {mark}{children}
    </button>
  );
}

export function MenuSeparator() {
  return <hr className="ds-menu-sep" role="separator" />;
}
