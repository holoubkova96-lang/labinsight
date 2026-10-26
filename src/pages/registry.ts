import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Mode = 'clinical' | 'business';
export const MODES: Mode[] = ['clinical', 'business'];

type PageDef = { id: string; component?: LazyExoticComponent<ComponentType> };

/** Stránky obou módů v pořadí navigace. Bez komponenty = zatím placeholder. */
export const PAGES: Record<Mode, PageDef[]> = {
  clinical: [
    { id: 'overview', component: lazy(() => import('./clinical/Overview')) },
    { id: 'results', component: lazy(() => import('./clinical/Results')) },
    { id: 'critical', component: lazy(() => import('./clinical/Critical')) },
    { id: 'qc', component: lazy(() => import('./clinical/QualityControl')) },
    { id: 'tat', component: lazy(() => import('./clinical/Tat')) },
    { id: 'patient', component: lazy(() => import('./clinical/Patient')) },
    { id: 'correlation', component: lazy(() => import('./clinical/Correlation')) },
    { id: 'ordering', component: lazy(() => import('./clinical/Ordering')) },
  ],
  business: [
    { id: 'overview', component: lazy(() => import('./business/Overview')) },
    { id: 'frequency', component: lazy(() => import('./business/Frequency')) },
    { id: 'breakeven', component: lazy(() => import('./business/BreakEven')) },
    { id: 'makebuy', component: lazy(() => import('./business/MakeOrBuy')) },
    { id: 'lifecycle', component: lazy(() => import('./business/Lifecycle')) },
    { id: 'payers', component: lazy(() => import('./business/Payers')) },
    { id: 'requesters', component: lazy(() => import('./business/Requesters')) },
    { id: 'pnl' },
    { id: 'whatif' },
    { id: 'forecast' },
  ],
};

export function isMode(v: string | undefined): v is Mode {
  return v === 'clinical' || v === 'business';
}
