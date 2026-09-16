import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Mail, Bell, StickyNote, Kanban } from 'lucide-react';
import type { Activity, Candidate, CandidateStatus, CompBand, CompSnapshot, Match, Process } from '../../types';
import { dataService, computeWarmthDays } from '../../services/dataService';
import { useAppUI } from '../../app/store';
import { addNote, snoozeCandidate } from '../../features/bench/lib/actions';
import { tenureMonths } from '../../features/bench/lib/warmth';
import { findLookalikes } from '../../lib/lookalikes';
import { useToast } from '../../ui';
import { Btn, Card, Avatar, Term, Dialog, Skel, SectionHead } from '../ui';
import { fitPhrase, spokeLabel, sourceLabel, statusPhrase, isOffLimits, whenPhrase } from '../lib/personText';
import { StatusDialog } from './StatusDialog';
import './profile.css';

/**
 * The shared profile body — content per builder brief B4, section order 1..5 (header, story,
 * fit, last contact, lookalikes). Rendered as-is inside both a full page (ProfilePage) and a
 * right drawer (ProfileDrawer): one component, two shells, so the two never drift apart.
 *
 * Logic is rewired from v2.1 (src/features/dossier/**), not rewritten: applyStatus, setStage,
 * setOverride, logActivity, addNote, snoozeCandidate, findLookalikes, statusRequiresReason and
 * defaultResurfaceDate are all imported from where v2.1 already built and tested them.
 */
export function ProfileBody({ candidateId }: { candidateId: string }) {
  const navigate = useNavigate();
  const { push } = useToast();
  const { selectedRoleId, selectedRole, roles: allRoles, openComposer, runSync } = useAppUI();

  const candidate = dataService.hooks.useCandidate(candidateId);
  const processes = dataService.hooks.useProcessesForCandidate(candidateId);
  const activities = dataService.hooks.useActivitiesForCandidate(candidateId);
  const matches = dataService.hooks.useMatchesForRole(selectedRoleId ?? undefined);
  const pool = dataService.hooks.useCandidates();

  const [menuOpen, setMenuOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideScore, setOverrideScore] = useState(50);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const match = matches?.find(m => m.candidateId === candidateId);

  const lookalikes = useMemo(() => {
    if (!candidate || !pool || pool.length < 2) return [];
    return findLookalikes(candidate, pool, 3);
  }, [candidate, pool]);

  if (candidate === undefined) {
    return (
      <div className="p-col p-gap-6" aria-busy="true">
        <div className="p-row p-gap-6"><Skel height={48} width={48} /><div className="p-col p-gap-2" style={{ flex: 1 }}><Skel height={28} width={220} /><Skel height={16} width={320} /></div></div>
        <Skel height={140} /><Skel height={140} />
      </div>
    );
  }

  const firstName = candidate.name.trim().split(/\s+/)[0] || candidate.name;
  const offLimits = isOffLimits(candidate);
  const status = statusPhrase(candidate);
  const srcLabel = sourceLabel(candidate);
  const srcUrl = candidate.source?.url;

  const copyEmail = async () => {
    if (!candidate.email) return;
    try {
      await navigator.clipboard.writeText(candidate.email);
      push('Email copied.', { tone: 'success' });
    } catch {
      push(`Could not copy — here it is: ${candidate.email}`, { tone: 'neutral' });
    }
    setMenuOpen(false);
  };

  const submitNote = async () => {
    if (!noteDraft.trim()) return;
    setNoteSaving(true);
    try {
      await addNote(candidateId, noteDraft.trim());
      setNoteDraft('');
      setNoteOpen(false);
      push('Note added.', { tone: 'success' });
    } finally {
      setNoteSaving(false);
    }
  };

  const submitStatus = async (next: CandidateStatus, reason: string, snoozeUntil?: string) => {
    await dataService.applyStatus(candidateId, next, reason, snoozeUntil);
  };

  const openOverride = () => {
    if (!match) return;
    setOverrideScore(Math.round(match.override?.score ?? match.score));
    setOverrideReason(match.override?.reason ?? '');
    setOverrideOpen(true);
  };

  const saveOverride = async () => {
    if (!match) return;
    setOverrideSaving(true);
    try {
      await dataService.setOverride(match.id, overrideScore, overrideReason.trim() || 'No reason given');
      setOverrideOpen(false);
    } finally {
      setOverrideSaving(false);
    }
  };

  const lookalikeTitle = lookalikes.length === 0
    ? `People like ${firstName}`
    : `${NUMBER_WORDS[lookalikes.length] ?? lookalikes.length} more like ${firstName}`;

  return (
    <div className="p-col p-gap-2">
      {/* -------------------------------------------------------------- 1. header */}
      <div className="p-row p-gap-6 p-wrap" style={{ alignItems: 'flex-start' }}>
        <Avatar name={candidate.name} />
        <div className="p-grow" style={{ minWidth: 240 }}>
          <h1 className="p-serif p-h2">{candidate.name}</h1>
          <div className="p-lede p-mt-2">
            {candidate.currentTitle} at {candidate.currentEmployer} · {tenureWords(candidate.tenureStart)}
          </div>
          {status && (
            <div className="p-mt-3" style={{ fontSize: 15, fontWeight: 500, color: offLimits ? 'var(--p-red)' : 'var(--p-amber)' }}>
              {status}
            </div>
          )}
          <div className="p-row p-gap-3 p-wrap p-mt-4" style={{ fontSize: 14, color: 'var(--p-ink-2)', rowGap: 8 }}>
            {match && (
              <span className="p-fit">
                <Term term="fit">{fitPhrase(match.override?.score ?? match.score)}</Term> for {selectedRole?.title ?? 'this role'}
              </span>
            )}
            <span>{spokeLabel(computeWarmthDays(candidate.warmthAt))}</span>
            {srcLabel && (
              srcUrl
                ? <a href={srcUrl} target="_blank" rel="noreferrer">{srcLabel}</a>
                : <span>{srcLabel}</span>
            )}
          </div>
        </div>

        <div className="p-col p-gap-2 pf-header-actions">
          {!offLimits ? (
            <Btn tone="primary" onClick={() => openComposer({ candidateId, roleId: selectedRoleId ?? undefined })}>
              Write to {firstName}
            </Btn>
          ) : (
            <div className="p-note p-note-amber" style={{ fontSize: 13 }}>
              Outreach is turned off for {firstName}.
            </div>
          )}
          <div className="pf-menu-wrap" ref={menuRef}>
            <Btn onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen} style={{ width: '100%' }}>
              <MoreHorizontal size={16} aria-hidden="true" /> More
            </Btn>
            {menuOpen && (
              <div className="p-menu" role="menu">
                <button type="button" role="menuitem" className="p-menu-item" onClick={() => { setMenuOpen(false); setStatusOpen(true); }}>
                  Change status
                </button>
                <button type="button" role="menuitem" className="p-menu-item" onClick={() => { setMenuOpen(false); setNoteOpen(true); }}>
                  <StickyNote size={15} aria-hidden="true" /> Add a note
                </button>
                <button type="button" role="menuitem" className="p-menu-item" onClick={() => { setMenuOpen(false); setReminderOpen(true); }}>
                  <Bell size={15} aria-hidden="true" /> Set a reminder
                </button>
                {candidate.email && (
                  <button type="button" role="menuitem" className="p-menu-item" onClick={copyEmail}>
                    <Mail size={15} aria-hidden="true" /> Copy email
                  </button>
                )}
                {match && (
                  <button type="button" role="menuitem" className="p-menu-item" onClick={() => { setMenuOpen(false); navigate('/board'); }}>
                    <Kanban size={15} aria-hidden="true" /> Open the board card
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- 2. the story */}
      <section className="p-mt-14">
        <SectionHead title="The story" />
        <Card>
          <StoryContent processes={processes} roleNameOf={id => allRoles.find(r => r.id === id)?.title} />
        </Card>
      </section>

      {/* -------------------------------------------------------------- 3. fit */}
      <section className="p-mt-14">
        <SectionHead title="Fit" right={selectedRole ? `for ${selectedRole.title}` : undefined} />
        <Card>
          {!selectedRoleId ? (
            <p className="p-sec">Pick a role to see how {firstName} fits it.</p>
          ) : !match ? (
            <div>
              <p className="p-sec">No score yet for {selectedRole?.title ?? 'this role'}.</p>
              <Btn size="sm" tone="primary" className="p-mt-3" onClick={() => runSync(selectedRoleId)}>
                Match this role
              </Btn>
            </div>
          ) : (
            <FitContent
              match={match}
              overrideOpen={overrideOpen}
              overrideScore={overrideScore}
              overrideReason={overrideReason}
              overrideSaving={overrideSaving}
              onOpenOverride={openOverride}
              onCancelOverride={() => setOverrideOpen(false)}
              onChangeScore={setOverrideScore}
              onChangeReason={setOverrideReason}
              onSaveOverride={saveOverride}
            />
          )}
        </Card>
      </section>

      {/* -------------------------------------------------------------- 4. last contact */}
      <section className="p-mt-14">
        <SectionHead title="Last contact" />
        <Card>
          <LastContactContent
            candidate={candidate}
            band={selectedRole?.compBand}
            srcLabel={srcLabel}
            activities={activities}
          />
        </Card>
      </section>

      {/* -------------------------------------------------------------- 5. lookalikes */}
      <section className="p-mt-14">
        <SectionHead title={lookalikeTitle} right="by skills and level" />
        <Card>
          {pool === undefined ? (
            <Skel height={80} />
          ) : lookalikes.length === 0 ? (
            <p className="p-sec">Nobody else on the bench shares enough skills, seniority or location with {firstName} yet.</p>
          ) : (
            <div className="p-col p-gap-1">
              {lookalikes.map(l => (
                <Link key={l.candidateId} to={`/p/${l.candidateId}`} className="pf-lookalike-row">
                  <Avatar name={l.name} size="md" />
                  <div>
                    <div className="pf-lookalike-name">{l.name}</div>
                    <div className="p-sec">{l.reason}.</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* -------------------------------------------------------------- status change */}
      {statusOpen && (
        <StatusDialog
          candidateName={candidate.name}
          currentStatus={candidate.status}
          onClose={() => setStatusOpen(false)}
          onSubmit={submitStatus}
        />
      )}

      {noteOpen && (
        <Dialog
          title="Add a note"
          onClose={() => setNoteOpen(false)}
          footer={
            <>
              <Btn onClick={() => setNoteOpen(false)}>Cancel</Btn>
              <Btn tone="primary" disabled={!noteDraft.trim() || noteSaving} onClick={submitNote}>Save</Btn>
            </>
          }
        >
          <textarea
            className="p-textarea"
            autoFocus
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            rows={4}
            placeholder="Anything worth remembering — a preference, a red flag, a quote."
          />
        </Dialog>
      )}

      {reminderOpen && (
        <Dialog title={`Set a reminder for ${firstName}`} onClose={() => setReminderOpen(false)}>
          <p className="p-sec">We&rsquo;ll bring {firstName} back to your attention.</p>
          <div className="p-row p-gap-2 p-wrap p-mt-4">
            {[7, 30, 90].map(days => (
              <Btn
                key={days}
                onClick={async () => {
                  await snoozeCandidate(candidateId, new Date(Date.now() + days * 86_400_000).toISOString());
                  setReminderOpen(false);
                  push(`Reminder set for ${days} day${days === 1 ? '' : 's'} from now.`, { tone: 'success' });
                }}
              >
                In {days} days
              </Btn>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}

const NUMBER_WORDS: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three' };

/* ------------------------------------------------------------------------------ tenure */

function tenureWords(tenureStart: string): string {
  const months = tenureMonths(tenureStart);
  if (months < 1) return 'just started';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (!rem) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years}y ${rem}mo`;
}

/* -------------------------------------------------------------------------------- story */

const FINISH_LABEL: Record<Process['finishedAs'], string> = {
  second: 'Came second',
  final: 'Reached the final round',
  shortlist: 'Was shortlisted',
  offer_declined: 'Turned down an offer',
  placed: 'Was placed',
};

function StoryContent({ processes, roleNameOf }: { processes: Process[] | undefined; roleNameOf: (roleId: string) => string | undefined }) {
  if (processes === undefined) return <Skel height={100} />;
  if (processes.length === 0) {
    return <p className="p-sec">No recorded process yet — the story starts with the first one.</p>;
  }
  const sorted = [...processes].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <div className="pf-timeline">
      {sorted.map(p => (
        <div className="pf-timeline-row" key={p.id}>
          <div className="pf-timeline-when">{whenPhrase(p.date)}</div>
          <div className="pf-timeline-line">
            <span className="pf-timeline-dot" aria-hidden="true" />
            <div className="p-strong">{FINISH_LABEL[p.finishedAs]} for {roleNameOf(p.roleId) ?? 'a role'}</div>
            {p.reason && <div className="pf-quote">&ldquo;{p.reason}&rdquo;</div>}
            <div className="p-col p-gap-1 p-mt-2">
              {p.lostTo && <span className="p-sec">Lost to {p.lostTo}</span>}
              {p.interviewers && p.interviewers.length > 0 && <span className="p-sec">Interviewers: {p.interviewers.join(', ')}</span>}
              {p.scorecard && <span className="p-sec">Scorecard: {p.scorecard}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------------- fit */

const SUB_META: { key: keyof Match['sub']; label: string; max: number; blurb: string }[] = [
  { key: 'skills', label: 'Skills', max: 40, blurb: "Matched against the role's must-haves and nice-to-haves." },
  { key: 'seniority', label: 'Seniority', max: 20, blurb: 'How close their level is to what the role needs.' },
  { key: 'comp', label: 'Pay', max: 20, blurb: 'Where their expected pay sits against the band.' },
  { key: 'timing', label: 'Timing', max: 20, blurb: 'Tenure, and how recently you were in touch.' },
];

function subPoints(raw: number, max: number): number {
  const clamped = Math.max(0, Math.min(100, raw));
  return Math.round((clamped / 100) * max);
}

function flagSentence(flag: string): string {
  const s = flag.trim();
  if (!s) return s;
  const capped = s[0].toUpperCase() + s.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

interface FitContentProps {
  match: Match;
  overrideOpen: boolean;
  overrideScore: number;
  overrideReason: string;
  overrideSaving: boolean;
  onOpenOverride: () => void;
  onCancelOverride: () => void;
  onChangeScore: (n: number) => void;
  onChangeReason: (s: string) => void;
  onSaveOverride: () => void;
}

function FitContent({
  match, overrideOpen, overrideScore, overrideReason, overrideSaving,
  onOpenOverride, onCancelOverride, onChangeScore, onChangeReason, onSaveOverride,
}: FitContentProps) {
  const effective = Math.round(match.override?.score ?? match.score);
  return (
    <div>
      <div className="p-spread">
        <div className="p-serif" style={{ fontSize: 32, color: 'var(--p-accent-ink)' }}>{effective}</div>
        <div className="p-sec">out of 100 · <Term term="fit">how fit is worked out</Term></div>
      </div>
      {match.fallback && <p className="p-sec p-mt-2">Keyword-fit fallback score — the AI call didn&rsquo;t land this time.</p>}

      <div className="p-grid-2 p-mt-6">
        {SUB_META.map(s => {
          const raw = match.sub[s.key];
          return (
            <div key={s.key}>
              <div className="p-spread" style={{ fontSize: 14 }}>
                <span className="p-strong">{s.label}</span>
                <span className="p-sec">{subPoints(raw, s.max)} of {s.max}</span>
              </div>
              <div className="pf-bar-track"><div className="pf-bar-fill" style={{ width: `${Math.max(0, Math.min(100, raw))}%` }} /></div>
              <div className="p-meta p-mt-2">{s.blurb}</div>
            </div>
          );
        })}
      </div>

      {match.flags.length > 0 && (
        <ul className="p-mt-6" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {match.flags.map((f, i) => <li key={i} className="p-sec" style={{ color: 'var(--p-amber)' }}>{flagSentence(f)}</li>)}
        </ul>
      )}

      <p className="p-story p-mt-6" style={{ fontStyle: 'italic', color: 'var(--p-ink-2)' }}>{match.why}</p>

      {match.override && (
        <div className="p-note p-mt-4">
          Adjusted from {Math.round(match.score)} to {Math.round(match.override.score)} — {match.override.reason}. The
          original AI score and its reason above are kept for the record.
        </div>
      )}

      <div className="p-hr" />
      {!overrideOpen ? (
        <Btn size="sm" onClick={onOpenOverride}>{match.override ? 'Edit the override' : 'Adjust the score and say why'}</Btn>
      ) : (
        <div className="p-col p-gap-3">
          <label className="p-label" htmlFor="pf-override-score">Score: {overrideScore}</label>
          <input
            id="pf-override-score"
            type="range"
            min={0}
            max={100}
            value={overrideScore}
            onChange={e => onChangeScore(Number(e.target.value))}
          />
          <textarea
            className="p-textarea"
            placeholder="Why — we'll remember this for next time."
            value={overrideReason}
            onChange={e => onChangeReason(e.target.value)}
            rows={2}
          />
          <div className="p-row p-gap-2">
            <Btn size="sm" tone="primary" disabled={overrideSaving} onClick={onSaveOverride}>Save</Btn>
            <Btn size="sm" tone="ghost" onClick={onCancelOverride}>Cancel</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- last contact */

function compVsBand(figure: CompSnapshot, band?: CompBand): string {
  const amt = `${figure.currency} ${figure.amount.toLocaleString()}`;
  if (!band || !band.max) return amt;
  if (figure.currency !== band.currency) {
    // Never fabricate an FX rate — same rule as v2.1's CompGauge (src/features/dossier/CompGauge.tsx).
    return `${amt} — the band is ${band.currency} ${band.min.toLocaleString()}–${band.max.toLocaleString()}, different currencies so not directly comparable`;
  }
  if (figure.amount >= band.min && figure.amount <= band.max) {
    return `${amt} — inside the ${band.min.toLocaleString()}–${band.max.toLocaleString()} band`;
  }
  const dir = figure.amount > band.max ? 'above' : 'below';
  return `${amt} — ${dir} the ${band.currency} ${band.min.toLocaleString()}–${band.max.toLocaleString()} band`;
}

function compSentence(label: string, figure: CompSnapshot | undefined, band: CompBand | undefined, srcLabel: string | null): string | null {
  if (!figure) return null;
  const parts = [`${label} ${compVsBand(figure, band)}`, `as of ${whenPhrase(figure.date)}`];
  if (srcLabel) parts.push(srcLabel);
  return `${parts.join(' — ')}.`;
}

function noticeSentence(days: number | undefined): string | null {
  if (days == null) return null;
  if (days >= 30) {
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? '' : 's'}’ notice.`;
  }
  return `${days} day${days === 1 ? '' : 's'}’ notice.`;
}

function visaSentence(visaNeed: boolean | undefined): string | null {
  if (visaNeed === undefined) return null;
  return visaNeed ? 'Will need visa sponsorship.' : 'No visa needed.';
}

function onsiteSentence(onsiteDays: number | undefined): string | null {
  if (onsiteDays === undefined) return null;
  if (onsiteDays === 0) return 'Fully remote.';
  return `${onsiteDays} day${onsiteDays === 1 ? '' : 's'} a week in the office.`;
}

const ACTIVITY_LABEL: Record<string, string> = {
  touch: 'Touched',
  email_copied: 'Copied an email',
  note: 'Note',
  stage: 'Moved stage',
  status: 'Status changed',
  reminder: 'Reminder set',
  import: 'Imported',
  email_drafted: 'Drafted an email',
  email_sent: 'Sent an email',
  reply_detected: 'They replied',
  nl_command: 'Ask command',
};

function relPhrase(iso: string): string {
  const days = computeWarmthDays(iso);
  const phrase = spokeLabel(days, '').trim();
  return phrase || 'recently';
}

function LastContactContent(
  { candidate, band, srcLabel, activities }:
  { candidate: Candidate; band: CompBand | undefined; srcLabel: string | null; activities: Activity[] | undefined },
) {
  const compLines = [
    compSentence('Last on record', candidate.compAtLastProcess, band, srcLabel),
    compSentence('Asked for', candidate.compExpectation, band, srcLabel),
  ].filter((s): s is string => !!s);

  const detailLines = [
    noticeSentence(candidate.noticePeriodDays),
    visaSentence(candidate.visaNeed),
    onsiteSentence(candidate.onsiteDays),
  ].filter((s): s is string => !!s);

  return (
    <div className="p-col p-gap-6">
      <div>
        <div className="p-strong" style={{ fontSize: 14 }}>Pay</div>
        <div className="p-col p-gap-1 p-mt-2">
          {compLines.length === 0
            ? <span className="p-sec">No comp figure on file{band ? ` — the band is ${band.currency} ${band.min.toLocaleString()}–${band.max.toLocaleString()}` : ''}.</span>
            : compLines.map((l, i) => <span key={i} className="p-sec">{l}</span>)}
        </div>
      </div>

      <div>
        <div className="p-strong" style={{ fontSize: 14 }}>Notice, visa and office</div>
        <div className="p-col p-gap-1 p-mt-2">
          {detailLines.length === 0
            ? <span className="p-sec">Nothing on file yet.</span>
            : detailLines.map((l, i) => <span key={i} className="p-sec">{l}</span>)}
        </div>
      </div>

      <div>
        <div className="p-strong" style={{ fontSize: 14 }}>Every touch</div>
        {activities === undefined ? (
          <div className="p-mt-3"><Skel height={60} /></div>
        ) : activities.length === 0 ? (
          <p className="p-sec p-mt-2">Nothing logged yet — every note, draft, send and reply will show up here.</p>
        ) : (
          <div className="pf-timeline p-mt-3">
            {activities.map(a => (
              <div className="pf-timeline-row" key={a.id}>
                <div className="pf-timeline-when">{relPhrase(a.at)}</div>
                <div className="pf-timeline-line">
                  <span className="pf-timeline-dot pf-timeline-dot-muted" aria-hidden="true" />
                  <div className="p-sec">{ACTIVITY_LABEL[a.type] ?? a.type} · {a.actor}</div>
                  <div style={{ fontSize: 15, marginTop: 2 }}>{a.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
