import { useState } from 'react';
import { Button } from '../../ui';
import type { DriftSummary } from './lib/drift';

export interface DriftControlsProps {
  monthsAgo: number;
  onScrub: (months: number) => void;
  onRelease: () => void;
  summary: DriftSummary;
  onAddCooled: () => void;
  addBusy: boolean;
  addedThisSession: boolean;
}

/**
 * Drift's slider + the fixed 6-month caption/CTA — council amendments §2. The slider is a
 * live scrub (0-12 months back, `onScrub` fires continuously); releasing it snaps back to
 * today. The caption below is independent of the slider position: it's always "6 months ago"
 * per the amendment's verbatim wording, so it doesn't flicker while someone drags.
 */
export function DriftControls({
  monthsAgo, onScrub, onRelease, summary, onAddCooled, addBusy, addedThisSession,
}: DriftControlsProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className="smhq-target-drift">
      <div className="smhq-target-drift-slider">
        <label htmlFor="smhq-drift-range" className="smhq-muted" style={{ fontSize: 11.5 }}>Drift</label>
        <input
          id="smhq-drift-range"
          type="range"
          min={0}
          max={12}
          step={0.5}
          value={monthsAgo}
          onPointerDown={() => setDragging(true)}
          onInput={e => onScrub(Number((e.target as HTMLInputElement).value))}
          onPointerUp={() => { setDragging(false); onRelease(); }}
          onBlur={() => { if (dragging) { setDragging(false); onRelease(); } }}
          onKeyDown={() => setDragging(true)}
          onKeyUp={e => {
            // A keyboard nudge (arrow keys, Home/End, etc.) scrubs the same as a drag —
            // release only on the keys that mean "done": Enter commits, Escape/Tab move on.
            // Releasing on every keyup (the previous behaviour) snapped straight back to 0 on
            // the very first arrow press, making the slider un-scrubbable from the keyboard.
            if (e.key === 'Enter' || e.key === 'Escape') { setDragging(false); onRelease(); }
          }}
          aria-label="Scrub the Target back in time, 0 to 12 months"
          aria-valuetext={monthsAgo === 0 ? 'Today' : `${monthsAgo} months ago`}
        />
        <span className="smhq-target-drift-readout" aria-live="polite">
          {dragging ? (monthsAgo === 0 ? 'Today' : `${monthsAgo} month${monthsAgo === 1 ? '' : 's'} ago`) : 'Today'}
        </span>
      </div>

      <p className="smhq-target-drift-caption">
        {summary.warmThen === 0
          ? `Nobody was warm ${summary.monthLabel} — the target is calm.`
          : summary.cooledSince === 0
            ? `${summary.monthLabel}, ${summary.warmThen} of these were warm. All of them still are.`
            : `${summary.monthLabel}, ${summary.warmThen} of these were warm. ${summary.cooledSince} have cooled since.`}
        {summary.cooledSince > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onAddCooled}
            loading={addBusy}
            disabled={addedThisSession}
            style={{ marginLeft: 8 }}
          >
            {addedThisSession ? `Added ${summary.cooledSince} to Today ✓` : `Add those ${summary.cooledSince} to Today`}
          </Button>
        )}
      </p>
    </div>
  );
}
