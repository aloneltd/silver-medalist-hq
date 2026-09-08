import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** id of the element that should receive focus first — falls back to the close button. */
  initialFocusId?: string;
  width?: number;
}

/** Right-hand drawer used by the dossier and outreach composer. Full-screen on narrow
 * viewports per the mobile spec. Traps focus, closes on Escape and scrim click. */
export function Drawer({ open, onClose, title, subtitle, children, initialFocusId, width = 480 }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const toFocus = initialFocusId ? document.getElementById(initialFocusId) : panelRef.current;
    toFocus?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prevActive?.focus?.();
    };
  }, [open, onClose, initialFocusId]);

  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && (
          <div className="smhq-drawer-layer" role="presentation">
            <m.div
              className="smhq-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={onClose}
            />
            <m.div
              ref={panelRef}
              className="smhq-drawer"
              style={{ maxWidth: width }}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : 'Panel'}
              tabIndex={-1}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="smhq-drawer-header">
                <div>
                  <h2 className="smhq-drawer-title">{title}</h2>
                  {subtitle && <div className="smhq-drawer-subtitle">{subtitle}</div>}
                </div>
                <button type="button" className="smhq-icon-btn" onClick={onClose} aria-label="Close panel">
                  ✕
                </button>
              </div>
              <div className="smhq-drawer-body">{children}</div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>,
    document.body,
  );
}
