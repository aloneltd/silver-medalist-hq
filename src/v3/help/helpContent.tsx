import type { ReactNode } from 'react';

/**
 * "How this works" — one drawer, content keyed by route (council/designer-v3.md §3).
 * Every entry tells the same three-step story with the same three sample people, so the
 * explanation compounds instead of resetting on each screen.
 */
export interface HelpStep { label: string; body: ReactNode }
export interface HelpDoc {
  title: string;
  intro: ReactNode;
  steps: HelpStep[];
  /** A real thing on this screen the reader can go and look at. */
  look?: ReactNode;
}

export type HelpKey = 'home' | 'people' | 'roles' | 'sources' | 'team' | 'profile' | 'inbox' | 'connections';

export const HELP: Record<HelpKey, HelpDoc> = {
  home: {
    title: 'How this works',
    intro: 'Everyone here already interviewed with you and came close. That is the whole idea: a message from you gets a reply, because they remember you.',
    steps: [
      { label: '1 · Gather', body: <>Kofi arrived from an Outlook thread in May. We kept his résumé, the interview notes, and the reason he lost: an internal hire.</> },
      { label: '2 · Match', body: <>A new Staff SRE role landed on Monday. You pasted it here; Kofi ranked first with a fit of 94, because of his on-call and Kubernetes depth.</> },
      { label: '3 · Reach out', body: <>We drafted a note that mentioned May. You sent it with one click, and he replied within a day.</> },
    ],
    look: <>The list below is today's five. Elena is on it because she took a job eighteen months ago and that window is opening.</>,
  },
  people: {
    title: 'Reading this page',
    intro: 'Pick a role at the top and the whole list re-sorts by who is worth a message for it.',
    steps: [
      { label: 'Fit', body: <>How well a person matches the role you picked, out of 100. Above 80 is strong. Hover the number to see the four parts behind it.</> },
      { label: 'Spoke', body: <>The last time anyone on your team wrote, called or met them. Chiara at nine weeks is warm; Elena at eighteen months needs a different note.</> },
      { label: 'From', body: <>Where they came into the bench. Kofi from Outlook, Elena from a Greenhouse export, Chiara from a LinkedIn capture. Click it for the original.</> },
    ],
    look: <>The Target on the right is the same list as a picture: closer to the middle is a better fit, the top of the clock is this week.</>,
  },
  roles: {
    title: 'How roles work',
    intro: 'A role is a job description you pasted. We read it once, then rank the whole bench against it.',
    steps: [
      { label: '1 · Paste', body: <>Paste the description, or a link. We pull out the level, the location, the pay band, and the must-haves.</> },
      { label: '2 · Match', body: <>Everyone on the bench is scored against it in waves of twelve, so the first names appear in about a second.</> },
      { label: '3 · Re-match later', body: <>Nothing is frozen. Re-match after a new import and the new people slot straight into the same ranking.</> },
    ],
  },
  sources: {
    title: 'How people get here',
    intro: 'People come in from everywhere you meet them. Every one lands on the same bench with a badge saying where they came from, and nothing is imported twice.',
    steps: [
      { label: '1 · Drop', body: <>Drop a folder of résumés, a spreadsheet, or an export from Greenhouse, Lever, Ashby, Workable, Teamtailor or Bullhorn. We read the columns and show you what we found.</> },
      { label: '2 · Check', body: <>You see the column mapping and the likely duplicates before anything is saved. An exact email match merges; a same-name-different-email is always your call.</> },
      { label: '3 · Undo', body: <>Every import is one row in the list below, and every one of them can be undone — the people go, the people they merged into come back exactly as they were.</> },
    ],
    look: <>Greenhouse exports carry stages and rejection reasons but never résumés. We say so on the card rather than pretending the notes came along.</>,
  },
  team: {
    title: 'Working as a team',
    intro: 'A bench is worth more when the whole desk feeds it. Three ways in, and none of them writes straight to the bench.',
    steps: [
      { label: 'Teammates', body: <>Editors add people and write notes; contributors can add and comment but cannot delete or wipe. Every action is attributed by name.</> },
      { label: 'The link', body: <>A hiring manager gets a link, no account. Name, LinkedIn, a résumé, and why they were strong. It arrives in the Inbox.</> },
      { label: 'The Inbox', body: <>Two minutes a day: accept or reject. Accepting runs the same duplicate check as any import.</> },
    ],
  },
  profile: {
    title: 'What a profile keeps',
    intro: 'The point of a profile is the one fact your ATS threw away: why they did not get it.',
    steps: [
      { label: 'The story', body: <>Every process they ran with you, what they finished as, and the reason in the recruiter’s own words.</> },
      { label: 'Fit', body: <>The four parts of the score for the role you have selected — skills, seniority, pay and timing — and the flags behind them.</> },
      { label: 'Last contact', body: <>Every touch: notes, drafts, sends, replies. That is what "spoke 3 weeks ago" is counting.</> },
    ],
  },
  inbox: {
    title: 'The Inbox',
    intro: 'Everything a teammate, a link, a mailbox or a capture proposed. Nothing here is on the bench yet.',
    steps: [
      { label: 'Accept', body: <>Runs the same duplicate check as an import, then puts them on the bench with the sender as the source badge.</> },
      { label: 'Reject', body: <>Keeps the record so the same person is not proposed to you twice, but never puts them on the bench.</> },
      { label: 'Ask', body: <>If a capture arrived without an email, the person who sent it is the one who can fill it in. Their name is on the row.</> },
    ],
  },
  connections: {
    title: 'What connects, and what it can do',
    intro: 'Every connection here is read-only until you click something. Nothing is ever sent on your behalf.',
    steps: [
      { label: 'Outlook', body: <>Signs in with your Microsoft account, reads the folders you choose for résumés and replies, and drafts messages. Sending always needs your click.</> },
      { label: 'Google Drive', body: <>Keeps a snapshot of your bench so it survives a cleared browser, and, once shared, is how your team sees the same bench.</> },
      { label: 'Everything else', body: <>Greenhouse, Lever, LinkedIn: exports today, live connections later. LinkedIn has no API we are allowed to use, so Capture is the honest way in.</> },
    ],
  },
};
