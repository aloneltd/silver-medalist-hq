import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { dataService } from '../../services/dataService';
import { useAppUI } from '../../app/store';
import { useHelpKey } from '../help/HelpProvider';
import { Btn, Card, Empty, PageHeader, SectionHead, Skel } from '../ui';
import { fitBand } from '../lib/personText';
import type { Activity, ActivityType, Candidate, CompBand, Match, Role, RoleUrgency } from '../../types';

/**
 * Roles: open roles as cards, a prominent "Paste a new role" entry (the existing flow from
 * src/app/PasteRoleFlow.tsx, opened via useAppUI().openPasteRole — not rebuilt), and filled /
 * paused roles in a quieter section underneath. Rewired from src/app/RolesView.tsx's logic
 * (role list + match counts), re-thought as sentences instead of a table per DESIGN-v3.md.
 */
export function Roles() {
  useHelpKey('roles');
  const navigate = useNavigate();
  const { openPasteRole, setSelectedRoleId, runSync, syncPhase, syncRoleId } = useAppUI();

  const roles = dataService.hooks.useRoles();
  const candidates = dataService.hooks.useCandidates();
  // Not exposed as a per-role hook (dataService.hooks.useMatchesForRole takes one roleId, and a
  // hook can't be called once per role in a loop) — read the whole tables directly, the same
  // way src/app/RolesView.tsx already does for its match-count column, and group client-side.
  const allMatches = useLiveQuery(() => db.matches.toArray(), [], []);
  const allActivities = useLiveQuery(() => db.activities.toArray(), [], []);

  const loading = roles === undefined || candidates === undefined || allMatches === undefined || allActivities === undefined;

  const candidateById = useMemo(() => new Map((candidates ?? []).map(c => [c.id, c])), [candidates]);
  const matchesByRole = useMemo(() => groupBy(allMatches ?? [], m => m.roleId), [allMatches]);
  const activitiesByRole = useMemo(() => groupBy((allActivities ?? []).filter(a => a.roleId), a => a.roleId as string), [allActivities]);

  const sortedRoles = useMemo(() => [...(roles ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [roles]);
  const openRoles = sortedRoles.filter(r => r.status === 'open');
  const quietRoles = sortedRoles.filter(r => r.status !== 'open');

  const goToShortlist = (roleId: string) => {
    setSelectedRoleId(roleId);
    navigate('/people');
  };
  const goToBoard = (roleId: string) => {
    setSelectedRoleId(roleId);
    navigate('/board');
  };

  return (
    <div className="p-container">
      <PageHeader
        title="Roles"
        lede={loading ? undefined : `${sortedRoles.length} role${sortedRoles.length === 1 ? '' : 's'} on file, ${openRoles.length} open.`}
      />

      <div className="p-mt-8">
        <PasteRoleHero onClick={openPasteRole} />
      </div>

      {loading ? (
        <div className="p-grid-2 p-mt-8">
          <Skel height={220} /><Skel height={220} />
        </div>
      ) : sortedRoles.length === 0 ? (
        <div className="p-mt-8">
          <Empty title="No roles yet" action={<Btn tone="primary" onClick={openPasteRole}>Paste a role</Btn>}>
            Paste a job description above and we&rsquo;ll turn it into a role you can match the whole bench against.
          </Empty>
        </div>
      ) : (
        <>
          <SectionHead title="Open" right={`${openRoles.length}`} />
          {openRoles.length === 0 ? (
            <Empty title="Nothing open right now" action={<Btn tone="primary" onClick={openPasteRole}>Paste a role</Btn>}>
              Every role on file is filled or paused. Paste a new one to start matching again.
            </Empty>
          ) : (
            <div className="p-grid-2">
              {openRoles.map(role => (
                <RoleCard
                  key={role.id}
                  role={role}
                  matches={matchesByRole.get(role.id) ?? []}
                  activities={activitiesByRole.get(role.id) ?? []}
                  candidateById={candidateById}
                  matching={syncPhase === 'syncing' && syncRoleId === role.id}
                  onMatch={() => runSync(role.id)}
                  onShortlist={() => goToShortlist(role.id)}
                  onBoard={() => goToBoard(role.id)}
                />
              ))}
            </div>
          )}

          {quietRoles.length > 0 && (
            <>
              <SectionHead title="Filled and paused" right={`${quietRoles.length}`} />
              <div className="p-col p-gap-3">
                {quietRoles.map(role => <QuietRoleRow key={role.id} role={role} onOpen={() => goToShortlist(role.id)} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------- helpers */

function groupBy<T, K extends string>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = map.get(key);
    if (bucket) bucket.push(row); else map.set(key, [row]);
  }
  return map;
}

function effectiveScore(m: Match): number {
  return m.override?.score ?? m.score;
}

function payBandText(band: CompBand): string {
  if (!band.max) return 'Pay band not set';
  return `${band.currency} ${band.min.toLocaleString()}–${band.max.toLocaleString()}`;
}

const URGENCY_WORDS: Record<RoleUrgency['score'], string> = {
  1: 'No rush',
  2: 'Low urgency',
  3: 'Worth moving on',
  4: 'Urgent',
  5: 'Very urgent',
};

function urgencySentence(u: Role['urgency']): string {
  const base = URGENCY_WORDS[u.score] ?? 'Urgency not set';
  return u.reasons.length > 0 ? `${base} — ${u.reasons[0]}` : `${base}.`;
}

/** "Spoke to" this year — real human contact, not an import row or a stage/status flip. */
const CONTACT_TYPES = new Set<ActivityType>(['touch', 'note', 'email_copied', 'email_drafted', 'email_sent', 'reply_detected']);

function peopleSpokenToThisYear(activities: Activity[], now = new Date()): number {
  const year = now.getFullYear();
  const seen = new Set<string>();
  for (const a of activities) {
    if (!CONTACT_TYPES.has(a.type)) continue;
    if (new Date(a.at).getFullYear() !== year) continue;
    seen.add(a.candidateId);
  }
  return seen.size;
}

/* --------------------------------------------------------------------------- paste-a-role */

function PasteRoleHero({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="p-drop" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
      <div className="p-drop-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--p-accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <div>
        <div className="p-name">Paste a new role</div>
        <div className="p-sec p-mt-2">Paste a job description or a link. We read it once, then rank the whole bench against it.</div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------------- role card */

interface RoleCardProps {
  role: Role;
  matches: Match[];
  activities: Activity[];
  candidateById: Map<string, Candidate>;
  matching: boolean;
  onMatch: () => void;
  onShortlist: () => void;
  onBoard: () => void;
}

function RoleCard({ role, matches, activities, candidateById, matching, onMatch, onShortlist, onBoard }: RoleCardProps) {
  const strongFits = matches.filter(m => fitBand(effectiveScore(m)) === 'strong').length;
  const spokenTo = peopleSpokenToThisYear(activities);
  const topThree = [...matches]
    .sort((a, b) => effectiveScore(b) - effectiveScore(a))
    .slice(0, 3)
    .map(m => candidateById.get(m.candidateId)?.name)
    .filter((n): n is string => !!n);

  return (
    <Card lift>
      <div className="p-spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="p-name">{role.title}</div>
          <div className="p-sec p-mt-1">{role.level} · {role.location}</div>
        </div>
      </div>
      <div className="p-sec p-mt-3">{payBandText(role.compBand)}</div>
      <div className="p-mt-3" style={{ fontSize: 14, color: role.urgency.score >= 4 ? 'var(--p-amber)' : 'var(--p-ink-2)' }}>
        {urgencySentence(role.urgency)}
      </div>

      <div className="p-hr" />

      <div className="p-story">
        {matches.length === 0
          ? 'Not matched against the bench yet.'
          : `${strongFits} strong fit${strongFits === 1 ? '' : 's'} on the bench, ${spokenTo} ${spokenTo === 1 ? 'person' : 'people'} you spoke to this year.`}
      </div>

      {topThree.length > 0 && (
        <div className="p-sec p-mt-2">Top of the list: {topThree.join(', ')}.</div>
      )}

      <div className="p-row p-gap-2 p-wrap p-mt-6">
        <Btn size="sm" tone="primary" disabled={matching} onClick={onMatch}>{matching ? 'Matching…' : 'Match this role'}</Btn>
        <Btn size="sm" onClick={onShortlist}>See the shortlist</Btn>
        {matches.length > 0 && <Btn size="sm" tone="ghost" onClick={onBoard}>View the board</Btn>}
      </div>
    </Card>
  );
}

function QuietRoleRow({ role, onOpen }: { role: Role; onOpen: () => void }) {
  return (
    <Card className="p-person-muted" pad={false}>
      <div className="p-person" style={{ gap: 16 }}>
        <div className="p-grow">
          <div className="p-strong">{role.title}</div>
          <div className="p-sec">{role.level} · {role.location} · {role.status === 'filled' ? 'Filled' : 'Paused'}</div>
        </div>
        <Btn size="sm" onClick={onOpen}>See the shortlist</Btn>
      </div>
    </Card>
  );
}
