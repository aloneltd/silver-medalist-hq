import { useState } from 'react';
import { dataService } from '../../../services/dataService';
import { addNote } from '../../bench/lib/actions';
import { Button, Textarea } from '../../../ui';
import { cx } from '../../bench/lib/tokens';

export function NotesTab({ candidateId }: { candidateId: string }) {
  const candidate = dataService.hooks.useCandidate(candidateId);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const notes = candidate?.notes ?? [];

  const submit = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await addNote(candidateId, draft.trim());
      setDraft('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Textarea
          id="dossier-new-note"
          label="Add a note"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={3}
          placeholder="Anything worth remembering — a preference, a red flag, a quote."
        />
        <Button size="sm" variant="primary" onClick={submit} disabled={!draft.trim()} loading={saving} className="self-start">
          Add note
        </Button>
      </div>

      {notes.length === 0 ? (
        <p className={`text-sm ${cx.muted}`}>No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {[...notes].reverse().map(n => (
            <li key={n.id} className={`rounded-[8px] border p-2 text-sm ${cx.border}`}>
              <p className={cx.ink}>{n.body}</p>
              <p className={`mt-1 text-[11px] ${cx.muted}`}>{n.actor} · {new Date(n.at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
