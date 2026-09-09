import { useEffect, useId, useRef, useState } from 'react';
import { GLOSSARY, type TermKey } from '../help/glossary';

/**
 * A word with a one-line definition — the "tooltips on every term" pillar of DESIGN-v3.
 *
 * It is a real <button>, so it is keyboard reachable and screen-reader announced; the panel is
 * `aria-describedby`-linked rather than title-attribute'd (a title never appears on touch and
 * reads badly aloud). Positioned with fixed coordinates measured from the trigger so it can
 * never be clipped by a card's overflow.
 */
export function Term({ term, children }: { term: TermKey; children?: React.ReactNode }) {
  const entry = GLOSSARY[term];
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const width = 260;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const above = r.top > 190;
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', hide, true); };
  }, [pos]);

  return (
    <>
      <button
        type="button"
        ref={ref}
        className="p-term"
        aria-describedby={pos ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={e => { e.stopPropagation(); pos ? hide() : show(); }}
      >
        {children ?? entry.label}
      </button>
      {pos && (
        <span
          id={id}
          role="tooltip"
          className="p-tip"
          style={{ top: pos.top, left: pos.left, transform: pos.top < 190 ? undefined : 'translateY(-100%)' }}
        >
          <span className="p-tip-title">{entry.label}</span>
          {entry.body}
        </span>
      )}
    </>
  );
}
