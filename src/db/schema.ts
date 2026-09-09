import Dexie, { type Table } from 'dexie';
import type {
  Candidate, Role, Process, Match, Activity, Sequence, SettingRecord,
  ImportBatch, Submission, TeamMember,
} from '../types';

/**
 * Dexie v1 schema — BLUEPRINT-v2.md "Data model" section, verbatim indexes.
 *
 * `&[a+b]` is a Dexie *unique* compound index: for `processes` and `matches` this means one
 * row per (candidateId, roleId) pair. That is deliberate for `matches` (a match is the current
 * score for that pair — re-scoring upserts it). For `processes` it means the *latest* process
 * record for a given candidate+role pair is what's kept; a second process against the same
 * role for the same candidate upserts rather than appending. That matches how this bench is
 * actually used (one candidacy record per req), and keeps the promise in BLUEPRINT-v2.md.
 */
export class SilverMedalistDB extends Dexie {
  candidates!: Table<Candidate, string>;
  roles!: Table<Role, string>;
  processes!: Table<Process, string>;
  matches!: Table<Match, string>;
  activities!: Table<Activity, string>;
  sequences!: Table<Sequence, string>;
  settings!: Table<SettingRecord, string>;
  /** v3 — one row per committed import, so any import can be undone for 30 days. */
  imports!: Table<ImportBatch, string>;
  /** v3 — the Inbox: everything a teammate, a link or a mailbox proposed, pre-bench. */
  submissions!: Table<Submission, string>;
  /** v3 — who shares this bench, and what they are allowed to do. */
  team!: Table<TeamMember, string>;

  constructor(name = 'silver-medalist-hq') {
    super(name);
    this.version(1).stores({
      candidates: 'id, name, *skills, status, warmthAt, updatedAt',
      roles: 'id, status, updatedAt',
      processes: 'id, candidateId, roleId, &[candidateId+roleId], date',
      matches: 'id, roleId, candidateId, &[roleId+candidateId], score, updatedAt',
      activities: 'id, candidateId, roleId, at, type',
      sequences: 'id, candidateId, roleId, nextDueAt',
      settings: 'key',
    });

    /**
     * v3 — three additive tables. Dexie carries every v1 store forward automatically when a
     * later version only adds stores, so an existing bench upgrades in place with no data
     * migration and no re-seed. `source` on Candidate is optional for exactly that reason:
     * people already on a v2 bench keep working and simply show no badge until they are
     * re-imported.
     */
    this.version(2).stores({
      imports: 'id, at, kind, undone',
      submissions: 'id, at, state, via',
      team: 'id, email, role',
    });
  }
}

/** Single shared instance — swap in tests via `new SilverMedalistDB('test-db-name')`. */
export const db = new SilverMedalistDB();
