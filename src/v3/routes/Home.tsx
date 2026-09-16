/**
 * Home — owned by builder B3. The landing screen: a greeting built from real counts, the Daily
 * Brief as prose, the paste-a-role hero, three doors, and "Worth a message today". Eager-loaded
 * (see src/app/App.tsx), so this file and everything it statically imports stays light — no
 * heavy import engines, no d3.
 */
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { dataService } from '../../services/dataService';
import { computeBriefFacts, type BriefFact, type BriefFactKind } from '../../services/briefFacts';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { useHelp, useHelpKey } from '../help/HelpProvider';
import { HELP } from '../help/helpContent';
import { Btn, BtnLink, Card, Empty, Pill, Skel } from '../ui';
import { useToast } from '../../ui';
import { PersonCard } from '../people/PersonCard';
import { spokeLabel } from '../lib/personText';
import type { Candidate, TodayQueueItem } from '../../types';
import '../people/people.css';

const EMPTY_CANDIDATES: Candidate[] = [];
const EMPTY_FACTS: BriefFact[] = [];
const EMPTY_QUEUE: TodayQueueItem[] = [];

/** settings key, local to Home — persists "snooze the list a week" per BLUEPRINT-v2.md's
 * pattern of scoping one-off UI state under its own settings row rather than a new table. */
const HOME_SNOOZE_KEY = 'v3HomeQueueSnoozeUntil';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function timeOfDay(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'evening';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Up to three names as inline "open the profile" buttons, then "and N more" as plain text —
 * every id traces back to a real candidate on the bench, never a guess. */
function NamesInline({ names, ids, onOpen }: { names: string[]; ids: string[] | undefined; onOpen: (id: string) => void }) {
  const cap = 3;
  const shown = names.slice(0, cap);
  const extra = names.length - shown.length;
  return (
    <>
      {shown.map((n, i) => {
        const id = ids?.[i];
        return (
          <span key={`${n}-${i}`}>
            {i > 0 && ', '}
            {id ? <button type="button" className="p-inline-link" onClick={() => onOpen(id)}>{n}</button> : n}
          </span>
        );
      })}
      {extra > 0 && ` and ${extra} more`}
    </>
  );
}

interface BriefRowCtx {
  openCandidate: (id: string) => void;
  setSelectedRoleId: (id: string | null) => void;
}

const FACT_ACTION_LABEL: Record<BriefFactKind, (f: BriefFact) => string> = {
  resurface_window: () => 'Say hello',
  reply_unanswered: f => `Read the repl${f.count === 1 ? 'y' : 'ies'}`,
  stale_strong: f => `See the ${f.count === 1 ? 'one' : numberWord(f.count)}`,
  best_shortlist: () => 'See the shortlist',
  sequence_due: () => 'Send it',
  placement_this_month: () => 'Open the profile',
};

const FACT_DOT_AMBER: Partial<Record<BriefFactKind, true>> = { stale_strong: true };

function factSentence(f: BriefFact, ctx: BriefRowCtx): ReactNode {
  const names = <NamesInline names={f.names} ids={f.ids} onOpen={ctx.openCandidate} />;
  switch (f.kind) {
    case 'reply_unanswered':
      return <>{names} replied and {f.count === 1 ? 'is' : 'are'} waiting to hear back from you.</>;
    case 'resurface_window':
      return <>{f.count === 1 ? 'A resurface window opens' : 'Resurface windows open'} this week for {names}.</>;
    case 'stale_strong':
      return <>{f.count} strong fit{f.count === 1 ? '' : 's'} {f.count === 1 ? 'has' : 'have'} gone quiet for a month or more: {names}.</>;
    case 'best_shortlist':
      return <>{f.roleTitle ?? 'Your open role'} has its best shortlist yet: {names}.</>;
    case 'sequence_due':
      return <>{f.count} follow-up{f.count === 1 ? '' : 's'} {f.count === 1 ? 'is' : 'are'} due today: {names}.</>;
    case 'placement_this_month':
      return <>{f.count} placement{f.count === 1 ? '' : 's'} landed this month: {names}.</>;
    default:
      return null;
  }
}

function parseFactLink(link: string): { roleId?: string } {
  const params = new URLSearchParams(link.replace(/^\?/, ''));
  return { roleId: params.get('roleId') ?? undefined };
}

function factActionHandler(f: BriefFact, ctx: BriefRowCtx): () => void {
  if (f.kind === 'best_shortlist') {
    const { roleId } = parseFactLink(f.link);
    return () => { if (roleId) ctx.setSelectedRoleId(roleId); };
  }
  const id = f.ids?.[0];
  return id ? () => ctx.openCandidate(id) : () => {};
}

export function Home() {
  useHelpKey('home');
  const { selectedRoleId, setSelectedRoleId, roles, openPasteRole, openComposer, syncPhase, syncProgress } = useAppUI();
  const { openCandidate } = useDossierLink();
  const { openHelp, startTour } = useHelp();
  const { push } = useToast();

  const candidates = dataService.hooks.useCandidates() ?? EMPTY_CANDIDATES;
  const roleMatches = dataService.hooks.useMatchesForRole(selectedRoleId ?? undefined) ?? [];
  const processes = useLiveQuery(() => db.processes.toArray(), []) ?? [];
  const allMatches = useLiveQuery(() => db.matches.toArray(), []);

  const briefList = useLiveQuery(() => computeBriefFacts(selectedRoleId ?? undefined), [selectedRoleId]);
  const facts = briefList?.facts ?? EMPTY_FACTS;

  const snoozeUntil = dataService.hooks.useSetting<string | null>(HOME_SNOOZE_KEY, null) ?? null;
  const isSnoozed = !!snoozeUntil && new Date(snoozeUntil).getTime() > Date.now();

  const rawQueue = dataService.hooks.useTodayQueue(5, selectedRoleId ?? undefined);
  const queue = isSnoozed ? EMPTY_QUEUE : (rawQueue ?? EMPTY_QUEUE);
  const queueLoading = !isSnoozed && rawQueue === undefined;

  const matchByCandidate = useMemo(() => new Map(roleMatches.map(m => [m.candidateId, m])), [roleMatches]);
  const candidateById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);

  // ------------------------------------------------------------------------------ greeting
  const now = new Date();
  const replyFact = facts.find(f => f.kind === 'reply_unanswered');
  const replyName = replyFact?.names[0]?.split(/\s+/)[0];
  const greeting = (() => {
    const intro = `Good ${timeOfDay(now)}.`;
    if (queue.length === 0 && !replyName) {
      return isSnoozed ? `${intro} You've snoozed today's list.` : `${intro} Nothing needs you right now — the bench is quiet.`;
    }
    const who = queue.length === 1 ? 'One person is' : `${numberWord(queue.length)} people are`;
    const base = `${intro} ${queue.length > 0 ? `${who} worth a message today` : `Nothing new to chase today`}`;
    return replyName ? `${base}, and ${replyName} replied.` : `${base}.`;
  })();

  // -------------------------------------------------------------------------- bench stats
  const sourceCount = useMemo(() => new Set(candidates.map(c => c.source?.kind ?? 'sample')).size, [candidates]);
  const openRoleIds = useMemo(() => new Set(roles.filter(r => r.status === 'open').map(r => r.id)), [roles]);
  const strongFitOpenCount = useMemo(() => {
    if (!allMatches) return null;
    const ids = new Set<string>();
    for (const m of allMatches) {
      if (!openRoleIds.has(m.roleId)) continue;
      const score = m.override?.score ?? m.score;
      if (score < 80) continue;
      const cand = candidateById.get(m.candidateId);
      if (cand?.status === 'active') ids.add(m.candidateId);
    }
    return ids.size;
  }, [allMatches, openRoleIds, candidateById]);
  const placementsCount = useMemo(() => processes.filter(p => p.finishedAs === 'placed').length, [processes]);

  const strongForSelectedRole = useMemo(() => {
    let n = 0;
    for (const m of roleMatches) {
      const score = m.override?.score ?? m.score;
      if (score < 80) continue;
      if (candidateById.get(m.candidateId)?.status === 'active') n++;
    }
    return n;
  }, [roleMatches, candidateById]);

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null;

  // --------------------------------------------------------------------------- doors
  const topRolesByFit = useMemo(() => {
    if (!allMatches) return [];
    const byRole = new Map<string, number>();
    for (const m of allMatches) {
      const score = m.override?.score ?? m.score;
      if (score < 80) continue;
      byRole.set(m.roleId, (byRole.get(m.roleId) ?? 0) + 1);
    }
    return roles
      .filter(r => r.status === 'open')
      .map(r => ({ role: r, strong: byRole.get(r.id) ?? 0 }))
      .sort((a, b) => b.strong - a.strong)
      .slice(0, 3);
  }, [allMatches, roles]);

  const sourceKinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of candidates) {
      const kind = c.source?.kind ?? 'sample';
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [candidates]);

  const snoozeQueue = async () => {
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await dataService.setSetting(HOME_SNOOZE_KEY, until);
    push(`Snoozed the list until ${shortDate(until)}.`, { tone: 'neutral', actionLabel: 'Undo', onAction: () => { void dataService.setSetting(HOME_SNOOZE_KEY, null); } });
  };
  const unsnoozeQueue = () => { void dataService.setSetting(HOME_SNOOZE_KEY, null); };

  const progressText = syncPhase === 'syncing' && syncProgress
    ? `Matching your bench — ${syncProgress.scored} scored so far${syncProgress.totalWaves > 1 ? ` (wave ${Math.max(1, syncProgress.wave)} of ${syncProgress.totalWaves})` : ''}…`
    : null;

  return (
    <div className="p-container p-container-home">
      {/* --------------------------------------------------------------- greeting + brief */}
      <div className="p-home-top">
        <div className="p-home-brief">
          <div className="p-meta" style={{ fontSize: 14, color: 'var(--p-ink-2)', marginBottom: 12 }}>
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <h1 className="p-serif p-greeting">{greeting}</h1>

          <div className="p-mt-6" data-tour="brief">
            {facts.length === 0 ? (
              <div className="p-story">
                Nothing needs you today. Paste a role below to see who on the bench is worth a look.
              </div>
            ) : (
              facts.slice(0, 5).map(f => {
                const ctx: BriefRowCtx = { openCandidate, setSelectedRoleId };
                const onAction = factActionHandler(f, ctx);
                return (
                  <div key={`${f.kind}-${f.link}`} className="p-brief-row">
                    <span className={`p-dot${FACT_DOT_AMBER[f.kind] ? ' p-dot-amber' : ''}`} aria-hidden="true" />
                    <span className="p-story">
                      {factSentence(f, ctx)}{' '}
                      <button type="button" className="p-inline-link" style={{ fontWeight: 600 }} onClick={onAction}>
                        {FACT_ACTION_LABEL[f.kind](f)} →
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <Card className="p-home-stats">
          <div className="p-sec">Your bench this week</div>
          <div className="p-row" style={{ gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="p-serif" style={{ fontSize: 32 }}>{candidates.length}</div>
              <div className="p-meta" style={{ fontSize: 13, color: 'var(--p-ink-2)' }}>people, from {sourceCount} source{sourceCount === 1 ? '' : 's'}</div>
            </div>
            <div style={{ flex: 1 }}>
              {strongFitOpenCount === null ? <Skel height={32} width={40} /> : (
                <div className="p-serif" style={{ fontSize: 32 }}>{strongFitOpenCount}</div>
              )}
              <div className="p-meta" style={{ fontSize: 13, color: 'var(--p-ink-2)' }}>strong fits for open roles</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="p-serif" style={{ fontSize: 32, color: 'var(--p-accent-ink)' }}>{placementsCount}</div>
              <div className="p-meta" style={{ fontSize: 13, color: 'var(--p-ink-2)' }}>placements from the bench</div>
            </div>
          </div>
          <hr className="p-hr" />
          <div style={{ fontSize: 14, color: 'var(--p-ink-2)', lineHeight: 1.5 }}>
            Every one of these people already interviewed with you and came close. That is why a message from you gets a reply.
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------------------- hero */}
      <Card accent pad={false} className="p-hero" data-tour="paste">
        <div className="p-hero-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--p-accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 4h6a2 2 0 0 1 2 2v14H7V6a2 2 0 0 1 2-2z" /><path d="M10 11h4M10 15h4" />
          </svg>
        </div>
        <div className="p-hero-copy">
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Have a new role? Paste the job description here.</div>
          <div className="p-sec">We read it, then rank everyone on your bench for it in about four seconds. Nothing is sent to anyone.</div>
        </div>
        <div className="p-hero-field">
          <input
            type="text"
            placeholder="Paste the job description, or a link to it…"
            aria-label="Paste a job description"
            onFocus={openPasteRole}
            onClick={openPasteRole}
            readOnly
          />
          <Btn tone="primary" onClick={openPasteRole}>Match my bench</Btn>
        </div>
      </Card>
      {progressText && (
        <div className="p-note p-mt-3" role="status">
          <span className="p-row p-gap-2"><span className="p-dot" aria-hidden="true" />{progressText}</span>
        </div>
      )}

      {/* -------------------------------------------------------------------------- doors */}
      <div className="p-doors">
        <Link className="p-card p-card-lift p-door" to="/people">
          <div className="p-spread" style={{ alignItems: 'flex-start' }}>
            <div className="p-name">People</div>
            <ArrowIcon />
          </div>
          <div className="p-sec p-door-desc" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {candidates.length} people who came second, third or close. Sorted by who is worth a message for the role you pick.
          </div>
          <div className="p-door-avatars" aria-hidden="true">
            {candidates.slice(0, 4).map(c => <MiniAvatar key={c.id} name={c.name} />)}
            {candidates.length > 4 && <span style={{ marginLeft: 12 }}><Pill sm>+{candidates.length - 4}</Pill></span>}
          </div>
        </Link>

        <Link className="p-card p-card-lift p-door" to="/roles">
          <div className="p-spread" style={{ alignItems: 'flex-start' }}>
            <div className="p-name">Roles</div>
            <ArrowIcon />
          </div>
          <div className="p-sec p-door-desc" style={{ marginTop: 8, lineHeight: 1.5 }}>
            {openRoleIds.size} open role{openRoleIds.size === 1 ? '' : 's'}.{' '}
            {topRolesByFit[0]
              ? `${topRolesByFit[0].role.title} has the best shortlist right now: ${topRolesByFit[0].strong} people over 80 fit.`
              : 'Paste one to start ranking the bench.'}
          </div>
          <div className="p-row p-gap-2 p-wrap p-door-pills" style={{ marginTop: 20 }}>
            {topRolesByFit.map(({ role, strong }, i) => (
              <Pill key={role.id} tone={i === 0 ? 'wash' : undefined} sm>{role.title} · {strong} strong</Pill>
            ))}
          </div>
        </Link>

        <Link className="p-card p-card-lift p-door" to="/sources">
          <div className="p-spread" style={{ alignItems: 'flex-start' }}>
            <div className="p-name">Sources</div>
            <ArrowIcon />
          </div>
          <div className="p-sec p-door-desc" style={{ marginTop: 8, lineHeight: 1.5 }}>
            People arrive from {sourceCount} place{sourceCount === 1 ? '' : 's'} today. Everything lands in one bench.
          </div>
          <div className="p-row p-gap-2 p-wrap p-door-pills" style={{ marginTop: 20 }}>
            {sourceKinds.map(([kind, n]) => (
              <Pill key={kind} sm><span className="p-dot" aria-hidden="true" />{sourceLabelForKind(kind)} · {n}</Pill>
            ))}
          </div>
        </Link>
      </div>

      {/* ------------------------------------------------------------------- worth today */}
      <div className="p-spread p-mt-16" style={{ alignItems: 'baseline', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <h2 className="p-serif p-h2">Worth a message today</h2>
        {roles.length > 0 && (
          <div className="p-row p-gap-3" style={{ flexWrap: 'wrap' }}>
            <span className="p-sec">Ranked for</span>
            <select
              className="p-select"
              style={{ width: 'auto', height: 36, fontSize: 14 }}
              value={selectedRoleId ?? ''}
              onChange={e => setSelectedRoleId(e.target.value || null)}
              aria-label="Rank the queue for this role"
            >
              {roles.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <button type="button" className="p-inline-link p-sec" onClick={openHelp}>how we rank</button>
          </div>
        )}
      </div>

      {isSnoozed ? (
        <div className="p-note">
          You've snoozed this list until {shortDate(snoozeUntil!)}.{' '}
          <button type="button" className="p-inline-link" onClick={unsnoozeQueue}>Undo</button>
        </div>
      ) : candidates.length === 0 ? (
        <Empty title="Nobody on the bench yet" action={<BtnLink to="/sources" tone="primary">Add people</BtnLink>}>
          Add your first people from résumés, a spreadsheet, or an ATS export.
        </Empty>
      ) : queueLoading ? (
        <div className="p-col p-gap-3">
          <Skel height={96} /><Skel height={96} /><Skel height={96} />
        </div>
      ) : queue.length === 0 ? (
        <Empty title="Nothing needs a message right now" action={<BtnLink to="/people">See everyone</BtnLink>}>
          Everyone on the bench has been reached out to recently.
        </Empty>
      ) : (
        <>
          <div className="p-col p-gap-3">
            {queue.map((item, i) => {
              const match = matchByCandidate.get(item.candidate.id);
              const replied = match?.stage === 'replied';
              const label = replied ? 'Read reply' : item.action.kind === 'resurface' ? 'Say hello' : 'Write a warm note';
              return (
                <PersonCard
                  key={item.candidate.id}
                  candidate={item.candidate}
                  processes={processes}
                  roles={roles}
                  matches={roleMatches}
                  fit={item.fit ?? null}
                  contactLabel={replied ? spokeLabel(item.warmthDays, 'replied') : undefined}
                  tourAnchors={i === 0}
                  onOpen={() => openCandidate(item.candidate.id)}
                  action={{
                    label,
                    primary: replied,
                    onClick: () => (replied
                      ? openCandidate(item.candidate.id)
                      : openComposer({ candidateId: item.candidate.id, roleId: selectedRoleId ?? undefined })),
                  }}
                />
              );
            })}
          </div>

          <div className="p-spread p-mt-6" style={{ flexWrap: 'wrap', gap: 12 }}>
            <Link
              className="p-sec"
              style={{ fontWeight: 600, color: 'var(--p-accent-ink)' }}
              to={`/people?fit=strong${selectedRoleId ? `&roleId=${selectedRoleId}` : ''}`}
            >
              See all {strongForSelectedRole} strong fit{strongForSelectedRole === 1 ? '' : 's'}{selectedRole ? ` for ${selectedRole.title}` : ''} →
            </Link>
            <div className="p-row p-gap-2">
              <span className="p-sec">Not today?</span>
              <Btn size="sm" tone="ghost" onClick={snoozeQueue}>Snooze the list a week</Btn>
            </div>
          </div>
        </>
      )}

      {/* --------------------------------------------------------------- how this works */}
      <Card className="p-row p-mt-16 p-wrap" style={{ alignItems: 'center', gap: 40 }}>
        <div style={{ width: 280, flex: 'none' }}>
          <div className="p-serif p-h3">How this works</div>
          <div className="p-sec p-mt-2" style={{ lineHeight: 1.5 }}>{HELP.home.intro}</div>
          <Btn size="sm" className="p-mt-4" onClick={startTour}>Start the tour</Btn>
        </div>
        <div className="p-grid-3" style={{ flex: 1 }}>
          {HELP.home.steps.map(step => (
            <div key={step.label}>
              <Pill tone="wash" className="p-mt-2">{step.label}</Pill>
              <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 10 }}>{step.body}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--p-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function MiniAvatar({ name }: { name: string }) {
  return <div className="p-avatar p-avatar-sm" aria-hidden="true">{name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()}</div>;
}

const SOURCE_KIND_LABEL: Record<string, string> = {
  sample: 'the sample bench', manual: 'typed in by hand', resume: 'résumés', csv: 'spreadsheets', ats: 'ATS exports',
  linkedin: 'LinkedIn', jobboard: 'job boards', slack: 'Slack', outlook: 'Outlook', drive: 'Drive', capture: 'Capture',
  link: 'the add-to-bench link', teammate: 'teammates',
};
function sourceLabelForKind(kind: string): string {
  return SOURCE_KIND_LABEL[kind] ?? kind;
}
