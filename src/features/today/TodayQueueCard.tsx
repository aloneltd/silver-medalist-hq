import type { TodayQueueItem } from '../../types';
import { Button, Chip } from '../../ui';
import { formatWarmthDays } from './formatWarmthDays';

export interface TodayQueueCardProps {
  item: TodayQueueItem;
  onPrimary: (item: TodayQueueItem) => void;
  onSnooze: (item: TodayQueueItem) => void;
  onOpen: (candidateId: string) => void;
}

export function TodayQueueCard({ item, onPrimary, onSnooze, onOpen }: TodayQueueCardProps) {
  const { candidate, reason, action, warmthDays } = item;
  return (
    <li className="smhq-today-card">
      <button type="button" className="smhq-today-card-main" onClick={() => onOpen(candidate.id)}>
        <div className="smhq-today-card-head">
          <span className="smhq-today-card-name">{candidate.name}</span>
          <Chip as="span" tone="neutral">{formatWarmthDays(warmthDays)}</Chip>
        </div>
        <p className="smhq-today-card-reason">{reason}</p>
      </button>
      <div className="smhq-today-card-actions">
        <Button variant="primary" size="sm" onClick={() => onPrimary(item)}>{action.label}</Button>
        <Button variant="ghost" size="sm" onClick={() => onSnooze(item)}>Snooze</Button>
      </div>
    </li>
  );
}
