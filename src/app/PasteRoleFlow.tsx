import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Button, Textarea, Input, useToast } from '../ui';
import { dataService } from '../services/dataService';
import { ulid } from '../lib/ulid';
import { useAppUI } from './store';
import type { Role, IngestJdResponseBody } from '../types';

/**
 * BLUEPRINT-v2.md: "paste-a-JD anchor that calls /api/ingest-jd, shows the editable role JSON
 * preview, then 'Sync the bench'." /api/ingest-jd is B1's to build; this degrades to a manual
 * "fill it in yourself" form if the endpoint isn't live yet or the call fails, so pasting a JD
 * is never a dead end.
 */
export function PasteRoleFlow() {
  const { pasteRoleOpen, closePasteRole, setSelectedRoleId, runSync } = useAppUI();
  const { push } = useToast();
  const navigate = useNavigate();

  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<IngestJdResponseBody | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);

  const reset = () => { setJdText(''); setPreview(null); setUsedFallback(false); };
  const close = () => { closePasteRole(); reset(); };

  const ingest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ingest-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: jdText }),
      });
      if (res.ok) {
        const data = (await res.json()) as IngestJdResponseBody;
        setPreview(data);
        setUsedFallback(false);
        return;
      }
    } catch { /* network error / not shipped yet — fall through to the manual preview below */ }
    finally { setLoading(false); }
    // Deterministic fallback: pull a title out of the first line so the flow never dead-ends.
    const firstLine = jdText.split('\n').map(l => l.trim()).find(Boolean) ?? 'Untitled role';
    setPreview({ title: firstLine.slice(0, 80), mustHaves: [], niceToHaves: [], dealbreakers: [] });
    setUsedFallback(true);
  };

  const createRole = async () => {
    if (!preview) return;
    const now = new Date().toISOString();
    const role: Role = {
      id: ulid(),
      title: preview.title,
      team: preview.team,
      level: preview.level ?? 'unspecified',
      location: preview.location ?? 'unspecified',
      onsiteDays: preview.onsiteDays,
      compBand: preview.compBand ?? { min: 0, max: 0, currency: 'USD' },
      mustHaves: preview.mustHaves ?? [],
      niceToHaves: preview.niceToHaves ?? [],
      dealbreakers: preview.dealbreakers ?? [],
      urgency: preview.urgency ?? { score: 3, reasons: [] },
      status: 'open',
      hiringManager: preview.hiringManager,
      createdAt: now,
      updatedAt: now,
    };
    await dataService.put('roles', role);
    setSelectedRoleId(role.id);
    close();
    navigate('/bench');
    // The button says "Create role & sync the bench" — so it syncs. The bench fills wave by
    // wave on the screen the user just landed on; runSync raises its own toast when it lands.
    void runSync(role.id);
  };

  return (
    <Dialog open={pasteRoleOpen} onClose={close} title="Paste a role">
      {!preview ? (
        <div className="flex flex-col gap-3">
          <Textarea
            autoFocus
            value={jdText}
            onChange={e => setJdText(e.target.value)}
            placeholder="Paste the job description here…"
            rows={10}
            hint="We'll turn this into a role you can score the bench against."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {usedFallback && (
            <p className="text-xs" style={{ color: 'var(--amber)' }}>
              Couldn't reach the AI parser — fill in the details below by hand.
            </p>
          )}
          <Input
            label="Title"
            value={preview.title}
            onChange={e => setPreview({ ...preview, title: e.target.value })}
          />
          <Input
            label="Level"
            value={preview.level ?? ''}
            onChange={e => setPreview({ ...preview, level: e.target.value })}
          />
          <Input
            label="Location"
            value={preview.location ?? ''}
            onChange={e => setPreview({ ...preview, location: e.target.value })}
          />
          <Input
            label="Must-haves (comma separated)"
            value={(preview.mustHaves ?? []).join(', ')}
            onChange={e => setPreview({ ...preview, mustHaves: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          />
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        {!preview ? (
          <Button variant="primary" onClick={ingest} loading={loading} disabled={!jdText.trim()}>
            Parse role
          </Button>
        ) : (
          <Button variant="primary" onClick={createRole}>Create role &amp; sync the bench</Button>
        )}
      </div>
    </Dialog>
  );
}
