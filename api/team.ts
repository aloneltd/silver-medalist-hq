import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, clientIp } from './_lib/fastai.js';
import {
  driveEnvConfigured, missingEnvReason, findOrCreateFolder, findFile, readJSON, writeJSON,
  listFiles, shareFolderWith,
} from './_lib/drive.js';
import { checkAddLinkToken, newExpiry, type AddLinkRecord } from '../src/v3/team/tokenLogic.js';
import type { TeamMember, Submission } from '../src/types/index.js';

/**
 * The shared Team store, over Google Drive — one JSON file per record plus an append-only
 * change log, field-level last-writer-wins. `api/_lib/drive.ts` is pure file I/O; every merge
 * decision lives here.
 *
 * Never a 500 for "not configured": that is a normal, expected deployment state (most demos
 * of this app run in local-only mode), so it is always a clean 200 with `configured:false`.
 */

// -------------------------------------------------------------------------------- record shape

interface StoredRecord<T> {
  record: T;
  /** ISODate per field, so a newer write to `role` never gets clobbered by an older `name`. */
  fieldTimestamps: Record<string, string>;
}

export interface Conflict {
  field: string;
  keptValue: unknown;
  keptAt: string;
  incomingValue: unknown;
  incomingAt: string;
}

interface ChangeLogEntry {
  at: string;
  actor: string;
  collection: 'members' | 'submissions' | 'addLink';
  id: string;
  fields: string[];
}

const CHANGELOG_FILE = 'changelog.json';
const ADDLINK_FILE = 'addlink.json';
const CHANGELOG_MAX = 500;

function memberFile(id: string) { return `member-${id}.json`; }
function submissionFile(id: string) { return `submission-${id}.json`; }

/**
 * Field-level last-writer-wins: for each field in `incoming`, the newer of the incoming
 * timestamp and the stored one wins. A field with no prior timestamp always accepts the
 * incoming value. Ties favour the existing value (a write never clobbers a simultaneous one).
 */
export function mergeFields<T extends Record<string, unknown>>(
  existing: StoredRecord<T> | null,
  incoming: Partial<T>,
  at: string,
  base: T,
): { merged: StoredRecord<T>; conflicts: Conflict[] } {
  const record: T = existing ? { ...existing.record } : { ...base };
  const fieldTimestamps: Record<string, string> = existing ? { ...existing.fieldTimestamps } : {};
  const conflicts: Conflict[] = [];

  for (const key of Object.keys(incoming) as (keyof T)[]) {
    const incomingValue = incoming[key];
    if (incomingValue === undefined) continue;
    const priorAt = fieldTimestamps[key as string];
    if (!priorAt || new Date(at).getTime() > new Date(priorAt).getTime()) {
      record[key] = incomingValue as T[keyof T];
      fieldTimestamps[key as string] = at;
    } else {
      conflicts.push({
        field: key as string,
        keptValue: record[key],
        keptAt: priorAt,
        incomingValue,
        incomingAt: at,
      });
    }
  }

  return { merged: { record, fieldTimestamps }, conflicts };
}

async function appendChangeLog(folderId: string, entry: ChangeLogEntry): Promise<void> {
  const fileId = await findFile(folderId, CHANGELOG_FILE);
  const existing = fileId ? ((await readJSON<ChangeLogEntry[]>(fileId)) ?? []) : [];
  const next = [...existing, entry].slice(-CHANGELOG_MAX);
  await writeJSON(folderId, CHANGELOG_FILE, next);
}

// --------------------------------------------------------------------------------- read-all

async function readAllOfKind<T>(folderId: string, prefix: string): Promise<T[]> {
  const files = await listFiles(folderId);
  const matching = files.filter(f => f.name.startsWith(prefix) && f.name.endsWith('.json'));
  const rows = await Promise.all(matching.map(f => readJSON<StoredRecord<T>>(f.id)));
  return rows.filter((r): r is StoredRecord<T> => !!r).map(r => r.record);
}

// ------------------------------------------------------------------------------------ handler

interface UpsertBody {
  op: 'upsertMember' | 'upsertSubmission' | 'deleteMember' | 'invite' | 'setAddLink' | 'recordAddLinkUse';
  id?: string;
  fields?: Record<string, unknown>;
  actor?: string;
  email?: string;
  role?: TeamMember['role'];
  submitterLabel?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!rateLimit(clientIp(req.headers as Record<string, unknown>), 40)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  if (!driveEnvConfigured()) {
    return res.status(200).json({ configured: false, reason: missingEnvReason() });
  }

  try {
    const folderId = await findOrCreateFolder();

    if (req.method === 'GET') {
      const action = (req.query.action as string | undefined) ?? 'status';

      if (action === 'checkToken') {
        const token = (req.query.token as string | undefined) ?? '';
        const linkFileId = await findFile(folderId, ADDLINK_FILE);
        const stored = linkFileId ? await readJSON<StoredRecord<AddLinkRecord>>(linkFileId) : null;
        const status = checkAddLinkToken(stored?.record ?? null, token);
        return res.status(200).json({ configured: true, status });
      }

      const [members, submissions] = await Promise.all([
        readAllOfKind<TeamMember>(folderId, 'member-'),
        readAllOfKind<Submission>(folderId, 'submission-'),
      ]);
      const linkFileId = await findFile(folderId, ADDLINK_FILE);
      const addLink = linkFileId ? ((await readJSON<StoredRecord<AddLinkRecord>>(linkFileId))?.record ?? null) : null;
      return res.status(200).json({ configured: true, members, submissions, addLink });
    }

    // POST
    const body = (req.body ?? {}) as UpsertBody;
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim() : 'Someone';
    const at = new Date().toISOString();

    if (body.op === 'invite') {
      if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        return res.status(200).json({ configured: true, ok: false, reason: 'That does not look like an email address.' });
      }
      try {
        await shareFolderWith(folderId, body.email, 'writer');
      } catch (err) {
        return res.status(200).json({ configured: true, ok: false, reason: err instanceof Error ? err.message : 'Sharing the folder failed.' });
      }
      const id = body.id ?? `inv_${Date.now()}`;
      const base: TeamMember = { id, name: body.email, email: body.email, role: body.role ?? 'contributor', addedAt: at };
      const existingId = await findFile(folderId, memberFile(id));
      const existing = existingId ? await readJSON<StoredRecord<TeamMember>>(existingId) : null;
      const { merged } = mergeFields<TeamMember & Record<string, unknown>>(
        existing as StoredRecord<TeamMember & Record<string, unknown>> | null,
        { name: body.email, email: body.email, role: body.role ?? 'contributor', addedAt: at } as Partial<TeamMember & Record<string, unknown>>,
        at,
        base as TeamMember & Record<string, unknown>,
      );
      await writeJSON(folderId, memberFile(id), merged);
      await appendChangeLog(folderId, { at, actor, collection: 'members', id, fields: ['name', 'email', 'role', 'addedAt'] });
      return res.status(200).json({ configured: true, ok: true, member: merged.record });
    }

    if (body.op === 'upsertMember' || body.op === 'upsertSubmission') {
      if (!body.id || !body.fields) return res.status(400).json({ error: 'id and fields are required' });
      const collection = body.op === 'upsertMember' ? 'members' as const : 'submissions' as const;
      const filename = body.op === 'upsertMember' ? memberFile(body.id) : submissionFile(body.id);
      const existingId = await findFile(folderId, filename);
      const existing = existingId ? await readJSON<StoredRecord<Record<string, unknown>>>(existingId) : null;
      const base = { id: body.id, ...body.fields } as Record<string, unknown>;
      const { merged, conflicts } = mergeFields(existing, body.fields, at, base);
      await writeJSON(folderId, filename, merged);
      await appendChangeLog(folderId, { at, actor, collection, id: body.id, fields: Object.keys(body.fields) });
      return res.status(200).json({ configured: true, ok: true, record: merged.record, conflicts });
    }

    if (body.op === 'deleteMember') {
      if (!body.id) return res.status(400).json({ error: 'id is required' });
      // Soft delete: keep the file (so a concurrent edit elsewhere can't resurrect a ghost
      // with no history) but flag it — readers filter deleted:true out.
      const filename = memberFile(body.id);
      const existingId = await findFile(folderId, filename);
      const existing = existingId ? await readJSON<StoredRecord<Record<string, unknown>>>(existingId) : null;
      const { merged } = mergeFields(existing, { deleted: true }, at, { id: body.id, deleted: true });
      await writeJSON(folderId, filename, merged);
      await appendChangeLog(folderId, { at, actor, collection: 'members', id: body.id, fields: ['deleted'] });
      return res.status(200).json({ configured: true, ok: true });
    }

    if (body.op === 'setAddLink' || body.op === 'recordAddLinkUse') {
      const existingId = await findFile(folderId, ADDLINK_FILE);
      const existing = existingId ? await readJSON<StoredRecord<AddLinkRecord>>(existingId) : null;
      let fields: Partial<AddLinkRecord>;
      if (body.op === 'setAddLink') {
        fields = (body.fields as Partial<AddLinkRecord>) ?? {};
      } else {
        const current = existing?.record ?? { token: '', createdAt: at, expiresAt: newExpiry(), revoked: false, useCount: 0, users: [] };
        const label = body.submitterLabel || 'Someone';
        fields = {
          useCount: current.useCount + 1,
          users: current.users.includes(label) ? current.users : [...current.users, label],
        };
      }
      const base: AddLinkRecord = { token: '', createdAt: at, expiresAt: newExpiry(), revoked: false, useCount: 0, users: [] };
      const { merged, conflicts } = mergeFields<AddLinkRecord & Record<string, unknown>>(
        existing as StoredRecord<AddLinkRecord & Record<string, unknown>> | null,
        fields as Partial<AddLinkRecord & Record<string, unknown>>,
        at,
        base as AddLinkRecord & Record<string, unknown>,
      );
      await writeJSON(folderId, ADDLINK_FILE, merged);
      await appendChangeLog(folderId, { at, actor, collection: 'addLink', id: 'addLink', fields: Object.keys(fields) });
      return res.status(200).json({ configured: true, ok: true, addLink: merged.record, conflicts });
    }

    return res.status(400).json({ error: 'Unknown op' });
  } catch (err) {
    console.error('[api/team]', err instanceof Error ? err.message : String(err));
    // Still not a 500 for the caller's sake when we can tell it's a config/auth problem —
    // but a genuine unexpected failure is a 502 (upstream Drive problem), never silent.
    return res.status(502).json({ configured: true, error: 'The shared team store had a problem. Local data is unaffected.' });
  }
}
