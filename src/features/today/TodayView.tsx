import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { dataService } from '../../services/dataService';
import { snoozeCandidate } from '../bench/lib/actions';
import { TodayQueueCard } from './TodayQueueCard';
import { PasteJdInline } from './PasteJdInline';
import { RoiStrip } from './RoiStrip';
import { ShortlistPanel } from '../bench/ShortlistPanel';
import { Button } from '../../ui';
import type { TodayQueueItem } from '../../types';

/**
 * Landing route. BLUEPRINT-v2.md, council/designer.md "Screen one, in order": a proof line
 * with real numbers, the paste-a-JD anchor, the Today queue (≤5, each with a reason + one-tap
 * action), then — once a role is synced — the shortlist. Empty Today is a working state: the
 * paste box inline, not an illustration. Queue itself comes from B1's dataService.computeTodayQueue
 * (role-independent — it's about who's overdue, not who scores highest for one role).
 */
export function TodayView() {
  const { selectedRoleId, selectedRole, openComposer, openPasteRole } = useAppUI();
  const { openCandidate } = useDossierLink();

  const candidates = dataService.hooks.useCandidates() ?? [];
  const roleCount = useLiveQuery(() => db.roles.count(), [], 0) ?? 0;
  const queue = dataService.hooks.useTodayQueue(5) ?? [];

  const activeCount = candidates.filter(c => c.status === 'active').length;

  const primaryAction = (item: TodayQueueItem) => {
    if (item.action.kind === 'reach_out' || item.action.kind === 'follow_up') {
      openComposer({ candidateId: item.candidate.id, roleId: selectedRoleId ?? undefined });
    } else {
      openCandidate(item.candidate.id);
    }
  };

  const snooze = (item: TodayQueueItem) => {
    const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    void snoozeCandidate(item.candidate.id, until);
  };

  const proofLine = activeCount === 0
    ? "You don't have a bench yet."
    : `${activeCount} ${activeCount === 1 ? 'person' : 'people'} you already interviewed and liked · ${queue.length} worth a message today.`;

  return (
    <div className="smhq-page smhq-today">
      <div className="smhq-page-header">
        <div>
          <h1>Today</h1>
          <p className="smhq-proof-line">{proofLine}</p>
        </div>
        {roleCount > 0 && (
          <Button variant="secondary" onClick={openPasteRole}>Paste another role</Button>
        )}
      </div>

      {candidates.length === 0 || roleCount === 0 ? (
        <div className="smhq-empty smhq-empty-today">
          <h2>Your bench is quiet. Paste a role.</h2>
          <p>Once a role is in, we'll light up who on your bench is worth a message today.</p>
          <PasteJdInline />
        </div>
      ) : (
        <div className="smhq-today-grid">
          <section aria-label="Today's queue" className="smhq-today-queue">
            {queue.length === 0 ? (
              <div className="smhq-empty">
                <p>Nothing needs you right now — the bench is caught up.</p>
              </div>
            ) : (
              <ul className="smhq-today-list">
                {queue.map(item => (
                  <TodayQueueCard
                    key={item.candidate.id}
                    item={item}
                    onPrimary={primaryAction}
                    onSnooze={snooze}
                    onOpen={openCandidate}
                  />
                ))}
              </ul>
            )}
          </section>

          {selectedRole && (
            <aside className="smhq-today-shortlist">
              <ShortlistPanel roleId={selectedRole.id} limit={8} />
            </aside>
          )}
        </div>
      )}

      <RoiStrip />
    </div>
  );
}
