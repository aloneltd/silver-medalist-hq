/**
 * `BenchView` is deliberately NOT re-exported here. It's the heaviest B2 component
 * (@tanstack/react-virtual + all the bench row logic), and BLUEPRINT-v2.md caps initial JS at
 * 190kB gzipped with the bench route-split out. Re-exporting it from this barrel would pull it
 * into any chunk that imports anything else from here (e.g. Today importing `ShortlistPanel`),
 * defeating that split — Rollup chunks by module reachability, not by which named export is
 * actually used. Import it directly instead: `lazy(() => import('../features/bench/BenchView'))`.
 */
export type { BenchViewProps } from './BenchView';
export { ShortlistPanel } from './ShortlistPanel';
export type { ShortlistPanelProps } from './ShortlistPanel';
export { useSyncBench } from './useSyncBench';
export type { UseSyncBenchResult, SyncPhase } from './useSyncBench';
