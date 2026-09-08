import type {
  Candidate, Role, Process, Seniority, CandidateStatus, FinishedAs, CompSnapshot,
  Match, MatchSubScores, Activity, Sequence, BoardStage,
} from '../types';

/**
 * Deterministic (seeded) sample bench generator — BLUEPRINT-v2.md:
 * "60 candidates × 8 roles × ~90 processes with believable names (mixed geographies),
 * realistic reasons, statuses spread (40 active, 8 silent, 7 took_role with snooze dates,
 * 3 do_not_reapproach, 2 opted_out), warmth spread from 2 to 400 days."
 *
 * 2026-09-08 polish pass — the bench now ships PRE-SCORED. A buyer opening the app for the
 * first time must land on a workspace where every view is already alive, not on a set of
 * "sync the bench to see anything" empty states. So this file also generates, deterministically:
 *
 *   • `matches`   — one per (role × contactable candidate): score, four sub-scores, a grounded
 *                   why-now line built from that person's own facts, flags, and a board stage.
 *   • `activities`— touches, notes and copied emails, so the activity trail and the ROI strip
 *                   are populated.
 *   • `sequences` — two live outreach sequences with a reminder that is actually due.
 *   • exactly 5 `placed` processes, so the honest ROI counter reads 5.
 *
 * Invariants the red-team pass checks (all enforced by construction below):
 *   1. A candidate has ONE board stage, shared across every role — nobody is "Placed" on one
 *      board and "Warm" on another.
 *   2. No resurface (`snoozeUntil`) date is in the past.
 *   3. No date that a screen turns into a day count is in the future — every `warmthAt`,
 *      `tenureStart`, `sourceDate`, process date and activity `at` is ≥ 1 day ago.
 *   4. Statuses and stages agree: `placed` cards are `took_role` people who have a `placed`
 *      process; `reached_out` cards are the people who then went `silent`; `passed` cards are
 *      the `do_not_reapproach` people; `opted_out` people are scored by nothing at all.
 *
 * Same seed -> same output, every time -> stable Playwright screenshots. IDs are readable
 * deterministic strings (not crypto-random ULIDs) for the same reason.
 */

const SEED = 0x5eed_0001;

/** mulberry32 — small, fast, deterministic PRNG. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand(): number {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash — lets per-(candidate,role) values be deterministic without a shared PRNG. */
function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function makeHelpers(rand: () => number) {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const pickN = <T,>(arr: readonly T[], n: number): T[] => {
    const pool = [...arr];
    const out: T[] = [];
    for (let i = 0; i < n && pool.length; i++) {
      out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    }
    return out;
  };
  const int = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
  const bool = (pTrue = 0.5): boolean => rand() < pTrue;
  const daysAgo = (n: number): string => new Date(Date.now() - Math.max(1, n) * 86_400_000).toISOString();
  return { pick, pickN, int, bool, daysAgo };
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------- name pools

const FIRST_NAMES = [
  'Amara', 'Yusuf', 'Elena', 'James', 'Priya', 'Lucas', 'Mei', 'Oskar', 'Fatima', 'Noah',
  'Sofia', 'Kwame', 'Ingrid', 'Diego', 'Chidi', 'Anya', 'Rafael', 'Hana', 'Marcus', 'Leila',
  'Tomasz', 'Aisha', 'Erik', 'Ines', 'Kenji', 'Zara', 'Felix', 'Naledi', 'Viktor', 'Camila',
  'Dmitri', 'Amina', 'Owen', 'Sanaa', 'Bjorn', 'Rosa', 'Kofi', 'Freya', 'Arjun', 'Maya',
  'Sebastian', 'Nadia', 'Liam', 'Chiara', 'Ravi', 'Astrid', 'Malik', 'Yuki', 'Pedro', 'Isabel',
  'Adaeze', 'Miguel', 'Saoirse', 'Hiro', 'Layla', 'Anton', 'Grace', 'Emeka', 'Petra', 'Wei',
];
const LAST_NAMES = [
  'Okonkwo', 'Rossi', 'Larsson', 'Chen', 'Patel', 'Kowalski', 'Silva', 'Nakamura', 'Haddad', 'Murphy',
  'Novak', 'Diallo', 'Andersson', 'Reyes', 'Osei', 'Kobayashi', 'Fischer', 'Adebayo', 'Ivanova', 'Costa',
  'Nguyen', 'Schmidt', 'Kimani', 'Petrov', 'Moreau', 'Abara', 'Lindgren', 'Santos', 'Yamamoto', 'Baptiste',
];
const LOCATIONS = [
  'New York, NY', 'San Francisco, CA', 'Austin, TX', 'London, UK', 'Berlin, DE', 'Toronto, CA',
  'Lagos, NG', 'Warsaw, PL', 'São Paulo, BR', 'Bengaluru, IN', 'Nairobi, KE', 'Stockholm, SE',
  'Amsterdam, NL', 'Singapore, SG', 'Mexico City, MX', 'Dublin, IE',
];
const EMPLOYERS = [
  'PayNord', 'Meridian Labs', 'Northwind Systems', 'Ferrous Cloud', 'BrightAxis', 'Solstice Robotics',
  'Kestrel Health', 'Anchorpoint', 'Vela Systems', 'Gridline', 'Cobalt Freight', 'Harborlight',
  'Trellis Data', 'Overlook Analytics', 'Faircourt Bank', 'Nimbus Retail',
];

const SKILL_POOL = [
  'Figma', 'Design Systems', 'Prototyping', 'User Research', 'TypeScript', 'Go', 'Kubernetes',
  'System Design', 'Distributed Systems', 'Python', 'SQL', 'dbt', 'Machine Learning', 'React',
  'Node.js', 'AWS', 'GCP', 'Terraform', 'People Management', 'Roadmapping', 'Stakeholder Management',
  'Enterprise Sales', 'Forecasting', 'SRE', 'Observability', 'PostgreSQL', 'GraphQL', 'Rust',
  'Data Modeling', 'A/B Testing', 'Accessibility',
];

const SENIORITIES: Seniority[] = ['junior', 'mid', 'senior', 'staff', 'principal', 'exec'];

const LOST_REASONS: Record<FinishedAs, string[]> = {
  second: [
    'Lost to an internal candidate with more platform context',
    'HM chose a candidate with more people-management experience',
    'Runner-up for a Staff-level hire; strong system design but the other candidate had more scale experience',
    'Great technical round but the culture panel felt lukewarm',
    'Very close call — the other finalist had a directly relevant domain background',
  ],
  final: [
    'Made it to the final round; role was paused before a decision was made',
    'Final panel split — went with the safer, more conventional profile',
    'Strong final round; comp gap of 12% was the deciding factor',
  ],
  shortlist: [
    'Shortlisted but the req was frozen before onsite could be scheduled',
    'Shortlisted; team reprioritized to a more senior level requirement',
  ],
  offer_declined: [
    'Declined the offer — took a counter-offer to stay',
    'Declined — accepted a role closer to home instead',
    'Declined over comp; wanted 15% above what the band allowed',
  ],
  placed: [
    'Placed — strong onboarding, team lead gave excellent early feedback',
  ],
};

const OTHER_REASONS = [
  'Wanted remote; role required 3 days on-site',
  'Comp expectation 15% above band',
  'Visa sponsorship timeline did not fit the role\'s urgency',
  'Timing — had just started a new role when we found her',
  'Went quiet after the final round despite a strong process',
  'Notice period was too long for the hiring manager\'s timeline',
  'Wanted a smaller team; this org was too large for her taste',
  'Asked to pause — family relocation mid-process',
];

// ------------------------------------------------------------------------ roles

interface RoleSeed {
  title: string; team: string; level: string; location: string; onsiteDays: number;
  compBand: { min: number; max: number; currency: string };
  mustHaves: string[]; niceToHaves: string[]; dealbreakers: string[];
  urgency: { score: 1 | 2 | 3 | 4 | 5; reasons: string[] };
  hiringManager: string;
}

const ROLE_SEEDS: RoleSeed[] = [
  {
    title: 'Senior Product Designer', team: 'Product Design', level: 'Senior', location: 'New York, NY', onsiteDays: 3,
    compBand: { min: 160000, max: 195000, currency: 'USD' },
    mustHaves: ['Figma', 'Design Systems', 'Prototyping'], niceToHaves: ['Accessibility'], dealbreakers: ['No portfolio'],
    urgency: { score: 5, reasons: ['Executive priority', 'Previous hire fell through'] }, hiringManager: 'Sarah Miller',
  },
  {
    title: 'Staff Software Engineer', team: 'Platform', level: 'Staff', location: 'San Francisco, CA', onsiteDays: 0,
    compBand: { min: 220000, max: 280000, currency: 'USD' },
    mustHaves: ['TypeScript', 'System Design', 'Go'], niceToHaves: ['Rust'], dealbreakers: ['No distributed systems experience'],
    urgency: { score: 4, reasons: ['Team scaling', 'Q3 deliverable risk'] }, hiringManager: 'Priya Patel',
  },
  {
    title: 'Engineering Manager', team: 'Core Services', level: 'Manager', location: 'Austin, TX', onsiteDays: 3,
    compBand: { min: 200000, max: 240000, currency: 'USD' },
    mustHaves: ['People Management', 'System Design'], niceToHaves: ['Kubernetes'], dealbreakers: ['No direct-report experience'],
    urgency: { score: 3, reasons: ['Backfill for an internal promotion'] }, hiringManager: 'Marcus Wright',
  },
  {
    title: 'Senior Data Scientist', team: 'Data', level: 'Senior', location: 'London, UK', onsiteDays: 2,
    compBand: { min: 95000, max: 120000, currency: 'GBP' },
    mustHaves: ['Python', 'Machine Learning', 'SQL'], niceToHaves: ['dbt'], dealbreakers: ['No production ML experience'],
    urgency: { score: 4, reasons: ['New model launch next quarter'] }, hiringManager: 'Ines Moreau',
  },
  {
    title: 'VP of Sales', team: 'Go To Market', level: 'Exec', location: 'Remote, US', onsiteDays: 0,
    compBand: { min: 240000, max: 300000, currency: 'USD' },
    mustHaves: ['Enterprise Sales', 'Forecasting'], niceToHaves: ['Stakeholder Management'], dealbreakers: ['No enterprise quota-carrying experience'],
    urgency: { score: 5, reasons: ['Board-level priority', 'Current VP departing'] }, hiringManager: 'Owen Murphy',
  },
  {
    title: 'Senior Backend Engineer', team: 'Payments', level: 'Senior', location: 'Berlin, DE', onsiteDays: 2,
    compBand: { min: 85000, max: 105000, currency: 'EUR' },
    mustHaves: ['Go', 'PostgreSQL', 'System Design'], niceToHaves: ['Kubernetes'], dealbreakers: ['No payments/fintech experience'],
    urgency: { score: 3, reasons: ['Steady growth hire'] }, hiringManager: 'Petra Fischer',
  },
  {
    title: 'Product Manager, Platform', team: 'Platform', level: 'Senior', location: 'Toronto, CA', onsiteDays: 2,
    compBand: { min: 150000, max: 175000, currency: 'CAD' },
    mustHaves: ['Roadmapping', 'Stakeholder Management'], niceToHaves: ['A/B Testing'], dealbreakers: ['No platform/API product experience'],
    urgency: { score: 3, reasons: ['Filling a long-open req'] }, hiringManager: 'Grace Andersson',
  },
  {
    title: 'Staff Site Reliability Engineer', team: 'Infra', level: 'Staff', location: 'Remote', onsiteDays: 0,
    compBand: { min: 210000, max: 260000, currency: 'USD' },
    mustHaves: ['SRE', 'Observability', 'Kubernetes'], niceToHaves: ['Terraform'], dealbreakers: ['No on-call leadership experience'],
    urgency: { score: 4, reasons: ['Reliability incidents last quarter'] }, hiringManager: 'Felix Kowalski',
  },
];

function buildRoles(now: string): Role[] {
  return ROLE_SEEDS.map((seed, i) => ({
    id: `role_${String(i + 1).padStart(2, '0')}`,
    title: seed.title,
    team: seed.team,
    level: seed.level,
    location: seed.location,
    onsiteDays: seed.onsiteDays,
    compBand: seed.compBand,
    mustHaves: seed.mustHaves,
    niceToHaves: seed.niceToHaves,
    dealbreakers: seed.dealbreakers,
    urgency: seed.urgency,
    status: 'open',
    hiringManager: seed.hiringManager,
    createdAt: now,
    updatedAt: now,
  }));
}

// ------------------------------------------------------------------- candidates

const STATUS_PLAN: { status: CandidateStatus; count: number }[] = [
  { status: 'active', count: 40 },
  { status: 'silent', count: 8 },
  { status: 'took_role', count: 7 },
  { status: 'do_not_reapproach', count: 3 },
  { status: 'opted_out', count: 2 },
];

const SENIORITY_FOR_LEVEL: Record<string, Seniority> = {
  Senior: 'senior', Staff: 'staff', Manager: 'senior', Exec: 'exec',
};

/**
 * A real silver-medalist bench is not 60 strangers — it is the people who came second on the
 * reqs you have already run. So each candidate is generated with an *affinity* to one of the
 * eight roles (their skills, seniority and comp band come from it) plus a weaker affinity to
 * a second. That is what makes a synced role produce a shortlist a recruiter would recognise:
 * a handful of genuinely strong fits, a tail of plausible ones, and the rest clearly not.
 */
function buildCandidates(now: string, rand: () => number, roles: Role[]): Candidate[] {
  const h = makeHelpers(rand);
  const statuses: CandidateStatus[] = STATUS_PLAN.flatMap(p => Array(p.count).fill(p.status));
  const usedNames = new Set<string>();

  const candidates: Candidate[] = [];
  let tookRoleSeen = 0;

  for (let i = 0; i < 60; i++) {
    let name: string;
    do {
      name = `${h.pick(FIRST_NAMES)} ${h.pick(LAST_NAMES)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const status = statuses[i];
    const primary = roles[i % roles.length];
    const secondary = roles[(i * 3 + 1) % roles.length];

    // Skills: most of the primary role's must-haves (occasionally one short — a real near
    // miss), one of its nice-to-haves, a couple from the secondary role, then filler.
    const primaryMusts = h.bool(0.78) ? primary.mustHaves : primary.mustHaves.slice(0, -1);
    const skillSet = new Set<string>([
      ...primaryMusts,
      ...(primary.niceToHaves.length && h.bool(0.6) ? [primary.niceToHaves[0]] : []),
      ...h.pickN(secondary.mustHaves, h.int(1, 2)),
    ]);
    for (const extra of h.pickN(SKILL_POOL, h.int(1, 3))) skillSet.add(extra);
    const skills = [...skillSet];

    // Seniority tracks the role they were a finalist for, with a realistic amount of drift.
    const base = SENIORITY_FOR_LEVEL[primary.level] ?? 'mid';
    const baseIdx = SENIORITIES.indexOf(base);
    const drift = h.bool(0.7) ? 0 : h.bool(0.5) ? -1 : 1;
    const seniority = SENIORITIES[Math.max(0, Math.min(SENIORITIES.length - 1, baseIdx + drift))];

    const tenureMonthsAgo = h.int(2, 72); // 2 months to 6 years
    const warmthDays = h.int(2, 400); // exact blueprint spread

    // Comp is quoted in the primary role's currency and near its band — most inside, some
    // above (the classic "we lost them on comp" story the bench is supposed to remember).
    const currency = primary.compBand.currency;
    const mid = (primary.compBand.min + primary.compBand.max) / 2;
    const compAmount = Math.round((mid * (1 + h.int(-14, 22) / 100)) / 1000) * 1000;

    const compAtLastProcess: CompSnapshot = {
      amount: compAmount,
      currency,
      date: h.daysAgo(h.int(60, 700)),
    };
    const compExpectation: CompSnapshot | undefined = h.bool(0.7)
      ? { amount: Math.round((compAmount * (1 + h.int(-3, 12) / 100)) / 1000) * 1000, currency, date: h.daysAgo(h.int(1, 60)) }
      : undefined;

    let statusReason: string | undefined;
    let snoozeUntil: string | undefined;
    if (status === 'silent') {
      statusReason = h.pick([
        'Three touches, no reply — stopped ranking her at the top',
        'Went quiet after a strong final round',
        'Stopped responding after the initial screen',
      ]);
    } else if (status === 'took_role') {
      statusReason = h.pick([
        'Accepted a role at another company; worth a ping around the 18-month mark',
        'Took an internal promotion at her current employer',
        'Accepted a competing offer we could not match on comp',
      ]);
      // Resurface dates are ALWAYS in the future (red-team invariant 2). The first two land
      // inside the Today queue's 21-day "opening soon" window so Today has a resurface card
      // without ever showing a date we already missed.
      const daysUntilResurface = tookRoleSeen < 2 ? 5 + tookRoleSeen * 7 : h.int(90, 520);
      snoozeUntil = daysFromNow(daysUntilResurface);
      tookRoleSeen++;
    } else if (status === 'do_not_reapproach') {
      statusReason = h.pick([
        'Values mismatch surfaced in the onsite debrief',
        'Hiring manager said never re-approach after a difficult final round',
        'Candidate asked us directly to stop reaching out',
      ]);
    } else if (status === 'opted_out') {
      statusReason = 'Requested erasure / withdrew consent to be contacted';
    }

    candidates.push({
      id: `cand_${String(i + 1).padStart(3, '0')}`,
      name,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example-mail.com`,
      location: h.bool(0.55) ? primary.location : h.pick(LOCATIONS),
      onsiteDays: h.int(0, 5),
      currentEmployer: h.pick(EMPLOYERS),
      currentTitle: `${seniority[0].toUpperCase()}${seniority.slice(1)} ${h.pick(['Engineer', 'Designer', 'Manager', 'Analyst', 'Lead'])}`,
      tenureStart: h.daysAgo(tenureMonthsAgo * 30),
      seniority,
      skills,
      compAtLastProcess,
      compExpectation,
      noticePeriodDays: h.pick([0, 14, 30, 60, 90]),
      visaNeed: h.bool(0.15),
      tags: h.bool(0.3) ? ['warm-lead'] : [],
      status,
      statusReason,
      snoozeUntil,
      warmthAt: h.daysAgo(warmthDays),
      sourceDate: h.daysAgo(tenureMonthsAgo * 30 + h.int(0, 30)),
      notes: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return candidates;
}

// -------------------------------------------------------------------- processes

const FINISHED_AS_WEIGHTS: { finishedAs: FinishedAs; weight: number }[] = [
  { finishedAs: 'second', weight: 48 },
  { finishedAs: 'final', weight: 22 },
  { finishedAs: 'shortlist', weight: 17 },
  { finishedAs: 'offer_declined', weight: 13 },
];

function weightedPick<T extends { weight: number }>(items: T[], rand: () => number): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rand() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * ~90 lost/near-miss processes, plus EXACTLY 5 `placed` ones so the honest ROI counter
 * ("placements sourced from this bench") reads 5 — a number, not a guess.
 */
function buildProcesses(candidates: Candidate[], roles: Role[], now: string, rand: () => number): Process[] {
  const h = makeHelpers(rand);
  const processes: Process[] = [];
  let counter = 0;

  for (const candidate of candidates) {
    const numProcesses = h.bool(0.5) ? 1 : h.bool(0.75) ? 2 : 3;
    const roleChoices = h.pickN(roles, Math.min(numProcesses, roles.length));

    for (const role of roleChoices) {
      counter++;
      const finishedAsSeed = weightedPick(FINISHED_AS_WEIGHTS, rand);
      const reasonPool = h.bool(0.6) ? LOST_REASONS[finishedAsSeed.finishedAs] : OTHER_REASONS;
      const reason = h.pick(reasonPool);
      const daysAgoOfProcess = h.int(20, 730);

      processes.push({
        id: `proc_${String(counter).padStart(4, '0')}`,
        candidateId: candidate.id,
        roleId: role.id,
        date: h.daysAgo(daysAgoOfProcess),
        finishedAs: finishedAsSeed.finishedAs,
        reason,
        lostTo: finishedAsSeed.finishedAs === 'second' || finishedAsSeed.finishedAs === 'final'
          ? h.pick(['an internal transfer', `${role.hiringManager ?? 'the hiring manager'}'s preferred external hire`, 'a candidate with a closer domain background'])
          : undefined,
        createdAt: now,
        updatedAt: now,
      });

      if (processes.length >= 90) break;
    }
    if (processes.length >= 90) break;
  }

  // Exactly five placements, all on people whose status says they took a role — so the ROI
  // number and the candidate record tell the same story.
  const placedPeople = candidates.filter(c => c.status === 'took_role').slice(0, 5);
  placedPeople.forEach((candidate, i) => {
    const role = roles[i % roles.length];
    counter++;
    processes.push({
      id: `proc_${String(counter).padStart(4, '0')}`,
      candidateId: candidate.id,
      roleId: role.id,
      date: new Date(Date.now() - (60 + i * 47) * 86_400_000).toISOString(),
      finishedAs: 'placed',
      reason: LOST_REASONS.placed[0],
      createdAt: now,
      updatedAt: now,
    });
  });

  return processes;
}

// ----------------------------------------------------------------------- scoring

const SENIORITY_RANK: Record<Seniority, number> = {
  junior: 0, mid: 1, senior: 2, staff: 3, principal: 4, exec: 5,
};

function roleLevelRank(level: string): number {
  const l = level.toLowerCase();
  if (l.includes('exec') || l.includes('vp') || l.includes('chief')) return 5;
  if (l.includes('principal')) return 4;
  if (l.includes('staff')) return 3;
  if (l.includes('manager') || l.includes('lead') || l.includes('senior') || l.includes('sr')) return 2;
  if (l.includes('junior') || l.includes('associate')) return 0;
  return 1;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function monthsBetween(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / (30.4375 * 86_400_000);
}
function daysBetween(iso: string, now: number): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 86_400_000);
}

interface ScoredSample {
  score: number;
  sub: MatchSubScores;
  why: string;
  flags: string[];
}

/**
 * The deterministic sample scorer. Same shape the AI returns, built from the same facts the
 * AI is given — so the pre-scored bench and a freshly AI-scored one are visually identical,
 * and nothing on screen is a number without a reason behind it.
 */
function scoreSample(
  candidate: Candidate,
  role: Role,
  lastProcess: Process | undefined,
  now: number,
): ScoredSample {
  const jitter = strHash(`${candidate.id}|${role.id}`);
  const have = new Set(candidate.skills.map(s => s.toLowerCase()));
  const mustMatched = role.mustHaves.filter(s => have.has(s.toLowerCase()));
  const niceMatched = role.niceToHaves.filter(s => have.has(s.toLowerCase()));
  const totalWeight = role.mustHaves.length * 2 + role.niceToHaves.length;
  const earned = mustMatched.length * 2 + niceMatched.length;
  // A small, stable spread keeps a 60-row bench from collapsing onto five identical numbers.
  const skills = clamp((totalWeight ? (earned / totalWeight) * 100 : 55) * 0.82 + 12 + (jitter % 11));

  const distance = Math.abs(SENIORITY_RANK[candidate.seniority] - roleLevelRank(role.level));
  const seniority = clamp(100 - distance * 26 + ((jitter >>> 4) % 9));

  const expectation = candidate.compExpectation ?? candidate.compAtLastProcess;
  let comp = 62;
  let compNote = 'comp not directly comparable';
  let aboveBand = false;
  if (expectation && expectation.currency === role.compBand.currency) {
    const { amount } = expectation;
    const { min, max } = role.compBand;
    if (amount >= min && amount <= max) { comp = clamp(94 - ((jitter >>> 8) % 7)); compNote = 'comp sits inside the band'; }
    else if (amount < min) { comp = clamp(88 - ((min - amount) / min) * 90); compNote = `comp on file is under the band`; }
    else {
      const overPct = (amount - max) / max;
      comp = clamp(88 - overPct * 190);
      compNote = `comp on file is ${Math.round(overPct * 100)}% over the band`;
      aboveBand = overPct > 0.05;
    }
  }

  const tenure = monthsBetween(candidate.tenureStart, now);
  const warmthDays = daysBetween(candidate.warmthAt, now);
  let timing = 52 + ((jitter >>> 12) % 9);
  if (tenure >= 18 && tenure <= 36) timing += 30;
  else if (tenure >= 12 && tenure < 18) timing += 16;
  else if (tenure > 36 && tenure <= 48) timing += 10;
  else if (tenure < 6) timing -= 22;
  if (candidate.snoozeUntil && new Date(candidate.snoozeUntil).getTime() > now) timing -= 34;
  if (warmthDays > 120) timing -= 12; else if (warmthDays <= 21) timing += 8;
  timing = clamp(timing);

  const sub: MatchSubScores = { skills, seniority, comp, timing };
  let score = clamp(skills * 0.4 + seniority * 0.2 + comp * 0.2 + timing * 0.2);
  if (candidate.status === 'silent') score = clamp(score - 6);
  if (candidate.status === 'took_role') score = clamp(score - 12);
  if (candidate.status === 'do_not_reapproach') score = clamp(score - 20);

  const flags: string[] = [];
  if (aboveBand) flags.push('comp above band');
  if (distance >= 2) flags.push('seniority mismatch');
  if (candidate.visaNeed) flags.push('needs sponsorship');
  if ((candidate.noticePeriodDays ?? 0) >= 90) flags.push('90-day notice');
  if (!mustMatched.length) flags.push('no must-have overlap');

  // --- the why-now sentence: two clauses, both grounded in this person's own record ---
  const shown = mustMatched.length > 2
    ? [mustMatched[jitter % mustMatched.length], mustMatched[(jitter + 1) % mustMatched.length]]
    : mustMatched;
  const skillPhrase = [...new Set(shown)].join(' and ');
  const skillTemplates = [
    `${skillPhrase} is exactly what this ${role.level} brief asks for`,
    `carries ${skillPhrase} into a ${role.title} req that needs both`,
    `${skillPhrase} on the CV, and ${mustMatched.length} of ${role.mustHaves.length} must-haves covered`,
    `already assessed on ${skillPhrase} for a role at this level`,
  ];
  const skillClause = mustMatched.length
    ? skillTemplates[(jitter >>> 3) % skillTemplates.length]
    : niceMatched.length
      ? `${niceMatched[0]} overlaps, though none of the must-haves do`
      : `no must-have overlap on paper, but the ${candidate.seniority} track record is adjacent`;

  const tenureRounded = Math.round(tenure);
  const timingClauses = [
    `${tenureRounded} months into ${candidate.currentEmployer} — the window where people answer`,
    `last touched ${Math.round(warmthDays)} days ago`,
    `${tenureRounded} months at ${candidate.currentEmployer} and ${compNote}`,
  ];
  const historyClause = lastProcess
    ? `${lastProcess.reason.replace(/\.$/, '')} — worth another look now`
    : timingClauses[jitter % timingClauses.length];

  const statusClause =
    candidate.status === 'silent' ? 'Went quiet last time, so lead with the specifics: '
      : candidate.status === 'took_role' ? 'Off the market for now: '
        : candidate.status === 'do_not_reapproach' ? 'Flagged do-not-re-approach: '
          : '';

  const why = `${statusClause}${skillClause}; ${historyClause}.`
    .replace(/^(.)/, (m0) => m0.toUpperCase());

  return { score, sub, why: why.slice(0, 400), flags: flags.slice(0, 3) };
}

// ------------------------------------------------------------------ board stages

/**
 * One stage per PERSON, shared by every role's board (red-team invariant 1). Nobody can be
 * "Placed" on one board and "Warm" on another, and the stage always agrees with the status:
 * silent people are the ones we reached out to, do-not-re-approach people are the ones we
 * passed on, and the two Placed cards are people whose record says they took a role.
 */
const IN_MOTION_STAGES: BoardStage[] = ['reached_out', 'replied', 'interviewing', 'offer'];

function assignStages(candidates: Candidate[]): Map<string, BoardStage> {
  const stages = new Map<string, BoardStage>();
  const active = candidates.filter(c => c.status === 'active');
  const tookRole = candidates.filter(c => c.status === 'took_role');

  for (const c of candidates) {
    if (c.status === 'silent') stages.set(c.id, 'reached_out');
    else if (c.status === 'do_not_reapproach') stages.set(c.id, 'passed');
    else stages.set(c.id, 'warm');
  }
  // The two people whose placement we actually made show up in Placed.
  tookRole.slice(0, 2).forEach(c => stages.set(c.id, 'placed'));

  // A live pipeline out of the active bench: 3 at offer, 5 interviewing, 6 replied.
  const plan: Array<[BoardStage, number]> = [['offer', 3], ['interviewing', 5], ['replied', 6]];
  let cursor = 2; // skip the first two so the top of the bench isn't all mid-pipeline
  for (const [stage, count] of plan) {
    for (let i = 0; i < count && cursor < active.length; i++, cursor++) {
      stages.set(active[cursor].id, stage);
    }
  }
  return stages;
}

// ---------------------------------------------------------------------- matches

function buildMatches(candidates: Candidate[], roles: Role[], processes: Process[]): Match[] {
  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const stages = assignStages(candidates);
  const lastProcessByCandidate = new Map<string, Process>();
  for (const p of processes) lastProcessByCandidate.set(p.candidateId, p);

  // `opted_out` is an erasure request — those people are scored by nothing and appear in no
  // ranking. Everyone else gets a row for every role, so every view is alive on first load.
  const scorable = candidates.filter(c => c.status !== 'opted_out');

  const matches: Match[] = [];
  for (const role of roles) {
    for (const candidate of scorable) {
      const scored = scoreSample(candidate, role, lastProcessByCandidate.get(candidate.id), now);
      const stage = stages.get(candidate.id) ?? 'warm';
      matches.push({
        id: `match_${role.id}_${candidate.id}`,
        roleId: role.id,
        candidateId: candidate.id,
        score: scored.score,
        sub: scored.sub,
        why: scored.why,
        flags: scored.flags,
        // A deliberately non-matching hash: the first real sync of any role must actually
        // call the AI rather than short-circuiting on the sample data's fingerprint.
        hash: 'sample-bench',
        stage,
        stageUpdatedAt: new Date(now - (strHash(candidate.id + role.id) % 20) * 86_400_000).toISOString(),
        updatedAt: nowISO,
      });
    }
  }
  return matches;
}

// -------------------------------------------------------------- activities / sequences

const NOTE_BODIES = [
  'Wants a team where design and engineering sit together — said it twice, unprompted.',
  'Open to relocating for the right role, but not before the school year ends.',
  'Asked specifically about on-call load. Answer that before pitching.',
  'Mentioned a manager she would follow anywhere — worth knowing who.',
  'Prefers a written brief before any call. Send the JD, then book.',
  'Turned down two recruiters this quarter; replies to specifics, not to "exciting opportunity".',
  'Comp conversation last time ended at a number 8% above our band. Re-check before pitching.',
  'Said the last process felt respectful — that goodwill is why she still replies.',
];

function buildActivities(candidates: Candidate[], roles: Role[], rand: () => number): Activity[] {
  const h = makeHelpers(rand);
  const out: Activity[] = [];
  let n = 0;
  const id = () => `act_${String(++n).padStart(4, '0')}`;

  for (const c of candidates) {
    if (c.status === 'opted_out') continue;
    // The touch that set warmthAt — every "days since touch" number on screen has a row behind it.
    out.push({
      id: id(), candidateId: c.id, type: 'touch', at: c.warmthAt,
      body: h.pick([
        'Sent a short note about a role that looked close.',
        'Called — good 12-minute catch-up, no live search on their side.',
        'LinkedIn message; read, no reply yet.',
        'Coffee catch-up. Still happy where they are, still happy to hear from us.',
      ]),
      actor: 'owner',
    });
  }
  for (let i = 0; i < candidates.length; i += 3) {
    const c = candidates[i];
    if (c.status === 'opted_out') continue;
    out.push({
      id: id(), candidateId: c.id, type: 'note',
      at: h.daysAgo(h.int(3, 200)), body: h.pick(NOTE_BODIES), actor: 'owner',
    });
  }
  for (let i = 1; i < candidates.length; i += 4) {
    const c = candidates[i];
    if (c.status === 'opted_out' || c.status === 'do_not_reapproach') continue;
    const role = roles[i % roles.length];
    out.push({
      id: id(), candidateId: c.id, roleId: role.id, type: 'email_copied',
      at: h.daysAgo(h.int(2, 120)),
      body: `Copied a Day 0 outreach draft for ${role.title}.`,
      actor: 'owner',
    });
  }
  return out;
}

/** Two live sequences whose next step is due today — Today has something real to chase. */
function buildSequences(candidates: Candidate[], roles: Role[], now: string): Sequence[] {
  const targets = candidates.filter(c => c.status === 'active').slice(4, 6);
  return targets.map((c, i) => ({
    id: `seq_${String(i + 1).padStart(2, '0')}`,
    candidateId: c.id,
    roleId: roles[i].id,
    steps: [
      {
        day: 0, channel: 'email' as const, doneAt: new Date(Date.now() - (3 + i) * 86_400_000).toISOString(),
        body: `Opened with the ${roles[i].title} brief and why the last process still matters.`,
      },
      { day: 3, channel: 'linkedin' as const, body: 'Short nudge with the comp band, no pressure.' },
      { day: 7, channel: 'call' as const, body: 'Offer a 15-minute call at their convenience.' },
    ],
    // Due now — the reminder is live, not decorative.
    nextDueAt: new Date(Date.now() - (i === 0 ? 0 : 1) * 86_400_000).toISOString(),
    createdAt: now,
    updatedAt: now,
  }));
}

// ------------------------------------------------------------------------ public

export interface SampleBench {
  roles: Role[];
  candidates: Candidate[];
  processes: Process[];
  matches: Match[];
  activities: Activity[];
  sequences: Sequence[];
}

/**
 * Builds the full deterministic sample bench: 8 roles, 60 candidates, ~95 processes (5 of
 * them placements), a scored match for every role × contactable candidate, an activity trail,
 * and two live sequences.
 */
export function buildSampleBench(): SampleBench {
  const rand = mulberry32(SEED);
  const now = new Date().toISOString();
  const roles = buildRoles(now);
  const candidates = buildCandidates(now, rand, roles);

  // Warmth has to agree with the pipeline. Someone at Interviewing whose last touch was 300
  // days ago is not a stale card, it is a contradiction — so anyone the board shows as in
  // motion was genuinely touched in the last three weeks, and only the handful that drifted
  // past fourteen days go amber. That is what makes the amber mean something.
  const stagesForWarmth = assignStages(candidates);
  for (const c of candidates) {
    const stage = stagesForWarmth.get(c.id);
    if (stage && IN_MOTION_STAGES.includes(stage)) {
      c.warmthAt = new Date(Date.now() - (1 + (strHash(`warmth|${c.id}`) % 17)) * 86_400_000).toISOString();
    }
  }

  const processes = buildProcesses(candidates, roles, now, rand);
  const matches = buildMatches(candidates, roles, processes);
  const activities = buildActivities(candidates, roles, rand);
  const sequences = buildSequences(candidates, roles, now);
  return { roles, candidates, processes, matches, activities, sequences };
}
