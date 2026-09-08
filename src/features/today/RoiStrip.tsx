import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';

/**
 * DESIGN-v2.md / BLUEPRINT-v2.md: "one honest counter: placements sourced from the bench, plus
 * a small 'estimated' panel behind a disclosure for hours saved." Placements is a real count
 * from `processes`; hours-saved is explicitly an estimate, hidden behind <details> so it never
 * reads as a hard number.
 */
export function RoiStrip() {
  // `finishedAs` isn't an indexed field on `processes` (see src/db/schema.ts) — filter in JS
  // rather than `.where('finishedAs')`, which throws a Dexie SchemaError on an unindexed key.
  const placements = useLiveQuery(
    () => db.processes.filter(p => p.finishedAs === 'placed').count(),
    [], 0,
  ) ?? 0;
  const touches = useLiveQuery(() => db.activities.where('type').equals('touch').count(), [], 0) ?? 0;
  const emailsCopied = useLiveQuery(() => db.activities.where('type').equals('email_copied').count(), [], 0) ?? 0;

  // Estimate: 15 min saved per touch you didn't have to look up manually, 10 min per drafted
  // email you didn't have to write from scratch. Deliberately conservative, deliberately labelled.
  const estimatedHours = Math.round(((touches * 15 + emailsCopied * 10) / 60) * 10) / 10;

  return (
    <div className="smhq-roi">
      <div className="smhq-roi-stat">
        <span className="smhq-roi-value">{placements}</span>
        <span className="smhq-roi-label">placement{placements === 1 ? '' : 's'} sourced from this bench</span>
      </div>
      <details className="smhq-roi-detail">
        <summary>Estimated time saved</summary>
        <p>
          ~{estimatedHours} hour{estimatedHours === 1 ? '' : 's'} — a rough estimate from touches
          logged and drafts copied, not a measured figure.
        </p>
      </details>
    </div>
  );
}
