import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import { useFilters } from './store/filters';
import { initialHashParams, paramsToFilters } from './store/urlState';

// Filtry ze sdíleného odkazu nastavíme ještě před prvním vykreslením
useFilters.getState().replaceAll(paramsToFilters(initialHashParams()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
