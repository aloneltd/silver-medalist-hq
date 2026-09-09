/**
 * The Target — owned by builder B3, People's picture of the same list geometry defines in
 * src/features/map/lib/geometry.ts (v2.1's Map): distance from the middle is fit, the angle
 * around the dial is time since last contact, colour is status only. Reused verbatim here —
 * only the frame around it is new (Paper, a plain-words caption, and the "Show me" walkthrough
 * council/designer-v3.md §3 asks for).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candidate, Match, Role } from '../../types';
import { Btn } from '../ui';
import { spokeLabel } from '../lib/personText';
import {
  RING_BANDS, buildTargetGeometry, buildTargetPoints, quadrantOf,
  type TargetPoint, type RingBand,
} from '../../features/map/lib/geometry';

export interface TargetFilter { min: number; max: number; label: string }

export interface TargetProps {
  role: Role | null;
  candidates: Candidate[];
  matches: Match[];
  /** `side` — the ~340px card in People's right column. `full` — the whole-width picture
   * shown when the Cards|List|Target segment is set to Target. */
  variant: 'side' | 'full';
  onOpenCandidate: (id: string) => void;
  onFilterRing: (filter: TargetFilter | null) => void;
  activeFilterLabel?: string | null;
  /** side variant only — "Open" jumps to the full-width picture. */
  onExpand?: () => void;
}

function useElementSize<T extends HTMLElement>(fallback: { width: number; height: number }) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

const STATUS_LEGEND: { label: string; className: string }[] = [
  { label: 'active', className: '' },
  { label: 'took a job', className: 'p-dot-blue' },
  { label: 'do not approach', className: 'p-dot-amber' },
  { label: 'quiet', className: 'p-dot-grey' },
];

/** The one sentence a walkthrough step narrates, built entirely from real numbers — nothing
 * here is guessed. */
function narrate(p: TargetPoint): string {
  const first = p.name.split(/\s+/)[0] ?? p.name;
  const posPhrase = p.ring === 'strong' ? 'close to the middle' : p.ring === 'possible' ? 'partway out from the middle' : 'toward the edge';
  const timePhrase = p.warmthDays <= 7 ? 'near the top of the clock' : p.warmthDays <= 60 ? 'partway around the clock' : 'toward the bottom of the clock';
  return `This is ${p.name}. ${first} is ${posPhrase} because the fit is ${Math.round(p.fit)}, and ${timePhrase} because you ${spokeLabel(p.warmthDays)}.`;
}

export function Target({ role, candidates, matches, variant, onOpenCandidate, onFilterRing, activeFilterLabel, onExpand }: TargetProps) {
  const fallback = variant === 'side' ? { width: 292, height: 220 } : { width: 640, height: 460 };
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>(fallback);
  const legendGutter = 36;
  const geo = useMemo(() => buildTargetGeometry(size.width, size.height, legendGutter), [size.width, size.height]);

  const matchesByCandidate = useMemo(() => {
    const map: Record<string, Match> = {};
    for (const m of matches) map[m.candidateId] = m;
    return map;
  }, [matches]);

  const points = useMemo(() => buildTargetPoints(candidates, matchesByCandidate, geo), [candidates, matchesByCandidate, geo]);
  const rankedByFit = useMemo(() => [...points].sort((a, b) => b.fit - a.fit), [points]);
  const labelled = useMemo(() => rankedByFit.slice(0, 5), [rankedByFit]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [walking, setWalking] = useState(false);
  const [step, setStep] = useState(0);

  // The walkthrough always resets to the start when the underlying list changes shape, so it
  // never narrates a person who scrolled out of the top five mid-tour.
  useEffect(() => { setWalking(false); setStep(0); }, [role?.id]);

  const walkPoints = labelled;
  const activePoint = walking ? walkPoints[Math.min(step, walkPoints.length - 1)] : null;

  const quiet = useMemo(() => points.filter(p => p.ring === 'strong' && p.warmthDays > 7), [points]);
  const quietQuadrant = useMemo(() => {
    if (!quiet.length) return null;
    const counts = new Map<string, number>();
    for (const p of quiet) {
      const q = quadrantOf(p.x, p.y, geo);
      counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    let best: [string, number] = ['top-right', 0];
    for (const entry of counts) if (entry[1] > best[1]) best = entry;
    return { quadrant: best[0], count: best[1] };
  }, [quiet, geo]);

  const caption = !role
    ? 'Pick a role above to see who is worth a message.'
    : points.length === 0
      ? 'Nobody has been scored for this role yet.'
      : variant === 'side'
        ? 'Closer to the middle is a better fit. Top of the clock is this week, bottom is six months ago.'
        : quietQuadrant
          ? `Closer to the middle is a better fit. Around the clock is how long since you spoke — top is this week, bottom is six months ago. ${quietQuadrant.count} strong fit${quietQuadrant.count === 1 ? '' : 's'} sit${quietQuadrant.count === 1 ? 's' : ''} ${quietQuadrant.quadrant}, going quiet.`
          : 'Closer to the middle is a better fit. Around the clock is how long since you spoke — top is this week, bottom is six months ago.';

  const toggleRing = (ring: RingBand) => {
    const max = Number.isFinite(ring.max) ? ring.max : 100;
    if (activeFilterLabel === ring.label) { onFilterRing(null); return; }
    onFilterRing({ min: Math.max(0, ring.min), max, label: ring.label });
  };

  const startWalk = () => { setWalking(true); setStep(0); };
  const stopWalk = () => setWalking(false);
  const nextStep = () => setStep(s => Math.min(walkPoints.length - 1, s + 1));
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  return (
    <div className="p-card p-card-pad p-target" data-tour="target">
      <div className="p-spread">
        <div style={{ fontWeight: 600 }}>The Target</div>
        {variant === 'side' && onExpand && (
          <button type="button" className="p-sec p-inline-link" onClick={onExpand}>Open</button>
        )}
      </div>
      <div className="p-sec" style={{ lineHeight: 1.5, marginTop: 4 }}>{caption}</div>

      {role && points.length > 0 && variant === 'full' && (
        <div className="p-target-legend p-mt-3">
          {RING_BANDS.map(ring => (
            <button
              key={ring.key}
              type="button"
              className={`p-pill p-pill-sm${activeFilterLabel === ring.label ? ' p-on' : ''}`}
              onClick={() => toggleRing(ring)}
              aria-pressed={activeFilterLabel === ring.label}
            >
              {ring.label}
            </button>
          ))}
          {activeFilterLabel && (
            <button type="button" className="p-inline-link p-sec" onClick={() => onFilterRing(null)}>Clear</button>
          )}
        </div>
      )}

      {role && points.length > 0 && (
        <div ref={containerRef} className="p-target-canvas p-mt-3" style={variant === 'full' ? { height: 420 } : undefined}>
          <svg
            width={size.width}
            height={size.height}
            role="img"
            aria-label={`The Target for ${role.title}: ${points.length} people by fit and time since contact`}
          >
            <g aria-hidden="true">
              <circle cx={geo.cx} cy={geo.cy} r={geo.rOuter} className="p-target-ring" />
              <circle cx={geo.cx} cy={geo.cy} r={geo.rPossible} className="p-target-ring" />
              <circle cx={geo.cx} cy={geo.cy} r={geo.rStrong} className="p-target-ring p-target-ring-strong" />
              <text x={geo.cx} y={geo.cy - geo.rOuter - 10} textAnchor="middle" className="p-target-tick">this week</text>
              <text x={geo.cx} y={geo.cy + geo.rOuter + 20} textAnchor="middle" className="p-target-tick">six months</text>
            </g>

            {points.map(p => (
              <circle
                key={p.id}
                className="p-target-dot"
                cx={p.x}
                cy={p.y}
                r={walking && activePoint?.id === p.id ? p.r + 3 : p.r}
                fill={p.color}
                opacity={p.status === 'do_not_reapproach' || p.status === 'opted_out' ? 0.55 : 1}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredId(p.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onOpenCandidate(p.id)}
              >
                <title>{`${p.name} — fit ${Math.round(p.fit)}, ${spokeLabel(p.warmthDays)}`}</title>
              </circle>
            ))}

            {activePoint && (
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={activePoint.r + 7}
                fill="none"
                stroke="var(--p-ink)"
                strokeWidth={2}
                className="p-target-dot"
              />
            )}

            {(labelled.length ? labelled : []).map(p => {
              const near = p.x > size.width - 90;
              return (
                <text
                  key={p.id}
                  x={p.x + p.r + 6}
                  y={p.y + 4}
                  textAnchor={near ? 'end' : 'start'}
                  dx={near ? -(p.r * 2 + 12) : 0}
                  className={`p-target-label${hoveredId === p.id || activePoint?.id === p.id ? ' p-target-label-on' : ''}`}
                >
                  {p.name}
                </text>
              );
            })}
          </svg>
        </div>
      )}

      {role && points.length > 0 && (
        <div className="p-target-legend p-mt-3">
          {STATUS_LEGEND.map(s => (
            <span key={s.label} className="p-row p-gap-2">
              <span className={`p-dot${s.className ? ` ${s.className}` : ''}`} aria-hidden="true" />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {role && points.length > 0 && (
        <div className="p-mt-4">
          {!walking ? (
            <Btn size="sm" onClick={startWalk}>Show me</Btn>
          ) : (
            <div className="p-note" style={{ background: 'var(--p-wash)', borderColor: 'var(--p-wash)' }}>
              <div style={{ color: 'var(--p-ink)', fontSize: 14, lineHeight: 1.5 }}>
                {activePoint ? narrate(activePoint) : 'Nobody to show yet.'}
              </div>
              <div className="p-row p-gap-2 p-mt-3">
                <Btn size="sm" tone="ghost" onClick={stopWalk}>Done</Btn>
                {step > 0 && <Btn size="sm" onClick={prevStep}>Back</Btn>}
                {step < walkPoints.length - 1 ? (
                  <Btn size="sm" tone="primary" onClick={nextStep}>Next</Btn>
                ) : (
                  activePoint && <Btn size="sm" tone="primary" onClick={() => onOpenCandidate(activePoint.id)}>Open profile</Btn>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {role && points.length === 0 && (
        <div className="p-note p-mt-4">Paste this role, then match the bench — the picture fills in once there is a fit to plot.</div>
      )}
    </div>
  );
}
