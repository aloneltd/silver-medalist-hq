/**
 * Thin client for /api/team — the only place src/v3/team code talks to the network. Every
 * function degrades to `{configured:false}` instead of throwing, because "the shared store
 * isn't set up yet" is the expected state for almost every deployment of this app, not an
 * error.
 */
import type { TeamMember, Submission, TeamRole } from '../../types';
import type { AddLinkRecord, TokenStatus } from './tokenLogic';

export interface StatusResult { configured: boolean; reason?: string }
export interface SnapshotResult extends StatusResult {
  members?: TeamMember[];
  submissions?: Submission[];
  addLink?: AddLinkRecord | null;
}
export interface WriteResult {
  configured: boolean;
  ok?: boolean;
  reason?: string;
  record?: unknown;
  member?: TeamMember;
  addLink?: AddLinkRecord;
  conflicts?: unknown[];
}

async function callGet(params: Record<string, string> = {}): Promise<SnapshotResult> {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/team${qs ? `?${qs}` : ''}`);
    if (!res.ok) return { configured: false, reason: `The shared team store returned an error (${res.status}).` };
    return (await res.json()) as SnapshotResult;
  } catch {
    return { configured: false, reason: 'Could not reach the shared team store from this browser.' };
  }
}

async function callPost(body: Record<string, unknown>): Promise<WriteResult> {
  try {
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { configured: false, ok: false, reason: `The shared team store returned an error (${res.status}).` };
    return (await res.json()) as WriteResult;
  } catch {
    return { configured: false, ok: false, reason: 'Could not reach the shared team store from this browser.' };
  }
}

export async function fetchTeamStatus(): Promise<StatusResult> {
  return callGet();
}

export async function pullShared(): Promise<SnapshotResult> {
  return callGet();
}

export async function checkTokenShared(token: string): Promise<{ configured: boolean; status?: TokenStatus; reason?: string }> {
  return callGet({ action: 'checkToken', token });
}

export async function inviteTeammateShared(email: string, role: TeamRole, actor: string): Promise<{ configured: boolean; ok?: boolean; reason?: string; member?: TeamMember }> {
  return callPost({ op: 'invite', email, role, actor });
}

export async function upsertMemberShared(id: string, fields: Partial<TeamMember>, actor: string): Promise<WriteResult> {
  return callPost({ op: 'upsertMember', id, fields, actor });
}

export async function upsertSubmissionShared(id: string, fields: Partial<Submission>, actor: string): Promise<WriteResult> {
  return callPost({ op: 'upsertSubmission', id, fields, actor });
}

export async function setAddLinkShared(fields: Partial<AddLinkRecord>, actor: string): Promise<WriteResult> {
  return callPost({ op: 'setAddLink', fields, actor });
}

export async function recordAddLinkUseShared(submitterLabel: string, actor = 'Public form'): Promise<WriteResult> {
  return callPost({ op: 'recordAddLinkUse', submitterLabel, actor });
}
