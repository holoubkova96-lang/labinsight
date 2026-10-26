import { describe, expect, it } from 'vitest';
import { fmtCzk, fmtDate, fmtNumber } from './format';

// Intl používá nezlomitelné mezery – pro porovnání je převedeme na obyčejné
const NBSP = new RegExp(`[${String.fromCharCode(0xa0, 0x202f)}]`, 'g');
const plain = (s: string) => s.replace(NBSP, ' ');

describe('format', () => {
  it('formats CZK per language', () => {
    expect(plain(fmtCzk(1234.5, 'cs', 2))).toBe('1 234,50 Kč');
    expect(plain(fmtCzk(1234.5, 'en', 2))).toBe('CZK 1,234.50');
  });

  it('formats dates per language', () => {
    expect(plain(fmtDate('2026-10-26', 'cs'))).toBe('26. 10. 2026');
    expect(fmtDate('2026-10-26', 'en')).toBe('Oct 26, 2026');
  });

  it('formats numbers and handles missing values', () => {
    expect(plain(fmtNumber(1234567, 'cs'))).toBe('1 234 567');
    expect(fmtNumber(null, 'en')).toBe('–');
  });
});
