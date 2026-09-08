import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAppUI } from '../../app/store';
import { dataService } from '../../services/dataService';
import type { DriveConflict } from '../../services/dataService';
import { SETTINGS_KEYS } from '../../types';
import { Button, Chip, Dialog, useToast } from '../../ui';
import { downloadFile } from './downloadFile';
import { Connections } from './Connections';

export function SettingsView() {
  const { user, mode, signIn, signOut } = useAuth();
  const { theme, setTheme } = useAppUI();
  const { push } = useToast();

  const [wipeOpen, setWipeOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const sampleFlag = dataService.hooks.useSetting<boolean>(SETTINGS_KEYS.sampleFlag, false);
  const driveSnapshotAt = dataService.hooks.useSetting<string>(SETTINGS_KEYS.driveSnapshotAt, '');
  const driveConflict = dataService.hooks.useSetting<DriveConflict | null>(SETTINGS_KEYS.driveConflict, null);
  const candidateCount = dataService.hooks.useCandidates()?.length ?? 0;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };

  const exportJSON = () => run('export-json', async () => {
    const json = await dataService.exportAllJSON();
    downloadFile(`silver-medalist-hq-${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
    push('Exported everything as JSON.', { tone: 'success' });
  });

  const exportCSV = (table: 'candidates' | 'roles' | 'processes') => run(`export-csv-${table}`, async () => {
    const csv = await dataService.exportCSV(table);
    if (!csv) { push(`No ${table} to export yet.`); return; }
    downloadFile(`${table}.csv`, csv, 'text/csv');
    push(`Exported ${table} as CSV.`, { tone: 'success' });
  });

  const wipe = () => run('wipe', async () => {
    await dataService.wipe();
    setWipeOpen(false);
    push('Your bench is wiped — paste a role or load the sample bench to start again.', { tone: 'success' });
  });

  const loadSample = () => run('sample', async () => {
    await dataService.loadSampleBench();
    push('Sample bench loaded.', { tone: 'success' });
  });

  const resolveConflict = (keep: 'local' | 'drive') => run('conflict', async () => {
    await dataService.resolveDriveConflict(keep);
    push(keep === 'local' ? 'Kept this browser’s data and pushed it to Drive.' : 'Loaded the Drive copy.', { tone: 'success' });
  });

  return (
    <div className="smhq-page">
      <div className="smhq-page-header">
        <div>
          <h1>Settings</h1>
          <p>Theme, Drive sync, export and reset.</p>
        </div>
      </div>

      {sampleFlag && (
        <div className="smhq-settings-banner" role="note">
          You're on the sample bench ({candidateCount} candidates). Paste your own data or import a CSV any time.
        </div>
      )}

      <section className="smhq-settings-section">
        <h2>Theme</h2>
        <div className="smhq-settings-row">
          <Chip tone="accent" selected={theme === 'graphite'} onClick={() => setTheme('graphite')}>Graphite</Chip>
          <Chip tone="accent" selected={theme === 'paper'} onClick={() => setTheme('paper')}>Paper</Chip>
        </div>
      </section>

      <Connections />

      <section className="smhq-settings-section">
        <h2>Google Drive sync</h2>
        {driveConflict && (
          <div className="smhq-settings-conflict" role="alert">
            <p>
              This browser and Drive both changed since the last sync — pick which one wins.
              Local: {new Date(driveConflict.localAt).toLocaleString()} · Drive: {new Date(driveConflict.driveAt).toLocaleString()}.
            </p>
            <div className="smhq-settings-row">
              <Button variant="secondary" size="sm" onClick={() => resolveConflict('local')} loading={busy === 'conflict'}>
                Keep this browser
              </Button>
              <Button variant="secondary" size="sm" onClick={() => resolveConflict('drive')} loading={busy === 'conflict'}>
                Use Drive's copy
              </Button>
            </div>
          </div>
        )}

        {mode === 'google' ? (
          <div className="smhq-settings-row" style={{ alignItems: 'center' }}>
            <span>Connected as {user?.email}.</span>
            {driveSnapshotAt && <span className="smhq-settings-muted">Last synced {new Date(driveSnapshotAt).toLocaleString()}.</span>}
            <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        ) : (
          <div className="smhq-settings-row" style={{ alignItems: 'center' }}>
            <span className="smhq-settings-muted">Working locally — this browser only.</span>
            <Button variant="secondary" size="sm" onClick={() => signIn()}>Sign in with Google</Button>
          </div>
        )}
      </section>

      <section className="smhq-settings-section">
        <h2>Export</h2>
        <div className="smhq-settings-row">
          <Button variant="secondary" onClick={exportJSON} loading={busy === 'export-json'}>Export everything (JSON)</Button>
          <Button variant="secondary" onClick={() => exportCSV('candidates')} loading={busy === 'export-csv-candidates'}>Candidates (CSV)</Button>
          <Button variant="secondary" onClick={() => exportCSV('roles')} loading={busy === 'export-csv-roles'}>Roles (CSV)</Button>
          <Button variant="secondary" onClick={() => exportCSV('processes')} loading={busy === 'export-csv-processes'}>Processes (CSV)</Button>
        </div>
      </section>

      <section className="smhq-settings-section">
        <h2>Data</h2>
        <div className="smhq-settings-row">
          <Button variant="secondary" onClick={loadSample} loading={busy === 'sample'}>Load sample bench</Button>
          <Button variant="danger" onClick={() => setWipeOpen(true)}>Start my own bench…</Button>
        </div>
      </section>

      <Dialog
        open={wipeOpen}
        onClose={() => setWipeOpen(false)}
        title="Wipe this bench?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setWipeOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={wipe} loading={busy === 'wipe'}>Wipe everything</Button>
          </>
        }
      >
        <p>
          This permanently deletes every candidate, role, process, match and activity in this
          workspace{mode === 'google' ? ' and in your connected Drive folder' : ''}. Export first if
          you want a copy.
        </p>
      </Dialog>
    </div>
  );
}
