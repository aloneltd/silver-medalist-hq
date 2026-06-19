import React, { useState, useRef } from 'react';
import type { Candidate } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddCandidate: (candidate: Candidate) => void;
  accessToken: string | null;
}

type Tab = 'manual' | 'resume';

const AddCandidateModal: React.FC<Props> = ({ isOpen, onClose, onAddCandidate, accessToken }) => {
  const [tab, setTab] = useState<Tab>('resume');
  const [form, setForm] = useState({
    name: '', current_stage: 'Active', location: '', remote_preference: 'flexible',
    skills: '', compMin: '', compMax: '', availability: 'Immediate',
    isSilverMedalist: false, previousRoleId: '', whyNotSelected: '', strengths: '',
    recruiterName: '', recruiterTeam: '', dealbreakers: '',
  });

  // Resume upload state
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Candidate | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-orange-500 focus:bg-white outline-none transition-all";
  const labelClass = "block text-xs font-black text-slate-400 uppercase tracking-widest mb-2";

  const resetAll = () => {
    setTab('resume');
    setFile(null);
    setParsed(null);
    setParseError(null);
    setParsing(false);
    setForm({
      name: '', current_stage: 'Active', location: '', remote_preference: 'flexible',
      skills: '', compMin: '', compMax: '', availability: 'Immediate',
      isSilverMedalist: false, previousRoleId: '', whyNotSelected: '', strengths: '',
      recruiterName: '', recruiterTeam: '', dealbreakers: ''
    });
  };

  const handleClose = () => { resetAll(); onClose(); };

  const toBase64 = (f: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });

  const handleParseResume = async (f: File) => {
    setParsing(true);
    setParseError(null);
    setParsed(null);
    try {
      const base64 = await toBase64(f);
      const mimeType = f.type || 'application/pdf';
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({ base64, mimeType, filename: f.name })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');
      setParsed(data.candidate);
    } catch (e: any) {
      setParseError(e.message || 'Resume parsing failed');
    } finally {
      setParsing(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) { setFile(dropped); handleParseResume(dropped); }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) { setFile(picked); handleParseResume(picked); }
  };

  const handleAddParsed = () => {
    if (!parsed) return;
    onAddCandidate(parsed);
    handleClose();
  };

  const handleManualSubmit = () => {
    if (!form.name.trim()) return;
    const candidate: Candidate = {
      candidate_id: `TALENT-${Math.floor(Math.random() * 90000) + 10000}`,
      name: form.name,
      current_stage: form.isSilverMedalist ? 'Silver Medalist' : form.current_stage,
      availability: { start_date: form.availability || 'Unknown', status: 'active' },
      locations: form.location ? form.location.split(',').map(s => s.trim()) : [],
      remote_preference: form.remote_preference,
      comp_expectation: {
        min: form.compMin ? parseInt(form.compMin) : 'unknown',
        max: form.compMax ? parseInt(form.compMax) : 'unknown',
        currency: 'USD'
      },
      skills: form.skills ? form.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
      silver_medalist: {
        is_true: form.isSilverMedalist,
        previous_role_id: form.previousRoleId || '',
        why_not_selected: form.whyNotSelected ? form.whyNotSelected.split(',').map(s => s.trim()).filter(Boolean) : [],
        strengths: form.strengths ? form.strengths.split(',').map(s => s.trim()).filter(Boolean) : [],
        endorsements: []
      },
      dealbreakers: form.dealbreakers ? form.dealbreakers.split(',').map(s => s.trim()).filter(Boolean) : [],
      recruiter_owner: { name: form.recruiterName || 'Unassigned', team: form.recruiterTeam || 'Talent Team' }
    };
    onAddCandidate(candidate);
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-xl" onClick={handleClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Add Candidate</h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Upload a resume or fill in manually</p>
          </div>
          <button onClick={handleClose} className="w-10 h-10 rounded-full hover:bg-slate-200 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50">
          {(['resume', 'manual'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all ${
                tab === t
                  ? 'text-orange-600 border-b-2 border-orange-500 bg-white'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'resume' ? '📄 Parse Resume' : '✍️ Manual Entry'}
            </button>
          ))}
        </div>

        {/* Resume Tab */}
        {tab === 'resume' && (
          <div className="p-10 overflow-y-auto flex-1">
            {!file && (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300 hover:bg-slate-50'
                }`}
              >
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileInput} />
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                </svg>
                <p className="text-sm font-black text-slate-700 mb-1">Drop resume here or click to upload</p>
                <p className="text-xs text-slate-400 font-medium">PDF, DOC, DOCX — Gemini AI extracts everything</p>
              </div>
            )}

            {file && parsing && (
              <div className="text-center py-16">
                <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Parsing resume...</p>
                <p className="text-xs text-slate-400 mt-2">{file.name}</p>
              </div>
            )}

            {parseError && (
              <div className="space-y-4">
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">{parseError}</div>
                <button onClick={() => { setFile(null); setParseError(null); }} className="w-full py-3 bg-slate-100 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200 transition-all">
                  Try Again
                </button>
              </div>
            )}

            {parsed && !parsing && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl">
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                  <div>
                    <p className="text-sm font-black text-green-800">Resume parsed successfully</p>
                    <p className="text-xs text-green-600">{file?.name}</p>
                  </div>
                  <button onClick={() => { setFile(null); setParsed(null); }} className="ml-auto text-green-500 hover:text-green-700 text-xs font-bold underline">
                    Re-upload
                  </button>
                </div>

                <div className="p-6 bg-slate-50 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-slate-900">{parsed.name}</h3>
                    <span className="text-xs bg-orange-100 text-orange-700 font-black px-2 py-1 rounded-lg">{parsed.candidate_id}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {parsed.skills.slice(0, 8).map(s => (
                      <span key={s} className="text-xs bg-slate-200 text-slate-700 font-bold px-2 py-1 rounded-lg">{s}</span>
                    ))}
                    {parsed.skills.length > 8 && (
                      <span className="text-xs text-slate-400 font-bold">+{parsed.skills.length - 8} more</span>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-slate-500 font-medium">
                    <span>{parsed.locations.join(', ') || 'No location'}</span>
                    <span>·</span>
                    <span>{parsed.remote_preference}</span>
                    {(parsed.comp_expectation.min !== 'unknown' && parsed.comp_expectation.min !== 0) && (
                      <>
                        <span>·</span>
                        <span>${(parsed.comp_expectation.min as number).toLocaleString()} – ${(parsed.comp_expectation.max as number).toLocaleString()}</span>
                      </>
                    )}
                  </div>
                  {parsed.silver_medalist.strengths.length > 0 && (
                    <div className="text-xs text-slate-500">
                      <span className="font-black text-slate-700">Strengths: </span>
                      {parsed.silver_medalist.strengths.join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual Tab */}
        {tab === 'manual' && (
          <div className="p-10 overflow-y-auto flex-1 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Full Name *</label>
                <input className={inputClass} placeholder="Jane Smith" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
              </div>
              <div>
                <label className={labelClass}>Availability</label>
                <input className={inputClass} placeholder="Immediate / 2 weeks" value={form.availability} onChange={e => setForm(f => ({...f, availability: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Location(s)</label>
                <input className={inputClass} placeholder="New York, NY" value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} />
              </div>
              <div>
                <label className={labelClass}>Remote Preference</label>
                <select className={inputClass} value={form.remote_preference} onChange={e => setForm(f => ({...f, remote_preference: e.target.value}))}>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-Site</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Skills (comma-separated)</label>
              <input className={inputClass} placeholder="TypeScript, React, System Design" value={form.skills} onChange={e => setForm(f => ({...f, skills: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Comp Min (USD)</label>
                <input className={inputClass} type="number" placeholder="150000" value={form.compMin} onChange={e => setForm(f => ({...f, compMin: e.target.value}))} />
              </div>
              <div>
                <label className={labelClass}>Comp Max (USD)</label>
                <input className={inputClass} type="number" placeholder="200000" value={form.compMax} onChange={e => setForm(f => ({...f, compMax: e.target.value}))} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Dealbreakers</label>
              <input className={inputClass} placeholder="No relocation, Needs senior title" value={form.dealbreakers} onChange={e => setForm(f => ({...f, dealbreakers: e.target.value}))} />
            </div>
            <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-2xl">
              <label className="flex items-center gap-4 cursor-pointer">
                <div onClick={() => setForm(f => ({...f, isSilverMedalist: !f.isSilverMedalist}))}
                  className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${form.isSilverMedalist ? 'bg-amber-500' : 'bg-slate-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isSilverMedalist ? 'translate-x-6' : ''}`} />
                </div>
                <div>
                  <div className="text-sm font-black text-slate-900">🥈 Silver Medalist</div>
                  <div className="text-xs text-slate-500">Runner-up for a previous role</div>
                </div>
              </label>
              {form.isSilverMedalist && (
                <div className="mt-4 space-y-3">
                  <input className={inputClass} placeholder="Previous Role ID (REQ-880)" value={form.previousRoleId} onChange={e => setForm(f => ({...f, previousRoleId: e.target.value}))} />
                  <input className={inputClass} placeholder="Why not selected (comma-separated)" value={form.whyNotSelected} onChange={e => setForm(f => ({...f, whyNotSelected: e.target.value}))} />
                  <input className={inputClass} placeholder="Strengths (comma-separated)" value={form.strengths} onChange={e => setForm(f => ({...f, strengths: e.target.value}))} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Recruiter Name</label>
                <input className={inputClass} placeholder="Sarah Miller" value={form.recruiterName} onChange={e => setForm(f => ({...f, recruiterName: e.target.value}))} />
              </div>
              <div>
                <label className={labelClass}>Team</label>
                <input className={inputClass} placeholder="Engineering Talent" value={form.recruiterTeam} onChange={e => setForm(f => ({...f, recruiterTeam: e.target.value}))} />
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-10 py-8 bg-slate-900 flex justify-between items-center flex-shrink-0">
          <button onClick={handleClose} className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
            Cancel
          </button>
          {tab === 'resume' ? (
            <button
              onClick={handleAddParsed}
              disabled={!parsed}
              className={`px-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all ${
                !parsed ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-orange-600 text-white hover:scale-105'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Add to Vault
            </button>
          ) : (
            <button
              onClick={handleManualSubmit}
              disabled={!form.name.trim()}
              className={`px-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all ${
                !form.name.trim() ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-orange-600 text-white hover:scale-105'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Add Candidate
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddCandidateModal;
