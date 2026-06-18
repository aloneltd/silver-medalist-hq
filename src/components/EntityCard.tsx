import React from 'react';
import type { Job, Candidate } from '../types';

interface Props {
  data: Job | Candidate;
  type: 'job' | 'candidate';
  onDelete?: () => void;
}

const EntityCard: React.FC<Props> = ({ data, type, onDelete }) => {
  const isJob = type === 'job';
  const job = data as Job;
  const cand = data as Candidate;

  const dealbreakers = isJob ? job.dealbreakers : cand.dealbreakers;
  const location = isJob ? job.location : cand.locations.join(', ');
  const title = isJob ? job.title : cand.name;
  const id = isJob ? job.job_id : cand.candidate_id;
  const isMedalist = !isJob && cand.silver_medalist.is_true;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:ring-2 hover:ring-orange-500/20 transition-all cursor-default group">
      <div className={`h-1.5 ${isJob ? 'bg-orange-500' : isMedalist ? 'bg-amber-500' : 'bg-blue-500'} group-hover:h-2 transition-all`}></div>
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-slate-900 leading-tight tracking-tight truncate">{title}</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{id}</p>
          </div>
          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
            {isMedalist && (
              <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600">
                🥈 Silver
              </span>
            )}
            <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
              isJob ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
            }`}>
              {isJob ? job.level : cand.current_stage}
            </span>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
            <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <span className="truncate">{location}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
            <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
            </svg>
            <span className="font-mono">
              {isJob
                ? `${typeof job.comp_range.min === 'number' ? '$' + job.comp_range.min.toLocaleString() : 'N/A'}–${typeof job.comp_range.max === 'number' ? '$' + job.comp_range.max.toLocaleString() : 'N/A'} ${job.comp_range.currency}`
                : `${typeof cand.comp_expectation.min === 'number' ? '$' + cand.comp_expectation.min.toLocaleString() : 'N/A'}+ ${cand.comp_expectation.currency}`}
            </span>
          </div>
        </div>

        {!isJob && cand.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {cand.skills.slice(0, 4).map((skill, idx) => (
              <span key={idx} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                {skill}
              </span>
            ))}
            {cand.skills.length > 4 && (
              <span className="text-xs text-slate-400 font-medium">+{cand.skills.length - 4}</span>
            )}
          </div>
        )}

        {isJob && job.must_haves.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {job.must_haves.slice(0, 3).map((skill, idx) => (
              <span key={idx} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-medium">
                {skill}
              </span>
            ))}
            {job.must_haves.length > 3 && (
              <span className="text-xs text-slate-400 font-medium">+{job.must_haves.length - 3}</span>
            )}
          </div>
        )}

        {dealbreakers.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 rounded-2xl border border-red-100">
            <h4 className="text-xs uppercase font-black text-red-600 mb-1.5 tracking-widest flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
              Dealbreakers
            </h4>
            <div className="flex flex-wrap gap-1">
              {dealbreakers.map((db, idx) => (
                <span key={idx} className="bg-white text-red-700 text-xs font-bold px-2 py-0.5 rounded-md border border-red-200">
                  {db}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-black">
              {data.recruiter_owner.name.split(' ').map(n => n[0]).join('')}
            </div>
            <span className="text-xs text-slate-500 font-black uppercase tracking-tighter">{data.recruiter_owner.name}</span>
          </div>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-xs text-slate-300 hover:text-red-500 transition-colors font-medium"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EntityCard;
