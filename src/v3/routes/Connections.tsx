import { useEffect, useState } from 'react';
import { useHelpKey } from '../help/HelpProvider';
import { useAppUI } from '../../app/store';
import { useAuth } from '../../contexts/AuthContext';
import { dataService } from '../../services/dataService';
import type { DriveConflict } from '../../services/dataService';
import { microsoftAuth, MicrosoftAuthError } from '../../services/microsoftAuth';
import { replyWatcher } from '../../services/replyWatcher';
import { downloadFile } from '../../features/settings/downloadFile';
import { SETTINGS_KEYS } from '../../types';
import type { MsAccount } from '../../services/microsoftAuth';
import { useToast } from '../../ui';
import { PageHeader, Card, Btn, Dialog } from '../ui';

/**
 * Connections — the honest connection + data screen (DESIGN-v3.md "Sources/Team" pillar +
 * council/designer-v3.md §3: "Every connection here is read-only until you click something.
 * Nothing is ever sent on your behalf."). Rewires the logic already proven in
 * src/features/settings/Connections.tsx + SettingsView.tsx — nothing here is a new backend
 * capability, only the honest, plain-language Paper presentation of it.
 */

// Mirrors OUTLOOK_CONNECTED_KEY in src/features/settings/Connections.tsx — a purely local UI
// flag ("has this browser acquired an Outlook mail token at least once"), not part of the
// frozen SETTINGS_KEYS contract, so it is safe to key the same string from here too.
const OUTLOOK_CONNECTED_KEY = 'outlookConnectedLocal';
const WIPE_PHRASE = 'delete everything';

function CopyableStep({ label, value }: { label: string; value?: string }) {
  const { push } = useToast();
  return (
    <li className="p-row" style={{ justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--p-line)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--p-ink-2)' }}>{label}</div>
        {value && <div className="p-mono" style={{ marginTop: 2, wordBreak: 'break-word' }}>{value}</div>}
      </div>
      {value && (
        <button
          type="button"
          className="p-btn p-btn-ghost p-btn-sm"
          style={{ flex: 'none' }}
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); push('Copied.', { tone: 'success', durationMs: 1600 }); }
            catch { push('Could not copy — select the text manually.'); }
          }}
        >
          Copy
        </button>
      )}
    </li>
  );
}

function OutlookCard() {
  const { push } = useToast();
  const configured = microsoftAuth.isConfigured();
  const [account, setAccount] = useState<MsAccount | null>(() => microsoftAuth.getAccount());
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [busy, setBusy] = useState<'signin' | 'connect' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const allowSend = dataService.hooks.useSetting<boolean>(SETTINGS_KEYS.outlookAllowSend, false);
  const running = replyWatcher.isRunning();

  useEffect(() => {
    if (!configured) return;
    void dataService.getSetting<boolean>(OUTLOOK_CONNECTED_KEY, false).then(v => {
      setOutlookConnected(v);
      // DESIGN-v2.1.md §A: "every 15 minutes while the app is open" — starting it here (once
      // per session, idempotent) is honest because the status line right below only ever
      // claims "checking" once this has actually run.
      if (v) replyWatcher.start();
    });
  }, [configured]);

  const signIn = async () => {
    setBusy('signin'); setError(null);
    try {
      const acc = await microsoftAuth.signIn();
      setAccount(acc);
      await dataService.setSetting(SETTINGS_KEYS.msConnected, true);
      push(`Signed in as ${acc.username}.`, { tone: 'success' });
    } catch (e) {
      setError(e instanceof MicrosoftAuthError ? e.message : 'Microsoft sign-in failed.');
    } finally { setBusy(null); }
  };

  const connectOutlook = async () => {
    setBusy('connect'); setError(null);
    try {
      const scopes = [...microsoftAuth.GRAPH_SCOPES.mail, ...microsoftAuth.GRAPH_SCOPES.calendar];
      const token = await microsoftAuth.getToken(scopes);
      if (!token) throw new MicrosoftAuthError('Sign in with Microsoft first.');
      setOutlookConnected(true);
      await dataService.setSetting(OUTLOOK_CONNECTED_KEY, true);
      replyWatcher.start();
      push('Outlook connected — drafts and reply detection are live.', { tone: 'success' });
    } catch (e) {
      setError(e instanceof MicrosoftAuthError ? e.message : 'Could not connect Outlook.');
    } finally { setBusy(null); }
  };

  const signOut = async () => {
    setBusy('signout'); setError(null);
    try {
      await microsoftAuth.signOut();
      setAccount(null);
      setOutlookConnected(false);
      replyWatcher.stop();
      await Promise.all([
        dataService.setSetting(SETTINGS_KEYS.msConnected, false),
        dataService.setSetting(OUTLOOK_CONNECTED_KEY, false),
        dataService.setSetting(SETTINGS_KEYS.outlookAllowSend, false),
      ]);
    } catch (e) {
      setError(e instanceof MicrosoftAuthError ? e.message : 'Could not sign out.');
    } finally { setBusy(null); }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const result = await replyWatcher.runOnce();
      if (result.errors.length) push(result.errors[0]);
      else push(result.repliesFound > 0 ? `Found ${result.repliesFound} new ${result.repliesFound === 1 ? 'reply' : 'replies'}.` : 'Checked — nothing new.', { tone: 'success' });
    } finally { setChecking(false); }
  };

  return (
    <Card lift>
      <div className="p-name">Microsoft / Outlook</div>
      <div className="p-lede p-mt-2">
        Sign in with Microsoft to draft messages, notice replies, and scan folders for résumés.
        Nothing sends without your click, and nothing else about your mailbox is touched.
      </div>

      {!configured ? (
        <div className="p-note p-mt-6">
          <div className="p-strong p-mt-2">This needs a Microsoft app id before it can connect.</div>
          <div className="p-mt-2">
            No <code>VITE_MS_CLIENT_ID</code> is set on this deployment, so Outlook stays off rather than showing a button that can't work. Here is exactly what to register:
          </div>
          <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
            {microsoftAuth.registrationSteps().map((step, i) => (
              <CopyableStep key={i} label={step.label} value={step.value} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="p-mt-6">
          {!account ? (
            <Btn tone="primary" onClick={() => void signIn()} disabled={busy === 'signin'}>
              {busy === 'signin' ? 'Signing in…' : 'Sign in with Microsoft'}
            </Btn>
          ) : (
            <div className="p-col p-gap-4">
              <div className="p-row p-gap-3 p-wrap" style={{ alignItems: 'center' }}>
                <span className="p-pill p-pill-wash"><span className="p-dot" />Signed in · {account.username}</span>
                {outlookConnected ? (
                  <span className="p-pill p-pill-wash">Outlook connected</span>
                ) : (
                  <Btn size="sm" onClick={() => void connectOutlook()} disabled={busy === 'connect'}>
                    {busy === 'connect' ? 'Connecting…' : 'Connect Outlook'}
                  </Btn>
                )}
                <Btn size="sm" tone="ghost" onClick={() => void signOut()} disabled={busy === 'signout'}>Sign out</Btn>
              </div>

              {outlookConnected && (
                <>
                  <label className="p-row p-gap-3" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!allowSend}
                      style={{ marginTop: 3, width: 18, height: 18, flex: 'none' }}
                      onChange={async e => {
                        await dataService.setSetting(SETTINGS_KEYS.outlookAllowSend, e.target.checked);
                        push(e.target.checked ? 'HQ can now send from your Outlook mailbox.' : 'Sending turned off — drafts only, every time.', { tone: 'neutral' });
                      }}
                    />
                    <span className="p-sec">
                      <span className="p-strong" style={{ color: 'var(--p-ink)' }}>Let HQ send, not just draft.</span> Off by default —
                      every message is a draft in your Outlook Drafts folder until you turn this on.
                    </span>
                  </label>

                  <div className="p-hr" />
                  <div className="p-row p-gap-3" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="p-sec">
                      {running
                        ? 'Checking your inbox for replies every 15 minutes, while this tab is open.'
                        : 'Reply checking will start the next time you open the app with Outlook connected.'}
                    </span>
                    <Btn size="sm" tone="ghost" onClick={() => void checkNow()} disabled={checking}>
                      {checking ? 'Checking…' : 'Check now'}
                    </Btn>
                  </div>
                </>
              )}
            </div>
          )}
          {error && <p role="alert" className="p-sec p-mt-3" style={{ color: 'var(--p-red)' }}>{error}</p>}
        </div>
      )}
    </Card>
  );
}

function DriveCard() {
  const { push } = useToast();
  const { user, mode, googleConfigured, signIn, signOut } = useAuth();
  const [resolving, setResolving] = useState<'local' | 'drive' | null>(null);
  const driveSnapshotAt = dataService.hooks.useSetting<string>(SETTINGS_KEYS.driveSnapshotAt, '');
  const driveConflict = dataService.hooks.useSetting<DriveConflict | null>(SETTINGS_KEYS.driveConflict, null);

  const resolveConflict = async (keep: 'local' | 'drive') => {
    setResolving(keep);
    try {
      await dataService.resolveDriveConflict(keep);
      push(keep === 'local' ? 'Kept this browser’s copy and pushed it to Drive.' : 'Loaded the Drive copy.', { tone: 'success' });
    } finally { setResolving(null); }
  };

  return (
    <Card lift>
      <div className="p-name">Google / Drive</div>
      <div className="p-lede p-mt-2">
        Signing in with Google keeps a snapshot of your bench in a Drive folder, so it survives a
        cleared browser — and, once you share that folder, it's how your whole team sees the same bench.
      </div>

      {!googleConfigured ? (
        <div className="p-note p-mt-6">
          <div className="p-strong p-mt-2">This needs a Google client id before it can connect.</div>
          <div className="p-mt-2">
            No <code>VITE_GOOGLE_CLIENT_ID</code> is set on this deployment, so sign-in stays off rather than
            showing a button that can't work. Register an OAuth client (type: Web application), add this
            site's origin to Authorized JavaScript origins, then set <code>VITE_GOOGLE_CLIENT_ID</code>.
          </div>
        </div>
      ) : (
        <div className="p-mt-6">
          {driveConflict && (
            <div className="p-note p-note-amber p-mt-2" role="alert" style={{ marginBottom: 16 }}>
              <div>
                This browser and Drive both changed since the last sync. Local: {new Date(driveConflict.localAt).toLocaleString()} ·
                {' '}Drive: {new Date(driveConflict.driveAt).toLocaleString()}. Pick which one wins — nothing is lost either way, the
                one you don't pick stays as a backup you can export.
              </div>
              <div className="p-row p-gap-3 p-mt-4">
                <Btn size="sm" onClick={() => void resolveConflict('local')} disabled={resolving === 'local'}>Keep this browser</Btn>
                <Btn size="sm" onClick={() => void resolveConflict('drive')} disabled={resolving === 'drive'}>Use Drive's copy</Btn>
              </div>
            </div>
          )}

          {mode === 'google' ? (
            <div className="p-row p-gap-3 p-wrap" style={{ alignItems: 'center' }}>
              <span className="p-pill p-pill-wash"><span className="p-dot" />Connected · {user?.email}</span>
              <span className="p-sec">{driveSnapshotAt ? `Last snapshot ${new Date(driveSnapshotAt).toLocaleString()}.` : 'No snapshot saved yet — it happens automatically a few seconds after your next change.'}</span>
              <Btn size="sm" tone="ghost" onClick={signOut}>Sign out</Btn>
            </div>
          ) : (
            <div className="p-row p-gap-3 p-wrap" style={{ alignItems: 'center' }}>
              <span className="p-sec">Working locally — this browser only.</span>
              <Btn size="sm" onClick={() => signIn()}>Sign in with Google</Btn>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DataCard() {
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const candidates = dataService.hooks.useCandidates();
  const candidateCount = candidates?.length ?? 0;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };

  const exportJSON = () => run('json', async () => {
    const json = await dataService.exportAllJSON();
    downloadFile(`silver-medalist-hq-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
    push('Exported everything as JSON.', { tone: 'success' });
  });

  const exportCSV = () => run('csv', async () => {
    const csv = await dataService.exportCSV('candidates');
    if (!csv) { push('No one on the bench to export yet.'); return; }
    downloadFile(`bench-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
    push('Exported the bench as CSV.', { tone: 'success' });
  });

  const loadSample = () => run('sample', async () => {
    await dataService.loadSampleBench();
    push('Sample bench loaded.', { tone: 'success' });
  });

  const wipe = () => run('wipe', async () => {
    await dataService.wipe();
    setWipeOpen(false);
    setConfirmText('');
    push('Your bench is wiped. Paste a role or reload the sample bench to start again.', { tone: 'success' });
  });

  const canWipe = confirmText.trim().toLowerCase() === WIPE_PHRASE;

  return (
    <Card lift>
      <div className="p-name">Your data</div>
      <div className="p-lede p-mt-2">
        Everything lives in this browser (and in Drive, if you're signed in with Google above).
        Take a copy any time, or start over completely.
      </div>

      <div className="p-row p-gap-3 p-wrap p-mt-6">
        <Btn onClick={exportJSON} disabled={busy === 'json'}>{busy === 'json' ? 'Exporting…' : 'Export everything (JSON)'}</Btn>
        <Btn onClick={exportCSV} disabled={busy === 'csv'}>{busy === 'csv' ? 'Exporting…' : 'Export the bench (CSV)'}</Btn>
      </div>

      <div className="p-hr" />

      <div className="p-row p-gap-3 p-wrap" style={{ alignItems: 'center' }}>
        <Btn onClick={loadSample} disabled={busy === 'sample'}>{busy === 'sample' ? 'Loading…' : 'Reload the sample bench'}</Btn>
        <Btn tone="danger" onClick={() => setWipeOpen(true)}>Start my own bench…</Btn>
        <span className="p-meta">{candidateCount} {candidateCount === 1 ? 'person is' : 'people are'} on the bench right now.</span>
      </div>

      {wipeOpen && (
        <Dialog
          title="Start my own bench"
          onClose={() => { setWipeOpen(false); setConfirmText(''); }}
          footer={
            <>
              <Btn tone="ghost" onClick={() => { setWipeOpen(false); setConfirmText(''); }}>Cancel</Btn>
              <Btn tone="danger" onClick={() => void wipe()} disabled={!canWipe || busy === 'wipe'}>
                {busy === 'wipe' ? 'Deleting…' : 'Delete everything'}
              </Btn>
            </>
          }
        >
          <p className="p-story">
            This permanently deletes all {candidateCount} {candidateCount === 1 ? 'person' : 'people'}, every role, process,
            match and activity in this workspace — and in your connected Drive folder, if you're signed in with Google.
            It cannot be undone. Export a copy first if you want one.
          </p>
          <label className="p-label p-mt-6" htmlFor="ask-wipe-confirm">Type "{WIPE_PHRASE}" to confirm</label>
          <input
            id="ask-wipe-confirm"
            className="p-input"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Dialog>
      )}
    </Card>
  );
}

function ThemeCard() {
  const { theme, setTheme } = useAppUI();
  return (
    <Card lift>
      <div className="p-name">Theme</div>
      <div className="p-lede p-mt-2">Paper is the default — warm white, built to read comfortably in daylight. Dark is there if you'd rather.</div>
      <div className="p-seg p-mt-6" style={{ width: 'fit-content' }}>
        <button type="button" className={theme === 'paper' ? 'p-on' : ''} onClick={() => setTheme('paper')} aria-pressed={theme === 'paper'}>Paper</button>
        <button type="button" className={theme === 'graphite' ? 'p-on' : ''} onClick={() => setTheme('graphite')} aria-pressed={theme === 'graphite'}>Dark</button>
      </div>
    </Card>
  );
}

export function Connections() {
  useHelpKey('connections');
  return (
    <div className="p-container">
      <PageHeader
        title="Connections"
        lede="Every connection here is read-only until you click something. Nothing is ever sent, shared or deleted without your click."
      />
      <div className="p-col p-gap-6 p-mt-14">
        <OutlookCard />
        <DriveCard />
        <DataCard />
        <ThemeCard />
      </div>
    </div>
  );
}
