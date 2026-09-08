# Silver Medalist HQ v2.1 — addendum (Fable 5.1, 2026-09-08)

Mark, after using v2: "make it that I can also sign into Outlook and connect. I don't understand the map. I think you can make it 10x more amazing." This addendum extends BLUEPRINT-v2.md; where they conflict, this wins.

## A. Microsoft sign-in + Outlook connect
- Auth: MSAL.js (browser, PKCE, no secret) next to Google. `VITE_MS_CLIENT_ID` (+ optional `VITE_MS_TENANT`, default `common`). Sign-in gives identity; Drive sync stays Google-only for now (Microsoft OneDrive sync = Phase 3). Local workspace remains the default; either sign-in is optional.
- Connect Outlook (Settings → Connections, and inline in the composer): Graph scopes `User.Read`, `Mail.ReadWrite`, `Mail.Send` (Send requested only when the user enables "allow sending from HQ"), `Calendars.Read` (optional, for "when did we last meet"). Token in memory/session via MSAL cache; never stored in Dexie.
- Composer with Outlook connected: "Create draft in Outlook" (Graph `POST /me/messages`, opens the draft in Outlook web via `webLink`), "Send from Outlook" (explicit click + confirm; logs `email_sent`), plus the existing Copy / mailto. Sequences: each step can be turned into a real Outlook draft on its day.
- Reply detection: every 15 minutes while the app is open (and on demand), query Graph `me/mailFolders/inbox/messages?$search="from:<candidate email>"` since the last outreach; a reply auto-moves the person to **Replied**, logs an activity with the snippet, and shows a Today card "X replied — read". Read-only, never deletes or marks anything.
- Honest states: no client id → the buttons explain what Mark must register (one screen in Settings with copy-paste values: redirect URI `https://<host>/auth/microsoft`, platform SPA, scopes). Token expired → re-consent prompt, nothing silent.
- Registration steps for Mark (documented in PROJECT.md): Entra admin center → App registrations → New (Single-page application, redirect `https://silver-medalist-hq-zeta.vercel.app/auth/microsoft` and `https://silver-medalist-hq.vercel.app/auth/microsoft` and `http://localhost:5173/auth/microsoft`) → API permissions: Microsoft Graph delegated User.Read, Mail.ReadWrite, Mail.Send, Calendars.Read → copy the Application (client) ID → `vercel env add VITE_MS_CLIENT_ID production` on both projects.

## B. The Map becomes **The Target**
- Metaphor a recruiter gets in one glance: the selected role is the bullseye. Every candidate is a dot placed by fit: closer to the center = better fit (radius = 100 − fit, three rings labelled "Strong fit 80+", "Possible 60–79", "Not a fit yet"). Angle is stable per person (hash), so the picture never jumps. Colour = warmth (teal fresh → grey cold), size = seniority, status glyph for silent/took-role/do-not.
- Header: "Who should you contact for **Staff SRE**?" One sentence under it: "Closer to the center means a stronger fit. Teal means you spoke recently; grey means they've gone cold." Legend inline. Top 5 labelled. Hover = fit ring card; click = dossier; `Enter` on a focused dot opens; arrow keys walk dots by fit rank.
- **Rewind**: a time slider (today → 12 months back) that recomputes warmth colours and hides people who weren't on the bench yet, animating dots between states (d3 transitions). Caption changes: "6 months ago, 14 of these were warm." Deterministic; reduced-motion = instant.
- Quadrant filter: click a ring to filter the Bench to it. Empty ring shows a plain sentence, never an empty canvas.
- Mobile: rings shrink, labels move below; still tappable.

## C. 10× more
1. **Daily Brief** at the top of Today: 3–5 streaming sentences from real bench data (resurface windows opening this week, replies detected, stale-but-strong people, the role with the best shortlist) with inline actions. Cached per day per bench hash; regenerates when the bench changes. Groq first.
2. **Natural-language ⌘K**: type "snooze everyone who took a role until spring", "show staff engineers in Berlin under 200k who are warm", "draft a warm note to Kofi" → a compact JSON plan (Groq, JSON mode, cached), previewed as chips ("Snooze 7 people until 2027-03-01 · Apply"), applied only on Enter. Falls back to plain search.
3. **People like this** in the dossier: five lookalikes by skills/seniority/location/comp (local cosine on tag vectors, zero AI), each with a one-line reason and a Reach out button.
4. **Staged first load**: rows and cards enter in a 400 ms stagger once per session (framer LazyMotion), proof line counts up once. Never replays.
5. **Reply → Replied**: see A; with Outlook not connected, the Board card offers "Mark replied" manually with the same UI.
6. **Weekly digest** button in Today: composes a plain-text digest (placements, replies, stale-strong) to copy or draft in Outlook.

## Builders (file ownership, branch `v2-1`)
- **B1 (integration)**: `src/services/microsoftAuth.ts`, `src/services/outlookService.ts`, `src/services/replyWatcher.ts`, `api/nl-command.ts`, `api/brief.ts`, `src/services/nlCommand.ts`, `src/lib/lookalikes.ts`, tests.
- **B2 (target + brief + palette UI)**: `src/features/map/**` (rewrite as Target + Rewind), `src/features/today/DailyBrief.tsx`, `src/app/CommandPalette.tsx` (NL mode), `src/features/dossier/Lookalikes.tsx`, composer Outlook buttons in `src/features/outreach/**`, Settings → Connections panel in `src/features/settings/Connections.tsx`, staged first-load motion.
B1 lands the service interfaces (typed stubs) in its first commit so B2 can wire against them.

## Definition of done (Fable check)
Target readable by a stranger in 10 s (ask: "who would you contact?"); Rewind animates 12 months in ≤ 2 s; Daily Brief streams in < 2 s from real data; ⌘K "snooze everyone who took a role until spring" previews then applies; lookalikes appear for every candidate; Microsoft sign-in reaches Microsoft's prompt when `VITE_MS_CLIENT_ID` is set and shows the exact registration steps when it isn't; "Create draft in Outlook" works against Graph with a real token (verified by Mark or with a test tenant); reply detection moves a card with a simulated inbox response in tests; zero console errors; bundle ≤ 220 kB gz initial (MSAL adds ~40 kB; lazy-load it on the sign-in click).

## Council amendments (accepted, these override the sections above)
- **Target = target + clock.** Distance = fit (rings 80+/60–79/<60). Angle = time since last contact: 12 o'clock = this week, clockwise to 12 months at 11 o'clock; two tick labels ("this week", "6 months"). Colour = status only (active teal, silent grey, took role blue, do-not amber, opted-out red); warmth is no longer double-encoded. Header "Who to contact for {role}"; sub-line verbatim pattern: "Closer to the middle = better fit. Around the clock = how long since you spoke; top is this week, bottom is six months ago. {N} people sit {top-right/…}: strong fit, going quiet."
- **Rewind → Drift.** Default = today with faint 6-month trails behind dots that have moved (cooled). Dragging scrubs positions and hides not-yet-benched people; release snaps back to today. Caption: "6 months ago, {a} of these were warm. {b} have cooled since." + button "Add those {b} to Today" (creates Today items with reason "cooled since spring").
- **NL ⌘K preview.** Chips carry count + editable resolved values + expandable removable name chips ("Snooze 7 people until [1 Mar 2027 ▾]"); Apply is a separate keypress (never the Enter that submitted); plans touching > 10 people open the name list first; one undo entry in the same words.
- **Daily Brief facts.** Code computes every fact and count (resurfaces opening, replies, stale-strong, best shortlist) into a JSON fact list; the model only orders and phrases it; never predictions, off-bench info, mood, or names it wasn't handed; every sentence links to a person or a filter; opening line format "{Weekday} {D Month} — {N} things need you. {biggest fact}."; no facts → "Nothing needs you today."
- **Cut C6 (weekly digest).**
