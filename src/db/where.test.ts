import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from '../store/filters';
import { buildWhere, lit } from './where';

describe('buildWhere', () => {
  it('returns 1=1 without filters', () => {
    expect(buildWhere(EMPTY_FILTERS, 'results').sql).toBe('1=1');
  });

  it('builds date range and IN lists for results', () => {
    const { sql } = buildWhere(
      { ...EMPTY_FILTERS, from: '2025-01-01', to: '2025-03-31', depts: ['INT', 'JIP'], sex: ['F'] },
      'results',
      'r',
    );
    expect(sql).toContain("r.collected_date >= DATE '2025-01-01'");
    expect(sql).toContain("r.collected_date <= DATE '2025-03-31'");
    expect(sql).toContain("r.dept_id IN ('INT', 'JIP')");
    expect(sql).toContain("r.sex IN ('F')");
  });

  it('uses month granularity for costs and reports filters that do not apply', () => {
    const res = buildWhere({ ...EMPTY_FILTERS, from: '2025-01-15', depts: ['INT'], tests: ['CRP'] }, 'costs');
    expect(res.sql).toContain("month_key >= '2025-01'");
    expect(res.sql).toContain("test_id IN ('CRP')");
    expect(res.ignored).toEqual(['depts']);
  });

  it('drops unsafe values and invalid dates', () => {
    const { sql } = buildWhere(
      { ...EMPTY_FILTERS, from: "2025-01-01'; DROP", tests: ["CRP'); DROP TABLE x; --", 'NA'] },
      'results',
    );
    expect(sql).toBe("test_id IN ('NA')");
  });
});

describe('lit', () => {
  it('escapes single quotes', () => {
    expect(lit("O'Brien")).toBe("'O''Brien'");
  });
});
