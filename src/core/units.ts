// §10 — internal SI (m, N, Pa, s, rad); tampilan auto-prefix, 3 significant digits.

const PREFIXES: ReadonlyArray<readonly [number, string]> = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
];

/** 3 significant digits, tanpa trailing nol, tanpa notasi eksponensial. */
export function sig3(v: number): string {
  if (v === 0) return '0';
  const p = v.toPrecision(3);
  if (p.includes('e')) {
    // 1.23e+5 → 123000: pakai Number untuk normalisasi, toFixed untuk digit
    const n = Number(p);
    return String(n);
  }
  return p.includes('.') ? p.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : p;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

/** Notasi ilmiah gaya buku: 162000 → "1.62 × 10⁵" (bukan "1.6e+5"). */
export function fmtSci(v: number): string {
  if (v === 0 || !Number.isFinite(v)) return '0';
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / 10 ** exp;
  const sup = (exp < 0 ? '⁻' : '') + String(Math.abs(exp)).split('').map((d) => SUP[+d]!).join('');
  return `${mant.toFixed(2)} × 10${sup}`;
}

/** Format nilai SI dengan prefix otomatis: 1234567 N → "1.23 MN". */
export function fmt(base: number, unit: string): string {
  if (base === 0 || !Number.isFinite(base)) return `0 ${unit}`;
  const mag = Math.abs(base);
  for (const [factor, prefix] of PREFIXES) {
    if (mag >= factor) return `${sig3(base / factor)} ${prefix}${unit}`;
  }
  return `${sig3(base / 1e-9)} n${unit}`;
}

export const fmtForce = (newton: number): string => fmt(newton, 'N');
export const fmtStress = (pascal: number): string => fmt(pascal, 'Pa');
export const fmtMoment = (newtonMeter: number): string => fmt(newtonMeter, 'N·m');
export const fmtLength = (meter: number): string => fmt(meter, 'm');
export const fmtTime = (second: number): string => `${sig3(second)} s`;
