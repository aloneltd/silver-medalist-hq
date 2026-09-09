import { useEffect, useState } from 'react';
import { Btn, Card, Empty, Skel } from '../ui';
import { useToast } from '../../ui';
import type { ImportBatch } from '../../types';
import { listImports, undoImport } from '../import';
import { friendlyEngineError, pluralize } from './format';

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * "What you imported" — every committed batch, newest first, each undoable for 30 days
 * (DESIGN-v3.md pillar 1). Reads through `listImports`/`undoImport` only; nothing here writes.
 */
export function ImportHistory({ refreshKey }: { refreshKey: number }) {
  const [batches, setBatches] = useState<ImportBatch[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const { push } = useToast();

  useEffect(() => {
    let cancelled = false;
    listImports()
      .then(list => { if (!cancelled) { setBatches(list); setLoadError(null); } })
      .catch(e => { if (!cancelled) { setBatches([]); setLoadError(friendlyEngineError(e, 'Loading your import history')); } });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function handleUndo(batch: ImportBatch) {
    setUndoingId(batch.id);
    try {
      await undoImport(batch.id);
      setBatches(prev => prev?.map(b => (b.id === batch.id ? { ...b, undone: true } : b)) ?? prev);
      push(`Undone — ${batch.sourceLabel} is back the way it was.`, { tone: 'success' });
    } catch (e) {
      push(friendlyEngineError(e, 'Undoing that import'), { tone: 'danger' });
    } finally {
      setUndoingId(null);
    }
  }

  if (batches === null) {
    return <div className="p-col p-gap-3 p-mt-4"><Skel height={64} /><Skel height={64} /></div>;
  }

  if (batches.length === 0) {
    return (
      <Empty title="Nothing imported yet">
        {loadError ?? 'Once you add people from a drop, a paste, or a connector, every import shows up here — and every one can be undone.'}
      </Empty>
    );
  }

  return (
    <div className="p-col p-gap-3 p-mt-4">
      {batches.map(batch => (
        <Card key={batch.id} className="p-row p-gap-4 p-wrap" style={{ padding: '16px 20px' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="p-strong">{batch.filename ?? batch.sourceLabel}</div>
            <div className="p-meta p-mt-1">
              {dateLabel(batch.at)} · {batch.actor} · {pluralize(batch.createdIds.length, 'person added', 'people added')}
              {batch.mergedIds.length > 0 && `, ${pluralize(batch.mergedIds.length, 'merge')}`}
            </div>
          </div>
          {batch.undone ? (
            <span className="p-meta">Undone</span>
          ) : (
            <Btn size="sm" onClick={() => handleUndo(batch)} disabled={undoingId === batch.id}>
              {undoingId === batch.id ? 'Undoing…' : 'Undo'}
            </Btn>
          )}
        </Card>
      ))}
    </div>
  );
}
