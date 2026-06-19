import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { MatchingInput, MatchResponse, BridgeType, Candidate, Job } from './types';
import { DEFAULT_CONFIG } from './constants';
import { AIService } from './services/aiService';
import { dataService } from './services/dataService';
import { driveService } from './services/driveService';
import { useAuth } from './contexts/AuthContext';
import AuthGate from './components/AuthGate';
import DashboardHeader from './components/DashboardHeader';
import MatchCard from './components/MatchCard';
import EntityCard from './components/EntityCard';
import SettingsPanel from './components/SettingsPanel';
import JobIngestionModal from './components/JobIngestionModal';
import AddCandidateModal from './components/AddCandidateModal';
import BulkUploadModal from './components/BulkUploadModal';
import EmailDraftModal from './components/EmailDraftModal';

type ActiveTab = 'board' | 'vault' | 'candidates' | 'analytics' | 'settings';

const aiService = new AIService();

function AppInner() {
  const { user, accessToken, signOut } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [activeBridge, setActiveBridge] = useState<BridgeType>(DEFAULT_CONFIG.activeBridge);
  const [results, setResults] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [driveLoading, setDriveLoading] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState<{ candidateName: string; jobTitle: string; strategy: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [droppedIds, setDroppedIds] = useState<Set<string>>(new Set());

  // Load from Drive on auth
  useEffect(() => {
    if (!accessToken) return;
    setDriveLoading(true);
    driveService.setToken(accessToken);
    driveService.loadAll()
      .then(({ jobs: dJobs, candidates: dCandidates, matches: dMatches }) => {
        if (dJobs.length || dCandidates.length) {
          // Drive has data — use it
          setJobs(dJobs);
          setCandidates(dCandidates);
          if (dMatches) setResults(dMatches);
          dataService.saveJobs(dJobs);
          dataService.saveCandidates(dCandidates);
        } else {
          // Drive empty — fall back to localStorage, seed if empty
          dataService.init();
          setJobs(dataService.getJobs());
          setCandidates(dataService.getCandidates());
          const saved = dataService.getMatches();
          if (saved) setResults(saved);
        }
      })
      .catch(() => {
        setDriveError('Could not load from Drive — using local data');
        dataService.init();
        setJobs(dataService.getJobs());
        setCandidates(dataService.getCandidates());
        const saved = dataService.getMatches();
        if (saved) setResults(saved);
      })
      .finally(() => setDriveLoading(false));
  }, [accessToken]);

  const syncToDrive = useCallback((j: Job[], c: Candidate[], m: MatchResponse | null) => {
    if (!accessToken) return;
    driveService.writeJSON('jobs.json', j);
    driveService.writeJSON('candidates.json', c);
    if (m) driveService.writeJSON('matches.json', m);
  }, [accessToken]);

  const handleSync = useCallback(async (currentJobs?: Job[], currentCandidates?: Candidate[]) => {
    const j = currentJobs ?? jobs;
    const c = currentCandidates ?? candidates;
    if (!j.length && !c.length) return;
    setLoading(true);
    setError(null);
    try {
      const input: MatchingInput = {
        activeBridge,
        jobs: j,
        candidates: c,
        config: { match_threshold: 75, today: new Date().toISOString(), org_size: 70000 }
      };
      const res = await aiService.runMatch(input);
      setResults(res);
      dataService.saveMatches(res);
      syncToDrive(j, c, res);
    } catch (e: any) {
      setError(e.message || 'Match engine error — check your GEMINI_API_KEY is set in Vercel.');
    } finally {
      setLoading(false);
    }
  }, [jobs, candidates, activeBridge, syncToDrive]);

  const handleAddJob = (newJob: Job) => {
    dataService.addJob(newJob);
    const updated = dataService.getJobs();
    setJobs(updated);
    syncToDrive(updated, candidates, results);
  };

  const handleAddJobs = (newJobs: Job[]) => {
    newJobs.forEach(j => dataService.addJob(j));
    const updated = dataService.getJobs();
    setJobs(updated);
    syncToDrive(updated, candidates, results);
  };

  const handleAddCandidate = (newCandidate: Candidate) => {
    dataService.addCandidate(newCandidate);
    const updated = dataService.getCandidates();
    setCandidates(updated);
    syncToDrive(jobs, updated, results);
  };

  const handleAddCandidates = (newCandidates: Candidate[]) => {
    newCandidates.forEach(c => dataService.addCandidate(c));
    const updated = dataService.getCandidates();
    setCandidates(updated);
    syncToDrive(jobs, updated, results);
  };

  const handleDeleteJob = (job_id: string) => {
    dataService.deleteJob(job_id);
    const updated = dataService.getJobs();
    setJobs(updated);
    syncToDrive(updated, candidates, results);
  };

  const handleDeleteCandidate = (candidate_id: string) => {
    dataService.deleteCandidate(candidate_id);
    const updated = dataService.getCandidates();
    setCandidates(updated);
    syncToDrive(jobs, updated, results);
  };

  const handleDropCandidate = (candidateId: string, jobId: string) => {
    setDroppedIds(prev => new Set([...prev, `${candidateId}::${jobId}`]));
  };

  const handleClearData = () => {
    dataService.clearAll();
    dataService.init();
    setJobs(dataService.getJobs());
    setCandidates(dataService.getCandidates());
    setResults(null);
    setDroppedIds(new Set());
    syncToDrive(dataService.getJobs(), dataService.getCandidates(), null);
  };

  const validMatches = useMemo(() => {
    if (!results || !Array.isArray(results.matches)) return [];
    return results.matches.filter(m =>
      !droppedIds.has(`${m.candidate_id}::${m.job_id}`) &&
      jobs.some(j => j.job_id === m.job_id) &&
      candidates.some(c => c.candidate_id === m.candidate_id)
    );
  }, [results, jobs, candidates, droppedIds]);

  const medalists = useMemo(() => candidates.filter(c => c.silver_medalist.is_true), [candidates]);

  const filteredJobs = useMemo(() => {
    if (!searchQuery) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(j => j.title.toLowerCase().includes(q) || j.location.toLowerCase().includes(q));
  }, [jobs, searchQuery]);

  const filteredCandidates = useMemo(() => {
    if (!searchQuery) return candidates;
    const q = searchQuery.toLowerCase();
    return candidates.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.skills.some(s => s.toLowerCase().includes(q)) ||
      c.locations.some(l => l.toLowerCase().includes(q))
    );
  }, [candidates, searchQuery]);

  const exportMatchesCSV = () => {
    if (!results?.matches.length) return;
    const headers = ['Job ID', 'Job Title', 'Candidate ID', 'Candidate Name', 'Match Score', 'Strategy', 'Tech Risk', 'Culture Risk', 'Comp Risk', 'Timing Risk'];
    const rows = validMatches.map(m => {
      const job = jobs.find(j => j.job_id === m.job_id);
      const cand = candidates.find(c => c.candidate_id === m.candidate_id);
      return [
        m.job_id, job?.title || '', m.candidate_id, cand?.name || '',
        m.match_score, m.redeployment_strategy,
        m.risk_heatmap.tech, m.risk_heatmap.culture, m.risk_heatmap.comp, m.risk_heatmap.timing
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `silver-matches-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'board', label: 'War Board' },
    { id: 'vault', label: 'Jobs Vault' },
    { id: 'candidates', label: 'Silver Vault' },
    { id: 'analytics', label: 'ROI Analytics' },
    { id: 'settings', label: 'Command Center' },
  ];

  if (driveLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading from Drive...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0f172a] text-white flex flex-col sticky top-0 h-screen shadow-2xl z-50 flex-shrink-0">
        <div className="p-8 border-b border-slate-800">
          <h1 className="text-xl font-black tracking-tighter uppercase italic leading-none">
            Silver <span className="text-orange-500">HQ</span>
          </h1>
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mt-2">Enterprise Talent Mesh</p>
        </div>

        <div className="px-4 pt-6 space-y-2">
          <button
            onClick={() => setIsIngestModalOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 mb-1 rounded-2xl bg-orange-600 text-white shadow-xl shadow-orange-900/40 text-xs font-black uppercase tracking-widest hover:scale-[1.02] transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
            Ingest JD
          </button>
          <button
            onClick={() => setIsAddCandidateOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-700 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-600 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Add Candidate
          </button>
          <button
            onClick={() => setIsBulkUploadOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 mb-4 rounded-2xl bg-slate-800 border border-slate-600 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-2.18c.07-.44.18-.88.18-1.34C18 2.54 15.46 1 13 1c-1.36 0-2.5.56-3.41 1.41L8 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM9.42 3.55C10.1 2.86 11 2.5 13 2.5c1.88 0 3.5 1.12 3.5 2.16 0 .39-.09.74-.2 1.08L9 4.18l.42-.63zM20 18H4V6h4l1.09 1.09L10.18 8H20v10z"/></svg>
            Bulk Upload
          </button>

          <div className="h-px bg-slate-800 mx-2 mb-2" />

          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all text-xs font-black uppercase tracking-widest ${
                activeTab === item.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${activeTab === item.id ? 'bg-orange-500' : 'bg-slate-700'}`} />
              {item.label}
              {item.id === 'candidates' && medalists.length > 0 && (
                <span className="ml-auto text-xs font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                  {medalists.length}🥈
                </span>
              )}
            </button>
          ))}
        </div>

        {/* User + Drive status */}
        <div className="mt-auto p-6 border-t border-slate-800 space-y-3">
          {driveError && (
            <div className="text-xs text-amber-400 bg-amber-400/10 rounded-xl px-3 py-2 font-medium">{driveError}</div>
          )}
          <div className="bg-slate-800/50 p-4 rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-xs font-black text-white">
                  {user?.name?.[0] || 'M'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-black text-white truncate">{user?.name || 'Mark'}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-xs text-slate-500 font-medium">Drive synced</span>
                </div>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-full text-xs font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest text-left"
            >
              Sign Out
            </button>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-600 font-medium">{jobs.length} jobs · {candidates.length} candidates</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader
          summary={results?.summary}
          loading={loading}
          onSync={() => handleSync()}
        />

        {results && activeTab !== 'settings' && (
          <div className="bg-white px-8 py-4 flex items-center justify-between border-b border-slate-200 shadow-sm">
            <div className="flex items-center gap-10">
              <div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Projected Savings</div>
                <div className="text-2xl font-black text-slate-900 font-mono tracking-tighter">
                  ${(results.summary.estimated_savings_usd || 0).toLocaleString()}
                </div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Matches Found</div>
                <div className="text-2xl font-black text-orange-600">{validMatches.length}</div>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Silver Medalists</div>
                <div className="text-2xl font-black text-amber-600">{results.summary.medalist_redeployment_count || medalists.length}</div>
              </div>
              {droppedIds.size > 0 && (
                <>
                  <div className="h-8 w-px bg-slate-200" />
                  <div>
                    <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Dropped</div>
                    <div className="text-2xl font-black text-slate-400">{droppedIds.size}</div>
                  </div>
                </>
              )}
              {validMatches.length > 0 && (
                <>
                  <div className="h-8 w-px bg-slate-200" />
                  <button
                    onClick={exportMatchesCSV}
                    className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest hover:text-orange-600 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                    Export CSV
                  </button>
                </>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-4 py-2.5 bg-slate-100 rounded-2xl border-none text-sm w-64 focus:ring-2 focus:ring-orange-500 transition-all outline-none"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-8 mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-8">
          {loading && activeTab === 'board' ? (
            <div className="flex flex-col items-center justify-center py-48">
              <svg className="animate-spin w-16 h-16 text-orange-500 mb-6" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Running Match Engine...</h3>
              <p className="text-xs text-slate-400 mt-2">Gemini 2.5 Flash is analyzing {jobs.length} jobs × {candidates.length} candidates</p>
            </div>
          ) : (
            <>
              {/* WAR BOARD */}
              {activeTab === 'board' && (
                <div className="flex gap-8 overflow-x-auto pb-10 no-scrollbar items-start">
                  <div className="flex-shrink-0 w-80">
                    <div className="flex items-center justify-between mb-6 px-1">
                      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        Silver Medalists
                      </h3>
                      <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{medalists.length}</span>
                    </div>
                    <div className="space-y-4">
                      {medalists.length === 0 ? (
                        <div className="h-32 border-2 border-dashed border-slate-300 rounded-3xl flex items-center justify-center text-center p-6">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No silver medalists yet</p>
                        </div>
                      ) : medalists.map(c => <EntityCard key={c.candidate_id} data={c} type="candidate" />)}
                    </div>
                  </div>

                  <div className="flex-shrink-0 w-[560px] bg-slate-200/30 p-4 rounded-[2.5rem] min-h-[70vh]">
                    <div className="flex items-center justify-between mb-8 px-4">
                      <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-500" />
                        Strategy Pipeline
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-full">{validMatches.length} Targeted</span>
                        <button
                          onClick={() => handleSync()}
                          disabled={loading}
                          className="text-xs font-black text-slate-500 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-orange-500 hover:text-orange-600 transition-all disabled:opacity-50"
                        >
                          {loading ? 'Running...' : 'Re-run'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 px-2">
                      {validMatches.length > 0 ? validMatches.map((m, idx) => {
                        const job = jobs.find(j => j.job_id === m.job_id)!;
                        const cand = candidates.find(c => c.candidate_id === m.candidate_id)!;
                        if (!job || !cand) return null;
                        return (
                          <MatchCard
                            key={idx}
                            match={m}
                            job={job}
                            candidate={cand}
                            onDraftEmail={(name, title, strategy) => setEmailDraft({ candidateName: name, jobTitle: title, strategy })}
                            onDrop={() => handleDropCandidate(m.candidate_id, m.job_id)}
                          />
                        );
                      }) : (
                        <div className="text-center py-20 bg-white/50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
                          <svg className="w-12 h-12 text-slate-200 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
                          </svg>
                          <p className="text-xs text-slate-400 font-black uppercase tracking-widest">No Matches Generated</p>
                          <p className="text-xs text-slate-300 mt-1 uppercase font-bold">Click "Neural Sync & Match" to find matches</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 w-80">
                    <div className="flex items-center justify-between mb-6 px-1">
                      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                        Open Roles
                      </h3>
                      <span className="text-xs font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{jobs.length}</span>
                    </div>
                    <div className="space-y-4">
                      {jobs.slice(0, 5).map(j => <EntityCard key={j.job_id} data={j} type="job" />)}
                      {jobs.length === 0 && (
                        <div className="h-32 border-2 border-dashed border-slate-300 rounded-3xl flex items-center justify-center text-center p-6">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No jobs yet — ingest a JD</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* JOBS VAULT */}
              {activeTab === 'vault' && (
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Jobs Vault</h2>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">{filteredJobs.length} open roles</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsBulkUploadOpen(true)}
                        className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all"
                      >
                        Bulk Ingest
                      </button>
                      <button
                        onClick={() => setIsIngestModalOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all shadow-lg"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                        Add JD
                      </button>
                    </div>
                  </div>
                  {filteredJobs.length === 0 ? (
                    <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-200">
                      <svg className="w-16 h-16 text-slate-200 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
                      </svg>
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No jobs yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredJobs.map(j => <EntityCard key={j.job_id} data={j} type="job" onDelete={() => handleDeleteJob(j.job_id)} />)}
                    </div>
                  )}
                </div>
              )}

              {/* CANDIDATES VAULT */}
              {activeTab === 'candidates' && (
                <div>
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Silver Vault</h2>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {filteredCandidates.length} candidates · {medalists.length} silver medalists
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsBulkUploadOpen(true)}
                        className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-slate-700 transition-all"
                      >
                        Bulk Upload
                      </button>
                      <button
                        onClick={() => setIsAddCandidateOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:scale-105 transition-all shadow-lg"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                        Add Candidate
                      </button>
                    </div>
                  </div>
                  {filteredCandidates.length === 0 ? (
                    <div className="text-center py-32 bg-white rounded-[3rem] border border-slate-200">
                      <svg className="w-16 h-16 text-slate-200 mx-auto mb-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No candidates yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredCandidates.map(c => <EntityCard key={c.candidate_id} data={c} type="candidate" onDelete={() => handleDeleteCandidate(c.candidate_id)} />)}
                    </div>
                  )}
                </div>
              )}

              {/* ANALYTICS */}
              {activeTab === 'analytics' && (
                <div className="space-y-8">
                  <div className="bg-[#0f172a] text-white p-14 rounded-[4rem] shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-[120px]" />
                    <div className="relative z-10">
                      <h2 className="text-4xl font-black tracking-tighter mb-2 italic uppercase">Executive Mobility Hub</h2>
                      <p className="text-slate-400 text-lg font-medium mb-12">Track the financial impact of internal talent redeployment.</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {[
                          { label: 'Recruitment Savings', value: `$${(results?.summary.estimated_savings_usd || 0).toLocaleString()}`, color: 'text-green-400' },
                          { label: 'Active Matches', value: String(validMatches.length), color: 'text-orange-500' },
                          { label: 'Silver Medalists', value: String(medalists.length), color: 'text-amber-400' },
                          { label: 'Open Roles', value: String(jobs.length), color: 'text-blue-400' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="p-8 bg-white/5 rounded-3xl border border-white/10">
                            <div className={`text-4xl font-black ${color} mb-2`}>{value}</div>
                            <div className="text-xs font-black text-slate-500 uppercase tracking-widest">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {results?.broadcast && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-black text-orange-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />Hot Jobs
                        </h3>
                        <div className="space-y-3">
                          {results.broadcast.hot_jobs.map((hj, i) => {
                            const job = jobs.find(j => j.job_id === hj.id);
                            return (
                              <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl">
                                <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-orange-600" viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                </div>
                                <div>
                                  <div className="text-sm font-black text-slate-900">{job?.title || hj.id}</div>
                                  <div className="text-xs text-slate-400 mt-0.5">{hj.reason}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-black text-amber-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />Hot Candidates
                        </h3>
                        <div className="space-y-3">
                          {results.broadcast.hot_candidates.map((hc, i) => {
                            const cand = candidates.find(c => c.candidate_id === hc.id);
                            return (
                              <div key={i} className="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl">
                                <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black text-amber-600">
                                  {cand?.name.split(' ').map(n => n[0]).join('') || '??'}
                                </div>
                                <div>
                                  <div className="text-sm font-black text-slate-900">{cand?.name || hc.id}</div>
                                  <div className="text-xs text-slate-400 mt-0.5">{hc.reason}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SETTINGS */}
              {activeTab === 'settings' && (
                <SettingsPanel
                  activeBridge={activeBridge}
                  onBridgeChange={setActiveBridge}
                  rawJson={JSON.stringify({ jobs, candidates }, null, 2)}
                  onJsonChange={(val) => {
                    try {
                      const parsed = JSON.parse(val);
                      if (parsed.jobs) { dataService.saveJobs(parsed.jobs); setJobs(parsed.jobs); }
                      if (parsed.candidates) { dataService.saveCandidates(parsed.candidates); setCandidates(parsed.candidates); }
                    } catch {}
                  }}
                  onClearData={handleClearData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <JobIngestionModal isOpen={isIngestModalOpen} onClose={() => setIsIngestModalOpen(false)} onAddJob={handleAddJob} />
      <AddCandidateModal
        isOpen={isAddCandidateOpen}
        onClose={() => setIsAddCandidateOpen(false)}
        onAddCandidate={handleAddCandidate}
        accessToken={accessToken}
      />
      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onAddCandidates={handleAddCandidates}
        onAddJobs={handleAddJobs}
        accessToken={accessToken}
      />
      {emailDraft && (
        <EmailDraftModal
          isOpen={true}
          onClose={() => setEmailDraft(null)}
          candidateName={emailDraft.candidateName}
          jobTitle={emailDraft.jobTitle}
          strategy={emailDraft.strategy}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <AppInner />
    </AuthGate>
  );
}
