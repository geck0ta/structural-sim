import { describe, it, expect } from 'vitest';
import { SpringNumber } from '../../visualization/animation/spring';
import { rectProps, iProps, circularProps, SECTION_PRESETS } from '../../structural/models/section';

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

  it('circular d=100: I = πd⁴/64', () => {
    const p = circularProps(100);
    expect(p.Iy).toBeCloseTo((Math.PI * 100 ** 4) / 64, 6);
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
