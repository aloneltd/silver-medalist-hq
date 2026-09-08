import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ChipTone = 'neutral' | 'accent' | 'amber' | 'green' | 'danger';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ChipTone;
  selected?: boolean;
  icon?: ReactNode;
  as?: 'button' | 'span';
}

/** Small pill used for filters, status chips and tags. Renders as a <span> (non-interactive,
 * e.g. a status readout) when `as="span"`, otherwise a real button with hover/active/focus. */
export function Chip({ tone = 'neutral', selected, icon, as = 'button', className = '', children, ...rest }: ChipProps) {
  const cls = `smhq-chip smhq-chip-${tone} ${selected ? 'smhq-chip-selected' : ''} ${className}`;
  if (as === 'span') {
    return (
      <span className={cls}>
        {icon}
        {children}
      </span>
    );
  }
  return (
    <button type="button" className={cls} aria-pressed={selected} {...rest}>
      {icon}
      {children}
    </button>
  );
}
