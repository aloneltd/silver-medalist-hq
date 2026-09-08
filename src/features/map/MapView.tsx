import { useEffect, useMemo, useRef, useState } from 'react';
import { select } from 'd3-selection';
import 'd3-transition';
import { dataService } from '../../services/dataService';
import type { Candidate, Match } from '../../types';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { usePrefersReducedMotion } from '../bench/lib/motion';
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
  const innerLeft = DEFAULT_MARGINS.left;
  const innerTop = DEFAULT_MARGINS.top;
  const innerRight = size.width - DEFAULT_MARGINS.right;
  const innerBottom = size.height - DEFAULT_MARGINS.bottom;

  // Only the five strongest fits get a name on the chart. Labelling all sixty would be noise;
  // labelling none makes the reader hover blind to find the point that matters.
  const labelled = useMemo(
    () => [...points].sort((a, b) => b.fit - a.fit).slice(0, 5),
    [points],
  );

  return (
    <section aria-label="Map" className="smhq-ink" style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column' }}>
      <header
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--panel-border)', padding: '10px 14px' }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>Map{role ? ` — ${role.title}` : ''}</h2>
        {!roleId && <span className="smhq-muted" style={{ fontSize: 13 }}>Pick a role to plot fit.</span>}
      </header>

      <div ref={containerRef} style={{ position: 'relative', minHeight: 0, flex: 1, overflow: 'hidden' }}>
        {roleId && points.length === 0 && (
          <p className="smhq-muted" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
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
          className="smhq-focus-ring"
        >
          {/* Quadrant washes at 4% — enough to read the four regions as regions, never enough
              to compete with the points themselves. */}
          <g className="smhq-map-quadrant">
            <rect x={quadX} y={innerTop} width={Math.max(0, innerRight - quadX)} height={Math.max(0, quadY - innerTop)}
              fill="var(--accent)" opacity={0.04} />
            <rect x={quadX} y={quadY} width={Math.max(0, innerRight - quadX)} height={Math.max(0, innerBottom - quadY)}
              fill="var(--amber)" opacity={0.04} />
            <rect x={innerLeft} y={innerTop} width={Math.max(0, quadX - innerLeft)} height={Math.max(0, quadY - innerTop)}
              fill="var(--ink-muted)" opacity={0.03} />
            <rect x={innerLeft} y={quadY} width={Math.max(0, quadX - innerLeft)} height={Math.max(0, innerBottom - quadY)}
              fill="var(--ink-muted)" opacity={0.02} />
          </g>

          {/* axes */}
          <line className="smhq-map-axis" x1={innerLeft} y1={innerBottom} x2={innerRight} y2={innerBottom} />
          <line className="smhq-map-axis" x1={innerLeft} y1={innerTop} x2={innerLeft} y2={innerBottom} />
          <text className="smhq-map-label" x={size.width / 2} y={size.height - 10} textAnchor="middle">Fit for {role?.title ?? 'role'} →</text>
          <text className="smhq-map-label" x={14} y={size.height / 2} textAnchor="middle" transform={`rotate(-90 14 ${size.height / 2})`}>← Days since touch</text>

          {/* quadrant divider + labels */}
          <line className="smhq-map-axis" x1={quadX} y1={innerTop} x2={quadX} y2={innerBottom} strokeDasharray="4 4" />
          <line className="smhq-map-axis" x1={innerLeft} y1={quadY} x2={innerRight} y2={quadY} strokeDasharray="4 4" />
          <text className="smhq-map-quadlabel" x={innerRight} y={innerTop + 12} textAnchor="end" fill="var(--accent)">Contact now</text>
          <text className="smhq-map-quadlabel" x={innerLeft} y={innerTop + 12} textAnchor="start" fill="var(--ink-faint)">Not a fit yet</text>
          <text className="smhq-map-quadlabel" x={innerRight} y={innerBottom - 6} textAnchor="end" fill="var(--amber)">Re-warm</text>
          <text className="smhq-map-quadlabel" x={innerLeft} y={innerBottom - 6} textAnchor="start" fill="var(--ink-faint)">Low priority</text>

          <g ref={gRef} />

          {labelled.map(p => (
            <text
              key={p.id}
              className="smhq-map-point-label"
              x={p.x + p.r + 5}
              y={p.y + 3.5}
              textAnchor={p.x > size.width - 130 ? 'end' : 'start'}
              dx={p.x > size.width - 130 ? -(p.r * 2 + 10) : 0}
            >
              {p.name}
            </text>
          ))}

          {activePoint && (
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r={activePoint.r + 4}
              fill="none"
              stroke="var(--ink-strong)"
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
