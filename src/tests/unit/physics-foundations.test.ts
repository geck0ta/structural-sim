import { describe, it, expect } from 'vitest';
import { SpringNumber } from '../../visualization/animation/spring';
import { rectProps, iProps, circularProps, cProps, SECTION_PRESETS } from '../../structural/models/section';
import { solveBeam } from '../../structural/beam/beam-solver';

describe('SpringNumber', () => {
  it('converge ke target, tak overshoot besar (settled akhirnya)', () => {
    const s = new SpringNumber(0, 170, 26);
    s.target = 1;
    for (let i = 0; i < 600; i++) s.step(1 / 60);
    expect(Math.abs(s.value - 1)).toBeLessThan(1e-3);
    expect(s.settled).toBe(true);
  });

  it('frame-independent: hasil sama pada dt berbeda total waktu sama', () => {
    const run = (dt: number): number => {
      const s = new SpringNumber(0);
      s.target = 1;
      const steps = Math.round(1 / dt);
      for (let i = 0; i < steps; i++) s.step(dt);
      return s.value;
    };
    expect(Math.abs(run(1 / 60) - run(1 / 120))).toBeLessThan(0.02);
  });
});

describe('section props (§6 — dihitung, bukan tabel)', () => {
  it('rect 300×600: A & Iy exact', () => {
    const p = rectProps({ b: 300, h: 600 });
    expect(p.A).toBeCloseTo(180000, 5);
    expect(p.Iy).toBeCloseTo((300 * 600 ** 3) / 12, 0);
  });

  it('SS two-point symmetric a=L/3: M mid = P·a, y mid = P·a(3L²−4a²)/24EI', () => {
    const EI = 1e6; // N·m²
    const L = 6, P = 10e3, a = 2; // m, N
    const dims = { b: 100, h: 200 } as const;
    const base = { id: 't', name: 't', shape: 'rect', dims } as const;
    const sec = { ...base, props: rectProps(dims) };
    const mat = { name: 't', elasticModulus: EI / (sec.props.Iy * 1e-12), density: 0, poissonRatio: 0.3, yieldStrength: 1e9, thermalExpansion: 0, color: 0, source: 't' };
    const sol = solveBeam({
      span: L,
      support: 'ss',
      loads: [
        { type: 'point', value: P, at: a },
        { type: 'point', value: P, at: L - a },
      ],
      section: sec,
      material: mat,
    });
    expect(sol.reactions.Ra).toBeCloseTo(P, 0);
    expect(sol.maxMoment.value).toBeCloseTo(P * a, 1); // M konstan P·a antara beban
    // y mid (pure bending antara beban): y = Pa(3L²−4a²)/24EI
    const yMid = (P * a * (3 * L ** 2 - 4 * a ** 2)) / (24 * EI);
    expect(sol.at(L / 2).y).toBeCloseTo(-yMid, 5);
  });

  it('overhang e=L/5 UDL w: R=kali wL/2, M hogging tumpuan = −we²/2, M sagging mid = w(L−2e)²/8, y tumpuan = 0', () => {
    const L = 8, e = L / 5, w = 5e3; // m, m, N/m
    const dims = { b: 100, h: 200 } as const;
    const sec = { id: 't', name: 't', shape: 'rect' as const, dims, props: rectProps(dims) };
    const EI = 1e6;
    const mat = { name: 't', elasticModulus: EI / (sec.props.Iy * 1e-12), density: 0, poissonRatio: 0.3, yieldStrength: 1e9, thermalExpansion: 0, color: 0, source: 't' };
    const sol = solveBeam({
      span: L,
      support: 'overhang',
      loads: [{ type: 'udl', value: w, from: 0, to: L }],
      section: sec,
      material: mat,
    });
    expect(sol.reactions.Ra).toBeCloseTo((w * L) / 2, 0); // simetri — sama dgn SS biasa
    expect(sol.at(e).M).toBeCloseTo((-w * e * e) / 2, 0); // hogging di tumpuan
    expect(sol.at(L / 2).M).toBeCloseTo((w * (L - 2 * e) ** 2) / 8 - (w * e * e) / 2, 0); // sagging tengah: simple-span (L−2e) dikurangi hogging tumpuan
    expect(sol.at(e).y).toBeCloseTo(0, 6); // BC tumpuan A
    expect(sol.at(L - e).y).toBeCloseTo(0, 6); // BC tumpuan B
    expect(sol.at(0).M).toBeCloseTo(0, 4); // ujung gantung bebas — M=0
    expect(sol.maxMoment.value).toBeCloseTo((w * (L - 2 * e) ** 2) / 8 - (w * e * e) / 2, 0); // sagging > |hogging| saat e=L/5
  });

  it('UPN200 vs tabel: A=32.2, Iy≈1910 (fillet −0.9%), Iz=116, Wx=191 (cm, satuan konsisten)', () => {
    const p = cProps({ h: 200, b: 75, tw: 8.5, tf: 11.5 });
    expect(p.A / 100).toBeCloseTo(32.2, 0); // cm² — 32.30 hitung, 32.2 tabel
    expect(Math.abs(p.Iy / 1e4 - 1910) / 1910).toBeLessThan(0.01); // dev <1% — fillet akar diabaikan (konvensi iProps)
    expect(p.Iz / 1e4).toBeCloseTo(117, 0); // cm⁴ — hitung 116.99, tabel 116
    expect(p.Sy / 1e3).toBeCloseTo(193, 0); // cm³ — hitung 192.7 (Iy tanpa fillet / cy), tabel 191
  });

  it('circular d=100: I = πd⁴/64', () => {
    const p = circularProps({ d: 100 });
    expect(p.Iy).toBeCloseTo((Math.PI * 100 ** 4) / 64, 6);
  });

  it('CHS d=200 t=10: I = π(D⁴−d⁴)/64 ≈ 4.619e7 mm⁴', () => {
    const p = circularProps({ d: 200, t: 10 });
    const di = 200 - 2 * 10;
    expect(p.Iy).toBeCloseTo((Math.PI * (200 ** 4 - di ** 4)) / 64, 4);
    expect(p.A).toBeCloseTo((Math.PI * (200 ** 2 - di ** 2)) / 4, 4);
  });

  it('IPE300 dalam batas toleransi tabel ArcelorMittal (±6%)', () => {
    // nilai tabel: A 5381 mm², Iy 8356e4 mm⁴
    const ipe = SECTION_PRESETS.find((s) => s.id === 'ipe300');
    expect(ipe).toBeDefined();
    const rel = Math.abs(ipe!.props.Iy - 8356e4) / 8356e4;
    expect(rel).toBeLessThan(0.06);
    const relA = Math.abs(ipe!.props.A - 5381) / 5381;
    expect(relA).toBeLessThan(0.06);
  });

  it('iProps: geometri valid (A > 0, Iy > Iz untuk profil H tegak)', () => {
    const p = iProps({ h: 400, b: 200, tw: 8, tf: 13 });
    expect(p.A).toBeGreaterThan(0);
    expect(p.Iy).toBeGreaterThan(p.Iz);
  });
});
