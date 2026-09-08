import React from 'react';

interface State { error: Error | null }

/** Moved from src/components/ErrorBoundary.tsx (deleted with the rest of the v1 shell) and
 * restyled onto tokens. A recruiter should never see a raw stack trace — offer a reload and a
 * last-resort local-data reset. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error.message, error.stack, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="smhq-crash">
          <div className="smhq-crash-card">
            <div className="smhq-crash-icon" aria-hidden="true">!</div>
            <h2>Something went wrong</h2>
            <p>
              Silver Medalist HQ hit an unexpected error rendering the page. Reloading usually
              fixes it — if it keeps happening, resetting your local workspace will clear it out.
            </p>
            <div className="smhq-crash-actions">
              <button type="button" className="smhq-btn smhq-btn-primary smhq-btn-md" onClick={() => window.location.reload()}>
                Reload
              </button>
              <button
                type="button"
                className="smhq-btn smhq-btn-secondary smhq-btn-md"
                onClick={() => {
                  try {
                    indexedDB.deleteDatabase('silver-medalist-hq');
                    localStorage.removeItem('sm_jobs');
                    localStorage.removeItem('sm_candidates');
                    localStorage.removeItem('sm_matches');
                  } catch { /* ignore */ }
                  window.location.reload();
                }}
              >
                Reset local data
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
