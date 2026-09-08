import type { Candidate, Role, Process, Match, Activity, Sequence } from '../types';

const FOLDER_NAME = 'Silver Medalist HQ';
const SNAPSHOT_FILENAME = 'snapshot.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveSnapshot {
  v: 2;
  updatedAt: string;
  tables: {
    candidates: Candidate[];
    roles: Role[];
    processes: Process[];
    matches: Match[];
    activities: Activity[];
    sequences: Sequence[];
  };
}

/**
 * Owner-only Google Drive sync. Untouched folder/token logic from v1 — new in v2 is a single
 * versioned `snapshot.json` (whole-bench JSON, `updatedAt` compare) instead of separate
 * jobs/candidates/matches files. See dataService.syncWithDrive() for the newer-of / conflict
 * decision — this class is pure Drive I/O and knows nothing about "newer" or "conflict".
 */
class DriveService {
  private token: string | null = null;
  private folderId: string | null = null;
  private fileIds: Record<string, string> = {};

  setToken(token: string | null) {
    this.token = token;
    this.folderId = null;
    this.fileIds = {};
  }

  isConnected(): boolean {
    return !!this.token;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  private async findOrCreateFolder(): Promise<string> {
    if (this.folderId) return this.folderId;
    const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
      headers: this.headers
    });
    const data = await res.json();
    if (data.files?.length > 0) {
      this.folderId = data.files[0].id;
      return this.folderId!;
    }
    const create = await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    const folder = await create.json();
    this.folderId = folder.id;
    return this.folderId!;
  }

  private async findFile(name: string): Promise<string | null> {
    if (this.fileIds[name]) return this.fileIds[name];
    const folderId = await this.findOrCreateFolder();
    const q = `name='${name}' and '${folderId}' in parents and trashed=false`;
    const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
      headers: this.headers
    });
    const data = await res.json();
    const id = data.files?.[0]?.id || null;
    if (id) this.fileIds[name] = id;
    return id;
  }

  private async readJSON<T>(filename: string): Promise<T | null> {
    if (!this.token) return null;
    try {
      const fileId = await this.findFile(filename);
      if (!fileId) return null;
      const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: this.headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async writeJSON(filename: string, data: unknown): Promise<void> {
    if (!this.token) return;
    try {
      const folderId = await this.findOrCreateFolder();
      const content = JSON.stringify(data);
      const existingId = await this.findFile(filename);

      if (existingId) {
        await fetch(`${UPLOAD_API}/files/${existingId}?uploadType=media`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
          body: content
        });
      } else {
        const boundary = 'smhq_mp';
        const body = [
          `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
          JSON.stringify({ name: filename, parents: [folderId] }),
          `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
          content,
          `\r\n--${boundary}--`
        ].join('');
        const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body
        });
        const file = await res.json();
        if (file.id) this.fileIds[filename] = file.id;
      }
    } catch (e) {
      console.warn('[Drive] write failed:', e);
    }
  }

  /** Reads the whole-bench snapshot, or null if not signed in / nothing saved yet. */
  async readSnapshot(): Promise<DriveSnapshot | null> {
    const data = await this.readJSON<DriveSnapshot>(SNAPSHOT_FILENAME);
    if (!data || data.v !== 2 || !data.tables) return null;
    return data;
  }

  /** Overwrites the whole-bench snapshot. Caller (dataService) owns debouncing. */
  async writeSnapshot(snapshot: DriveSnapshot): Promise<void> {
    await this.writeJSON(SNAPSHOT_FILENAME, snapshot);
  }

  async uploadResumeToDrive(filename: string, base64: string, mimeType: string): Promise<string> {
    if (!this.token) return '';
    try {
      const folderId = await this.findOrCreateFolder();
      const boundary = 'smhq_resume';
      const body = [
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
        JSON.stringify({ name: filename, parents: [folderId] }),
        `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`,
        base64,
        `\r\n--${boundary}--`
      ].join('');
      const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      });
      const file = await res.json();
      return file.id || '';
    } catch {
      return '';
    }
  }
}

export const driveService = new DriveService();
