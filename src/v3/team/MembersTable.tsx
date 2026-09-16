import { useMemo, useState } from 'react';
import { Avatar, Pill, Btn } from '../ui';
import { whenPhrase, spokeLabel } from '../lib/personText';
import { computeAddedCounts, setMemberRole, removeMember } from './store';
import type { Candidate, TeamMember, TeamRole } from '../../types';

const ROLE_SENTENCE: Record<TeamRole, string> = {
  owner: 'Everything, including wiping the bench.',
  editor: 'Add, edit, change status, and delete people.',
  contributor: "Add people and comment — can't delete or wipe.",
};

function daysAgo(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

export function MembersTable({ members, candidates }: { members: TeamMember[]; candidates: Candidate[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = new Date();
  const addedCounts = useMemo(() => computeAddedCounts(candidates), [candidates]);

  async function onRoleChange(m: TeamMember, role: TeamRole) {
    setBusyId(m.id);
    try {
      await setMemberRole(m.id, role);
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(m: TeamMember) {
    setBusyId(m.id);
    try {
      await removeMember(m.id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="smteam-table">
        <thead>
          <tr>
            <th>Who</th>
            <th>Role</th>
            <th>What they can do</th>
            <th>Last active</th>
            <th>Added</th>
            <th aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {members.map(m => {
            const count = addedCounts[m.name] ?? 0;
            return (
              <tr key={m.id}>
                <td>
                  <div className="smteam-who">
                    <Avatar name={m.name} size="md" />
                    <div>
                      <div className="smteam-who-name p-row p-gap-2">
                        <span>{m.name}</span>
                        {m.sample && <Pill tone="amber" sm>sample</Pill>}
                      </div>
                      <div className="smteam-who-email">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {m.role === 'owner' ? (
                    <span className="smteam-owner-badge">Owner</span>
                  ) : (
                    <select
                      className="p-select smteam-role-select"
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={e => onRoleChange(m, e.target.value as TeamRole)}
                      aria-label={`Role for ${m.name}`}
                    >
                      <option value="editor">Editor</option>
                      <option value="contributor">Contributor</option>
                    </select>
                  )}
                </td>
                <td><span className="smteam-can">{ROLE_SENTENCE[m.role]}</span></td>
                <td className="p-meta">
                  {m.lastActiveAt ? spokeLabel(daysAgo(m.lastActiveAt, now), 'active') : 'never signed in'}
                </td>
                <td className="p-meta">{count} {count === 1 ? 'person' : 'people'}</td>
                <td>
                  {m.role !== 'owner' && (
                    <Btn tone="ghost" size="sm" disabled={busyId === m.id} onClick={() => onRemove(m)}>
                      Remove
                    </Btn>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {members.length === 0 && (
        <div className="p-meta p-mt-4">No teammates yet — invite one below.</div>
      )}
      <div className="p-meta p-mt-4">As of {whenPhrase(now.toISOString(), now)} {now.getFullYear()}.</div>
    </div>
  );
}
