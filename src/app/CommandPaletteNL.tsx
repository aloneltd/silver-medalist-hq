import { useEffect, useMemo, useState } from 'react';
import { nlCommand } from '../services/nlCommand';
import type { NLPreview } from '../services/nlCommand';
import { Button, Chip, Kbd, useToast } from '../ui';
import './commandPaletteNL.css';

const VALID_STATUSES = ['active', 'silent', 'took_role', 'do_not_reapproach', 'opted_out'] as const;
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', silent: 'Silent', took_role: 'Took a role',
  do_not_reapproach: 'Do not re-approach', opted_out: 'Opted out',
};

function toDateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export interface CommandPaletteNLProps {
  query: string;
  roleId?: string;
  onOpenCandidate: (id: string) => void;
  onCompose: (candidateId: string, roleId: string | undefined, tone?: 'warm' | 'direct' | 'short') => void;
  onDone: () => void;
}

/**
 * The NL ⌘K preview — council amendments §3. A mutating plan (snooze/status/tag/move_stage)
 * renders as an editable chip: count, an editable resolved value (date input / status select),
 * and an expandable, removable name list. A non-mutating plan (`filter`, or the AI's own
 * fallback) renders as a plain result list — "plain search stays as is."
 */
export function CommandPaletteNL({ query, roleId, onOpenCandidate, onCompose, onDone }: CommandPaletteNLProps) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<NLPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [namesOpen, setNamesOpen] = useState(false);
  const [untilOverride, setUntilOverride] = useState<string | null>(null);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    let cancelled = false;
    // Deferred to a microtask so the effect body itself never calls setState synchronously
    // (react-hooks/set-state-in-effect) — these still land before the debounce fires.
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setExcludedIds(new Set());
      setUntilOverride(null);
      setStatusOverride(null);
    });
    const debounce = setTimeout(() => {
      void nlCommand.preview(query).then(p => {
        if (cancelled) return;
        setPreview(p);
        setNamesOpen(p.overReach); // council amendments §3: plans > 10 people open the names first
        setLoading(false);
      }).catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not understand that command.');
        setLoading(false);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [query]);

  const isMutating = preview && preview.plan.action !== 'filter';
  const activeIds = useMemo(
    () => (preview ? preview.matches.filter(m => !excludedIds.has(m.id)).map(m => m.id) : []),
    [preview, excludedIds],
  );

  if (loading) {
    return (
      <div className="smhq-palette-nl" role="status" aria-live="polite">
        <div className="smhq-palette-nl-skeleton" />
        <div className="smhq-palette-nl-skeleton" style={{ width: '70%' }} />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="smhq-palette-nl">
        <p className="smhq-palette-nl-error" role="alert">{error ?? "Couldn't understand that — try plain search."}</p>
      </div>
    );
  }

  // Non-mutating: render like plain search (a plain result list of matched people).
  if (!isMutating) {
    return (
      <ul className="smhq-palette-list" role="listbox" aria-label="Search results">
        {preview.matches.length === 0 && <li className="smhq-palette-empty">No matches.</li>}
        {preview.matches.slice(0, 20).map(m => (
          <li key={m.id} role="option" aria-selected={false} className="smhq-palette-item" onClick={() => { onOpenCandidate(m.id); onDone(); }}>
            <span>{m.name}</span>
          </li>
        ))}
      </ul>
    );
  }

  const plan = preview.plan;
  const count = activeIds.length;

  const applyMutation = async () => {
    if (count === 0) return;
    setApplying(true);
    try {
      // Editable-value overrides win over whatever the model/date-rules resolved, per
      // council amendments §3 ("an editable resolved value").
      const finalPlan = {
        ...plan,
        params: {
          ...plan.params,
          ...(untilOverride ? { until: untilOverride } : {}),
          ...(statusOverride ? { status: statusOverride as typeof plan.params.status } : {}),
        },
      };
      const result = await nlCommand.apply(finalPlan, activeIds, { roleId, originalText: query });
      push(`${plan.explanation} · ${result.affected} ${result.affected === 1 ? 'person' : 'people'}`, {
        tone: 'success',
        actionLabel: 'Undo',
        onAction: () => { void result.undo(); },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that command.');
    } finally {
      setApplying(false);
    }
  };

  const applyCompose = () => {
    const first = preview.matches[0];
    if (!first) return;
    onCompose(first.id, roleId, plan.params.tone);
    onDone();
  };

  const apply = plan.action === 'compose' ? applyCompose : applyMutation;

  return (
    <div
      className="smhq-palette-nl"
      onKeyDown={e => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void apply(); }
      }}
    >
      <p className="smhq-palette-nl-sentence">
        {plan.explanation}
        {' — '}
        <strong>{count}</strong> {count === 1 ? 'person' : 'people'}
        {plan.action === 'snooze' && (
          <>
            {' until '}
            <input
              type="date"
              className="smhq-palette-nl-date"
              value={untilOverride ?? toDateInputValue(preview.resolved.until)}
              onChange={e => setUntilOverride(e.target.value)}
              aria-label="Snooze until"
            />
          </>
        )}
        {plan.action === 'status' && (
          <>
            {' to '}
            <select
              className="smhq-palette-nl-select"
              value={statusOverride ?? plan.params.status ?? ''}
              onChange={e => setStatusOverride(e.target.value)}
              aria-label="New status"
            >
              <option value="" disabled>Pick a status…</option>
              {VALID_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </>
        )}
      </p>

      {preview.matches.length > 0 && (
        <button type="button" className="smhq-palette-nl-toggle" onClick={() => setNamesOpen(v => !v)}>
          {namesOpen ? 'Hide names' : `Show ${preview.matches.length} name${preview.matches.length === 1 ? '' : 's'}`}
        </button>
      )}

      {namesOpen && (
        <div className="smhq-palette-nl-names">
          {preview.matches.map(m => (
            <Chip
              key={m.id}
              tone={excludedIds.has(m.id) ? 'neutral' : 'accent'}
              selected={!excludedIds.has(m.id)}
              onClick={() => setExcludedIds(prev => {
                const next = new Set(prev);
                if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                return next;
              })}
            >
              {m.name} {excludedIds.has(m.id) ? '' : '✕'}
            </Chip>
          ))}
        </div>
      )}

      <div className="smhq-palette-nl-actions">
        <span className="smhq-muted" style={{ fontSize: 11.5 }}>
          <Kbd keys={['⌘', '⏎']} /> to apply — plain <Kbd>⏎</Kbd> won't
        </span>
        <Button variant="primary" size="sm" onClick={() => void apply()} loading={applying} disabled={count === 0}>
          {plan.action === 'compose' ? 'Open composer' : `Apply to ${count}`}
        </Button>
      </div>
    </div>
  );
}
