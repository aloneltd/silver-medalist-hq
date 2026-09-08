import { useMemo } from 'react';
import { findLookalikes } from '../../lib/lookalikes';
import { dataService } from '../../services/dataService';
import { useAppUI } from '../../app/store';
import { Avatar, Button } from '../../ui';
import './lookalikes.css';

export interface LookalikesProps {
  candidateId: string;
}

/**
 * "People like this" — DESIGN-v2.1.md §C.3: five lookalikes by skills/seniority/location/comp,
 * local cosine similarity (src/lib/lookalikes.ts, zero AI), each with a one-line reason and a
 * Reach out button. Lives as its own tab on the dossier so it doesn't compete with Story/Fit
 * for space, per DESIGN's "tab/section in the dossier" language.
 */
export function Lookalikes({ candidateId }: LookalikesProps) {
  const { openComposer, selectedRoleId } = useAppUI();
  const target = dataService.hooks.useCandidate(candidateId);
  const pool = dataService.hooks.useCandidates() ?? [];

  const lookalikes = useMemo(() => {
    if (!target || pool.length < 2) return [];
    return findLookalikes(target, pool, 5);
  }, [target, pool]);

  if (!target) return null;

  if (lookalikes.length === 0) {
    return (
      <p className="smhq-muted" style={{ fontSize: 12.5, padding: '8px 0' }}>
        Nobody else on the bench shares enough skills, seniority or location with {target.name} yet.
      </p>
    );
  }

  return (
    <ul className="smhq-lookalikes-list">
      {lookalikes.map(l => (
        <li key={l.candidateId} className="smhq-lookalikes-row">
          <Avatar name={l.name} size={30} />
          <div className="smhq-lookalikes-info">
            <span className="smhq-truncate smhq-lookalikes-name">{l.name}</span>
            <span className="smhq-muted smhq-lookalikes-reason">{l.reason}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openComposer({ candidateId: l.candidateId, roleId: selectedRoleId ?? undefined })}
          >
            Reach out
          </Button>
        </li>
      ))}
    </ul>
  );
}
