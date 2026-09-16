/**
 * Header rules — the deterministic half of column mapping.
 *
 * These cover the exports the recruiter seat actually named: Greenhouse, Lever, Ashby,
 * Workable, Teamtailor, Bullhorn, LinkedIn Recruiter / Sales Navigator and the job boards.
 * A rule hit is `confidence: 'exact'` and never needs the AI. Anything left over goes to
 * `api/map-columns` in ONE call, and to fuzzy matching if that call fails.
 */
import type { ColumnMapping, ImportFieldKey, SourceKind } from '../../types';

/** Every value the mapping is allowed to produce — the guard for anything the AI returns. */
export const IMPORT_FIELD_KEYS: readonly ImportFieldKey[] = [
  'name', 'firstName', 'lastName', 'email', 'phone', 'linkedin', 'location',
  'currentEmployer', 'currentTitle', 'seniority', 'skills', 'tenureStart',
  'compExpectation', 'compAtLastProcess', 'noticePeriodDays', 'tags', 'notes',
  'status', 'statusReason',
  'processRole', 'processStage', 'processReason', 'processDate', 'processLostTo',
  'sourceUrl', 'skip',
];
const FIELD_SET = new Set<string>(IMPORT_FIELD_KEYS);

export function isImportField(v: unknown): v is ImportFieldKey {
  return typeof v === 'string' && FIELD_SET.has(v);
}

/** Plain words for each field, for anything the user reads. */
export const FIELD_LABELS: Record<ImportFieldKey, string> = {
  name: 'name',
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  phone: 'phone',
  linkedin: 'LinkedIn',
  location: 'location',
  currentEmployer: 'employer',
  currentTitle: 'job title',
  seniority: 'seniority',
  skills: 'skills',
  tenureStart: 'start date',
  compExpectation: 'salary they want',
  compAtLastProcess: 'salary at the time',
  noticePeriodDays: 'notice period',
  tags: 'tags',
  notes: 'notes',
  status: 'bench status',
  statusReason: 'reason for that status',
  processRole: 'the job they went for',
  processStage: 'how far they got',
  processReason: 'why they did not get it',
  processDate: 'date',
  processLostTo: 'who got it instead',
  sourceUrl: 'link back to the original',
  skip: 'not imported',
};

/** Lowercase, letters and digits only — so "First Name", "first_name" and "FIRSTNAME" agree. */
export function normHeader(h: string): string {
  return (h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Exact header rules. Keys are already normalised. First match wins, so this list is ordered
 * from most specific to least: "expectedsalary" must be seen before "salary".
 */
const RULES: [string[], ImportFieldKey][] = [
  // names
  [['firstname', 'first', 'givenname', 'given', 'forename', 'prenom', 'vorname'], 'firstName'],
  [['lastname', 'last', 'surname', 'familyname', 'family', 'nom', 'nachname'], 'lastName'],
  [['name', 'fullname', 'candidatename', 'candidate', 'contactname', 'personname', 'prospectname',
    'applicantname', 'membername', 'displayname', 'candidatefullname', 'lead'], 'name'],

  // contact
  [['email', 'emailaddress', 'candidateemail', 'primaryemail', 'workemail', 'personalemail',
    'emails', 'email1', 'emailid', 'contactemail', 'applicantemail'], 'email'],
  [['phone', 'phones', 'phonenumber', 'mobile', 'mobilephone', 'mobilenumber', 'telephone', 'tel',
    'cell', 'cellphone', 'contactnumber', 'primaryphone', 'phone1', 'candidatephone'], 'phone'],
  [['linkedin', 'linkedinurl', 'linkedinprofile', 'linkedinprofileurl', 'linkedinlink',
    'publicprofileurl', 'profileurl', 'profilelink', 'linkedinmemberprofileurl',
    'linkedinaddress', 'memberprofileurl', 'salesnavigatorlink'], 'linkedin'],

  // where and who
  [['location', 'candidatelocation', 'city', 'citystate', 'citycountry', 'town', 'region',
    'geography', 'geo', 'address', 'countryregion', 'country', 'basedin', 'currentlocation'], 'location'],
  [['currentcompany', 'company', 'currentemployer', 'employer', 'organisation', 'organization',
    'currentorganisation', 'currentorganization', 'companyname', 'account', 'currentaccount',
    'clientcorporation', 'firm', 'currentcompanyname'], 'currentEmployer'],
  [['currenttitle', 'jobtitle', 'title', 'currentposition', 'position', 'currentrole', 'headline',
    'occupation', 'designation', 'currentjobtitle', 'professionalheadline'], 'currentTitle'],
  [['seniority', 'level', 'careerlevel', 'joblevel', 'grade', 'band', 'experiencelevel'], 'seniority'],
  [['skills', 'keyskills', 'technicalskills', 'technologies', 'tech', 'tools', 'competencies',
    'expertise', 'specialties', 'specialities', 'stack'], 'skills'],
  [['tenurestart', 'startdate', 'startedat', 'currentrolestart', 'joined', 'joindate',
    'currentcompanystartdate', 'inrolesince'], 'tenureStart'],

  // money and availability
  [['expectedsalary', 'salaryexpectation', 'salaryexpectations', 'desiredsalary', 'desiredcompensation',
    'expectedcompensation', 'expectedcomp', 'compexpectation', 'targetsalary', 'salarywanted',
    'compensationexpectation'], 'compExpectation'],
  [['currentsalary', 'salary', 'compensation', 'currentcompensation', 'currentcomp', 'basesalary',
    'currentbase', 'package', 'remuneration', 'pay', 'ctc', 'currentctc', 'offeramount'], 'compAtLastProcess'],
  [['noticeperiod', 'notice', 'noticeperioddays', 'availability', 'availablefrom', 'noticelength'], 'noticePeriodDays'],

  // the candidacy
  [['job', 'jobname', 'jobtitleappliedfor', 'appliedfor', 'appliedrole', 'roleappliedfor',
    'requisition', 'requisitionid', 'reqid', 'req', 'opening', 'jobopening', 'jobrequisition',
    'vacancy', 'posting', 'postingname', 'jobposting', 'opportunity', 'project', 'projectname',
    'pipeline', 'pipelinename', 'jobreq', 'position applied'], 'processRole'],
  [['stage', 'currentstage', 'stagename', 'pipelinestage', 'hiringstage', 'interviewstage',
    'milestone', 'furthesteststage', 'furtheststage', 'laststage', 'status', 'candidatestatus',
    'applicationstatus', 'profilestatus', 'jobstatus', 'outcome', 'disposition',
    'applicationstage', 'recruitingstage'], 'processStage'],
  [['rejectionreason', 'reason', 'rejectreason', 'reasonforrejection', 'archivereason',
    'archivedreason', 'declinereason', 'dispositionreason', 'notselectedreason',
    'disqualifiedreason', 'disqualificationreason', 'outcomereason', 'rejectionnote',
    'feedback', 'rejectionfeedback'], 'processReason'],
  [['lostto', 'hiredinstead', 'wentto', 'competingoffer', 'placedcandidate', 'winner',
    'successfulcandidate'], 'processLostTo'],
  [['createdat', 'created', 'createddate', 'datecreated', 'applieddate', 'dateapplied',
    'applicationdate', 'dateadded', 'addeddate', 'sourceddate', 'datesourced', 'appliedon',
    'submitteddate', 'processdate', 'interviewdate'], 'processDate'],

  // bench-level status — only ever read for the strict flags, never to mark somebody inactive
  [['donotcontact', 'donotapproach', 'donotreapproach', 'dnc', 'optout', 'optedout',
    'unsubscribed', 'consent', 'consentstatus', 'benchstatus', 'gdpr'], 'status'],
  [['statusreason', 'donotcontactreason', 'optoutreason', 'consentnote'], 'statusReason'],

  // free text and provenance
  [['notes', 'note', 'comment', 'comments', 'recruiternotes', 'recruitercomments', 'summary',
    'why', 'whytheywerestrong', 'whystrong', 'about', 'bio', 'description', 'message'], 'notes'],
  [['tags', 'labels', 'keywords', 'source', 'sources', 'origin', 'origins', 'candidatesource',
    'sourcedfrom', 'leadsource', 'sourcechannel', 'referredby', 'department', 'team'], 'tags'],
  [['sourceurl', 'url', 'link', 'profile', 'candidateurl', 'candidatelink', 'applicationurl',
    'recordurl', 'greenhouseurl', 'leverlink', 'ashbyurl', 'weblink', 'permalink'], 'sourceUrl'],

  // known columns we deliberately do not import — matched by rule so they never reach the AI
  [['candidateid', 'id', 'profileid', 'personid', 'recordid', 'applicationid', 'opportunityid',
    'externalid', 'atsid', 'rowid', 'uuid', 'memberid'], 'skip'],
  [['recruiter', 'owner', 'coordinator', 'sourcer', 'assignedto', 'hiringmanager', 'accountowner',
    'createdby', 'addedby', 'followers', 'interviewer', 'interviewers'], 'skip'],
  [['lastactivity', 'lastactivityat', 'lastactivitydate', 'lastcontacted', 'lastcontact',
    'lastinteraction', 'updatedat', 'lastmodified', 'modifiedat', 'lastupdated'], 'skip'],
];

const RULE_INDEX = new Map<string, ImportFieldKey>();
for (const [aliases, field] of RULES) {
  for (const alias of aliases) {
    const key = normHeader(alias);
    if (!RULE_INDEX.has(key)) RULE_INDEX.set(key, field);
  }
}

/** The exact-rule lookup. Returns undefined when no rule knows this header. */
export function ruleFor(header: string): ImportFieldKey | undefined {
  return RULE_INDEX.get(normHeader(header));
}

// ------------------------------------------------------------------ fuzzy fallback

/** Dice coefficient on character bigrams — cheap, and good enough for "Cand. e-mail". */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s: string) => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  const pool = [...B];
  let hits = 0;
  for (const g of A) {
    const at = pool.indexOf(g);
    if (at !== -1) { pool.splice(at, 1); hits++; }
  }
  return (2 * hits) / (A.length + B.length);
}

/**
 * Best-effort field for an unknown header when the AI is unavailable. Deliberately
 * conservative: below 0.62 similarity we say `skip` rather than guess wrong.
 */
export function fuzzyFieldFor(header: string): ImportFieldKey {
  const h = normHeader(header);
  if (!h) return 'skip';
  let best: ImportFieldKey = 'skip';
  let bestScore = 0;
  for (const [alias, field] of RULE_INDEX) {
    // Plain Dice, with no substring bonus: "Current Companies" contains the alias
    // "currentcomp" (a salary column) and a bonus would let salary beat employer.
    const score = similarity(h, alias);
    if (score > bestScore) { bestScore = score; best = field; }
  }
  return bestScore >= 0.62 ? best : 'skip';
}

// --------------------------------------------------------------- source detection

export interface SourceSignature {
  kind: SourceKind;
  label: string;
  /** Every one of these normalised headers must be present. */
  need: string[][];
  /** Each of these that is present adds a point, breaking ties between two matching vendors. */
  hint: string[];
  /** When present, this signature is rejected — LinkedIn exports carry no email column. */
  absent?: string[];
}

const SIGNATURES: SourceSignature[] = [
  {
    kind: 'ats', label: 'Lever export',
    need: [['origin', 'posting', 'opportunityid']],
    hint: ['owner', 'archivereason', 'archived', 'stage', 'tags', 'sources', 'emails'],
  },
  {
    kind: 'ats', label: 'Ashby export',
    need: [['interviewstage', 'applicationstatus']],
    hint: ['job', 'source', 'createdat', 'candidatename'],
  },
  {
    kind: 'ats', label: 'Workable export',
    need: [['disqualifiedreason', 'disqualificationreason', 'jobshortcode']],
    hint: ['stage', 'job', 'candidateid', 'source'],
  },
  {
    kind: 'ats', label: 'Bullhorn export',
    need: [['clientcorporation', 'candidateid']],
    hint: ['owner', 'dateadded', 'status', 'occupation'],
  },
  {
    kind: 'ats', label: 'Teamtailor export',
    need: [['jobapplication', 'teamtailor', 'department']],
    hint: ['stage', 'job', 'tags', 'sourcedfrom'],
  },
  {
    kind: 'ats', label: 'Greenhouse export',
    need: [['job', 'jobname'], ['stage', 'currentstage', 'rejectionreason']],
    hint: ['candidateid', 'rejectionreason', 'coordinator', 'recruiter', 'lastactivity', 'source', 'createdat'],
  },
  {
    kind: 'linkedin', label: 'LinkedIn Recruiter export',
    need: [['profileurl', 'linkedinprofile', 'linkedinprofileurl', 'publicprofileurl', 'memberprofileurl']],
    hint: ['project', 'currentcompany', 'currenttitle', 'stage', 'pipeline', 'location', 'company', 'title'],
    absent: ['email', 'emailaddress', 'candidateemail', 'primaryemail'],
  },
  {
    kind: 'jobboard', label: 'Job board export',
    need: [['applieddate', 'dateapplied', 'applicationdate'], ['jobtitle', 'job', 'jobname', 'position']],
    hint: ['source', 'resume', 'coverletter', 'applicationstatus'],
  },
];

export interface DetectedSource {
  kind: SourceKind;
  label: string;
}

/**
 * Reads the ATS out of the header signature. Falls back to a plain spreadsheet, which is the
 * honest answer for a hand-made CSV.
 */
export function detectSource(headers: string[], filename?: string): DetectedSource {
  const present = new Set(headers.map(normHeader).filter(Boolean));
  const fileHint = (filename ?? '').toLowerCase();

  // A filename is the strongest signal there is when someone kept the vendor's export name.
  for (const [needle, sig] of [
    ['greenhouse', { kind: 'ats' as SourceKind, label: 'Greenhouse export' }],
    ['lever', { kind: 'ats' as SourceKind, label: 'Lever export' }],
    ['ashby', { kind: 'ats' as SourceKind, label: 'Ashby export' }],
    ['workable', { kind: 'ats' as SourceKind, label: 'Workable export' }],
    ['teamtailor', { kind: 'ats' as SourceKind, label: 'Teamtailor export' }],
    ['bullhorn', { kind: 'ats' as SourceKind, label: 'Bullhorn export' }],
    ['salesnav', { kind: 'linkedin' as SourceKind, label: 'Sales Navigator export' }],
    ['recruiter-export', { kind: 'linkedin' as SourceKind, label: 'LinkedIn Recruiter export' }],
    ['linkedin', { kind: 'linkedin' as SourceKind, label: 'LinkedIn export' }],
    ['indeed', { kind: 'jobboard' as SourceKind, label: 'Indeed export' }],
    ['welcometothejungle', { kind: 'jobboard' as SourceKind, label: 'Welcome to the Jungle export' }],
  ] as [string, DetectedSource][]) {
    if (fileHint.includes(needle)) return sig;
  }

  let best: DetectedSource | undefined;
  let bestScore = -1;
  for (const sig of SIGNATURES) {
    if (sig.absent?.some(a => present.has(a))) continue;
    if (!sig.need.every(group => group.some(h => present.has(h)))) continue;
    const score = sig.hint.filter(h => present.has(h)).length;
    if (score > bestScore) { bestScore = score; best = { kind: sig.kind, label: sig.label }; }
  }
  if (best) return best;

  return { kind: 'csv', label: filename ? `Spreadsheet: ${filename}` : 'Spreadsheet' };
}

/** Honest notes about what a given export simply cannot carry. */
export function sourceCaveats(label: string, columns: ColumnMapping[]): string[] {
  const notes: string[] = [];
  const has = (f: ImportFieldKey) => columns.some(c => c.field === f);

  if (/greenhouse|lever|ashby|workable|teamtailor|bullhorn/i.test(label)) {
    notes.push('An ATS export carries the columns you see and nothing else — no CVs, no scorecards and no interview debrief notes. If the reason someone came second lives in a scorecard, it is not in this file.');
  }
  if (/linkedin|sales navigator/i.test(label) && !has('email')) {
    notes.push('LinkedIn exports do not include email addresses. These people will land with a profile link and no way to email them until you add one.');
  }
  if (!has('processReason') && (has('processRole') || has('processStage'))) {
    notes.push('No column in this file says why each person did not get the job, so that will be blank on their profile.');
  }
  const skipped = columns.filter(c => c.field === 'skip').map(c => c.column);
  if (skipped.length) {
    notes.push(`${skipped.length} column${skipped.length === 1 ? '' : 's'} will not be imported: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? '…' : ''}. You can change any of these below.`);
  }
  return notes;
}
