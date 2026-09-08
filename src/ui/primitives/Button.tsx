import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

const VARIANT_STYLE: Record<ButtonVariant, string> = {
  primary: 'smhq-btn-primary',
  secondary: 'smhq-btn-secondary',
  ghost: 'smhq-btn-ghost',
  danger: 'smhq-btn-danger',
};

const SIZE_STYLE: Record<ButtonSize, string> = {
  sm: 'smhq-btn-sm',
  md: 'smhq-btn-md',
  lg: 'smhq-btn-lg',
};

/** Base button primitive — every interactive control in the app should render through this
 * (or Chip, for a smaller pill) so hover/active/focus states and motion tokens stay consistent. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, disabled, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`smhq-btn ${VARIANT_STYLE[variant]} ${SIZE_STYLE[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="smhq-btn-spinner" aria-hidden="true" /> : icon}
      {children != null && <span className="smhq-btn-label">{children}</span>}
      {!loading && iconRight}
    </button>
  );
});
