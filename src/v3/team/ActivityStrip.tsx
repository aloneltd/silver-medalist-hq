import { buildActivity } from './activity';
import { Pill } from '../ui';
import type { Candidate, Submission, ImportBatch } from '../../types';

export function ActivityStrip(
  { candidates, submissions, imports }: { candidates: Candidate[]; submissions: Submission[]; imports: ImportBatch[] },
) {
  const lines = buildActivity(candidates, submissions, imports);
  if (lines.length === 0) {
    return <div className="p-meta">No activity yet — once people are added, who did it shows up here.</div>;
  }
  return (
    <div className="smteam-activity">
      {lines.map(l => (
        <div key={l.id} className="smteam-activity-row p-row p-gap-2 p-wrap">
          <span>{l.text}</span>
          {l.sample && <Pill tone="amber" sm>sample</Pill>}
        </div>
      ))}
    </div>
  );
}
