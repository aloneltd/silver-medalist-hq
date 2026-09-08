import type {
  Candidate, Role, Process, Seniority, CandidateStatus, FinishedAs, CompSnapshot,
} from '../types';

/**
 * Deterministic (seeded) sample bench generator — BLUEPRINT-v2.md:
 * "60 candidates × 8 roles × ~90 processes with believable names (mixed geographies),
 * realistic reasons, statuses spread (40 active, 8 silent, 7 took_role with snooze dates,
 * 3 do_not_reapproach, 2 opted_out), warmth spread from 2 to 400 days."
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
  const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();
  return { pick, pickN, int, bool, daysAgo };
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

function buildCandidates(now: string, rand: () => number): Candidate[] {
  const h = makeHelpers(rand);
  const statuses: CandidateStatus[] = STATUS_PLAN.flatMap(p => Array(p.count).fill(p.status));
  const usedNames = new Set<string>();

  const candidates: Candidate[] = [];
  for (let i = 0; i < 60; i++) {
    let name: string;
    do {
      name = `${h.pick(FIRST_NAMES)} ${h.pick(LAST_NAMES)}`;
    } while (usedNames.has(name));
    usedNames.add(name);

    const status = statuses[i];
    const seniority = h.pick(SENIORITIES);
    const skills = h.pickN(SKILL_POOL, h.int(3, 6));
    const tenureMonthsAgo = h.int(2, 72); // 2 months to 6 years
    const warmthDays = h.int(2, 400); // exact blueprint spread
    const currency = h.pick(['USD', 'GBP', 'EUR', 'CAD']);
    const compAmount = h.int(70, 300) * 1000;

    const compAtLastProcess: CompSnapshot = {
      amount: compAmount,
      currency,
      date: h.daysAgo(h.int(60, 700)),
    };
    const compExpectation: CompSnapshot | undefined = h.bool(0.7)
      ? { amount: Math.round(compAmount * (1 + h.int(-5, 15) / 100)), currency, date: h.daysAgo(h.int(1, 60)) }
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
      // "auto-resurface at ~18 months tenure" — snooze date relative to now, some already due
      const monthsUntilResurface = h.int(-3, 16); // some negative = already due
      snoozeUntil = new Date(Date.now() + monthsUntilResurface * 30 * 86_400_000).toISOString();
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
      location: h.pick(LOCATIONS),
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
  { finishedAs: 'second', weight: 45 },
  { finishedAs: 'final', weight: 20 },
  { finishedAs: 'shortlist', weight: 15 },
  { finishedAs: 'offer_declined', weight: 12 },
  { finishedAs: 'placed', weight: 8 },
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

function buildProcesses(candidates: Candidate[], roles: Role[], now: string, rand: () => number): Process[] {
  const h = makeHelpers(rand);
  const processes: Process[] = [];
  let counter = 0;

  // Each candidate gets 1-3 processes against *different* roles (unique candidateId+roleId).
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

      if (processes.length >= 92) break;
    }
    if (processes.length >= 92) break;
  }

  return processes;
}

// ------------------------------------------------------------------------ public

export interface SampleBench {
  roles: Role[];
  candidates: Candidate[];
  processes: Process[];
}

/** Builds the full deterministic sample bench: 8 roles, 60 candidates, ~90 processes. */
export function buildSampleBench(): SampleBench {
  const rand = mulberry32(SEED);
  const now = new Date().toISOString();
  const roles = buildRoles(now);
  const candidates = buildCandidates(now, rand);
  const processes = buildProcesses(candidates, roles, now, rand);
  return { roles, candidates, processes };
}
