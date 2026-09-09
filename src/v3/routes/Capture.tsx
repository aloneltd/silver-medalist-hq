import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHelpKey } from '../help/HelpProvider';
import { Btn, BtnLink, Card, PageHeader, Skel } from '../ui';
import { useToast } from '../../ui';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../db/schema';
import { ulid } from '../../lib/ulid';
import type { Candidate, CaptureDraft, ImportBatch, ImportPlan, PersonSource, StagedPerson } from '../../types';
import { buildPlanFromCapture, commitPlan, commitStaged, stagePerson } from '../import';
import { CaptureDialog } from '../sources/CaptureDialog';
import { decodeCaptureFragment } from '../sources/bookmarklet';
import { friendlyEngineError } from '../sources/format';
import '../sources/sources.css';

interface EditableFields {
  name: string;
  employer: string;
  title: string;
  location: string;
  linkedin: string;
  why: string;
}

function guessTitleAndEmployer(headline?: string): { title: string; employer: string } {
  const m = headline?.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  return m ? { title: m[1].trim(), employer: m[2].trim() } : { title: '', employer: '' };
}

function fieldsFromRawDraft(draft: CaptureDraft): EditableFields {
  const guess = guessTitleAndEmployer(draft.headline);
  return {
    name: draft.name?.trim() ?? '',
    employer: guess.employer,
    title: guess.title,
    location: draft.location?.trim() ?? '',
    linkedin: draft.url?.includes('linkedin.com') ? draft.url : '',
    why: '',
  };
}

function fieldsFromCandidateDraft(candidate: Candidate | undefined, raw: CaptureDraft): EditableFields {
  if (!candidate) return fieldsFromRawDraft(raw);
  return {
    name: candidate.name || raw.name || '',
    employer: candidate.currentEmployer && candidate.currentEmployer !== 'unspecified' ? candidate.currentEmployer : '',
    title: candidate.currentTitle && candidate.currentTitle !== 'unspecified' ? candidate.currentTitle : '',
    location: candidate.location && candidate.location !== 'unspecified' ? candidate.location : (raw.location ?? ''),
    linkedin: candidate.linkedin ?? (raw.url?.includes('linkedin.com') ? raw.url : ''),
    why: '',
  };
}

function applyFields(draft: Candidate, fields: EditableFields, actor: string): Candidate {
  return {
    ...draft,
    name: fields.name || draft.name,
    currentEmployer: fields.employer || draft.currentEmployer,
    currentTitle: fields.title || draft.currentTitle,
    location: fields.location || draft.location,
    linkedin: fields.linkedin || draft.linkedin,
    notes: fields.why.trim()
      ? [...draft.notes, { id: ulid(), body: fields.why.trim(), at: new Date().toISOString(), actor }]
      : draft.notes,
  };
}

function readDraftFromLocation(searchParams: URLSearchParams): CaptureDraft | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash) {
    const decoded = decodeCaptureFragment(hash);
    if (decoded) {
      return { name: decoded.name, headline: decoded.headline, url: decoded.url, text: decoded.text, site: decoded.site };
    }
  }
  const name = searchParams.get('name');
  const url = searchParams.get('url');
  const text = searchParams.get('text');
  if (name || url || text) {
    return {
      name: name ?? undefined,
      headline: searchParams.get('headline') ?? undefined,
      location: searchParams.get('location') ?? undefined,
      url: url ?? undefined,
      text: text ?? undefined,
    };
  }
  return null;
}

/**
 * The Capture landing page — where the bookmarklet's new tab opens. Must work stone cold: no
 * app state, no prior navigation, possibly the very first page this browser has ever loaded
 * for this app. DESIGN-v3.md pillar 1: "structures it and offers 'Add to bench'."
 */
export function Capture() {
  useHelpKey('sources');
  const [searchParams] = useSearchParams();
  const { user, mode } = useAuth();
  const { push } = useToast();
  const actor = mode === 'google' && user?.name ? user.name : 'You';

  const draft = useMemo(() => readDraftFromLocation(searchParams), [searchParams]);

  const [loading, setLoading] = useState(!!draft);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [staged, setStaged] = useState<StagedPerson | undefined>(undefined);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [fields, setFields] = useState<EditableFields | null>(null);
  const [committing, setCommitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<ImportBatch | null>(null);
  const [sentToInbox, setSentToInbox] = useState(false);
  const [getButtonOpen, setGetButtonOpen] = useState(false);

  useEffect(() => {
    if (!draft) return;
    // `loading` starts true whenever there is a draft to read (see useState(!!draft) above) —
    // this effect only ever needs to flip it back off, from the promise callbacks below.
    let cancelled = false;
    buildPlanFromCapture(draft)
      .then(p => {
        if (cancelled) return;
        setPlan(p);
        const person = p.people[0];
        setStaged(person);
        setFields(fieldsFromCandidateDraft(person?.draft, draft));
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setEngineError(friendlyEngineError(e, 'Reading this capture'));
        setFields(fieldsFromRawDraft(draft));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [draft]);

  function update<K extends keyof EditableFields>(key: K, value: EditableFields[K]) {
    setFields(prev => (prev ? { ...prev, [key]: value } : prev));
  }

  const source: PersonSource = {
    kind: 'capture',
    label: draft?.site ? `captured from ${draft.site}` : 'Capture',
    url: fields?.linkedin || draft?.url,
    addedBy: actor,
    at: new Date().toISOString(),
  };

  async function handleAddToBench() {
    if (!fields?.name.trim()) return;
    setCommitting(true);
    setSaveError(null);
    try {
      if (plan && staged) {
        const editedPeople = plan.people.map(p =>
          p.key === staged.key ? { ...p, draft: applyFields(p.draft, fields, actor) } : p,
        );
        const batch = await commitPlan({ ...plan, people: editedPeople }, { actor });
        setCommitted(batch);
      } else {
        // The engine's own capture path threw — fall back to the same single-person staging
        // the Inbox accept flow uses, so this still runs the real duplicate check.
        const person = await stagePerson(
          {
            name: fields.name.trim(),
            currentEmployer: fields.employer || 'unspecified',
            currentTitle: fields.title || 'unspecified',
            location: fields.location || 'unspecified',
            linkedin: fields.linkedin || undefined,
            notes: fields.why.trim() ? [{ id: ulid(), body: fields.why.trim(), at: new Date().toISOString(), actor }] : [],
          },
          source,
        );
        const batch = await commitStaged([person], source, { actor, label: 'Capture' });
        setCommitted(batch);
      }
      push(`Added ${fields.name.trim()} to the bench.`, { tone: 'success' });
    } catch (e) {
      setSaveError(friendlyEngineError(e, "Saving isn't possible yet") + ' Nothing you entered below is lost — try again, or send it to the Inbox instead.');
    } finally {
      setCommitting(false);
    }
  }

  async function handleSendToInbox() {
    if (!fields?.name.trim()) return;
    try {
      await db.submissions.put({
        id: ulid(),
        at: new Date().toISOString(),
        via: 'capture',
        addedBy: actor,
        note: fields.why.trim() || undefined,
        roleHint: undefined,
        draft: {
          name: fields.name.trim(),
          currentEmployer: fields.employer || undefined,
          currentTitle: fields.title || undefined,
          location: fields.location || undefined,
          linkedin: fields.linkedin || undefined,
        } as Partial<Candidate> & { name: string },
        raw: draft?.text,
        sourceUrl: fields.linkedin || draft?.url,
        state: 'waiting',
      });
      setSentToInbox(true);
      push('Sent to the Inbox for review.', { tone: 'success' });
    } catch {
      push("Couldn't reach the Inbox — try again in a moment.", { tone: 'danger' });
    }
  }

  // ---------------------------------------------------------------------------- no fragment

  if (!draft) {
    return (
      <div className="p-container">
        <PageHeader
          title="Capture"
          lede="A button for your bookmarks bar. Click it on any LinkedIn profile, job board or ATS page and it sends what's visible there here, ready for you to check and add."
        />
        <Card className="p-mt-8" style={{ maxWidth: 640 }}>
          <div className="p-story">
            This page only shows something when it's opened from the Capture button — nothing arrived this time, so
            there's nothing to review yet.
          </div>
          <div className="p-mt-4">
            <Btn tone="primary" onClick={() => setGetButtonOpen(true)}>Get the button</Btn>
          </div>
        </Card>
        {getButtonOpen && <CaptureDialog onClose={() => setGetButtonOpen(false)} />}
      </div>
    );
  }

  // -------------------------------------------------------------------------------- committed

  if (committed) {
    const targetId = committed.createdIds[0] ?? committed.mergedIds[0];
    return (
      <div className="p-container">
        <PageHeader title="Added to the bench" lede={`${fields?.name ?? 'They'} joined the bench, tagged as arriving from Capture.`} />
        <div className="p-row p-gap-3 p-mt-6">
          {targetId && <BtnLink to={`/p/${targetId}`} tone="primary">View their profile</BtnLink>}
          <BtnLink to="/sources">Back to Sources</BtnLink>
        </div>
      </div>
    );
  }

  if (sentToInbox) {
    return (
      <div className="p-container">
        <PageHeader title="Sent to the Inbox" lede={`${fields?.name ?? 'They'} is waiting for review in the Inbox — nothing reaches the bench until someone accepts it.`} />
        <div className="p-row p-gap-3 p-mt-6">
          <BtnLink to="/inbox" tone="primary">Open Inbox</BtnLink>
          <BtnLink to="/sources">Back to Sources</BtnLink>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------------------- reviewing

  return (
    <div className="p-container">
      <PageHeader title="Capture" lede="Check what we read, fix anything that's off, then add them to the bench." />

      {loading && <div className="p-col p-gap-3 p-mt-8"><Skel height={44} width={280} /><Skel height={220} /></div>}

      {!loading && fields && (
        <>
          {engineError && (
            <div className="p-note-amber p-mt-6">{engineError} The details below are exactly what the page sent — nothing is lost.</div>
          )}

          {staged?.existing && (
            <div className="p-note p-mt-4">
              Looks like <span className="p-strong">{staged.existing.name}</span> is already on your bench
              {staged.matchOn ? ` (matched on ${staged.matchOn})` : ''}. {staged.explain ?? ''} Adding will merge them,
              not create a duplicate — their "do not approach" status and notes stay either way.
            </div>
          )}

          <Card className="p-mt-6" style={{ maxWidth: 720 }}>
            <div className="p-col p-gap-4">
              <div className="src-capture-field">
                <label className="p-label" htmlFor="cap-name">Name</label>
                <input id="cap-name" className="p-input" value={fields.name} onChange={e => update('name', e.target.value)} autoFocus />
              </div>
              <div className="p-grid-2">
                <div className="src-capture-field">
                  <label className="p-label" htmlFor="cap-employer">Employer</label>
                  <input id="cap-employer" className="p-input" value={fields.employer} onChange={e => update('employer', e.target.value)} />
                </div>
                <div className="src-capture-field">
                  <label className="p-label" htmlFor="cap-title">Title</label>
                  <input id="cap-title" className="p-input" value={fields.title} onChange={e => update('title', e.target.value)} />
                </div>
              </div>
              <div className="p-grid-2">
                <div className="src-capture-field">
                  <label className="p-label" htmlFor="cap-location">Location</label>
                  <input id="cap-location" className="p-input" value={fields.location} onChange={e => update('location', e.target.value)} />
                </div>
                <div className="src-capture-field">
                  <label className="p-label" htmlFor="cap-linkedin">LinkedIn URL</label>
                  <input id="cap-linkedin" className="p-input" value={fields.linkedin} onChange={e => update('linkedin', e.target.value)} />
                </div>
              </div>
              <div className="src-capture-field">
                <label className="p-label" htmlFor="cap-why">Why they were strong</label>
                <textarea
                  id="cap-why"
                  className="p-textarea"
                  value={fields.why}
                  onChange={e => update('why', e.target.value)}
                  placeholder="What made you click Capture on this page?"
                />
              </div>
              {draft.url && (
                <div className="p-meta">
                  Captured from <a href={draft.url} target="_blank" rel="noreferrer">{draft.url}</a>
                </div>
              )}
            </div>
          </Card>

          {saveError && <div className="p-note-amber p-mt-4">{saveError}</div>}

          <div className="p-row p-gap-3 p-mt-6">
            <Btn tone="primary" disabled={committing || !fields.name.trim()} onClick={handleAddToBench}>
              {committing ? 'Adding…' : 'Add to bench'}
            </Btn>
            <Btn disabled={!fields.name.trim()} onClick={handleSendToInbox}>Send to the Inbox instead</Btn>
          </div>
        </>
      )}
    </div>
  );
}
