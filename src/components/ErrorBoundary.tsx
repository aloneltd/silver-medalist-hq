import React from 'react';

interface State { error: Error | null }

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
      // A real recruiter should never see a raw stack trace — offer a reload, and a
      // last-resort local-data reset in case a bad record (e.g. a hand-edited JSON
      // blob from Command Center) is what's crashing the render.
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0f172a', fontFamily: 'sans-serif', padding: 24,
        }}>
          <div style={{ maxWidth: 480, textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
              Silver HQ hit an unexpected error rendering the page. Reloading usually fixes it —
              if it keeps happening, resetting your local workspace data will clear it out.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '12px 24px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: '#ea580c', color: '#fff', fontWeight: 900, fontSize: 12,
                  textTransform: 'uppercase', letterSpacing: 1,
                }}
              >
                Reload
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem('sm_jobs');
                    localStorage.removeItem('sm_candidates');
                    localStorage.removeItem('sm_matches');
                  } catch { /* ignore */ }
                  window.location.reload();
                }}
                style={{
                  padding: '12px 24px', borderRadius: 16, cursor: 'pointer',
                  background: 'transparent', color: '#94a3b8', fontWeight: 900, fontSize: 12,
                  textTransform: 'uppercase', letterSpacing: 1, border: '1px solid #334155',
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
