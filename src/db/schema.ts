import Dexie, { type Table } from 'dexie';
import type { Candidate, Role, Process, Match, Activity, Sequence, SettingRecord } from '../types';

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
  }
}

/** Single shared instance — swap in tests via `new SilverMedalistDB('test-db-name')`. */
export const db = new SilverMedalistDB();
