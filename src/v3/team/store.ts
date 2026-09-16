/**
 * Local store adapter for Team + Inbox — Dexie is the reactive source of truth the UI renders
 * from (via `useLiveQuery`), in both local and shared mode. `sharedSync.ts` is the mirror that
 * pulls the Drive-backed shared store into these same tables and pushes writes back out when
 * `GOOGLE_REFRESH_TOKEN` etc. are configured; this file has no idea whether that is happening.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { ulid } from '../../lib/ulid';
import type { Candidate, TeamMember, TeamRole, Submission, SubmissionState } from '../../types';

// ------------------------------------------------------------------------------------ members

// `team`'s Dexie index is `id, email, role` (src/db/schema.ts) — no `addedAt` index, so
// ordering happens in JS rather than via `.orderBy()`, which throws SchemaError on an
// unindexed key path.
function byAddedAt(a: TeamMember, b: TeamMember): number {
  return a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0;
}

export function useTeamMembers(): TeamMember[] | undefined {
  return useLiveQuery(async () => (await db.team.toArray()).sort(byAddedAt));
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  return (await db.team.toArray()).sort(byAddedAt);
}

export async function upsertMember(member: TeamMember): Promise<void> {
  await db.team.put(member);
}

export async function setMemberRole(id: string, role: TeamRole): Promise<void> {
  const m = await db.team.get(id);
  if (!m || m.role === 'owner') return; // the owner's row never changes here — see Team.tsx
  await db.team.update(id, { role });
}

export async function removeMember(id: string): Promise<void> {
  const m = await db.team.get(id);
  if (!m || m.role === 'owner') return;
  await db.team.delete(id);
}

export async function touchMemberActivity(name: string, at: string = new Date().toISOString()): Promise<void> {
  const match = (await db.team.toArray()).find(x => x.name === name);
  if (match) await db.team.update(match.id, { lastActiveAt: at });
}

/** How many people on the bench carry `source.addedBy === name` — the real number, not a guess. */
export function computeAddedCounts(candidates: Candidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of candidates) {
    const by = c.source?.addedBy;
    if (!by) continue;
    counts[by] = (counts[by] ?? 0) + 1;
  }
  return counts;
}

export function ensureExactlyOneOwner(members: TeamMember[]): TeamMember | undefined {
  return members.find(m => m.role === 'owner');
}

// -------------------------------------------------------------------------------- submissions

export function useSubmissions(state?: SubmissionState): Submission[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.submissions.orderBy('at').reverse().toArray();
    return state ? all.filter(s => s.state === state) : all;
  }, [state]);
}

export function useWaitingCount(): number | undefined {
  return useLiveQuery(async () => (await db.submissions.where('state').equals('waiting').count()));
}

export async function addSubmission(sub: Submission): Promise<void> {
  await db.submissions.put(sub);
}

export async function setSubmissionState(id: string, state: SubmissionState): Promise<void> {
  await db.submissions.update(id, { state });
}

export function newSubmissionId(): string {
  return ulid();
}
