# Silver Medalist HQ — Project Record

## Live URLs
- **Production:** https://silver-medalist-hq.vercel.app
- **GitHub:** https://github.com/aloneltd/silver-medalist-hq

## Status
- [x] App built (React + TypeScript + Tailwind v4 + Vite)
- [x] TypeScript build passes cleanly
- [x] Pushed to GitHub (aloneltd/silver-medalist-hq)
- [x] Deployed to Vercel (silver-medalist-hq.vercel.app)
- [x] GEMINI_API_KEY + VITE_GOOGLE_CLIENT_ID set on Vercel
- [ ] Authorize the JS origin on the OAuth client (Google Cloud Console) to enable Drive sign-in
- [ ] Vercel Git integration is not firing for this repo — re-connect in Vercel → Settings → Git (deployed via API meanwhile)

## Required Environment Variables

### Vercel Dashboard → silver-medalist-hq → Settings → Environment Variables

| Variable | Value | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Your Gemini API key | Set (shared key) |
| `VITE_GOOGLE_CLIENT_ID` | OAuth web client id `715096174344-pp2585bv5l2ji2ss1c734pr9mj2etn6e…` | Set 2026-09-07. Google sign-in (Drive sync) also needs `https://silver-medalist-hq.vercel.app` under **Authorized JavaScript origins** on that client — until then Google shows `origin_mismatch` and the app runs in the local workspace |

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
