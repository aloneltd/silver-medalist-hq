# Council seat — Product Designer (v3)

## 1. Why v2.1 read as "worse"
1. **Dark console, 13–14 px dense rows** — monitoring skin, not help.
2. **The Target as hero** — two learned encodings (radius=fit, angle=clock) plus a scrub; you study a legend before you get one name.
3. **Vocabulary replaced sentences** — fit / warmth / drift / sync / dossier as undefined chips.

## 2. v3 direction (binding)
**Type** px: 12 meta · 14 secondary · 17/1.6 body · 20 card name · 24 section · 32 page · 44 greeting. Sans Inter→system; serif Instrument Serif→Georgia at 32/44 only. Weights 400/500/600.
**Spacing** 8 (half 4). Gutter 32 desktop, 20 mobile. Card pad 24. Section 48, Home blocks 80.
**Radius** 12 cards+drawers · 8 inputs+buttons · 999 pills; nothing else.
**Shadow**, two only: sm `0 1px 2px rgba(23,24,28,.06)`; md `0 8px 24px -8px rgba(23,24,28,.12)` (hover, drawer). No glows.
**Paper** bg `#FBFAF7` · surface `#FFF` · line `#E8E4DC` · ink `#17181C` · ink-2 `#5A6068` · faint `#9AA0A6` · accent `#0F9D8A` · accent-ink `#0B6E62` · wash `#E7F4F1` · amber `#C77A24` · red `#B3261E`.
**Accent**: one filled accent element per region (the primary button), plus selected state and fit ≥80. Never body text, never a panel background, never two accent buttons on a screen. Status colours are not accent.
**Person card**: pad 24, r12, sm→md hover, min-h 168. R1 avatar 48 (initials on wash) · name 20/600 · role @ company 14 ink-2. R2 story sentence 17 ink-2, 2 lines max. R3 `Strong fit · 94` (accent-ink, tooltip) · dot · `spoke 3 weeks ago`. R4 source badge + one action (`Write to Kofi`) + ⋯. No other chips.
**Home 1440**: 1200 container, 64 top; greeting 44 + brief prose in a 720 column; paste-a-role hero 1200×160; three doors 3-up (376, gutter 24); "Worth a message today" — 5 cards, one column.
**Home 390**: gutter 20, greeting 28, prose, hero 100%×140, doors as three 88-tall rows, cards full width, sticky bottom bar (Home·People·Roles·Sources), 44 px targets.

## 3. Explains itself
**Drawer**: one component, right side 420 (full sheet at 390), opened by a persistent `How this works` link at the right end of every page header. Content keyed by route: the 3-step Kofi/Elena/Chiara story plus one real capture. Esc closes; the link never hides.
**Tour, 8 stops**: greeting/brief → paste-a-role → the fit number → a card's story line → Write to → the Target → Sources → the How-this-works link.
**Tooltips**: *fit* — "How well this person matches the role you pasted: skills, seniority, location, pay. 80+ is strong." *last contact* — "How long since anyone on your team talked to them." *resurface* — "The date we'll bring them back to you, when they're likely ready to move."

## 4. Move to Phase 3.1
The **team layer** (shared Drive store, roles, presence, conflict UI, permission-API invites) and the **public add-to-bench link + Inbox**: a concurrency product of its own, and not what Mark complained about. Keep one import lane — résumé/CSV drop with mapping preview + undo, mailbox scan, Greenhouse CSV. Defer the five other ATSs, Slack exports, the bookmarklet.
