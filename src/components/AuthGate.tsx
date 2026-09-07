import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading, error, googleConfigured, signIn, enterLocalMode, clearError } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500/10 rounded-3xl mb-6">
              <svg className="w-8 h-8 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
            </div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic text-white leading-none">
              Silver <span className="text-orange-500">HQ</span>
            </h1>
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-3">Enterprise Talent Mesh</p>
            <p className="text-sm text-slate-400 mt-5 leading-relaxed">
              Re-deploy your runner-up candidates. Paste a job description, let the AI match your
              silver medalists, and draft the outreach in one click.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
              <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <p className="text-red-400 text-xs font-bold flex-1">{error}</p>
              <button onClick={clearError} aria-label="Dismiss" className="text-red-500 hover:text-red-300 flex-shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
          )}

          <button
            onClick={enterLocalMode}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-orange-500 rounded-2xl text-white font-black text-sm hover:bg-orange-400 transition-all shadow-2xl shadow-orange-900/40 hover:scale-[1.02]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Open the workspace
          </button>
          <p className="text-center text-xs text-slate-500 mt-3 font-medium leading-relaxed">
            Sample jobs and candidates pre-loaded. Data stays in this browser.
          </p>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-slate-800 flex-1" />
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">or</span>
            <div className="h-px bg-slate-800 flex-1" />
          </div>

          {googleConfigured ? (
            <>
              <button
                onClick={() => signIn()}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white rounded-2xl text-slate-900 font-black text-sm hover:bg-slate-100 transition-all shadow-2xl shadow-black/40 hover:scale-[1.02]"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google · Drive sync
              </button>
              <p className="text-center text-xs text-slate-600 mt-3 font-medium">
                Drive sync is private · <span className="text-slate-500">m@alone.ltd</span> only
              </p>
            </>
          ) : (
            <p className="text-center text-xs text-slate-600 font-medium leading-relaxed">
              Google Drive sync is not configured on this deployment
              <span className="block text-slate-700">(set VITE_GOOGLE_CLIENT_ID to enable it)</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
