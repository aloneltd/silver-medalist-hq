import { useId, useState, cloneElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface TooltipProps {
  label: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: 'top' | 'bottom';
}

/** Hover/focus tooltip. Attaches aria-describedby to the child so it's announced, not just shown. */
export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  const child = cloneElement(children, {
    'aria-describedby': id,
    onMouseEnter: (e: React.MouseEvent) => {
      show();
      (children.props as { onMouseEnter?: (e: React.MouseEvent) => void }).onMouseEnter?.(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      hide();
      (children.props as { onMouseLeave?: (e: React.MouseEvent) => void }).onMouseLeave?.(e);
    },
    onFocus: (e: React.FocusEvent) => {
      show();
      (children.props as { onFocus?: (e: React.FocusEvent) => void }).onFocus?.(e);
    },
    onBlur: (e: React.FocusEvent) => {
      hide();
      (children.props as { onBlur?: (e: React.FocusEvent) => void }).onBlur?.(e);
    },
  });

  return (
    <span className="smhq-tooltip-wrap">
      {child}
      <span role="tooltip" id={id} className={`smhq-tooltip smhq-tooltip-${side} ${visible ? 'smhq-tooltip-visible' : ''}`}>
        {label}
      </span>
    </span>
  );
}
