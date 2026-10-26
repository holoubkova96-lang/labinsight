import { describe, expect, it } from 'vitest';
import {
  breakEven,
  monthly,
  paybackMonths,
  sensitivity,
  wastedTestsPerMonth,
  type MethodParams,
} from './costModel';

/** Metoda bez skrytých nákladů: jen reagencie a pevný leasing. */
const simple: MethodParams = {
  points: 100,
  pointValue: 1,
  reagentCzk: 20,
  packSize: 1,
  stabilityDays: 1,
  qcPerDay: 0,
  qcCzk: 0,
  calPerMonth: 0,
  calCzk: 0,
  ehkYearCzk: 0,
  techMin: 0,
  uniMin: 0,
  leaseMonthCzk: 8000,
  overheadPerResult: 0,
  oneOffCzk: 0,
};

describe('cost model', () => {
  it('computes break-even as fixed / (price - variable) for a simple method', () => {
    // variabilní náklad 20 Kč × (0,85 × 1,03 + 0,15) = 20,51 Kč; marže na test 79,49 Kč
    const perTest = 20 * (0.85 * 1.03 + 0.15);
    expect(breakEven(simple)).toBe(Math.ceil(8000 / (100 - perTest)));
  });

  it('cost per result falls as volume grows', () => {
    expect(monthly(simple, 10).costPerResult).toBeGreaterThan(monthly(simple, 1000).costPerResult);
  });

  it('wastes reagent when packs expire before they are used up', () => {
    const p = { ...simple, packSize: 50, stabilityDays: 4 };
    // 30 testů měsíčně ≈ 1 test denně → za 4 dny se spotřebují ~4 z 50
    expect(wastedTestsPerMonth(p, 30)).toBeGreaterThan(300);
    // 1 500 testů měsíčně ≈ 49 denně → balení vydrží jen 1 den, nic nevyprší
    expect(wastedTestsPerMonth(p, 1500)).toBe(0);
  });

  it('returns null when the method never breaks even', () => {
    expect(breakEven({ ...simple, points: 10 }, 5000)).toBeNull();
  });

  it('computes payback of one-off costs from operating margin', () => {
    const p = { ...simple, oneOffCzk: 36_000 };
    const operating = monthly(p, 200, false).margin;
    expect(paybackMonths(p, 200)).toBeCloseTo(36_000 / operating);
    expect(paybackMonths(p, 10)).toBeNull();
  });

  it('ranks sensitivity by the span of margin', () => {
    const { rows } = sensitivity(simple, 200, ['pointValue', 'leaseMonthCzk']);
    expect(rows[0].key).toBe('pointValue'); // výnos 20 000 Kč je citlivější než leasing 8 000 Kč
    expect(rows[0].high).toBeGreaterThan(rows[0].low);
  });
});

describe('make or buy', () => {
  it('prefers sending out at low volume and own testing at high volume', async () => {
    const { makeOrBuy, makeOrBuyCrossover } = await import('./costModel');
    expect(makeOrBuy(simple, 5, 30).decision).toBe('buy');
    expect(makeOrBuy(simple, 500, 30).decision).toBe('make');
    // vlastní provádění: 79,49 Kč × f − 8 000 ≥ −30 Kč × f  →  f ≥ 8 000 / 109,49
    const perTest = 100 - 20 * (0.85 * 1.03 + 0.15);
    expect(makeOrBuyCrossover(simple, 30)).toBe(Math.ceil(8000 / (perTest + 30)));
  });
});
