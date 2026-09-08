import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Textarea, useToast } from '../../ui';
import { dataService } from '../../services/dataService';
import { ulid } from '../../lib/ulid';
import { useAppUI } from '../../app/store';
import type { Role, IngestJdResponseBody } from '../../types';

/** BLUEPRINT-v2.md: "the quiet-bench empty state with the paste box inline" — a true inline
 * paste-and-create box (not the top-bar modal) so an empty Today is still a working state. */
export function PasteJdInline() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const { setSelectedRoleId } = useAppUI();
  const { push } = useToast();
  const navigate = useNavigate();

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    let parsed: IngestJdResponseBody;
    try {
      const res = await fetch('/api/ingest-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('not ok');
      parsed = await res.json();
    } catch {
      const firstLine = text.split('\n').map(l => l.trim()).find(Boolean) ?? 'Untitled role';
      parsed = { title: firstLine.slice(0, 80), mustHaves: [], niceToHaves: [], dealbreakers: [] };
    }

    const now = new Date().toISOString();
    const role: Role = {
      id: ulid(),
      title: parsed.title,
      team: parsed.team,
      level: parsed.level ?? 'unspecified',
      location: parsed.location ?? 'unspecified',
      onsiteDays: parsed.onsiteDays,
      compBand: parsed.compBand ?? { min: 0, max: 0, currency: 'USD' },
      mustHaves: parsed.mustHaves ?? [],
      niceToHaves: parsed.niceToHaves ?? [],
      dealbreakers: parsed.dealbreakers ?? [],
      urgency: parsed.urgency ?? { score: 3, reasons: [] },
      status: 'open',
      hiringManager: parsed.hiringManager,
      createdAt: now,
      updatedAt: now,
    };
    await dataService.put('roles', role);
    setSelectedRoleId(role.id);
    setLoading(false);
    push(`${role.title} added.`, { tone: 'success' });
    navigate('/bench');
  };

  return (
    <div className="smhq-paste-inline">
      <Textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Paste a job description here…"
        rows={6}
        aria-label="Paste a job description"
      />
      <Button variant="primary" onClick={submit} loading={loading} disabled={!text.trim()}>
        Sync the bench
      </Button>
    </div>
  );
}
