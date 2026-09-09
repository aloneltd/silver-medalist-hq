import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Btn, Pill, Drawer, Empty, Card } from '../ui';
import { whenPhrase } from '../lib/personText';
import { acceptSubmission, rejectSubmission, previewDuplicate } from './engineBridge';
import type { Submission, StagedPerson } from '../../types';

function senderLine(sub: Submission): string {
  switch (sub.via) {
    case 'link': return sub.addedBy ? `added by ${sub.addedBy} via the link` : 'added via the add-to-bench link';
    case 'capture': return sub.addedBy ? `captured from LinkedIn by ${sub.addedBy}` : 'captured from LinkedIn';
    case 'outlook': return 'from Outlook';
    case 'drive': return 'from a watched Drive folder';
    case 'teammate': return sub.addedBy ? `added by ${sub.addedBy}` : 'added by a teammate';
    case 'resume': return sub.addedBy ? `résumé dropped by ${sub.addedBy}` : 'a résumé drop';
    default: return 'from the Inbox';
  }
}

function headerFor(sub: Submission): { title: string; aside?: string } {
  if (!sub.addedBy && (sub.via === 'resume' || sub.via === 'outlook')) {
    const loc = sub.draft.location ? `, ${sub.draft.location}` : '';
    return { title: 'Unknown, résumé only', aside: `we read the PDF: ${sub.draft.name}${loc}` };
  }
  return { title: sub.draft.name };
}

interface RowProps {
  sub: Submission;
  focused: boolean;
  onAccept: (s: Submission) => void;
  onReject: (s: Submission) => void;
  onOpen: (s: Submission) => void;
  busy: boolean;
}

function InboxRow({ sub, focused, onAccept, onReject, onOpen, busy }: RowProps) {
  const [dupe, setDupe] = useState<StagedPerson | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    previewDuplicate(sub).then(r => { if (live) setDupe(r); });
    return () => { live = false; };
  }, [sub]);

  const header = headerFor(sub);
  const missingEmail = sub.addedBy && !sub.draft.email;

  return (
    <div className={`smteam-inbox-row${focused ? ' smteam-focused' : ''}`}>
      <Avatar name={sub.draft.name} size="md" />
      <div className="smteam-inbox-body">
        <div className="p-row p-gap-2 p-wrap">
          <span style={{ fontWeight: 600 }}>{header.title}</span>
          {sub.roleHint && <Pill tone="wash" sm>{sub.roleHint}</Pill>}
          {sub.sample && <Pill tone="amber" sm>sample</Pill>}
        </div>
        <div className="smteam-inbox-meta">
          {senderLine(sub)} · {whenPhrase(sub.at)}
          {header.aside && <> · {header.aside}</>}
          {missingEmail && <> · no email yet — ask {sub.addedBy}</>}
        </div>
        {sub.note && <div className="smteam-inbox-note">&ldquo;{sub.note}&rdquo;</div>}
        {dupe?.existing && (
          <div className="smteam-inbox-warn">
            Looks like {dupe.existing.name} is already on the bench{dupe.explain ? ` — ${dupe.explain}` : ''}.
          </div>
        )}
      </div>
      <div className="smteam-inbox-actions">
        <Btn size="sm" onClick={() => onOpen(sub)}>Open</Btn>
        <Btn size="sm" tone="danger" onClick={() => onReject(sub)} disabled={busy}>Reject</Btn>
        <Btn size="sm" tone="primary" onClick={() => onAccept(sub)} disabled={busy}>Accept</Btn>
      </div>
    </div>
  );
}

function SubmissionDrawer({ sub, onClose }: { sub: Submission; onClose: () => void }) {
  return (
    <Drawer title={sub.draft.name} onClose={onClose}>
      <div className="p-col p-gap-4">
        <div><span className="p-strong">Arrived: </span>{whenPhrase(sub.at)} — {senderLine(sub)}</div>
        {sub.note && <div><span className="p-strong">Their note: </span>&ldquo;{sub.note}&rdquo;</div>}
        {sub.roleHint && <div><span className="p-strong">Suggested for: </span>{sub.roleHint}</div>}
        {sub.draft.email && <div><span className="p-strong">Email: </span>{sub.draft.email}</div>}
        {sub.draft.linkedin && <div><span className="p-strong">LinkedIn: </span>{sub.draft.linkedin}</div>}
        {sub.draft.currentTitle && <div><span className="p-strong">Title: </span>{sub.draft.currentTitle}</div>}
        {sub.draft.currentEmployer && <div><span className="p-strong">Employer: </span>{sub.draft.currentEmployer}</div>}
        {sub.draft.location && <div><span className="p-strong">Location: </span>{sub.draft.location}</div>}
        {sub.sourceUrl && <div><span className="p-strong">Source: </span><a href={sub.sourceUrl} target="_blank" rel="noreferrer">{sub.sourceUrl}</a></div>}
        <div>
          <span className="p-strong">Résumé text: </span>
          {sub.raw ? <div className="p-note p-mt-2" style={{ whiteSpace: 'pre-wrap' }}>{sub.raw}</div> : <span className="p-meta">No résumé text was captured with this submission.</span>}
        </div>
      </div>
    </Drawer>
  );
}

export function InboxList({ submissions }: { submissions: Submission[] }) {
  const [focusIdx, setFocusIdx] = useState(0);
  const [open, setOpen] = useState<Submission | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const rowRefs = useRef<HTMLDivElement | null>(null);

  // Derived, not stored: when the list shrinks (an accept/reject removes a row) the last
  // focused index can point past the end for one render — clamp it here instead of
  // setState-ing from an effect, which would just trigger an extra render for the same result.
  const safeFocusIdx = submissions.length === 0 ? 0 : Math.min(focusIdx, submissions.length - 1);

  async function doAccept(sub: Submission) {
    setBusyId(sub.id);
    setBanner(null);
    try {
      const outcome = await acceptSubmission(sub, 'You');
      setBanner(outcome.message);
    } finally {
      setBusyId(null);
    }
  }

  async function doReject(sub: Submission) {
    setBusyId(sub.id);
    try {
      await rejectSubmission(sub);
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (open || e.metaKey || e.ctrlKey || e.altKey) return;
      const current = submissions[safeFocusIdx];
      if (!current) return;
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); setFocusIdx(i => Math.min(submissions.length - 1, i + 1)); }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)); }
      else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); doAccept(current); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); doReject(current); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submissions, safeFocusIdx, open]);

  if (submissions.length === 0) {
    return (
      <Empty title="Nothing waiting">
        Everything a teammate, the add-to-bench link, a mailbox scan or a capture proposes lands
        here first. Nothing is on the bench until you accept it.
      </Empty>
    );
  }

  return (
    <div ref={rowRefs}>
      {banner && <div className="p-note p-mt-2" style={{ marginBottom: 12 }}>{banner}</div>}
      <div className="smteam-kbd-hint">
        <span className="p-kbd">J</span> / <span className="p-kbd">K</span> to move ·{' '}
        <span className="p-kbd">A</span> accept · <span className="p-kbd">R</span> reject
      </div>
      <Card pad={false} className="p-mt-3">
        {submissions.map((sub, i) => (
          <InboxRow
            key={sub.id}
            sub={sub}
            focused={i === safeFocusIdx}
            busy={busyId === sub.id}
            onAccept={doAccept}
            onReject={doReject}
            onOpen={setOpen}
          />
        ))}
      </Card>
      {open && <SubmissionDrawer sub={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function InboxPreview({ submissions }: { submissions: Submission[] }) {
  const top = submissions.slice(0, 3);
  return (
    <Card pad>
      <div className="p-spread">
        <div style={{ fontSize: 20, fontWeight: 600 }}>Inbox · {submissions.length} waiting</div>
        <Link to="/inbox" className="p-sec" style={{ color: 'var(--p-accent-ink)', fontWeight: 600 }}>Open Inbox →</Link>
      </div>
      {top.length === 0 ? (
        <div className="p-meta p-mt-4">Nothing waiting right now.</div>
      ) : (
        <div className="p-col p-gap-3 p-mt-4">
          {top.map(sub => {
            const header = headerFor(sub);
            return (
              <div key={sub.id} className="p-row p-gap-3">
                <Avatar name={sub.draft.name} size="sm" />
                <div className="p-grow" style={{ fontSize: 14, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 600 }}>{header.title}</span> · {senderLine(sub)}
                  {sub.note && <> · &ldquo;{sub.note}&rdquo;</>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
