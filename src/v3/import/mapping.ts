/**
 * Column mapping: rules first, the AI only for what is left, fuzzy matching if the AI is down.
 * An import is never blocked on a model call.
 */
import type { ColumnMapping } from '../../types';
import { askColumnMapping } from './ai';
import { fuzzyFieldFor, ruleFor } from './headers';

export interface MappingResult {
  columns: ColumnMapping[];
  /** True when at least one column was decided by the model rather than by a rule. */
  mappedByAI: boolean;
  /** Honest note when the AI was asked and could not answer. */
  aiFailed: boolean;
}

/** The rule-only pass. Everything it cannot place comes back in `unknown`. */
export function ruleMapping(
  headers: string[],
  samples: Record<string, string[]>,
): { columns: ColumnMapping[]; unknown: string[] } {
  const columns: ColumnMapping[] = [];
  const unknown: string[] = [];
  for (const header of headers) {
    const field = ruleFor(header);
    const sample = samples[header]?.[0];
    if (field) {
      columns.push({ column: header, field, confidence: 'exact', ...(sample ? { sample } : {}) });
    } else {
      unknown.push(header);
      columns.push({ column: header, field: 'skip', confidence: 'guess', ...(sample ? { sample } : {}) });
    }
  }
  return { columns, unknown };
}

/**
 * Full mapping. One AI call for every unknown header at once — never one per column.
 *
 * @param useAi set false for `remapPlan` and for tests: mapping must stay pure and instant there.
 */
export async function buildMapping(
  headers: string[],
  samples: Record<string, string[]>,
  useAi = true,
): Promise<MappingResult> {
  const { columns, unknown } = ruleMapping(headers, samples);
  if (!unknown.length) return { columns, mappedByAI: false, aiFailed: false };

  const byColumn = new Map(columns.map(c => [c.column, c]));
  let mappedByAI = false;
  let aiFailed = false;

  if (useAi) {
    const guesses = await askColumnMapping(
      unknown,
      Object.fromEntries(unknown.map(h => [h, samples[h] ?? []])),
    );
    if (guesses) {
      for (const g of guesses) {
        const col = byColumn.get(g.column);
        if (!col) continue;
        col.field = g.field;
        col.confidence = 'guess';
        if (g.field !== 'skip') mappedByAI = true;
      }
    } else {
      aiFailed = true;
    }
  }

  // Whatever the AI did not place (or could not be asked about) still gets a fair try.
  for (const header of unknown) {
    const col = byColumn.get(header);
    if (!col || col.field !== 'skip') continue;
    const guess = fuzzyFieldFor(header);
    if (guess !== 'skip') {
      col.field = guess;
      col.confidence = 'guess';
    }
  }

  return { columns, mappedByAI, aiFailed };
}

/**
 * Applies a user's corrections on top of a plan's existing columns, keeping the samples and
 * marking anything the user touched as a rule-grade certainty — they told us, so we know.
 */
export function applyCorrections(existing: ColumnMapping[], corrections: ColumnMapping[]): ColumnMapping[] {
  const byColumn = new Map(corrections.map(c => [c.column, c]));
  const merged = existing.map(col => {
    const fix = byColumn.get(col.column);
    if (!fix) return { ...col };
    byColumn.delete(col.column);
    return {
      ...col,
      field: fix.field,
      confidence: fix.confidence ?? (fix.field === col.field ? col.confidence : 'exact'),
      ...(fix.sample ? { sample: fix.sample } : col.sample ? { sample: col.sample } : {}),
    } as ColumnMapping;
  });
  // A correction for a column the plan never saw is still honoured.
  for (const extra of byColumn.values()) merged.push({ ...extra });
  return merged;
}
