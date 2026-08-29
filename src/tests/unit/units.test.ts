import { describe, it, expect } from 'vitest';
import { sig3, fmt, fmtForce, fmtStress, fmtMoment } from '../../core/units';

// §1 benchmark unit: format SI prefix, 3 significant digits.
describe('units', () => {
  it('sig3: 3 significant digits tanpa trailing zero', () => {
    expect(sig3(1.23456)).toBe('1.23');
    expect(sig3(0.000123456)).toBe('0.000123');
    expect(sig3(123000)).toBe('123000');
  });

  it('fmt: prefix otomatis', () => {
    expect(fmt(1234567, 'N')).toBe('1.23 MN');
    expect(fmt(20000, 'N')).toBe('20 kN');
    expect(fmt(0.5, 'm')).toBe('500 mm');
  });

  it('fmtForce/fmtStress/fmtMoment', () => {
    expect(fmtForce(355e6)).toBe('355 MN');
    expect(fmtStress(355e6)).toBe('355 MPa');
    expect(fmtMoment(24000)).toBe('24 kN·m');
  });
});
