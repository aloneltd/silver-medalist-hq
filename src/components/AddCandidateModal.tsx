import React, { useState } from 'react';
import type { Candidate } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddCandidate: (candidate: Candidate) => void;
}

const AddCandidateModal: React.FC<Props> = ({ isOpen, onClose, onAddCandidate }) => {
  const [form, setForm] = useState({
    name: '',
    current_stage: 'Active',
    location: '',
    remote_preference: 'flexible',
    skills: '',
    compMin: '',
    compMax: '',
    availability: 'Immediate',
    isSilverMedalist: false,
    previousRoleId: '',
    whyNotSelected: '',
    strengths: '',
    recruiterName: '',
    recruiterTeam: '',
    dealbreakers: '',
  });

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!form.name.trim()) return;

    const candidate: Candidate = {
      candidate_id: `TALENT-${Math.floor(Math.random() * 90000) + 10000}`,
      name: form.name,
      current_stage: form.isSilverMedalist ? 'Silver Medalist' : form.current_stage,
      availability: {
        start_date: form.availability || 'Unknown',
        status: 'active'
      },
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
      recruiter_owner: {
        name: form.recruiterName || 'Unassigned',
        team: form.recruiterTeam || 'Talent Team'
      }
    };

    onAddCandidate(candidate);
    setForm({
      name: '', current_stage: 'Active', location: '', remote_preference: 'flexible',
      skills: '', compMin: '', compMax: '', availability: 'Immediate',
      isSilverMedalist: false, previousRoleId: '', whyNotSelected: '', strengths: '',
      recruiterName: '', recruiterTeam: '', dealbreakers: ''
    });
    onClose();
  };

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-orange-500 focus:bg-white outline-none transition-all";
  const labelClass = "block text-xs font-black text-slate-400 uppercase tracking-widest mb-2";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">Add Candidate</h2>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mt-1">Add a new candidate to the talent pool</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 transition-colors flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="p-10 overflow-y-auto space-y-6">
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
              <label className={labelClass}>Location(s) (comma-separated)</label>
              <input className={inputClass} placeholder="New York, NY, Remote" value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} />
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
            <label className={labelClass}>Dealbreakers (comma-separated)</label>
            <input className={inputClass} placeholder="No relocation, Needs senior title" value={form.dealbreakers} onChange={e => setForm(f => ({...f, dealbreakers: e.target.value}))} />
          </div>

          {/* Silver Medalist Toggle */}
          <div className="p-6 bg-amber-50 border-2 border-amber-200 rounded-2xl">
            <label className="flex items-center gap-4 cursor-pointer">
              <div
                onClick={() => setForm(f => ({...f, isSilverMedalist: !f.isSilverMedalist}))}
                className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${form.isSilverMedalist ? 'bg-amber-500' : 'bg-slate-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isSilverMedalist ? 'translate-x-6' : ''}`}></div>
              </div>
              <div>
                <div className="text-sm font-black text-slate-900">🥈 Silver Medalist</div>
                <div className="text-xs text-slate-500">This candidate was runner-up for a previous role</div>
              </div>
            </label>

            {form.isSilverMedalist && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className={labelClass}>Previous Role ID</label>
                  <input className={inputClass} placeholder="REQ-880" value={form.previousRoleId} onChange={e => setForm(f => ({...f, previousRoleId: e.target.value}))} />
                </div>
                <div>
                  <label className={labelClass}>Why Not Selected (comma-separated)</label>
                  <input className={inputClass} placeholder="HM wanted more experience, Comp gap" value={form.whyNotSelected} onChange={e => setForm(f => ({...f, whyNotSelected: e.target.value}))} />
                </div>
                <div>
                  <label className={labelClass}>Strengths (comma-separated)</label>
                  <input className={inputClass} placeholder="Strong technical skills, Team player" value={form.strengths} onChange={e => setForm(f => ({...f, strengths: e.target.value}))} />
                </div>
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

        <div className="px-10 py-8 bg-slate-900 flex justify-between items-center">
          <button onClick={onClose} className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-all">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim()}
            className={`px-10 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-3 transition-all ${
              !form.name.trim()
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:scale-105 active:scale-95'
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            Add Candidate
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddCandidateModal;
