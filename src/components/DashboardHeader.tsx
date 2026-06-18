import React from 'react';

interface Props {
  summary?: any;
  loading: boolean;
  onSync: () => void;
}

const DashboardHeader: React.FC<Props> = ({ summary, loading, onSync }) => {
  return (
    <header className="bg-white px-8 py-5 border-b border-slate-200 sticky top-0 z-40">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Live Sync Operational</span>
          </div>
          {summary && (
            <div className="text-xs font-mono text-slate-400 mt-0.5">Audit ID: {summary.security_audit_id}</div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={onSync}
            disabled={loading}
            className={`px-8 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 shadow-lg active:scale-95 ${
              loading
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-orange-600 shadow-slate-900/10'
            }`}
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            )}
            Neural Sync & Match
          </button>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
