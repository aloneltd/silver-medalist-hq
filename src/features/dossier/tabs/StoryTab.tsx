import { useState } from 'react';
import type { Process } from '../../../types';
import { dataService } from '../../../services/dataService';
import { Button, Textarea } from '../../../ui';
import { cx } from '../../bench/lib/tokens';

function ProcessRow({ process, candidateId }: { process: Process; candidateId: string }) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(process.reason);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await dataService.put('processes', { ...process, reason: reason.trim(), updatedAt: new Date().toISOString() });
      await dataService.logActivity({
        candidateId, roleId: process.roleId, type: 'note', actor: 'owner',
        body: `Edited the process reason: ${reason.trim()}`,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={`rounded-[8px] border p-2 ${cx.border}`}>
      <div className={`flex items-center justify-between text-xs ${cx.muted}`}>
        <span>{new Date(process.date).toLocaleDateString()}</span>
        <span className="capitalize">{process.finishedAs.replace(/_/g, ' ')}</span>
      </div>

      {editing ? (
        <div className="mt-1 flex flex-col gap-2">
          <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={save} loading={saving}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setReason(process.reason); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`mt-1 block w-full rounded-[6px] p-1 text-left ${cx.ink} hover:bg-[var(--panel-2,#1c2127)]`}
          title="Click to edit the reason"
        >
          {process.reason || <span className={cx.muted}>No reason recorded — click to add one.</span>}
        </button>
      )}

      {process.lostTo && <p className={`mt-1 text-xs ${cx.muted}`}>Lost to {process.lostTo}</p>}
    </li>
  );
}

export function StoryTab({ candidateId }: { candidateId: string }) {
  const processes = dataService.hooks.useProcessesForCandidate(candidateId) ?? [];

  if (processes.length === 0) {
    return <p className={`text-sm ${cx.muted}`}>No recorded processes yet — the story starts with the first one.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {processes.map(p => <ProcessRow key={p.id} process={p} candidateId={candidateId} />)}
    </ul>
  );
}
