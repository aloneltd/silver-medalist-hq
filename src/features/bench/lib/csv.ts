import type { Candidate, Match } from '../../../types';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'name', 'email', 'currentTitle', 'currentEmployer', 'location', 'seniority',
  'status', 'statusReason', 'warmthAt', 'fitScore', 'whyNow',
] as const;

export function candidatesToCsv(candidates: Candidate[], matchesByCandidate: Record<string, Match>): string {
  const rows = candidates.map(c => {
    const m = matchesByCandidate[c.id];
    return [
      c.name, c.email ?? '', c.currentTitle, c.currentEmployer, c.location, c.seniority,
      c.status, c.statusReason ?? '', c.warmthAt, m ? Math.round(m.override?.score ?? m.score) : '', m?.why ?? '',
    ].map(csvCell).join(',');
  });
  return [HEADERS.join(','), ...rows].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
