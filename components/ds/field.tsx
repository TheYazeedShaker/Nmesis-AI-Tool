'use client';
import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { dsClass } from './button';

// Form field: label above, control, then EITHER the help line OR the error
// (when something is wrong, the error is what matters). Required is said in
// words. A unit goes in an affix, a count on the right of the foot. The field
// wires id, aria-describedby and aria-invalid into its one control.

type FieldProps = {
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Characters typed and the limit; shown as "12 / 200". */
  count?: { value: number; max: number };
  id?: string;
  className?: string;
  children: React.ReactElement<Record<string, unknown>>;
};

export function Field({ label, help, error, required, count, id, className, children }: FieldProps) {
  const auto = React.useId();
  const controlId = id || `f${auto.replace(/[^a-zA-Z0-9]/g, '')}`;
  const helpId = `${controlId}-help`, errorId = `${controlId}-error`, countId = `${controlId}-count`;
  const describedBy = [error ? errorId : help ? helpId : null, count ? countId : null].filter(Boolean).join(' ') || undefined;
  const control = React.cloneElement(children, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
    required,
  });
  return (
    <div className={dsClass('ds-field', className)}>
      <label className="ds-label" htmlFor={controlId}>
        {label}
        {required && <span className="ds-req"> (required)</span>}
      </label>
      {control}
      {(help || error || count) && (
        <div className="ds-field-foot">
          {error ? (
            <p className="ds-error" id={errorId}><AlertCircle aria-hidden="true" />{error}</p>
          ) : help ? (
            <p className="ds-help" id={helpId}>{help}</p>
          ) : <span />}
          {count && (
            <span className="ds-count" id={countId} data-over={count.value > count.max || undefined}>
              <span className="ds-sr-only">Characters: </span>{count.value.toLocaleString('en-US')} / {count.max.toLocaleString('en-US')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={dsClass('ds-input', className)} {...rest} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={dsClass('ds-textarea', className)} {...rest} />;
});

/** A native select, styled. Over eight choices, use Combobox (it searches). */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={dsClass('ds-select', className)} {...rest} />;
});

/** A box with a unit or currency on its end ("credits", "px", "s"). */
export const AffixInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { affix: React.ReactNode }>(function AffixInput({ affix, className, ...rest }, ref) {
  return (
    <span className={dsClass('ds-affix', className)} aria-invalid={rest['aria-invalid']}>
      <input ref={ref} {...rest} />
      <span aria-hidden="true">{affix}</span>
    </span>
  );
});

type ChoiceProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: React.ReactNode; help?: React.ReactNode };

/** A sentence with a box in front of it; the whole sentence is the target. */
export function Checkbox({ label, help, className, indeterminate, ...rest }: ChoiceProps & { indeterminate?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <label className={dsClass('ds-check', className)}>
      <input ref={ref} type="checkbox" {...rest} />
      <span className="ds-choice-text">{label}{help && <span className="ds-help">{help}</span>}</span>
    </label>
  );
}

export function Radio({ label, help, className, ...rest }: ChoiceProps) {
  return (
    <label className={dsClass('ds-radio', className)}>
      <input type="radio" {...rest} />
      <span className="ds-choice-text">{label}{help && <span className="ds-help">{help}</span>}</span>
    </label>
  );
}

export function RadioGroup({ legend, children, className }: { legend: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={dsClass('ds-choices', className)}>
      <legend className="ds-label">{legend}</legend>
      {children}
    </fieldset>
  );
}

/** For something that takes effect the moment it moves; if it needs a Save
 *  afterwards, it is a Checkbox. The state is always a word beside it. */
export function Switch({ label, checked, onChange, className, ...rest }: ChoiceProps & { checked: boolean }) {
  return (
    <label className={dsClass('ds-switch', className)}>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} aria-checked={checked} {...rest} />
      <span className="ds-choice-text">{label}</span>
      <span className="ds-switch-state" aria-hidden="true">{checked ? 'On' : 'Off'}</span>
    </label>
  );
}

/** A range with its value printed beside it. `format` turns the number into words ("4 s").
 *  `editable`: the number beside it is a box to type in (with its unit), as the editor's panel needs
 *  (docs/editor-rules.md, rule 11). Still the one slider: the same range, keys and look. */
export function Slider({ value, onValueChange, min = 0, max = 100, step = 1, format, editable, className, ...rest }:
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & { value: number; onValueChange: (v: number) => void; min?: number; max?: number; step?: number; format?: (v: number) => string;
    editable?: { label: string; unit?: string } }) {
  const text = format ? format(value) : value.toLocaleString('en-US');
  return (
    <span className={dsClass('ds-slider', editable && 'ds-slider-edit', className)}>
      <input type="range" min={min} max={max} step={step} value={value} aria-valuetext={text} onChange={(e) => onValueChange(Number(e.target.value))} {...rest} />
      {editable
        ? <SliderNumber value={value} min={min} max={max} step={step} label={editable.label} unit={editable.unit} disabled={rest.disabled} onValueChange={onValueChange} />
        : <output className="ds-slider-value" aria-hidden="true">{text}</output>}
    </span>
  );
}

/** The slider's number, typed: kept as typed until it is a number in range, then applied. */
function SliderNumber({ value, min, max, step, label, unit, disabled, onValueChange }: { value: number; min: number; max: number; step: number; label: string; unit?: string; disabled?: boolean; onValueChange: (v: number) => void }) {
  const [text, setText] = React.useState<string | null>(null);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const props = {
    type: 'number', inputMode: 'decimal' as const, min, max, step, disabled, 'aria-label': label,
    value: text ?? String(Math.round(value * 10 ** decimals) / 10 ** decimals),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setText(e.target.value);
      const n = Number(e.target.value);
      if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onValueChange(n);
    },
    onBlur: () => setText(null),
  };
  return unit ? <AffixInput className="ds-slider-number" affix={unit} {...props} /> : <Input className="ds-slider-number" {...props} />;
}
