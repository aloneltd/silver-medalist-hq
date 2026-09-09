import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useHelpKey } from '../help/HelpProvider';
import { PageHeader, SectionHead, Btn, Skel } from '../ui';
import { useAuth } from '../../contexts/AuthContext';
import { dataService } from '../../services/dataService';
import { db } from '../../db/schema';
import { useTeamMembers, useSubmissions } from '../team/store';
import { ensureTeamSeed } from '../team/sampleData';
import { fetchTeamStatus, type StatusResult } from '../team/sharedSync';
import { MembersTable } from '../team/MembersTable';
import { InviteDialog } from '../team/InviteDialog';
import { LinkCard } from '../team/LinkCard';
import { ActivityStrip } from '../team/ActivityStrip';
import { InboxPreview } from '../team/InboxList';
import '../team/team.css';

export function Team() {
  useHelpKey('team');
  const { user } = useAuth();
  const [seeded, setSeeded] = useState(false);
  const [status, setStatus] = useState<StatusResult>({ configured: false });
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const owner = { name: user?.name && user.name !== 'Local workspace' ? user.name : 'You (this browser)', email: user?.email === 'local' ? 'you@local' : (user?.email ?? 'you@local') };
    ensureTeamSeed(owner).then(() => setSeeded(true));
    fetchTeamStatus().then(setStatus);
  }, [user?.name, user?.email]);

  const members = useTeamMembers();
  const waiting = useSubmissions('waiting');
  const candidates = dataService.hooks.useCandidates();
  const imports = useLiveQuery(() => db.imports.orderBy('at').reverse().toArray());

  const loading = !seeded || members === undefined || waiting === undefined || candidates === undefined || imports === undefined;

  return (
    <div className="p-container">
      <PageHeader
        title="Team"
        lede="Several people, one bench. Sourcers and the add-to-bench link add candidates; you own each record and decide who's on it."
        actions={<Btn tone="primary" onClick={() => setInviteOpen(true)}>Invite a teammate</Btn>}
      />

      <div className="smteam-banner p-mt-8">
        <div>
          {status.configured ? (
            <><strong>Connected.</strong> Team data is synced through your shared Drive folder — everyone on this team sees the same bench.</>
          ) : (
            <><strong>Running locally in this browser.</strong> Team members, invites and the Inbox live in this browser's storage only — nobody else sees them yet. Connecting a shared Drive folder (set <span className="p-mono">GOOGLE_REFRESH_TOKEN</span>, <span className="p-mono">GOOGLE_CLIENT_ID</span> and <span className="p-mono">GOOGLE_CLIENT_SECRET</span> on this deployment) would let every invited teammate see the same bench and make the add-to-bench link work from any device.</>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-col p-gap-3 p-mt-8"><Skel height={44} /><Skel height={44} /><Skel height={44} /></div>
      ) : (
        <>
          <SectionHead title="Who's on this bench" />
          <MembersTable members={members!} candidates={candidates!} />

          <div className="p-grid-2 p-mt-16">
            <LinkCard actor={user?.name ?? 'You'} sharedConfigured={status.configured} />
            <InboxPreview submissions={waiting!} />
          </div>

          <SectionHead title="Who's added whom" />
          <ActivityStrip candidates={candidates!} submissions={waiting!} imports={imports ?? []} />
        </>
      )}

      {inviteOpen && (
        <InviteDialog onClose={() => setInviteOpen(false)} actor={user?.name ?? 'You'} sharedConfigured={status.configured} />
      )}
    </div>
  );
}
