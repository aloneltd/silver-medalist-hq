import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { AppUIProvider, useAppUI } from './store';
import { AppShell } from './AppShell';
import { RolesView } from './RolesView';
import { ToastProvider, Skeleton } from '../ui';
import { TodayView } from '../features/today';
import { useDossierLink } from './useDossierLink';

// Route-split the heavier screens so the initial bundle stays lean (BLUEPRINT-v2.md: ≤190kB
// gzipped initial JS). Today (the landing route) stays eager for fast first paint.
const BenchView = lazy(() => import('../features/bench/BenchView').then(m => ({ default: m.BenchView })));
const MapView = lazy(() => import('../features/map').then(m => ({ default: m.MapView })));
const BoardView = lazy(() => import('../features/board').then(m => ({ default: m.BoardView })));
const ImportView = lazy(() => import('../features/import').then(m => ({ default: m.ImportView })));
const SettingsView = lazy(() => import('../features/settings').then(m => ({ default: m.SettingsView })));

function RoutePane({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="smhq-page">
          <Skeleton height={28} width={220} />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function BenchRoute() {
  const { selectedRoleId, openComposer } = useAppUI();
  const { openCandidate } = useDossierLink();
  return (
    <BenchView
      roleId={selectedRoleId ?? undefined}
      onOpenCandidate={openCandidate}
      onCompose={(candidateId, roleId) => openComposer({ candidateId, roleId })}
    />
  );
}

/**
 * One-time boot: migrate any v1 localStorage data, seed the pre-scored sample bench if the DB
 * is still empty (dataService.init — both are idempotent), then, for the Drive-signed-in
 * owner, run the newer-of/conflict Drive sync once per sign-in. Safe to re-run on every load.
 *
 * There is no sign-in gate in front of this any more: the workspace is local to the browser,
 * so a first-time visitor lands straight on Today with a bench that is already scored.
 */
function useBoot() {
  const { user, mode, accessToken } = useAuth();
  useEffect(() => {
    if (!user) return;
    dataService.init().catch(e => console.warn('[boot] init skipped:', e));
  }, [user]);

  useEffect(() => {
    if (mode !== 'google' || !accessToken) return;
    dataService.syncWithDrive(accessToken).catch(e => console.warn('[boot] Drive sync skipped:', e));
  }, [mode, accessToken]);
}

function AppRoutes() {
  useBoot();
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayView />} />
        <Route path="bench" element={<RoutePane><BenchRoute /></RoutePane>} />
        <Route path="map" element={<RoutePane><MapView /></RoutePane>} />
        <Route path="board" element={<RoutePane><BoardView /></RoutePane>} />
        <Route path="roles" element={<RolesView />} />
        <Route path="import" element={<RoutePane><ImportView /></RoutePane>} />
        <Route path="settings" element={<RoutePane><SettingsView /></RoutePane>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppUIProvider>
          <AppRoutes />
        </AppUIProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
