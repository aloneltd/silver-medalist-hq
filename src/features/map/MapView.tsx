import { useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { dataService } from '../../services/dataService';
import type { Candidate, Match } from '../../types';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { usePrefersReducedMotion } from '../bench/lib/motion';
import { cx, token } from '../bench/lib/tokens';
import { buildPoints, DEFAULT_MARGINS, type MapPoint } from './lib/geometry';
import { MapTooltip } from './MapTooltip';

export interface MapViewProps {
  /** Omit to plot against the shell's currently-selected role (top-bar role picker). */
  roleId?: string;
}

/** Stable empty-array references so a `?? []` fallback doesn't defeat memoization every render. */
const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_MATCHES: Match[] = [];

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 640, height: 420 });
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
 * Deterministic scatter (x = fit, y = days since touch, size = seniority, colour = status).
 * Point positions are computed with d3-scale; the D3-owned <g> below drives entry/update
 * transitions with d3-transition. No force layout, no framer-motion in this file — per
 * BLUEPRINT-v2.md "The Map is a chart, not a simulation" and council/designer.md.
 */
export function MapView({ roleId: roleIdProp }: MapViewProps = {}) {
  const { selectedRoleId } = useAppUI();
  const roleId = roleIdProp ?? selectedRoleId ?? undefined;
  const { openCandidate } = useDossierLink();

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

  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { points, maxDays } = useMemo(
    () => buildPoints(candidates, matchesByCandidate, size.width, size.height),
    [candidates, matchesByCandidate, size.width, size.height],
  );

  // D3 general-update-pattern: this effect fully owns the <g> subtree's circles.
  useEffect(() => {
    if (!gRef.current) return;
    const duration = reduced ? 0 : 300;

    const sel = select(gRef.current)
      .selectAll<SVGCircleElement, MapPoint>('circle.point')
      .data(points, d => d.id);

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
      .style('opacity', 1)
      .style('fill', d => d.color);
  }, [points, reduced, openCandidate]);

  // Keyboard focus ring — a thin React-driven overlay circle kept in sync with `activeId`,
  // separate from the D3-owned data circles so React and D3 never fight the same nodes.
  const activePoint = points.find(p => p.id === activeId) ?? null;
  const hoveredPoint = points.find(p => p.id === hoveredId) ?? null;
  const shownTooltip = hoveredPoint ?? activePoint;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!points.length) return;
    if (e.key === 'Enter' && activeId) {
      e.preventDefault();
      openCandidate(activeId);
      return;
    }
    const dirs: Record<string, [number, number]> = {
      ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1],
    };
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();

    const current = activePoint ?? points[0];
    if (!activePoint) { setActiveId(current.id); return; }

    let best: MapPoint | null = null;
    let bestScore = Infinity;
    for (const p of points) {
      if (p.id === current.id) continue;
      const dx = p.x - current.x;
      const dy = p.y - current.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0.5) continue; // must be strictly ahead in the requested direction
      const perpendicular = Math.abs(dx * dir[1] - dy * dir[0]);
      const score = along + perpendicular * 2; // penalize being off-axis more than being far
      if (score < bestScore) { bestScore = score; best = p; }
    }
    if (best) setActiveId(best.id);
  };

  const quadX = size.width / 2;
  const quadY = size.height / 2;

  return (
    <section aria-label="Map" className={`flex h-full min-h-0 flex-col ${cx.ink}`}>
      <header className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: token.border }}>
        <h2 className="text-sm font-semibold">Map{role ? ` — ${role.title}` : ''}</h2>
        {!roleId && <span className={`text-sm ${cx.muted}`}>Pick a role to plot fit.</span>}
      </header>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {roleId && points.length === 0 && (
          <p className={`absolute inset-0 flex items-center justify-center text-sm ${cx.muted}`}>
            No scored candidates yet — sync the bench for this role.
          </p>
        )}

        <svg
          role="img"
          aria-label={`Scatter of ${points.length} candidates by fit and days since last touch`}
          width={size.width}
          height={size.height}
          tabIndex={points.length ? 0 : -1}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (!activeId && points.length) setActiveId(points[0].id); }}
          className={cx.focusRing}
        >
          {/* axes */}
          <line x1={DEFAULT_MARGINS.left} y1={size.height - DEFAULT_MARGINS.bottom} x2={size.width - DEFAULT_MARGINS.right} y2={size.height - DEFAULT_MARGINS.bottom} stroke="#262c34" />
          <line x1={DEFAULT_MARGINS.left} y1={DEFAULT_MARGINS.top} x2={DEFAULT_MARGINS.left} y2={size.height - DEFAULT_MARGINS.bottom} stroke="#262c34" />
          <text x={size.width / 2} y={size.height - 10} textAnchor="middle" fontSize={11} fill="var(--muted,#8b95a1)">Fit for {role?.title ?? 'role'} →</text>
          <text x={14} y={size.height / 2} textAnchor="middle" fontSize={11} fill="var(--muted,#8b95a1)" transform={`rotate(-90 14 ${size.height / 2})`}>← Days since touch</text>

          {/* quadrant divider + labels */}
          <line x1={quadX} y1={DEFAULT_MARGINS.top} x2={quadX} y2={size.height - DEFAULT_MARGINS.bottom} stroke="#262c34" strokeDasharray="4 4" />
          <line x1={DEFAULT_MARGINS.left} y1={quadY} x2={size.width - DEFAULT_MARGINS.right} y2={quadY} stroke="#262c34" strokeDasharray="4 4" />
          <text x={size.width - DEFAULT_MARGINS.right} y={DEFAULT_MARGINS.top + 12} textAnchor="end" fontSize={11} fill="var(--accent,#35e0c8)">Contact now</text>
          <text x={DEFAULT_MARGINS.left} y={DEFAULT_MARGINS.top + 12} textAnchor="start" fontSize={11} fill="var(--muted,#8b95a1)">Not a fit yet</text>
          <text x={size.width - DEFAULT_MARGINS.right} y={size.height - DEFAULT_MARGINS.bottom - 6} textAnchor="end" fontSize={11} fill="var(--amber,#f5b53f)">Re-warm</text>
          <text x={DEFAULT_MARGINS.left} y={size.height - DEFAULT_MARGINS.bottom - 6} textAnchor="start" fontSize={11} fill="var(--muted,#8b95a1)">Low priority</text>

          <g ref={gRef} />

          {activePoint && (
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r={activePoint.r + 4}
              fill="none"
              stroke="var(--ink,#e8ecef)"
              strokeWidth={2}
            />
          )}
        </svg>

        {shownTooltip && <MapTooltip point={shownTooltip} x={shownTooltip.x} y={shownTooltip.y} />}

        <p className="sr-only" aria-live="polite">
          {activePoint
            ? `${activePoint.name}, fit ${Math.round(activePoint.fit)}, ${activePoint.days} days since touch`
            : maxDays >= 0 ? '' : ''}
        </p>
      </div>
    </section>
  );
}
