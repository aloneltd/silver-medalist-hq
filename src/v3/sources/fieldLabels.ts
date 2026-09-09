import type { ImportFieldKey } from '../../types';

/** Plain-English label for each column-mapping target — the recruiter seat's own words, not the schema's. */
export const FIELD_LABELS: Record<ImportFieldKey, string> = {
  name: 'Name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  linkedin: 'LinkedIn URL',
  location: 'Location',
  currentEmployer: 'Employer',
  currentTitle: 'Title',
  seniority: 'Seniority',
  skills: 'Skills',
  tenureStart: 'Started current role',
  compExpectation: 'Pay expectation',
  compAtLastProcess: 'Pay when you last spoke',
  noticePeriodDays: 'Notice period',
  tags: 'Tags',
  notes: 'Notes',
  status: 'Status',
  statusReason: 'Status reason',
  processRole: 'Role applied for',
  processStage: 'How far they got',
  processReason: 'Why they lost',
  processDate: 'Process date',
  processLostTo: 'Lost to',
  sourceUrl: 'Original link',
  skip: 'Skip this column',
};

/** Select-option order: the common person fields first, the process fields together, skip last. */
export const FIELD_ORDER: ImportFieldKey[] = [
  'name', 'firstName', 'lastName', 'email', 'phone', 'linkedin', 'location',
  'currentEmployer', 'currentTitle', 'seniority', 'skills', 'tenureStart',
  'compExpectation', 'compAtLastProcess', 'noticePeriodDays', 'tags', 'notes',
  'status', 'statusReason',
  'processRole', 'processStage', 'processReason', 'processDate', 'processLostTo',
  'sourceUrl',
  'skip',
];
