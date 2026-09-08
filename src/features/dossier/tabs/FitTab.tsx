import { useState } from 'react';
import type { Match } from '../../../types';
import { dataService } from '../../../services/dataService';
import { Button, Textarea } from '../../../ui';
import { cx } from '../../bench/lib/tokens';

const SUB_LABELS: Array<{ key: keyof Match['sub']; label: string }> = [
  { key: 'skills', label: 'Skills' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'comp', label: 'Comp' },
  { key: 'timing', label: 'Timing' },
];

export interface FitTabProps {
  match: Match | undefined;
  roleTitle: string | undefined;
}

/** Four labelled bars + flags + an override slider whose reason is "remembered" — it's read
 *  back from match.override.reason (persisted), not local state, so it survives a reload. */
export function FitTab({ match, roleTitle }: FitTabProps) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [score, setScore] = useState(match?.override?.score ?? match?.score ?? 50);
  const [reason, setReason] = useState(match?.override?.reason ?? '');
  const [saving, setSaving] = useState(false);

  if (!match) {
    return (
      <p className={`text-sm ${cx.muted}`}>
        {roleTitle ? `No score yet for ${roleTitle} — sync the bench to fit this candidate.` : 'Pick a role to see its fit breakdown.'}
      </p>
    );
  }

  const effective = match.override?.score ?? match.score;

  const saveOverride = async () => {
    setSaving(true);
    try {
      await dataService.setOverride(match.id, score, reason.trim() || 'No reason given');
      setOverrideOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${cx.ink}`}>Fit for {roleTitle ?? 'this role'}</span>
        <span className={`font-mono text-lg font-semibold ${cx.accentText}`}>{Math.round(effective)}</span>
      </div>
      {match.override && (
        <p className={`-mt-2 text-xs ${cx.amberText}`}>
          Overridden from {Math.round(match.score)} — {match.override.reason}
        </p>
      )}
      {match.fallback && (
        <p className={`-mt-2 text-xs ${cx.muted}`}>Keyword-fit fallback score — the AI call didn't land this time.</p>
      )}

      <div className="flex flex-col gap-2">
        {SUB_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className={`w-20 shrink-0 ${cx.muted}`}>{label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--panel-2,#1c2127)]">
              <span className={`block h-full ${cx.accentBg}`} style={{ width: `${Math.max(0, Math.min(100, match.sub[key]))}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right tabular-nums">{Math.round(match.sub[key])}</span>
          </div>
        ))}
      </div>

      <p className={`text-sm italic ${cx.muted}`}>{match.why}</p>

      {match.flags.length > 0 && (
        <ul className={`list-disc pl-4 text-xs ${cx.amberText}`}>
          {match.flags.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}

      {overrideOpen ? (
        <div className={`flex flex-col gap-2 rounded-[8px] border p-2 ${cx.border}`}>
          <label className="smhq-field-label" htmlFor="override-score">Override score: {score}</label>
          <input
            id="override-score"
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={e => setScore(Number(e.target.value))}
          />
          <Textarea
            label="Reason (remembered for next time)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={saveOverride} loading={saving}>Save override</Button>
            <Button size="sm" variant="ghost" onClick={() => setOverrideOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOverrideOpen(true)}>
          {match.override ? 'Edit override' : 'Override score'}
        </Button>
      )}
    </div>
  );
}
