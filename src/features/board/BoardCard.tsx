import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Candidate, Match, BoardStage } from '../../types';
import { Avatar, Button, Chip, FitRing } from '../../ui';
import { daysSince, STALE_DAYS, BOARD_STAGES } from './stageMeta';

/** Stages where a card is actually in motion — the only ones where "stale" means anything. */
const IN_MOTION: BoardStage[] = ['reached_out', 'replied', 'interviewing', 'offer'];

export interface BoardCardProps {
  candidate: Candidate;
  match: Match;
  /** Unused for display (the board header already names the role) — kept for the a11y label. */
  roleTitle?: string;
  onOpen: (id: string) => void;
  onMove: (candidateId: string, toStage: BoardStage) => void;
  pulseStale: boolean;
}

export function BoardCard({ candidate, match, roleTitle, onOpen, onMove, pulseStale }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: candidate.id });
  const warmthDays = daysSince(candidate.warmthAt);
  // A Warm card sitting untouched for 300 days is not "stale", it is just the bench. Amber is
  // reserved for someone we started a conversation with and then let go quiet.
  const stale = IN_MOTION.includes(match.stage) && warmthDays > STALE_DAYS;
  const score = match.override?.score ?? match.score;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`smhq-board-card ${stale ? 'smhq-board-card-stale' : ''} ${pulseStale ? 'smhq-stale-pulse-once' : ''}`}
    >
      <div className="smhq-board-card-row">
        <button
          type="button"
          className="smhq-board-card-handle"
          aria-label={`Drag ${candidate.name}, or use the stage picker below to move without dragging`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <Avatar name={candidate.name} size={24} />
        <button type="button" className="smhq-board-card-name smhq-truncate" onClick={() => onOpen(candidate.id)}>
          {candidate.name}
        </button>
        <FitRing value={score} size={28} stroke={3} label={`${candidate.name}: fit ${Math.round(score)} of 100`} />
      </div>
      <div className="smhq-board-card-meta">
        <span className="smhq-truncate">{candidate.currentTitle} · {candidate.currentEmployer}</span>
        <span className="smhq-board-card-days">{warmthDays}d</span>
        {stale && <Chip as="span" tone="amber">Stale</Chip>}
      </div>
      <label className="smhq-board-card-move">
        <span className="sr-only">Move {candidate.name} to another stage</span>
        <select
          value={match.stage}
          onChange={e => onMove(candidate.id, e.target.value as BoardStage)}
          aria-label={`Move ${candidate.name} to stage`}
        >
          {BOARD_STAGES.map(s => (
            <option key={s.stage} value={s.stage}>{s.label}</option>
          ))}
        </select>
      </label>
      {match.stage === 'reached_out' && (
        // Manual fallback for when Outlook isn't connected or replyWatcher hasn't caught up
        // yet — DESIGN-v2.1.md §A/§C.5. Routes through the same onMove -> requestMove path as
        // drag/the dropdown, so it asks the same "what did they say?" reason and logs the same way.
        <Button
          size="sm"
          variant="ghost"
          style={{ marginTop: 2, width: '100%' }}
          onClick={() => onMove(candidate.id, 'replied')}
          aria-label={`Mark ${candidate.name} replied${roleTitle ? ` for ${roleTitle}` : ''}`}
        >
          Mark replied
        </Button>
      )}
    </li>
  );
}
