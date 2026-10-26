import { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DbGate } from './components/layout/DbGate';
import { Spinner } from './components/ui/States';
import Landing from './pages/Landing';
import ModePage from './pages/ModePage';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          element={
            <DbGate>
              <AppShell />
            </DbGate>
          }
        >
          <Route
            path=":mode/:page"
            element={
              <Suspense fallback={<Spinner />}>
                <ModePage />
              </Suspense>
            }
          />
          <Route path="sql" element={<Placeholder titleKey="nav.sqlLab" />} />
          <Route path="er" element={<Placeholder titleKey="nav.er" />} />
          <Route path="about" element={<Placeholder titleKey="nav.about" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
