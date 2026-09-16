import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { nlCommand, resolveFilter, NLCommandError } from '../../services/nlCommand';
import type { NLPlan, NLPreview } from '../../services/nlCommand';
import type { Candidate, Process, Role } from '../../types';
import { useToast } from '../../ui';
import { Avatar, Btn } from '../ui';
import { spokeLabel, storyLine } from '../lib/personText';
import { dataService } from '../../services/dataService';

const VALID_STATUSES = ['active', 'silent', 'took_role', 'do_not_reapproach', 'opted_out'] as const;
const STATUS_LABEL: Record<string, string> = {
  active: 'Active', silent: 'Went quiet', took_role: 'Took a role',
  do_not_reapproach: 'Do not approach', opted_out: 'Opted out',
};
const NAMES_SHOWN = 5;

function toDateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

interface AskPlanPreviewProps {
  query: string;
  roleId?: string;
  candidates: Candidate[];
  roles: Role[];
  processes: Process[];
  onOpenCandidate: (id: string) => void;
  onCompose: (candidateId: string, roleId: string | undefined, tone?: 'warm' | 'direct' | 'short') => void;
  onDone: () => void;
  onAnnounce: (message: string) => void;
}

/**
 * The plan-preview-then-apply contract (src/services/nlCommand.ts): a mutating plan
 * (snooze/status/tag/move_stage/compose) renders as a sentence, an editable value when the
 * plan has one, and the first five names plus "+N more" — never applied by Enter, only by
 * ⌘⏎ or the Apply button. A `filter` plan is a plain, openable result list, same as FIND.
 */
export function AskPlanPreview({
  query, roleId, candidates, roles, processes, onOpenCandidate, onCompose, onDone, onAnnounce,
}: AskPlanPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<NLPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [namesExpanded, setNamesExpanded] = useState(false);
  const [untilOverride, setUntilOverride] = useState<string | null>(null);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [fallbackSearch, setFallbackSearch] = useState(false);
  const { push } = useToast();

  const candidateById = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates]);

  useEffect(() => {
    let cancelled = false;
    // Deferred to a microtask so the effect body itself never calls setState synchronously
    // (react-hooks/set-state-in-effect) — these still land before the debounce fires.
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setLoadError(null);
      setExcludedIds(new Set());
      setUntilOverride(null);
      setStatusOverride(null);
      setNamesExpanded(false);
      setApplyError(null);
      setFallbackSearch(false);
    });
    const debounce = setTimeout(() => {
      void nlCommand.preview(query).then(p => {
        if (cancelled) return;
        setPreview(p);
        setLoading(false);
      }).catch(e => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Could not understand that.');
        setLoading(false);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(debounce); };
  }, [query]);

  const isMutating = !!preview && preview.plan.action !== 'filter';
  const activeIds = useMemo(
    () => (preview ? preview.matches.filter(m => !excludedIds.has(m.id)).map(m => m.id) : []),
    [preview, excludedIds],
  );

  useEffect(() => {
    if (loading) { onAnnounce('Working it out…'); return; }
    if (loadError || !preview) { onAnnounce('Could not understand that.'); return; }
    if (isMutating) {
      onAnnounce(`${activeIds.length} ${activeIds.length === 1 ? 'person' : 'people'} would be affected.`);
    } else {
      onAnnounce(`${preview.matches.length} ${preview.matches.length === 1 ? 'result' : 'results'}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, preview, isMutating, activeIds.length]);

  if (loading) {
    return (
      <div className="ask-plan-loading" role="status" aria-live="polite">
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        <span>Working out what that means…</span>
      </div>
    );
  }

  if (loadError || !preview) {
    return (
      <div className="ask-plan">
        <p role="alert" style={{ color: 'var(--p-red)', fontSize: 14 }}>
          {loadError ?? "Couldn't understand that — try plain search instead."}
        </p>
      </div>
    );
  }

  // Non-mutating: a plain, openable result list — same shape as FIND.
  if (!isMutating) {
    if (preview.matches.length === 0) {
      return <div className="ask-empty">Nothing matches "{query}". Try a different name, company or skill.</div>;
    }
    return (
      <ul className="ask-section-list" role="listbox" aria-label="Search results">
        {preview.matches.slice(0, 30).map(m => {
          const c = candidateById.get(m.id);
          return (
            <li
              key={m.id}
              id={`ask-nl-${m.id}`}
              role="option"
              aria-selected={false}
              className="ask-row"
              onClick={() => onOpenCandidate(m.id)}
            >
              <Avatar name={m.name} size="sm" />
              <div className="ask-row-main">
                <div className="ask-row-name">{m.name}</div>
                {c && <div className="ask-row-story">{storyLine(c, processes, roles)}</div>}
              </div>
              {c && <div className="ask-row-meta">{spokeLabel(dataService.computeWarmthDays(c.warmthAt))}</div>}
            </li>
          );
        })}
      </ul>
    );
  }

  const plan = preview.plan;
  const count = activeIds.length;
  const shown = namesExpanded ? preview.matches : preview.matches.slice(0, NAMES_SHOWN);
  const hiddenCount = preview.matches.length - shown.length;

  const runValidationFailure = (e: unknown) => {
    const message = e instanceof NLCommandError
      ? e.message
      : (e instanceof Error ? e.message : 'Could not apply that command.');
    setApplyError(message);
  };

  const applyMutation = async () => {
    if (count === 0) return;
    setApplying(true);
    setApplyError(null);
    try {
      const finalPlan: NLPlan = {
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
      runValidationFailure(e);
    } finally {
      setApplying(false);
    }
  };

  const applyCompose = () => {
    const first = preview.matches[0];
    if (!first) return;
    onCompose(first.id, roleId, plan.params.tone);
  };

  const apply = () => { if (plan.action === 'compose') applyCompose(); else void applyMutation(); };

  if (fallbackSearch) {
    const results = resolveFilter({ text: query }, candidates);
    return (
      <div className="ask-plan">
        <div className="ask-plan-error" role="status">
          Searching for "{query}" instead — the closest thing we can do.
        </div>
        {results.length === 0 ? (
          <div className="ask-empty">Nothing matches "{query}" either.</div>
        ) : (
          <ul className="ask-section-list p-mt-4" role="listbox" aria-label="Search results">
            {results.slice(0, 20).map(c => (
              <li key={c.id} role="option" aria-selected={false} className="ask-row" onClick={() => onOpenCandidate(c.id)}>
                <Avatar name={c.name} size="sm" />
                <div className="ask-row-main">
                  <div className="ask-row-name">{c.name}</div>
                  <div className="ask-row-story">{storyLine(c, processes, roles)}</div>
                </div>
                <div className="ask-row-meta">{spokeLabel(dataService.computeWarmthDays(c.warmthAt))}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div
      className="ask-plan"
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); apply(); } }}
    >
      <p className="ask-plan-sentence">
        {plan.explanation}
        {plan.action !== 'compose' && (
          <>
            {' — '}
            <span className="ask-plan-count">{count}</span> {count === 1 ? 'person' : 'people'}
          </>
        )}
        {plan.action === 'snooze' && (
          <>
            {' until '}
            <input
              type="date"
              className="ask-plan-date"
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
              className="ask-plan-select"
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

      {plan.action !== 'compose' && preview.matches.length > 0 && (
        <div className="ask-plan-names">
          {shown.map(m => {
            const removed = excludedIds.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`ask-chip${removed ? ' ask-chip-removed' : ''}`}
                onClick={() => setExcludedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                  return next;
                })}
                aria-pressed={!removed}
                title={removed ? `Add ${m.name} back to the plan` : `Drop ${m.name} from the plan`}
              >
                {m.name}
                {!removed && <span className="ask-chip-x"><X size={11} aria-hidden="true" /></span>}
              </button>
            );
          })}
          {!namesExpanded && hiddenCount > 0 && (
            <button type="button" className="ask-chip-more" onClick={() => setNamesExpanded(true)}>
              +{hiddenCount} more
            </button>
          )}
        </div>
      )}

      {applyError && (
        <div className="ask-plan-error" role="alert">
          <div>Couldn't do that — {applyError}</div>
          <div className="p-mt-3">
            <Btn size="sm" onClick={() => setFallbackSearch(true)}>Search "{query}" instead</Btn>
          </div>
        </div>
      )}

      <div className="ask-plan-actions">
        <span className="p-meta">⌘⏎ to apply — plain ⏎ won't</span>
        <Btn tone="primary" size="sm" onClick={apply} disabled={applying || (plan.action !== 'compose' && count === 0)}>
          {applying ? 'Applying…' : plan.action === 'compose' ? 'Open composer' : `Apply to ${count}`}
        </Btn>
      </div>
    </div>
  );
}
