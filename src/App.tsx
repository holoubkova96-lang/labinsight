import { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DbGate } from './components/layout/DbGate';
import { Spinner } from './components/ui/States';
import Landing from './pages/Landing';
import ModePage from './pages/ModePage';

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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
