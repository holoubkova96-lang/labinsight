import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption, EChartsType } from 'echarts';

type Props = {
  option: EChartsOption;
  /** Instance grafu (pro export PNG); null po odpojení. */
  onReady?: (chart: EChartsType | null) => void;
  /** Klik kamkoli do pásma kategorie osy X – větší cíl pro cross-filtering. */
  onCategoryClick?: (category: string) => void;
  /** Klik na konkrétní prvek (bod, segment, buňku). */
  onItemClick?: (params: echarts.ECElementEvent) => void;
};

/** Tenký wrapper nad ECharts: init, změna velikosti, aktualizace options a události. */
export function EChart({ option, onReady, onCategoryClick, onItemClick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const handlers = useRef({ onReady, onCategoryClick, onItemClick });

  useEffect(() => {
    handlers.current = { onReady, onCategoryClick, onItemClick };
  });

  useEffect(() => {
    const node = el.current!;
    const c = echarts.init(node);
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(node);

    c.getZr().on('click', (e: { offsetX: number; offsetY: number }) => {
      const cb = handlers.current.onCategoryClick;
      const pt = [e.offsetX, e.offsetY];
      if (!cb || !c.containPixel({ gridIndex: 0 }, pt)) return;
      // ECharts 6 převádí souřadnice přes grid: [index kategorie, hodnota osy Y]
      const [idx] = c.convertFromPixel({ gridIndex: 0 }, pt) as number[];
      const axes = (c.getOption() as { xAxis?: { data?: string[] }[] }).xAxis;
      const cat = axes?.[0]?.data?.[Math.round(idx)];
      if (cat !== undefined) cb(String(cat));
    });
    c.on('click', (p) => handlers.current.onItemClick?.(p as echarts.ECElementEvent));
    handlers.current.onReady?.(c);

    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
      handlers.current.onReady?.(null);
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={el}
      className={`h-full w-full ${onCategoryClick || onItemClick ? 'cursor-pointer' : ''}`}
      role="img"
    />
  );
}
