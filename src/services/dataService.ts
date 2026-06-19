import type { Job, Candidate, MatchResponse } from '../types';
import { DEFAULT_CONFIG } from '../constants';

const JOBS_KEY = 'sm_jobs';
const CANDIDATES_KEY = 'sm_candidates';
const MATCHES_KEY = 'sm_matches';

function initIfEmpty<T>(key: string, defaultValue: T[]): void {
  if (!localStorage.getItem(key)) {
    localStorage.setItem(key, JSON.stringify(defaultValue));
  }
}

export const dataService = {
  init() {
    initIfEmpty(JOBS_KEY, DEFAULT_CONFIG.jobs);
    initIfEmpty(CANDIDATES_KEY, DEFAULT_CONFIG.candidates);
    initIfEmpty(MATCHES_KEY, []);
  },

  getJobs(): Job[] {
    try {
      return JSON.parse(localStorage.getItem(JOBS_KEY) || '[]');
    } catch {
      return [];
    }
  },

  saveJobs(jobs: Job[]): void {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  },

  addJob(job: Job): void {
    const jobs = this.getJobs();
    jobs.unshift(job);
    this.saveJobs(jobs);
  },

  deleteJob(job_id: string): void {
    const jobs = this.getJobs().filter(j => j.job_id !== job_id);
    this.saveJobs(jobs);
  },

  getCandidates(): Candidate[] {
    try {
      return JSON.parse(localStorage.getItem(CANDIDATES_KEY) || '[]');
    } catch {
      return [];
    }
  },

  saveCandidates(candidates: Candidate[]): void {
    localStorage.setItem(CANDIDATES_KEY, JSON.stringify(candidates));
  },

  addCandidate(candidate: Candidate): void {
    const candidates = this.getCandidates();
    candidates.unshift(candidate);
    this.saveCandidates(candidates);
  },

  deleteCandidate(candidate_id: string): void {
    const candidates = this.getCandidates().filter(c => c.candidate_id !== candidate_id);
    this.saveCandidates(candidates);
  },

  getMatches(): MatchResponse | null {
    try {
      const raw = localStorage.getItem(MATCHES_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Validate shape — must have a matches array
      if (!parsed || !Array.isArray(parsed.matches)) return null;
      return parsed as MatchResponse;
    } catch {
      return null;
    }
  },

  saveMatches(matches: MatchResponse): void {
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
  },

  clearAll(): void {
    localStorage.removeItem(JOBS_KEY);
    localStorage.removeItem(CANDIDATES_KEY);
    localStorage.removeItem(MATCHES_KEY);
  }
};
