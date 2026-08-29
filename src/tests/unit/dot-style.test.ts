import { describe, expect, it } from 'vitest';
import { dotStyle } from '../../visualization/three/dot-style';

describe('dotStyle — magnitude → gaya visual', () => {
  it('P=0: glow redup, plain solid', () => {
    expect(dotStyle(0)).toEqual({ glow: 0.25, plain: 0.85 });
  });
  it('P=REF 60 kN: glow terang, plain pucat', () => {
    const s = dotStyle(60e3);
    expect(s.glow).toBeCloseTo(0.85);
    expect(s.plain).toBeCloseTo(0.35);
  });
  it('P sangat besar: clamp glow ≤1, plain ≥0.15', () => {
    expect(dotStyle(1e6)).toEqual({ glow: 1, plain: 0.15 });
  });
  it('magnitude: negatif = positif', () => {
    expect(dotStyle(-60e3)).toEqual(dotStyle(60e3));
  });
});
