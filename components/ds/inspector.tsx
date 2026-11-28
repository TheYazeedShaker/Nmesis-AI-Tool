'use client';
import * as React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { dsClass } from './button';
import { AffixInput, Input, Slider, Switch } from './field';

// The editor's right panel (docs/editor-rules.md) is built from these pieces
// only, so every selection's panel keeps the twelve rules by construction:
// - sections in the fixed order, each `<section data-editor-section>` (rule 3);
// - a plain-word label on every control: a row's label, a button's own words,
//   or the label of the group a choice belongs to (rule 5);
// - rows, not columns, with full-width inputs; width and height, or X and Y,
//   share one row (NumberPair) (rules 3 and 8);
// - spacing set by the containers from the four editor tokens (rule 4,
//   app/design-system.css "Editor panel");
// - the design system's one slider, with its number typed (rule 11);
// - a switch or a segmented choice where a dropdown would add a click (rule 7);
// - rare settings under "More" (rule 6).

export type InspectorSectionId = 'position' | 'appearance' | 'text' | 'effects' | 'arrange' | 'credit' | 'page' | 'brand';

/** A section of the panel, in the fixed order (the editor leaves out a section that doesn't apply; it never moves one). */
export function InspectorSection({ section, title, children, more, level = 2 }: { section: InspectorSectionId; title: string; children: React.ReactNode; more?: React.ReactNode;
  /** The heading's level: 2 under the page's h1 (the editor); 3 inside a dialog or a section of its own. */ level?: 2 | 3 }) {
  const id = React.useId(), Heading = level === 3 ? 'h3' : 'h2';
  return (
    <section className="ds-inspector-section" data-editor-section={section} aria-labelledby={id}>
      <Heading className="ds-inspector-title" id={id}>{title}</Heading>
      {children}
      {more && <More>{more}</More>}
    </section>
  );
}

const domId = (raw: string) => 'i' + raw.replace(/[^a-zA-Z0-9]/g, '');

/** One labelled row: its words above, the control below at full width. The row gives the control its id. */
export function InspectorRow({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactElement<Record<string, unknown>> }) {
  const id = domId(React.useId()), hintId = hint ? id + '-hint' : undefined;
  return (
    <div className="ds-inspector-row" data-editor-row>
      <label className="ds-inspector-label" data-editor-label htmlFor={id}>{label}</label>
      {React.cloneElement(children, { id, 'aria-describedby': hintId })}
      {hint && <p className="ds-help" id={hintId}>{hint}</p>}
    </div>
  );
}

const fits = (text: string, min: number, max: number) => { const n = Number(text); return text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null; };
const shown = (n: number, decimals: number) => String(Math.round(n * 10 ** decimals) / 10 ** decimals);

/** A typed number with its unit. What is being typed stays as typed ("-", "1."); a number in range is applied at once. */
export function NumberField({ label, value, unit, min, max, step = 1, decimals = 0, onChange, disabled, title }: {
  label: string; value: number; unit?: string; min: number; max: number; step?: number; decimals?: number; onChange: (n: number) => void; disabled?: boolean; title?: string;
}) {
  const [text, setText] = React.useState<string | null>(null);
  const props = {
    type: 'number', inputMode: 'decimal' as const, min, max, step, disabled, title,
    value: text ?? shown(value, decimals),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setText(e.target.value); const n = fits(e.target.value, min, max); if (n !== null) onChange(n); },
    onBlur: () => setText(null),
  };
  return <InspectorRow label={label}>{unit ? <AffixInput affix={unit} {...props} /> : <Input {...props} />}</InspectorRow>;
}

type Num = Omit<React.ComponentProps<typeof NumberField>, 'disabled'>;
/** Two numbers that belong together on one row: W and H, X and Y (rule 3). */
export function NumberPair({ first, second, disabled }: { first: Num; second: Num; disabled?: boolean }) {
  return <div className="ds-inspector-pair"><NumberField {...first} disabled={disabled} /><NumberField {...second} disabled={disabled} /></div>;
}

/** The one slider (rule 11) in a labelled row, its number typed beside it. A drag is one change (the editor groups it). */
export function SliderField({ label, value, min, max, step = 1, unit, onChange, disabled }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <InspectorRow label={label}>
      <Slider value={value} min={min} max={max} step={step} onValueChange={onChange} disabled={disabled} editable={{ label: unit ? `${label}, ${unit}` : label, unit }} />
    </InspectorRow>
  );
}

/** On or off, said in words (rule 7): the design system's switch. */
export function ToggleRow({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return <Switch className="ds-inspector-switch" label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />;
}

/** Roving focus in a group of choices: one Tab stop; the arrow keys move and choose. */
function useRoving<T>(values: readonly T[], value: T, onChange: (v: T) => void) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, values.indexOf(value));
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? values.length - 1 : step ? (at + step + values.length) % values.length : -1;
    if (to < 0) return;
    e.preventDefault(); onChange(values[to]); refs.current[to]?.focus();
  };
  return { at, refs, onKeyDown };
}

export type Choice<T extends string> = { value: T; label: string; icon?: React.ReactNode; title?: string; disabled?: boolean };
/** A few choices side by side, each in words (rule 5): alignment, a flip, a kind. One Tab stop, arrows choose
 *  (a choice that isn't available yet is skipped). */
export function ChoiceRow<T extends string>({ label, value, choices, onChange, disabled }: { label: string; value: T; choices: Choice<T>[]; onChange: (v: T) => void; disabled?: boolean }) {
  const id = domId(React.useId());
  const open = choices.filter((c) => !c.disabled);
  const { refs: openRefs, onKeyDown } = useRoving(open.map((c) => c.value), value, onChange);
  const refs = openRefs, at = Math.max(0, choices.findIndex((c) => c.value === value));
  return (
    <div className="ds-inspector-row" data-editor-row>
      <span className="ds-inspector-label" data-editor-label id={id}>{label}</span>
      <div className="ds-segmented ds-inspector-segmented" role="radiogroup" aria-labelledby={id} onKeyDown={onKeyDown}>
        {choices.map((c, i) => (
          <button key={c.value} ref={(n) => { const o = open.indexOf(c); if (o >= 0) refs.current[o] = n; }} type="button" role="radio" aria-checked={c.value === value} tabIndex={i === at ? 0 : -1} disabled={disabled || c.disabled} title={c.title} onClick={() => onChange(c.value)}>
            {c.icon}{c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type Swatch = { hex: string; name: string };
/** Colours as a labelled group of choices (the brand's first), with "Custom" for any other colour. */
export function SwatchRow({ label, value, swatches, onPick, onCustom, disabled }: { label: string; value: string; swatches: Swatch[]; onPick: (hex: string) => void; onCustom?: (hex: string) => void; disabled?: boolean }) {
  const id = domId(React.useId()), now = value.toUpperCase();
  const list = swatches.map((s) => ({ ...s, hex: s.hex === 'transparent' ? s.hex : s.hex.toUpperCase() }));
  const { at, refs, onKeyDown } = useRoving(list.map((s) => s.hex), list.some((s) => s.hex === now) ? now : (list[0]?.hex ?? ''), onPick);
  return (
    <div className="ds-inspector-row" data-editor-row>
      <span className="ds-inspector-label" data-editor-label id={id}>{label}</span>
      <div className="ds-swatch-line">
        {list.length > 0 && <div className="ds-swatches" role="radiogroup" aria-labelledby={id} onKeyDown={onKeyDown}>
          {list.map((s, i) => {
            const on = s.hex === now;
            return (
              <button key={s.hex} ref={(n) => { refs.current[i] = n; }} type="button" role="radio" aria-checked={on} tabIndex={i === at ? 0 : -1} disabled={disabled}
                className={dsClass('ds-swatch', s.hex === 'transparent' && 'ds-swatch-none')} aria-label={s.name !== s.hex ? `${s.name}, ${s.hex === 'transparent' ? 'no colour' : s.hex}` : s.hex} title={s.name}
                style={{ ['--swatch' as string]: s.hex } as React.CSSProperties} onClick={() => onPick(s.hex)}>
                {on && <Check aria-hidden="true" />}
              </button>
            );
          })}
        </div>}
        {onCustom && (
          <label className="ds-swatch-custom">
            <input type="color" className="ds-swatch-input" disabled={disabled} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onCustom(e.target.value)} />
            <span>Custom</span>
          </label>
        )}
      </div>
    </div>
  );
}

/** Rare settings, folded (rule 6). */
export function More({ children, label = 'More' }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="ds-more">
      <summary className="ds-more-summary"><ChevronRight aria-hidden="true" />{label}</summary>
      <div className="ds-more-body">{children}</div>
    </details>
  );
}

/** Buttons in words, side by side, wrapping onto the next row when the panel is full. */
export function ActionRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return <div className="ds-inspector-actions" role={label ? 'group' : undefined} aria-label={label}>{children}</div>;
}

export type InspectorTab = { id: string; label: string };
/** The panel's tabs (Design, Layers): one Tab stop, the arrow keys move between them. */
export function InspectorTabs({ tabs, value, onChange, idBase, label }: { tabs: InspectorTab[]; value: string; onChange: (id: string) => void; idBase: string; label: string }) {
  const { at, refs, onKeyDown } = useRoving(tabs.map((t) => t.id), value, onChange);
  return (
    <div className="ds-tabs ds-inspector-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(n) => { refs.current[i] = n; }} type="button" role="tab" className="ds-tab" id={`${idBase}-tab-${t.id}`} aria-controls={`${idBase}-panel-${t.id}`}
          aria-selected={t.id === value} tabIndex={i === at ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
export function InspectorTabPanel({ idBase, tab, children }: { idBase: string; tab: string; children: React.ReactNode }) {
  return <div className="ds-inspector-panel" role="tabpanel" id={`${idBase}-panel-${tab}`} aria-labelledby={`${idBase}-tab-${tab}`}>{children}</div>;
}
