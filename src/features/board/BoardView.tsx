import { useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { dataService } from '../../services/dataService';
import { BoardColumn } from './BoardColumn';
import { StageReasonDialog } from './StageReasonDialog';
import { BOARD_STAGES } from './stageMeta';
import type { BoardStage, Candidate, Match } from '../../types';

/** Session-scoped: stale cards pulse amber once, the first time they're seen this session,
 * then hold solid amber — BLUEPRINT-v2.md's motion rule, not re-run on every re-render. */
const pulsedThisSession = new Set<string>();

export function BoardView() {
  const { selectedRoleId, selectedRole } = useAppUI();
  const { openCandidate } = useDossierLink();

  const matches = dataService.hooks.useMatchesForRole(selectedRoleId ?? undefined) ?? [];
  const candidates = dataService.hooks.useCandidates() ?? [];
  const candidateById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);

  const [mobileStage, setMobileStage] = useState<BoardStage>('warm');
  const [pending, setPending] = useState<{ candidate: Candidate; match: Match; toStage: BoardStage } | null>(null);

  const rowsByStage = useMemo(() => {
    const grouped: Record<BoardStage, Array<{ candidate: Candidate; match: Match }>> = {
      warm: [], reached_out: [], replied: [], interviewing: [], offer: [], placed: [], passed: [],
    };
    for (const m of matches) {
      const c = candidateById.get(m.candidateId);
      if (!c) continue;
      grouped[m.stage].push({ candidate: c, match: m });
    }
    return grouped;
  }, [matches, candidateById]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const requestMove = (candidateId: string, toStage: BoardStage) => {
    const match = matches.find(m => m.candidateId === candidateId);
    const candidate = candidateById.get(candidateId);
    if (!match || !candidate || match.stage === toStage) return;
    setPending({ candidate, match, toStage });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const candidateId = String(active.id);
    const overId = String(over.id);
    const toStage = overId.startsWith('col-')
      ? (overId.slice(4) as BoardStage)
      : matches.find(m => m.candidateId === overId)?.stage;
    if (toStage) requestMove(candidateId, toStage);
  };

  const confirmMove = async (reason: string) => {
    if (!pending) return;
    const { candidate, match, toStage } = pending;
    // dataService.setStage logs the reason into the same activity row ('Moved to "X" — reason').
    await dataService.setStage(match.id, toStage, reason);
    pulsedThisSession.add(candidate.id);
    setPending(null);
  };

  if (!selectedRoleId) {
    return (
      <div className="smhq-page">
        <p>Pick a role from the top bar to see its board.</p>
      </div>
    );
  }

  return (
    <div className="smhq-page smhq-board-page">
      <div className="smhq-page-header">
        <div>
          <h1>Board</h1>
          <p>{selectedRole ? selectedRole.title : ''}</p>
        </div>
      </div>

      <nav className="smhq-board-tabs" aria-label="Stage">
        {BOARD_STAGES.map(s => (
          <button
            key={s.stage}
            type="button"
            className={`smhq-board-tab ${mobileStage === s.stage ? 'smhq-board-tab-active' : ''}`}
            onClick={() => setMobileStage(s.stage)}
          >
            {s.label} <span>{rowsByStage[s.stage].length}</span>
          </button>
        ))}
      </nav>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="smhq-board-columns">
          {BOARD_STAGES.map(meta => (
            <div key={meta.stage} className={meta.stage === mobileStage ? 'smhq-board-col-mobile-active' : ''}>
              <BoardColumn
                meta={meta}
                rows={rowsByStage[meta.stage]}
                roleTitle={selectedRole?.title}
                onOpen={openCandidate}
                onMove={requestMove}
                pulsedIds={pulsedThisSession}
              />
            </div>
          ))}
        </div>
      </DndContext>

      <StageReasonDialog
        open={!!pending}
        candidate={pending?.candidate ?? null}
        toStage={pending?.toStage ?? null}
        onCancel={() => setPending(null)}
        onConfirm={confirmMove}
      />
    </div>
  );
}
