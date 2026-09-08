import { useEffect, useRef, useState } from 'react';

/** Respected everywhere motion appears in bench/map/dossier/outreach per BLUEPRINT-v2.md. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Animates a displayed number from its previous value to `value` whenever `value` changes —
 * "scores count from the previous value" (BLUEPRINT-v2.md, DESIGN-v2.md). Jumps instantly
 * when the user prefers reduced motion.
 */
export function useCountUp(value: number, durationMs = 500): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      // No animation — `value` is returned directly below, so just keep the ref in sync for
      // whenever reduced-motion is toggled back off. No setState here (react-hooks/set-state-in-effect).
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs, reduced]);

  return reduced ? value : display;
}
