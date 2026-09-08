# Council seat — Product Designer

## 1. Where the motion is earned, and the radar

Earned, all three for the same reason — they make a state change legible:
- **Shortlist reorder after a JD sync.** FLIP the rows. The animation *is* the explanation: you watch #9 travel to #2. Cap it at 300 ms and it never plays twice.
- **Streaming outreach prose.** Real latency made honest instead of hidden behind a spinner.
- **Direct manipulation on the pipeline board.** The card follows the finger. Kill the spring overshoot — it costs precision and buys nothing.

Decoration: the scanning sweep, the counting-up ROI numbers (animating a static estimate performs freshness it doesn't have), the glow/fade warmth encoding as a *primary* channel, and orbital physics.

**The radar landing: replace.** Force-layout positions are non-deterministic, non-comparable between sessions, unreadable past a dozen nodes, and effectively unavailable to keyboard and screen readers. A recruiter asks "who do I contact today, and why"; a physics toy answers "isn't this pretty."

Replace with **the bench: a dense, sortable, stable table** — the Linear-issue-list move. One row: name, last role, fit score with its four sub-scores on hover, days-since-touch as a number (not a glow), why-now line. Deterministic, permalinkable, keyboard-first. If you want a spatial view, make it a *chart*, not a simulation: a static scatter, x = fit, y = days since touch, same input → same pixels, top-right quadrant labelled "contact now." Same fix for the dossier "Fit radar" — use a labelled bar row.

## 2. Screen one, in order
1. One line of proof with real numbers: "47 people you already interviewed and liked. 6 are worth a message today."
2. The primary action — paste a JD — as the visual anchor, not a toolbar afterthought.
3. The ranked bench, with a name, a score, and a *why now* sentence visible above the fold. A buyer must read a human sentence about a real person within five seconds.
4. Filters and ⌘K.
5. ROI last, static, labelled "estimated."

## 3. Three details that separate wow from demo
- **Empty state is a working state.** No illustration and a "get started" button. Show the sample bench *live and interactive*, with one honest banner: "Sample data — Start my own bench."
- **Loading keeps row identity.** Skeletons in the rows that will hold results, scores counting from the *previous* value, per-row failure with retry — never a blank canvas, never one global spinner. If scoring dies, fall back to deterministic keyword fit, labelled as such.
- **Keyboard is the primary path, drag is the shortcut.** `j/k`, `Enter` to open, `e` to compose, `1–6` to move stage, `⌘K` everywhere; every drag has a keyboard twin. On touch, the mobile list is the same object as desktop with the same actions — not a reduced sibling.

## 4. One add, one cut
**Add: a "Today" queue** — five people, each with a reason and a one-tap action. Without it this is a database; with it, it is a habit.
**Cut: the three-screen onboarding carousel.** The sample bench already teaches it. Nobody buys a slideshow.
