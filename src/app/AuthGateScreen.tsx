import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../ui';

/**
 * Rebuilt sign-in gate (v1 lived at src/components/AuthGate.tsx, orange/slate palette).
 * Same behaviour, contract and copy — owner-only Drive sync via useAuth(), guest = local
 * workspace — restyled onto the Graphite/Paper tokens. Mounted once, at the top of <App>.
 */
export function AuthGateScreen({ children }: { children: ReactNode }) {
  const { user, isLoading, error, googleConfigured, signIn, enterLocalMode, clearError } = useAuth();

  if (isLoading) {
    return (
      <div className="smhq-gate">
        <span className="smhq-gate-spinner" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="smhq-gate">
        <div className="smhq-gate-card">
          <div className="smhq-gate-mark" aria-hidden="true">SM</div>
          <h1 className="smhq-gate-title">Silver Medalist <span>HQ</span></h1>
          <p className="smhq-gate-tagline">The bench that works while you sleep.</p>
          <p className="smhq-gate-copy">
            Paste a job description, let the bench light up with your best silver medalists,
            and draft the outreach in one click.
          </p>

          {error && (
            <div className="smhq-gate-error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={clearError} aria-label="Dismiss">✕</button>
            </div>
          )}

          <Button variant="primary" size="lg" onClick={enterLocalMode} className="smhq-gate-cta">
            Open the workspace
          </Button>
          <p className="smhq-gate-hint">A live sample bench is pre-loaded. Data stays in this browser.</p>

          <div className="smhq-gate-divider"><span>or</span></div>

          {googleConfigured ? (
            <>
              <Button variant="secondary" size="lg" onClick={() => signIn()} className="smhq-gate-cta">
                Sign in with Google · Drive sync
              </Button>
              <p className="smhq-gate-hint">Drive sync is private to the owner account.</p>
            </>
          ) : (
            <p className="smhq-gate-hint">Google Drive sync is not configured on this deployment.</p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
