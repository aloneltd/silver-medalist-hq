# Silver Medalist HQ — Project Record

## Live URLs
- **Production (new Vercel account, primary):** https://silver-medalist-hq-zeta.vercel.app
- **Production (old Vercel account, kept in sync):** https://silver-medalist-hq.vercel.app
- **GitHub:** https://github.com/aloneltd/silver-medalist-hq (branch `main`; `v2-1` merged in)

## Status (v2.1, 2026-09-08)
- [x] Full v2 rebuild: React + TypeScript + Tailwind v4 + Vite + Dexie (IndexedDB)
- [x] v2.1 addendum shipped: Microsoft/Outlook integration scaffold, the Target (map rebuild),
      Drift (time scrub), Daily Brief, natural-language ⌘K, lookalikes, staged first-load motion
- [x] TypeScript build passes cleanly; 157 unit tests pass (`npm test`)
- [x] Bundle: 167 kB gz initial JS (budget 220 kB for v2.1, MSAL lazy-loads on the sign-in click)
- [x] Pushed to GitHub, deployed to both Vercel accounts
- [x] GEMINI_API_KEY + GROQ_API_KEY set (Groq is the primary fast-inference provider now; Gemini
      is the vision/fallback provider — see `api/_lib/fastai.ts`)
- [x] Google sign-in (Drive sync) — `VITE_GOOGLE_CLIENT_ID` set; local workspace is the default,
      Drive sync is opt-in from Settings
- [ ] **Microsoft/Outlook sign-in is NOT registered yet** — `VITE_MS_CLIENT_ID` is unset on both
      Vercel projects. Until Mark completes the one-time Entra registration below, Settings →
      Connections shows the exact steps (with copy buttons) instead of a working sign-in button,
      and the composer's "Create draft in Outlook" stays disabled with an honest inline reason.
      Everything else in the app works fully without this.

## Required Environment Variables

### Both Vercel projects (old account `m-7231s-projects` and new account `mark-9439`)

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | shared Gemini key | vision / fallback provider |
| `GROQ_API_KEY` | shared Groq key | primary fast-inference provider (`openai/gpt-oss-120b` → `-20b`) |
| `VITE_GOOGLE_CLIENT_ID` | OAuth web client id (the shared "Mark SEF website" client) | Drive sync sign-in. Needs each new domain added to **Authorized JavaScript origins** on that client |
| `VITE_MS_CLIENT_ID` | **not set yet** | Microsoft/Outlook sign-in — see registration steps below |

### One-time Microsoft/Entra registration (Mark only — Console/Entra access required)

1. Go to the Entra admin center: `entra.microsoft.com → Identity → Applications → App registrations → New registration`.
2. Name: `Silver Medalist HQ`.
3. Supported account types: `Accounts in any organizational directory and personal Microsoft accounts`.
4. Platform: `Single-page application (SPA)`.
5. Redirect URIs (add all of these — one SPA platform entry, multiple URIs):
   - `https://silver-medalist-hq-zeta.vercel.app/auth/microsoft`
   - `https://silver-medalist-hq.vercel.app/auth/microsoft`
   - `http://localhost:5173/auth/microsoft` (local `npm run dev`)
   - Also add whatever `http://localhost:<port>/auth/microsoft` you're actually testing against — the
     in-app Settings → Connections panel always shows the exact current-host value to copy.
6. API permissions → Add a permission → Microsoft Graph → Delegated permissions:
   `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `Calendars.Read`.
7. Copy the **Application (client) ID** from the app registration's Overview page.
8. Set it on both Vercel projects: `vercel env add VITE_MS_CLIENT_ID production` (run once per
   project — old account default config, and again with `--global-config ~/.vercel-mark2` for the
   new account project), then redeploy both.

Settings → Connections in the live app has every one of these values behind a one-click Copy
button, so this can be done without retyping anything.

## What's Built (v2.1)

### Screens (left rail)
Today · Bench · Map (**the Target**) · Board · Roles · Import · Settings — plus the outreach
composer and candidate dossier as drawers, and the ⌘K command palette overlay.

### Today
- **Proof line** — real counts ("N people you already interviewed and liked · N worth a message
  today"), never placeholder copy.
- **Daily Brief** — 3–5 sentences at the top, computed entirely from live bench facts (resurface
  windows, unanswered replies, stale-but-strong candidates, best shortlist for the selected role,
  sequence steps due). Code computes every fact/count; Groq only orders and phrases them — a
  server-side validator rejects any AI phrasing that introduces a name or raw identifier that
  isn't in the fact list, falling back to a deterministic template sentence. Cached per
  (day, bench-hash); regenerates only when the bench actually changes.
- Reason-carrying cards (resurfacing soon, waiting on you, strong fits gone quiet, best shortlist,
  follow-ups due) each with a one-tap action.

### Bench
Virtualized list (smooth at 3,000+ rows), sort by fit/warmth/name/status, multi-select + bulk
actions, keyboard-first (`j`/`k` move, `Enter` open, `e` compose, `s` snooze, `1`–`6` stage), CSV
import with dedupe + merge preview.

### The Target (formerly "the Map")
A bullseye, not a scatter chart. Distance from centre = fit for the selected role (three labelled
rings: Strong fit 80+ / Possible 60–79 / Not yet). Angle around the dial = time since last
contact (12 o'clock = this week, clockwise to six months). Colour = status only. Header names the
role in plain language ("Who to contact for {role}?"); the sub-line is a computed sentence, e.g.
"2 people sit top-right: strong fit, going quiet." Arrow keys walk candidates by fit rank, `Enter`
opens the dossier, clicking a ring filters the Bench to it.

**Drift** — a scrub slider (today → 6 months back) with faint trails showing who's cooled. Drag or
use arrow keys to scrub (keyboard focus scrubs continuously, same as a drag — release with
`Enter`/`Escape`/blur to snap back to today); the caption always reports "{N} were warm {M} months
ago, {K} have cooled since" with a one-click "Add those K to Today" action. Fully instant (no
animation) when the browser's reduced-motion preference is on.

### ⌘K command palette — natural language mode
Plain typing still jumps to a person, a role, or a shell action. A command-shaped query (a verb,
or more than 3 words — e.g. "snooze everyone who took a role until spring") switches to NL mode:
Groq resolves it to a strict JSON plan against the live bench, shown as a preview with an editable
date, an expandable/removable list of the exact people it will touch, and a live count. Applying is
a **separate** keystroke (⌘⏎) from the Enter that submitted the text, so nothing fires by accident;
one undo entry is kept and reverts every touched record to its own prior value (not a blanket
reset). Plans touching more than 10 people force the name list open first. Falls back to a plain
text search if the command can't be parsed.

### Dossier
"People like this" tab — five lookalikes by skills/seniority/location/comp (pure local cosine
similarity, no AI call), each with a one-line reason and a Reach out button.

### Board
Warm → Reached out → Replied → Interviewing → Offer → Placed | Passed. Drag or the keyboard-twin
stage picker; every move asks "what did they say?" and logs it. A "Reached out" card also offers
a manual **Mark replied** button (the same UI Outlook's automatic reply-detection would drive, for
when Outlook isn't connected) — moves the card and logs the note exactly like a real reply would.

### Outreach composer
Streaming draft (tone chips: Warm/Direct/Short), Day 0/3/7 sequence steps, Copy / Open in mail app
always available. "Create draft in Outlook" is always visible but disabled with an inline honest
reason until Outlook is connected; "Send from Outlook" only appears once both Outlook is connected
and sending has been explicitly enabled, and always confirms before it actually leaves the mailbox.

### Settings → Connections
Theme (Graphite/Paper), Google Drive sync, data export, sample-bench reset — plus the Microsoft/
Outlook panel described above.

### Data
Dexie (IndexedDB), fully local-first. Deterministic seeded sample bench (60 candidates × 8 roles)
loads on first run; "Start my own bench" wipes it. Everything survives a reload. Google Drive sync
is opt-in and additive, never required.

### Technical
- `POST /api/score`, `/api/outreach`, `/api/ingest-jd`, `/api/parse-resume`, `/api/brief`,
  `/api/nl-command` — all through `api/_lib/fastai.ts`'s shared provider ladder (Groq first,
  Gemini fallback), with an in-memory LRU cache and a per-IP rate limit.
- Deploy: `git push` to `aloneltd/silver-medalist-hq` (both Vercel accounts are git-linked to the
  same repo/branch).

## Known caveats (buyer-facing honesty)
- Microsoft/Outlook sign-in needs the one-time Entra registration above before it does anything —
  until then the app says so plainly, it never pretends to be connected.
- Google Drive sync needs the JS origin authorized per-domain on the shared OAuth client (same as
  before); local workspace works with zero setup either way.

## Future
- Microsoft OneDrive sync (Phase 3, per DESIGN-v2.1.md — sign-in first, Drive-equivalent sync later)
- Weekly digest (explicitly cut from v2.1 by council amendment — Today's Daily Brief replaced it)
- Multi-tenant / team mode
