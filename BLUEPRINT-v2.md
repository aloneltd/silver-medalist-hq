# Silver Medalist HQ v2 — Blueprint (final, after council) — Fable 5.1, 2026-09-08

Read DESIGN-v2.md for intent and council/{recruiter,designer,engineer}.md for the critique. This file is the contract builders follow. Where it conflicts with DESIGN-v2.md, this file wins.

## Council verdict, applied
- **Landing = Today + Bench, not a physics radar.** Screen one: a proof line with real numbers ("47 people you already interviewed and liked · 6 worth a message today"), the paste-a-JD anchor, the **Today queue** (5 people, each with a reason and a one-tap action), then the **Bench** (dense, sortable, keyboard-first list: name, current role + tenure, fit score with four sub-scores on hover, days-since-touch as a number, status chip, *why now* sentence). Filters + ⌘K.
- **The Map is a chart, not a simulation.** Toggle Bench / Map / Board. Map = deterministic scatter (x = fit for the selected role, y = days since touch, size = seniority, colour = status), same input → same pixels, animated transitions between states (d3 transitions on SVG, 300 ms), quadrant labels ("contact now"). Keyboard navigable (arrow keys walk points), tooltips are real cards. No force layout.
- **Motion that explains**: FLIP reorder of bench rows after a sync (≤ 300 ms, plays once); skeletons inside the rows that will hold results; scores count from the *previous* value; streaming prose; drag that follows the finger with no overshoot; stale rows pulse amber once per session, then stay amber.
- **Cut**: onboarding carousel (the live sample bench teaches; one banner "Sample bench · Start my own"), animated ROI theatre. Keep one honest counter: **placements sourced from the bench**, plus a small "estimated" panel behind a disclosure for hours saved.
- **Add**: recruiter statuses and data (below), bulk actions, import with dedupe, sequences → reminders, Today queue.

## Data model (Dexie v1, all ids ULIDs; B1 freezes `src/types/index.ts` first)
- `candidates`: id, name, email?, phone?, linkedin?, location, onsiteDays?, currentEmployer, currentTitle, tenureStart, seniority (junior|mid|senior|staff|principal|exec), seniorityDrift (computed hint), skills[], compAtLastProcess {amount,currency,date}, compExpectation?, noticePeriodDays?, visaNeed?, tags[], status (active|silent|took_role|do_not_reapproach|opted_out), statusReason?, snoozeUntil?, warmthAt (last touch), sourceDate (consent), notes[], createdAt, updatedAt. Indexes: name, *skills, status, warmthAt, updatedAt.
- `roles`: id, title, team?, level, location, onsiteDays?, compBand {min,max,currency}, mustHaves[], niceToHaves[], dealbreakers[], urgency, status (open|filled|paused), hiringManager?, createdAt, updatedAt.
- `processes`: id, candidateId, roleId, date, finishedAs (second|final|shortlist|offer_declined|placed), reason (free text, the thing that must survive), lostTo? (name/req), interviewers?, scorecard? — index &[candidateId+roleId].
- `matches`: id, roleId, candidateId, score, sub {skills,seniority,comp,timing}, why, flags[], override?, hash, updatedAt.
- `activities`: id, candidateId, roleId?, type (touch|email_copied|note|stage|status|reminder|import), at, body, actor.
- `sequences`: id, candidateId, roleId, steps [{day, channel (email|linkedin|call), body, doneAt?}], nextDueAt.
- `settings`: key/value (theme, owner, sample flag, migratedV2, driveSnapshotAt).
Migration: import legacy localStorage `sm_jobs/sm_candidates/sm_matches` once on boot.

## Sample bench (B1 `src/lib/sampleBench.ts`)
60 candidates × 8 roles × ~90 processes with believable names (mixed geographies), realistic reasons ("lost to an internal candidate", "wanted remote", "comp 15% above band"), statuses spread (40 active, 8 silent, 7 took_role with snooze dates, 3 do_not_reapproach, 2 opted_out), warmth spread from 2 to 400 days. Deterministic (seeded) so screenshots are stable.

## Intelligence (B1 `api/` + `src/services/aiService.ts`)
- `POST /api/score` — ONE call per role scores all candidates (batch ≤ 60 per call; chunk beyond), Groq `openai/gpt-oss-120b` JSON mode, `reasoning_effort: low`, strict shape `{roleId, scored:[{candidateId, score, sub{skills,seniority,comp,timing}, why, flags[]}]}`, per-row validation, one retry, deterministic keyword-fit fallback (labelled "keyword fit") so the board is never empty. Excludes status ≠ active from ranking (still visible, greyed, with the reason). Timing sub-score uses tenureStart (18–36 months = prime), snoozeUntil, and last touch.
- `POST /api/outreach` — streaming (Groq), tone chip, uses the process reason, the role, and the candidate's own words from notes; never invents facts; ends with one concrete ask.
- `POST /api/ingest-jd` — JD → role JSON (Groq); `POST /api/parse-resume` — Gemini 2.5 Flash vision (fallback 3.5-flash-lite) → candidate JSON.
- Caching: server LRU from `api/_lib/fastai.ts` keyed by content hash (60 min TTL); client `matches.hash` ⇒ zero network on identical input; only changed candidates are sent. Streaming everywhere prose is shown. Friendly 429 copy. No paid APIs.

## Screens & interactions (B2 bench/dossier/outreach, B3 shell/board)
- Shell: left rail (Today, Bench, Map, Board, Roles, Import, Settings), top bar with role selector + "Paste a role" primary button + ⌘K. Themes: Graphite (default, dark) and Paper (light). Tokens in `src/ui/tokens.css`.
- Today: 5 cards max, each: name, one-line reason, primary action (Reach out / Follow up / Re-check comp / Resurface), snooze. Empty Today = "Your bench is quiet. Paste a role." with the paste box inline.
- Bench: virtualised list (≥ 3,000 rows smooth), sort by fit/warmth/name/status, multi-select with bulk actions (tag, snooze, status, export CSV), row hover shows sub-scores, `j/k` navigate, `Enter` dossier, `e` compose, `1–6` stage, `s` snooze. Import: CSV/LinkedIn export/bulk résumé with dedupe on email or name+employer, merge preview before write.
- Sync: paste JD → role JSON preview (editable) → "Sync the bench" → rows skeleton → scores count from previous → FLIP reorder → Shortlist panel (top 8) with why-now lines streaming in. Map (if open) transitions points.
- Dossier (drawer, `?c=` deep link): header (name, current role & tenure, status chip with reason, warmth number, comp gauge vs selected role band, notice/visa/location chips); tabs Story (processes timeline with reasons, lost-to), Fit (four labelled bars + flags + override slider with remembered reason), Notes, Activity. Actions log to activities; status changes ask for the reason; took_role asks for resurface date (default +18 months).
- Outreach composer: streaming draft, tone chips, sequence steps (Day 0 / 3 / 7) editable, "Copy", "Open in mail app", "Mark sent" (resets warmth, schedules the next step as a reminder). Never sends automatically.
- Board (dnd-kit, keyboard twin): Warm → Reached out → Replied → Interviewing → Offer → Placed | Passed; move asks the one question ("what did they say?"); stale > 14 days amber.
- Settings: theme, owner Drive sync (existing flow; snapshot.json versioned with updatedAt compare and a conflict banner), export all JSON/CSV, "Start my own bench" wipe, "Load sample bench".
- Mobile 390 px: Today + Bench list with the same actions; drawer full-screen; board becomes stage tabs.
- Accessibility: focus rings, aria for the list and drawer, reduced motion honoured.

## Builder split (file ownership; no file has two owners)
- **B1 (data + AI)**: `src/types/**`, `src/db/**`, `src/services/**`, `api/**`, `src/lib/sampleBench.ts`, migration. Ships FIRST: freezes `src/types/index.ts` and a stub `dataService` within the first commit so B2/B3 can code against it.
- **B2 (bench, map, dossier, outreach)**: `src/features/bench/**`, `src/features/map/**`, `src/features/dossier/**`, `src/features/outreach/**`.
- **B3 (shell, board, today, import, settings, tokens)**: `src/ui/**`, `src/app/**`, `src/features/today/**`, `src/features/board/**`, `src/features/import/**`, `src/features/settings/**`, `src/main.tsx`, `index.css`, `vercel.json`.
Libraries: dexie + dexie-react-hooks, @dnd-kit/core + sortable, framer-motion via LazyMotion/domAnimation, d3-scale + d3-transition only for the map (no force), @tanstack/react-virtual. Initial JS ≤ 190 kB gzipped; route-split composer/import/onboarding.

## Definition of done (the Fable check)
Playwright, desktop 1440×900 + 390×844: sample bench visible in < 1.2 s FCP; paste a real JD → 60 rows scored in < 4 s with FLIP + counting; Today queue populated with reasons; open dossier, edit a process reason, change status to took_role (resurface date), all logged; compose outreach streaming, copy, mark sent → warmth resets and a reminder appears; drag on Board and keyboard move both log; bulk select 10 → snooze; import a CSV with a duplicate → merge preview; reload keeps everything; "Start my own bench" wipes; Map transitions and is keyboard navigable at ≥ 55 fps; zero console errors; initial JS ≤ 190 kB; Drive sync still works for the owner (verified up to Google's prompt headlessly).
