/**
 * ⌘K mode detection — DESIGN-v2.1.md §C.2: "detected when the query has a verb or > 3 words".
 * Deliberately cheap (no AI call to decide whether to make an AI call): a short allow-list of
 * verbs a recruiter would actually type, plus a word-count fallback for longer free-form
 * commands that don't happen to start with one of them.
 */
const NL_VERBS = [
  'snooze', 'show', 'filter', 'find', 'tag', 'mark', 'move', 'draft', 'compose', 'set',
  'change', 'resurface', 'status', 'hide', 'list', 'schedule', 'remind', 'follow', 'reach',
  'email', 'message', 'update', 'flag', 'archive', 'unsnooze', 'wake', 'pause',
];

export function looksLikeNaturalLanguage(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 3) return true;
  const first = words[0]?.toLowerCase().replace(/[^a-z]/g, '');
  return !!first && NL_VERBS.includes(first);
}
