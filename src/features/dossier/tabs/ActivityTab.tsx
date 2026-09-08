import { dataService } from '../../../services/dataService';
import { cx } from '../../bench/lib/tokens';

const TYPE_LABEL: Record<string, string> = {
  touch: 'Touch',
  email_copied: 'Email copied',
  note: 'Note',
  stage: 'Stage change',
  status: 'Status change',
  reminder: 'Reminder',
  import: 'Import',
};

export function ActivityTab({ candidateId }: { candidateId: string }) {
  const activities = dataService.hooks.useActivitiesForCandidate(candidateId) ?? [];

  if (activities.length === 0) {
    return <p className={`text-sm ${cx.muted}`}>Nothing logged yet — every touch, note and status change will show up here.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {activities.map(a => (
        <li key={a.id} className={`rounded-[8px] border p-2 text-sm ${cx.border}`}>
          <div className={`flex items-center justify-between text-xs ${cx.muted}`}>
            <span className={cx.accentText}>{TYPE_LABEL[a.type] ?? a.type}</span>
            <span>{new Date(a.at).toLocaleString()}</span>
          </div>
          <p className={`mt-1 ${cx.ink}`}>{a.body}</p>
        </li>
      ))}
    </ul>
  );
}
