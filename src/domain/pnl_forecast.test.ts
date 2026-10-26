import { describe, expect, it } from 'vitest';
import { backtestMape, holtWinters } from './forecast';
import { NO_CHANGE, applyScenario, bridgeSteps, result, waterfallSteps, type Pnl } from './pnl';

const base: Pnl = {
  revenueInsurance: 1000,
  revenueSelf: 100,
  reagents: 300,
  qcCal: 100,
  expiry: 50,
  staff: 200,
  service: 150,
  other: 100,
};

describe('P&L', () => {
  it('waterfall ends at the operating result', () => {
    const steps = waterfallSteps(base);
    expect(steps[0].value).toBe(1100);
    expect(steps.at(-1)!.value).toBe(200);
    expect(steps.slice(1, -1).reduce((s, x) => s + x.value, 0)).toBe(-900);
  });

  it('no-change scenario keeps the result', () => {
    expect(result(applyScenario(base, NO_CHANGE))).toBeCloseTo(200);
  });

  it('point value affects only insurance revenue', () => {
    const s = applyScenario(base, { ...NO_CHANGE, pointValue: -0.1 });
    expect(s.revenueInsurance).toBeCloseTo(900);
    expect(s.revenueSelf).toBe(100);
    expect(result(s)).toBeCloseTo(100);
  });

  it('bridge deltas add up from base to scenario', () => {
    const s = applyScenario(base, { ...NO_CHANGE, volume: 0.1, reagentPrice: 0.05 });
    const steps = bridgeSteps(base, s);
    const sum = steps.slice(1, -1).reduce((acc, x) => acc + x.value, 0);
    expect(steps[0].value + sum).toBeCloseTo(steps.at(-1)!.value);
  });
});

describe('forecast', () => {
  // 3 roky: lineární trend + sezónní vlna
  const series = Array.from({ length: 36 }, (_, i) => 1000 + 5 * i + 100 * Math.cos((2 * Math.PI * i) / 12));

  it('extrapolates trend and seasonality', () => {
    const fc = holtWinters(series, 6);
    expect(fc.params.seasonal).toBe(true);
    const expected = Array.from(
      { length: 6 },
      (_, h) => 1000 + 5 * (36 + h) + 100 * Math.cos((2 * Math.PI * (36 + h)) / 12),
    );
    fc.forecast.forEach((v, i) => expect(Math.abs(v - expected[i]) / expected[i]).toBeLessThan(0.03));
    fc.forecast.forEach((v, i) => {
      expect(fc.lower[i]).toBeLessThanOrEqual(v);
      expect(fc.upper[i]).toBeGreaterThanOrEqual(v);
    });
  });

  it('falls back to Holt without season on short series', () => {
    const fc = holtWinters([10, 12, 14, 16, 18, 20], 3);
    expect(fc.params.seasonal).toBe(false);
    expect(fc.forecast[0]).toBeGreaterThan(20);
  });

  it('backtest error is small on a regular series', () => {
    expect(backtestMape(series)).toBeLessThan(0.05);
  });
});
