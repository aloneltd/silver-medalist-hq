# Silver Medalist HQ v3 — Design (Fable 5.1, 2026-09-09)

Mark, after v2.1: "I feel like it got worse. It should gather résumés (people) from multiple sources — ATSs, emails, LinkedIn, job boards, Slack channels, groups, anywhere — and it should be able to interact with multiple people that can bring them into the one place. The UI can be 10× better. More examples inside, explain things better."

## What "worse" means, honestly
v2/v2.1 optimised for density and a power user: dark console, small type, many chips, a bench table, jargon ("fit", "warmth", "drift"). A first-time visitor sees a control room, not a product that makes their week easier. v3 flips the priority: **clarity and warmth first, power one click deeper.**

## The product in one sentence (unchanged)
Every strong candidate who came second, from everywhere you meet them, kept warm in one place your whole team can use, and re-matched the moment a new role lands.

## Three pillars of v3

### 1. Sources — people from anywhere, into one bench
A **Sources** hub: cards per connector with status, last sync, count, and a big "Add people" button. Everything lands in the same bench with a merge preview (dedupe on email, LinkedIn URL, or name + employer).
- **Drop anything**: résumés (PDF/DOCX, many at once), spreadsheets, exported CSV/JSON from any ATS (Greenhouse, Lever, Ashby, Workable, Teamtailor, Bullhorn), LinkedIn Recruiter/Sales Navigator exports, job-board exports (LinkedIn Jobs, Indeed, Welcome to the Jungle), Slack channel exports (JSON zip). AI maps unknown columns to our fields and shows the mapping before import; résumés are parsed with vision; every import is undoable.
- **Email inbox**: connect Outlook (done) or Gmail; a "Scan for résumés" action finds messages with CV attachments or "applied for" subjects in a chosen folder/label and proposes people to add; reply detection continues.
- **LinkedIn / any web page**: a **Capture** bookmarklet (no extension install): on a profile page, one click posts name, headline, location, URL and the visible text to the app, which structures it and offers "Add to bench". Same bookmarklet works on any job board or ATS profile page.
- **Google Drive folder**: point at a folder of résumés; new files are parsed on sync (owner token).
- **Forward-to-bench**: a personal address (later, Phase 3.1; needs a mailbox service) — shown as "coming soon" honestly.
- Every person keeps a **source badge** and the original link; the Story tab shows where they came from and when.

### 2. Team — several people, one bench
- The owner connects Google Drive once; the bench becomes a **shared store** (per-record JSON in the Drive folder with a change log; last-writer-wins per field with timestamps; conflicts shown, never silently lost).
- **Invite teammates**: they sign in with Google; the owner shares the Drive folder to them (app does it via Drive permissions API) and they get the same bench. Roles: owner, editor, contributor (can add and comment, cannot delete or wipe).
- **Add-to-bench link**: a public, expiring form URL a hiring manager or colleague can use without an account: name, LinkedIn, résumé upload, "why they were strong", which role. Lands in an **Inbox** for review before joining the bench.
- **Presence and attribution**: every activity shows who did it; the Today brief says "Dana added 3 people yesterday"; comments per person.

### 3. A UI that is 10× better, and explains itself
- **Direction**: bright, generous, editorial. Default **Paper** theme (warm white, ink #17181c, one accent teal #0f9d8a, soft shadows, 16–18 px body, big serif headlines), dark as an option. Whitespace is a feature. Fewer chips, more sentences.
- **Home** (replaces Today as the landing): a headline that talks like a colleague ("Good morning, Mark. 5 people are worth a message today, and Kofi replied."), the Daily Brief as prose with inline avatars, the paste-a-role box as a real hero, and three big doors: **People**, **Roles**, **Sources**.
- **People** (replaces "Bench" wording): cards or list toggle; each card shows a face/initials, one-line story ("came second for Staff SRE in May; lost to an internal hire"), fit for the selected role as a plain phrase with the number ("Strong fit · 94"), and days since you spoke in words ("spoke 3 weeks ago").
- **The Target** stays but with a caption in the corner that reads like a person explaining it, and a "Show me" walkthrough that highlights one dot and narrates it.
- **Guided examples everywhere**: every screen has a "How this works" drawer with a 3-step story using the sample people (Kofi, Elena, Chiara), a sample role and real UI captures; an in-app **Tour** (8 stops) on first visit; empty states that show the exact next click; tooltips on every term ("fit", "warmth", "resurface") with a one-line definition.
- **Plain language pass**: rename "Sync the bench" → "Match this role", "Drift" → "Who's going cold", "Neural Sync" gone, "dossier" → "Profile", "warmth" → "last contact".
- **Motion**: only the four earned moments (rows re-ranking, prose streaming, drag, the Target transitions), softer and slower on Paper.

## Keep from v2.1 (it works)
Data model, scoring waves, outreach composer, Outlook/Graph, NL ⌘K (rename to "Ask"), Daily Brief facts pipeline, lookalikes, Drive snapshot. Rewire them into the new shell; do not rewrite.

## Non-goals (v3)
No native LinkedIn API (not available to us), no automatic scraping, no sending email without a click, no ATS write-back.

## Definition of done (Fable check)
A stranger opens the link and within 10 seconds can say what it does and what to click; the Tour runs; drop a folder of 5 PDFs → 5 people with a mapping preview → merged; import a Greenhouse CSV with 2 duplicates → merge preview; Capture bookmarklet adds a LinkedIn profile from a saved sample page; invite flow shares the Drive folder and a second Google account sees the same bench (verified with a test account or documented if only one account is available); Add-to-bench link works logged out and lands in Inbox; every screen has "How this works" with the sample story; Paper theme default passes contrast; zero console errors; FCP < 1.2 s; bundle ≤ 250 kB.
