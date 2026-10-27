import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { useFilters } from './store/filters';
import { initialHashParams, paramsToFilters } from './store/urlState';

// Po novém nasazení může mít otevřená stránka odkazy na soubory staré verze.
// Vite pak vyvolá 'vite:preloadError' – stránku jednou obnovíme, aby se načetla nová verze.
const RELOAD_KEY = 'labinsight.reloadedAfterDeploy';
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return; // jen jednou, ať nevznikne smyčka
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => {
  // úspěšně načtená stránka smí příště znovu jednou obnovit
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignorujeme */
    }
  }, 10_000);
});

// Filtry ze sdíleného odkazu nastavíme ještě před prvním vykreslením
useFilters.getState().replaceAll(paramsToFilters(initialHashParams()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
