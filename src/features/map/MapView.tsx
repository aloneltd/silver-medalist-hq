import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { select } from 'd3-selection';
import 'd3-transition';
import { dataService } from '../../services/dataService';
import type { Candidate, Match } from '../../types';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { usePrefersReducedMotion } from '../bench/lib/motion';
import {
  RING_BANDS, buildTargetGeometry, buildTargetPoints, quadrantOf,
  type TargetPoint, type TargetGeometry,
} from './lib/geometry';
import { buildDriftPoints, computeDriftSummary, addCooledToToday, type DriftPoint } from './lib/drift';
import { MapTooltip } from './MapTooltip';
import { DriftControls } from './DriftControls';
import { useToast } from '../../ui';
import './map.css';

export interface MapViewProps {
  /** Omit to plot against the shell's currently-selected role (top-bar role picker). */
  roleId?: string;
}

const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_MATCHES: Match[] = [];
/** Anyone at or above this fit, still waiting more than a week for contact, is the "going
 * quiet" cohort the sub-line calls out — council amendments §1. */
const STRONG_GOING_QUIET_DAYS = 7;

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 640, height: 460 });
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

/**
 * The Target — DESIGN-v2.1.md §B + council amendments §1: a bullseye (distance = fit) crossed
 * with a clock (angle = time since contact). Colour is status only. Deterministic, SVG,
 * d3-owned circle transitions — no force layout, same discipline as the old Map.
 */
export function MapView({ roleId: roleIdProp }: MapViewProps = {}) {
  const { selectedRoleId, setBenchFitFilter } = useAppUI();
  const roleId = roleIdProp ?? selectedRoleId ?? undefined;
  const { openCandidate } = useDossierLink();
  const navigate = useNavigate();
  const { push } = useToast();

  const role = dataService.hooks.useRole(roleId);
  const candidates = dataService.hooks.useCandidates() ?? EMPTY_CANDIDATES;
  const matches = dataService.hooks.useMatchesForRole(roleId) ?? EMPTY_MATCHES;
  const matchesByCandidate = useMemo(() => {
    const map: Record<string, Match> = {};
    for (const m of matches) map[m.candidateId] = m;
    return map;
  }, [matches]);

  const reduced = usePrefersReducedMotion();
  const { ref: containerRef, size } = useElementSize<HTMLDivElement>();
  const gRef = useRef<SVGGElement>(null);
  const trailsRef = useRef<SVGGElement>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [monthsAgo, setMonthsAgo] = useState(0);
  const [addBusy, setAddBusy] = useState(false);
  const [addedThisSession, setAddedThisSession] = useState(false);

  const geo: TargetGeometry = useMemo(() => buildTargetGeometry(size.width, size.height, 40), [size.width, size.height]);

  const points = useMemo(() => buildTargetPoints(candidates, matchesByCandidate, geo), [candidates, matchesByCandidate, geo]);
  const rankedByFit = useMemo(() => [...points].sort((a, b) => b.fit - a.fit), [points]);

  const driftPoints: DriftPoint[] = useMemo(
    () => (monthsAgo > 0 ? buildDriftPoints(candidates, matchesByCandidate, geo, monthsAgo) : []),
    [candidates, matchesByCandidate, geo, monthsAgo],
  );
  const shown = monthsAgo > 0 ? driftPoints : points;

  const driftSummary = useMemo(() => computeDriftSummary(candidates, matchesByCandidate), [candidates, matchesByCandidate]);

  // Faint 6-month trails behind dots that have drifted meaningfully — default, un-scrubbed
  // view (council amendments §2: "Default today with faint 6-month trails already behind
  // dots that cooled"). Independent of the slider.
  const trails = useMemo(() => {
    if (monthsAgo > 0) return [];
    const sixAgo = buildDriftPoints(candidates, matchesByCandidate, geo, 6);
    const bySixAgoId = new Map(sixAgo.map(p => [p.id, p]));
    return points
      .map(p => ({ current: p, past: bySixAgoId.get(p.id) }))
      .filter((p): p is { current: TargetPoint; past: DriftPoint } => !!p.past && Math.abs(p.current.warmthDays - p.past.warmthDays) >= 14);
  }, [points, monthsAgo, candidates, matchesByCandidate, geo]);

  // D3 general-update-pattern: this effect fully owns the <g> subtree's circles.
  useEffect(() => {
    if (!gRef.current) return;
    const duration = reduced ? 0 : monthsAgo > 0 ? 220 : 300;

    const sel = select(gRef.current)
      .selectAll<SVGCircleElement, TargetPoint>('circle.point')
      .data(shown, d => d.id);

    sel.exit().transition().duration(duration).attr('r', 0).style('opacity', 0).remove();

    const entered = sel
      .enter()
      .append('circle')
      .attr('class', 'point')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', 0)
      .style('opacity', 0)
      .style('fill', d => d.color)
      .style('cursor', 'pointer')
      .style('outline', 'none')
      .on('mouseenter', (_event, d) => setHoveredId(d.id))
      .on('mouseleave', () => setHoveredId(null))
      .on('click', (_event, d) => openCandidate(d.id));

    entered
      .merge(sel as unknown as typeof entered)
      .attr('data-id', d => d.id)
      .transition()
      .duration(duration)
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', d => d.r)
      .style('opacity', d => (d.status === 'do_not_reapproach' || d.status === 'opted_out' ? 0.55 : 1))
      .style('fill', d => d.color);
  }, [shown, reduced, monthsAgo, openCandidate]);

  // Trail lines — a thin static <g>, redrawn (not transitioned) whenever the trail set changes.
  useEffect(() => {
    if (!trailsRef.current) return;
    const sel = select(trailsRef.current).selectAll<SVGLineElement, typeof trails[number]>('line.trail').data(trails, d => d.current.id);
    sel.exit().remove();
    sel.enter()
      .append('line')
      .attr('class', 'trail')
      .merge(sel as never)
      .attr('x1', d => d.past.x).attr('y1', d => d.past.y)
      .attr('x2', d => d.current.x).attr('y2', d => d.current.y)
      .attr('stroke', d => d.current.color)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.22)
      .attr('stroke-dasharray', '2 3');
  }, [trails]);

  const activePoint = shown.find(p => p.id === activeId) ?? null;
  const hoveredPoint = shown.find(p => p.id === hoveredId) ?? null;
  const shownTooltip = hoveredPoint ?? activePoint;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!rankedByFit.length) return;
    if (e.key === 'Enter' && activeId) {
      e.preventDefault();
      openCandidate(activeId);
      return;
    }
    // Arrow keys walk dots by fit rank, per DESIGN-v2.1.md §B — not spatial nearest-neighbour,
    // since position no longer encodes two independent axes a reader would navigate by.
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const backward = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    if (!forward && !backward) return;
    e.preventDefault();
    const currentRank = activeId ? rankedByFit.findIndex(p => p.id === activeId) : -1;
    const nextRank = currentRank === -1
      ? 0
      : Math.max(0, Math.min(rankedByFit.length - 1, currentRank + (forward ? 1 : -1)));
    setActiveId(rankedByFit[nextRank].id);
  };

  // Top 5 by fit rank get a name label — labelling all of them would be noise.
  const labelled = useMemo(() => rankedByFit.slice(0, 5), [rankedByFit]);

  // Sub-line's "{N} people sit {quadrant}: strong fit, going quiet" — council amendments §1.
  const goingQuiet = useMemo(
    () => points.filter(p => p.ring === 'strong' && p.warmthDays > STRONG_GOING_QUIET_DAYS),
    [points],
  );
  const quietQuadrant = useMemo(() => {
    if (!goingQuiet.length) return null;
    const counts = new Map<string, number>();
    for (const p of goingQuiet) {
      const q = quadrantOf(p.x, p.y, geo);
      counts.set(q, (counts.get(q) ?? 0) + 1);
    }
    let best: [string, number] = ['top-right', 0];
    for (const entry of counts) if (entry[1] > best[1]) best = entry;
    return { quadrant: best[0], count: best[1] };
  }, [goingQuiet, geo]);

  const filterByRing = useCallback((ring: typeof RING_BANDS[number]) => {
    const max = Number.isFinite(ring.max) ? ring.max : 100;
    setBenchFitFilter({ min: Math.max(0, ring.min), max, label: ring.label });
    navigate('/bench');
  }, [setBenchFitFilter, navigate]);

  const addCooled = async () => {
    setAddBusy(true);
    try {
      await addCooledToToday(driftSummary.cooledIds, driftSummary.monthLabel);
      setAddedThisSession(true);
      push(`Added ${driftSummary.cooledSince} to Today — reason logged as "cooled since ${driftSummary.monthLabel}".`, { tone: 'success' });
    } finally {
      setAddBusy(false);
    }
  };

  const subLine = !role
    ? 'Pick a role from the top bar to see who to contact.'
    : quietQuadrant
      ? `Closer to the middle = better fit. Around the clock = how long since you spoke; top is this week, bottom is six months ago. ${quietQuadrant.count} people sit ${quietQuadrant.quadrant}: strong fit, going quiet.`
      : 'Closer to the middle = better fit. Around the clock = how long since you spoke; top is this week, bottom is six months ago. Nobody strong is going quiet right now.';

  return (
    <section aria-label="The Target" className="smhq-ink" style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column' }}>
      <header className="smhq-target-header">
        <h2>Who to contact for {role ? role.title : 'a role'}?</h2>
        <p className="smhq-muted smhq-target-subline">{subLine}</p>
      </header>

      {role && points.length > 0 && (
        <div className="smhq-target-legend" aria-hidden="true">
          {RING_BANDS.map(ring => (
            <button key={ring.key} type="button" className="smhq-target-legend-ring" onClick={() => filterByRing(ring)}>
              <span className={`smhq-target-legend-swatch smhq-target-ring-${ring.key}`} />
              {ring.label}
            </button>
          ))}
          <span className="smhq-target-legend-sep" />
          <span className="smhq-target-legend-tick">Top of the clock: spoke this week</span>
          <span className="smhq-target-legend-tick">Bottom: six months ago</span>
        </div>
      )}

      <div ref={containerRef} style={{ position: 'relative', minHeight: 0, flex: 1, overflow: 'hidden' }}>
        {!role && (
          <p className="smhq-muted" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textAlign: 'center', padding: 24 }}>
            Pick a role from the top bar to plot who's worth a message.
          </p>
        )}
        {role && points.length === 0 && (
          <p className="smhq-muted" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, textAlign: 'center', padding: 24 }}>
            No scored candidates yet — sync the bench for this role.
          </p>
        )}

        {role && points.length > 0 && (
          <svg
            role="img"
            aria-label={`Target for ${role.title}: ${shown.length} candidates by fit and time since contact`}
            width={size.width}
            height={size.height}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (!activeId && rankedByFit.length) setActiveId(rankedByFit[0].id); }}
            className="smhq-focus-ring"
          >
            {/* Ring guides */}
            <g className="smhq-target-rings">
              <circle cx={geo.cx} cy={geo.cy} r={geo.rOuter} className="smhq-target-ring-line" />
              <circle cx={geo.cx} cy={geo.cy} r={geo.rPossible} className="smhq-target-ring-line" />
              <circle cx={geo.cx} cy={geo.cy} r={geo.rStrong} className="smhq-target-ring-line smhq-target-ring-line-strong" />
              {/* 12 o'clock / 6 o'clock ticks */}
              <line x1={geo.cx} y1={geo.cy - geo.rOuter - 6} x2={geo.cx} y2={geo.cy - geo.rOuter + 6} className="smhq-target-tick" />
              <line x1={geo.cx} y1={geo.cy + geo.rOuter - 6} x2={geo.cx} y2={geo.cy + geo.rOuter + 6} className="smhq-target-tick" />
              <text x={geo.cx} y={geo.cy - geo.rOuter - 12} textAnchor="middle" className="smhq-target-tick-label">this week</text>
              <text x={geo.cx} y={geo.cy + geo.rOuter + 20} textAnchor="middle" className="smhq-target-tick-label">6 months</text>
            </g>

            <g ref={trailsRef} />
            <g ref={gRef} />

            {labelled.map(p => {
              const shownP = shown.find(s => s.id === p.id) ?? p;
              return (
                <text
                  key={p.id}
                  className="smhq-map-point-label"
                  x={shownP.x + shownP.r + 5}
                  y={shownP.y + 3.5}
                  textAnchor={shownP.x > size.width - 130 ? 'end' : 'start'}
                  dx={shownP.x > size.width - 130 ? -(shownP.r * 2 + 10) : 0}
                >
                  {p.name}
                </text>
              );
            })}

            {activePoint && (
              <circle cx={activePoint.x} cy={activePoint.y} r={activePoint.r + 4} fill="none" stroke="var(--ink-strong)" strokeWidth={2} />
            )}
          </svg>
        )}

        {shownTooltip && <MapTooltip point={shownTooltip} x={shownTooltip.x} y={shownTooltip.y} />}

        <p className="sr-only" aria-live="polite">
          {activePoint ? `${activePoint.name}, fit ${Math.round(activePoint.fit)}, ${activePoint.warmthDays} days since touch` : ''}
        </p>
      </div>

      {role && points.length > 0 && (
        <DriftControls
          monthsAgo={monthsAgo}
          onScrub={setMonthsAgo}
          onRelease={() => setMonthsAgo(0)}
          summary={driftSummary}
          onAddCooled={addCooled}
          addBusy={addBusy}
          addedThisSession={addedThisSession}
        />
      )}
    </section>
  );
}
