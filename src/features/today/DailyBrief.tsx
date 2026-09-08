import { useEffect, useMemo, useRef, useState } from 'react';
import { dataService } from '../../services/dataService';
import { useAppUI } from '../../app/store';
import { useDossierLink } from '../../app/useDossierLink';
import { SETTINGS_KEYS } from '../../types';
import { computeDailyBriefFacts, type BriefFact } from './dailyBriefFacts';
import { snoozeCandidate } from '../bench/lib/actions';
import { replyWatcher } from '../../services/replyWatcher';
import { Button } from '../../ui';
import './dailyBrief.css';

interface BriefCache {
  day: string;
  hash: string;
  lines: string[];
  openingLine: string;
}

function todayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function openingLine(now: number, factCount: number, biggest: string | undefined): string {
  const d = new Date(now);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  if (factCount === 0) return 'Nothing needs you today.';
  return `${weekday} ${date} — ${factCount} thing${factCount === 1 ? '' : 's'} need you. ${biggest ?? ''}`.trim();
}

/**
 * Daily Brief — DESIGN-v2.1.md §C.1 + council amendments §4 (the hard boundary): every fact
 * and count is computed in code (dailyBriefFacts.ts); /api/brief only orders and phrases the
 * JSON fact list into prose, streamed line-by-line. If that endpoint isn't there yet (or
 * fails), each fact's own plain-English sentence renders directly — never a blocked UI, never
 * an invented fact. Cached per (day, fact set) in settings.briefCache so a re-render or a
 * reload doesn't re-stream.
 */
export function DailyBrief() {
  const { selectedRoleId, setSelectedRoleId, openComposer } = useAppUI();
  const { openCandidate } = useDossierLink();
  const cachedSetting = dataService.hooks.useSetting<BriefCache | null>(SETTINGS_KEYS.briefCache, null);

  // Starts replyWatcher's 15-min Graph poll the first time Today is visited this session —
  // DESIGN-v2.1.md §A ("every 15 minutes while the app is open"). No-op when Outlook isn't
  // connected (checked inside runOnce) and idempotent if already running.
  useEffect(() => { replyWatcher.start(); }, []);

  const [facts, setFacts] = useState<BriefFact[] | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [opening, setOpening] = useState<string>('');
  const [streaming, setStreaming] = useState(false);
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const now = Date.now();
      const { facts: computed, hash } = await computeDailyBriefFacts(selectedRoleId ?? undefined, now);
      if (cancelled) return;
      setFacts(computed);

      const day = todayKey(now);
      const cache = cachedSetting;
      if (cache && cache.day === day && cache.hash === hash) {
        setOpening(cache.openingLine);
        setLines(cache.lines);
        return;
      }
      if (startedFor.current === hash) return; // already streaming this exact fact set
      startedFor.current = hash;

      const opener = openingLine(now, computed.length, computed[0]?.plain);
      setOpening(opener);
      setLines(computed.map(f => f.plain)); // honest fallback shown immediately, replaced as AI lines arrive

      if (computed.length === 0) {
        await dataService.setSetting(SETTINGS_KEYS.briefCache, { day, hash, lines: [], openingLine: opener } satisfies BriefCache);
        return;
      }

      setStreaming(true);
      try {
        const res = await fetch('/api/brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ facts: computed.map(f => ({ id: f.id, kind: f.kind, plain: f.plain })) }),
        });
        if (!res.ok || !res.body) throw new Error('brief unavailable');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const streamedLines = buf.split('\n').filter(Boolean);
          if (!cancelled && streamedLines.length) {
            setLines(computed.map((f, i) => streamedLines[i]?.trim() || f.plain));
          }
        }
        const finalLines = buf.split('\n').filter(Boolean);
        const merged = computed.map((f, i) => finalLines[i]?.trim() || f.plain);
        if (!cancelled) setLines(merged);
        await dataService.setSetting(SETTINGS_KEYS.briefCache, { day, hash, lines: merged, openingLine: opener } satisfies BriefCache);
      } catch {
        // Honest fallback already on screen (the fact's own plain sentence) — just persist it.
        if (!cancelled) {
          await dataService.setSetting(SETTINGS_KEYS.briefCache, {
            day, hash, lines: computed.map(f => f.plain), openingLine: opener,
          } satisfies BriefCache);
        }
      } finally {
        if (!cancelled) setStreaming(false);
      }
    })();
    return () => { cancelled = true; };
    // cachedSetting intentionally excluded — it's read once per fact-set change via the ref guard above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoleId]);

  const rows = useMemo(() => (facts ?? []).map((f, i) => ({ fact: f, text: lines[i] ?? f.plain })), [facts, lines]);

  if (facts === null) {
    return (
      <section className="smhq-brief" aria-label="Daily brief" aria-busy="true">
        <div className="smhq-brief-skel" style={{ width: '55%' }} />
        <div className="smhq-brief-skel" />
        <div className="smhq-brief-skel" style={{ width: '80%' }} />
      </section>
    );
  }

  if (facts.length === 0) {
    return (
      <section className="smhq-brief" aria-label="Daily brief">
        <p className="smhq-brief-opening">Nothing needs you today.</p>
      </section>
    );
  }

  return (
    <section className="smhq-brief" aria-label="Daily brief" aria-live="polite">
      <p className="smhq-brief-opening">{opening}</p>
      <ul className="smhq-brief-list">
        {rows.map(({ fact, text }, i) => (
          <li key={fact.id} className="smhq-brief-row">
            {streaming && !text ? (
              <span className="smhq-brief-skel" />
            ) : fact.candidateId ? (
              <button type="button" className="smhq-brief-text smhq-brief-text-link" onClick={() => openCandidate(fact.candidateId!)}>
                {i + 1}. {text}
              </button>
            ) : fact.roleId ? (
              <button type="button" className="smhq-brief-text smhq-brief-text-link" onClick={() => setSelectedRoleId(fact.roleId!)}>
                {i + 1}. {text}
              </button>
            ) : (
              <span className="smhq-brief-text">{i + 1}. {text}</span>
            )}
            <span className="smhq-brief-actions">
              {fact.action === 'reach_out' && fact.candidateId && (
                <Button size="sm" variant="secondary" onClick={() => openComposer({ candidateId: fact.candidateId!, roleId: fact.roleId ?? selectedRoleId ?? undefined })}>
                  Reach out
                </Button>
              )}
              {fact.action === 'open_shortlist' && fact.roleId && (
                <Button size="sm" variant="secondary" onClick={() => setSelectedRoleId(fact.roleId!)}>
                  Open shortlist
                </Button>
              )}
              {fact.action === 'open_candidate' && fact.candidateId && (
                <Button size="sm" variant="ghost" onClick={() => openCandidate(fact.candidateId!)}>
                  Open
                </Button>
              )}
              {fact.candidateId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => snoozeCandidate(fact.candidateId!, new Date(Date.now() + 3 * 86_400_000).toISOString())}
                >
                  Snooze
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
