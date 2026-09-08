# Silver Medalist HQ v2 — Box Art & Design (Fable 5.1, 2026-09-08)

## The one line
**The bench that works while you sleep.** Every strong candidate who came second is kept warm, re-matched the moment a new role lands, and one click away from a personal outreach — so the next hire comes from people you already know and liked.

## Who it is for, and the moment it wins
A recruiter or talent lead who has run 50+ searches. They *know* the silver medalists exist; they live in old spreadsheets and ATS graveyards. The winning moment: a new role arrives, they paste the JD, and within seconds the bench visibly lights up: three faces glide toward the role, scores counting up, and a warm, specific email is already written. They send it. A reply lands the same afternoon. That is the product. Everything else serves that 30 seconds.

## Why the current build feels basic (honest)
Static kanban, modals, sample data of two people, nothing moves, nothing explains itself, no story of *why this person now*. It is a form, not a bench.

## The experience (what a buyer sees, in order)

1. **Landing = The Bench (talent radar).** Full-bleed dark graphite canvas. Open roles are anchors; silver medalists are orbiting nodes drawn toward the roles they fit (force layout driven by match score). Warmth is visible: recently touched candidates glow, neglected ones fade toward grey. Hover shows a mini card; click opens the dossier drawer. Filter chips: role, skill, location, warmth, comp band. Search everywhere (⌘K palette).
2. **Paste a JD → "Sync the bench".** A scanning sweep crosses the radar; candidate nodes re-score with counting numbers; the top three physically move to the role and a right-hand "Shortlist" panel fills with cards ranked by fit, each with a one-line *why now* ("Came 2nd to a stronger backend hire at PayNord in May; wanted more ownership; comp within band").
3. **Dossier drawer (the CRM heart).** Header: name, current role, warmth meter (days since touch, decaying), comp expectation gauge vs role band. Tabs: Story (timeline of every process, where they finished second and the recorded reason), Fit (radar chart: skills / seniority / comp / location / timing; risk flags), Notes, Activity (every touch, every email, every reply). Actions: Reach out, Move to stage, Schedule follow-up, Add note, Mark placed. Everything logs to Activity.
4. **Outreach composer.** Streams the email as it is written (Groq). Tone chips (warm / direct / short). Sequence steps: Day 0 email, Day 3 nudge, Day 7 LinkedIn note, each editable; follow-ups become reminders on the bench (warmth meter resets on send). Copy, open in mail client, or export. Never sends silently.
5. **Pipeline board.** Warm → Reached out → Replied → Interviewing → Offer → Placed / Passed. Drag with spring physics and keyboard; moving a card logs the action and asks the one question that matters ("what did they say?") to keep the story honest. Stale cards (no touch in 14 days) pulse a quiet amber.
6. **ROI strip.** Animated counters: hours saved, agency fees avoided, placements from the bench, median time-to-first-reply. Computed from real activity, clearly labelled estimates where estimated.
7. **Onboarding.** Three screens: "This is your bench" → "Paste a role" → "Send the first email". A realistic sample bench (12 candidates × 5 roles with stories) so a buyer sees the magic in 60 seconds; "Start my own bench" wipes it. Import: CSV, LinkedIn export, bulk résumé parse (Gemini vision), or type.

## Design language
Graphite `#0e1013` ground, silver `#c9ced6` ink, one accent: electric teal `#35e0c8` (matches = teal, warnings = amber `#f5b53f`, placed = green). Type: Inter for UI, a display serif for headlines (keep the "HQ" gravitas). Motion: framer-motion springs, 200–400 ms crossfades, counters ease out, radar physics at 60 fps, `prefers-reduced-motion` respected. Light theme available. Every control has a hover/active state; nothing is a dead div.

## Intelligence, cheaply
- **Batched scoring**: one Groq `openai/gpt-oss-120b` JSON call per role scores *all* candidates (never per-pair); results cached by hash(role+candidate set) in a server LRU and in IndexedDB; re-score only what changed.
- **Streaming** for every piece of prose (why-now lines, emails). Gemini 2.5 Flash only for résumé vision; `gemini-3.5-flash-lite` fallback. Nothing paid per token.
- **Explainable**: every score shows its four sub-scores and the sentence that justifies it; the user can override and the override is remembered.
- **Memory**: notes, overrides and reasons are first-class data, so the bench gets smarter with use.

## Data
Local-first: IndexedDB (Dexie) with a schema: candidates, roles, processes (candidate × role history), matches, activities, sequences, settings. Optional Google Drive sync (existing owner flow) as an encrypted JSON snapshot. Export everything as CSV/JSON any time. No Supabase.

## Non-goals (v2)
No multi-tenant teams, no sending email on the user's behalf, no ATS integrations. Those are Phase 3.

## Definition of done (what the Fable check will test)
- A buyer with zero context understands the bench in 10 seconds and has sent (copied) a personal email in 60.
- Paste a real JD → scores for 12 candidates appear in under 4 s with animation; shortlist explains *why now* for each.
- Radar, board drag, dossier tabs, sequences, reminders, ROI counters all work with keyboard and touch; 60 fps; zero console errors; FCP < 1.2 s.
- Reload keeps everything; sample bench loads instantly; "start my own" wipes cleanly; Drive sync still works for the owner.
- Mobile 390 px: bench becomes a ranked list with the same actions.
