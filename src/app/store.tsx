import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Role, Channel } from '../types';
import { SETTINGS_KEYS } from '../types';
import { dataService } from '../services/dataService';
import { aiService } from '../services/aiService';
import { useToast } from '../ui';

export type ThemeName = 'graphite' | 'paper';
const THEME_STORAGE_KEY = 'smhq_theme';
/** FLIP window — the reorder plays once per sync, capped at 300ms per BLUEPRINT-v2.md. */
const FLIP_WINDOW_MS = 340;

export interface ComposerRequest {
  candidateId: string;
  roleId?: string;
  tone?: 'warm' | 'direct' | 'short';
  sequenceStep?: 0 | 3 | 7;
  /** which channel initiated the compose, informational only */
  channel?: Channel;
}

export type SyncPhase = 'idle' | 'syncing' | 'error';

export interface SyncProgress {
  /** 1-based wave that has landed so far (0 while the first is still in flight). */
  wave: number;
  totalWaves: number;
  scored: number;
  fallbackCount: number;
}

export interface SyncSummary {
  roleId: string;
  scored: number;
  fallbackCount: number;
  at: number;
}

interface AppUIContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;

  roles: Role[];
  selectedRoleId: string | null;
  setSelectedRoleId: (id: string | null) => void;
  selectedRole: Role | null;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  pasteRoleOpen: boolean;
  openPasteRole: () => void;
  closePasteRole: () => void;

  composer: ComposerRequest | null;
  openComposer: (req: ComposerRequest) => void;
  closeComposer: () => void;

  railCollapsed: boolean;
  setRailCollapsed: (v: boolean) => void;

  /** ---- one shared sync, so the bench, the shortlist and the map all react to it ---- */
  syncPhase: SyncPhase;
  syncRoleId: string | null;
  syncProgress: SyncProgress | null;
  syncError: string | null;
  /** Set for ~340ms right after a sync — gates the one-time FLIP reorder. */
  flipActive: boolean;
  /** The last completed sync, used by the shortlist's entrance and the why-now reveal. */
  lastSync: SyncSummary | null;
  runSync: (roleId: string) => Promise<void>;

  /** First-run coach mark on "Paste a role" — dismissed for good after the first sync. */
  coachDismissed: boolean;
  dismissCoach: () => void;

  /** v2.1 — set by the Target when a ring is clicked (DESIGN-v2.1.md §B: "Clicking a ring
   * filters the Bench"); the Bench view reads this to pre-filter by fit range. Cleared by
   * setting it back to null (e.g. the Bench's own filter chips take over from here). */
  benchFitFilter: { min: number; max: number; label: string } | null;
  setBenchFitFilter: (f: { min: number; max: number; label: string } | null) => void;
}

const AppUIContext = createContext<AppUIContextValue | null>(null);

const COACH_KEY = 'smhq_coach_paste_dismissed';

function readInitialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'graphite' || saved === 'paper') return saved;
  } catch { /* ignore */ }
  return 'graphite';
}

/** Central shell UI state: theme, the top-bar role selector, the command palette, the
 * paste-a-role flow, the outreach composer request queue, and the shared bench sync. */
export function AppUIProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readInitialTheme);
  const [selectedRoleId, setSelectedRoleIdState] = useState<string | null>(() => {
    try { return localStorage.getItem('smhq_selected_role'); } catch { return null; }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pasteRoleOpen, setPasteRoleOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerRequest | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const { push } = useToast();

  const [syncPhase, setSyncPhase] = useState<SyncPhase>('idle');
  const [syncRoleId, setSyncRoleId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [flipActive, setFlipActive] = useState(false);
  const [lastSync, setLastSync] = useState<SyncSummary | null>(null);
  const flipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // useRef, not useState: two clicks in one JS tick both read stale state.
  const syncing = useRef(false);

  const [coachDismissed, setCoachDismissed] = useState(() => {
    try { return localStorage.getItem(COACH_KEY) === '1'; } catch { return false; }
  });

  const [benchFitFilter, setBenchFitFilter] = useState<{ min: number; max: number; label: string } | null>(null);

  const roles = useLiveQuery(() => db.roles.orderBy('updatedAt').reverse().toArray(), [], []) ?? [];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
    db.settings.put({ key: SETTINGS_KEYS.theme, value: theme }).catch(() => {});
  }, [theme]);

  // Default to the most recently updated open role once roles load, if nothing selected yet.
  useEffect(() => {
    if (roles.length === 0) return;
    if (selectedRoleId && roles.some(r => r.id === selectedRoleId)) return;
    const openRole = roles.find(r => r.status === 'open') ?? roles[0];
    if (openRole) setSelectedRoleIdState(openRole.id);
  }, [roles, selectedRoleId]);

  const setSelectedRoleId = useCallback((id: string | null) => {
    setSelectedRoleIdState(id);
    try {
      if (id) localStorage.setItem('smhq_selected_role', id);
      else localStorage.removeItem('smhq_selected_role');
    } catch { /* ignore */ }
  }, []);

  const dismissCoach = useCallback(() => {
    setCoachDismissed(true);
    try { localStorage.setItem(COACH_KEY, '1'); } catch { /* ignore */ }
  }, []);

  /**
   * The sync. One shared run for the whole app: the bench skeletons, the wave counter, the
   * map's transition and the shortlist's entrance are all reading the same state, so a sync
   * started from any screen looks the same everywhere. Rows are written wave by wave, which
   * is what makes the bench fill progressively instead of sitting behind a global spinner.
   */
  const runSync = useCallback(async (roleId: string) => {
    if (!roleId || syncing.current) return;
    syncing.current = true;
    setSyncPhase('syncing');
    setSyncRoleId(roleId);
    setSyncError(null);
    setSyncProgress({ wave: 0, totalWaves: 0, scored: 0, fallbackCount: 0 });

    try {
      const prepared = await dataService.prepareScoreRequest(roleId);

      if (prepared.unchanged) {
        // Identical fingerprint to what's already stored — zero network, per BLUEPRINT-v2.md.
        setSyncProgress(null);
        setSyncPhase('idle');
        setLastSync({ roleId, scored: prepared.candidates.length, fallbackCount: 0, at: Date.now() });
        push('Bench already up to date for this role.', { tone: 'neutral' });
        return;
      }

      const totalWaves = Math.max(1, Math.ceil(prepared.candidates.length / aiService.WAVE_SIZE));
      setSyncProgress({ wave: 0, totalWaves, scored: 0, fallbackCount: 0 });

      // Each wave is written the moment it lands — that progressive fill IS the sync
      // animation. The writes are collected and awaited at the end so "synced" only ever
      // claims what actually reached the database.
      const writes: Promise<unknown>[] = [];
      const result = await aiService.scoreRole(prepared.role, prepared.candidates, wave => {
        writes.push(dataService.applyScoreResults(roleId, prepared.hash, wave.rows));
        setSyncProgress({
          wave: wave.wave,
          totalWaves: wave.totalWaves,
          scored: wave.scoredSoFar,
          fallbackCount: wave.fallbackSoFar,
        });
      });
      await Promise.all(writes);

      setSyncPhase('idle');
      setSyncProgress(null);
      setLastSync({ roleId, scored: result.scored.length, fallbackCount: result.fallbackCount, at: Date.now() });
      if (!coachDismissed) dismissCoach();

      setFlipActive(true);
      if (flipTimer.current) clearTimeout(flipTimer.current);
      flipTimer.current = setTimeout(() => setFlipActive(false), FLIP_WINDOW_MS);

      const kw = result.fallbackCount;
      push(
        `Bench synced · ${result.scored.length} scored${kw ? ` · ${kw} keyword fit${kw === 1 ? '' : 's'}` : ''}`,
        { tone: kw === result.scored.length && kw > 0 ? 'neutral' : 'success' },
      );
    } catch (e) {
      setSyncProgress(null);
      setSyncError(e instanceof Error ? e.message : 'Could not sync the bench — please try again.');
      setSyncPhase('error');
    } finally {
      syncing.current = false;
    }
  }, [push, coachDismissed, dismissCoach]);

  useEffect(() => () => { if (flipTimer.current) clearTimeout(flipTimer.current); }, []);

  const setTheme = useCallback((t: ThemeName) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState(t => (t === 'graphite' ? 'paper' : 'graphite')), []);

  const openComposer = useCallback((req: ComposerRequest) => setComposer(req), []);
  const closeComposer = useCallback(() => setComposer(null), []);
  const openPasteRole = useCallback(() => setPasteRoleOpen(true), []);
  const closePasteRole = useCallback(() => setPasteRoleOpen(false), []);

  const selectedRole = useMemo(
    () => roles.find(r => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const value: AppUIContextValue = {
    theme, setTheme, toggleTheme,
    roles, selectedRoleId, setSelectedRoleId, selectedRole,
    paletteOpen, setPaletteOpen,
    pasteRoleOpen, openPasteRole, closePasteRole,
    composer, openComposer, closeComposer,
    railCollapsed, setRailCollapsed,
    syncPhase, syncRoleId, syncProgress, syncError, flipActive, lastSync, runSync,
    coachDismissed, dismissCoach,
    benchFitFilter, setBenchFitFilter,
  };

  return <AppUIContext.Provider value={value}>{children}</AppUIContext.Provider>;
}

export function useAppUI(): AppUIContextValue {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error('useAppUI must be used within <AppUIProvider>');
  return ctx;
}
