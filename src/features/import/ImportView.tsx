import { useRef, useState } from 'react';
import { dataService } from '../../services/dataService';
import type { ImportPreviewItem } from '../../services/dataService';
import { Button, Chip, Table, THead, TBody, TR, TH, TD, useToast } from '../../ui';
import { parseCsv, csvToObjects, looksLikeLinkedInExport, rowToCandidateDraft, draftToCandidate } from './csv';
import type { Candidate, ParseResumeResponseBody } from '../../types';
import { ulid } from '../../lib/ulid';

type Mode = 'csv' | 'resume';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resumeToCandidate(parsed: ParseResumeResponseBody): Candidate {
  const now = new Date().toISOString();
  return {
    id: ulid(),
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone,
    linkedin: parsed.linkedin,
    location: parsed.location ?? 'unspecified',
    onsiteDays: parsed.onsiteDays,
    currentEmployer: parsed.currentEmployer ?? 'unspecified',
    currentTitle: parsed.currentTitle ?? 'unspecified',
    tenureStart: parsed.tenureStart ?? now,
    seniority: parsed.seniority ?? 'mid',
    skills: parsed.skills ?? [],
    compAtLastProcess: parsed.compAtLastProcess,
    compExpectation: parsed.compExpectation,
    noticePeriodDays: parsed.noticePeriodDays,
    visaNeed: parsed.visaNeed,
    tags: ['imported', 'resume'],
    status: 'active',
    warmthAt: now,
    sourceDate: now,
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * BLUEPRINT-v2.md: "CSV/LinkedIn export/bulk résumé with dedupe on email or name+employer,
 * merge preview before write." Dedupe + commit are B1's dataService.{previewCandidateImport,
 * commitCandidateImport} — this screen owns file handling, parsing and the preview UI only.
 */
export function ImportView() {
  const [mode, setMode] = useState<Mode>('csv');
  const [preview, setPreview] = useState<ImportPreviewItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const [resumeErrors, setResumeErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  const runPreview = async (incoming: Candidate[], label: string) => {
    setBusy(true);
    try {
      const items = await dataService.previewCandidateImport(incoming);
      setPreview(items);
      setSourceLabel(label);
    } finally {
      setBusy(false);
    }
  };

  const onCsvFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    const { headers, records } = csvToObjects(rows);
    const isLinkedIn = looksLikeLinkedInExport(headers);
    const drafts = records
      .map(r => rowToCandidateDraft(r, isLinkedIn))
      .filter((d): d is NonNullable<typeof d> => d !== null);
    const candidates = drafts.map(draftToCandidate);
    await runPreview(candidates, `${file.name} (${isLinkedIn ? 'LinkedIn export' : 'CSV'}, ${candidates.length} rows)`);
  };

  const onResumeFiles = async (files: FileList) => {
    setBusy(true);
    setResumeErrors([]);
    const candidates: Candidate[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const base64 = await fileToBase64(file);
        const res = await fetch('/api/parse-resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, mimeType: file.type, filename: file.name }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = (await res.json()) as ParseResumeResponseBody;
        candidates.push(resumeToCandidate(parsed));
      } catch {
        errors.push(file.name);
      }
    }
    setResumeErrors(errors);
    setBusy(false);
    if (candidates.length) await runPreview(candidates, `${candidates.length} résumé(s) parsed`);
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { created, merged } = await dataService.commitCandidateImport(preview);
      push(`Imported: ${created} new, ${merged} merged.`, { tone: 'success' });
      setPreview(null);
      setSourceLabel('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="smhq-page">
      <div className="smhq-page-header">
        <div>
          <h1>Import</h1>
          <p>CSV, a LinkedIn connections export, or bulk résumé parsing — every row goes through the same dedupe preview.</p>
        </div>
      </div>

      <div className="smhq-import-tabs" role="tablist" aria-label="Import source">
        <Chip tone="accent" selected={mode === 'csv'} onClick={() => { setMode('csv'); setPreview(null); }}>
          CSV / LinkedIn export
        </Chip>
        <Chip tone="accent" selected={mode === 'resume'} onClick={() => { setMode('resume'); setPreview(null); }}>
          Bulk résumé
        </Chip>
      </div>

      {!preview && (
        <div className="smhq-import-drop">
          <input
            ref={fileInputRef}
            type="file"
            accept={mode === 'csv' ? '.csv,text/csv' : '.pdf,.doc,.docx,image/*'}
            multiple={mode === 'resume'}
            style={{ display: 'none' }}
            onChange={e => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              if (mode === 'csv') void onCsvFile(files[0]);
              else void onResumeFiles(files);
              e.target.value = '';
            }}
          />
          <p>{mode === 'csv' ? 'Upload a CSV file, or a LinkedIn "Connections.csv" export.' : 'Upload one or more résumés (PDF, DOC, or image).'}</p>
          <Button variant="primary" onClick={() => fileInputRef.current?.click()} loading={busy}>
            Choose file{mode === 'resume' ? 's' : ''}
          </Button>
          {resumeErrors.length > 0 && (
            <p className="smhq-import-error">Couldn't parse: {resumeErrors.join(', ')}</p>
          )}
        </div>
      )}

      {preview && (
        <div className="smhq-import-preview">
          <div className="smhq-import-preview-head">
            <p>{sourceLabel} — {preview.filter(p => p.action === 'create').length} new, {preview.filter(p => p.action === 'merge').length} will merge into existing records.</p>
            <div className="smhq-import-preview-actions">
              <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
              <Button variant="primary" onClick={commit} loading={busy}>Commit import</Button>
            </div>
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Employer</TH>
                <TH>Email</TH>
                <TH>Action</TH>
              </tr>
            </THead>
            <TBody>
              {preview.map((item, i) => (
                <TR key={i}>
                  <TD>{item.incoming.name}</TD>
                  <TD>{item.incoming.currentEmployer}</TD>
                  <TD>{item.incoming.email ?? '—'}</TD>
                  <TD>
                    <Chip as="span" tone={item.action === 'merge' ? 'amber' : 'green'}>
                      {item.action === 'merge' ? `Merge into ${item.existing?.name}` : 'Create new'}
                    </Chip>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
