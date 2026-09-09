import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useHelp } from './HelpProvider';
import { Btn } from '../ui';
import { V3_SETTINGS_KEYS } from '../../types';
import { dataService } from '../../services/dataService';

/**
 * The eight stops from council/designer-v3.md §3, in the order a person actually meets them.
 * Each stop names a `data-tour` attribute that lives on a real element, so the tour highlights
 * the product rather than a picture of it. If a stop's element is not on screen (wrong route)
 * we navigate there first and wait for it to mount.
 */
interface Stop { anchor: string; route?: string; title: string; body: string }

const STOPS: Stop[] = [
  { anchor: 'brief', route: '/', title: 'Start here', body: 'Every morning this is written fresh from what actually happened: who replied, whose resurface window opened, who has gone quiet. The counts are computed, never guessed.' },
  { anchor: 'paste', route: '/', title: 'Paste a role', body: 'Drop in any job description. We read it, then rank everyone on the bench against it in waves of twelve — the first names land in about a second.' },
  { anchor: 'fit', route: '/', title: 'That number is the fit', body: 'Out of 100: skills, seniority, pay and timing. Above 80 is strong. Hover it anywhere in the app to see the four parts.' },
  { anchor: 'story', route: '/', title: 'This line is the product', body: 'Why they came second, in the words of whoever ran the process. No ATS export carries it, and it is what makes your note land.' },
  { anchor: 'write', route: '/', title: 'Write to them', body: 'A draft that mentions the real reason and the real date. It streams in, you edit it, and nothing is sent until you press send.' },
  { anchor: 'target', route: '/people', title: 'The same list as a picture', body: 'Closer to the middle is a better fit. The top of the clock is this week, the bottom is six months ago. Colour is status only.' },
  { anchor: 'nav-sources', title: 'Where people come from', body: 'Résumés, ATS exports, LinkedIn captures, a Slack export, your teammates. Everything lands on one bench, and every import can be undone.' },
  { anchor: 'how', title: 'This link never hides', body: 'On every screen it explains that screen, with the same three people. That is the whole manual.' },
];

const PAD = 8;

export function Tour() {
  const { tourRunning, stopTour } = useHelp();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const stop = STOPS[i];

  const finish = useCallback(() => {
    stopTour();
    setI(0);
    dataService.setSetting(V3_SETTINGS_KEYS.tourDone, true).catch(() => {});
  }, [stopTour]);

  // Move to the stop's route first; the measuring effect below then waits for the element.
  useEffect(() => {
    if (!tourRunning || !stop?.route) return;
    if (location.pathname !== stop.route) navigate(stop.route);
  }, [tourRunning, stop, location.pathname, navigate]);

  useLayoutEffect(() => {
    if (!tourRunning) { setRect(null); return; }
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${stop.anchor}"]`);
      if (!el) {
        // Give the route a few frames to mount before giving up on this stop.
        if (tries++ < 90) { raf = requestAnimationFrame(measure); return; }
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 80) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (tries++ < 90) { raf = requestAnimationFrame(measure); return; }
      }
      setRect(el.getBoundingClientRect());
    };
    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  }, [tourRunning, stop, i]);

  useEffect(() => {
    if (!tourRunning) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') setI(n => Math.min(STOPS.length - 1, n + 1));
      if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tourRunning, finish]);

  if (!tourRunning) return null;

  // Place the card under the highlight, or above it when there is no room below.
  const below = !rect || rect.bottom + 200 < window.innerHeight;
  const cardTop = rect ? (below ? rect.bottom + 14 : Math.max(12, rect.top - 200)) : window.innerHeight / 2 - 100;
  const cardLeft = rect ? Math.min(Math.max(16, rect.left), window.innerWidth - 396) : window.innerWidth / 2 - 190;

  return (
    <div className="p-tour" role="dialog" aria-modal="true" aria-label={`Tour, step ${i + 1} of ${STOPS.length}`}>
      <div className="p-tour-scrim" onClick={finish} />
      {rect && (
        <div
          className="p-tour-ring"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}
      <div className="p-tour-card" style={{ top: cardTop, left: cardLeft }}>
        <div className="p-meta">Step {i + 1} of {STOPS.length}</div>
        <div className="p-serif p-h3 p-mt-2">{stop.title}</div>
        <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 8 }}>{stop.body}</div>
        <div className="p-spread p-mt-6">
          <button type="button" className="p-btn p-btn-ghost p-btn-sm" onClick={finish}>Skip the tour</button>
          <div className="p-row p-gap-2">
            {i > 0 && <Btn size="sm" onClick={() => setI(i - 1)}>Back</Btn>}
            {i < STOPS.length - 1
              ? <Btn size="sm" tone="primary" onClick={() => setI(i + 1)}>Next</Btn>
              : <Btn size="sm" tone="primary" onClick={finish}>Got it</Btn>}
          </div>
        </div>
      </div>
    </div>
  );
}
