import { create } from 'zustand';
import type { Mode } from '../pages/registry';

export type Theme = 'light' | 'dark';
const THEME_KEY = 'labinsight.theme';

type UiState = {
  theme: Theme;
  slicersOpen: boolean; // mobilní zásuvka s filtry
  lastMode: Mode; // mód pro stránky mimo módy (datový model, O datech)
  toggleTheme: () => void;
  setSlicersOpen: (open: boolean) => void;
  setLastMode: (mode: Mode) => void;
};

export const useUi = create<UiState>((set) => ({
  // index.html už nastavil třídu .dark podle uložené volby / systému
  theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  slicersOpen: false,
  lastMode: 'clinical',
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* ignorujeme */
      }
      return { theme };
    }),
  setSlicersOpen: (slicersOpen) => set({ slicersOpen }),
  setLastMode: (lastMode) => set({ lastMode }),
}));
