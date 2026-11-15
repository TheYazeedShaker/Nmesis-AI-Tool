'use client';
import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { dsClass } from './button';

// Combobox with search (ARIA 1.2 pattern: an input, a listbox, the active option
// by aria-activedescendant). Use it over eight choices; under that, Select.
// Typing filters; ↑/↓ move; Enter picks; Escape closes and keeps the old value.

export type ComboOption = { value: string; label: string; group?: string; hint?: string };

type Props = {
  options: ComboOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  emptyText?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
  disabled?: boolean;
};

export function matches(option: ComboOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${option.label} ${option.group || ''} ${option.hint || ''}`.toLowerCase().includes(q);
}

export function Combobox({ options, value, onChange, placeholder = 'Search…', id, className, emptyText = 'Nothing matches. Try fewer letters.', disabled, ...aria }: Props) {
  const auto = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const inputId = id || `cb${auto}`, listId = `${inputId}-list`;
  const selected = options.find((o) => o.value === value) || null;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  const shown = React.useMemo(() => options.filter((o) => matches(o, query)), [options, query]);

  React.useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const pick = (o: ComboOption) => { onChange(o.value); setOpen(false); setQuery(''); };
  const optionId = (i: number) => `${inputId}-o${i}`;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { setOpen(true); setActive(0); } else setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0); }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(Math.max(0, shown.length - 1)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); setQuery(''); }
  }

  return (
    <div ref={root} className={dsClass('ds-combo', className)}>
      <input
        id={inputId}
        className="ds-combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? optionId(active) : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : selected?.label || ''}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => { setOpen(true); setActive(Math.max(0, shown.findIndex((o) => o.value === value))); }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        {...aria}
      />
      <ChevronDown className="ds-combo-chevron" aria-hidden="true" />
      {open && (
        <ul className="ds-combo-list" role="listbox" id={listId} aria-label={aria['aria-label']}>
          {shown.length === 0 && <li className="ds-combo-empty" role="presentation">{emptyText}</li>}
          {shown.map((o, i) => {
            const head = o.group && (i === 0 || shown[i - 1].group !== o.group) ? o.group : null;
            return (
              <React.Fragment key={o.value}>
                {head && <li className="ds-combo-group ds-label-caps" role="presentation">{head}</li>}
                <li
                  id={optionId(i)}
                  role="option"
                  aria-selected={o.value === value}
                  data-active={i === active || undefined}
                  className="ds-combo-option"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  onPointerMove={() => setActive(i)}
                >
                  <span className="ds-truncate">{o.label}</span>
                  {o.hint && <span className="ds-muted">{o.hint}</span>}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );
}
