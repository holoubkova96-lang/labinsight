import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DbGate } from './components/layout/DbGate';
import { Spinner } from './components/ui/States';
import Landing from './pages/Landing';
import ModePage from './pages/ModePage';

const ErDiagram = lazy(() => import('./pages/ErDiagram'));
const About = lazy(() => import('./pages/About'));

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
          <Route
            path="er"
            element={
              <Suspense fallback={<Spinner />}>
                <ErDiagram />
              </Suspense>
            }
          />
          <Route
            path="about"
            element={
              <Suspense fallback={<Spinner />}>
                <About />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
