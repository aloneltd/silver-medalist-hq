import { useEffect, useMemo, useState } from 'react';
import { dataService } from '../../services/dataService';
import { briefFacts } from '../../services/briefFacts';
import type { BriefFact, BriefFactKind, DailyBrief as DailyBriefResult } from '../../services/briefFacts';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { snoozeCandidate } from '../bench/lib/actions';
import { replyWatcher } from '../../services/replyWatcher';
import { Button, Chip } from '../../ui';
import type { Candidate } from '../../types';
import './dailyBrief.css';

/** Stable empty-array reference so a `?? []` fallback doesn't defeat memoization every render. */
const EMPTY_CANDIDATES: Candidate[] = [];

const KIND_LABEL: Record<BriefFactKind, string> = {
  resurface_window: 'Resurfacing soon',
  reply_unanswered: 'Waiting on you',
  stale_strong: 'Strong fits gone quiet',
  best_shortlist: 'Best shortlist',
  sequence_due: 'Follow-ups due today',
  placement_this_month: 'Placed this month',
};

const PRIMARY_ACTION: Record<BriefFactKind, 'reach_out' | 'open' | 'open_shortlist' | null> = {
  resurface_window: 'open',
  reply_unanswered: 'reach_out',
  stale_strong: 'reach_out',
  best_shortlist: 'open_shortlist',
  sequence_due: 'reach_out',
  placement_this_month: null,
};

/** `?c=<id>` (single person) or `?filter=<kind>[&roleId=...]` (group) — src/services/briefFacts.ts's link contract. */
function parseLink(link: string): { candidateId?: string; roleId?: string } {
  const params = new URLSearchParams(link.replace(/^\?/, ''));
  return { candidateId: params.get('c') ?? undefined, roleId: params.get('roleId') ?? undefined };
}

/**
 * Daily Brief — DESIGN-v2.1.md §C.1 + council amendments §4. All the fact computation, the
 * hard "never invent a name" boundary, the /api/brief phrasing call and its fallback, and the
 * settings.briefCache cache live in src/services/briefFacts.ts (B1) — this component is purely
 * presentation: a skeleton while getBrief() is in flight (never a spinner), the resulting prose,
 * then one row per fact with real people (resolved back to candidate ids via a local name index,
 * since group facts intentionally carry names only) and an inline action per fact kind.
 */
export function DailyBrief() {
  const { selectedRoleId, setSelectedRoleId, openComposer } = useAppUI();
  const { openCandidate } = useDossierLink();
  const candidates = dataService.hooks.useCandidates() ?? EMPTY_CANDIDATES;

  const nameToId = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of candidates) if (!m.has(c.name)) m.set(c.name, c.id);
    return m;
  }, [candidates]);

  // Starts replyWatcher's 15-min Graph poll the first time Today is visited this session —
  // DESIGN-v2.1.md §A ("every 15 minutes while the app is open"). No-op when Outlook isn't
  // connected (checked inside runOnce) and idempotent if already running.
  useEffect(() => { replyWatcher.start(); }, []);

  const [brief, setBrief] = useState<DailyBriefResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Deferred to a microtask so the effect body itself never calls setState synchronously
    // (react-hooks/set-state-in-effect) — getBrief() still kicks off this tick.
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      void briefFacts.getBrief(selectedRoleId ?? undefined).then(b => {
        if (!cancelled) { setBrief(b); setLoading(false); }
      });
    });
    return () => { cancelled = true; };
  }, [selectedRoleId]);

  if (loading || !brief) {
    return (
      <section className="smhq-brief" aria-label="Daily brief" aria-busy="true">
        <div className="smhq-brief-skel" style={{ width: '55%' }} />
        <div className="smhq-brief-skel" />
        <div className="smhq-brief-skel" style={{ width: '80%' }} />
      </section>
    );
  }

  const rowFor = (fact: BriefFact) => {
    const primary = PRIMARY_ACTION[fact.kind];
    const { candidateId: linkedId, roleId: linkedRoleId } = parseLink(fact.link);
    const firstId = linkedId ?? fact.ids?.[0] ?? nameToId.get(fact.names[0]);

    return (
      <li key={`${fact.kind}-${fact.link}`} className="smhq-brief-fact">
        <div className="smhq-brief-fact-head">
          <span className="smhq-brief-fact-label">{KIND_LABEL[fact.kind]}{fact.kind === 'best_shortlist' && fact.roleTitle ? ` — ${fact.roleTitle}` : ''}</span>
          <span className="smhq-brief-actions">
            {primary === 'reach_out' && firstId && (
              <Button size="sm" variant="secondary" onClick={() => openComposer({ candidateId: firstId, roleId: selectedRoleId ?? undefined })}>
                Reach out
              </Button>
            )}
            {primary === 'open' && firstId && (
              <Button size="sm" variant="ghost" onClick={() => openCandidate(firstId)}>Open</Button>
            )}
            {primary === 'open_shortlist' && linkedRoleId && (
              <Button size="sm" variant="secondary" onClick={() => setSelectedRoleId(linkedRoleId)}>Open shortlist</Button>
            )}
            {(fact.kind === 'resurface_window' || fact.kind === 'stale_strong') && firstId && (
              <Button size="sm" variant="ghost" onClick={() => snoozeCandidate(firstId, new Date(Date.now() + 3 * 86_400_000).toISOString())}>
                Snooze
              </Button>
            )}
          </span>
        </div>
        <div className="smhq-brief-names">
          {fact.names.map((name, i) => {
            // Prefer the id parallel to this exact name (fact.ids[i]) over a name->id lookup —
            // the bench can hold two people with the same name, and a lookup map would silently
            // collapse them onto whichever id it saw first. Fall back only for the (test-only)
            // fact literals that predate the ids field.
            const id = fact.ids?.[i] ?? nameToId.get(name);
            const key = id ? `${id}-${i}` : `${name}-${i}`;
            return id ? (
              <Chip key={key} tone="neutral" onClick={() => openCandidate(id)}>{name}</Chip>
            ) : (
              <Chip key={key} as="span" tone="neutral">{name}</Chip>
            );
          })}
        </div>
      </li>
    );
  };

  return (
    <section className="smhq-brief" aria-label="Daily brief" aria-live="polite">
      <p className="smhq-brief-opening">{brief.text}</p>
      {brief.facts.length > 0 && (
        <ul className="smhq-brief-list">
          {brief.facts.map(rowFor)}
        </ul>
      )}
    </section>
  );
}
