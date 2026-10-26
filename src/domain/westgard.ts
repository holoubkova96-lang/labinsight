/**
 * Westgardova pravidla pro vnitřní kontrolu kvality.
 *
 * Vstupem jsou měření kontrolního materiálu převedená na z-skóre
 * z = (hodnota − cílová hodnota) / SD. Pravidla:
 * - 1-2s  varování: |z| > 2
 * - 1-3s  zamítnutí: |z| > 3 (náhodná chyba)
 * - 2-2s  zamítnutí: 2 po sobě jdoucí měření téže úrovně > 2 SD na stejné straně,
 *         nebo obě úrovně v jednom běhu (systematická chyba)
 * - R-4s  zamítnutí: v jednom běhu jedna úroveň > +2 SD a druhá < −2 SD (náhodná chyba)
 * - 4-1s  zamítnutí: 4 po sobě jdoucí měření téže úrovně > 1 SD na stejné straně
 * - 10x   zamítnutí: 10 po sobě jdoucích měření téže úrovně na stejné straně průměru (trend/posun)
 */
export type Rule = '1-2s' | '1-3s' | '2-2s' | 'R-4s' | '4-1s' | '10x';
export const REJECT_RULES: Rule[] = ['1-3s', '2-2s', 'R-4s', '4-1s', '10x'];

export type QcPoint = { t: number; level: number; z: number; run: string };

/** Vrátí pro každý bod seznam porušených pravidel (ve stejném pořadí jako vstup). */
export function westgard(points: QcPoint[]): Rule[][] {
  const out: Rule[][] = points.map(() => []);
  const add = (i: number, r: Rule) => {
    if (!out[i].includes(r)) out[i].push(r);
  };

  // Pravidla v rámci jedné úrovně (časová posloupnost)
  const byLevel = new Map<number, number[]>();
  points.forEach((p, i) => byLevel.set(p.level, [...(byLevel.get(p.level) ?? []), i]));
  for (const idx of byLevel.values()) {
    idx.sort((a, b) => points[a].t - points[b].t);
    idx.forEach((i, k) => {
      const z = points[i].z;
      if (Math.abs(z) > 3) add(i, '1-3s');
      else if (Math.abs(z) > 2) add(i, '1-2s');

      const sameSide = (n: number, limit: number) => {
        if (k + 1 < n) return false;
        const win = idx.slice(k - n + 1, k + 1).map((j) => points[j].z);
        return win.every((v) => v > limit) || win.every((v) => v < -limit);
      };
      if (sameSide(2, 2)) add(i, '2-2s');
      if (sameSide(4, 1)) add(i, '4-1s');
      if (sameSide(10, 0)) add(i, '10x');
    });
  }

  // Pravidla napříč úrovněmi v jednom běhu
  const byRun = new Map<string, number[]>();
  points.forEach((p, i) => byRun.set(p.run, [...(byRun.get(p.run) ?? []), i]));
  for (const idx of byRun.values()) {
    if (new Set(idx.map((i) => points[i].level)).size < 2) continue;
    const hi = idx.filter((i) => points[i].z > 2);
    const lo = idx.filter((i) => points[i].z < -2);
    if (hi.length && lo.length) [...hi, ...lo].forEach((i) => add(i, 'R-4s'));
    for (const side of [hi, lo]) {
      if (new Set(side.map((i) => points[i].level)).size >= 2) side.forEach((i) => add(i, '2-2s'));
    }
  }
  return out;
}

export function isRejected(rules: Rule[]): boolean {
  return rules.some((r) => REJECT_RULES.includes(r));
}
