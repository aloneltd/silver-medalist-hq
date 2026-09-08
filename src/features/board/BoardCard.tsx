import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Candidate, Match, BoardStage } from '../../types';
import { Chip } from '../../ui';
import { daysSince, STALE_DAYS, BOARD_STAGES } from './stageMeta';

export interface BoardCardProps {
  candidate: Candidate;
  match: Match;
  onOpen: (id: string) => void;
  onMove: (candidateId: string, toStage: BoardStage) => void;
  pulseStale: boolean;
}

export function BoardCard({ candidate, match, onOpen, onMove, pulseStale }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: candidate.id });
  const warmthDays = daysSince(candidate.warmthAt);
  const stale = candidate.status === 'active' && warmthDays > STALE_DAYS;
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
        <button type="button" className="smhq-board-card-name" onClick={() => onOpen(candidate.id)}>
          {candidate.name}
        </button>
      </div>
      <div className="smhq-board-card-meta">
        <span className="smhq-board-card-score">{Math.round(score)}</span>
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
    </li>
  );
}
