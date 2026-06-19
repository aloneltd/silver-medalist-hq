import React, { useState } from 'react';
import type { Job, Candidate } from '../types';

interface Props {
  match: any;
  job: Job;
  candidate: Candidate;
  onDraftEmail?: (candidateName: string, jobTitle: string, strategy: string) => void;
  onDrop?: () => void;
}

const MatchCard: React.FC<Props> = ({ match, job, candidate, onDraftEmail, onDrop }) => {
  const [showPitch, setShowPitch] = useState(false);
  const [activePitch, setActivePitch] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const openPitch = (pitch: string) => {
    setActivePitch(pitch);
    setShowPitch(true);
    setCopied(false);
  };

  const copyPitch = () => {
    if (activePitch) {
      navigator.clipboard.writeText(activePitch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const riskMap = match.risk_heatmap || { tech: 10, culture: 5, comp: 20, timing: 5 };

  const scoreColor = match.match_score >= 90 ? 'bg-green-500' : match.match_score >= 75 ? 'bg-orange-500' : 'bg-red-500';

  return (
    <div className="relative bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden transition-all hover:shadow-[0_40px_80px_rgba(0,0,0,0.12)] hover:-translate-y-1 group">
      {/* Score Badge */}
      <div className={`absolute top-6 right-6 ${scoreColor} text-white px-4 py-1.5 rounded-full text-xs font-black tracking-widest uppercase flex items-center gap-1.5 shadow-lg z-10`}>
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
        </svg>
        {match.match_score}% Match
      </div>

      <div className="p-8">
        {/* Candidate Header */}
        <div className="flex gap-5 mb-8 pr-28">
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center text-3xl font-black text-white shadow-xl">
              {candidate.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 bg-green-500 rounded-full border-4 border-white flex items-center justify-center">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter leading-none mb-1.5">{candidate.name}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">🥈 {candidate.current_stage}</span>
              <span className="text-slate-300">→</span>
              <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">{job.title}</span>
            </div>
          </div>
        </div>

        {/* Risk Heatmap */}
        <div className="mb-7 grid grid-cols-4 gap-3 bg-slate-50 p-5 rounded-[1.5rem] border border-slate-100">
          {Object.entries(riskMap).map(([key, val]: [string, any]) => {
            const pct = Math.min(100, Math.max(0, Number(val)));
            const color = pct > 60 ? 'bg-red-500' : pct > 30 ? 'bg-orange-500' : 'bg-green-500';
            return (
              <div key={key} className="text-center">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 capitalize">{key}</div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }}></div>
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1">{pct}</div>
              </div>
            );
          })}
        </div>

        {/* Strategy */}
        <div className="bg-[#0f172a] text-slate-300 rounded-[1.5rem] p-7 mb-7 relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="text-xs font-black uppercase text-orange-500 tracking-widest mb-3 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3C7.58 3 4 6.58 4 11c0 4.42 3.58 8 8 8s8-3.58 8-8c0-4.42-3.58-8-8-8zm1 14h-2v-2h2v2zm1.07-7.75l-.9.92C12.45 10.9 12 11.5 12 13h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H9c0-1.66 1.34-3 3-3s3 1.34 3 3c0 .66-.27 1.26-.93 1.75z"/>
              </svg>
              Redeployment Strategy
            </h4>
            <p className="text-base leading-relaxed font-medium text-slate-100 italic">
              "{match.redeployment_strategy}"
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 gap-3 mb-7">
          {match.next_actions?.slice(0, 3).map((action: any, i: number) => (
            <button
              key={i}
              onClick={() => action.ai_pitch && openPitch(action.ai_pitch)}
              className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-2xl text-left hover:border-orange-500 hover:bg-orange-50/30 transition-all group/btn shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover/btn:bg-slate-900 group-hover/btn:text-white transition-all flex-shrink-0">
                  {action.type === 'slack_dm' ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                  )}
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900 uppercase tracking-widest leading-none mb-1">{action.label}</div>
                  <div className="text-xs text-slate-400 font-medium leading-tight">{action.context}</div>
                </div>
              </div>
              {action.ai_pitch && (
                <svg className="w-4 h-4 text-slate-300 group-hover/btn:translate-x-1 transition-transform flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Actions row */}
        <div className="flex gap-3 mb-5">
          {onDraftEmail && (
            <button
              onClick={() => onDraftEmail(candidate.name, job.title, match.redeployment_strategy)}
              className="flex-1 py-3 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-black text-slate-400 uppercase tracking-widest hover:border-orange-400 hover:text-orange-500 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              Draft Email
            </button>
          )}
          {onDrop && (
            <button
              onClick={onDrop}
              title="Drop this match"
              className="px-4 py-3 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-black text-slate-400 uppercase tracking-widest hover:border-red-300 hover:text-red-400 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              Drop
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="pt-5 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-black">
              {candidate.recruiter_owner.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Owner</div>
              <div className="text-xs font-black text-slate-900">{candidate.recruiter_owner.name}</div>
            </div>
          </div>
          <div className="text-xs font-mono text-green-600 font-black">
            ~${(25000).toLocaleString()} saved
          </div>
        </div>
      </div>

      {/* Pitch Overlay */}
      {showPitch && (
        <div className="absolute inset-0 z-20 bg-slate-900/97 backdrop-blur-xl p-8 flex flex-col justify-center">
          <div className="flex justify-between items-start mb-6">
            <h4 className="text-orange-500 text-xs font-black uppercase tracking-widest">AI Pitch Generated</h4>
            <button onClick={() => setShowPitch(false)} className="text-white/50 hover:text-white p-1">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
          <div className="bg-white/10 p-7 rounded-2xl border border-white/10 mb-8 flex-1 overflow-y-auto">
            <p className="text-white text-base font-medium leading-relaxed italic">"{activePitch}"</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={copyPitch}
              className="flex-grow bg-white text-slate-900 text-xs font-black uppercase tracking-widest py-3.5 rounded-2xl flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchCard;
