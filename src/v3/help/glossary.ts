/**
 * Every term this app uses that a first-time visitor would not already know, with the
 * one-line definition the designer seat wrote (council/designer-v3.md §3). If a word appears
 * in the UI and is not in here, it should not be in the UI.
 */
export interface GlossaryEntry { label: string; body: string }

export const GLOSSARY = {
  fit: {
    label: 'Fit',
    body: 'How well this person matches the role you pasted: skills, seniority, location, pay. 80 and above is strong.',
  },
  lastContact: {
    label: 'Last contact',
    body: 'How long since anyone on your team wrote, called or met them.',
  },
  resurface: {
    label: 'Resurface window',
    body: 'People who took another job are usually open again after about 18 months. We remind you the week that window opens, once.',
  },
  source: {
    label: 'Source',
    body: 'Where this person came into the bench from — a résumé, an ATS export, a capture, a teammate. Click it to see the original.',
  },
  story: {
    label: 'The story',
    body: 'Why they came second, in the words of whoever ran the process. It is the one thing an ATS never exports, and the reason a note from you gets a reply.',
  },
  bench: {
    label: 'The bench',
    body: 'Everyone who interviewed with you and came close: seconds, finals, shortlists, declined offers.',
  },
  merge: {
    label: 'Merge',
    body: 'Two records that are the same person, joined into one. We never blank a filled field, and "do not approach" always survives.',
  },
  inbox: {
    label: 'Inbox',
    body: 'People suggested by a teammate or the public link. Nothing reaches the bench until you accept it here.',
  },
  capture: {
    label: 'Capture',
    body: 'A button for your bookmarks bar. On any profile or job page, one click sends the visible details here as a person to approve.',
  },
  waves: {
    label: 'In waves',
    body: 'We score twelve people at a time so results start appearing in about a second instead of after the whole bench.',
  },
  stage: {
    label: 'Stage',
    body: 'Where this person is in the current conversation: warm, reached out, replied, interviewing, offer, placed or passed.',
  },
  doNotApproach: {
    label: 'Do not approach',
    body: 'Someone who asked not to be contacted, or who the team agreed to leave alone. They are never in a queue and never in an AI prompt.',
  },
  quiet: {
    label: 'Gone quiet',
    body: 'You reached out and heard nothing back. Still on the bench, ranked lower, worth one more try later.',
  },
} as const;

export type TermKey = keyof typeof GLOSSARY;
