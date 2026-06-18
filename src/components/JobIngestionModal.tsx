import React, { useState } from 'react';
import { AIService } from '../services/aiService';
import type { Job } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddJob: (job: Job) => void;
}

const aiService = new AIService();

const JobIngestionModal: React.FC<Props> = ({ isOpen, onClose, onAddJob }) => {
  const [text, setText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleIngest = async () => {
    if (!text.trim()) return;
    setIsParsing(true);
    setError(null);
    try {
      const parsed = await aiService.parseJobDescription({ text });
      const newJob: Job = {
        title: 'Untitled Role',
        level: 'Unknown',
        location: 'Unknown',
        remote_policy: 'unknown',
        comp_range: { min: 'unknown', max: 'unknown', currency: 'USD' },
        must_haves: [],
        dealbreakers: [],
        urgency: { score_1_to_5: 3, reasons: [] },
        ...parsed as Partial<Job>,
        job_id: `REQ-${Math.floor(Math.random() * 90000) + 10000}`,
        recruiter_owner: { name: 'Ingest System', team: 'Command Intelligence' }
      };
      onAddJob(newJob);
      setText('');
      onClose();
    } catch (e: any) {
      setError(e.message || 'Neural extraction failed. Please check the job description and try again.');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-3xl rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] overflow-hidden border border-white/20 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">JD Ingestor</h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Paste a job description — AI extracts structure</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-10 overflow-y-auto">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 block">Job Description Text</label>
          <textarea
            className="w-full h-72 bg-slate-50 rounded-[2rem] p-8 text-sm font-medium border-2 border-slate-100 focus:border-orange-500 focus:bg-white outline-none transition-all placeholder:text-slate-300 resize-none"
            placeholder="Paste the full job description here... AI will extract title, level, skills, compensation, and more."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isParsing}
          />
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-10 py-8 bg-slate-900 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <p className="text-xs text-slate-400 font-black uppercase tracking-widest">Gemini 2.5 Flash Active</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
              Cancel
            </button>
            <button
              onClick={handleIngest}
              disabled={isParsing || !text.trim()}
              className={`px-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all shadow-2xl ${
                isParsing || !text.trim()
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-orange-600 text-white hover:scale-105 active:scale-95 shadow-orange-600/20'
              }`}
            >
              {isParsing ? (
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              )}
              {isParsing ? 'Extracting...' : 'Ingest Requirement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobIngestionModal;
