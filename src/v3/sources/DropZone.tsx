import { forwardRef, useImperativeHandle, useRef, useState, type DragEvent } from 'react';
import { ArrowUpFromLine, FileText } from 'lucide-react';
import { Btn, Dialog } from '../ui';
import { useToast } from '../../ui';
import { buildPlanFromFiles, buildPlanFromText } from '../import';
import type { ImportPlan } from '../../types';
import { friendlyEngineError } from './format';

export interface DropZoneHandle {
  /** Opens the plain multi-file picker — connector cards ("Add an export", "Drop a zip") reuse this. */
  openFilePicker: () => void;
}

interface Progress { done: number; total: number; label: string }

const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
function isJunkFile(name: string): boolean {
  return JUNK_NAMES.has(name) || name.startsWith('.');
}

/** Reads one FileSystemEntry (webkitGetAsEntry) into File[], recursing into directories. */
function readEntry(entry: FileSystemEntry): Promise<File[]> {
  return new Promise(resolve => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(
        file => resolve(isJunkFile(file.name) ? [] : [file]),
        () => resolve([]),
      );
      return;
    }
    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const collected: File[] = [];
      const readBatch = () => {
        reader.readEntries(
          async batch => {
            if (batch.length === 0) { resolve(collected); return; }
            const nested = await Promise.all(batch.map(readEntry));
            for (const files of nested) collected.push(...files);
            readBatch(); // directory readers cap each call at ~100 entries — keep draining it
          },
          () => resolve(collected),
        );
      };
      readBatch();
      return;
    }
    resolve([]);
  });
}

/** Flattens a drop's DataTransfer into File[], recursing into any dropped folders. */
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items || []);
  const withEntries = items.filter(it => it.kind === 'file' && typeof it.webkitGetAsEntry === 'function');
  if (withEntries.length > 0) {
    const entries = withEntries.map(it => it.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
    const nested = await Promise.all(entries.map(readEntry));
    return nested.flat();
  }
  return Array.from(dt.files || []).filter(f => !isJunkFile(f.name));
}

/**
 * The drop zone: drag-and-drop (files AND folders), a "Choose files" picker, and a "Paste a
 * list" dialog — the three ways DESIGN-v3's Sources hub gets anything read. All three funnel
 * into the same `onPlan` callback with the ImportPlan the engine builds, ready for review.
 */
export const DropZone = forwardRef<DropZoneHandle, { onPlan: (plan: ImportPlan) => void; busyElsewhere?: boolean }>(
  function DropZone({ onPlan, busyElsewhere }, ref) {
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<Progress | null>(null);
    const [pasteOpen, setPasteOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const { push } = useToast();

    useImperativeHandle(ref, () => ({
      openFilePicker: () => inputRef.current?.click(),
    }));

    const runFiles = async (files: File[]) => {
      if (files.length === 0) {
        push("Nothing readable was in that drop — check it isn't an empty folder.", { tone: 'danger' });
        return;
      }
      setBusy(true);
      setProgress({ done: 0, total: files.length, label: files[0]?.name ?? '' });
      try {
        const plan = await buildPlanFromFiles(files, {
          onProgress: (done, total, label) => setProgress({ done, total, label }),
        });
        onPlan(plan);
      } catch (e) {
        push(friendlyEngineError(e, `Reading ${files.length === 1 ? 'that file' : `those ${files.length} files`}`), { tone: 'danger' });
      } finally {
        setBusy(false);
        setProgress(null);
      }
    };

    const runText = async (text: string, label: string) => {
      setBusy(true);
      try {
        const plan = await buildPlanFromText(text, label || undefined);
        onPlan(plan);
        setPasteOpen(false);
      } catch (e) {
        push(friendlyEngineError(e, 'Reading that list'), { tone: 'danger' });
      } finally {
        setBusy(false);
      }
    };

    const onDrop = async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (busy) return;
      const files = await filesFromDataTransfer(e.dataTransfer);
      void runFiles(files);
    };

    const disabled = busy || !!busyElsewhere;

    return (
      <>
        <div
          className={`p-drop${dragOver ? ' p-drop-over' : ''}`}
          onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          aria-busy={busy}
        >
          <div className="p-drop-icon" aria-hidden="true">
            {busy ? <FileText size={28} color="var(--p-accent-ink)" /> : <ArrowUpFromLine size={28} color="var(--p-accent-ink)" />}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            {busy && progress ? (
              <div role="status" aria-live="polite">
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  Reading {progress.done} of {progress.total}{progress.label ? ` — ${progress.label}` : ''}
                </div>
                <div className="src-progress-track p-mt-3">
                  <div className="src-progress-fill" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.01em' }}>Drop anything here</div>
                <div className="p-sec p-mt-2" style={{ lineHeight: 1.5, fontSize: 15 }}>
                  Résumés (PDF, Word, many at once) · a spreadsheet · an export from Greenhouse, Lever, Ashby, Workable, Teamtailor
                  or Bullhorn · a LinkedIn Recruiter export · a Slack channel export · a folder. We read it, show you exactly what
                  we found, and you approve before anyone joins the bench.
                </div>
              </>
            )}
          </div>
          <div className="p-col p-gap-2">
            <Btn tone="primary" disabled={disabled} onClick={() => inputRef.current?.click()}>Choose files</Btn>
            <Btn disabled={disabled} onClick={() => setPasteOpen(true)}>Paste a list</Btn>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.doc,.docx,.csv,.tsv,.xlsx,.xls,.json,.zip"
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void runFiles(files);
            }}
          />
        </div>

        {pasteOpen && (
          <PasteListDialog busy={busy} onClose={() => setPasteOpen(false)} onSubmit={runText} />
        )}
      </>
    );
  },
);

function PasteListDialog(
  { onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (text: string, label: string) => void; busy: boolean },
) {
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  return (
    <Dialog
      title="Paste a list"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" disabled={!text.trim() || busy} onClick={() => onSubmit(text, label)}>
            {busy ? 'Reading…' : 'Read this list'}
          </Btn>
        </>
      }
    >
      <div className="p-col p-gap-4">
        <div className="p-hint">
          A CSV pasted from a spreadsheet, or just names and links copied from anywhere — one person per line works too.
        </div>
        <div className="src-capture-field">
          <label className="p-label" htmlFor="src-paste-label">What is this? (optional)</label>
          <input
            id="src-paste-label"
            className="p-input"
            placeholder="e.g. Referrals from the team channel"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </div>
        <div className="src-capture-field">
          <label className="p-label" htmlFor="src-paste-text">Paste here</label>
          <textarea
            id="src-paste-text"
            className="p-textarea"
            style={{ minHeight: 200 }}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Name, Email, Employer\nKofi Owusu, kofi@example.com, Acme'}
            autoFocus
          />
        </div>
      </div>
    </Dialog>
  );
}
