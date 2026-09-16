import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { db } from '../../db';
import { dataService } from '../../services/dataService';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { useHelpKey } from '../help/HelpProvider';
import { Avatar, Btn, BtnLink, Dialog, Empty, PageHeader, Skel } from '../ui';
import { storyLine } from '../lib/personText';
import { BOARD_STAGES, STALE_DAYS, daysSince } from '../../features/board/stageMeta';
import type { BoardStage, Candidate, Match, Process, Role } from '../../types';

/**
 * The Board, re-skinned to Paper. Every behaviour is kept from src/features/board/** — dnd-kit
 * drag, keyboard moves (SortableContext + KeyboardSensor), the stage-reason dialog before any
 * move commits, and the "stale card pulses once per session" rule — only the look changes:
 * white columns on the Paper ground, one border colour, the two shared shadows, no neon.
 *
 * Single file by design (this route owns no directory), so the column and card are local
 * components below rather than separate modules.
 */

/** Session-scoped, module-level exactly like v2.1's BoardView.tsx: a card pulses once, the
 * first time a stale move lands this session, then just holds the amber border. Not re-run on
 * every re-render, and not reset by a route change within the same tab. */
const pulsedThisSession = new Set<string>();

/** Stages where a card is actually "in motion" — Warm sitting untouched for months is just the
 * bench, not stale; amber is reserved for a conversation that was started and then went quiet. */
const IN_MOTION: BoardStage[] = ['reached_out', 'replied', 'interviewing', 'offer'];

const BOARD_STYLE = `
@keyframes smhq3BoardPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(199,122,36,0); } 35% { box-shadow: 0 0 0 4px rgba(199,122,36,.35); } }
.smhq3-board-pulse { animation: smhq3BoardPulse 1.5s ease-out 1; }
.smhq3-board-stale { border-color: var(--p-amber) !important; }
.smhq3-board-col-over { border-color: var(--p-accent) !important; box-shadow: var(--p-sh-md) !important; }
`;

export function BoardRoute() {
  useHelpKey('board');
  const { selectedRoleId, selectedRole } = useAppUI();
  const { openCandidate } = useDossierLink();

  const matches = dataService.hooks.useMatchesForRole(selectedRoleId ?? undefined);
  const candidates = dataService.hooks.useCandidates();
  const roles = dataService.hooks.useRoles();
  const processes = useLiveQuery(() => db.processes.toArray(), [], []);

  const candidateById = useMemo(() => new Map((candidates ?? []).map(c => [c.id, c])), [candidates]);

  const [pending, setPending] = useState<{ candidate: Candidate; match: Match; toStage: BoardStage } | null>(null);

  const rowsByStage = useMemo(() => {
    const grouped: Record<BoardStage, Array<{ candidate: Candidate; match: Match }>> = {
      warm: [], reached_out: [], replied: [], interviewing: [], offer: [], placed: [], passed: [],
    };
    for (const m of matches ?? []) {
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
    const match = (matches ?? []).find(m => m.candidateId === candidateId);
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
      : (matches ?? []).find(m => m.candidateId === overId)?.stage;
    if (toStage) requestMove(candidateId, toStage);
  };

  const confirmMove = async (reason: string) => {
    if (!pending) return;
    const { candidate, match, toStage } = pending;
    // Same call as v2.1: dataService.setStage logs the reason into the activity row itself
    // ('Moved to "X" — reason'), so the board and the profile's "Last contact" trail agree.
    await dataService.setStage(match.id, toStage, reason);
    pulsedThisSession.add(candidate.id);
    setPending(null);
  };

  const loading = matches === undefined || candidates === undefined || roles === undefined || processes === undefined;

  return (
    <div className="p-container">
      <style>{BOARD_STYLE}</style>
      <PageHeader title="Board" lede={selectedRole ? selectedRole.title : 'Pick a role to see its pipeline.'} />

      {!selectedRoleId ? (
        <div className="p-mt-8">
          <Empty title="Pick a role to see its board" action={<BtnLink to="/roles" tone="primary">Go to Roles</BtnLink>}>
            The board tracks one role&rsquo;s pipeline at a time — warm through placed or passed.
          </Empty>
        </div>
      ) : loading ? (
        <div className="p-mt-8" style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 260, gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <Skel key={i} height={280} />)}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <div
            className="p-mt-8"
            style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 264, gap: 16, overflowX: 'auto', paddingBottom: 16 }}
          >
            {BOARD_STAGES.map(meta => (
              <BoardColumnPaper
                key={meta.stage}
                stage={meta.stage}
                label={meta.label}
                rows={rowsByStage[meta.stage]}
                processes={processes ?? []}
                roles={roles ?? []}
                onOpen={openCandidate}
                onMove={requestMove}
                pulsedIds={pulsedThisSession}
              />
            ))}
          </div>
        </DndContext>
      )}

      {pending && (
        <StageMoveDialog
          candidateName={pending.candidate.name}
          toStageLabel={BOARD_STAGES.find(s => s.stage === pending.toStage)?.label ?? pending.toStage}
          onCancel={() => setPending(null)}
          onConfirm={confirmMove}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------- the column */

interface BoardColumnPaperProps {
  stage: BoardStage;
  label: string;
  rows: Array<{ candidate: Candidate; match: Match }>;
  processes: Process[];
  roles: Role[];
  onOpen: (id: string) => void;
  onMove: (candidateId: string, toStage: BoardStage) => void;
  pulsedIds: Set<string>;
}

function BoardColumnPaper({ stage, label, rows, processes, roles, onOpen, onMove, pulsedIds }: BoardColumnPaperProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${stage}` });

  return (
    <div className={`p-card${isOver ? ' smhq3-board-col-over' : ''}`} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
      <div className="p-spread" style={{ padding: '12px 16px', borderBottom: '1px solid var(--p-line)' }}>
        <span className="p-strong" style={{ fontSize: 14 }}>{label}</span>
        <span className="p-meta" style={{ background: 'var(--p-bg)', borderRadius: 999, padding: '2px 8px' }}>{rows.length}</span>
      </div>
      <SortableContext items={rows.map(r => r.candidate.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          data-stage={stage}
          style={{ listStyle: 'none', margin: 0, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 60 }}
        >
          {rows.map(({ candidate, match }) => (
            <BoardCardPaper
              key={candidate.id}
              candidate={candidate}
              match={match}
              processes={processes}
              roles={roles}
              onOpen={onOpen}
              onMove={onMove}
              pulseStale={pulsedIds.has(candidate.id)}
            />
          ))}
          {rows.length === 0 && <li className="p-meta" style={{ textAlign: 'center', padding: 16 }}>Nothing here.</li>}
        </ul>
      </SortableContext>
    </div>
  );
}

/* --------------------------------------------------------------------------------- the card */

interface BoardCardPaperProps {
  candidate: Candidate;
  match: Match;
  processes: Process[];
  roles: Role[];
  onOpen: (id: string) => void;
  onMove: (candidateId: string, toStage: BoardStage) => void;
  pulseStale: boolean;
}

function BoardCardPaper({ candidate, match, processes, roles, onOpen, onMove, pulseStale }: BoardCardPaperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: candidate.id });
  const warmthDays = daysSince(candidate.warmthAt);
  const stale = IN_MOTION.includes(match.stage) && warmthDays > STALE_DAYS;
  const score = Math.round(match.override?.score ?? match.score);
  const story = storyLine(candidate, processes, roles);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={['p-card', stale ? 'smhq3-board-stale' : '', pulseStale ? 'smhq3-board-pulse' : ''].filter(Boolean).join(' ')}
    >
      <div style={{ padding: 14 }}>
        <div className="p-row p-gap-2">
          <button
            type="button"
            aria-label={`Drag ${candidate.name}, or use the menu below to move without dragging`}
            style={{ background: 'none', border: 0, cursor: 'grab', color: 'var(--p-faint)', padding: 0, display: 'flex', flex: 'none' }}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
          <Avatar name={candidate.name} size="sm" />
          <button
            type="button"
            onClick={() => onOpen(candidate.id)}
            className="p-strong"
            style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {candidate.name}
          </button>
          <span className="p-fit" style={{ fontSize: 13, flex: 'none' }}>{score}</span>
        </div>

        <div className="p-meta p-mt-2" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {story}
        </div>

        <div className="p-spread p-mt-3">
          <span className="p-meta">{warmthDays}d since touch</span>
          {stale && <span className="p-pill p-pill-amber p-pill-sm">Stale</span>}
        </div>

        <label style={{ display: 'block' }}>
          <span className="p-meta" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Move {candidate.name} to another stage
          </span>
          <select
            className="p-select p-mt-3"
            style={{ width: '100%', height: 32, fontSize: 12, padding: '0 10px' }}
            value={match.stage}
            onChange={e => onMove(candidate.id, e.target.value as BoardStage)}
          >
            {BOARD_STAGES.map(s => <option key={s.stage} value={s.stage}>{s.label}</option>)}
          </select>
        </label>

        {match.stage === 'reached_out' && (
          // Manual fallback for when Outlook isn't connected or replyWatcher hasn't caught the
          // reply yet — routes through the same onMove → requestMove path as drag or the
          // dropdown, so it asks the same "what did they say?" reason and logs the same way.
          <Btn size="sm" tone="ghost" style={{ width: '100%', marginTop: 6 }} onClick={() => onMove(candidate.id, 'replied')}>
            Mark replied
          </Btn>
        )}
      </div>
    </li>
  );
}

/* --------------------------------------------------------------------------- stage dialog */

function StageMoveDialog(
  { candidateName, toStageLabel, onCancel, onConfirm }:
  { candidateName: string; toStageLabel: string; onCancel: () => void; onConfirm: (reason: string) => void },
) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      title={`Move ${candidateName} to ${toStageLabel}`}
      onClose={onCancel}
      footer={
        <>
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn tone="primary" onClick={() => onConfirm(reason.trim())}>Log &amp; move</Btn>
        </>
      }
    >
      <label className="p-label" htmlFor="pf-stage-reason">What did they say?</label>
      <textarea
        id="pf-stage-reason"
        className="p-textarea"
        autoFocus
        value={reason}
        onChange={e => setReason(e.target.value)}
        rows={4}
        placeholder="e.g. Excited about the role, wants to talk comp first."
      />
      <div className="p-hint">Optional, but this is what keeps the story honest for next time.</div>
    </Dialog>
  );
}
