import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Deep-link contract for the dossier drawer per BLUEPRINT-v2.md: `?c=<candidateId>` on any
 * route opens the drawer over whatever's underneath, and is shareable/bookmarkable. Mounted
 * once in <AppShell>; every feature that wants to open a candidate (Today card, Board card,
 * Bench row, ⌘K result) should call `openCandidate(id)` from this hook rather than touching
 * the URL directly.
 */
export function useDossierLink() {
  const [params, setParams] = useSearchParams();
  const candidateId = params.get('c');

  const openCandidate = useCallback((id: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('c', id);
      return next;
    });
  }, [setParams]);

  const closeCandidate = useCallback(() => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('c');
      return next;
    });
  }, [setParams]);

  return { candidateId, openCandidate, closeCandidate };
}
