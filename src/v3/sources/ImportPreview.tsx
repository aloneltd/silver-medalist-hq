import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Avatar, Btn, Card, Pill, Term } from '../ui';
import type { ColumnMapping, ImportBatch, ImportFieldKey, ImportPlan, StagedPerson } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { commitPlan, remapPlan } from '../import';
import { FIELD_LABELS, FIELD_ORDER } from './fieldLabels';
import { friendlyEngineError, numberWord, pluralize } from './format';

interface Props {
  plan: ImportPlan;
  onPlanChange: (plan: ImportPlan) => void;
  onCancel: () => void;
  onCommitted: (batch: ImportBatch, plan: ImportPlan) => void;
}

/**
 * THE centrepiece of the Sources hub (DESIGN-v3.md pillar 1): the mapping + merge preview,
 * shown before anything is ever written. Column changes go through `remapPlan` (the engine
 * re-runs field extraction and dedupe); per-person merge/keep-both decisions are pure client
 * state on the plan until Commit sends the whole thing through `commitPlan`.
 */
export function ImportPreview({ plan, onPlanChange, onCancel, onCommitted }: Props) {
  const { user, mode } = useAuth();
  const actor = mode === 'google' && user?.name ? user.name : 'You';
  const [remapping, setRemapping] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = plan.columns ?? [];
  const confidentCols = columns.filter(c => c.confidence === 'exact');
  const guessCols = columns.filter(c => c.confidence === 'guess');

  const createCount = plan.people.filter(p => p.decision === 'create').length;
  const mergeCount = plan.people.filter(p => p.decision === 'merge').length;
  const matched = plan.people.filter(p => p.existing);
  const exactMatches = matched.filter(p => p.confidence === 'exact');
  const probableMatches = matched.filter(p => p.confidence === 'probable');

  async function handleFieldChange(column: string, field: ImportFieldKey) {
    if (!plan.columns) return;
    const nextColumns: ColumnMapping[] = plan.columns.map(c => (c.column === column ? { ...c, field } : c));
    // Optimistic: reflect the pick immediately even if the engine can't re-run dedupe yet.
    onPlanChange({ ...plan, columns: nextColumns });
    setRemapping(true);
    setError(null);
    try {
      const next = await remapPlan(plan, nextColumns);
      onPlanChange(next);
    } catch (e) {
      setError(friendlyEngineError(e, "Re-checking people after that change"));
    } finally {
      setRemapping(false);
    }
  }

  function setDecision(key: string, decision: StagedPerson['decision']) {
    onPlanChange({ ...plan, people: plan.people.map(p => (p.key === key ? { ...p, decision } : p)) });
  }

  async function handleCommit() {
    setCommitting(true);
    setError(null);
    try {
      const batch = await commitPlan(plan, { actor });
      onCommitted(batch, plan);
    } catch (e) {
      setError(friendlyEngineError(e, 'Adding these people'));
    } finally {
      setCommitting(false);
    }
  }

  const matchedSentence = columns.length > 0
    ? `We matched ${confidentCols.length} of ${columns.length} columns ourselves.${
        guessCols.length > 0 ? ` Please check the ${numberWord(guessCols.length)} we guessed.` : ''
      }`
    : null;

  return (
    <Card pad={false} className="src-preview p-mt-6">
      <div className="p-row p-gap-4 p-wrap" style={{ padding: '20px 28px', borderBottom: '1px solid var(--p-line)' }}>
        <Pill tone="wash">Import</Pill>
        <div style={{ fontSize: 17, fontWeight: 600 }}>
          {plan.filename ?? plan.sourceLabel} · {pluralize(plan.rowCount, 'row')} read
        </div>
        {matchedSentence && <div className="p-sec">{matchedSentence}</div>}
        <div className="p-row p-gap-2" style={{ marginLeft: 'auto' }}>
          <Btn size="sm" onClick={onCancel} disabled={committing}>Cancel</Btn>
          <Btn size="sm" tone="primary" onClick={handleCommit} disabled={committing || plan.people.length === 0}>
            {committing ? 'Adding…' : `Add ${pluralize(createCount, 'person', 'people')}, merge ${mergeCount}`}
          </Btn>
        </div>
      </div>

      {error && <div className="p-note-amber" style={{ margin: '16px 28px 0' }}>{error}</div>}

      <div className="src-preview-body">
        <div className="src-preview-col" style={{ padding: '24px 28px' }}>
          <div className="p-strong" style={{ marginBottom: 12 }}>Columns</div>
          {columns.length === 0 ? (
            <div className="p-hint">This import doesn't have columns to map — it's read as whole records.</div>
          ) : (
            <div className="p-col p-gap-3" style={{ fontSize: 14, opacity: remapping ? 0.6 : 1 }}>
              {guessCols.map(col => (
                <MappingRow key={col.column} col={col} guess onChange={f => handleFieldChange(col.column, f)} />
              ))}
              {confidentCols.length > 0 && (
                showAllColumns
                  ? confidentCols.map(col => (
                      <MappingRow key={col.column} col={col} onChange={f => handleFieldChange(col.column, f)} />
                    ))
                  : (
                    <button type="button" className="src-link p-mt-2" onClick={() => setShowAllColumns(true)}>
                      + {confidentCols.length} more, all matched
                    </button>
                  )
              )}
            </div>
          )}
        </div>

        <div className="src-preview-col" style={{ padding: '24px 28px' }}>
          <div className="p-strong">Looks like people you already have · {matched.length}</div>
          <div className="p-col p-gap-3 p-mt-3">
            {exactMatches.map(p => (
              <MergeRow key={p.key} person={p} kind="exact" onDecision={d => setDecision(p.key, d)} />
            ))}
            {probableMatches.map(p => (
              <MergeRow key={p.key} person={p} kind="probable" onDecision={d => setDecision(p.key, d)} />
            ))}
            {matched.length === 0 && (
              <div className="p-hint">Nothing here looks like a duplicate of anyone already on your bench.</div>
            )}
          </div>
          <div className="p-meta p-mt-4">Everything here can be undone for 30 days.</div>
        </div>
      </div>

      {plan.notes.length > 0 && (
        <div className="p-col p-gap-2" style={{ padding: '20px 28px', borderTop: '1px solid var(--p-line)' }}>
          {plan.notes.map((note, i) => (
            <div key={i} className="p-note">{note}</div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MappingRow({ col, guess, onChange }: { col: ColumnMapping; guess?: boolean; onChange: (field: ImportFieldKey) => void }) {
  return (
    <div className="src-mapping-row">
      <span className="src-mapping-col" title={col.column}>{col.column}</span>
      <ArrowRight size={14} color={guess ? 'var(--p-amber)' : 'var(--p-faint)'} />
      {guess ? (
        <>
          <select
            className="src-select-guess"
            value={col.field}
            onChange={e => onChange(e.target.value as ImportFieldKey)}
            aria-label={`Map column "${col.column}"`}
          >
            {FIELD_ORDER.map(key => (
              <option key={key} value={key}>{FIELD_LABELS[key]}</option>
            ))}
          </select>
          <span className="p-meta">our guess</span>
        </>
      ) : (
        <span className="p-strong">{FIELD_LABELS[col.field]}</span>
      )}
      {col.sample && <span className="src-mapping-sample" title={col.sample}>&ldquo;{col.sample}&rdquo;</span>}
    </div>
  );
}

function MergeRow(
  { person, kind, onDecision }: { person: StagedPerson; kind: 'exact' | 'probable'; onDecision: (d: StagedPerson['decision']) => void },
) {
  const existing = person.existing;
  if (!existing) return null;
  const sentence = person.explain ?? `looks like the same person as ${existing.name}, already on your bench.`;
  const changed = person.changedFields && person.changedFields.length > 0
    ? ` The export adds: ${person.changedFields.join(', ')}.`
    : '';

  return (
    <Card pad={false} className="src-merge-row">
      <Avatar name={existing.name} size="md" />
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.45 }}>
        <span className="p-strong">{person.draft.name}</span> · {sentence}
        {changed}
        {kind === 'exact' && (
          <> <Term term="doNotApproach">Their "do not approach" status</Term> and notes stay.</>
        )}
      </div>
      {kind === 'exact' ? (
        <Btn
          size="sm"
          tone={person.decision === 'merge' ? 'default' : 'ghost'}
          onClick={() => onDecision(person.decision === 'merge' ? 'create' : 'merge')}
        >
          {person.decision === 'merge' ? 'Keep separate instead' : 'Merge instead'}
        </Btn>
      ) : (
        <div className="p-row p-gap-2">
          <Btn size="sm" tone={person.decision === 'merge' ? 'primary' : 'default'} aria-pressed={person.decision === 'merge'} onClick={() => onDecision('merge')}>
            Merge
          </Btn>
          <Btn size="sm" tone={person.decision === 'create' ? 'primary' : 'ghost'} aria-pressed={person.decision === 'create'} onClick={() => onDecision('create')}>
            Keep both
          </Btn>
        </div>
      )}
    </Card>
  );
}
