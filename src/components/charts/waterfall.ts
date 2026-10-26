import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams, EChartsOption } from 'echarts';
import type { Step } from '../../domain/pnl';
import { axisStyle, baseOption, type ChartTheme } from './chartTheme';

/**
 * Waterfall (vodopádový) graf: každý krok je obdélník od průběžného součtu před
 * krokem do součtu po kroku. Součtové sloupce začínají na nule. Vlastní
 * vykreslení (custom series) funguje i při záporných mezisoučtech.
 */
export function waterfallOption(
  steps: Step[],
  theme: ChartTheme,
  label: (key: string) => string,
  fmt: (v: number) => string,
  axisFmt: (v: number) => string,
  tooltipFmt: (v: number) => string = fmt,
): EChartsOption {
  let running = 0;
  const bars = steps.map((s, i) => {
    const start = s.kind === 'total' ? 0 : running;
    const end = s.kind === 'total' ? s.value : running + s.value;
    running = end;
    const color =
      s.kind === 'total'
        ? i === 0
          ? theme.series[0]
          : s.value >= 0
            ? theme.series[2]
            : theme.critical
        : s.value >= 0
          ? theme.series[0]
          : theme.series[1];
    return { value: [i, start, end, s.value], itemStyle: { color } };
  });

  return {
    ...baseOption(theme),
    legend: { show: false },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const v = (p as { value: number[] }).value;
        return `<b>${label(steps[v[0]].key)}</b><br/>${tooltipFmt(v[3])}`;
      },
    },
    xAxis: {
      type: 'category',
      data: steps.map((s) => label(s.key)),
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, interval: 0, width: 90, overflow: 'break' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: axisFmt },
    },
    series: [
      {
        type: 'custom',
        renderItem: (_p: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
          const i = api.value(0) as number;
          const a = api.coord([i, api.value(1)]);
          const b = api.coord([i, api.value(2)]);
          const width = (api.size?.([1, 0]) as number[])[0] * 0.6;
          const top = Math.min(a[1], b[1]);
          const height = Math.max(Math.abs(a[1] - b[1]), 1);
          const v = api.value(3) as number;
          return {
            type: 'group',
            children: [
              {
                type: 'rect',
                shape: { x: a[0] - width / 2, y: top, width, height, r: 3 },
                style: { fill: api.visual('color') as string },
              },
              {
                type: 'text',
                style: {
                  text: fmt(v),
                  x: a[0],
                  y: top - 6,
                  // custom series používá textAlign / textVerticalAlign
                  textAlign: 'center',
                  textVerticalAlign: 'bottom',
                  fill: theme.text2,
                  fontSize: 11,
                },
              },
            ],
          };
        },
        encode: { x: 0, y: [1, 2] },
        data: bars,
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: theme.muted },
          label: { show: false },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  };
}
