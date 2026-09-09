/**
 * The Team page's attribution strip — "Dana added 3 people yesterday" — built entirely from
 * real rows: `candidate.source.addedBy`, `Submission` and `ImportBatch`. Nothing here invents
 * a number; a quiet bench just produces a short list.
 */
import type { Candidate, Submission, ImportBatch } from '../../types';
import { whenPhrase } from '../lib/personText';

export interface ActivityLine {
  id: string;
  text: string;
  at: string;
  sample?: boolean;
}

function dayWord(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${whenPhrase(iso, now)}`;
}

export function buildActivity(
  candidates: Candidate[],
  submissions: Submission[],
  imports: ImportBatch[],
  now: Date = new Date(),
): ActivityLine[] {
  const lines: ActivityLine[] = [];

  // 1. People who actually landed on the bench with someone named as the adder.
  const byAdder = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const by = c.source?.addedBy;
    if (!by) continue;
    const list = byAdder.get(by) ?? [];
    list.push(c);
    byAdder.set(by, list);
  }
  for (const [name, list] of byAdder) {
    const newest = list.reduce((a, b) => (a.source!.at > b.source!.at ? a : b));
    const n = list.length;
    lines.push({
      id: `added-${name}`,
      at: newest.source!.at,
      text: n === 1
        ? `${name} added ${list[0].name} ${dayWord(newest.source!.at, now)}.`
        : `${name} added ${n} people, most recently ${dayWord(newest.source!.at, now)}.`,
      sample: list.some(c => c.source?.kind === 'sample'),
    });
  }

  // 2. Waiting/accepted submissions — what arrived, even before it is on the bench.
  for (const s of submissions.slice(0, 8)) {
    if (!s.addedBy) continue;
    const verb = s.via === 'capture' ? 'captured' : s.via === 'link' ? 'proposed' : s.via === 'resume' ? 'dropped a résumé for' : 'sent in';
    const via = s.via === 'capture' ? ' from LinkedIn' : s.via === 'link' ? ' via the link' : '';
    lines.push({
      id: `sub-${s.id}`,
      at: s.at,
      text: `${s.addedBy} ${verb} ${s.draft.name}${via} ${dayWord(s.at, now)}.`,
      sample: s.sample,
    });
  }

  // 3. Committed imports — batch arrivals.
  for (const b of imports.filter(i => !i.undone).slice(0, 5)) {
    lines.push({
      id: `import-${b.id}`,
      at: b.at,
      text: `${b.actor} imported ${b.rowCount} ${b.rowCount === 1 ? 'person' : 'people'} from ${b.sourceLabel} ${dayWord(b.at, now)}.`,
    });
  }

  return lines.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6);
}
