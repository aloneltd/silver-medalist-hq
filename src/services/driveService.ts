import type { Job, Candidate, MatchResponse } from '../types';

const FOLDER_NAME = 'Silver Medalist HQ';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

class DriveService {
  private token: string | null = null;
  private folderId: string | null = null;
  private fileIds: Record<string, string> = {};

  setToken(token: string) {
    this.token = token;
    this.folderId = null;
    this.fileIds = {};
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

  async readJSON<T>(filename: string, defaultValue: T): Promise<T> {
    if (!this.token) return defaultValue;
    try {
      const fileId = await this.findFile(filename);
      if (!fileId) return defaultValue;
      const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, { headers: this.headers });
      if (!res.ok) return defaultValue;
      return await res.json();
    } catch {
      return defaultValue;
    }
  }

  async writeJSON(filename: string, data: unknown): Promise<void> {
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

  async loadAll(): Promise<{ jobs: Job[]; candidates: Candidate[]; matches: MatchResponse | null }> {
    const [jobs, candidates, matches] = await Promise.all([
      this.readJSON<Job[]>('jobs.json', []),
      this.readJSON<Candidate[]>('candidates.json', []),
      this.readJSON<MatchResponse | null>('matches.json', null),
    ]);
    return { jobs, candidates, matches };
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
