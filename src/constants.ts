
import type { MatchingInput } from './types';

export const DEFAULT_CONFIG: MatchingInput = {
  activeBridge: 'LinkedIn',
  config: {
    match_threshold: 85,
    today: new Date().toISOString(),
    org_size: 70000
  },
  jobs: [
    {
      job_id: "REQ-991",
      title: "Senior Product Designer",
      level: "Senior",
      location: "New York, NY",
      remote_policy: "hybrid",
      comp_range: { min: 160000, max: 195000, currency: "USD" },
      must_haves: ["Figma", "Design Systems", "Prototyping"],
      dealbreakers: ["Must have Fintech experience"],
      urgency: { score_1_to_5: 5, reasons: ["Executive priority", "Previous hire fell through"] },
      recruiter_owner: { name: "Marcus Wright", team: "Product Talent" }
    },
    {
      job_id: "REQ-1042",
      title: "Staff Software Engineer",
      level: "Staff",
      location: "San Francisco, CA",
      remote_policy: "remote",
      comp_range: { min: 220000, max: 280000, currency: "USD" },
      must_haves: ["TypeScript", "System Design", "Go"],
      dealbreakers: ["No distributed systems experience"],
      urgency: { score_1_to_5: 4, reasons: ["Team scaling", "Q3 deliverable risk"] },
      recruiter_owner: { name: "Priya Patel", team: "Engineering Talent" }
    }
  ],
  candidates: [
    {
      candidate_id: "TALENT-402",
      name: "Elena Rossi",
      current_stage: "Silver Medalist",
      availability: { start_date: "Immediate", status: "active" },
      locations: ["New York, NY"],
      remote_preference: "flexible",
      comp_expectation: { min: 170000, max: 185000, currency: "USD" },
      skills: ["Figma", "Design Systems", "User Research", "Prototyping"],
      silver_medalist: {
        is_true: true,
        previous_role_id: "REQ-880",
        why_not_selected: ["Runner up for Principal role", "HM wanted more management experience"],
        strengths: ["World-class visual design", "Strong technical collaborator"],
        endorsements: [
          { recruiter_name: "Sarah Miller", tag: "Design Visionary", sentiment: "positive" },
          { recruiter_name: "Tom Chen", tag: "Process Specialist", sentiment: "positive" }
        ]
      },
      dealbreakers: ["Needs NYC proximity"],
      recruiter_owner: { name: "Sarah Miller", team: "Engineering Talent" }
    },
    {
      candidate_id: "TALENT-557",
      name: "James Okonkwo",
      current_stage: "Silver Medalist",
      availability: { start_date: "2 weeks", status: "active" },
      locations: ["San Francisco, CA", "Remote"],
      remote_preference: "remote",
      comp_expectation: { min: 230000, max: 270000, currency: "USD" },
      skills: ["TypeScript", "Go", "Kubernetes", "System Design", "Distributed Systems"],
      silver_medalist: {
        is_true: true,
        previous_role_id: "REQ-912",
        why_not_selected: ["Offer declined — comp gap of $15k", "HM chose internal candidate"],
        strengths: ["Deep distributed systems experience", "Exceptional system design skills"],
        endorsements: [
          { recruiter_name: "Marcus Wright", tag: "Technical Powerhouse", sentiment: "positive" }
        ],
        risk_factors: ["Was looking at competing offers"]
      },
      dealbreakers: ["No relocation required"],
      recruiter_owner: { name: "Priya Patel", team: "Engineering Talent" }
    }
  ]
};

export const SYSTEM_INSTRUCTION = `You are an elite talent intelligence system specializing in silver-medalist redeployment.
A "silver medalist" is a strong candidate who was runner-up for a previous role.
Your job: match candidates to jobs based on skills, compensation, availability, and silver-medalist context.
Return ONLY valid JSON matching the MatchResponse schema.
For each match: calculate match_score (0-100), redeployment_strategy (specific to why they were previously rejected),
risk_heatmap (tech/culture/comp/timing each 0-100), next_actions (practical steps with ai_pitch for each), estimated_savings_usd.
Be realistic — only return matches above the threshold. Quality over quantity.
Every match must show estimated_savings_usd (approximately $25k per hire vs agency).
Endorsements matter: focus on candidate tags that recruiters can use to sell the candidate to HMs.
Include next_actions with ai_pitch: a 2-line high-impact message for the Hiring Manager.`;
