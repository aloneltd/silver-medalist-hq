import { useState } from 'react';
import type { CandidateStatus } from '../../types';
import { Dialog, Btn } from '../ui';
import { statusRequiresReason, defaultResurfaceDate } from '../../features/bench/lib/warmth';

export interface StatusDialogProps {
  candidateName: string;
  currentStatus: CandidateStatus;
  onClose: () => void;
  onSubmit: (status: CandidateStatus, reason: string, snoozeUntil?: string) => Promise<void> | void;
}

const STATUS_OPTIONS: { value: CandidateStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'silent', label: 'Went quiet' },
  { value: 'took_role', label: 'Took another role' },
  { value: 'do_not_reapproach', label: 'Do not approach' },
  { value: 'opted_out', label: 'Opted out / asked to be removed' },
];

/**
 * Paper-styled rebuild of v2.1's ChangeStatusDialog (src/features/dossier/ChangeStatusDialog.tsx)
 * — same rule, per BLUEPRINT-v2.md: a non-active status always asks for a reason, and
 * "took another role" always asks a resurface date, defaulting eighteen months out
 * (features/bench/lib/warmth.ts's defaultResurfaceDate/statusRequiresReason, reused not
 * reimplemented). do_not_reapproach and opted_out are just two more options here — the
 * places that must *honour* them (queues, AI prompts, lookalikes, outreach) already do,
 * per src/v3/lib/personText.ts's isOffLimits and src/lib/lookalikes.ts's EXCLUDED_STATUSES.
 */
export function StatusDialog({ candidateName, currentStatus, onClose, onSubmit }: StatusDialogProps) {
  const [status, setStatus] = useState<CandidateStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const [resurfaceDate, setResurfaceDate] = useState(() => defaultResurfaceDate().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const needsReason = statusRequiresReason(status);
  const canSubmit = !needsReason || reason.trim().length > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(status, reason.trim(), status === 'took_role' ? new Date(resurfaceDate).toISOString() : undefined);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      title={`Change status — ${candidateName}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" disabled={!canSubmit || submitting} onClick={submit}>Save</Btn>
        </>
      }
    >
      <div className="p-col p-gap-4">
        <div>
          <label className="p-label" htmlFor="pf-status-select">Status</label>
          <select
            id="pf-status-select"
            className="p-select"
            value={status}
            onChange={e => setStatus(e.target.value as CandidateStatus)}
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {needsReason && (
          <div>
            <label className="p-label" htmlFor="pf-status-reason">Reason</label>
            <textarea
              id="pf-status-reason"
              className="p-textarea"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="In your own words — this is the record that survives."
            />
          </div>
        )}

        {status === 'took_role' && (
          <div>
            <label className="p-label" htmlFor="pf-resurface-date">Resurface date</label>
            <input
              id="pf-resurface-date"
              type="date"
              className="p-input"
              value={resurfaceDate}
              onChange={e => setResurfaceDate(e.target.value)}
            />
            <div className="p-hint">Defaults to eighteen months from today — worth a ping around then.</div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
