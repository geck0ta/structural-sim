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

/** Chart satu seri: garis + area fill gradien dari garis nol + gridline + crosshair + readout. */
export class MiniChart {
  readonly el: SVGSVGElement;
  private readonly fill: SVGPathElement;
  private readonly grad: SVGLinearGradientElement;
  private readonly plot: SVGPathElement;
  private readonly plotGroup: SVGGElement;
  private readonly gridA: SVGLineElement;
  private readonly gridB: SVGLineElement;
  private readonly zero: SVGLineElement;
  private readonly tip: SVGLineElement;
  private readonly dot: SVGCircleElement;
  private readonly labelEl: SVGTextElement;
  private readonly x0El: SVGTextElement;
  private readonly axisEl: SVGTextElement;
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

    // Area fill: gradien warna seri memudar dari garis nol (puncak 0.18, dua arah).
    const gid = `grad-${Math.round(Math.random() * 1e6)}`;
    this.grad = document.createElementNS(NS, 'linearGradient');
    this.grad.id = gid;
    this.grad.setAttribute('x1', '0');
    this.grad.setAttribute('y1', '0');
    this.grad.setAttribute('x2', '0');
    this.grad.setAttribute('y2', '1');
    const s1 = document.createElementNS(NS, 'stop');
    s1.setAttribute('offset', '0');
    s1.setAttribute('stop-color', color);
    s1.setAttribute('stop-opacity', '0');
    const s2 = document.createElementNS(NS, 'stop');
    s2.setAttribute('offset', '0.5');
    s2.setAttribute('stop-color', color);
    s2.setAttribute('stop-opacity', '0.18');
    const s3 = document.createElementNS(NS, 'stop');
    s3.setAttribute('offset', '1');
    s3.setAttribute('stop-color', color);
    s3.setAttribute('stop-opacity', '0');
    this.grad.append(s1, s2, s3);
    const defs = document.createElementNS(NS, 'defs');
    defs.append(this.grad);
    this.fill = document.createElementNS(NS, 'path');
    this.fill.setAttribute('fill', `url(#${gid})`);

    // Gridline horizontal halus — di belakang kurva, tanpa fill/background.
    // warna via inline STYLE: var() di atribut presentasi SVG tak di-resolve → hitam.
    const mkGrid = (): SVGLineElement => {
      const l = document.createElementNS(NS, 'line');
      l.style.stroke = 'var(--border)';
      l.setAttribute('stroke-width', '1');
      l.setAttribute('stroke-opacity', '0.6');
      return l;
    };
    this.gridA = mkGrid();
    this.gridB = mkGrid();

    // Clip: kurva + crosshair tak keluar kotak chart.
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
    this.zero.style.stroke = 'var(--border)';
    this.zero.setAttribute('stroke-dasharray', '3 3');
    this.zero.setAttribute('stroke-width', '1');

    this.plot = document.createElementNS(NS, 'path');
    this.plot.setAttribute('fill', 'none');
    this.plot.setAttribute('stroke', color);
    this.plot.setAttribute('stroke-width', '1.6');
    this.plot.setAttribute('stroke-linejoin', 'round');

    this.tip = document.createElementNS(NS, 'line');
    this.tip.style.stroke = 'var(--muted)';
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
    this.labelEl.style.fill = 'var(--muted)';
    this.labelEl.setAttribute('font-size', '10');

    // Sumbu bawah: '0' kiri; kanan = panjang bentang, jadi readout saat hover.
    this.x0El = document.createElementNS(NS, 'text');
    this.x0El.setAttribute('x', '4');
    this.x0El.setAttribute('y', String(h - 2));
    this.x0El.style.fill = 'var(--muted)';
    this.x0El.setAttribute('font-size', '9');
    this.x0El.textContent = '0';
    this.axisEl = document.createElementNS(NS, 'text');
    this.axisEl.setAttribute('x', String(w - 4));
    this.axisEl.setAttribute('y', String(h - 2));
    this.axisEl.style.fill = 'var(--muted)';
    this.axisEl.setAttribute('font-size', '9');
    this.axisEl.setAttribute('text-anchor', 'end');
    this.axisEl.textContent = '';

    // fill paling belakang, lalu gridline; plot ter-clip; label & sumbu di atasnya.
    this.plotGroup.append(this.fill, this.gridA, this.gridB, this.plot, this.tip, this.dot);
    this.el.append(defs, this.zero, this.plotGroup, this.labelEl, this.x0El, this.axisEl);

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
    this.render();
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
    this.fill.setAttribute('d', `${dd} L${px(n - 1).toFixed(1)},${py(0).toFixed(1)} L${px(0).toFixed(1)},${py(0).toFixed(1)} Z`);
    const zy = py(0).toFixed(1);
    this.zero.setAttribute('x1', String(PAD));
    this.zero.setAttribute('x2', String(this.w - PAD));
    this.zero.setAttribute('y1', zy);
    this.zero.setAttribute('y2', zy);
    const g1 = py(vAbs * 0.5).toFixed(1);
    const g2 = py(-vAbs * 0.5).toFixed(1);
    for (const g of [this.gridA, this.gridB]) {
      g.setAttribute('x1', String(PAD));
      g.setAttribute('x2', String(this.w - PAD));
    }
    this.gridA.setAttribute('y1', g1);
    this.gridA.setAttribute('y2', g1);
    this.gridB.setAttribute('y1', g2);
    this.gridB.setAttribute('y2', g2);

    if (this.hoverI >= 0 && this.hoverI < n) {
      const p = d[this.hoverI]!;
      const x = px(this.hoverI);
      this.tip.setAttribute('x1', String(x));
      this.tip.setAttribute('x2', String(x));
      this.tip.setAttribute('y1', String(PAD));
      this.tip.setAttribute('y2', String(this.h - PAD));
      this.dot.setAttribute('cx', String(x));
      this.dot.setAttribute('cy', String(py(p.v)));
      this.axisEl.textContent = `${this.fmtV(p.raw ?? p.v)} @ ${p.x.toPrecision(3)} m`;
    } else {
      this.axisEl.textContent = `${d[n - 1]!.x.toFixed(1)} m`;
    }
  }
}
