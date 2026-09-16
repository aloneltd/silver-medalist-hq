/**
 * Server-side Google Drive I/O for the shared Team store — exchanges a long-lived refresh
 * token for a short-lived access token (cached in module scope until it expires) and does
 * plain file CRUD in one folder. Pure I/O: no merge logic, no knowledge of "team" or
 * "submission" — that lives in api/team.ts, same split as src/services/driveService.ts keeps
 * for the owner-only v2 sync.
 *
 * NEVER logs or returns the refresh token or the access token. Every thrown error message is
 * safe to show a user or put in a response body.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const TEAM_FOLDER_NAME = 'Silver Medalist HQ — Team';

/** True when every env var the shared store needs is present on this deployment. */
export function driveEnvConfigured(): boolean {
  return !!(process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The exact sentence the API returns when a required env var is missing. Never guesses which. */
export function missingEnvReason(): string {
  const missing = [
    !process.env.GOOGLE_REFRESH_TOKEN && 'GOOGLE_REFRESH_TOKEN',
    !process.env.GOOGLE_CLIENT_ID && 'GOOGLE_CLIENT_ID',
    !process.env.GOOGLE_CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET',
  ].filter(Boolean).join(', ');
  return `The shared team store needs ${missing} set on this deployment. Team data is staying in this browser until then.`;
}

let cachedToken: { token: string; exp: number } | null = null;

/** Exchanges the refresh token for an access token, cached in module scope until near-expiry. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.exp > now + 30_000) return cachedToken.token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    // Deliberately not including the response body — Google's OAuth error payloads can echo
    // back parts of the request.
    throw new Error(`Google token exchange failed (${res.status}).`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google token exchange returned no access token.');
  cachedToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return json ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { Authorization: `Bearer ${token}` };
}

export interface DriveFile { id: string; name: string }

export async function findOrCreateFolder(name: string = TEAM_FOLDER_NAME): Promise<string> {
  const headers = await authHeaders(false);
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, { headers });
  if (!res.ok) throw new Error(`Drive folder lookup failed (${res.status}).`);
  const data = (await res.json()) as { files?: DriveFile[] };
  if (data.files && data.files.length > 0) return data.files[0].id;

  const create = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!create.ok) throw new Error(`Drive folder creation failed (${create.status}).`);
  const folder = (await create.json()) as { id: string };
  return folder.id;
}

/** Every file directly inside the folder — small folder, one page is always enough here. */
export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const headers = await authHeaders(false);
  const q = `'${folderId}' in parents and trashed=false`;
  const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=200`, { headers });
  if (!res.ok) throw new Error(`Drive file listing failed (${res.status}).`);
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

export async function findFile(folderId: string, name: string): Promise<string | null> {
  const files = await listFiles(folderId);
  return files.find(f => f.name === name)?.id ?? null;
}

export async function readJSON<T>(fileId: string): Promise<T | null> {
  const headers = await authHeaders(false);
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers });
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Upsert-by-name. Returns the file id (new or existing). */
export async function writeJSON(folderId: string, name: string, data: unknown): Promise<string> {
  const existingId = await findFile(folderId, name);
  const content = JSON.stringify(data);
  if (existingId) {
    const res = await fetch(`${UPLOAD_API}/files/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: content,
    });
    if (!res.ok) throw new Error(`Drive write failed (${res.status}).`);
    return existingId;
  }
  const boundary = 'smhq_team_mp';
  const body = [
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    JSON.stringify({ name, parents: [folderId] }),
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
    content,
    `\r\n--${boundary}--`,
  ].join('');
  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { Authorization: (await authHeaders(false)).Authorization, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Drive create failed (${res.status}).`);
  const file = (await res.json()) as { id: string };
  return file.id;
}

/** Shares the team folder with one email address — the invite flow's actual Drive call. */
export async function shareFolderWith(folderId: string, email: string, role: 'reader' | 'writer' = 'writer'): Promise<void> {
  const res = await fetch(`${DRIVE_API}/files/${folderId}/permissions?sendNotificationEmail=true`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ role, type: 'user', emailAddress: email }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const reason = body.includes('invalidSharingRequest') ? 'that address could not be shared with' : `Drive sharing failed (${res.status})`;
    throw new Error(reason);
  }
}

/** Test-only escape hatch: clears the cached access token between test cases. */
export function __resetTokenCacheForTests(): void {
  cachedToken = null;
}
