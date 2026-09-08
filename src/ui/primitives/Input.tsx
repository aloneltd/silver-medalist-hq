import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leadingIcon, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="smhq-field">
      {label && <label className="smhq-field-label" htmlFor={inputId}>{label}</label>}
      <div className={`smhq-input-wrap ${error ? 'smhq-input-wrap-error' : ''}`}>
        {leadingIcon && <span className="smhq-input-icon">{leadingIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={`smhq-input ${className}`}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
      </div>
      {error && <p className="smhq-field-error" id={`${inputId}-error`}>{error}</p>}
      {!error && hint && <p className="smhq-field-hint" id={`${inputId}-hint`}>{hint}</p>}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="smhq-field">
      {label && <label className="smhq-field-label" htmlFor={inputId}>{label}</label>}
      <textarea
        ref={ref}
        id={inputId}
        className={`smhq-textarea ${error ? 'smhq-input-wrap-error' : ''} ${className}`}
        aria-invalid={!!error || undefined}
        {...rest}
      />
      {error && <p className="smhq-field-error">{error}</p>}
      {!error && hint && <p className="smhq-field-hint">{hint}</p>}
    </div>
  );
});
