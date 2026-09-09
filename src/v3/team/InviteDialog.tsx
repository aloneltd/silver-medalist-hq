import { useState } from 'react';
import { Dialog, Btn } from '../ui';
import { inviteTeammateShared } from './sharedSync';
import { upsertMember } from './store';
import { ulid } from '../../lib/ulid';
import type { TeamRole } from '../../types';

export function InviteDialog(
  { onClose, actor, sharedConfigured }: { onClose: () => void; actor: string; sharedConfigured: boolean },
) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('contributor');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function onInvite() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setResult({ ok: false, message: 'Enter a valid email address.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      if (!sharedConfigured) {
        setResult({
          ok: false,
          message:
            'Drive sharing needs the shared team store connected — GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID ' +
            'and GOOGLE_CLIENT_SECRET on this deployment. Nothing was sent.',
        });
        return;
      }
      const res = await inviteTeammateShared(email.trim(), role, actor);
      if (res.configured && res.ok) {
        await upsertMember({
          id: res.member?.id ?? ulid(), name: email.trim(), email: email.trim(), role, addedAt: new Date().toISOString(),
        });
        setResult({ ok: true, message: `Invited. Your Drive folder is now shared with ${email.trim()} — they'll see the same bench once they sign in with Google.` });
      } else {
        setResult({ ok: false, message: res.reason || 'Could not share the folder with that address.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Invite a teammate" onClose={onClose} width={480} footer={
      result?.ok ? (
        <Btn tone="primary" onClick={onClose}>Done</Btn>
      ) : (
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn tone="primary" onClick={onInvite} disabled={busy}>{busy ? 'Inviting…' : 'Send invite'}</Btn>
        </>
      )
    }>
      <div className="p-story">
        They sign in with Google. Once they do, your Drive folder is shared with them through
        Google's own permissions API, and they see the same bench you do.
      </div>

      <div className="smteam-public-field">
        <label className="p-label" htmlFor="invite-email">Email</label>
        <input
          id="invite-email" type="email" className="p-input" placeholder="name@company.com"
          value={email} onChange={e => setEmail(e.target.value)} disabled={busy}
        />
      </div>

      <div className="smteam-public-field">
        <label className="p-label" htmlFor="invite-role">Role</label>
        <select id="invite-role" className="p-select" value={role} onChange={e => setRole(e.target.value as TeamRole)} disabled={busy}>
          <option value="editor">Editor — add, edit, change status, delete</option>
          <option value="contributor">Contributor — add and comment only</option>
        </select>
      </div>

      {!sharedConfigured && (
        <div className="p-note p-mt-6">
          The shared team store isn't connected on this deployment, so an invite can't actually
          share anything yet. Set <span className="p-mono">GOOGLE_REFRESH_TOKEN</span>,{' '}
          <span className="p-mono">GOOGLE_CLIENT_ID</span> and <span className="p-mono">GOOGLE_CLIENT_SECRET</span> to turn this on.
        </div>
      )}

      {result && (
        <div className={`p-note p-mt-6${result.ok ? '' : ' p-note-amber'}`}>{result.message}</div>
      )}
    </Dialog>
  );
}
