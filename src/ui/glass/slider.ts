// §14 — slider iOS: track tipis, thumb putih ber-shadow, value bubble saat drag.

export class IOSSlider {
  private readonly root: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private dragging = false;
  private val: number;

  constructor(
    private min: number,
    private max: number,
    private readonly step: number,
 initial: number,
 _format: (v: number) => string, // value ditampilkan di label baris (pola instrumen), bukan bubble
 private readonly onInput: (v: number) => void,
    ariaLabel: string,
  ) {
    this.val = initial;
    this.root = document.createElement('div');
    this.root.className = 'ios-slider';
    this.root.setAttribute('role', 'slider');
    this.root.setAttribute('aria-label', ariaLabel);
    this.root.setAttribute('aria-valuemin', String(min));
    this.root.setAttribute('aria-valuemax', String(max));
    this.root.tabIndex = 0;

    this.fill = document.createElement('div');
    this.fill.className = 'ios-slider-fill';
    const thumb = document.createElement('div');
    thumb.className = 'ios-slider-thumb';
    this.root.append(this.fill, thumb);

    this.root.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.root.setPointerCapture(e.pointerId);
      this.root.classList.add('dragging');
      this.fromEvent(e);
    });
    this.root.addEventListener('pointermove', (e) => {
      if (this.dragging) this.fromEvent(e);
    });
    const end = (): void => {
      this.dragging = false;
      this.root.classList.remove('dragging');
    };
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);
    this.root.addEventListener('keydown', (e) => {
      let d = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
      if (d !== 0) {
        e.preventDefault();
        this.set(this.val + d, true);
      }
    });
    this.set(initial, false);
  }

  private fromEvent(e: PointerEvent): void {
    const r = this.root.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width;
    const raw = this.min + t * (this.max - this.min);
    this.set(Math.round(raw / this.step) * this.step, true);
  }

  set(v: number, notify: boolean): void {
    this.val = Math.min(this.max, Math.max(this.min, v));
    const t = (this.val - this.min) / (this.max - this.min);
    this.root.setAttribute('aria-valuenow', String(this.val));
    this.root.style.setProperty('--t', `${t * 100}%`);
    this.fill.style.width = `${t * 100}%`;
    if (notify) this.onInput(this.val);
  }

  /** Geser rentang slider (mis. posisi beban mengikuti bentang L). */
  setRange(min: number, max: number, v: number): void {
    this.min = min;
    this.max = max;
    this.root.setAttribute('aria-valuemax', String(max));
    this.set(v, false);
  }

  get value(): number {
    return this.val;
  }

  get el(): HTMLDivElement {
    return this.root;
  }
}
