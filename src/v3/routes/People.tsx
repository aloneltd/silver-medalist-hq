/**
 * People — owned by builder B3. Cards or a dense list, grouped by fit band for the selected
 * role; the Target as a side chart or full width; keyboard navigation; the filter pills honour
 * both a local status pick and the shared `benchFitFilter` the Target's ring clicks (on this
 * screen or anywhere else) write into src/app/store.tsx.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { dataService, computeWarmthDays } from '../../services/dataService';
import { snoozeCandidate } from '../../features/bench/lib/actions';
import { RING_BANDS } from '../../features/map/lib/geometry';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { useHelpKey } from '../help/HelpProvider';
import { Btn, BtnLink, Card, Empty, Skel, Term } from '../ui';
import { useToast } from '../../ui';
import { PersonCard, type PersonCardAction } from '../people/PersonCard';
import { Target, type TargetFilter } from '../people/Target';
import { fitBand, fitFor, fitPhrase, isOffLimits, sourceLabel, spokeLabel, storyLine } from '../lib/personText';
import { V3_SETTINGS_KEYS, type Candidate, type Match, type Process, type Role } from '../../types';
import '../people/people.css';

type PeopleLayout = 'cards' | 'list' | 'target';
type StatusFilterKind = 'quiet' | 'took_role' | 'do_not';

const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_PROCESSES: Process[] = [];
const EMPTY_MATCHES: Match[] = [];
const WEEK_MS = 7 * 86_400_000;
const QUIET_DAYS = 60;
const GROUP_PAGE = 5;
const FLAT_PAGE = 10;

const STATUS_FILTER_LABEL: Record<StatusFilterKind, string> = {
  quiet: 'Quiet for 2+ months',
  took_role: 'Took a job',
  do_not: 'Do not approach',
};

const STRONG_RING_LABEL = RING_BANDS.find(r => r.key === 'strong')?.label ?? 'Strong fit 80+';
const POSSIBLE_RING_LABEL = RING_BANDS.find(r => r.key === 'possible')?.label ?? 'Possible 60–79';

/** Mirrors `Target`'s ring-band bounds: `max >= 100` reads as "and up", everything else is a
 * strict upper bound — the same rule that keeps the 80-fit boundary from landing in two bands
 * at once. */
function inFilterRange(fit: number, filter: TargetFilter): boolean {
  return fit >= filter.min && (filter.max >= 100 ? fit <= 100 : fit < filter.max);
}

interface Row { candidate: Candidate; fit: number | null }

function sortByFitDesc(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1));
}

export function People() {
  useHelpKey('people');
  const [params, setParams] = useSearchParams();
  const { selectedRoleId, setSelectedRoleId, roles, benchFitFilter, setBenchFitFilter, openComposer, openPasteRole } = useAppUI();
  const { openCandidate } = useDossierLink();
  const { push } = useToast();

  const candidatesRaw = dataService.hooks.useCandidates();
  const candidates = candidatesRaw ?? EMPTY_CANDIDATES;
  const candidatesLoading = candidatesRaw === undefined;
  const processes = useLiveQuery(() => db.processes.toArray(), []) ?? EMPTY_PROCESSES;
  const roleMatches = dataService.hooks.useMatchesForRole(selectedRoleId ?? undefined) ?? EMPTY_MATCHES;
  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null;

  const layout = (dataService.hooks.useSetting<PeopleLayout>(V3_SETTINGS_KEYS.peopleLayout, 'cards') ?? 'cards');
  const setLayout = (l: PeopleLayout) => { void dataService.setSetting(V3_SETTINGS_KEYS.peopleLayout, l); };

  const [statusFilter, setStatusFilter] = useState<StatusFilterKind | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);

  // A link from Home (`/people?fit=strong&roleId=…`) pre-loads the role and the filter, once.
  useEffect(() => {
    const roleId = params.get('roleId');
    if (roleId) setSelectedRoleId(roleId);
    const fitParam = params.get('fit');
    if (fitParam === 'strong' || fitParam === 'possible') {
      const ring = RING_BANDS.find(r => r.key === fitParam);
      if (ring) setBenchFitFilter({ min: Math.max(0, ring.min), max: Number.isFinite(ring.max) ? ring.max : 100, label: ring.label });
    }
    if (roleId || fitParam) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Row[] = useMemo(
    () => candidates.map(c => ({ candidate: c, fit: fitFor(c.id, roleMatches) })),
    [candidates, roleMatches],
  );

  const counts = useMemo(() => {
    let strong = 0, possible = 0, quiet = 0, tookRole = 0, doNot = 0;
    for (const { candidate: c, fit } of rows) {
      if (isOffLimits(c)) doNot++;
      else if (c.status === 'took_role') tookRole++;
      else if (c.status === 'silent' && computeWarmthDays(c.warmthAt) >= QUIET_DAYS) quiet++;
      if (fit != null) {
        const band = fitBand(fit);
        if (band === 'strong') strong++;
        else if (band === 'possible') possible++;
      }
    }
    return { strong, possible, quiet, tookRole, doNot };
  }, [rows]);

  const selectFitPill = (key: 'strong' | 'possible') => {
    setStatusFilter(null);
    const ring = RING_BANDS.find(r => r.key === key)!;
    if (benchFitFilter?.label === ring.label) { setBenchFitFilter(null); return; }
    setBenchFitFilter({ min: Math.max(0, ring.min), max: Number.isFinite(ring.max) ? ring.max : 100, label: ring.label });
  };
  const selectStatusPill = (kind: StatusFilterKind) => {
    setBenchFitFilter(null);
    setStatusFilter(f => (f === kind ? null : kind));
  };
  const clearFilter = () => { setBenchFitFilter(null); setStatusFilter(null); };

  const activeFilterLabel = benchFitFilter?.label ?? (statusFilter ? STATUS_FILTER_LABEL[statusFilter] : null);

  const passesActiveFilter = (row: Row): boolean => {
    if (benchFitFilter) return row.fit != null && inFilterRange(row.fit, benchFitFilter);
    if (statusFilter === 'quiet') return row.candidate.status === 'silent' && computeWarmthDays(row.candidate.warmthAt) >= QUIET_DAYS;
    if (statusFilter === 'took_role') return row.candidate.status === 'took_role';
    if (statusFilter === 'do_not') return isOffLimits(row.candidate);
    return true;
  };

  // ------------------------------------------------------------------------------ sections
  interface Section { key: string; label: string | null; rows: Row[]; total: number }

  const sections: Section[] = useMemo(() => {
    if (activeFilterLabel) {
      const filtered = sortByFitDesc(rows.filter(passesActiveFilter));
      const cap = expanded.has('filtered') ? filtered.length : FLAT_PAGE;
      return [{ key: 'filtered', label: null, rows: filtered.slice(0, cap), total: filtered.length }];
    }
    if (!selectedRoleId) {
      const flat = [...rows].sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));
      const cap = expanded.has('all') ? flat.length : FLAT_PAGE;
      return [{ key: 'all', label: null, rows: flat.slice(0, cap), total: flat.length }];
    }
    const strong = sortByFitDesc(rows.filter(r => r.fit != null && fitBand(r.fit) === 'strong'));
    const possible = sortByFitDesc(rows.filter(r => r.fit != null && fitBand(r.fit) === 'possible'));
    const longShot = sortByFitDesc(rows.filter(r => r.fit != null && fitBand(r.fit) === 'long-shot'));
    const unscored = rows.filter(r => r.fit == null).sort((a, b) => a.candidate.name.localeCompare(b.candidate.name));
    const roleTitle = selectedRole?.title;
    const out: Section[] = [];
    const push2 = (key: string, label: string, list: Row[]) => {
      if (!list.length) return;
      const cap = expanded.has(key) ? list.length : GROUP_PAGE;
      out.push({ key, label, rows: list.slice(0, cap), total: list.length });
    };
    push2('strong', `Strong fit${roleTitle ? ` for ${roleTitle}` : ''} · ${strong.length} people`, strong);
    push2('possible', `Possible fit${roleTitle ? ` for ${roleTitle}` : ''} · ${possible.length} people`, possible);
    push2('long-shot', `Long shot · ${longShot.length} people`, longShot);
    push2('unscored', `Not yet scored${roleTitle ? ` for ${roleTitle}` : ''} · ${unscored.length} people`, unscored);
    return out;
  }, [activeFilterLabel, rows, selectedRoleId, selectedRole, expanded, benchFitFilter, statusFilter]);

  const flatVisible = useMemo(() => sections.flatMap(s => s.rows), [sections]);
  useEffect(() => { setActiveIndex(0); }, [activeFilterLabel, selectedRoleId, layout]);

  // ------------------------------------------------------------------------------- actions
  const remind = (id: string) => {
    void snoozeCandidate(id, new Date(Date.now() + WEEK_MS).toISOString());
    push("We'll remind you in a week.", { tone: 'neutral' });
  };
  const write = (id: string) => openComposer({ candidateId: id, roleId: selectedRoleId ?? undefined });
  const actionFor = (c: Candidate): PersonCardAction =>
    isOffLimits(c) ? { label: 'Remind me then', onClick: () => remind(c.id) } : { label: 'Write a warm note', onClick: () => write(c.id) };

  // ------------------------------------------------------------------------------ keyboard
  useEffect(() => {
    if (layout === 'target') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || !flatVisible.length) return;
      const idx = Math.min(activeIndex, flatVisible.length - 1);
      const active = flatVisible[idx]?.candidate;
      if (!active) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault(); setActiveIndex(i => Math.min(flatVisible.length - 1, i + 1)); break;
        case 'ArrowUp':
          e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); break;
        case 'Enter':
          e.preventDefault(); openCandidate(active.id); break;
        case 'w': case 'W':
          e.preventDefault(); if (!isOffLimits(active)) write(active.id); break;
        case 's': case 'S':
          e.preventDefault(); remind(active.id); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatVisible, activeIndex, layout, selectedRoleId]);

  const total = candidates.length;

  return (
    <div className="p-container">
      <div className="p-spread" style={{ alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 760 }}>
          <h1 className="p-serif p-h1">People</h1>
          <div className="p-lede p-mt-3">{total} people who came close. Pick a role and we sort by who is worth a message.</div>
        </div>
        <div className="p-row p-gap-3 p-wrap">
          <BtnLink to="/sources">Add people</BtnLink>
          <Btn tone="primary" onClick={openPasteRole}>Match a role</Btn>
        </div>
      </div>

      {/* -------------------------------------------------------------------------- controls */}
      <Card pad={false} className="p-controls p-mt-8">
        <span className="p-sec">Ranked for</span>
        <select
          className="p-select"
          style={{ width: 'auto', fontSize: 15 }}
          value={selectedRoleId ?? ''}
          onChange={e => setSelectedRoleId(e.target.value || null)}
          aria-label="Rank people for this role"
        >
          <option value="">Pick a role…</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        <span className="p-controls-sep" aria-hidden="true" />
        <button type="button" className={`p-pill${benchFitFilter?.label === STRONG_RING_LABEL ? ' p-on' : ''}`} onClick={() => selectFitPill('strong')}>Strong fit · {counts.strong}</button>
        <button type="button" className={`p-pill${benchFitFilter?.label === POSSIBLE_RING_LABEL ? ' p-on' : ''}`} onClick={() => selectFitPill('possible')}>Possible · {counts.possible}</button>
        <button type="button" className={`p-pill${statusFilter === 'quiet' ? ' p-on' : ''}`} onClick={() => selectStatusPill('quiet')}>Quiet for 2+ months · {counts.quiet}</button>
        <button type="button" className={`p-pill${statusFilter === 'took_role' ? ' p-on' : ''}`} onClick={() => selectStatusPill('took_role')}>Took a job · {counts.tookRole}</button>
        <button type="button" className={`p-pill${statusFilter === 'do_not' ? ' p-on' : ''}`} onClick={() => selectStatusPill('do_not')}>Do not approach · {counts.doNot}</button>

        <div style={{ marginLeft: 'auto' }}>
          <div className="p-seg" role="group" aria-label="Layout">
            <button type="button" className={layout === 'cards' ? 'p-on' : ''} onClick={() => setLayout('cards')}>Cards</button>
            <button type="button" className={layout === 'list' ? 'p-on' : ''} onClick={() => setLayout('list')}>List</button>
            <button type="button" className={layout === 'target' ? 'p-on' : ''} onClick={() => setLayout('target')}>Target</button>
          </div>
        </div>
      </Card>

      {activeFilterLabel && (
        <div className="p-row p-gap-2 p-mt-3">
          <span className="p-sec">Showing only <span className="p-strong">{activeFilterLabel}</span>.</span>
          <button type="button" className="p-inline-link" onClick={clearFilter}>Clear</button>
        </div>
      )}

      {/* ------------------------------------------------------------------------- main row */}
      <div className="p-row" style={{ gap: 40, marginTop: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          {candidatesLoading ? (
            <div className="p-col p-gap-3">
              <Skel height={96} /><Skel height={96} /><Skel height={96} />
            </div>
          ) : layout === 'target' ? (
            <Target
              role={selectedRole}
              candidates={candidates}
              matches={roleMatches}
              variant="full"
              onOpenCandidate={openCandidate}
              onFilterRing={(f: TargetFilter | null) => { setStatusFilter(null); setBenchFitFilter(f); }}
              activeFilterLabel={benchFitFilter?.label ?? null}
            />
          ) : candidates.length === 0 ? (
            <Empty title="Nobody on the bench yet" action={<BtnLink to="/sources" tone="primary">Add people</BtnLink>}>
              Drop a résumé, a spreadsheet, or an ATS export to get started.
            </Empty>
          ) : flatVisible.length === 0 ? (
            <Empty title="Nobody matches this filter" action={<Btn onClick={clearFilter}>Clear the filter</Btn>}>
              Try a different filter, or pick another role.
            </Empty>
          ) : layout === 'list' ? (
            <PeopleListTable
              rows={flatVisible}
              processes={processes}
              roles={roles}
              activeId={flatVisible[Math.min(activeIndex, flatVisible.length - 1)]?.candidate.id}
              onOpen={openCandidate}
            />
          ) : (
            <div className="p-col p-gap-6">
              {sections.map(section => (
                <div key={section.key} className="p-col p-gap-3">
                  {section.label && <div className="p-group-label">{section.label}</div>}
                  {section.rows.map((row, i) => {
                    const globalIndex = flatVisible.indexOf(row);
                    return (
                      <PersonCard
                        key={row.candidate.id}
                        candidate={row.candidate}
                        processes={processes}
                        roles={roles}
                        matches={roleMatches}
                        fit={row.fit}
                        muted={isOffLimits(row.candidate)}
                        selected={globalIndex === activeIndex}
                        tourAnchors={section.key === (sections[0]?.key) && i === 0}
                        onOpen={() => openCandidate(row.candidate.id)}
                        action={actionFor(row.candidate)}
                      />
                    );
                  })}
                  {section.total > section.rows.length && (
                    <button
                      type="button"
                      className="p-inline-link"
                      style={{ fontWeight: 600 }}
                      onClick={() => setExpanded(prev => new Set(prev).add(section.key))}
                    >
                      Show the other {section.total - section.rows.length} →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --------------------------------------------------------------------- right column */}
        <div style={{ width: 340, flex: 'none', maxWidth: '100%' }} className="p-col p-gap-5">
          {layout !== 'target' && (
            <Target
              role={selectedRole}
              candidates={candidates}
              matches={roleMatches}
              variant="side"
              onOpenCandidate={openCandidate}
              onFilterRing={(f: TargetFilter | null) => { setStatusFilter(null); setBenchFitFilter(f); }}
              activeFilterLabel={benchFitFilter?.label ?? null}
              onExpand={() => setLayout('target')}
            />
          )}

          <Card>
            <div className="p-serif p-h3">Reading this page</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 10 }} className="p-col p-gap-3">
              <div><span className="p-fit"><Term term="fit">Fit</Term></span> is how well a person matches the role you picked, out of 100. Above 80 is strong.</div>
              <div><span className="p-strong"><Term term="lastContact">Spoke</Term></span> is the last time anyone on your team wrote, called or met them.</div>
              <div><span className="p-strong"><Term term="source">From</Term></span> is where they came into the bench. Click it to see the original.</div>
            </div>
          </Card>

          <Card>
            <div className="p-strong">Keyboard</div>
            <div className="p-sec p-mt-2" style={{ lineHeight: 1.9 }}>
              <span className="p-kbd">↑</span> <span className="p-kbd">↓</span> move · <span className="p-kbd">Enter</span> open · <span className="p-kbd">W</span> write · <span className="p-kbd">S</span> snooze
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------- list view */

function PeopleListTable(
  { rows, processes, roles, activeId, onOpen }:
  { rows: Row[]; processes: Process[]; roles: Role[]; activeId?: string; onOpen: (id: string) => void },
) {
  return (
    <div className="p-card p-list-table-wrap">
      <table className="p-list-table">
        <thead>
          <tr>
            <th>Name</th><th>Role</th><th>Fit</th><th>Last contact</th><th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ candidate: c, fit }) => {
            const badge = sourceLabel(c);
            const muted = isOffLimits(c);
            return (
              <tr
                key={c.id}
                className={`${c.id === activeId ? 'p-person-active' : ''}${muted ? ' p-person-muted' : ''}`}
                onClick={() => onOpen(c.id)}
                style={{ cursor: 'pointer' }}
                title={storyLine(c, processes, roles)}
              >
                <td>
                  <div className="p-list-row-name">
                    <div className="p-avatar p-avatar-sm" aria-hidden="true">{c.name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}</div>
                    <span className="p-strong">{c.name}</span>
                  </div>
                </td>
                <td><span className="p-sec">{c.currentTitle} at {c.currentEmployer}</span></td>
                <td>{fit != null ? <span className={muted ? 'p-fit-wait' : 'p-fit'}>{fitPhrase(fit)}</span> : <span className="p-meta">not scored</span>}</td>
                <td className="p-sec">{spokeLabel(computeWarmthDays(c.warmthAt))}</td>
                <td>{badge ? <span className="p-sec">{badge}</span> : <span className="p-meta">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
