import { useState } from 'react';
import type { CandidateStatus } from '../../types';
import { Dialog, Button, Textarea } from '../../ui';
import { statusRequiresReason, defaultResurfaceDate } from '../bench/lib/warmth';

export interface ChangeStatusDialogProps {
  open: boolean;
  onClose: () => void;
  candidateName: string;
  currentStatus: CandidateStatus;
  onSubmit: (status: CandidateStatus, reason: string, snoozeUntil?: string) => Promise<void> | void;
}

const STATUS_OPTIONS: { value: CandidateStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'silent', label: 'Went silent' },
  { value: 'took_role', label: 'Took another role' },
  { value: 'do_not_reapproach', label: 'Do not re-approach' },
  { value: 'opted_out', label: 'Opted out / erasure request' },
];

/** BLUEPRINT-v2.md: "status changes ask for the reason; took_role asks a resurface date
 *  defaulting +18 months." */
export function ChangeStatusDialog({ open, onClose, candidateName, currentStatus, onSubmit }: ChangeStatusDialogProps) {
  const [status, setStatus] = useState<CandidateStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const [resurfaceDate, setResurfaceDate] = useState(() => defaultResurfaceDate().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const needsReason = statusRequiresReason(status);
  const canSubmit = !needsReason || reason.trim().length > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(
        status,
        reason.trim(),
        status === 'took_role' ? new Date(resurfaceDate).toISOString() : undefined,
      );
      setReason('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Change status — ${candidateName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={submitting}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="smhq-field">
          <label className="smhq-field-label" htmlFor="status-select">Status</label>
          <select
            id="status-select"
            className="smhq-input"
            value={status}
            onChange={e => setStatus(e.target.value as CandidateStatus)}
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {needsReason && (
          <Textarea
            label="Reason"
            hint="In your own words — this is the record that survives, per the recruiter council."
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            required
            autoFocus
          />
        )}

        {status === 'took_role' && (
          <div className="smhq-field">
            <label className="smhq-field-label" htmlFor="resurface-date">Resurface date</label>
            <input
              id="resurface-date"
              type="date"
              className="smhq-input"
              value={resurfaceDate}
              onChange={e => setResurfaceDate(e.target.value)}
            />
            <p className="smhq-field-hint">Defaults to 18 months from today — worth a ping around then.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
