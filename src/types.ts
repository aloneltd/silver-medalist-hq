
export type BridgeType = 'ATS' | 'Slack' | 'Gmail' | 'Outlook' | 'LinkedIn' | 'ChromeExtension' | 'Sheets';

export interface RecruiterOwner {
  name: string;
  team: string;
  avatar?: string;
}

export interface CompRange {
  min: number | 'unknown';
  max: number | 'unknown';
  currency: string | 'unknown';
}

export interface Job {
  job_id: string;
  title: string;
  level: string;
  location: string;
  remote_policy: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  comp_range: CompRange;
  must_haves: string[];
  dealbreakers: string[];
  urgency: { score_1_to_5: number; reasons: string[] };
  recruiter_owner: RecruiterOwner;
  skills_needed?: string[];
}

export interface Endorsement {
  recruiter_name: string;
  tag: string;
  sentiment: 'positive' | 'neutral';
}

export interface Candidate {
  candidate_id: string;
  name: string;
  current_stage: string;
  availability: { start_date: string; status: 'active' | 'passive' | 'unknown' };
  locations: string[];
  remote_preference: string;
  comp_expectation: CompRange;
  skills: string[];
  silver_medalist: {
    is_true: boolean;
    previous_role_id: string;
    why_not_selected: string[];
    strengths: string[];
    endorsements: Endorsement[];
    risk_factors?: string[];
  };
  dealbreakers: string[];
  recruiter_owner: RecruiterOwner;
}

export interface MatchingInput {
  activeBridge: BridgeType;
  jobs: Job[];
  candidates: Candidate[];
  config: {
    match_threshold: number;
    today: string;
    org_size: number;
  };
}

export interface MatchAction {
  type: 'slack_dm' | 'email_draft' | 'ats_update' | 'sheets_push' | 'trello_move';
  label: string;
  context: string;
  ai_pitch?: string;
}

export interface MatchResponse {
  summary: {
    matches_above_threshold: number;
    medalist_redeployment_count: number;
    security_audit_id: string;
    estimated_savings_usd: number;
  };
  matches: Array<{
    job_id: string;
    candidate_id: string;
    match_score: number;
    redeployment_strategy: string;
    next_actions: MatchAction[];
    risk_heatmap: { tech: number; culture: number; comp: number; timing: number };
  }>;
  broadcast: {
    hot_jobs: Array<{ id: string; reason: string }>;
    hot_candidates: Array<{ id: string; reason: string }>;
  };
}
