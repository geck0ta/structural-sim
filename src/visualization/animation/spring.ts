// §13/§14 — spring iOS sebagai warga kelas satu: frame-independent, semi-implicit Euler.
// Default (stiffness 170, damping 26) ≈ critically damped, feel iOS standar.

export class SpringNumber {
  value: number;
  target: number;
  private v = 0;

  constructor(
    value: number,
    readonly stiffness = 170,
    readonly damping = 26,
  ) {
    this.value = value;
    this.target = value;
  }

  /** dt dibatasi agar stabil saat frame drop / tab baru visible. */
  step(dt: number): number {
    const h = Math.min(dt, 1 / 60);
    const a = this.stiffness * (this.target - this.value) - this.damping * this.v;
    this.v += a * h;
    this.value += this.v * h;
    return this.value;
  }

  get settled(): boolean {
    return Math.abs(this.v) < 1e-3 && Math.abs(this.target - this.value) < 1e-3;
  }
}
