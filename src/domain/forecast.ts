/**
 * Prognóza měsíčních objemů: Holt-Wintersovo exponenciální vyrovnání
 * (úroveň + trend + aditivní sezónnost). Parametry se vybírají mřížkovým
 * hledáním podle chyby jednokrokové předpovědi. Při krátké řadě (< 2 sezóny)
 * se použije Holtova metoda bez sezónnosti.
 */
export type ForecastResult = {
  fitted: (number | null)[];
  forecast: number[];
  lower: number[];
  upper: number[];
  params: { alpha: number; beta: number; gamma: number; seasonal: boolean };
  residualSd: number;
};

const GRID = [0.05, 0.15, 0.3, 0.5, 0.7];
const Z95 = 1.96;

function run(
  y: number[],
  m: number,
  alpha: number,
  beta: number,
  gamma: number,
  seasonal: boolean,
  horizon: number,
) {
  const n = y.length;
  let level: number;
  let trend: number;
  const season: number[] = new Array(m).fill(0);
  const start = seasonal ? m : 1;

  if (seasonal) {
    const first = y.slice(0, m);
    const second = y.slice(m, 2 * m);
    const mean1 = first.reduce((a, b) => a + b, 0) / m;
    const mean2 = second.reduce((a, b) => a + b, 0) / m;
    trend = (mean2 - mean1) / m;
    // první sezóna bez vlivu trendu; úroveň odpovídá jejímu poslednímu měsíci
    for (let i = 0; i < m; i++) season[i] = first[i] - (mean1 + trend * (i - (m - 1) / 2));
    level = mean1 + (trend * (m - 1)) / 2;
  } else {
    level = y[0];
    trend = n > 1 ? y[1] - y[0] : 0;
  }

  const fitted: (number | null)[] = new Array(n).fill(null);
  let sse = 0;
  let count = 0;
  for (let t = start; t < n; t++) {
    const s = seasonal ? season[t % m] : 0;
    const pred = level + trend + s;
    fitted[t] = pred;
    sse += (y[t] - pred) ** 2;
    count++;
    const prevLevel = level;
    level = alpha * (y[t] - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    if (seasonal) season[t % m] = gamma * (y[t] - level) + (1 - gamma) * s;
  }
  const forecast = Array.from(
    { length: horizon },
    (_, h) => level + (h + 1) * trend + (seasonal ? season[(n + h) % m] : 0),
  );
  return { fitted, forecast, sse, count };
}

export function holtWinters(y: number[], horizon = 6, m = 12): ForecastResult {
  if (y.length < 3) throw new Error('Prognóza potřebuje alespoň 3 měsíce dat');
  const seasonal = y.length >= 2 * m + 2;
  let best: ReturnType<typeof run> | null = null;
  let params = { alpha: 0.3, beta: 0.05, gamma: 0.15, seasonal };
  for (const alpha of GRID) {
    for (const beta of GRID.slice(0, 3)) {
      for (const gamma of seasonal ? GRID : [0]) {
        const r = run(y, m, alpha, beta, gamma, seasonal, horizon);
        if (!best || r.sse < best.sse) {
          best = r;
          params = { alpha, beta, gamma, seasonal };
        }
      }
    }
  }
  const b = best!;
  const residualSd = Math.sqrt(b.sse / Math.max(b.count - 1, 1));
  // Interval nejistoty roste s horizontem (zjednodušeně √h)
  const lower = b.forecast.map((v, h) => Math.max(0, v - Z95 * residualSd * Math.sqrt(h + 1)));
  const upper = b.forecast.map((v, h) => v + Z95 * residualSd * Math.sqrt(h + 1));
  return {
    fitted: b.fitted,
    forecast: b.forecast.map((v) => Math.max(0, v)),
    lower,
    upper,
    params,
    residualSd,
  };
}

/** Střední absolutní procentní chyba (MAPE) – backtest posledních `holdout` měsíců. */
export function backtestMape(y: number[], holdout = 6, m = 12): number | null {
  if (y.length < holdout + 3) return null;
  const train = y.slice(0, -holdout);
  const test = y.slice(-holdout);
  const fc = holtWinters(train, holdout, m).forecast;
  const errors = test
    .map((v, i) => (v === 0 ? null : Math.abs(v - fc[i]) / v))
    .filter((e): e is number => e != null);
  return errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null;
}
