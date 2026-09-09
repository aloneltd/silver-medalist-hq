import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/dataService';
import { AppUIProvider } from './store';
import { ToastProvider } from '../ui';
import { ShellV3 } from '../v3/shell/ShellV3';
import { HelpProvider } from '../v3/help/HelpProvider';
import { Home } from '../v3/routes/Home';
import { Skel } from '../v3/ui';

/**
 * v3 routing. Home is eager (it is the landing route and the FCP budget lives there); every
 * other screen is split, so the initial JS stays under the 220 kB gz gate in the build brief.
 * The importers in particular are heavy (pdfjs, mammoth, a zip reader) and must never be in
 * the first chunk — they load when somebody actually drops a file.
 */
const People = lazy(() => import('../v3/routes/People').then(m => ({ default: m.People })));
const Roles = lazy(() => import('../v3/routes/Roles').then(m => ({ default: m.Roles })));
const Sources = lazy(() => import('../v3/routes/Sources').then(m => ({ default: m.Sources })));
const Team = lazy(() => import('../v3/routes/Team').then(m => ({ default: m.Team })));
const InboxRoute = lazy(() => import('../v3/routes/InboxRoute').then(m => ({ default: m.InboxRoute })));
const ProfilePage = lazy(() => import('../v3/routes/ProfilePage').then(m => ({ default: m.ProfilePage })));
const BoardRoute = lazy(() => import('../v3/routes/BoardRoute').then(m => ({ default: m.BoardRoute })));
const Connections = lazy(() => import('../v3/routes/Connections').then(m => ({ default: m.Connections })));
const Capture = lazy(() => import('../v3/routes/Capture').then(m => ({ default: m.Capture })));
const AddToBench = lazy(() => import('../v3/routes/AddToBench').then(m => ({ default: m.AddToBench })));

function RoutePane({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="p-container">
          <Skel height={44} width={280} />
          <div className="p-col p-gap-3 p-mt-8">
            <Skel height={96} /><Skel height={96} /><Skel height={96} />
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/**
 * One-time boot: migrate any v1 localStorage data and seed the pre-scored sample bench if the
 * DB is empty (both idempotent), then, for the Drive-signed-in owner, run the Drive sync once.
 * There is no sign-in gate in front of this: a stranger lands on a bench that is already alive.
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
      {/* Public, logged-out, outside the shell: a hiring manager on a phone between meetings. */}
      <Route path="/add/:token" element={<RoutePane><AddToBench /></RoutePane>} />

      <Route element={<ShellV3 />}>
        <Route index element={<Home />} />
        <Route path="people" element={<RoutePane><People /></RoutePane>} />
        <Route path="roles" element={<RoutePane><Roles /></RoutePane>} />
        <Route path="sources" element={<RoutePane><Sources /></RoutePane>} />
        <Route path="team" element={<RoutePane><Team /></RoutePane>} />
        <Route path="inbox" element={<RoutePane><InboxRoute /></RoutePane>} />
        <Route path="p/:id" element={<RoutePane><ProfilePage /></RoutePane>} />
        <Route path="board" element={<RoutePane><BoardRoute /></RoutePane>} />
        <Route path="connections" element={<RoutePane><Connections /></RoutePane>} />
        <Route path="capture" element={<RoutePane><Capture /></RoutePane>} />
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
          <HelpProvider>
            <AppRoutes />
          </HelpProvider>
        </AppUIProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
