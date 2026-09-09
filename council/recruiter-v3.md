# Recruiter seat — on DESIGN-v3

## 1. Sources by real use, and what I can actually export

1. **ATS CSV (daily).** Greenhouse's candidate export: Candidate ID, First/Last, Email, Phone, Job, Stage, Status, Source, Recruiter, Coordinator, Created At, Last Activity, Rejection Reason. Lever adds origin, owner, tags, archive reason. Ashby is cleanest. **None export résumés, scorecards or debrief notes** — the reason they came second lives in the API or nowhere. Build "CSV now, API later", and never imply the notes came along.
2. **Résumé/PDF drop (daily).** My real backlog is a folder.
3. **Email scan (weekly).** Highest-yield unmapped source; attachments carry the résumé the ATS didn't.
4. **LinkedIn (weekly, manual).** Say plainly that Recruiter export is contract-gated and gives name, title, company, location, profile URL, project, stage — **no email**. The bookmarklet is the realistic path.
5. **Slack (rare).** The export zip is `users.json` + `channels.json` + per-channel/per-day message JSON (user IDs, ts, text, files). Emails only in an admin export; names need a `users.json` join; referrals are URLs inside free text. Regex-and-review, not a connector.
6. **Job boards: rarest.**

## 2. Dedupe I trust, and what breaks me
Trust: normalised email (lowercase, strip +tags), LinkedIn slug, E.164 phone. Name + employer is a **suggestion**, never an auto-merge — I have three Sarah Chens.
Merge field-by-field, dated and sourced; a newer source must never blank a filled field. What kills trust for good: a silent merge; one I can't undo per-field; notes landing on the wrong person; and above all a merge that drops **do-not-approach, opted-out or consent date**. Those survive every merge, or the bench is a liability.

## 3. Team flow that survives a real hiring team
Sourcers and the Add-to-bench link **add**; a recruiter **owns** each record and alone edits status; anyone comments. Inbox triage is a two-minute daily job — accept/reject on one key.
The hiring manager won't log in, won't filter, and opens your link **on a phone between meetings**. So: read-only, five people, one card each with the story line, yes/no/maybe, one text box. Their yes writes back as a decision. Anything more and they just reply by email, and you've lost the data again.

## 4. Three things that would have made v2.1 click
- One **worked role, end to end**, with the real sentence I'd paste to the HM.
- **"Fit 94" opened up**: the four facts and weights behind it, clickable to the source.
- **Every field dated and sourced** — "£145k as of Mar 2024, Greenhouse rejection record".

## 5. Cut
**Drift / the time-scrub.** "Who's gone cold" is a list I'd act on; scrubbable history is a demo I'd show once.
