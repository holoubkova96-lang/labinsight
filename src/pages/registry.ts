import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type Mode = 'clinical' | 'business';
export const MODES: Mode[] = ['clinical', 'business'];

type PageDef = { id: string; component?: LazyExoticComponent<ComponentType> };

/** Stránky obou módů v pořadí navigace. Bez komponenty = zatím placeholder. */
export const PAGES: Record<Mode, PageDef[]> = {
  clinical: [
    { id: 'overview', component: lazy(() => import('./clinical/Overview')) },
    { id: 'results' },
    { id: 'critical' },
    { id: 'qc' },
    { id: 'tat' },
    { id: 'patient' },
    { id: 'correlation' },
    { id: 'ordering' },
  ],
  business: [
    { id: 'overview' },
    { id: 'frequency' },
    { id: 'breakeven' },
    { id: 'makebuy' },
    { id: 'lifecycle' },
    { id: 'payers' },
    { id: 'requesters' },
    { id: 'pnl' },
    { id: 'whatif' },
    { id: 'forecast' },
  ],
};

export function isMode(v: string | undefined): v is Mode {
  return v === 'clinical' || v === 'business';
}
