import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Btn, Card } from '../ui';
import { ulid } from '../../lib/ulid';
import { addSubmission } from '../team/store';
import { recordAddLinkUse, validateAddLinkLocally } from '../team/linkStore';
import { checkTokenShared, upsertSubmissionShared, recordAddLinkUseShared } from '../team/sharedSync';
import { TOKEN_STATUS_SENTENCE, type TokenStatus } from '../team/tokenLogic';
import type { Submission } from '../../types';
import '../team/team.css';

const MAX_RESUME_BYTES = 8 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function readResume(file: File): Promise<{ raw: string; parsed?: Record<string, unknown> }> {
  const kb = Math.round(file.size / 1024);
  const fallback = `Résumé attached: ${file.name} (${kb} KB, ${file.type || 'unknown type'}). Not auto-read.`;
  try {
    const base64 = await readAsBase64(file);
    const res = await fetch('/api/parse-resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, mimeType: file.type || 'application/pdf' }),
    });
    if (!res.ok) return { raw: fallback };
    const parsed = await res.json();
    if (!parsed || typeof parsed.name !== 'string') return { raw: fallback };
    return { raw: `Résumé auto-read (${file.name}): ${JSON.stringify(parsed, null, 2)}`, parsed };
  } catch {
    return { raw: fallback };
  }
}

type LoadState = { kind: 'loading' } | { kind: 'blocked'; status: Exclude<TokenStatus, 'valid'> } | { kind: 'ready' } | { kind: 'sent' };

export function AddToBench() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [shared, setShared] = useState(false);

  const [name, setName] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [why, setWhy] = useState('');
  const [role, setRole] = useState('');
  const [yourName, setYourName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const remote = await checkTokenShared(token);
      if (!live) return;
      if (remote.configured && remote.status) {
        setShared(true);
        setState(remote.status === 'valid' ? { kind: 'ready' } : { kind: 'blocked', status: remote.status });
        return;
      }
      const local = await validateAddLinkLocally(token);
      if (!live) return;
      setState(local === 'valid' ? { kind: 'ready' } : { kind: 'blocked', status: local });
    })();
    return () => { live = false; };
  }, [token]);

  function onFile(f: File | null) {
    setFileError(null);
    if (f && f.size > MAX_RESUME_BYTES) {
      setFileError('That file is larger than 8 MB — try a smaller résumé.');
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittedRef.current || submitting) return;
    if (!name.trim()) { setError('Their name is required.'); return; }
    if (!why.trim()) { setError('Say why they were strong — that\'s the field that actually gets read.'); return; }
    setError(null);
    setSubmitting(true);
    submittedRef.current = true;
    try {
      let raw: string | undefined;
      let parsed: Record<string, unknown> | undefined;
      if (file) {
        const r = await readResume(file);
        raw = r.raw;
        parsed = r.parsed;
      }
      const submitterLabel = yourName.trim() || 'Someone via the link';
      const sub: Submission = {
        id: ulid(),
        at: new Date().toISOString(),
        via: 'link',
        addedBy: submitterLabel,
        note: why.trim(),
        roleHint: role.trim() || undefined,
        draft: {
          name: name.trim(),
          linkedin: linkedin.trim() || undefined,
          currentEmployer: typeof parsed?.currentEmployer === 'string' ? parsed.currentEmployer : undefined,
          currentTitle: typeof parsed?.currentTitle === 'string' ? parsed.currentTitle : undefined,
          location: typeof parsed?.location === 'string' ? parsed.location : undefined,
        },
        raw,
        sourceUrl: linkedin.trim() || undefined,
        state: 'waiting',
      };
      await addSubmission(sub);
      await recordAddLinkUse(submitterLabel);
      if (shared) {
        await upsertSubmissionShared(sub.id, sub, submitterLabel);
        await recordAddLinkUseShared(submitterLabel);
      }
      setState({ kind: 'sent' });
    } catch {
      setError('Something went wrong sending this — please try again.');
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="smteam-public p-app">
      <div className="smteam-public-inner">
        <h1 className="p-serif p-h2">Add someone to the bench</h1>
        <p className="p-lede p-mt-3">
          It goes to Mark's Inbox for review. Nothing is published, and nobody is contacted automatically.
        </p>

        {state.kind === 'loading' && (
          <Card pad className="p-mt-8"><div className="p-meta">Checking this link…</div></Card>
        )}

        {state.kind === 'blocked' && (
          <Card pad className="p-mt-8">
            <div className="p-story">{TOKEN_STATUS_SENTENCE[state.status]}</div>
          </Card>
        )}

        {state.kind === 'ready' && (
          <form onSubmit={onSubmit}>
            <div className="smteam-public-field">
              <label className="p-label" htmlFor="atb-name">Their name</label>
              <input id="atb-name" className="p-input" value={name} onChange={e => setName(e.target.value)} required autoComplete="off" />
            </div>

            <div className="smteam-public-field">
              <label className="p-label" htmlFor="atb-linkedin">LinkedIn URL (optional)</label>
              <input id="atb-linkedin" className="p-input" type="url" placeholder="https://linkedin.com/in/…" value={linkedin} onChange={e => setLinkedin(e.target.value)} autoComplete="off" />
            </div>

            <div className="smteam-public-field">
              <label className="p-label" htmlFor="atb-resume">Résumé (optional)</label>
              <input
                id="atb-resume" className="p-input" type="file" accept=".pdf,.doc,.docx"
                style={{ height: 'auto', padding: 10 }}
                onChange={e => onFile(e.target.files?.[0] ?? null)}
              />
              {fileError && <div className="p-hint" style={{ color: 'var(--p-red)' }}>{fileError}</div>}
              {file && !fileError && <div className="p-hint">{file.name}</div>}
            </div>

            <div className="smteam-public-field">
              <label className="p-label" htmlFor="atb-why">Why were they strong?</label>
              <textarea
                id="atb-why" className="p-textarea" style={{ minHeight: 160 }}
                placeholder="What made them stand out — the role, the moment, the thing you remember."
                value={why} onChange={e => setWhy(e.target.value)} required
              />
            </div>

            <div className="smteam-public-field">
              <label className="p-label" htmlFor="atb-role">Which role (optional)</label>
              <input id="atb-role" className="p-input" placeholder="e.g. Staff SRE" value={role} onChange={e => setRole(e.target.value)} autoComplete="off" />
            </div>

            <div className="smteam-public-field">
              <label className="p-label" htmlFor="atb-yourname">Your name</label>
              <input id="atb-yourname" className="p-input" placeholder="So we know who to thank" value={yourName} onChange={e => setYourName(e.target.value)} autoComplete="off" />
            </div>

            {error && <div className="p-note p-mt-6" style={{ color: 'var(--p-red)' }}>{error}</div>}

            <div className="smteam-public-actions">
              <Btn type="submit" tone="primary" size="lg" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send to the Inbox'}
              </Btn>
              <div className="smteam-public-note">No account needed. This does not go straight onto the bench.</div>
            </div>
          </form>
        )}

        {state.kind === 'sent' && (
          <div className="smteam-confirm">
            <div className="p-serif p-h2">Sent — thank you.</div>
            <p className="p-lede p-mt-4">
              It's in the Inbox now for review. Nothing is published and nobody is contacted
              automatically — a recruiter checks it and decides from there.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
