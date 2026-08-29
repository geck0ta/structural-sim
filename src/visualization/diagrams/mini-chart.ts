// §17 — diagram companion SVG (hand-written, tanpa chart lib): SFD, BMD, defleksi.
// Live-synced dengan 3D: sumber data sama (samples solver), warna tema glass.

const NS = 'http://www.w3.org/2000/svg';
const PAD = 16;

export interface ChartData {
  readonly x: number; // m
  readonly v: number; // nilai seri (V N / M N·m / y m) — visual (scaled untuk δ)
  readonly raw?: number; // nilai fisik asli untuk readout (δ tak diperbesar)
}

export const CHART_COLORS = { shear: '#ff9f0a', moment: '#ff375f', deflect: '#30d158' } as const;

/** Chart satu seri: line + area fill ke nol, crosshair hover + value readout. */
export class MiniChart {
  readonly el: SVGSVGElement;
  private readonly plot: SVGPathElement;
  private readonly plotGroup: SVGGElement;
  private readonly fill: SVGPathElement;
  private readonly zero: SVGLineElement;
  private readonly tip: SVGLineElement;
  private readonly dot: SVGCircleElement;
  private readonly labelEl: SVGTextElement;
  private readonly valueEl: SVGTextElement;
  private data: readonly ChartData[] = [];
  private hoverI = -1;
  private readonly fmtV: (v: number) => string;
  private readonly w: number;
  private readonly h: number;

  constructor(label: string, color: string, w: number, h: number, fmtV: (v: number) => string) {
    this.fmtV = fmtV;
    this.w = w;
    this.h = h;
    this.el = document.createElementNS(NS, 'svg');
    this.el.classList.add('minichart');
    this.el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.el.setAttribute('role', 'img');
    this.el.setAttribute('aria-label', label);

    this.fill = document.createElementNS(NS, 'path');
    this.fill.setAttribute('fill', color);
    this.fill.setAttribute('fill-opacity', '0.14');

    // Clip: kurva + fill + crosshair tak keluar kotak chart.
    const clip = document.createElementNS(NS, 'clipPath');
    clip.id = `clip-${label.replace(/\W+/g, '')}-${Math.round(Math.random() * 1e6)}`;
    const clipRect = document.createElementNS(NS, 'rect');
    clipRect.setAttribute('x', '0');
    clipRect.setAttribute('y', '8');
    clipRect.setAttribute('width', String(w));
    clipRect.setAttribute('height', String(h - 16));
    clip.append(clipRect);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('clip-path', `url(#${clip.id})`);
    this.el.append(clip, g);
    this.plotGroup = g;

    this.zero = document.createElementNS(NS, 'line');
    this.zero.setAttribute('stroke', 'var(--border)');
    this.zero.setAttribute('stroke-dasharray', '3 3');
    this.zero.setAttribute('stroke-width', '1');

    this.plot = document.createElementNS(NS, 'path');
    this.plot.setAttribute('fill', 'none');
    this.plot.setAttribute('stroke', color);
    this.plot.setAttribute('stroke-width', '1.6');
    this.plot.setAttribute('stroke-linejoin', 'round');

    this.tip = document.createElementNS(NS, 'line');
    this.tip.setAttribute('stroke', 'var(--muted)');
    this.tip.setAttribute('stroke-width', '0.75');
    this.tip.style.display = 'none';

    this.dot = document.createElementNS(NS, 'circle');
    this.dot.setAttribute('r', '3');
    this.dot.setAttribute('fill', color);
    this.dot.style.display = 'none';

    this.labelEl = document.createElementNS(NS, 'text');
    this.labelEl.textContent = label;
    this.labelEl.setAttribute('x', '4');
    this.labelEl.setAttribute('y', '11');
    this.labelEl.setAttribute('fill', 'var(--muted)');
    this.labelEl.setAttribute('font-size', '10');

    this.valueEl = document.createElementNS(NS, 'text');
    this.valueEl.setAttribute('x', String(w - 4));
    this.valueEl.setAttribute('y', '11');
    this.valueEl.setAttribute('fill', 'var(--muted)');
    this.valueEl.setAttribute('font-size', '10');
    this.valueEl.setAttribute('text-anchor', 'end');
    this.valueEl.textContent = '';

    // plot elements ter-clip; label/value/zero di atas.
    this.plotGroup.append(this.fill, this.plot, this.tip, this.dot);
    this.el.append(this.zero, this.plotGroup, this.labelEl, this.valueEl);

    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    this.el.addEventListener('pointerleave', () => this.setHover(-1));
  }

  private onMove(e: PointerEvent): void {
    if (!this.data.length) return;
    const r = this.el.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * this.w;
    const i = Math.round(((t - PAD) / (this.w - 2 * PAD)) * (this.data.length - 1));
    this.setHover(Math.min(Math.max(i, 0), this.data.length - 1));
  }

  private setHover(i: number): void {
    this.hoverI = i;
    const on = i >= 0 && this.data.length > 0;
    this.tip.style.display = on ? 'block' : 'none';
    this.dot.style.display = on ? 'block' : 'none';
    if (on) {
      this.render();
    } else {
      this.valueEl.textContent = '';
    }
  }

  update(samples: readonly ChartData[]): void {
    this.data = samples;
    this.render();
  }

  private render(): void {
    const d = this.data;
    if (!d.length) return;
    const n = d.length;
    let vMax = 0;
    let vMin = 0;
    for (const p of d) {
      if (p.v > vMax) vMax = p.v;
      if (p.v < vMin) vMin = p.v;
    }
    const vAbs = Math.max(Math.abs(vMax), Math.abs(vMin), 1e-12);
    const innerW = this.w - 2 * PAD;
    const innerH = this.h - 2 * PAD - 6;
    const py = (v: number): number => this.h - PAD - 3 - ((v + vAbs) / (2 * vAbs)) * innerH;
    const px = (i: number): number => PAD + (i / (n - 1)) * innerW;

    let dd = '';
    for (let i = 0; i < n; i++) {
      dd += (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ',' + py(d[i]!.v).toFixed(1);
    }
    this.plot.setAttribute('d', dd);
    const zy = py(0).toFixed(1);
    this.fill.setAttribute('d', `${dd} L${px(n - 1).toFixed(1)},${zy} L${px(0).toFixed(1)},${zy} Z`);
    this.zero.setAttribute('x1', String(PAD));
    this.zero.setAttribute('x2', String(this.w - PAD));
    this.zero.setAttribute('y1', zy);
    this.zero.setAttribute('y2', zy);

    if (this.hoverI >= 0 && this.hoverI < n) {
      const p = d[this.hoverI]!;
      const x = px(this.hoverI);
      this.tip.setAttribute('x1', String(x));
      this.tip.setAttribute('x2', String(x));
      this.tip.setAttribute('y1', String(PAD));
      this.tip.setAttribute('y2', String(this.h - PAD));
      this.dot.setAttribute('cx', String(x));
      this.dot.setAttribute('cy', String(py(p.v)));
      this.valueEl.textContent = `${this.fmtV(p.raw ?? p.v)} @ ${p.x.toPrecision(3)} m`;
    }
  }
}
