import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Esc to close, focus moved in, focus returned on unmount, background click closes. */
function useOverlay(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    (first ?? ref.current)?.focus?.();
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [onClose]);
  return ref;
}

export function Drawer(
  { title, onClose, children, wide, footer }:
  { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode },
) {
  const ref = useOverlay(onClose);
  return (
    <>
      <div className="p-scrim" onClick={onClose} />
      <div className={`p-drawer${wide ? ' p-drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Panel'} ref={ref} tabIndex={-1}>
        <div className="p-drawer-head">
          <div className="p-serif p-h3">{title}</div>
          <button type="button" className="p-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-drawer-body">{children}</div>
        {footer && <div style={{ padding: 20, borderTop: '1px solid var(--p-line)' }}>{footer}</div>}
      </div>
    </>
  );
}

export function Dialog(
  { title, onClose, children, footer, width }:
  { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number },
) {
  const ref = useOverlay(onClose);
  return (
    <>
      <div className="p-scrim" onClick={onClose} />
      <div className="p-dialog" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} ref={ref} tabIndex={-1} style={width ? { width } : undefined}>
        <div className="p-spread" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="p-serif p-h3">{title}</div>
          <button type="button" className="p-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-mt-4">{children}</div>
        {footer && <div className="p-row p-gap-3 p-mt-6" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </>
  );
}
