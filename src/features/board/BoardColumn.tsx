import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Candidate, Match, BoardStage } from '../../types';
import { BoardCard } from './BoardCard';
import type { StageMeta } from './stageMeta';

export interface BoardColumnProps {
  meta: StageMeta;
  rows: Array<{ candidate: Candidate; match: Match }>;
  onOpen: (id: string) => void;
  onMove: (candidateId: string, toStage: BoardStage) => void;
  pulsedIds: Set<string>;
  roleTitle?: string;
}

export function BoardColumn({ meta, rows, onOpen, onMove, pulsedIds, roleTitle }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${meta.stage}` });

  return (
    <div className={`smhq-board-col ${isOver ? 'smhq-board-col-over' : ''}`}>
      <div className="smhq-board-col-head">
        <h3>{meta.label}</h3>
        <span className="smhq-board-col-count">{rows.length}</span>
      </div>
      <SortableContext items={rows.map(r => r.candidate.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="smhq-board-col-list" data-stage={meta.stage}>
          {rows.map(({ candidate, match }) => (
            <BoardCard
              key={candidate.id}
              candidate={candidate}
              match={match}
              roleTitle={roleTitle}
              onOpen={onOpen}
              onMove={onMove}
              pulseStale={pulsedIds.has(candidate.id)}
            />
          ))}
          {rows.length === 0 && <li className="smhq-board-col-empty">Nothing here.</li>}
        </ul>
      </SortableContext>
    </div>
  );
}
