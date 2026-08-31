import { describe, expect, it } from 'vitest';
import { eulerBuckling, solveBeam } from '../../structural/beam/beam-solver';
import type { BeamCase, BeamLoad } from '../../structural/beam/beam-solver';
import { MATERIALS } from '../../data/materials';
import { SECTION_PRESETS } from '../../structural/models/section';

// §2/§5 — benchmark closed-form, toleransi ≤0.1%.
const TOL = 1e-3;

const steel = MATERIALS.steelS355;
const ipe = SECTION_PRESETS.find(s => s.id === 'ipe300')!;
const concrete = MATERIALS.concreteC30;

function makeCase(support: BeamCase['support'], loads: BeamLoad[], span = 6): BeamCase {
  return { span, support, loads, section: ipe, material: steel };
}

describe('solveBeam — benchmark closed-form (IPE300, S355, L=6 m)', () => {
  const L = 6;
  const EI = steel.elasticModulus * (ipe.props.Iy / 1e12);

  it('cantilever, P di ujung: y(L) = PL³/3EI, M_fixed = −PL, V = P', () => {
    const P = 20e3; // 20 kN
    const sol = solveBeam(makeCase('cantilever', [{ type: 'point', value: P, at: L }]));
    const yExact = -(P * L ** 3) / (3 * EI);
    expect(Math.abs(sol.at(L).y / yExact - 1)).toBeLessThan(TOL);
    expect(Math.abs(sol.at(L).theta - (-(P * L * L) / (2 * EI)))).toBeLessThan(Math.abs((P * L ** 2) / (2 * EI)) * TOL);
    expect(Math.abs(sol.maxMoment.value - -P * L)).toBeLessThan(P * L * TOL);
    expect(Math.abs(sol.at(0).V - P)).toBeLessThan(P * TOL);
    // reaksi: Ra = P ke atas, fixing moment Ma = −PL
    expect(Math.abs(sol.reactions.Ra - P)).toBeLessThan(P * TOL);
    expect(Math.abs(sol.reactions.Ma - -P * L)).toBeLessThan(P * L * TOL);
  });

  it('SS, UDL penuh: δ_mid = 5wL⁴/384EI, M_mid = wL²/8, R = wL/2', () => {
    const w = 10e3; // 10 kN/m
    const sol = solveBeam(makeCase('ss', [{ type: 'udl', value: w }]));
    const dExact = -(5 * w * L ** 4) / (384 * EI);
    expect(Math.abs(sol.at(L / 2).y / dExact - 1)).toBeLessThan(TOL);
    expect(Math.abs(sol.maxMoment.value - (w * L * L) / 8)).toBeLessThan((w * L * L) / 8 * TOL);
    expect(Math.abs(sol.reactions.Ra - (w * L) / 2)).toBeLessThan(w * L * TOL);
    expect(Math.abs(sol.reactions.Rb - (w * L) / 2)).toBeLessThan(w * L * TOL);
    // simpang nol di tumpuan
    expect(Math.abs(sol.at(0).y)).toBeLessThan(1e-9);
    expect(Math.abs(sol.at(L).y)).toBeLessThan(1e-9);
  });

  it('SS, P di tengah: δ_mid = PL³/48EI, M_mid = PL/4', () => {
    const P = 30e3;
    const sol = solveBeam(makeCase('ss', [{ type: 'point', value: P, at: L / 2 }]));
    const dExact = -(P * L ** 3) / (48 * EI);
    expect(Math.abs(sol.at(L / 2).y / dExact - 1)).toBeLessThan(TOL);
    expect(Math.abs(sol.maxMoment.value - (P * L) / 4)).toBeLessThan((P * L) / 4 * TOL);
  });

  it('SS, UDL parsial 2–4 m: keseimbangan reaksi ΣF=0, ΣM=0', () => {
    const w = 15e3;
    const sol = solveBeam(makeCase('ss', [{ type: 'udl', value: w, from: 2, to: 4 }]));
    const R = w * 2; // total 30 kN
    expect(Math.abs(sol.reactions.Ra + sol.reactions.Rb - R)).toBeLessThan(R * TOL);
    // ΣM tentang x=0: Rb·L = w·2·(3) → Rb = 15 kN, Ra = 15 kN
    expect(Math.abs(sol.reactions.Rb - R * 0.5)).toBeLessThan(R * TOL);
    expect(Math.abs(sol.reactions.Ra - R * 0.5)).toBeLessThan(R * TOL);
  });

  it('tegangan lentur σ = M·c/I dan safety factor = fy/σ', () => {
    const P = 20e3;
    const sol = solveBeam(makeCase('cantilever', [{ type: 'point', value: P, at: 6 }]));
    const c = 0.15; // IPE300 h/2 = 150 mm = 0.15 m
    const I = ipe.props.Iy / 1e12;
    const sigmaExact = (P * 6 * c) / I;
    expect(Math.abs(sol.maxBendingStress / sigmaExact - 1)).toBeLessThan(TOL);
    expect(Math.abs(sol.safetyFactor - steel.yieldStrength / sigmaExact)).toBeLessThan((steel.yieldStrength / sigmaExact) * TOL);
  });

  it('kolom beton + penampang rect: unit campuran tetap konsisten', () => {
    const rect = SECTION_PRESETS.find(s => s.id === 'rect300x600')!;
    const c: BeamCase = { span: 4, support: 'ss', loads: [{ type: 'udl', value: 20e3 }], section: rect, material: concrete };
    const EIc = concrete.elasticModulus * (rect.props.Iy / 1e12);
    const sol = solveBeam(c);
    const dExact = -(5 * 20e3 * 4 ** 4) / (384 * EIc);
    expect(Math.abs(sol.at(2).y / dExact - 1)).toBeLessThan(TOL);
  });
});

describe('eulerBuckling — P_cr = π²EI/(KL)²', () => {
  const L = 4;
  const I = ipe.props.Iy / 1e12;
  it.each([0.5, 0.7, 1, 2] as const)('K=%s cocok rumus', (K) => {
    const expect_exact = (Math.PI ** 2 * steel.elasticModulus * I) / (K * L) ** 2;
    expect(eulerBuckling(steel.elasticModulus, ipe.props.Iy, L, K)).toBeCloseTo(expect_exact, 6);
  });
  it('K=2 (fixed-free) = ¼ K=1', () => {
    expect(eulerBuckling(steel.elasticModulus, ipe.props.Iy, L, 2)).toBeCloseTo(
      eulerBuckling(steel.elasticModulus, ipe.props.Iy, L, 1) / 4, 6);
  });
  it('L≤0 → pesan error manusia', () => {
    expect(() => eulerBuckling(steel.elasticModulus, ipe.props.Iy, 0, 1)).toThrow(/Panjang kolom/);
  });
});

describe('validasi input (§8)', () => {
  it('beban di luar bentang → error bahasa manusia', () => {
    expect(() => solveBeam(makeCase('ss', [{ type: 'point', value: 1e3, at: 9 }]))).toThrow(/di luar bentang/);
    expect(() => solveBeam(makeCase('ss', [{ type: 'udl', value: 1e3, from: -1 }]))).toThrow(/luar bentang/);
  });
  it('rentang UDL terbalik → error', () => {
    expect(() => solveBeam(makeCase('ss', [{ type: 'udl', value: 1e3, from: 4, to: 2 }]))).toThrow(/tidak valid/);
  });
  it('bentang ≤ 0 → error', () => {
    expect(() => solveBeam(makeCase('ss', [], 0))).toThrow(/Panjang bentang/);
  });
  it('tanpa beban: SF = Infinity, M = 0', () => {
    const sol = solveBeam(makeCase('ss', []));
    expect(sol.safetyFactor).toBe(Infinity);
    expect(sol.maxMoment.value).toBe(0);
  });
});

describe('keseimbangan & energi (F5/F6)', () => {
  const L = 6;
  it('ΣV=0 dan ΣM=0 untuk P titik SS', () => {
    const sol = solveBeam(makeCase('ss', [{ type: 'point', value: 30e3, at: L / 2 }]));
    expect(sol.equilibrium.ok).toBe(true);
    expect(Math.abs(sol.equilibrium.sumV)).toBeLessThan(1e-3);
    expect(Math.abs(sol.equilibrium.sumM)).toBeLessThan(1e-2);
  });
  it('ΣV=0 untuk UDL kantilever', () => {
    const sol = solveBeam(makeCase('cantilever', [{ type: 'udl', value: 10e3 }]));
    expect(sol.equilibrium.ok).toBe(true);
  });
  it('energi strain SS-UDL: U = w²L⁵/240EI (±0.1%)', () => {
    const w = 10e3;
    const EI = steel.elasticModulus * (ipe.props.Iy / 1e12);
    const sol = solveBeam(makeCase('ss', [{ type: 'udl', value: w }]));
    const UExact = (w * w * L ** 5) / (240 * EI);
    expect(Math.abs(sol.strainEnergy / UExact - 1)).toBeLessThan(TOL);
  });
});
