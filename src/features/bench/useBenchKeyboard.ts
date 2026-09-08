import { useCallback, useEffect, useState } from 'react';
import type { BoardStage } from '../../types';

/** 1–6 quick-stage keys per BLUEPRINT-v2.md — 'passed' has no quick key, it's a deliberate act. */
export const STAGE_QUICK_KEYS: Record<string, BoardStage> = {
  '1': 'warm',
  '2': 'reached_out',
  '3': 'replied',
  '4': 'interviewing',
  '5': 'offer',
  '6': 'placed',
};

export interface BenchKeyboardHandlers {
  onOpen: (candidateId: string) => void;
  onCompose: (candidateId: string) => void;
  onSetStage: (candidateId: string, stage: BoardStage) => void;
  onSnooze: (candidateId: string) => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

/**
 * j/k move the active row, Enter opens the dossier, e opens the composer, 1–6 set a board
 * stage, s snoozes — all for the currently active row. Ignored while typing in a field so it
 * never fights the paste-a-JD box, ⌘K, or a note field.
 */
export function useBenchKeyboard(rowIds: string[], handlers: BenchKeyboardHandlers) {
  const [activeIndexRaw, setActiveIndex] = useState(0);
  // Clamp at render time rather than via an effect + setState (avoids a cascading extra
  // render when the filtered/sorted row list shrinks under the current active index).
  const activeIndex = rowIds.length === 0 ? 0 : Math.min(activeIndexRaw, rowIds.length - 1);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!rowIds.length) return;
      const activeId = rowIds[activeIndex];
      if (!activeId) return;

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(i => Math.min(rowIds.length - 1, i + 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(i => Math.max(0, i - 1));
          break;
        case 'Enter':
          e.preventDefault();
          handlers.onOpen(activeId);
          break;
        case 'e':
          e.preventDefault();
          handlers.onCompose(activeId);
          break;
        case 's':
          e.preventDefault();
          handlers.onSnooze(activeId);
          break;
        default: {
          const stage = STAGE_QUICK_KEYS[e.key];
          if (stage) {
            e.preventDefault();
            handlers.onSetStage(activeId, stage);
          }
        }
      }
    },
    [rowIds, activeIndex, handlers],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return { activeIndex, setActiveIndex };
}
