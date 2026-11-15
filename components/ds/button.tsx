import * as React from 'react';

// Buttons. One primary per screen; danger is never the default; an icon alone
// always carries a name. Busy keeps the words (nothing jumps) and adds a spinner.
export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger' | 'danger-quiet';

type Common = {
  kind?: ButtonKind;
  size?: 'md' | 'sm';
  busy?: boolean;
  block?: boolean;
  icon?: React.ReactNode;
};

export const dsClass = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

export function buttonClass({ kind = 'secondary', size = 'md', block, iconOnly }: Common & { iconOnly?: boolean }) {
  return dsClass('ds-btn', kind !== 'secondary' && kind, size === 'sm' && 'sm', block && 'block', iconOnly && 'icon');
}

export type ButtonProps = Common & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { kind, size, busy, block, icon, className, children, disabled, type = 'button', onClick, ...rest }, ref,
) {
  // A busy button stays focusable (so focus is not lost mid-save) but ignores
  // presses; aria-disabled says so to a screen reader.
  return (
    <button
      ref={ref}
      type={type}
      className={dsClass(buttonClass({ kind, size, block }), className)}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      disabled={disabled}
      onClick={busy ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {busy ? <span className="ds-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonProps, 'children' | 'icon'> & { label: string; children: React.ReactNode };

/** An icon alone: `label` becomes its accessible name and its tooltip. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, kind = 'quiet', size, className, children, type = 'button', busy, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-busy={busy || undefined}
      className={dsClass(buttonClass({ kind, size, iconOnly: true }), className)}
      {...rest}
    >
      {busy ? <span className="ds-spinner" aria-hidden="true" /> : children}
    </button>
  );
});
