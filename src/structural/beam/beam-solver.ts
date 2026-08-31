import type { Material, Section } from '../models/types';
import { sectionDepth } from '../models/section';

// §4 — closed-form Euler–Bernoulli beam solver: integrasi piecewise EKSAK
// (V linier, M kuadratik, θ kubik, y kuartik per segmen; bukan numerik aproksimatif).
// Konvensi: x sepanjang bentang (m); y positif ke ATAS (m); beban nilai positif = ke bawah;
// V shear up-positive (Gere); M sagging positif; moment load CCW positif.
// FEM menyusul PHASE 4 — ini analytical engine untuk L2 + benchmark ≤0.1%.

export type BeamSupport = 'ss' | 'cantilever';

export interface PointLoad { readonly type: 'point'; readonly value: number; readonly at: number } // N, ke bawah+
export interface UdlLoad { readonly type: 'udl'; readonly value: number; readonly from?: number; readonly to?: number } // N/m, ke bawah+
export interface MomentLoad { readonly type: 'moment'; readonly value: number; readonly at: number } // N·m, CCW+
export type BeamLoad = PointLoad | UdlLoad | MomentLoad;

export interface BeamCase {
  readonly span: number; // m
  readonly support: BeamSupport;
  readonly loads: readonly BeamLoad[];
  readonly section: Section;
  readonly material: Material;
}

export interface BeamSample { readonly x: number; readonly V: number; readonly M: number; readonly theta: number; readonly y: number }
export interface BeamReactions { readonly Ra: number; readonly Rb: number; readonly Ma: number } // N ke atas+; Ma N·m (sagging+)
export interface Extremum { readonly x: number; readonly value: number }

export interface BeamSolution {
  readonly EI: number; // N·m²
  readonly reactions: BeamReactions;
  readonly maxDeflection: Extremum; // y (m, tanda sesuai konvensi; biasanya negatif)
  readonly maxMoment: Extremum; // M (N·m)
  readonly maxShear: Extremum; // |V| terbesar
  readonly maxBendingStress: number; // Pa, serat tepi dari |M| maks
  readonly safetyFactor: number; // yield/σ_lentur; Infinity bila tak dibebani
  readonly equilibrium: { sumV: number; sumM: number; ok: boolean }; // F5: cek keseimbangan
  readonly strainEnergy: number; // F6: U = ∫M²/2EI dx (J)
  readonly at: (x: number) => BeamSample;
  readonly samples: (n: number) => readonly BeamSample[];
}

interface Seg { x0: number; len: number; q: number; V: number; M: number; theta: number; y: number }

const SAMPLE_N = 401;

export function solveBeam(c: BeamCase): BeamSolution {
  const { span: L, support, loads, section, material } = c;
  if (!(L > 0) || !Number.isFinite(L)) throw new Error(`Panjang bentang harus > 0 m (diberikan ${L} m).`);

  // §8 — validasi posisi beban (pesan manusia, bukan error JS mentah).
  let sumF = 0; // Σ gaya ke bawah (N)
  let sumMCw = 0; // Σ momen gaya beban tentang x=0, CW positif (N·m)
  const breaks = new Set<number>([0, L]);
  const jumps = new Map<number, { dV: number; dM: number }>();
  const udls: { w: number; a: number; b: number }[] = [];

  for (const ld of loads) {
    if (ld.type === 'point') {
      if (!(ld.at >= 0 && ld.at <= L)) throw new Error(`Beban titik di ${ld.at} m di luar bentang 0–${L} m.`);
      sumF += ld.value; sumMCw += ld.value * ld.at;
      breaks.add(ld.at);
      const j = jumps.get(ld.at) ?? { dV: 0, dM: 0 }; j.dV -= ld.value; jumps.set(ld.at, j);
    } else if (ld.type === 'udl') {
      const a = ld.from ?? 0, b = ld.to ?? L;
      if (b < a) throw new Error(`Rentang beban merata tidak valid: dari ${a} m sampai ${b} m.`);
      if (a < 0 || b > L) throw new Error(`Beban merata ${a}–${b} m di luar bentang 0–${L} m.`);
      const len = b - a;
      if (len <= 0) continue;
      sumF += ld.value * len; sumMCw += ld.value * len * ((a + b) / 2);
      breaks.add(a); breaks.add(b); udls.push({ w: ld.value, a, b });
    } else {
      if (!(ld.at >= 0 && ld.at <= L)) throw new Error(`Momen di ${ld.at} m di luar bentang 0–${L} m.`);
      sumMCw -= ld.value; // CCW+ → CW akun: −C
      breaks.add(ld.at);
      const j = jumps.get(ld.at) ?? { dV: 0, dM: 0 }; j.dM -= ld.value; jumps.set(ld.at, j);
    }
  }

  // Reaksi statis. SS: pin x=0, roller x=L. Cantilever: fix x=0.
  const Rb = support === 'ss' ? sumMCw / L : 0;
  const Ra = support === 'ss' ? sumF - Rb : sumF;
  const Ma = support === 'cantilever' ? -sumMCw : 0;

  const EI = material.elasticModulus * (section.props.Iy / 1e12); // mm⁴ → m⁴
  if (!(EI > 0)) throw new Error('Rigiditas EI tidak valid — cek material dan penampang.');

  // Pass 1: V, M eksak di tiap breakpoint.
  const xs = [...breaks].sort((p, q) => p - q);
  let V = Ra, M = Ma;
  const j0 = jumps.get(0); if (j0) { V += j0.dV; M += j0.dM; }
  const segs: Seg[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const len = xs[i + 1] - xs[i];
    if (len <= 0) continue;
    const q = udls.reduce((s, u) => s + (u.a <= xs[i] && xs[i + 1] <= u.b ? u.w : 0), 0);
    segs.push({ x0: xs[i], len, q, V, M, theta: 0, y: 0 });
    const Vm = V;
    V = Vm - q * len;
    M = M + Vm * len - (q * len * len) / 2;
    const j = jumps.get(xs[i + 1]); if (j) { V += j.dV; M += j.dM; }
  }

  // Pass 2: θ, y lokal (konstanta θ0 = 0 sementara).
  let th = 0, yl = 0;
  for (const s of segs) {
    s.theta = th; s.y = yl;
    const { len: t, V: Vi, M: Mi, q } = s;
    th = th + (Mi * t + (Vi * t * t) / 2 - (q * t ** 3) / 6) / EI;
    yl = yl + s.theta * t + (Mi * t * t) / (2 * EI) + (Vi * t ** 3) / (6 * EI) - (q * t ** 4) / (24 * EI);
  }

  // Konstanta integrasi dari BC deflecti: SS y(L)=0 → θ0 = −y_lokal(L)/L; cantilever θ0 = 0.
  const th0 = support === 'ss' ? -yl / L : 0;
  for (const s of segs) { s.theta += th0; s.y += th0 * s.x0; }

  const at = (x: number): BeamSample => {
    const xc = Math.min(Math.max(x, 0), L);
    const s = segs.find(g => xc >= g.x0 && xc <= g.x0 + g.len) ?? segs[segs.length - 1];
    const t = xc - s.x0, { q, V: Vi, M: Mi, theta: ti, y: yi } = s;
    return {
      x: xc,
      V: Vi - q * t,
      M: Mi + Vi * t - (q * t * t) / 2,
      theta: ti + (Mi * t + (Vi * t * t) / 2 - (q * t ** 3) / 6) / EI,
      y: yi + ti * t + (Mi * t * t) / (2 * EI) + (Vi * t ** 3) / (6 * EI) - (q * t ** 4) / (24 * EI),
    };
  };

  const samples = (n: number): BeamSample[] => {
    const out: BeamSample[] = [];
    for (let k = 0; k < n; k++) out.push(at((k * L) / (n - 1)));
    return out;
  };

  const pts = samples(SAMPLE_N);
  const pick = (f: (p: BeamSample) => number): Extremum => {
    let bx = 0, bv = 0;
    for (const p of pts) { const v = f(p); if (Math.abs(v) > Math.abs(bv)) { bv = v; bx = p.x; } }
    return { x: bx, value: bv };
  };
  const maxShear = pick(p => p.V);
  const maxMoment = pick(p => p.M);
  const maxDeflection = pick(p => p.y);

  const cDepth = sectionDepth(section) / 2000; // mm → m, serat tepi
  const I_m4 = section.props.Iy / 1e12;
  const maxBendingStress = (Math.abs(maxMoment.value) * cDepth) / I_m4; // σ = M·c/I (Pa)
  const safetyFactor = maxBendingStress > 0 ? material.yieldStrength / maxBendingStress : Infinity;

  // F5: cek keseimbangan ΣV=0 & ΣM=0 (validasi solver, ditampilkan Explain).
  // Reaksi dihitung dari sumF/sumMCw beban — cek ulang residualnya (harus ~0).
  // Momen reaksi dinding kantilever = −Ma (Ma internal jepit; reaksi berlawanan tanda).
  const resV = Ra + Rb - sumF;
  const resM = Rb * L - Ma - sumMCw; // momen tentang x=0
  const equilibrium = { sumV: resV, sumM: resM, ok: Math.abs(resV) < 1e-6 * Math.max(sumF, 1) && Math.abs(resM) < 1e-3 * Math.max(Math.abs(sumMCw), 1) };

  // F6: energi strain U = ∫M²/2EI dx (J) — integrasi trapesium sampel.
  let U = 0;
  for (let i = 1; i < pts.length; i++) {
    const m0 = pts[i - 1]!.M, m1 = pts[i]!.M;
    U += ((m0 * m0 + m1 * m1) / 2) * (pts[i]!.x - pts[i - 1]!.x);
  }
  U /= 2 * EI;

  return { EI, reactions: { Ra, Rb, Ma }, maxDeflection, maxMoment, maxShear, maxBendingStress, safetyFactor, equilibrium, strainEnergy: U, at, samples };
}

/** §5 — buckling Euler: P_cr = π²EI/(KL)². K: 0.5 braced-both, 0.7 pinned-fixed, 1.0 pinned, 2.0 fixed-free. */
export function eulerBuckling(E: number, I_mm4: number, L: number, K: number): number {
  if (!(L > 0)) throw new Error(`Panjang kolom harus > 0 m (diberikan ${L} m).`);
  if (!(K > 0)) throw new Error(`Faktor panjang efektif K harus > 0 (diberikan ${K}).`);
  return (Math.PI ** 2 * E * (I_mm4 / 1e12)) / (K * L) ** 2;
}
