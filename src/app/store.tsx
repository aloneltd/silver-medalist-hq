import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Role, Channel } from '../types';
import { SETTINGS_KEYS } from '../types';

export type ThemeName = 'graphite' | 'paper';
const THEME_STORAGE_KEY = 'smhq_theme';

export interface ComposerRequest {
  candidateId: string;
  roleId?: string;
  tone?: 'warm' | 'direct' | 'short';
  sequenceStep?: 0 | 3 | 7;
  /** which channel initiated the compose, informational only */
  channel?: Channel;
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
}

const AppUIContext = createContext<AppUIContextValue | null>(null);

function readInitialTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'graphite' || saved === 'paper') return saved;
  } catch { /* ignore */ }
  return 'graphite';
}

/** Central shell UI state: theme, the top-bar role selector, the command palette, the
 * paste-a-role flow, and the outreach composer request queue. Today/Board/Import/Settings and
 * B2's bench/map/dossier/outreach all read this instead of each inventing their own context. */
export function AppUIProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readInitialTheme);
  const [selectedRoleId, setSelectedRoleIdState] = useState<string | null>(() => {
    try { return localStorage.getItem('smhq_selected_role'); } catch { return null; }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pasteRoleOpen, setPasteRoleOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerRequest | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const roles = useLiveQuery(() => db.roles.orderBy('updatedAt').reverse().toArray(), [], []) ?? [];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
    db.settings.put({ key: SETTINGS_KEYS.theme, value: theme }).catch(() => {});
  }, [theme]);

  // Default to the most recently updated open role once roles load, if nothing selected yet.
  useEffect(() => {
    if (selectedRoleId || roles.length === 0) return;
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
  };

  return <AppUIContext.Provider value={value}>{children}</AppUIContext.Provider>;
}

export function useAppUI(): AppUIContextValue {
  const ctx = useContext(AppUIContext);
  if (!ctx) throw new Error('useAppUI must be used within <AppUIProvider>');
  return ctx;
}
