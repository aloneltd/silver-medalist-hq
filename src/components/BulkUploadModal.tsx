import React, { useState, useRef } from 'react';
import type { Candidate, Job } from '../types';
import { AIService } from '../services/aiService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddCandidates: (candidates: Candidate[]) => void;
  onAddJobs: (jobs: Job[]) => void;
  accessToken: string | null;
}

interface ParseResult<T> {
  filename: string;
  status: 'pending' | 'parsing' | 'done' | 'error';
  result?: T;
  error?: string;
}

const aiService = new AIService();

const BulkUploadModal: React.FC<Props> = ({ isOpen, onClose, onAddCandidates, onAddJobs, accessToken }) => {
  const [resumeFiles, setResumeFiles] = useState<ParseResult<Candidate>[]>([]);
  const [jdTexts, setJdTexts] = useState<ParseResult<Job>[]>([]);
  const [jdInput, setJdInput] = useState('');
  const [resumeDrag, setResumeDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const toBase64 = (f: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });

  const handleResumeFiles = (files: FileList) => {
    const newFiles: ParseResult<Candidate>[] = Array.from(files).map(f => ({
      filename: f.name,
      status: 'pending',
      _file: f
    } as any));
    setResumeFiles(prev => [...prev, ...newFiles]);
  };

  const handleAddJD = () => {
    if (!jdInput.trim()) return;
    const lines = jdInput.trim().split(/\n{3,}/);
    const newJDs: ParseResult<Job>[] = lines.map((text, i) => ({
      filename: `JD-${Date.now()}-${i + 1}`,
      status: 'pending',
      _text: text.trim()
    } as any));
    setJdTexts(prev => [...prev, ...newJDs]);
    setJdInput('');
  };

  const processAll = async () => {
    setRunning(true);

    // Parse resumes
    const pendingResumes = resumeFiles.filter(r => r.status === 'pending');
    for (const item of pendingResumes) {
      setResumeFiles(prev => prev.map(r => r.filename === item.filename ? { ...r, status: 'parsing' } : r));
      try {
        const file = (item as any)._file as File;
        const base64 = await toBase64(file);
        const res = await fetch('/api/parse-resume', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({ base64, mimeType: file.type || 'application/pdf', filename: file.name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Parse failed');
        setResumeFiles(prev => prev.map(r =>
          r.filename === item.filename ? { ...r, status: 'done', result: data.candidate } : r
        ));
      } catch (e: any) {
        setResumeFiles(prev => prev.map(r =>
          r.filename === item.filename ? { ...r, status: 'error', error: e.message } : r
        ));
      }
    }

    // Parse JDs
    const pendingJDs = jdTexts.filter(j => j.status === 'pending');
    for (const item of pendingJDs) {
      setJdTexts(prev => prev.map(j => j.filename === item.filename ? { ...j, status: 'parsing' } : j));
      try {
        const parsed = await aiService.parseJobDescription({ text: (item as any)._text });
        const job: Job = {
          title: 'Untitled Role', level: 'Unknown', location: 'Unknown',
          remote_policy: 'unknown',
          comp_range: { min: 'unknown', max: 'unknown', currency: 'USD' },
          must_haves: [], dealbreakers: [], urgency: { score_1_to_5: 3, reasons: [] },
          ...parsed as Partial<Job>,
          job_id: `REQ-${Math.floor(Math.random() * 90000) + 10000}`,
          recruiter_owner: { name: 'Bulk Ingest', team: 'Command Intelligence' }
        };
        setJdTexts(prev => prev.map(j =>
          j.filename === item.filename ? { ...j, status: 'done', result: job } : j
        ));
      } catch (e: any) {
        setJdTexts(prev => prev.map(j =>
          j.filename === item.filename ? { ...j, status: 'error', error: e.message } : j
        ));
      }
    }
    setRunning(false);
  };

  const handleAddAll = () => {
    const newCandidates = resumeFiles.filter(r => r.status === 'done' && r.result).map(r => r.result!);
    const newJobs = jdTexts.filter(j => j.status === 'done' && j.result).map(j => j.result!);
    if (newCandidates.length) onAddCandidates(newCandidates);
    if (newJobs.length) onAddJobs(newJobs);
    setResumeFiles([]);
    setJdTexts([]);
    onClose();
  };

  const hasPending = resumeFiles.some(r => r.status === 'pending') || jdTexts.some(j => j.status === 'pending');
  const doneCount = resumeFiles.filter(r => r.status === 'done').length + jdTexts.filter(j => j.status === 'done').length;
  const totalCount = resumeFiles.length + jdTexts.length;

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'parsing') return <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />;
    if (status === 'done') return <svg className="w-4 h-4 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>;
    if (status === 'error') return <svg className="w-4 h-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>;
    return <div className="w-4 h-4 rounded-full bg-slate-200 flex-shrink-0" />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-xl" onClick={onClose} />
      <div className="relative bg-white w-full max-w-3xl rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Bulk Upload</h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">
              Drop resumes + paste JDs — Gemini parses everything
            </p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-8">
          {/* Resumes section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                Resumes ({resumeFiles.length})
              </h3>
              <button
                onClick={() => resumeInputRef.current?.click()}
                className="text-xs font-black text-orange-600 hover:text-orange-800 transition-colors"
              >
                + Add Files
              </button>
              <input
                ref={resumeInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={e => e.target.files && handleResumeFiles(e.target.files)}
              />
            </div>

            <div
              onDragOver={e => { e.preventDefault(); setResumeDrag(true); }}
              onDragLeave={() => setResumeDrag(false)}
              onDrop={e => { e.preventDefault(); setResumeDrag(false); handleResumeFiles(e.dataTransfer.files); }}
              onClick={() => resumeInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all mb-4 ${
                resumeDrag ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300'
              }`}
            >
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Drop PDF/DOCX resumes here</p>
            </div>

            {resumeFiles.length > 0 && (
              <div className="space-y-2">
                {resumeFiles.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    r.status === 'done' ? 'bg-green-50 border-green-200' :
                    r.status === 'error' ? 'bg-red-50 border-red-200' :
                    r.status === 'parsing' ? 'bg-orange-50 border-orange-200' :
                    'bg-slate-50 border-slate-200'
                  }`}>
                    <StatusIcon status={r.status} />
                    <span className="text-xs font-bold text-slate-700 flex-1 truncate">{r.filename}</span>
                    {r.result && <span className="text-xs font-black text-green-700">{r.result.name}</span>}
                    {r.error && <span className="text-xs text-red-500">{r.error}</span>}
                    <button onClick={() => setResumeFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-slate-500">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* JD section */}
          <div>
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Job Descriptions ({jdTexts.length})
            </h3>
            <div className="space-y-3">
              <textarea
                value={jdInput}
                onChange={e => setJdInput(e.target.value)}
                placeholder={`Paste job description(s) here.\n\nSeparate multiple JDs with 3+ blank lines.`}
                className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none focus:border-orange-500 outline-none transition-all font-medium"
              />
              <button
                onClick={handleAddJD}
                disabled={!jdInput.trim()}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  jdInput.trim() ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                Queue JD(s)
              </button>
            </div>
            {jdTexts.length > 0 && (
              <div className="mt-4 space-y-2">
                {jdTexts.map((j, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    j.status === 'done' ? 'bg-green-50 border-green-200' :
                    j.status === 'error' ? 'bg-red-50 border-red-200' :
                    j.status === 'parsing' ? 'bg-orange-50 border-orange-200' :
                    'bg-slate-50 border-slate-200'
                  }`}>
                    <StatusIcon status={j.status} />
                    <span className="text-xs font-bold text-slate-700 flex-1">{j.filename}</span>
                    {j.result && <span className="text-xs font-black text-green-700">{j.result.title}</span>}
                    {j.error && <span className="text-xs text-red-500">{j.error}</span>}
                    <button onClick={() => setJdTexts(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-slate-500">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-10 py-8 bg-slate-900 flex items-center justify-between flex-shrink-0">
          <div className="text-xs font-medium text-slate-400">
            {totalCount > 0 && `${doneCount} / ${totalCount} parsed`}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
              Cancel
            </button>
            {hasPending && !running && (
              <button
                onClick={processAll}
                disabled={totalCount === 0}
                className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                  totalCount > 0 ? 'bg-orange-600 text-white hover:scale-105' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                Parse All
              </button>
            )}
            {running && (
              <div className="flex items-center gap-2 px-8 py-3 bg-orange-600/20 rounded-2xl">
                <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black text-orange-400 uppercase tracking-widest">Parsing...</span>
              </div>
            )}
            {doneCount > 0 && !running && (
              <button
                onClick={handleAddAll}
                className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-green-600 text-white hover:scale-105 transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Add {doneCount} to Vault
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkUploadModal;
