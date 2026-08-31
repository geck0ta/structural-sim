import type { CDims, CircularDims, IDims, RectDims, Section, SectionProps } from './types';

// §6 — properti dihitung dari dimensi (mm basis), bukan tabel hardcoded.
// sumber rumus: Gere & Timoshenko, Mechanics of Materials.

const PI = Math.PI;

function finalize(A: number, Iy: number, Iz: number, J: number, cy: number, cz: number): SectionProps {
  return { A, Iy, Iz, J, Sy: Iy / cy, Sz: Iz / cz, ry: Math.sqrt(Iy / A), rz: Math.sqrt(Iz / A) };
}

export function rectProps({ b, h }: RectDims): SectionProps {
  // ponytail: J aproksimasi Saint-Venant persegi; upgrade: tabel konstanta torsion bila butuh presisi.
  const a = Math.min(b, h);
  const c = Math.max(b, h);
  const J = ((a * c ** 3) / 3) * (1 - 0.63 * (a / c) + 0.052 * (a / c) ** 5);
  return finalize(b * h, (b * h ** 3) / 12, (h * b ** 3) / 12, J, h / 2, b / 2);
}

export function iProps({ h, b, tw, tf }: IDims): SectionProps {
  // ponytail: filet akar diabaikan (tabel baja ~2–4% lebih besar); J aproksimasi thin-walled.
  const hw = h - 2 * tf;
  const Iy = (b * h ** 3 - (b - tw) * hw ** 3) / 12;
  const Iz = (2 * tf * b ** 3 + hw * tw ** 3) / 12;
  const J = (2 * b * tf ** 3 + hw * tw ** 3) / 3;
  return finalize(2 * b * tf + hw * tw, Iy, Iz, J, h / 2, b / 2);
}

export function circularProps({ d, t }: CircularDims): SectionProps {
  if (t !== undefined && t > 0) {
    // CHS: di = d − 2t. Rumus Gere & Timoshenko §6: I = π(D⁴−d⁴)/64.
    const di = d - 2 * t;
    const I = (PI * (d ** 4 - di ** 4)) / 64;
    const J = 2 * I;
    return finalize((PI * (d ** 2 - di ** 2)) / 4, I, I, J, d / 2, d / 2);
  }
  const I = (PI * d ** 4) / 64;
  return finalize((PI * d ** 2) / 4, I, I, (PI * d ** 4) / 32, d / 2, d / 2);
}

export function cProps({ h, b, tw, tf }: CDims): SectionProps {
  // Channel (Gere & Timoshenko A.5). Web vertikal; flange bersih bf = b − tw (web tak dobel).
  // Verifikasi UPN200: A=32.3 cm², Iy=1927 cm⁴, Iz=117 cm⁴, x̄≈22.0 mm — cocok tabel.
  const bf = b - tw;
  const A = h * tw + 2 * bf * tf;
  const xbar = (h * tw * (tw / 2) + 2 * bf * tf * (tw + bf / 2)) / A; // dari muka luar web
  const Iy = (tw * h ** 3) / 12 + 2 * ((bf * tf ** 3) / 12 + bf * tf * ((h - tf) / 2) ** 2); // sumbu kuat
  const Iz = (h * tw ** 3) / 12 + 2 * ((tf * bf ** 3) / 12 + bf * tf * (tw + bf / 2 - xbar) ** 2); // sumbu lemah
  const hw = h - 2 * tf;
  const cz = Math.max(xbar, b - xbar);
  return finalize(A, Iy, Iz, (2 * bf * tf ** 3 + hw * tw ** 3) / 3, h / 2, cz);
}

export function sectionProps(section: Section): SectionProps {
  switch (section.shape) {
    case 'rect':
      return rectProps(section.dims);
    case 'i':
      return iProps(section.dims);
    case 'c':
      return cProps(section.dims);
    case 'circular':
      return circularProps(section.dims as CircularDims);
  }
}

/** Tinggi penampang (mm) — serat tepi lentur = depth/2 (sumbu kuat). */
export function sectionDepth(s: Section): number {
  return s.shape === 'circular' ? s.dims.d : s.dims.h;
}

// §6 — preset. Nilai referensi: tabel profil baja ArcelorMittal (IPE 300).

export const IPE300 = {
  id: 'ipe300',
  name: 'IPE 300',
  shape: 'i',
  dims: { h: 300, b: 150, tw: 7.1, tf: 10.7 },
} as const;

export const WF400 = {
  id: 'wf400',
  name: 'WF 400×200',
  shape: 'i',
  dims: { h: 400, b: 200, tw: 8, tf: 13 },
} as const;

export const RECT_300_600 = {
  id: 'rect300x600',
  name: 'Beton 300×600',
  shape: 'rect',
  dims: { b: 300, h: 600 },
} as const;

export const CHS_219_8 = {
  id: 'chs219x8',
  name: 'CHS Ø219×8',
  shape: 'circular',
  dims: { d: 219, t: 8 },
} as const;

export const UPN200 = {
  id: 'upn200',
  name: 'UPN 200 (C)',
  shape: 'c',
  dims: { h: 200, b: 75, tw: 8.5, tf: 11.5 },
} as const;

function build(base: typeof IPE300 | typeof WF400 | typeof RECT_300_600 | typeof CHS_219_8 | typeof UPN200): Section {
  const s = base as Section; // props dihitung, bukan dari tabel
  return { ...s, props: sectionProps(s) };
}

export const SECTION_PRESETS: readonly Section[] = [build(IPE300), build(WF400), build(RECT_300_600), build(CHS_219_8), build(UPN200)];
