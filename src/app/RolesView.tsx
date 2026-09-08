import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../db';
import { dataService } from '../services/dataService';
import { Button, Chip, Table, THead, TBody, TR, TH, TD } from '../ui';
import { useAppUI } from './store';

/**
 * Not explicitly owned by either builder in BLUEPRINT-v2.md's split (bench/map/dossier/outreach
 * are B2's; today/board/import/settings are B3's) — "Roles" is a rail item with nowhere else to
 * live, so it's here in src/app alongside the rest of shell navigation, kept intentionally small:
 * list + status + jump-to-bench. Creating a role is the "Paste a role" flow (also src/app/).
 */
export function RolesView() {
  const navigate = useNavigate();
  const { setSelectedRoleId, openPasteRole } = useAppUI();
  const roles = [...(dataService.hooks.useRoles() ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const matchCounts: Record<string, number> = useLiveQuery(async () => {
    const all = await db.matches.toArray();
    const counts: Record<string, number> = {};
    for (const m of all) counts[m.roleId] = (counts[m.roleId] ?? 0) + 1;
    return counts;
  }, [], {} as Record<string, number>) ?? {};

  const goToBench = (roleId: string) => {
    setSelectedRoleId(roleId);
    navigate('/bench');
  };

  return (
    <div className="smhq-page">
      <div className="smhq-page-header">
        <div>
          <h1>Roles</h1>
          <p>{roles.length} role{roles.length === 1 ? '' : 's'} on file.</p>
        </div>
        <Button variant="primary" onClick={openPasteRole}>Paste a role</Button>
      </div>

      {roles.length === 0 ? (
        <div className="smhq-empty">
          <p>No roles yet. Paste a job description to get started.</p>
          <Button variant="primary" onClick={openPasteRole}>Paste a role</Button>
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Title</TH>
              <TH>Level</TH>
              <TH>Location</TH>
              <TH>Comp band</TH>
              <TH>Status</TH>
              <TH>Scored</TH>
              <TH aria-label="Actions" />
            </tr>
          </THead>
          <TBody>
            {roles.map(r => (
              <TR key={r.id}>
                <TD>{r.title}</TD>
                <TD>{r.level}</TD>
                <TD>{r.location}</TD>
                <TD>
                  {r.compBand.max ? `${r.compBand.currency} ${r.compBand.min.toLocaleString()}–${r.compBand.max.toLocaleString()}` : '—'}
                </TD>
                <TD>
                  <Chip as="span" tone={r.status === 'open' ? 'green' : r.status === 'paused' ? 'amber' : 'neutral'}>
                    {r.status}
                  </Chip>
                </TD>
                <TD>{matchCounts[r.id] ?? 0}</TD>
                <TD>
                  <Button variant="secondary" size="sm" onClick={() => goToBench(r.id)}>Sync bench</Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
