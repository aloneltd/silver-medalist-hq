import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, FolderOpen, Hash, Mail, MousePointerClick, Users } from 'lucide-react';
import { Btn, BtnLink, Card, Dialog, Dot, Pill } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { dataService } from '../../services/dataService';
import { microsoftAuth } from '../../services/microsoftAuth';
import { db } from '../../db/schema';
import { V3_SETTINGS_KEYS, type SourceKind } from '../../types';
import { agoLabel, pluralize } from './format';

type Stats = Partial<Record<SourceKind, { count: number; lastAt?: string }>>;

interface Props {
  stats: Stats;
  onOpenFilePicker: () => void;
  onOpenCapture: () => void;
}

const ATS_NOTES: Record<string, string> = {
  Greenhouse: 'Export candidates as CSV. Carries stage, source and rejection reason — never résumés or scorecards.',
  Lever: 'Export contacts as CSV. Carries origin, owner, tags and archive reason — never résumés.',
  Ashby: "Ashby's export is the cleanest of the six, but still carries no résumés or scorecards.",
  Workable: 'Export candidates as CSV. Column names vary by pipeline, so check the mapping before you add them.',
  Teamtailor: 'Export candidates as CSV from a job or a smart list — no résumés in a standard export.',
  Bullhorn: 'Export a candidate list as CSV. Field names depend on your Bullhorn configuration.',
};

function CardShell({ icon, title, status, statusTone, children, count, action }: {
  icon: React.ReactNode; title: string; status: string; statusTone?: 'amber' | 'grey';
  children: React.ReactNode; count?: string; action: React.ReactNode;
}) {
  return (
    <Card className="src-connector-card">
      <div className="p-spread">
        <div className="p-row p-gap-3">
          <div className="src-connector-icon" aria-hidden="true">{icon}</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{title}</div>
        </div>
        <Pill><Dot tone={statusTone} />{status}</Pill>
      </div>
      <div className="p-sec" style={{ lineHeight: 1.5, flex: 1 }}>{children}</div>
      <div className="p-spread">
        <div className="p-sec">{count && <span className="p-strong" style={{ color: 'var(--p-ink)' }}>{count}</span>}</div>
        {action}
      </div>
    </Card>
  );
}

export function ConnectorCards({ stats, onOpenFilePicker, onOpenCapture }: Props) {
  const { mode } = useAuth();
  const [outlookDialog, setOutlookDialog] = useState(false);
  const [atsDialog, setAtsDialog] = useState(false);
  const [driveDialog, setDriveDialog] = useState(false);

  const msConfigured = microsoftAuth.isConfigured();
  const msAccount = msConfigured ? microsoftAuth.getAccount() : null;
  const driveConnected = mode === 'google';
  const driveFolder = dataService.hooks.useSetting<string>(V3_SETTINGS_KEYS.driveResumeFolder, '');
  const team = useLiveQuery(() => db.team.toArray(), []);

  const outlookStats = stats.outlook;
  const atsStats = stats.ats;
  const driveStats = stats.drive;
  const captureStats = stats.capture;
  const slackStats = stats.slack;
  const teammateStats = stats.teammate;

  return (
    <>
      <div className="p-grid-3">
        <CardShell
          icon={<Mail size={20} />}
          title="Outlook"
          status={msAccount ? `synced ${agoLabel(outlookStats?.lastAt)}` : msConfigured ? 'not signed in' : 'not connected'}
          statusTone={msAccount ? undefined : 'grey'}
          count={pluralize(outlookStats?.count ?? 0, 'person', 'people')}
          action={
            msAccount ? (
              <Btn size="sm" onClick={() => setOutlookDialog(true)}>Scan a folder</Btn>
            ) : (
              <BtnLink to="/connections" size="sm">{msConfigured ? 'Sign in' : 'Connect'}</BtnLink>
            )
          }
        >
          {msAccount
            ? 'Scans the folders you choose for résumés and "applied for" threads, and notices replies to your notes. Read-only. Never sends without a click.'
            : msConfigured
              ? 'Signed out of Outlook right now. Sign in on Connections to scan folders for résumés and replies.'
              : 'Outlook isn\'t set up on this deployment yet (no Microsoft app registration). Connections explains exactly what\'s missing.'}
        </CardShell>

        <CardShell
          icon={<Building2 size={20} />}
          title="Greenhouse & other ATS"
          status="export & drop"
          statusTone="grey"
          count={pluralize(atsStats?.count ?? 0, 'person', 'people')}
          action={<Btn size="sm" onClick={() => setAtsDialog(true)}>Add an export</Btn>}
        >
          Greenhouse, Lever, Ashby, Workable, Teamtailor or Bullhorn: export the file and drop it above. We keep stages and
          rejection reasons. A live connection comes later — the export works today.
        </CardShell>

        <CardShell
          icon={<FolderOpen size={20} />}
          title="Drive folder"
          status={driveConnected ? (driveFolder ? 'watching' : 'not set up') : 'not connected'}
          statusTone={driveConnected && driveFolder ? undefined : 'grey'}
          count={pluralize(driveStats?.count ?? 0, 'person', 'people')}
          action={
            driveConnected
              ? <Btn size="sm" onClick={() => setDriveDialog(true)}>{driveFolder ? 'Change folder' : 'Watch a folder'}</Btn>
              : <BtnLink to="/connections" size="sm">Connect</BtnLink>
          }
        >
          {driveConnected
            ? (driveFolder
              ? `Watching "${driveFolder}" in your Google Drive. New files still need a drop above until the automatic sync ships.`
              : 'A folder of résumés in your Google Drive. Name it once here; automatic sync is coming, so for now new files still need a drop above.')
            : 'Sign in with Google on Connections to point at a Drive folder of résumés.'}
        </CardShell>

        <CardShell
          icon={<MousePointerClick size={20} />}
          title="Capture"
          status="ready"
          count={pluralize(captureStats?.count ?? 0, 'person', 'people')}
          action={<Btn size="sm" onClick={onOpenCapture}>Get the button</Btn>}
        >
          A button for your bookmarks bar. On any LinkedIn profile, job board or ATS page, one click sends the visible
          details here as a person to approve.
        </CardShell>

        <CardShell
          icon={<Hash size={20} />}
          title="Slack export"
          status={slackStats?.count ? `last drop ${agoLabel(slackStats.lastAt)}` : 'drop a zip'}
          statusTone={slackStats?.count ? undefined : 'grey'}
          count={pluralize(slackStats?.count ?? 0, 'person', 'people')}
          action={<Btn size="sm" onClick={onOpenFilePicker}>Drop another</Btn>}
        >
          A channel export zip (users.json + channels.json + messages). Names need the users.json join, and emails are
          usually missing unless it's an admin export — we say so on each person we're unsure about.
        </CardShell>

        <CardShell
          icon={<Users size={20} />}
          title="Teammates"
          status={team && team.length > 0 ? `${pluralize(team.length, 'person', 'people')} sharing` : 'just you, so far'}
          statusTone={team && team.length > 0 ? undefined : 'grey'}
          count={pluralize(teammateStats?.count ?? 0, 'person', 'people')}
          action={<BtnLink to="/team" size="sm">Manage team</BtnLink>}
        >
          Everyone who shares this bench adds to it directly; a hiring manager without an account uses the link on this
          page instead. Everything they add waits in the Inbox first.
        </CardShell>
      </div>

      {outlookDialog && <OutlookScanDialog onClose={() => setOutlookDialog(false)} />}
      {atsDialog && <AtsExportDialog onClose={() => setAtsDialog(false)} onChooseFile={() => { setAtsDialog(false); onOpenFilePicker(); }} />}
      {driveDialog && (
        <DriveFolderDialog
          current={driveFolder ?? ''}
          onClose={() => setDriveDialog(false)}
          onSave={async name => {
            await dataService.setSetting(V3_SETTINGS_KEYS.driveResumeFolder, name);
            setDriveDialog(false);
          }}
        />
      )}
    </>
  );
}

function OutlookScanDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Scan a folder" onClose={onClose} footer={<Btn tone="primary" onClick={onClose}>Got it</Btn>}>
      <div className="p-col p-gap-3">
        <div className="p-story">
          Scanning your Outlook folders automatically for résumés and "applied for" threads isn't wired up yet — the
          connection itself is live (outreach and reply detection already use it), but this specific scan hasn't shipped.
        </div>
        <div className="p-hint">
          For now: open the message in Outlook, save the résumé attachment, then drop it in the box at the top of this
          page — it reads exactly the same either way.
        </div>
      </div>
    </Dialog>
  );
}

function AtsExportDialog({ onClose, onChooseFile }: { onClose: () => void; onChooseFile: () => void }) {
  const [ats, setAts] = useState<keyof typeof ATS_NOTES>('Greenhouse');
  return (
    <Dialog
      title="Add an ATS export"
      onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" onClick={onChooseFile}>Choose the export file</Btn></>}
    >
      <div className="p-col p-gap-4">
        <div className="src-capture-field">
          <label className="p-label" htmlFor="src-ats-select">Which ATS is this from?</label>
          <select id="src-ats-select" className="p-select" value={ats} onChange={e => setAts(e.target.value as keyof typeof ATS_NOTES)}>
            {Object.keys(ATS_NOTES).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="p-note">{ATS_NOTES[ats]}</div>
      </div>
    </Dialog>
  );
}

function DriveFolderDialog({ current, onClose, onSave }: { current: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(current);
  return (
    <Dialog
      title="Watch a Drive folder"
      onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</Btn></>}
    >
      <div className="p-col p-gap-4">
        <div className="src-capture-field">
          <label className="p-label" htmlFor="src-drive-folder">Folder name in your Google Drive</label>
          <input id="src-drive-folder" className="p-input" value={name} onChange={e => setName(e.target.value)} placeholder="Résumés 2026" autoFocus />
        </div>
        <div className="p-hint">
          We remember which folder to watch. Automatically reading new files as they land isn't built yet — until then,
          drop the files in the box at the top of this page and they read exactly the same.
        </div>
        <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="p-sec" style={{ fontWeight: 600 }}>
          Open Google Drive ↗
        </a>
      </div>
    </Dialog>
  );
}
