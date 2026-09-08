# Council seat: Staff Engineer — ship it in one build

## 1. Minimal architecture

**Dexie schema** (`src/db/db.ts`, v1, all `id` string ULIDs):
```
candidates    id, name, *skills, warmthAt, stage, updatedAt
roles         id, title, status, createdAt, updatedAt
processes     id, candidateId, roleId, finishedAs, reason, date   [&[candidateId+roleId]]
matches       id, roleId, candidateId, score, sub, why, override, hash, updatedAt
activities    id, candidateId, type, at, body
sequences     id, candidateId, roleId, steps, dueAt
settings      key
```
Dexie is the only writer; UI reads via `useLiveQuery`. `dataService` becomes a thin facade so existing callers survive; boot migrates `sm_jobs/sm_candidates/sm_matches` from localStorage once, then sets `settings.migratedV2`.

**AI batching contract** — one call per role, never per pair. `POST /api/score` `{role, candidates:[{id,name,skills,comp,lastProcess}]}` → strict JSON:
```json
{"roleId":"r1","scored":[{"candidateId":"c1","score":87,
 "sub":{"skills":90,"seniority":80,"comp":75,"timing":95},
 "why":"Came 2nd at PayNord in May; wanted more ownership.","flags":["comp above band"]}]}
```
Server validates with a hand-rolled guard (no zod needed), drops malformed rows, never throws a blank board.

**Caching.** Reuse `api/_lib/fastai.ts`'s LRU verbatim but key on `hash(roleFingerprint + sortedCandidateFingerprints)` and raise TTL to 60 min. Client: Dexie `matches.hash` — identical hash ⇒ zero network, instant re-score animation. Only changed candidates go in the payload; unchanged rows are merged from Dexie.

**Drive survives.** `driveService` keeps its folder/token logic untouched. Add `snapshot.json` (`{v:2, updatedAt, tables:{...}}`) written debounced 3 s after any Dexie change; keep writing legacy `jobs.json`/`candidates.json` for one release. Load order: Drive snapshot if `updatedAt` newer than local, else local; conflict shows a banner, never silently clobbers.

## 2. Three builders, zero collisions

B1 writes `src/types/` first (~30 min), freezes it, then all three run.

| Builder | Owns |
|---|---|
| **B1 data+AI** | `src/db/**`, `src/services/**`, `api/**`, `src/lib/sampleBench.ts` |
| **B2 bench** | `src/features/bench/**` (radar, force worker), `src/features/dossier/**`, `src/features/outreach/**` |
| **B3 shell** | `src/ui/**` (tokens, primitives), `src/features/board/**`, `src/features/onboarding/**`, `src/app/**` (routes, ⌘K, ROI strip), `index.css` |

`src/App.tsx` is deleted; `src/main.tsx` is touched once by B3. No file has two owners.

## 3. Libraries (gzipped budget: **≤ 190 kB** initial JS)

- `d3-force` only (~12 kB) — not react-force-graph. Simulation in a Web Worker, positions applied to SVG via refs, never React state.
- `@dnd-kit/core` + `/sortable` (~30 kB) — keyboard sensor built in; beats react-beautiful-dnd (unmaintained, no React 19).
- `framer-motion` via `LazyMotion` + `domAnimation` (~18 kB) — never the full `motion` bundle.
- `dexie` + `dexie-react-hooks` (~28 kB). Radar chart hand-rolled SVG — no chart library.
- Route-split onboarding, composer and bulk-upload with `React.lazy`.

## 4. Risks

1. **Malformed JSON at 12 candidates** → `json:true`, `reasoning_effort:'low'`, per-row validation + one retry, deterministic keyword fallback score so the board is never empty.
2. **Radar jank** → worker + rAF + refs; cap 150 nodes; `prefers-reduced-motion` renders static.
3. **Builder drift** → frozen types, ownership table, each builder must `npm run build` green before done.
4. **Drive clobber across devices** → single versioned snapshot, `updatedAt` compare, debounced writes.
5. **25 s lambda / 20-rpm limit** → one call per role, stream prose, client cache, friendly 429 copy.

## 5. Definition of done

Playwright: onboarding→copy email ≤60 s; paste JD→12 scores <4 s (`performance.mark`); dossier tabs; dnd-kit drag **and** keyboard move logs activity; reload persists; "start my own" wipes; 390 px list mode; zero console errors. Lighthouse FCP <1.2 s, initial JS ≤190 kB. Radar: ≥55 fps median over 5 s.
