// MATH-2 — Ribbon 3D: kurva fungsi f(x) sebagai pita mengambang di sepanjang beam.
// Satu BufferGeometry (2 vertex per ring: atas=bawah pita), morph via spring di main.
// Warna = sign nilai (hijau +, merah −); tinggi = nilai ternormalisasi.

import * as THREE from 'three';

export interface RibbonOpts {
  /** normalisasi: nilai → offset vertikal (m). Panggilan ulang saat skala berubah. */
  readonly scale: number;
  /** jarak vertikal dari beam ke dasar ribbon (m). */
  readonly offset: number;
  /** tinggi pita (m) — konstan, warna yang membawa data. */
  readonly band: number;
}

const POS = 0x30d158;
const NEG = 0xff453a;

/** Satu ribbon untuk satu fungsi. update(values) — tanpa alokasi per frame. */
export class Ribbon {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly n: number;
  private span: number;

  constructor(span: number, rings: number, depthZ: number) {
    this.span = span;
    this.n = rings;
    const vertCount = rings * 2;
    this.posAttr = new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    const index: number[] = [];
    for (let i = 0; i < rings - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2 + 1, d = (i + 1) * 2;
      index.push(a, b, c, a, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setIndex(index);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    );
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.depthZ = depthZ;
  }

  private depthZ: number;

  /** values = sampel fungsi (bisa negatif); opt.scale = m per unit nilai. */
  update(values: ArrayLike<number>, opt: RibbonOpts): void {
    const n = Math.min(this.n, values.length);
    const dx = this.span / (this.n - 1);
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const x = i * dx;
      const v = values[i]! * opt.scale;
      const base = i * 6;
      // vertex bawah & atas pita (pita vertikal menghadap kamera orbit default)
      pos[base] = x; pos[base + 1] = opt.offset + v - opt.band / 2; pos[base + 2] = this.depthZ;
      pos[base + 3] = x; pos[base + 4] = opt.offset + v + opt.band / 2; pos[base + 5] = this.depthZ;
      const c = values[i]! >= 0 ? POS : NEG;
      col[base] = ((c >> 16) & 255) / 255; col[base + 1] = ((c >> 8) & 255) / 255; col[base + 2] = (c & 255) / 255;
      col[base + 3] = col[base]; col[base + 4] = col[base + 1]; col[base + 5] = col[base + 2];
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  /** Bentang berubah → cukup update; posisi dihitung ulang per frame. */
  setSpan(span: number): void {
    this.span = span;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.group.remove(this.mesh);
  }
}
