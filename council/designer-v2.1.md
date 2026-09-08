# Council seat — Product Designer (v2.1 addendum)

## 1. The Target fails; one change fixes it
Radius=fit works. **Angle-by-hash doesn't** — a stranger reads position as meaning, finds none, and stops trusting the picture. A meaningless dimension is worse than none.

Give angle a job: **make it a clock.** Distance = fit; angle = time since contact, 12 o'clock this week, clockwise to 12 months. A target *and* a clock. Colour then drops warmth (now redundant) and carries status only: silent / took the role / do-not-contact.

Header: **"Who to contact for Staff SRE"**
Sub-line, verbatim: *"Closer to the middle = better fit. Around the clock = how long since you spoke; top is this week, bottom is six months ago. 6 people sit top-right: strong fit, going quiet."*
Legend: three ring labels ("Strong fit 80+ / Possible 60–79 / Not yet") and two clock ticks ("this week", "6 months"). Nothing more.

## 2. Rewind is decorative, but salvageable
Recolouring dots answers no question. The recruiter's question isn't history, it's **drift** — who is moving away from me.
- Default **today**, faint 6-month trails already behind drifting dots: useful untouched.
- Dragging scrubs positions and hides not-yet-benched people; release snaps back.
- Caption counts *and* acts: *"6 months ago, 14 of these were warm. 9 have cooled since."* + **"Add those 9 to Today"**. Without that button it's a toy.

## 3. NL ⌘K — two failure modes
**(a) Silent over-reach**: "everyone who took a role" is 7 people to Mark, 23 to the parser.
**(b) Confident misparse** of "spring", "warm", "under 200k" into exact values never shown.
Preview: a chip carrying **count, editable resolved value, expandable names** — "Snooze **7 people** until **[1 Mar 2027 ▾]**", the 7 expanding to removable name chips, the date a real input. Apply is a *separate second* keypress, never the Enter that submitted the query, and writes one undo entry in the same words. Plans over 10 people force the name list open first.

## 4. Daily Brief — the hard boundary
Never: numbers the model computed, predictions ("likely open to a move"), anything off the bench (funding, job moves, news), inferred mood, or a name it wasn't handed. **Code computes every fact and count; the model only orders and phrases a JSON fact list.** Every sentence links to its person or filter. No facts → say so.
Opening line: `{Weekday} {D Month} — {N} things need you. {biggest single fact}.`
e.g. *"Monday 8 September — 3 things need you. Kofi Mensah replied Friday and hasn't been answered."*

## 5. Cut
**C6 Weekly digest** — the Brief with a second pipeline and a second hallucination surface, behind a button nobody presses twice. A week's view is the Brief with a date range.
