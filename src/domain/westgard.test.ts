import { describe, expect, it } from 'vitest';
import { isRejected, westgard, type QcPoint } from './westgard';

/** Řada jedné úrovně: z-skóre po dnech. */
const series = (zs: number[], level = 1): QcPoint[] => zs.map((z, i) => ({ t: i, level, z, run: `d${i}` }));

describe('westgard', () => {
  it('flags 1-2s as warning and 1-3s as rejection', () => {
    const r = westgard(series([0.5, 2.4, -3.2]));
    expect(r[0]).toEqual([]);
    expect(r[1]).toEqual(['1-2s']);
    expect(isRejected(r[1])).toBe(false);
    expect(r[2]).toContain('1-3s');
    expect(isRejected(r[2])).toBe(true);
  });

  it('detects 2-2s within one level', () => {
    const r = westgard(series([0, 2.3, 2.6]));
    expect(r[2]).toContain('2-2s');
    expect(r[1]).not.toContain('2-2s');
  });

  it('detects 2-2s and R-4s across levels in one run', () => {
    const same: QcPoint[] = [
      { t: 0, level: 1, z: 2.2, run: 'a' },
      { t: 0, level: 2, z: 2.5, run: 'a' },
    ];
    expect(westgard(same).every((r) => r.includes('2-2s'))).toBe(true);

    const range: QcPoint[] = [
      { t: 0, level: 1, z: 2.1, run: 'a' },
      { t: 0, level: 2, z: -2.3, run: 'a' },
    ];
    expect(westgard(range).every((r) => r.includes('R-4s'))).toBe(true);
  });

  it('detects 4-1s and 10x', () => {
    const r = westgard(series([1.2, 1.4, 1.1, 1.3, 0.4, 0.2, 0.6, 0.3, 0.1, 0.5]));
    expect(r[3]).toContain('4-1s');
    expect(r[9]).toContain('10x');
    expect(r[8]).not.toContain('10x');
  });

  it('keeps levels independent for sequence rules', () => {
    const pts: QcPoint[] = [
      { t: 0, level: 1, z: 2.3, run: 'a' },
      { t: 1, level: 2, z: 2.4, run: 'b' },
    ];
    expect(westgard(pts).flat()).not.toContain('2-2s');
  });
});
