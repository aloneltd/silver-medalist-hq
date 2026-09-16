import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search, X, Users, Briefcase, Target, Inbox as InboxIcon, KanbanSquare, Link2,
  Sparkles, ClipboardPaste, Moon, Sun, type LucideIcon,
} from 'lucide-react';
import { db } from '../../db';
import type { Candidate, Process, Role } from '../../types';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { looksLikeNaturalLanguage } from '../../app/nlDetect';
import { dataService } from '../../services/dataService';
import { useHelp } from '../help/HelpProvider';
import { spokeLabel, statusPhrase, storyLine } from '../lib/personText';
import { Avatar } from '../ui';
import { AskPlanPreview } from './AskPlanPreview';
import './ask.css';

const EXAMPLES = [
  'snooze everyone I spoke to this year until March',
  'show me strong fits for Staff SRE who went quiet',
  'tag the Klarna people as fintech',
];

// Stable references for useLiveQuery's `defaultResult` — a fresh `[]` literal at the call
// site defeats memoization downstream (react-hooks/exhaustive-deps flags every consumer).
const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_ROLES: Role[] = [];
const EMPTY_PROCESSES: Process[] = [];

/** Debounces a fast-changing value — used for FIND filtering, never for the input itself. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function fieldScore(value: string | undefined, q: string): number {
  if (!value) return 0;
  const v = value.toLowerCase();
  if (v === q) return 100;
  if (v.startsWith(q)) return 85;
  if (v.includes(q)) return 55;
  return 0;
}
function candidateScore(c: Candidate, q: string): number {
  const name = fieldScore(c.name, q);
  if (name) return 300 + name;
  const title = fieldScore(c.currentTitle, q);
  const employer = fieldScore(c.currentEmployer, q);
  const skill = c.skills.reduce((best, s) => Math.max(best, fieldScore(s, q)), 0);
  const loc = fieldScore(c.location, q) * 0.5;
  return Math.max(title, employer, skill, loc);
}
function roleScore(r: Role, q: string): number {
  const title = fieldScore(r.title, q);
  if (title) return 300 + title;
  const team = fieldScore(r.team, q);
  const loc = fieldScore(r.location, q);
  return Math.max(team, loc);
}

type AskItem =
  | { id: string; section: 'people'; candidate: Candidate; story: string; meta: string }
  | { id: string; section: 'roles'; role: Role; sub: string }
  | { id: string; section: 'jump'; label: string; hint?: string; icon: LucideIcon; run: () => void };

/**
 * ⌘K, renamed Ask (DESIGN-v3.md). Three jobs, one input: FIND a person/role by name, company,
 * skill or title (local, debounced, no network); JUMP with a short fixed set of commands; or
 * ASK IN PLAIN WORDS, which hands off to AskPlanPreview for the plan-preview-then-apply
 * contract in src/services/nlCommand.ts. The shell renders this unconditionally and lazily —
 * it owns its own open state from the store and renders nothing while closed.
 */
export function AskPalette() {
  const {
    paletteOpen, setPaletteOpen, theme, toggleTheme, openPasteRole,
    selectedRoleId, setSelectedRoleId, openComposer,
  } = useAppUI();
  const { openCandidate } = useDossierLink();
  const { startTour } = useHelp();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [liveMessage, setLiveMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const nlMode = looksLikeNaturalLanguage(query);
  const debouncedQuery = useDebounced(query, 100);

  const candidates = useLiveQuery(
    () => (paletteOpen ? db.candidates.toArray() : Promise.resolve([] as Candidate[])),
    [paletteOpen], EMPTY_CANDIDATES,
  );
  const roles = useLiveQuery(
    () => (paletteOpen ? db.roles.toArray() : Promise.resolve([] as Role[])),
    [paletteOpen], EMPTY_ROLES,
  );
  const processes = useLiveQuery(
    () => (paletteOpen ? db.processes.toArray() : Promise.resolve([] as Process[])),
    [paletteOpen], EMPTY_PROCESSES,
  );

  // Sets the query and always resets the highlighted row with it — the one place either
  // changes, so there is nothing left to reconcile in an effect (react-hooks/set-state-in-effect).
  const updateQuery = (value: string) => { setQuery(value); setActiveIndex(0); };

  // Open/close: focus the input in, return focus to whatever opened us on the way out. The
  // state resets are deferred a microtask so the effect body itself never calls setState
  // synchronously (react-hooks/set-state-in-effect) — same pattern as the v2.1 NL palette.
  useEffect(() => {
    if (paletteOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      let cancelled = false;
      queueMicrotask(() => { if (!cancelled) { setQuery(''); setActiveIndex(0); } });
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => { cancelled = true; clearTimeout(t); };
    }
    previouslyFocused.current?.focus?.();
    return undefined;
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setPaletteOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setPaletteOpen]);

  const close = () => setPaletteOpen(false);

  const jumpCommands = useMemo<AskItem[]>(() => [
    { id: 'jump-people', section: 'jump', label: 'People', hint: 'Everyone who came close', icon: Users, run: () => navigate('/people') },
    { id: 'jump-roles', section: 'jump', label: 'Roles', hint: 'Open roles and their shortlists', icon: Briefcase, run: () => navigate('/roles') },
    { id: 'jump-sources', section: 'jump', label: 'Sources', hint: 'Where people come in from', icon: Target, run: () => navigate('/sources') },
    { id: 'jump-team', section: 'jump', label: 'Team', hint: 'Teammates, invites, the Inbox', icon: Users, run: () => navigate('/team') },
    { id: 'jump-inbox', section: 'jump', label: 'Inbox', hint: 'People waiting for a decision', icon: InboxIcon, run: () => navigate('/inbox') },
    { id: 'jump-board', section: 'jump', label: 'Board', hint: 'Who is in conversation right now', icon: KanbanSquare, run: () => navigate('/board') },
    { id: 'jump-connections', section: 'jump', label: 'Connections', hint: 'Outlook, Drive, export and reset', icon: Link2, run: () => navigate('/connections') },
    { id: 'jump-tour', section: 'jump', label: 'Start the tour', hint: 'The two-minute walkthrough', icon: Sparkles, run: () => startTour() },
    { id: 'jump-paste-role', section: 'jump', label: 'Paste a role', hint: 'Rank the bench against a new job', icon: ClipboardPaste, run: () => openPasteRole() },
    {
      id: 'jump-theme', section: 'jump',
      label: theme === 'paper' ? 'Switch to dark theme' : 'Switch to Paper theme',
      icon: theme === 'paper' ? Moon : Sun,
      run: () => toggleTheme(),
    },
  ], [navigate, startTour, openPasteRole, toggleTheme, theme]);

  const q = debouncedQuery.trim().toLowerCase();
  const showFind = !nlMode && q.length > 0;

  const peopleItems = useMemo<AskItem[]>(() => {
    if (!showFind) return [];
    return candidates
      .map(c => ({ c, score: candidateScore(c, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
      .slice(0, 8)
      .map(({ c }) => ({
        id: `p-${c.id}`,
        section: 'people' as const,
        candidate: c,
        story: storyLine(c, processes, roles),
        meta: statusPhrase(c) ?? spokeLabel(dataService.computeWarmthDays(c.warmthAt)),
      }));
  }, [showFind, candidates, processes, roles, q]);

  const roleItems = useMemo<AskItem[]>(() => {
    if (!showFind) return [];
    return roles
      .map(r => ({ r, score: roleScore(r, q) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title))
      .slice(0, 5)
      .map(({ r }) => ({
        id: `r-${r.id}`,
        section: 'roles' as const,
        role: r,
        sub: [r.level, r.location, r.status === 'open' ? 'open' : r.status].filter(Boolean).join(' · '),
      }));
  }, [showFind, roles, q]);

  const filteredCommands = useMemo<AskItem[]>(() => {
    if (nlMode) return [];
    if (!q) return jumpCommands;
    return jumpCommands.filter(item => item.section === 'jump' && item.label.toLowerCase().includes(q));
  }, [nlMode, q, jumpCommands]);

  const flatItems = useMemo<AskItem[]>(
    () => [...peopleItems, ...roleItems, ...filteredCommands],
    [peopleItems, roleItems, filteredCommands],
  );

  // Derived, not stored — computing it during render (rather than syncing it via an effect)
  // is what react-hooks/set-state-in-effect is steering toward. `liveMessage` state stays
  // reserved for the NL plan preview, whose count arrives async from a child component.
  const findLiveMessage = nlMode || !q
    ? ''
    : (peopleItems.length + roleItems.length) === 0
      ? 'No matches.'
      : `${peopleItems.length + roleItems.length} ${peopleItems.length + roleItems.length === 1 ? 'match' : 'matches'}.`;

  function runItem(item: AskItem | undefined) {
    if (!item) return;
    if (item.section === 'people') { openCandidate(item.candidate.id); close(); return; }
    if (item.section === 'roles') { setSelectedRoleId(item.role.id); navigate('/roles'); close(); return; }
    item.run();
    close();
  }

  if (!paletteOpen) return null;

  return createPortal(
    <div className="ask-layer" role="presentation">
      <div className="ask-scrim" onClick={close} />
      <div className="ask-dialog" role="dialog" aria-modal="true" aria-label="Ask">
        <div className="ask-input-row">
          <Search size={18} className="ask-input-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="ask-input"
            value={query}
            onChange={e => updateQuery(e.target.value)}
            onKeyDown={e => {
              if (nlMode) return; // AskPlanPreview owns Enter/⌘⏎ while a plan is showing.
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(flatItems.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); runItem(flatItems[activeIndex]); }
            }}
            placeholder="Ask anything, or find a person…"
            role="combobox"
            aria-expanded="true"
            aria-controls="ask-listbox"
            aria-autocomplete="list"
            aria-activedescendant={!nlMode ? flatItems[activeIndex]?.id : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {nlMode && <span className="ask-mode-badge">Plain words</span>}
          <button type="button" className="p-x" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="sr-only" role="status" aria-live="polite">{nlMode ? liveMessage : findLiveMessage}</div>

        <div className="ask-body" id="ask-listbox" role={nlMode ? undefined : 'listbox'} aria-label="Ask results">
          {nlMode ? (
            <AskPlanPreview
              query={query}
              roleId={selectedRoleId ?? undefined}
              candidates={candidates}
              roles={roles}
              processes={processes}
              onOpenCandidate={id => { openCandidate(id); close(); }}
              onCompose={(candidateId, roleId, tone) => { openComposer({ candidateId, roleId, tone }); close(); }}
              onDone={close}
              onAnnounce={setLiveMessage}
            />
          ) : (
            <>
              {!q && (
                <>
                  <div className="ask-lede">Type a name, a company, a skill or a role — or ask in plain words.</div>
                  <div className="ask-examples">
                    <div className="ask-section-label">Try asking</div>
                    <div className="ask-examples-list">
                      {EXAMPLES.map(ex => (
                        <button
                          key={ex}
                          type="button"
                          className="ask-example"
                          onClick={() => { updateQuery(ex); inputRef.current?.focus(); }}
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {peopleItems.length > 0 && (
                <AskSection label="People">
                  {peopleItems.map(item => item.section === 'people' && (
                    <li
                      key={item.id}
                      id={item.id}
                      role="option"
                      aria-selected={flatItems[activeIndex]?.id === item.id}
                      className={`ask-row${flatItems[activeIndex]?.id === item.id ? ' ask-row-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(flatItems.indexOf(item))}
                      onClick={() => runItem(item)}
                    >
                      <Avatar name={item.candidate.name} size="sm" />
                      <div className="ask-row-main">
                        <div className="ask-row-name">{item.candidate.name}</div>
                        <div className="ask-row-story">{item.story}</div>
                      </div>
                      <div className="ask-row-meta">{item.meta}</div>
                    </li>
                  ))}
                </AskSection>
              )}

              {roleItems.length > 0 && (
                <AskSection label="Roles">
                  {roleItems.map(item => item.section === 'roles' && (
                    <li
                      key={item.id}
                      id={item.id}
                      role="option"
                      aria-selected={flatItems[activeIndex]?.id === item.id}
                      className={`ask-row${flatItems[activeIndex]?.id === item.id ? ' ask-row-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(flatItems.indexOf(item))}
                      onClick={() => runItem(item)}
                    >
                      <div className="ask-role-icon"><Briefcase size={16} aria-hidden="true" /></div>
                      <div className="ask-row-main">
                        <div className="ask-row-name">{item.role.title}</div>
                        <div className="ask-row-story">{item.sub}</div>
                      </div>
                    </li>
                  ))}
                </AskSection>
              )}

              {filteredCommands.length > 0 && (
                <AskSection label="Jump to">
                  {filteredCommands.map(item => item.section === 'jump' && (
                    <li
                      key={item.id}
                      id={item.id}
                      role="option"
                      aria-selected={flatItems[activeIndex]?.id === item.id}
                      className={`ask-row${flatItems[activeIndex]?.id === item.id ? ' ask-row-active' : ''}`}
                      onMouseEnter={() => setActiveIndex(flatItems.indexOf(item))}
                      onClick={() => runItem(item)}
                    >
                      <div className="ask-jump-icon"><item.icon size={16} aria-hidden="true" /></div>
                      <div className="ask-row-main">
                        <div className="ask-row-name">{item.label}</div>
                        {item.hint && <div className="ask-row-story">{item.hint}</div>}
                      </div>
                    </li>
                  ))}
                </AskSection>
              )}

              {q && flatItems.length === 0 && (
                <div className="ask-empty">Nothing matches "{query}". Try a different name, company or skill.</div>
              )}
            </>
          )}
        </div>

        {!nlMode && (
          <div className="ask-footer">
            <span>↑↓ move · ↵ open · esc close</span>
            <span>⌘K to toggle Ask</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function AskSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="ask-section-label">{label}</div>
      <ul className="ask-section-list" role="group" aria-label={label}>{children}</ul>
    </div>
  );
}
