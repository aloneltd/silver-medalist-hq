import { lazy, Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Inbox, Users, Map as MapIcon, Kanban, Briefcase, Upload, Settings as SettingsIcon,
  Search, Sun, Moon, Menu,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppUI } from './store';
import { useDossierLink } from './useDossierLink';
import { CommandPalette } from './CommandPalette';
import { PasteRoleFlow } from './PasteRoleFlow';
import { SampleBenchBanner } from './SampleBenchBanner';
import { Kbd } from '../ui';

// Lazy: both are conditionally-rendered overlays (only mount once a candidate/composer request
// exists), and OutreachComposer in particular pulls in the AI streaming call — keeping these out
// of the initial chunk is part of B3's bundle guard (BLUEPRINT-v2.md: ≤190kB gzipped initial JS).
const DossierDrawer = lazy(() => import('../features/dossier').then(m => ({ default: m.DossierDrawer })));
const OutreachComposer = lazy(() => import('../features/outreach').then(m => ({ default: m.OutreachComposer })));

const NAV = [
  { to: '/', label: 'Today', icon: Inbox, end: true },
  { to: '/bench', label: 'Bench', icon: Users },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/board', label: 'Board', icon: Kanban },
  { to: '/roles', label: 'Roles', icon: Briefcase },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

/** The shell: left rail + top bar + routed content. Mounts CommandPalette, PasteRoleFlow and
 * the dossier drawer (via the `?c=` deep link) once, globally, so every route can trigger them. */
export function AppShell() {
  const { theme, toggleTheme, roles, selectedRoleId, setSelectedRoleId, openPasteRole, setPaletteOpen, railCollapsed, setRailCollapsed, composer, closeComposer } = useAppUI();
  const { user, mode, signOut } = useAuth();
  const { candidateId, closeCandidate } = useDossierLink();

  return (
    <div className={`smhq-shell ${railCollapsed ? 'smhq-shell-rail-collapsed' : ''}`}>
      <a href="#smhq-main" className="smhq-skip-link">Skip to content</a>

      <aside className="smhq-rail" aria-label="Primary">
        <button
          type="button"
          className="smhq-rail-toggle"
          onClick={() => setRailCollapsed(!railCollapsed)}
          aria-label={railCollapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <Menu size={18} />
        </button>
        <div className="smhq-rail-brand">
          <span className="smhq-rail-mark" aria-hidden="true">SM</span>
          <span className="smhq-rail-brand-text">Silver Medalist HQ</span>
        </div>
        <nav className="smhq-rail-nav">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `smhq-rail-link ${isActive ? 'smhq-rail-link-active' : ''}`}
            >
              <item.icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="smhq-rail-footer">
          <button type="button" className="smhq-rail-link" onClick={toggleTheme}>
            {theme === 'graphite' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            <span>{theme === 'graphite' ? 'Paper theme' : 'Graphite theme'}</span>
          </button>
          {user && (
            <div className="smhq-rail-user">
              <span className="smhq-rail-user-name">{mode === 'google' ? user.name : 'Local workspace'}</span>
              <button type="button" className="smhq-rail-link-sm" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </aside>

      <div className="smhq-main-col">
        <header className="smhq-topbar">
          <label className="smhq-role-select-wrap">
            <span className="smhq-role-select-label">Role</span>
            <select
              className="smhq-role-select"
              value={selectedRoleId ?? ''}
              onChange={e => setSelectedRoleId(e.target.value || null)}
              aria-label="Selected role"
            >
              {roles.length === 0 && <option value="">No roles yet</option>}
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.title}{r.status !== 'open' ? ` (${r.status})` : ''}</option>
              ))}
            </select>
          </label>

          <button type="button" className="smhq-btn smhq-btn-primary smhq-btn-md" onClick={openPasteRole}>
            Paste a role
          </button>

          <button
            type="button"
            className="smhq-cmdk-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <Search size={14} aria-hidden="true" />
            <span>Search or jump to…</span>
            <Kbd keys={['⌘', 'K']} />
          </button>
        </header>

        <SampleBenchBanner />

        <main id="smhq-main" className="smhq-content" tabIndex={-1}>
          <Outlet />
        </main>

        <nav className="smhq-mobile-tabbar" aria-label="Primary">
          {NAV.slice(0, 5).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `smhq-mobile-tab ${isActive ? 'smhq-mobile-tab-active' : ''}`}
            >
              <item.icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <CommandPalette />
      <PasteRoleFlow />
      <Suspense fallback={null}>
        {candidateId && <DossierDrawer candidateId={candidateId} onClose={closeCandidate} />}
        {composer && (
          <OutreachComposer candidateId={composer.candidateId} roleId={composer.roleId} onClose={closeComposer} />
        )}
      </Suspense>
    </div>
  );
}
