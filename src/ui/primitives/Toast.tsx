import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';

export type ToastTone = 'neutral' | 'success' | 'danger';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  push: (message: string, opts?: { tone?: ToastTone; actionLabel?: string; onAction?: () => void; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** App-wide toast host. Wrap the app once in <ToastProvider>; call useToast().push(...) anywhere.
 * Used for "Marked sent", "Snoozed", undo affordances, and friendly error surfacing. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback<ToastContextValue['push']>((message, opts) => {
    const id = `t${++counter.current}`;
    const item: ToastItem = { id, message, tone: opts?.tone ?? 'neutral', actionLabel: opts?.actionLabel, onAction: opts?.onAction };
    setItems(prev => [...prev, item]);
    const duration = opts?.durationMs ?? 4200;
    window.setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {createPortal(
        <LazyMotion features={domAnimation} strict>
          <div className="smhq-toast-region" role="status" aria-live="polite">
            <AnimatePresence>
              {items.map(item => (
                <m.div
                  key={item.id}
                  className={`smhq-toast smhq-toast-${item.tone}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.16 }}
                >
                  <span>{item.message}</span>
                  {item.actionLabel && (
                    <button
                      type="button"
                      className="smhq-toast-action"
                      onClick={() => {
                        item.onAction?.();
                        setItems(prev => prev.filter(t => t.id !== item.id));
                      }}
                    >
                      {item.actionLabel}
                    </button>
                  )}
                </m.div>
              ))}
            </AnimatePresence>
          </div>
        </LazyMotion>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Never throw over a toast — degrade to console so a missing provider never crashes a flow.
    return { push: (message) => console.warn('[toast, no provider]', message) };
  }
  return ctx;
}
