// §14 — magnitude gaya → intensitas visual dot. Pure + clamp.
const REF = 60e3; // N — saturasi visual

export interface DotStyle {
  readonly glow: number; // opacity halo 0..1 — beban (makin besar makin terang)
  readonly plain: number; // opacity dot polos — reaksi (makin besar makin pucat)
}

export function dotStyle(force: number, ref = REF): DotStyle {
  const t = Math.min(Math.abs(force) / ref, 1.5);
  return {
    glow: Math.min(0.25 + t * 0.6, 1),
    plain: Math.max(0.85 - t * 0.5, 0.15),
  };
}
