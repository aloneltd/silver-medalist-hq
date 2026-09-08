import { useState } from 'react';
import type { CandidateStatus } from '../../types';
import { cx } from './lib/tokens';
import { defaultResurfaceDate, statusRequiresReason } from './lib/warmth';

export interface BulkActionsBarProps {
  count: number;
  onClear: () => void;
  onTag: (tag: string) => void;
  onSnooze: (untilISO: string) => void;
  onStatus: (status: CandidateStatus, reason: string, snoozeUntil?: string) => void;
  onExportCsv: () => void;
}

const STATUS_OPTIONS: CandidateStatus[] = ['active', 'silent', 'took_role', 'do_not_reapproach', 'opted_out'];

export function BulkActionsBar({ count, onClear, onTag, onSnooze, onStatus, onExportCsv }: BulkActionsBarProps) {
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<CandidateStatus>('silent');
  const [reason, setReason] = useState('');
  const [showStatusForm, setShowStatusForm] = useState(false);

  if (count === 0) return null;

  const needsReason = statusRequiresReason(status);

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={`sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b px-3 py-2 ${cx.surface2}`}
    >
      <span className={`text-sm font-medium ${cx.ink}`}>{count} selected</span>

      <form
        onSubmit={e => {
          e.preventDefault();
          if (tag.trim()) { onTag(tag.trim()); setTag(''); }
        }}
        className="flex items-center gap-1"
      >
        <input
          value={tag}
          onChange={e => setTag(e.target.value)}
          placeholder="Add tag…"
          aria-label="Tag to add"
          className={`w-28 rounded-[6px] border px-2 py-1 text-xs ${cx.border} bg-transparent ${cx.ink} ${cx.focusRing}`}
        />
        <button type="submit" className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.ink} hover:bg-[var(--bg,#0e1013)] ${cx.focusRing}`}>
          Tag
        </button>
      </form>

      <button
        type="button"
        onClick={() => onSnooze(defaultResurfaceDate())}
        className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.ink} hover:bg-[var(--bg,#0e1013)] ${cx.focusRing}`}
      >
        Snooze +18mo
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowStatusForm(v => !v)}
          aria-expanded={showStatusForm}
          className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.ink} hover:bg-[var(--bg,#0e1013)] ${cx.focusRing}`}
        >
          Change status…
        </button>
        {showStatusForm && (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (needsReason && !reason.trim()) return;
              onStatus(status, reason.trim(), status === 'took_role' ? defaultResurfaceDate() : undefined);
              setShowStatusForm(false);
              setReason('');
            }}
            className={`absolute left-0 top-full z-30 mt-1 flex w-64 flex-col gap-2 rounded-[8px] border p-2 ${cx.surface} ${cx.shadow}`}
          >
            <select
              value={status}
              onChange={e => setStatus(e.target.value as CandidateStatus)}
              className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} bg-transparent ${cx.ink}`}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {needsReason && (
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason (required)"
                required
                className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} bg-transparent ${cx.ink} ${cx.focusRing}`}
              />
            )}
            {status === 'took_role' && (
              <p className={`text-[11px] ${cx.muted}`}>Resurfaces in 18 months by default.</p>
            )}
            <button type="submit" className={`rounded-[6px] px-2 py-1 text-xs font-medium text-black ${cx.accentBg} ${cx.focusRing}`}>
              Apply to {count}
            </button>
          </form>
        )}
      </div>

      <button
        type="button"
        onClick={onExportCsv}
        className={`rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.ink} hover:bg-[var(--bg,#0e1013)] ${cx.focusRing}`}
      >
        Export CSV
      </button>

      <button
        type="button"
        onClick={onClear}
        className={`ml-auto rounded-[6px] border px-2 py-1 text-xs ${cx.border} ${cx.muted} hover:bg-[var(--bg,#0e1013)] ${cx.focusRing}`}
      >
        Clear selection
      </button>
    </div>
  );
}
