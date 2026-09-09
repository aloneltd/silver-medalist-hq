import { useEffect, useState } from 'react';
import { Card, Btn } from '../ui';
import { ensureAddLink, regenerateAddLink, revokeAddLink, linkStatusLine, type AddLinkRecord } from './linkStore';
import { setAddLinkShared } from './sharedSync';

export function LinkCard({ actor, sharedConfigured }: { actor: string; sharedConfigured: boolean }) {
  const [link, setLink] = useState<AddLinkRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ensureAddLink().then(setLink);
  }, []);

  const url = link ? `${typeof window !== 'undefined' ? window.location.origin : ''}/add/${link.token}` : '';

  async function pushShared(next: AddLinkRecord) {
    if (sharedConfigured) await setAddLinkShared(next, actor);
  }

  async function onCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function onRegenerate() {
    setBusy(true);
    try {
      const next = await regenerateAddLink();
      setLink(next);
      await pushShared(next);
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    setBusy(true);
    try {
      const next = await revokeAddLink();
      if (next) { setLink(next); await pushShared(next); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card pad>
      <div style={{ fontSize: 20, fontWeight: 600 }}>Give hiring managers a link</div>
      <div className="p-sec p-mt-2" style={{ lineHeight: 1.5 }}>
        Anyone with this link can add one person: name, LinkedIn, a résumé, and why they were
        strong. No account needed. It arrives in your Inbox, not straight onto the bench.
      </div>

      {link && (
        <>
          <div className="smteam-linkbox">
            <span>{url}</span>
            <Btn size="sm" onClick={onCopy} aria-label="Copy link">{copied ? 'Copied' : 'Copy'}</Btn>
          </div>
          <div className="p-meta p-mt-2">{linkStatusLine(link)}</div>
          <div className="smteam-link-actions">
            <Btn size="sm" onClick={onRegenerate} disabled={busy}>Regenerate</Btn>
            <Btn size="sm" tone="danger" onClick={onRevoke} disabled={busy || link.revoked}>Revoke</Btn>
          </div>
        </>
      )}

      {!sharedConfigured && (
        <div className="p-note p-mt-6">
          This link only works in the browser where it was created, because the team layer is
          running locally in this browser. Connecting the shared team store (Drive) would make
          it work from any device, anywhere.
        </div>
      )}
    </Card>
  );
}
