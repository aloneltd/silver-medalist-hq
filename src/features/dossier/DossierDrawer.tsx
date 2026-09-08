import { useState } from 'react';
import { dataService } from '../../services/dataService';
import { useAppUI } from '../../app/store';
import { Drawer, Chip, Button, Skeleton, Dialog } from '../../ui';
import { cx, STATUS_META } from '../bench/lib/tokens';
import { daysSince, defaultResurfaceDate, tenureMonths } from '../bench/lib/warmth';
import { snoozeCandidate, markPlaced } from '../bench/lib/actions';
import { CompGauge } from './CompGauge';
import { ChangeStatusDialog } from './ChangeStatusDialog';
import { StoryTab } from './tabs/StoryTab';
import { FitTab } from './tabs/FitTab';
import { NotesTab } from './tabs/NotesTab';
import { ActivityTab } from './tabs/ActivityTab';

export interface DossierDrawerProps {
  candidateId: string;
  onClose: () => void;
}

type TabKey = 'story' | 'fit' | 'notes' | 'activity';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'fit', label: 'Fit' },
  { key: 'notes', label: 'Notes' },
  { key: 'activity', label: 'Activity' },
];

function tenureLabel(tenureStart: string): string {
  const months = tenureMonths(tenureStart);
  if (months < 12) return `${months} mo.`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years}y ${rem}mo` : `${years}y`;
}

/**
 * The CRM heart of the bench, per BLUEPRINT-v2.md: header (warmth, status + reason, comp
 * gauge vs the selected role's band, notice/visa/location), Story/Fit/Notes/Activity tabs, and
 * every action (Reach out, Move stage, Snooze, Add note, Change status, Mark placed) logging
 * to Activity through dataService.
 */
export function DossierDrawer({ candidateId, onClose }: DossierDrawerProps) {
  const { selectedRoleId, openComposer } = useAppUI();
  const candidate = dataService.hooks.useCandidate(candidateId);
  const role = dataService.hooks.useRole(selectedRoleId ?? undefined);
  const matches = dataService.hooks.useMatchesForRole(selectedRoleId ?? undefined) ?? [];
  const match = matches.find(m => m.candidateId === candidateId);

  const [tab, setTab] = useState<TabKey>('story');
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [placedOpen, setPlacedOpen] = useState(false);
  const [placedBusy, setPlacedBusy] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);

  const meta = candidate ? (STATUS_META[candidate.status] ?? STATUS_META.active) : undefined;
  const warmthDays = candidate ? daysSince(candidate.warmthAt) : 0;

  return (
    <Drawer
      open
      onClose={onClose}
      title={candidate ? candidate.name : <Skeleton width={140} height={20} />}
      subtitle={candidate ? `${candidate.currentTitle} · ${candidate.currentEmployer} · ${tenureLabel(candidate.tenureStart)}` : undefined}
      width={520}
    >
      {!candidate ? (
        <div className="flex flex-col gap-3">
          <Skeleton height={16} />
          <Skeleton height={16} width="70%" />
          <Skeleton height={80} />
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-4 text-sm">
          {/* header block */}
          <div className="flex flex-wrap items-center gap-2">
            <Chip as="span" tone={meta?.greyed ? 'neutral' : 'accent'}>{meta?.label}</Chip>
            <Chip as="span" tone="neutral">{warmthDays === 0 ? 'Touched today' : `${warmthDays}d since touch`}</Chip>
            <Chip as="span" tone="neutral">{candidate.location}</Chip>
            {candidate.noticePeriodDays != null && (
              <Chip as="span" tone="neutral">{candidate.noticePeriodDays}d notice</Chip>
            )}
            {candidate.visaNeed && <Chip as="span" tone="amber">Visa needed</Chip>}
          </div>

          {candidate.statusReason && <p className={`text-xs ${cx.muted}`}>{candidate.statusReason}</p>}
          {candidate.seniorityDriftHint && (
            <p className={`text-xs ${cx.accentText}`}>{candidate.seniorityDriftHint}</p>
          )}

          <div>
            <h3 className={`mb-1 text-xs font-bold uppercase tracking-wide ${cx.muted}`}>
              Comp vs {role ? role.title : 'role'} band
            </h3>
            <CompGauge band={role?.compBand} figure={candidate.compExpectation ?? candidate.compAtLastProcess} />
          </div>

          {/* actions */}
          <div className="flex flex-wrap gap-2 border-y py-2" style={{ borderColor: 'var(--border,#262c34)' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => openComposer({ candidateId, roleId: selectedRoleId ?? undefined })}
            >
              Reach out
            </Button>

            {match && (
              <select
                className="smhq-input"
                style={{ width: 'auto', padding: '6px 8px', fontSize: 12.5 }}
                value={match.stage}
                disabled={stageBusy}
                onChange={async e => {
                  setStageBusy(true);
                  try {
                    await dataService.setStage(match.id, e.target.value as typeof match.stage, '');
                  } finally {
                    setStageBusy(false);
                  }
                }}
                aria-label="Move to stage"
              >
                {(['warm', 'reached_out', 'replied', 'interviewing', 'offer', 'placed', 'passed'] as const).map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            )}

            <div className="relative">
              <Button size="sm" variant="secondary" onClick={() => setSnoozeOpen(v => !v)} aria-expanded={snoozeOpen}>
                Snooze
              </Button>
              {snoozeOpen && (
                <div className={`absolute left-0 top-full z-10 mt-1 flex w-40 flex-col gap-1 rounded-[8px] border p-2 ${cx.surface} ${cx.shadow}`}>
                  {[3, 7, 30].map(days => (
                    <button
                      key={days}
                      type="button"
                      className={`rounded-[6px] px-2 py-1 text-left text-xs hover:bg-[var(--panel-2,#1c2127)] ${cx.ink}`}
                      onClick={async () => {
                        await snoozeCandidate(candidateId, new Date(Date.now() + days * 86_400_000).toISOString());
                        setSnoozeOpen(false);
                      }}
                    >
                      +{days} days
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`rounded-[6px] px-2 py-1 text-left text-xs hover:bg-[var(--panel-2,#1c2127)] ${cx.ink}`}
                    onClick={async () => {
                      await snoozeCandidate(candidateId, defaultResurfaceDate());
                      setSnoozeOpen(false);
                    }}
                  >
                    +18 months
                  </button>
                </div>
              )}
            </div>

            <Button size="sm" variant="secondary" onClick={() => setTab('notes')}>Add note</Button>
            <Button size="sm" variant="secondary" onClick={() => setStatusOpen(true)}>Change status</Button>
            <Button size="sm" variant="ghost" onClick={() => setPlacedOpen(true)}>Mark placed</Button>
          </div>

          {/* tabs */}
          <div role="tablist" aria-label="Dossier sections" className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-[6px] px-2.5 py-1.5 text-xs font-medium ${cx.focusRing} ${
                  tab === t.key ? `${cx.accentBg} text-black` : `${cx.muted} hover:bg-[var(--panel-2,#1c2127)]`
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="min-h-0 flex-1 overflow-auto pb-2">
            {tab === 'story' && <StoryTab candidateId={candidateId} />}
            {tab === 'fit' && <FitTab match={match} roleTitle={role?.title} />}
            {tab === 'notes' && <NotesTab candidateId={candidateId} />}
            {tab === 'activity' && <ActivityTab candidateId={candidateId} />}
          </div>
        </div>
      )}

      {candidate && (
        <>
          <ChangeStatusDialog
            open={statusOpen}
            onClose={() => setStatusOpen(false)}
            candidateName={candidate.name}
            currentStatus={candidate.status}
            onSubmit={async (status, reason, snoozeUntil) => {
              await dataService.applyStatus(candidateId, status, reason, snoozeUntil);
            }}
          />

          <Dialog
            open={placedOpen}
            onClose={() => setPlacedOpen(false)}
            title={`Mark ${candidate.name} placed?`}
            footer={
              <>
                <Button variant="ghost" onClick={() => setPlacedOpen(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  loading={placedBusy}
                  onClick={async () => {
                    setPlacedBusy(true);
                    try {
                      await markPlaced(candidateId, match?.id);
                      setPlacedOpen(false);
                    } finally {
                      setPlacedBusy(false);
                    }
                  }}
                >
                  Mark placed
                </Button>
              </>
            }
          >
            <p className={cx.muted}>
              Sets status to "took another role" and — if {role ? role.title : 'a role'} is selected — moves the board
              stage to Placed. Both are logged to Activity.
            </p>
          </Dialog>
        </>
      )}
    </Drawer>
  );
}
