/**
 * Nákladový model metody v prohlížeči – stejné principy jako generátor dat
 * (data_gen/costs.py), jen spojitě místo simulace po dnech. Slouží pro křivku
 * nákladu na výsledek, bod zvratu, simulátor zavedení metody a citlivostní analýzu.
 */

/** Parametry laboratoře (zrcadlí data_gen/config.py). */
export const LAB = {
  daysPerMonth: 30.4, // laboratoř běží 24/7, QC se měří každý den
  rateTechPerHour: 420,
  rateUniPerHour: 780,
  consumableShare: 0.15,
  deadVolume: 0.03,
  calTests: 4, // testů reagencie spotřebovaných na kalibraci
  qcTechMin: 1.5,
  calTechMin: 20,
  amortMonths: 36,
};

export type MethodParams = {
  points: number; // body výkonu
  pointValue: number; // Kč za bod
  reagentCzk: number; // reagencie + spotřební materiál na test
  packSize: number; // testů v balení
  stabilityDays: number; // stabilita otevřeného balení
  qcPerDay: number; // QC měření denně
  qcCzk: number; // cena QC měření
  calPerMonth: number;
  calCzk: number;
  ehkYearCzk: number;
  techMin: number; // minuty laboranta na test
  uniMin: number; // minuty VŠ na test
  leaseMonthCzk: number; // podíl na leasingu a servisu analyzátoru
  overheadPerResult: number; // režie laboratoře na vydaný výsledek
  oneOffCzk: number; // validace + zaškolení při zavedení
};

export type MonthlyBreakdown = {
  revenue: number;
  variable: number;
  qc: number;
  calibration: number;
  expiry: number;
  ehk: number;
  staff: number;
  lease: number;
  overhead: number;
  amortization: number;
  total: number;
  margin: number;
  costPerResult: number;
};

/** Expirace: kolik testů reagencie se měsíčně vyhodí, když balení vyprší dřív, než se spotřebuje. */
export function wastedTestsPerMonth(p: MethodParams, freq: number): number {
  if (p.packSize <= 1) return 0;
  const usedPerDay = (freq + p.qcPerDay * LAB.daysPerMonth + p.calPerMonth * LAB.calTests) / LAB.daysPerMonth;
  if (usedPerDay <= 0) return 0;
  const lifetime = p.packSize / usedPerDay; // dní, než se balení spotřebuje
  if (lifetime <= p.stabilityDays) return 0;
  const wastePerPack = p.packSize - usedPerDay * p.stabilityDays;
  return (LAB.daysPerMonth / p.stabilityDays) * wastePerPack;
}

/** Měsíční výnosy a náklady metody při dané měsíční frekvenci. */
export function monthly(p: MethodParams, freq: number, withAmortization = true): MonthlyBreakdown {
  const perTestReagent =
    p.reagentCzk * ((1 - LAB.consumableShare) * (1 + LAB.deadVolume) + LAB.consumableShare);
  const qcCount = p.qcPerDay * LAB.daysPerMonth;
  const revenue = freq * p.points * p.pointValue;
  const variable = freq * perTestReagent;
  const qc = qcCount * p.qcCzk;
  const calibration = p.calPerMonth * p.calCzk;
  const expiry = wastedTestsPerMonth(p, freq) * p.reagentCzk;
  const ehk = p.ehkYearCzk / 12;
  const staff =
    (freq * (p.techMin * LAB.rateTechPerHour + p.uniMin * LAB.rateUniPerHour) +
      qcCount * LAB.qcTechMin * LAB.rateTechPerHour +
      p.calPerMonth * LAB.calTechMin * LAB.rateTechPerHour) /
    60;
  const lease = p.leaseMonthCzk;
  const overhead = freq * p.overheadPerResult;
  const amortization = withAmortization ? p.oneOffCzk / LAB.amortMonths : 0;
  const total = variable + qc + calibration + expiry + ehk + staff + lease + overhead + amortization;
  return {
    revenue,
    variable,
    qc,
    calibration,
    expiry,
    ehk,
    staff,
    lease,
    overhead,
    amortization,
    total,
    margin: revenue - total,
    costPerResult: freq > 0 ? total / freq : Infinity,
  };
}

/** Nejnižší měsíční frekvence, při které metoda není ztrátová (null = nikdy do maxFreq). */
export function breakEven(p: MethodParams, maxFreq = 20_000, withAmortization = true): number | null {
  // marže nemusí růst monotónně (skok u expirace), proto hledáme lineárně
  for (let f = 1; f <= maxFreq; f++) {
    if (monthly(p, f, withAmortization).margin >= 0) return f;
  }
  return null;
}

/** Doba návratnosti jednorázových nákladů zavedení (v měsících), null = nevrátí se. */
export function paybackMonths(p: MethodParams, freq: number): number | null {
  const operating = monthly(p, freq, false).margin;
  if (p.oneOffCzk <= 0) return 0;
  return operating > 0 ? p.oneOffCzk / operating : null;
}

export type SensitivityKey = keyof MethodParams | 'freq';
export type SensitivityRow = { key: SensitivityKey; low: number; high: number; span: number };

/** Tornádo: měsíční marže při změně jednoho parametru o ±pct, ostatní beze změny. */
export function sensitivity(
  p: MethodParams,
  freq: number,
  keys: SensitivityKey[],
  pct = 0.2,
): { base: number; rows: SensitivityRow[] } {
  const base = monthly(p, freq).margin;
  const rows = keys.map((key) => {
    const at = (factor: number) =>
      key === 'freq'
        ? monthly(p, freq * factor).margin
        : monthly({ ...p, [key]: (p[key] as number) * factor }, freq).margin;
    const low = at(1 - pct);
    const high = at(1 + pct);
    return { key, low, high, span: Math.abs(high - low) };
  });
  return { base, rows: rows.sort((a, b) => b.span - a.span) };
}

/**
 * Metoda běžící na více analyzátorech: QC, kalibrace a balení reagencie jsou na
 * každém analyzátoru zvlášť, objem se dělí. Fixní částky (leasing, EHK, validace)
 * jsou zadány za metodu celkem.
 */
export function monthlyOn(p: MethodParams, freq: number, analyzers = 1): MonthlyBreakdown {
  if (analyzers <= 1) return monthly(p, freq);
  const share = {
    ...p,
    leaseMonthCzk: p.leaseMonthCzk / analyzers,
    ehkYearCzk: p.ehkYearCzk / analyzers,
    oneOffCzk: p.oneOffCzk / analyzers,
  };
  const m = monthly(share, freq / analyzers);
  const scaled = Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k, k === 'costPerResult' ? v : v * analyzers]),
  ) as MonthlyBreakdown;
  return scaled;
}
