import { create } from 'zustand';

export type Theme = 'light' | 'dark';
const THEME_KEY = 'labinsight.theme';

type UiState = {
  theme: Theme;
  slicersOpen: boolean; // mobilní zásuvka s filtry
  toggleTheme: () => void;
  setSlicersOpen: (open: boolean) => void;
};

export const useUi = create<UiState>((set) => ({
  // index.html už nastavil třídu .dark podle uložené volby / systému
  theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  slicersOpen: false,
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
}));
