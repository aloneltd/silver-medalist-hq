/**
 * The Team/Inbox sample seed — three teammates and three waiting submissions, matching
 * design-v3/Sources.dc.html exactly so the Team page looks like the approved mockup on a
 * fresh install. Every fake person carries `sample: true` and a matching "sample" pill in the
 * UI (Team.tsx / InboxList.tsx) — nobody should mistake Dana, Sam or Yusuf for a real hire.
 *
 * The owner row is NOT sample data: it represents whoever is actually using this browser.
 */
import { db } from '../../db/schema';
import type { TeamMember, Submission } from '../../types';

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

// Fixed ids (not ulid()) so seeding is idempotent: React StrictMode / a second mount can call
// this twice, and `bulkPut` against the same ids just overwrites in place instead of
// duplicating rows — no transaction gymnastics needed to survive a double-invoke.
const SAMPLE_MEMBER_IDS = { owner: 'seed-owner', dana: 'seed-dana', sam: 'seed-sam', yusuf: 'seed-yusuf' } as const;
const SAMPLE_SUBMISSION_IDS = { lina: 'seed-sub-lina', amir: 'seed-sub-amir', sofia: 'seed-sub-sofia' } as const;

export async function ensureTeamSeed(owner: { name: string; email: string }): Promise<void> {
  const [memberCount, subCount] = await Promise.all([db.team.count(), db.submissions.count()]);

  if (memberCount === 0) {
    const members: TeamMember[] = [
      { id: SAMPLE_MEMBER_IDS.owner, name: owner.name, email: owner.email, role: 'owner', addedAt: iso(400), lastActiveAt: iso(0) },
      { id: SAMPLE_MEMBER_IDS.dana, name: 'Dana', email: 'dana@example.com', role: 'editor', addedAt: iso(90), lastActiveAt: iso(0), sample: true },
      { id: SAMPLE_MEMBER_IDS.sam, name: 'Sam', email: 'sam@example.com', role: 'contributor', addedAt: iso(60), lastActiveAt: iso(2), sample: true },
      { id: SAMPLE_MEMBER_IDS.yusuf, name: 'Yusuf', email: 'yusuf@example.com', role: 'editor', addedAt: iso(45), lastActiveAt: iso(1), sample: true },
    ];
    await db.team.bulkPut(members);
  }

  if (subCount === 0) {
    const submissions: Submission[] = [
      {
        id: SAMPLE_SUBMISSION_IDS.lina,
        at: iso(0),
        via: 'link',
        addedBy: 'Dana',
        note: 'ran platform at N26, interviewed for Staff SRE in 2025',
        roleHint: 'Staff SRE',
        draft: { name: 'Lina Novak', currentEmployer: 'N26', currentTitle: 'Platform Engineer', location: 'Berlin' },
        state: 'waiting',
        sample: true,
      },
      {
        id: SAMPLE_SUBMISSION_IDS.amir,
        at: iso(1),
        via: 'outlook',
        addedBy: '',
        note: 'Application: Senior Backend',
        roleHint: 'Senior Backend',
        draft: { name: 'Amir Haddad', location: 'Berlin' },
        state: 'waiting',
        sample: true,
      },
      {
        id: SAMPLE_SUBMISSION_IDS.sofia,
        at: iso(2),
        via: 'capture',
        addedBy: 'Sam',
        note: undefined,
        draft: { name: 'Sofia Karlsson', linkedin: 'https://linkedin.com/in/sofiakarlsson' },
        sourceUrl: 'https://linkedin.com/in/sofiakarlsson',
        state: 'waiting',
        sample: true,
      },
    ];
    await db.submissions.bulkPut(submissions);
  }
}
