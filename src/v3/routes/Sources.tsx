import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useHelpKey } from '../help/HelpProvider';
import { Avatar, BtnLink, Card, PageHeader, Pill, SectionHead } from '../ui';
import { useToast } from '../../ui';
import { db } from '../../db/schema';
import { dataService } from '../../services/dataService';
import { V3_SETTINGS_KEYS, type ImportBatch, type ImportPlan, type SourceKind } from '../../types';
import { sourceStats, undoImport } from '../import';
import { DropZone, type DropZoneHandle } from '../sources/DropZone';
import { ImportPreview } from '../sources/ImportPreview';
import { ConnectorCards } from '../sources/ConnectorCards';
import { CaptureDialog } from '../sources/CaptureDialog';
import { ImportHistory } from '../sources/ImportHistory';
import { agoLabel, pluralize } from '../sources/format';
import '../sources/sources.css';

type Stats = Partial<Record<SourceKind, { count: number; lastAt?: string }>>;

export function Sources() {
  useHelpKey('sources');
  const { push } = useToast();

  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [stats, setStats] = useState<Stats>({});
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [captureDialog, setCaptureDialog] = useState(false);
  const dropZoneRef = useRef<DropZoneHandle>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const refreshStats = useCallback(() => {
    sourceStats()
      .then(s => { setStats(s); setStatsLoaded(true); })
      .catch(() => { setStats({}); setStatsLoaded(true); }); // background stat — degrade to an honest "0", never a scary error
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  const addLink = dataService.hooks.useSetting<{ token: string; expiresAt: string; uses?: number } | null>(V3_SETTINGS_KEYS.addLink, null);
  const waiting = useLiveQuery(
    () => db.submissions.where('state').equals('waiting').sortBy('at').then(rows => rows.reverse()),
    [],
  );

  const sourceCount = Object.values(stats).filter(s => (s?.count ?? 0) > 0).length;
  const peopleCount = Object.values(stats).reduce((sum, s) => sum + (s?.count ?? 0), 0);
  const lastArrival = Object.values(stats).reduce<string | undefined>((latest, s) => {
    if (!s?.lastAt) return latest;
    return !latest || s.lastAt > latest ? s.lastAt : latest;
  }, undefined);

  function handlePlanReady(next: ImportPlan) {
    setPlan(next);
    // The preview is the centrepiece — bring it into view the moment there's something to review.
    requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function handleCommitted(batch: ImportBatch) {
    setPlan(null);
    refreshStats();
    setHistoryKey(k => k + 1);
    push(
      `Added ${pluralize(batch.createdIds.length, 'person', 'people')}, merged ${batch.mergedIds.length}. Everything here can be undone for 30 days.`,
      {
        tone: 'success',
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await undoImport(batch.id);
            refreshStats();
            setHistoryKey(k => k + 1);
            push('Undone.', { tone: 'success' });
          } catch (e) {
            push(e instanceof Error ? `Couldn't undo that: ${e.message}` : "Couldn't undo that.", { tone: 'danger' });
          }
        },
      },
    );
  }

  return (
    <div className="p-container">
      <PageHeader
        title="Sources"
        lede="People come in from everywhere you meet them. Every one lands on the same bench, with a badge saying where they came from, and nothing is ever imported twice."
        actions={
          statsLoaded ? (
            <div className="p-sec">
              {pluralize(sourceCount, 'source')} · {pluralize(peopleCount, 'person', 'people')} · last arrival {agoLabel(lastArrival)}
            </div>
          ) : undefined
        }
      />

      <div className="p-mt-8">
        <DropZone ref={dropZoneRef} onPlan={handlePlanReady} busyElsewhere={!!plan} />
      </div>

      <div ref={previewRef}>
        {plan && (
          <ImportPreview
            plan={plan}
            onPlanChange={setPlan}
            onCancel={() => setPlan(null)}
            onCommitted={handleCommitted}
          />
        )}
      </div>

      <SectionHead title="Connected" />
      <ConnectorCards
        stats={stats}
        onOpenFilePicker={() => dropZoneRef.current?.openFilePicker()}
        onOpenCapture={() => setCaptureDialog(true)}
      />

      <div className="p-grid-2 p-mt-6">
        <Card>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Give hiring managers a link</div>
          <div className="p-sec p-mt-2" style={{ lineHeight: 1.5 }}>
            Anyone with this link can add one person: name, LinkedIn, a résumé, and why they were strong. No account
            needed. It arrives in your Inbox, not straight onto the bench.
          </div>
          {addLink?.token ? (
            <>
              <div className="p-row p-gap-2 p-mt-4" style={{ height: 44, border: '1px solid var(--p-line)', borderRadius: 8, background: 'var(--p-bg)', padding: '0 6px 0 14px' }}>
                <span className="p-mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {window.location.origin}/add/{addLink.token}
                </span>
              </div>
              <div className="p-meta p-mt-2">
                Expires {new Date(addLink.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {addLink.uses ? ` · used ${addLink.uses} time${addLink.uses === 1 ? '' : 's'}` : ''}. Manage it from Team.
              </div>
            </>
          ) : (
            <div className="p-hint p-mt-4">No link yet — set one up from the Team page.</div>
          )}
          <BtnLink to="/team" size="sm" className="p-mt-4">Open Team →</BtnLink>
        </Card>

        <Card>
          <div className="p-spread">
            <div style={{ fontSize: 20, fontWeight: 600 }}>Inbox{waiting ? ` · ${waiting.length} waiting` : ''}</div>
            <BtnLink to="/inbox" size="sm">Open Inbox →</BtnLink>
          </div>
          <div className="p-col p-gap-3 p-mt-4">
            {waiting === undefined && <div className="p-hint">Loading…</div>}
            {waiting && waiting.length === 0 && <div className="p-hint">Nothing waiting — accepted people land straight on the bench.</div>}
            {waiting?.slice(0, 3).map(sub => (
              <div key={sub.id} className="p-row p-gap-3">
                <Avatar name={sub.draft.name} size="sm" />
                <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
                  <span className="p-strong">{sub.draft.name}</span> · added by {sub.addedBy}
                  {sub.note ? ` · "${sub.note}"` : ''}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <SectionHead title="Import history" />
      <ImportHistory refreshKey={historyKey} />

      <div className="p-mt-8">
        <Card style={{ opacity: 0.85, maxWidth: 588 }}>
          <div className="p-spread">
            <div style={{ fontSize: 17, fontWeight: 600 }}>Forward-to-bench email</div>
            <Pill tone="amber">Coming soon</Pill>
          </div>
          <div className="p-sec p-mt-2" style={{ lineHeight: 1.5 }}>
            A personal address where you can forward any email and have it land here as a person to approve. This needs
            a mailbox service we haven't wired up yet.
          </div>
        </Card>
      </div>

      <div className="p-sec p-mt-8" style={{ lineHeight: 1.5, maxWidth: 900 }}>
        <span className="p-strong" style={{ color: 'var(--p-ink)' }}>Coming later, said honestly:</span> a personal
        forward-to-bench email address, and live Greenhouse and Lever connections. LinkedIn has no API we are allowed to
        use, so Capture is the honest way in.
      </div>

      {captureDialog && <CaptureDialog onClose={() => setCaptureDialog(false)} />}
    </div>
  );
}
