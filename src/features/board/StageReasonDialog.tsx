import { useState } from 'react';
import { Dialog, Textarea, Button } from '../../ui';
import type { BoardStage, Candidate } from '../../types';
import { BOARD_STAGES } from './stageMeta';

export interface StageReasonDialogProps {
  open: boolean;
  candidate: Candidate | null;
  toStage: BoardStage | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** BLUEPRINT-v2.md: "moving asks the one question that matters ('what did they say?') to keep
 * the story honest." Fires on every stage move, drag or keyboard, before it commits. */
export function StageReasonDialog({ open, candidate, toStage, onCancel, onConfirm }: StageReasonDialogProps) {
  const [reason, setReason] = useState('');
  const label = BOARD_STAGES.find(s => s.stage === toStage)?.label ?? toStage;

  const confirm = () => {
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={candidate ? `Move ${candidate.name} to ${label}` : 'Move stage'}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={confirm}>Log &amp; move</Button>
        </>
      }
    >
      <Textarea
        autoFocus
        label="What did they say?"
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="e.g. Excited about the role, wants to talk comp first."
        rows={4}
        hint="Optional, but this is what keeps the story honest for next time."
      />
    </Dialog>
  );
}
