// §12 — MiniChart SVG hand-written: garis + fill gradien + crosshair hover.
// Declutter 10-14: label sumbu hanya chart terakhir, readout hover mengikuti titik,
// label nilai puncak, 2 tick horizontal halus. Semua warna via .style.* (bukan atribut).

const NS = 'http://www.w3.org/2000/svg';
const PAD = 8;

export interface ChartData {
  x: number;
  v: number;
  raw?: number;
}

export const CHART_COLORS = { shear: '#ff9f0a', moment: '#ff375f', deflect: '#30d158' } as const;

export class MiniChart {
  readonly el: SVGSVGElement;
  onHover: ((x: number | null) => void) | null = null;
  /** Callback klik (pin persist) — x meter pada titik data terdekat. */
  onPin: ((x: number | null) => void) | null = null;
  private data: readonly ChartData[] = [];
  private hoverI = -1;
  private readonly grad: SVGLinearGradientElement;
  private readonly fill: SVGPathElement;
  private readonly zero: SVGLineElement;
  private readonly tickA: SVGLineElement;
  private readonly tickB: SVGLineElement;
  private readonly plot: SVGPathElement;
  private readonly tip: SVGLineElement;
  private readonly dot: SVGCircleElement;
  private readonly labelEl: SVGTextElement;
  private readonly readoutEl: SVGTextElement;
  private readonly peakEl: SVGTextElement;
  private readonly x0El: SVGTextElement | null;
  private readonly axisEl: SVGTextElement | null;
  private readonly fmtV: (v: number) => string;
  private readonly w: number;
  private readonly h: number;

  constructor(label: string, unit: string, color: string, w: number, h: number, fmtV: (v: number) => string, axisLabels = false) {
    this.fmtV = fmtV;
    this.w = w;
    this.h = h;
    this.el = document.createElementNS(NS, 'svg');
    this.el.classList.add('minichart');
    this.el.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.el.setAttribute('role', 'img');
    this.el.setAttribute('aria-label', label);

    // Area fill: gradien memudar dari garis nol (puncak 0.18, dua arah).
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

    // Garis nol putus-putus + 2 tick halus ±setengah skala (declutter 12 — tanpa angka).
    this.zero = document.createElementNS(NS, 'line');
    this.zero.style.stroke = 'var(--border)';
    this.zero.setAttribute('stroke-dasharray', '3 3');
    this.zero.setAttribute('stroke-width', '1');
    this.tickA = document.createElementNS(NS, 'line');
    this.tickB = document.createElementNS(NS, 'line');
    for (const t of [this.tickA, this.tickB]) {
      t.style.stroke = 'var(--border)';
      t.setAttribute('stroke-dasharray', '2 5');
      t.setAttribute('stroke-width', '0.75');
      (t.style as CSSStyleDeclaration & { opacity: string }).opacity = '0.6';
    }

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
    this.tip.style.stroke = 'var(--text-2)';
    this.tip.setAttribute('stroke-width', '0.75');
    this.tip.style.display = 'none';

    this.dot = document.createElementNS(NS, 'circle');
    this.dot.setAttribute('r', '3');
    this.dot.setAttribute('fill', color);
    this.dot.style.display = 'none';

    this.labelEl = document.createElementNS(NS, 'text');
    this.labelEl.setAttribute('x', '4');
    this.labelEl.setAttribute('y', '11');
    this.labelEl.style.fill = 'var(--text)';
    this.labelEl.setAttribute('font-size', '11');
    this.labelEl.setAttribute('font-weight', '600');
    const unitEl = document.createElementNS(NS, 'tspan');
    unitEl.textContent = ` ${unit}`;
    unitEl.style.fill = 'var(--text-2)';
    unitEl.setAttribute('font-size', '9.5');
    unitEl.setAttribute('font-weight', '400');
    this.labelEl.append(unitEl);

    // Label nilai puncak (declutter 11) — angka di titik ekstrem, muted.
    this.peakEl = document.createElementNS(NS, 'text');
    this.peakEl.setAttribute('font-size', '9');
    this.peakEl.setAttribute('text-anchor', 'middle');
    this.peakEl.style.fill = 'var(--text)';
    (this.peakEl.style as CSSStyleDeclaration & { paintOrder: string }).paintOrder = 'stroke';
    this.peakEl.style.stroke = 'var(--surface-2)';
    this.peakEl.setAttribute('stroke-width', '3');

    // Readout hover (declutter 14): nilai @ posisi, mengikuti titik — bukan di sumbu.
    this.readoutEl = document.createElementNS(NS, 'text');
    this.readoutEl.setAttribute('font-size', '9');
    this.readoutEl.setAttribute('text-anchor', 'middle');
    this.readoutEl.style.fill = 'var(--text)';
    this.readoutEl.setAttribute('font-weight', '500');
    (this.readoutEl.style as CSSStyleDeclaration & { paintOrder: string }).paintOrder = 'stroke';
    this.readoutEl.style.stroke = 'var(--surface-2)';
    this.readoutEl.setAttribute('stroke-width', '3');
    this.readoutEl.style.display = 'none';

    // Sumbu bawah statis HANYA di chart terakhir (declutter 10 — digabung, tak diulang 3x).
    if (axisLabels) {
      this.x0El = document.createElementNS(NS, 'text');
      this.x0El.setAttribute('x', '4');
      this.x0El.setAttribute('y', String(h - 2));
      this.x0El.style.fill = 'var(--text-2)';
      this.x0El.setAttribute('font-size', '9');
      this.x0El.textContent = '0';
      this.axisEl = document.createElementNS(NS, 'text');
      this.axisEl.setAttribute('x', String(w - 4));
      this.axisEl.setAttribute('y', String(h - 2));
      this.axisEl.style.fill = 'var(--text-2)';
      this.axisEl.setAttribute('font-size', '9');
      this.axisEl.setAttribute('text-anchor', 'end');
      this.axisEl.textContent = '';
      this.el.append(this.x0El, this.axisEl);
    } else {
      this.x0El = null;
      this.axisEl = null;
    }

    // fill+tick paling belakang; plot ter-clip; label & readout di atasnya.
    this.plotGroup.append(this.tickA, this.tickB, this.fill, this.plot, this.tip, this.dot);
    this.el.append(defs, this.zero, this.plotGroup, this.labelEl, this.peakEl, this.readoutEl);

    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    this.el.addEventListener('pointerleave', () => this.setHover(-1));
    // F1: klik → pin marker 3D persist (toggle di main.ts).
    this.el.addEventListener('click', (e) => {
      if (!this.data.length) return;
      const r = this.el.getBoundingClientRect();
      const t = ((e.clientX - r.left) / r.width) * this.w;
      const i = Math.min(Math.max(Math.round(((t - PAD) / (this.w - 2 * PAD)) * (this.data.length - 1)), 0), this.data.length - 1);
      this.onPin?.(this.data[i]!.x);
    });
  }

  private readonly plotGroup: SVGGElement;

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
    this.readoutEl.style.display = on ? 'block' : 'none';
    // Callback UI lain (crosshair 3D sinkron) — x dalam meter, null = lepas.
    this.onHover?.(on ? this.data[i]!.x : null);
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
    for (const z of [this.zero]) {
      z.setAttribute('x1', String(PAD));
      z.setAttribute('x2', String(this.w - PAD));
      z.setAttribute('y1', zy);
      z.setAttribute('y2', zy);
    }
    // Tick ±½skala.
    const tyA = py(vAbs / 2).toFixed(1);
    const tyB = py(-vAbs / 2).toFixed(1);
    this.tickA.setAttribute('x1', String(PAD));
    this.tickA.setAttribute('x2', String(this.w - PAD));
    this.tickA.setAttribute('y1', tyA);
    this.tickA.setAttribute('y2', tyA);
    this.tickB.setAttribute('x1', String(PAD));
    this.tickB.setAttribute('x2', String(this.w - PAD));
    this.tickB.setAttribute('y1', tyB);
    this.tickB.setAttribute('y2', tyB);

    // Nilai puncak: titik ekstrem |v| maks (skip saat hover menutupi).
    let peakI = 0;
    for (let i = 1; i < n; i++) {
      if (Math.abs(d[i]!.v) > Math.abs(d[peakI]!.v)) peakI = i;
    }
    const peak = d[peakI]!;
    this.peakEl.setAttribute('x', String(Math.min(Math.max(px(peakI), 18), this.w - 18)));
    this.peakEl.setAttribute('y', String(Math.max(py(peak.v) - 5, 10)));
    this.peakEl.textContent = this.fmtV(peak.v); // instrumen: "41.4 kN·m", bukan "4.14e+4"

    if (this.hoverI >= 0 && this.hoverI < n) {
      const p = d[this.hoverI]!;
      const x = px(this.hoverI);
      this.tip.setAttribute('x1', String(x));
      this.tip.setAttribute('x2', String(x));
      this.tip.setAttribute('y1', String(PAD));
      this.tip.setAttribute('y2', String(this.h - PAD));
      this.dot.setAttribute('cx', String(x));
      this.dot.setAttribute('cy', String(py(p.v)));
      // Readout mengikuti titik, di-clamp agar tak keluar chart.
      this.readoutEl.setAttribute('x', String(Math.min(Math.max(x, 34), this.w - 34)));
      const ry = Math.max(py(p.v) - 8, 12);
      this.readoutEl.setAttribute('y', String(ry));
      this.readoutEl.textContent = `${this.fmtV(p.raw ?? p.v)} @ ${p.x.toPrecision(3)} m`;
      this.peakEl.style.display = Math.abs(this.hoverI - peakI) < 6 ? 'none' : 'block';
    } else {
      this.peakEl.style.display = 'block';
      if (this.axisEl) this.axisEl.textContent = `${d[n - 1]!.x.toFixed(1)} m`;
    }
  }
}
