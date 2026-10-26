/**
 * Výkaz zisku a ztráty laboratoře (P&L) a what-if scénáře nad ním.
 */
export type Pnl = {
  revenueInsurance: number;
  revenueSelf: number;
  reagents: number; // reagencie + spotřební materiál
  qcCal: number; // QC, kalibrace, EHK
  expiry: number;
  staff: number;
  service: number; // leasing a servis analyzátorů
  other: number; // validace + režie
};

export const COST_KEYS = ['reagents', 'qcCal', 'expiry', 'staff', 'service', 'other'] as const;
export type CostKey = (typeof COST_KEYS)[number];

export function revenue(p: Pnl): number {
  return p.revenueInsurance + p.revenueSelf;
}
export function totalCost(p: Pnl): number {
  return COST_KEYS.reduce((s, k) => s + p[k], 0);
}
export function result(p: Pnl): number {
  return revenue(p) - totalCost(p);
}

/** Změny scénáře v poměrech (0,05 = +5 %). */
export type Scenario = {
  pointValue: number;
  volume: number;
  reagentPrice: number;
  qcPrice: number;
  staffRate: number;
};
export const NO_CHANGE: Scenario = { pointValue: 0, volume: 0, reagentPrice: 0, qcPrice: 0, staffRate: 0 };

/**
 * Přepočet P&L pro scénář. Zjednodušení modelu:
 * - hodnota bodu ovlivní jen výnos od pojišťoven, objem oba výnosy,
 * - reagencie rostou s objemem i cenou; QC a kalibrace jsou fixní vůči objemu,
 * - expirace klesá s rostoucím objemem (balení se spotřebují dřív) a roste s cenou,
 * - personál roste s objemem i sazbou; leasing, validace a režie jsou fixní.
 */
export function applyScenario(p: Pnl, s: Scenario): Pnl {
  const vol = 1 + s.volume;
  return {
    revenueInsurance: p.revenueInsurance * (1 + s.pointValue) * vol,
    revenueSelf: p.revenueSelf * vol,
    reagents: p.reagents * (1 + s.reagentPrice) * vol,
    qcCal: p.qcCal * (1 + s.qcPrice),
    expiry: (p.expiry * (1 + s.reagentPrice)) / Math.max(vol, 0.1),
    staff: p.staff * (1 + s.staffRate) * vol,
    service: p.service,
    other: p.other,
  };
}

export type Step = { key: string; value: number; kind: 'total' | 'delta' };

/** Kroky waterfall grafu: výnos → jednotlivé náklady → provozní výsledek. */
export function waterfallSteps(p: Pnl): Step[] {
  return [
    { key: 'revenue', value: revenue(p), kind: 'total' },
    ...COST_KEYS.map((k) => ({ key: k, value: -p[k], kind: 'delta' as const })),
    { key: 'result', value: result(p), kind: 'total' },
  ];
}

/** Most mezi výchozím a scénářovým výsledkem: příspěvek každé položky ke změně. */
export function bridgeSteps(base: Pnl, scenario: Pnl): Step[] {
  const steps: Step[] = [
    { key: 'baseResult', value: result(base), kind: 'total' },
    { key: 'revenue', value: revenue(scenario) - revenue(base), kind: 'delta' },
    ...COST_KEYS.map((k) => ({ key: k, value: -(scenario[k] - base[k]), kind: 'delta' as const })),
    { key: 'scenarioResult', value: result(scenario), kind: 'total' },
  ];
  return steps.filter((s) => s.kind === 'total' || Math.abs(s.value) > 0.5);
}
