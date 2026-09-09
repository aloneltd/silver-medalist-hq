import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Users, Briefcase, Inbox as InboxIcon, Search, Moon, Sun, Target } from 'lucide-react';
import { useAppUI } from '../../app/store';
import { useAuth } from '../../contexts/AuthContext';
import { useDossierLink } from '../../app/useDossierLink';
import { useHelp } from '../help/HelpProvider';
import { HowThisWorksDrawer } from '../help/HelpProvider';
import { Tour } from '../help/Tour';
import { dataService } from '../../services/dataService';
import { V3_SETTINGS_KEYS } from '../../types';
import { initialsOf } from '../ui';


// Overlays: mounted once, globally, so any screen can trigger them — and lazy, because each
// pulls real weight (the AI streaming call, the NL planner) that must stay out of first paint.
const AskPalette = lazy(() => import('../ask/AskPalette').then(m => ({ default: m.AskPalette })));
const PasteRoleFlow = lazy(() => import('../../app/PasteRoleFlow').then(m => ({ default: m.PasteRoleFlow })));
const ProfileDrawer = lazy(() => import('../profile/ProfileDrawer').then(m => ({ default: m.ProfileDrawer })));
const OutreachComposer = lazy(() => import('../../features/outreach').then(m => ({ default: m.OutreachComposer })));

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true, tour: 'nav-home' },
  { to: '/people', label: 'People', icon: Users, tour: 'nav-people' },
  { to: '/roles', label: 'Roles', icon: Briefcase, tour: 'nav-roles' },
  { to: '/sources', label: 'Sources', icon: Target, tour: 'nav-sources' },
  { to: '/team', label: 'Team', icon: InboxIcon, tour: 'nav-team' },
];

function BrandMark() {
  return (
    <span className="p-brand-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--p-accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" />
      </svg>
    </span>
  );
}

function MeMenu() {
  const { theme, toggleTheme } = useAppUI();
  const { user, mode, googleConfigured, signIn, signOut } = useAuth();
  const { startTour } = useHelp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = mode === 'google' && user?.name ? user.name : 'You';

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="p-me" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Your account and settings">
        {initialsOf(name)}
      </button>
      {open && (
        <div className="p-menu" role="menu">
          <div className="p-menu-head">
            <div className="p-strong">{name}</div>
            <div className="p-meta">{mode === 'google' ? 'Signed in with Google · Drive sync on' : 'Local workspace, in this browser'}</div>
          </div>
          <button type="button" role="menuitem" className="p-menu-item" onClick={() => { toggleTheme(); setOpen(false); }}>
            {theme === 'paper' ? <Moon size={16} /> : <Sun size={16} />}
            {theme === 'paper' ? 'Dark theme' : 'Paper theme'}
          </button>
          <button type="button" role="menuitem" className="p-menu-item" onClick={() => { setOpen(false); startTour(); }}>
            Take the tour again
          </button>
          <Link role="menuitem" className="p-menu-item" to="/connections" onClick={() => setOpen(false)}>Connections and data</Link>
          {mode === 'local' && googleConfigured && (
            <button type="button" role="menuitem" className="p-menu-item" onClick={() => { setOpen(false); signIn(); }}>Sign in with Google</button>
          )}
          {mode === 'google' && (
            <button type="button" role="menuitem" className="p-menu-item" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The v3 shell: one top bar on every screen, a persistent "How this works" link that never
 * hides, and the four global overlays. Everything below the bar is the route.
 */
export function ShellV3() {
  const { setPaletteOpen, composer, closeComposer, pasteRoleOpen } = useAppUI();
  const { openHelp, startTour } = useHelp();
  const { candidateId, closeCandidate } = useDossierLink();
  const location = useLocation();

  // The tour runs itself on a first visit — the one interruption a stranger forgives, and the
  // fastest way to the "within 10 seconds you know what this is" bar in DESIGN-v3.
  useEffect(() => {
    let cancelled = false;
    dataService.getSetting(V3_SETTINGS_KEYS.tourDone, false).then(done => {
      if (!cancelled && !done) setTimeout(() => startTour(), 900);
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  return (
    <div className="p-app">
      <a className="p-skip" href="#main">Skip to content</a>

      <header className="p-nav">
        <Link className="p-brand" to="/"><BrandMark /><span>Silver Medalist</span></Link>
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-tour={item.tour}
            className={({ isActive }) => `p-navlink${isActive ? ' p-on' : ''}`}
          >
            {item.label}
          </NavLink>
        ))}
        <div className="p-nav-right">
          <button type="button" className="p-ask" onClick={() => setPaletteOpen(true)} data-tour="ask">
            <Search size={16} aria-hidden="true" />
            <span>Ask anything, or find a person…</span>
            <span className="p-kbd">⌘K</span>
          </button>
          <button type="button" className="p-btn p-btn-ghost p-btn-sm" onClick={openHelp} data-tour="how">
            How this works
          </button>
          <MeMenu />
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="p-tabbar" aria-label="Primary">
        {NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'p-on' : '')}>
            <item.icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <Suspense fallback={null}>
        <AskPalette />
        {pasteRoleOpen && <PasteRoleFlow />}
        {candidateId && <ProfileDrawer candidateId={candidateId} onClose={closeCandidate} key={location.key} />}
        {composer && <OutreachComposer candidateId={composer.candidateId} roleId={composer.roleId} onClose={closeComposer} />}
      </Suspense>

      <HowThisWorksDrawer />
      <Tour />
    </div>
  );
}
