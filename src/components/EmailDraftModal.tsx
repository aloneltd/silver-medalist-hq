import React, { useState, useEffect } from 'react';
import { AIService } from '../services/aiService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  candidateName: string;
  jobTitle: string;
  strategy: string;
}

const aiService = new AIService();

const EmailDraftModal: React.FC<Props> = ({ isOpen, onClose, candidateName, jobTitle, strategy }) => {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && candidateName && jobTitle) {
      generateDraft();
    }
  }, [isOpen]);

  const generateDraft = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await aiService.draftOutreachEmail(candidateName, jobTitle, strategy);
      setDraft(result);
    } catch (e: any) {
      setError(e.message || 'Failed to generate email draft');
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportTxt = () => {
    const blob = new Blob([draft], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outreach-${candidateName.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Outreach Draft</h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">
              {candidateName} → {jobTitle}
            </p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="p-10 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <svg className="animate-spin w-10 h-10 text-orange-500 mb-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Generating outreach email...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
              {error}
              <button onClick={generateDraft} className="mt-4 block text-xs font-black text-red-600 uppercase tracking-widest hover:underline">
                Try again
              </button>
            </div>
          ) : (
            <textarea
              className="w-full h-80 bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm font-medium focus:border-orange-500 focus:bg-white outline-none transition-all resize-none leading-relaxed"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Email draft will appear here..."
            />
          )}
        </div>

        <div className="px-10 py-8 bg-slate-900 flex justify-between items-center">
          <button onClick={generateDraft} disabled={loading} className="text-xs font-black text-white/50 uppercase tracking-widest hover:text-white transition-all flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            Regenerate
          </button>
          <div className="flex gap-3">
            <button onClick={exportTxt} disabled={!draft || loading} className="px-6 py-3 bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
              Export
            </button>
            <button onClick={copy} disabled={!draft || loading} className="px-8 py-3 bg-orange-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailDraftModal;
