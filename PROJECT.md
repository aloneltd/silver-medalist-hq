# Silver Medalist HQ — Project Record

## Live URLs
- **Production:** https://silver-medalist-hq.vercel.app
- **GitHub:** https://github.com/aloneltd/silver-medalist-hq

## Status
- [x] App built (React + TypeScript + Tailwind v4 + Vite)
- [x] TypeScript build passes cleanly
- [x] Pushed to GitHub (aloneltd/silver-medalist-hq)
- [x] Deployed to Vercel (silver-medalist-hq.vercel.app)
- [ ] GEMINI_API_KEY env var needs to be added to Vercel

## Required Environment Variables

### Vercel Dashboard → silver-medalist-hq → Settings → Environment Variables

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Your Gemini API key | Same key as used in architect-forge — add it in Vercel dashboard |

**To add:** https://vercel.com/m-7231s-projects/silver-medalist-hq/settings/environment-variables

## What's Built

### Views
1. **War Board** — Kanban-style: Silver Medalists | Match Pipeline | Open Roles
2. **Jobs Vault** — Full job list with delete; add via JD Ingestor
3. **Silver Vault** — Candidates list with silver-medalist badge; add via form
4. **ROI Analytics** — Savings estimate, hot jobs, hot candidates from AI
5. **Command Center** — Bridge selector, raw JSON editor, danger zone / reset

### AI Features
- **JD Ingestion** — paste job description text → AI extracts structured Job (title, level, comp, skills, dealbreakers)
- **Match Engine** — runs Gemini 2.5 Flash against all jobs × candidates → match score, risk heatmap, redeployment strategy, next actions
- **Email Draft** — AI drafts personalized outreach email per match; copy or export .txt
- **AI Pitch Overlay** — per-action pitch card with copy to clipboard

### Data
- localStorage: `sm_jobs`, `sm_candidates`, `sm_matches`
- Pre-seeded with 2 sample jobs + 2 silver-medalist candidates
- Raw JSON editable in Command Center → Unlock Brain
- Clear & reset to sample data via Danger Zone

### Technical
- API proxy: `POST /api/ai` → Gemini 2.5 Flash (server-side, key never in client)
- Model: `gemini-2.5-flash` (all calls)
- No Supabase — localStorage only (Google Sheets = Phase 2 per blueprint)
- Deploy: git push to GitHub → Vercel auto-deploy

## Future (Blueprint Phase 2)
- Google Sheets as-DB (service account, owner-scoped)
- Real bridge integrations (Slack, Gmail — already available as MCPs)
- Multi-tenant / team mode
- Merge with blink-talent (Decision C — keep standalone per current decision)
