import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  labelledById?: string;
}

/** Small centered modal — confirmations, "what did they say?" prompts, the paste-a-role
 * preview. For anything list/detail-shaped use Drawer instead. */
export function Dialog({ open, onClose, title, children, footer, labelledById }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = labelledById ?? 'smhq-dialog-title';

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prevActive?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && (
          <div className="smhq-dialog-layer">
            <m.div
              className="smhq-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={onClose}
            />
            <m.div
              ref={ref}
              className="smhq-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="smhq-dialog-header">
                <h2 id={titleId} className="smhq-dialog-title">{title}</h2>
                <button type="button" className="smhq-icon-btn" onClick={onClose} aria-label="Close">✕</button>
              </div>
              {children && <div className="smhq-dialog-body">{children}</div>}
              {footer && <div className="smhq-dialog-footer">{footer}</div>}
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>,
    document.body,
  );
}
