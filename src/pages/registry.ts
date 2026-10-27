import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Mode = 'clinical' | 'business';
export const MODES: Mode[] = ['clinical', 'business'];

type PageDef = { id: string; component: LazyExoticComponent<ComponentType> };

/** Stránky obou módů v pořadí navigace. */
export const PAGES: Record<Mode, PageDef[]> = {
  clinical: [
    { id: 'overview', component: lazy(() => import('./clinical/Overview')) },
    { id: 'results', component: lazy(() => import('./clinical/Results')) },
    { id: 'tat', component: lazy(() => import('./clinical/Tat')) },
  ],
  business: [
    { id: 'overview', component: lazy(() => import('./business/Overview')) },
    { id: 'frequency', component: lazy(() => import('./business/Frequency')) },
    { id: 'lifecycle', component: lazy(() => import('./business/Lifecycle')) },
  ],
};

export function isMode(v: string | undefined): v is Mode {
  return v === 'clinical' || v === 'business';
}
