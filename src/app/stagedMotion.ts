import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../features/bench/lib/motion';

/**
 * Staged first-load motion — DESIGN-v2.1.md §C.4: "rows and cards enter in a 400ms stagger
 * once per session ... proof line counts up once. Never replays." `sessionStorage` (not a
 * module-level flag) is the source of truth so a hard reload still counts as "once", the same
 * way the coach mark and the sample-bench flag already reason about "have we shown this yet".
 */
const SESSION_FLAG_PREFIX = 'smhq_staged_';

/** True the first time this key is checked in this browser tab's session; false ever after. */
export function consumeStageOnce(key: string): boolean {
  const flagKey = `${SESSION_FLAG_PREFIX}${key}`;
  try {
    if (sessionStorage.getItem(flagKey) === '1') return false;
    sessionStorage.setItem(flagKey, '1');
    return true;
  } catch {
    return true; // sessionStorage unavailable (private mode etc.) — stage anyway, just every load
  }
}

/**
 * Applies `className` to `document.documentElement` for `durationMs`, but only the first time
 * `key` is consumed this session, and never when the visitor prefers reduced motion. Used once,
 * from the shell, to gate the CSS entrance stagger in stagedMotion.css.
 */
export function useStagedFirstLoad(key: string, className: string, durationMs = 900): void {
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (reduced) return;
    if (!consumeStageOnce(key)) return;
    document.documentElement.classList.add(className);
    const t = setTimeout(() => document.documentElement.classList.remove(className), durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Counts a number up from 0 to `value` over `durationMs`, but only the first time `sessionKey`
 * is consumed this session (e.g. the Today proof line's numbers) — every render after that (or
 * every render in a later session) just shows `value` directly, per "never replays".
 */
export function useCountUpOnce(value: number, sessionKey: string, durationMs = 600): number {
  const reduced = usePrefersReducedMotion();
  // Lazy initializers run exactly once, on the first render — the correct place to consume
  // the session flag (a plain ref-read/write here would run on every render instead).
  const [shouldAnimate] = useState(() => !reduced && consumeStageOnce(sessionKey));
  const [display, setDisplay] = useState(() => (shouldAnimate ? 0 : value));
  const played = useRef(false);

  useEffect(() => {
    if (!shouldAnimate || played.current) { setDisplay(value); return; }
    played.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return display;
}
