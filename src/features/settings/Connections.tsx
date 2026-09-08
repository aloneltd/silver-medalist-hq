import { useEffect, useState } from 'react';
import { microsoftAuth, MicrosoftAuthError, type MsAccount } from '../../services/microsoftAuth';
import { dataService } from '../../services/dataService';
import { SETTINGS_KEYS } from '../../types';
import { Button, Chip, useToast } from '../../ui';
import './connections.css';

/** Not part of the frozen SETTINGS_KEYS contract (that only reserves msConnected/outlookAllowSend/
 * briefCache) — a purely local UI flag for "has this browser acquired an Outlook mail token at
 * least once", so the panel doesn't ask for Connect Outlook again every visit. Exported so the
 * outreach composer can gate its Outlook buttons on the exact same flag. */
export const OUTLOOK_CONNECTED_KEY = 'outlookConnectedLocal';

function CopyButton({ value }: { value: string }) {
  const { push } = useToast();
  return (
    <button
      type="button"
      className="smhq-connect-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          push('Copied.', { tone: 'success', durationMs: 1600 });
        } catch {
          push('Could not copy — select the text manually.');
        }
      }}
      aria-label={`Copy "${value}"`}
    >
      Copy
    </button>
  );
}

/**
 * Settings → Connections — DESIGN-v2.1.md §A. Microsoft sign-in, Connect Outlook (separate
 * consent for the mail scopes), the "allow sending from HQ" toggle (off by default — Send is
 * opt-in even once connected), a plain status line, and — the honest state that matters most in
 * an environment with no `VITE_MS_CLIENT_ID` set — the exact copy-paste registration steps from
 * microsoftAuth.registrationSteps(), each with its own Copy button.
 */
export function Connections() {
  const { push } = useToast();
  const configured = microsoftAuth.isConfigured();

  const [account, setAccount] = useState<MsAccount | null>(() => microsoftAuth.getAccount());
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [busy, setBusy] = useState<'signin' | 'connect' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowSend = dataService.hooks.useSetting<boolean>(SETTINGS_KEYS.outlookAllowSend, false);

  useEffect(() => {
    if (!configured) return;
    void dataService.getSetting<boolean>(OUTLOOK_CONNECTED_KEY, false).then(setOutlookConnected);
  }, [configured]);

  const signIn = async () => {
    setBusy('signin'); setError(null);
    try {
      const acc = await microsoftAuth.signIn();
      setAccount(acc);
      await dataService.setSetting(SETTINGS_KEYS.msConnected, true);
      push(`Signed in as ${acc.username}.`, { tone: 'success' });
    } catch (e) {
      setError(e instanceof MicrosoftAuthError ? e.message : 'Microsoft sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const connectOutlook = async () => {
    setBusy('connect'); setError(null);
    try {
      const scopes = [...microsoftAuth.GRAPH_SCOPES.mail, ...microsoftAuth.GRAPH_SCOPES.calendar];
      const token = await microsoftAuth.getToken(scopes);
      if (!token) throw new MicrosoftAuthError('Sign in with Microsoft first.');
      setOutlookConnected(true);
      await dataService.setSetting(OUTLOOK_CONNECTED_KEY, true);
      push('Outlook connected — drafts and reply detection are live.', { tone: 'success' });
    } catch (e) {
      setError(e instanceof MicrosoftAuthError ? e.message : 'Could not connect Outlook.');
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    setBusy('signout'); setError(null);
    try {
      await microsoftAuth.signOut();
      setAccount(null);
      setOutlookConnected(false);
      await Promise.all([
        dataService.setSetting(SETTINGS_KEYS.msConnected, false),
        dataService.setSetting(OUTLOOK_CONNECTED_KEY, false),
        dataService.setSetting(SETTINGS_KEYS.outlookAllowSend, false),
      ]);
    } catch (e) {
      setError(e instanceof MicrosoftAuthError ? e.message : 'Could not sign out.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="smhq-settings-section" aria-label="Outlook connection">
      <h2>Outlook</h2>

      {!configured ? (
        <div className="smhq-connect-registration">
          <p className="smhq-settings-muted">
            Microsoft sign-in isn't set up on this deployment yet. Register the app once in Entra,
            then set <code>VITE_MS_CLIENT_ID</code> — here's exactly what to enter:
          </p>
          <ol className="smhq-connect-steps">
            {microsoftAuth.registrationSteps().map((step, i) => (
              <li key={i}>
                <span className="smhq-connect-step-label">{step.label}</span>
                {step.value && (
                  <span className="smhq-connect-step-value">
                    <code>{step.value}</code>
                    <CopyButton value={step.value} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          <div className="smhq-settings-row" style={{ alignItems: 'center' }}>
            {account ? (
              <>
                <Chip as="span" tone="accent">Signed in · {account.username}</Chip>
                {outlookConnected ? (
                  <Chip as="span" tone="green">Outlook connected</Chip>
                ) : (
                  <Button variant="secondary" size="sm" onClick={connectOutlook} loading={busy === 'connect'}>
                    Connect Outlook
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={signOut} loading={busy === 'signout'}>Sign out</Button>
              </>
            ) : (
              <Button variant="secondary" onClick={signIn} loading={busy === 'signin'}>Sign in with Microsoft</Button>
            )}
          </div>

          {error && <p role="alert" className="smhq-connect-error">{error}</p>}

          {outlookConnected && (
            <label className="smhq-connect-toggle">
              <input
                type="checkbox"
                checked={!!allowSend}
                onChange={async e => {
                  await dataService.setSetting(SETTINGS_KEYS.outlookAllowSend, e.target.checked);
                  push(e.target.checked ? 'HQ can now send from your Outlook mailbox.' : 'Sending from HQ turned off — drafts only.', { tone: 'neutral' });
                }}
              />
              Allow sending from HQ
              <span className="smhq-settings-muted"> — off by default; drafts always work either way.</span>
            </label>
          )}

          {!account && (
            <p className="smhq-settings-muted" style={{ fontSize: 12 }}>
              Identity only until you sign in — Drive sync stays Google-only for now.
            </p>
          )}
        </>
      )}
    </section>
  );
}
