// §13 — animasi balok: tiap sampel V/M/y di-spring (iOS feel), frame-independent.
// factor = fase beban 0..1 (ramp gempa beban; fisika linear → respons ∝ factor).

const STIFF = 170;
const DAMP = 26;
const DT_MAX = 1 / 30;

export class BeamAnim {
  readonly n: number;
  readonly V: Float64Array;
  readonly M: Float64Array;
  readonly y: Float64Array;
  private readonly tV: Float64Array;
  private readonly tM: Float64Array;
  private readonly ty: Float64Array;
  private readonly vV: Float64Array;
  private readonly vM: Float64Array;
  private readonly vy: Float64Array;
  factor = 1;
  factorTarget = 1;
  private factorVel = 0;

  constructor(n: number) {
    this.n = n;
    this.V = new Float64Array(n); this.M = new Float64Array(n); this.y = new Float64Array(n);
    this.tV = new Float64Array(n); this.tM = new Float64Array(n); this.ty = new Float64Array(n);
    this.vV = new Float64Array(n); this.vM = new Float64Array(n); this.vy = new Float64Array(n);
  }

  setTargets(V: ArrayLike<number>, M: ArrayLike<number>, y: ArrayLike<number>): void {
    for (let i = 0; i < this.n; i++) { this.tV[i] = V[i]; this.tM[i] = M[i]; this.ty[i] = y[i]; }
  }

  snapToTargets(): void {
    for (let i = 0; i < this.n; i++) {
      this.V[i] = this.tV[i]; this.M[i] = this.tM[i]; this.y[i] = this.ty[i];
      this.vV[i] = this.vM[i] = this.vy[i] = 0;
    }
  }

  setFactor(value: number, target: number): void {
    this.factor = value;
    this.factorTarget = target;
    this.factorVel = 0;
  }

  /** Satu langkah animasi. Return true bila masih bergerak (untuk skip redraw). */
  step(dt: number): boolean {
    const d = Math.min(dt, DT_MAX);
    let moved = false;
    const spring = (x: Float64Array, t: Float64Array, v: Float64Array): void => {
      for (let i = 0; i < x.length; i++) {
        const a = STIFF * (t[i] - x[i]) - DAMP * v[i];
        v[i] += a * d;
        const nx = x[i] + v[i] * d;
        if (Math.abs(nx - x[i]) > 1e-9) moved = true;
        x[i] = nx;
      }
    };
    spring(this.V, this.tV, this.vV);
    spring(this.M, this.tM, this.vM);
    spring(this.y, this.ty, this.vy);
    const fa = STIFF * (this.factorTarget - this.factor) - DAMP * this.factorVel;
    this.factorVel += fa * d;
    const nf = this.factor + this.factorVel * d;
    if (Math.abs(nf - this.factor) > 1e-9) moved = true;
    this.factor = Math.min(1.2, Math.max(-0.05, nf));
    return moved;
  }
}
