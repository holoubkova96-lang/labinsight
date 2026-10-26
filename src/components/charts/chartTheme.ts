import { useMemo } from 'react';
import { useUi } from '../../store/ui';

export type ChartTheme = {
  series: string[];
  text: string;
  text2: string;
  muted: string;
  grid: string;
  surface: string;
  border: string;
  accent: string;
  critical: string;
  warning: string;
  /** Sekvenční škála jednoho odstínu: první = málo, poslední = hodně (pro tmavý režim obrácená). */
  sequential: string[];
};

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Barvy grafů z CSS proměnných – po přepnutí tématu nebo módu se přepočítají. */
export function useChartTheme(): ChartTheme {
  const theme = useUi((s) => s.theme);
  return useMemo(() => {
    // akcent závisí na módu (atribut data-mode na obalu aplikace)
    const el = document.querySelector('[data-mode]') ?? document.documentElement;
    return {
      series: Array.from({ length: 8 }, (_, i) => cssVar(el, `--series-${i + 1}`)),
      text: cssVar(el, '--text'),
      text2: cssVar(el, '--text-2'),
      muted: cssVar(el, '--muted'),
      grid: cssVar(el, '--grid'),
      surface: cssVar(el, '--surface'),
      border: cssVar(el, '--border'),
      accent: cssVar(el, '--accent') || cssVar(el, '--clinical'),
      critical: cssVar(el, '--critical'),
      warning: cssVar(el, '--warning'),
      sequential:
        theme === 'dark'
          ? ['#1d2a3d', '#184f95', '#2a78d6', '#6da7ec', '#cde2fb']
          : ['#e3eefc', '#9ec5f4', '#3987e5', '#1c5cab', '#0d366b'],
    };
    // theme je záměrná závislost: změna třídy .dark mění hodnoty proměnných
  }, [theme]);
}

/** Společný základ ECharts options: recesivní osy a mřížka, tooltip na povrchu. */
export function baseOption(c: ChartTheme) {
  return {
    color: c.series,
    textStyle: { color: c.text2, fontFamily: 'inherit' },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px;',
    },
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: c.text2 },
    },
  };
}

export function axisStyle(c: ChartTheme) {
  return {
    axisLine: { lineStyle: { color: c.border } },
    axisTick: { show: false },
    axisLabel: { color: c.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: c.grid } },
  };
}
