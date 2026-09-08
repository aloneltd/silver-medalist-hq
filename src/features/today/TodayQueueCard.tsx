import type { TodayQueueItem } from '../../types';
import { Avatar, Button, FitRing, StatusChip } from '../../ui';
import { formatWarmthDays } from './formatWarmthDays';

export interface TodayQueueCardProps {
  item: TodayQueueItem;
  onPrimary: (item: TodayQueueItem) => void;
  onSnooze: (item: TodayQueueItem) => void;
  onOpen: (candidateId: string) => void;
}

/**
 * One person, one reason, one action. The fit ring only appears when the reason came from the
 * role the recruiter has open — a number without a role behind it would be decoration.
 */
export function TodayQueueCard({ item, onPrimary, onSnooze, onOpen }: TodayQueueCardProps) {
  const { candidate, reason, action, warmthDays, fit } = item;
  return (
    <li className="smhq-today-card">
      <button type="button" className="smhq-today-card-main smhq-focus-ring" onClick={() => onOpen(candidate.id)}>
        <Avatar name={candidate.name} size={38} />
        <span className="smhq-today-card-body">
          <span className="smhq-today-card-head">
            <span className="smhq-today-card-name">{candidate.name}</span>
            <StatusChip
              status={candidate.status}
              snoozeUntil={candidate.snoozeUntil}
              reason={candidate.statusReason}
              compact
            />
            <span className="smhq-today-card-days">{formatWarmthDays(warmthDays)}</span>
          </span>
          <span className="smhq-today-card-sub">{candidate.currentTitle} · {candidate.currentEmployer}</span>
          <p className="smhq-today-card-reason">{reason}</p>
        </span>
      </button>
      {typeof fit === 'number' && (
        <FitRing value={fit} size={44} label={`${candidate.name}: fit ${Math.round(fit)} of 100`} />
      )}
      <div className="smhq-today-card-actions">
        <Button variant="primary" size="sm" onClick={() => onPrimary(item)}>{action.label}</Button>
        <Button variant="ghost" size="sm" onClick={() => onSnooze(item)}>Snooze</Button>
      </div>
    </li>
  );
}
