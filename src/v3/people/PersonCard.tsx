/**
 * PersonCard — owned by builder B3 (Home + People). Every v3 screen that shows a person renders
 * one of these; the anatomy is fixed by council/designer-v3.md §2 and must not drift:
 *
 *   R1  avatar 48 · name 20/600 · role @ company 14 ink-2
 *   R2  story sentence 17, 2 lines max
 *   R3  "Strong fit · 94" (accent-ink, tooltip) · dot · "spoke 3 weeks ago"
 *   R4  source badge + ONE action + a "more" menu
 *
 * No other chips. Sentences, not jargon: the labels below are lifted verbatim from the
 * approved mockups (design-v3/Main.dc.html, People.dc.html), not invented here.
 */
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Candidate, Match, Process, Role } from '../../types';
import { computeWarmthDays } from '../../services/dataService';
import { Avatar, Btn, Card, Pill, Term } from '../ui';
import { fitFor, fitPhrase, isOffLimits, sourceLabel, spokeLabel, statusPhrase, storyLine } from '../lib/personText';

export interface PersonCardAction {
  label: string;
  onClick: () => void;
  /** Filled/primary treatment — used for the one moment that deserves it (e.g. "Read reply"). */
  primary?: boolean;
}

export interface PersonCardProps {
  candidate: Candidate;
  processes: Process[];
  roles: Role[];
  matches: Match[];
  /** The primary action's label and handler, e.g. "Write a warm note". */
  action?: PersonCardAction;
  onOpen?: () => void;
  /** Set on the first card of a list so the tour can point at its parts. */
  tourAnchors?: boolean;
  muted?: boolean;
  /** Overrides the fit computed from `matches` — handy when the caller already has one
   * (e.g. a TodayQueueItem's `fit`). Pass `null` explicitly to force "not yet scored". */
  fit?: number | null;
  /** Overrides the computed "spoke …" phrase entirely, e.g. "replied yesterday". */
  contactLabel?: string;
  /** Highlights the row — People's keyboard ↑/↓ active row. */
  selected?: boolean;
}

/** "2 yrs" / "18 mo" — the tenure clause on the role line. Whole years once it's been two or
 * more (unless it lands exactly on a year mark sooner); months below that, since "2 mo" reads
 * more honestly than a fraction of a year. */
function tenureLabel(tenureStart: string, now = Date.now()): string | null {
  const start = new Date(tenureStart).getTime();
  if (Number.isNaN(start)) return null;
  const months = Math.max(0, Math.floor((now - start) / (30.4375 * 86_400_000)));
  if (months < 1) return null;
  if (months % 12 === 0) return `${months / 12} yr${months === 12 ? '' : 's'}`;
  if (months < 24) return `${months} mo`;
  const years = Math.round(months / 12);
  return `${years} yr${years === 1 ? '' : 's'}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The small "…" menu — the one thing a card can do besides its primary action. Only rendered
 * when there is somewhere for "Open profile" to go. */
function MoreMenu({ onOpen }: { onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 'none' }}>
      <button
        type="button"
        className="p-x"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="p-menu" role="menu" style={{ width: 180 }}>
          <button
            type="button"
            role="menuitem"
            className="p-menu-item"
            onClick={e => { e.stopPropagation(); setOpen(false); onOpen(); }}
          >
            Open profile
          </button>
        </div>
      )}
    </div>
  );
}

export function PersonCard({
  candidate, processes, roles, matches, action, onOpen, tourAnchors, muted, fit: fitProp, contactLabel, selected,
}: PersonCardProps) {
  const offLimits = isOffLimits(candidate);
  const fit = fitProp !== undefined ? fitProp : fitFor(candidate.id, matches);
  const story = storyLine(candidate, processes, roles);
  const badge = sourceLabel(candidate);
  const warmthDays = computeWarmthDays(candidate.warmthAt);
  const spoke = contactLabel ?? spokeLabel(warmthDays);
  const tenure = tenureLabel(candidate.tenureStart);
  const roleLine = `${candidate.currentTitle} at ${candidate.currentEmployer}${tenure ? ` · ${tenure}` : ''}`;

  // "Never a Write button" for someone we must not approach — enforced here, not left to the
  // caller, so a wiring mistake elsewhere can never put outreach in front of an off-limits
  // person. The handler the caller passed still runs; only the label is pinned.
  const resolvedAction: PersonCardAction | undefined = offLimits
    ? (action ? { ...action, label: 'Remind me then', primary: false } : undefined)
    : action;

  const fitNode = fit != null && (
    <span className={offLimits ? 'p-fit-wait' : 'p-fit'}>
      <Term term="fit">{fitPhrase(fit)}{offLimits ? ', but wait' : ''}</Term>
    </span>
  );
  const spokeNode = <Term term="lastContact">{spoke}</Term>;
  const offLimitsNote = offLimits ? statusPhrase(candidate) : null;

  return (
    <Card
      lift
      pad={false}
      className={`p-person${muted ? ' p-person-muted' : ''}${selected ? ' p-person-active' : ''}`}
      style={{ minHeight: 168 }}
    >
      <Avatar name={candidate.name} />

      <div className="p-grow">
        <div className="p-row p-gap-3 p-wrap">
          {onOpen ? (
            <button type="button" className="p-name p-name-link" onClick={onOpen}>{candidate.name}</button>
          ) : (
            <span className="p-name">{candidate.name}</span>
          )}
          <span className="p-sec">{roleLine}</span>
        </div>

        <div className="p-story p-clamp-2 p-mt-2" data-tour={tourAnchors ? 'story' : undefined}>
          {story}
        </div>

        <div className="p-person-facts" data-tour={tourAnchors ? 'fit' : undefined}>
          {fitNode}
          {fitNode && <span aria-hidden="true">·</span>}
          {spokeNode}
          {badge && <span aria-hidden="true">·</span>}
          {badge && (
            candidate.source?.url ? (
              <a href={candidate.source.url} target="_blank" rel="noreferrer" className="p-pill p-pill-sm">{badge}</a>
            ) : (
              <Pill sm>{badge}</Pill>
            )
          )}
          {offLimitsNote && <Pill tone="amber" sm>{offLimitsNote}</Pill>}
        </div>
      </div>

      <span data-tour={tourAnchors ? 'write' : undefined} style={{ flex: 'none' }}>
        {resolvedAction ? (
          <Btn tone={resolvedAction.primary ? 'primary' : 'default'} onClick={resolvedAction.onClick}>
            {resolvedAction.label}
          </Btn>
        ) : offLimits ? (
          <Btn tone="ghost" onClick={onOpen}>Remind me then</Btn>
        ) : null}
      </span>

      {onOpen && <MoreMenu onOpen={onOpen} />}
    </Card>
  );
}

/** Small helper other v3 screens can use for a first-name greeting/action label without
 * re-implementing name splitting. */
export { firstName as personFirstName };
