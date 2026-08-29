import * as THREE from 'three';
import type { Section } from '../../structural/models/types';
import type { BeamSupport } from '../../structural/beam/beam-solver';
import type { BeamAnim } from '../animation/beam-anim';

// §7/§17 — Lab Balok 3D: profil penampang ASLI (IPE300 dsb.) di-sweep mengikuti
// kurva defleksi y(x). Satu BufferGeometry, posisi di-update per frame (tanpa rebuild).
// Panah beban (biru, tip di permukaan atas) & reaksi (hijau, tip di bawah balok),
// panjang ∝ magnitude. Defleksi diperbesar — skala dari main.

const LOAD_COLOR = 0xff453a; // beban: merah (konvensi umum beban luar)
const REACT_COLOR = 0xffd60a; // reaksi: kuning netral
const SUPPORT_COLOR = 0x484f57;
const STEEL = 0x97a1ab;
const SUPPORT_H = 1.2; // elevasi balok — memberi ruang panah reaksi ∝ magnitude
const ARROW_REACH = 0.86; // tip lokal panah (m, sebelum scale)
const REF_FORCE = 60e3; // N → panjang panah 1.0 (kompres)

/** Titik keliling penampang (m), CCW. x = lebar (→ sumbu Z), y = tinggi (→ Y). */
export function profilePoints(s: Section): THREE.Vector2[] {
  const m = (mm: number): number => mm / 1000;
  switch (s.shape) {
    case 'rect': {
      const { b, h } = s.dims;
      return [
        new THREE.Vector2(-m(b / 2), -m(h / 2)), new THREE.Vector2(m(b / 2), -m(h / 2)),
        new THREE.Vector2(m(b / 2), m(h / 2)), new THREE.Vector2(-m(b / 2), m(h / 2)),
      ];
    }
    case 'circular': {
      const r = m(s.dims.d / 2);
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
      }
      return pts;
    }
    case 'i': {
      const { h, b, tw, tf } = s.dims;
      const p: [number, number][] = [
        [-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf],
        [tw / 2, h / 2 - tf], [b / 2, h / 2 - tf], [b / 2, h / 2], [-b / 2, h / 2],
        [-b / 2, h / 2 - tf], [-tw / 2, h / 2 - tf], [-tw / 2, -h / 2 + tf], [-b / 2, -h / 2 + tf],
      ];
      return p.map(([u, v]) => new THREE.Vector2(m(u), m(v)));
    }
  }
}

/** Panah mengarah ke bawah; origin = pangkal, tip = −ARROW_REACH·scaleY. */
function makeArrow(color: number): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 12), mat);
  shaft.position.y = -0.36;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 16), mat);
  tip.position.y = -0.86;
  g.add(shaft, tip);
  g.visible = false;
  return g;
}

export interface DeformOpts {
  readonly scale: number; // faktor perbesaran defleksi
  readonly loadAt: number; // m
  readonly loadP: number; // N
  readonly loadType: 'point' | 'udl';
  readonly support: BeamSupport;
  readonly reactions: { readonly Ra: number; readonly Rb: number; readonly Ma: number };
}

export class BeamView {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private posAttr: THREE.BufferAttribute | null = null;
  private profile: THREE.Vector2[] = [];
  private rings = 101;
  private span = 0;
  private centerY = SUPPORT_H;
  private depth = 0.3;
  private width = 0.2;
  readonly loadArrow = makeArrow(LOAD_COLOR);
  private readonly reactA = makeArrow(REACT_COLOR);
  private readonly reactB = makeArrow(REACT_COLOR);
  private readonly udlArrows: THREE.Group[] = [];
  private readonly supports = new THREE.Group();
  private readonly beamMat: THREE.MeshStandardMaterial;
  private readonly propMat: THREE.MeshStandardMaterial;

  constructor(private readonly scene: THREE.Scene, beamMaterial?: THREE.MeshStandardMaterial) {
    this.beamMat = beamMaterial ?? new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.45, metalness: 0.7 });
    this.propMat = new THREE.MeshStandardMaterial({ color: SUPPORT_COLOR, roughness: 0.8, metalness: 0.2 });
    this.group.add(this.loadArrow, this.reactA, this.reactB, this.supports);
    this.reactA.rotation.z = Math.PI; // panah reaksi mengarah ke atas (gaya tumpuan)
    this.reactB.rotation.z = Math.PI;
    for (let i = 0; i < 8; i++) {
      const a = makeArrow(LOAD_COLOR);
      a.scale.set(0.5, 0.5, 0.5);
      this.udlArrows.push(a);
      this.group.add(a);
    }
    this.scene.add(this.group);
  }

  get beamCenterY(): number {
    return this.centerY;
  }

  get supportHeight(): number {
    return SUPPORT_H;
  }

  /** Ganti material balok (tekstur kayu/beton/baja) — dispose yang lama. */
  setBeamMaterial(m: THREE.MeshStandardMaterial): void {
    this.beamMat.dispose();
    Object.assign(this.beamMat, m);
    this.beamMat.needsUpdate = true;
  }

  /** Rebuild geometri (dipanggil saat penampang/panjang/support berubah). */
  setBeam(section: Section, span: number, support: BeamSupport): void {
    this.span = span;
    this.profile = profilePoints(section);
    this.depth = (section.shape === 'circular' ? section.dims.d : section.dims.h) / 1000;
    this.width = (section.shape === 'circular' ? section.dims.d : section.dims.b) / 1000;
    this.centerY = this.depth / 2 + SUPPORT_H;

    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    disposeTree(this.supports);
    this.supports.clear();

    const P = this.profile.length;
    const vertCount = this.rings * P + 2;
    const positions = new Float32Array(vertCount * 3);
    const index: number[] = [];
    for (let i = 0; i < this.rings - 1; i++) {
      for (let k = 0; k < P; k++) {
        const a = i * P + k;
        const b = i * P + ((k + 1) % P);
        const c = (i + 1) * P + ((k + 1) % P);
        const d = (i + 1) * P + k;
        index.push(a, b, c, a, c, d);
      }
    }
    // tutup kedua ujung (kipas dari pusat)
    const c0 = this.rings * P;
    const c1 = c0 + 1;
    for (let k = 0; k < P; k++) index.push(c0, k, (k + 1) % P);
    for (let k = 0; k < P; k++) index.push(c1, (this.rings - 1) * P + ((k + 1) % P), (this.rings - 1) * P + k);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setIndex(index);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, this.beamMat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    this.buildSupports(support);
  }

  /** Prisma tumpuan klasik: balok tinggi tipis (pin) + blok+silinder kecil (roller) + dinding (fixed). */
  private buildSupports(support: BeamSupport): void {
    const botY = this.centerY - this.depth / 2; // = SUPPORT_H
    const w = Math.max(this.width * 1.2, 0.28);
    if (support === 'cantilever') {
      // dinding jepit sederhana: balok vertikal tebal
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, botY + this.depth / 2 + 0.35, w),
        this.propMat,
      );
      wall.position.set(-0.13, (botY + this.depth / 2 + 0.35) / 2, 0);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.supports.add(wall);
    } else {
      // pin: prisma segitiga sederhana
      const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, w, 3), this.propMat);
      tri.rotation.z = Math.PI / 2;
      tri.rotation.y = Math.PI / 2;
      tri.position.set(0, botY * 0.55, 0);
      tri.scale.set(1, botY * 0.85 / 0.3, 1);
      tri.castShadow = true;
      this.supports.add(tri);
      // roller: blok persegi kecil (dengan garis batas = silinder pendek)
      const block = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, botY - 0.1, w * 1.1), this.propMat);
      block.position.set(this.span, (botY - 0.1) / 2, 0);
      block.castShadow = true;
      block.receiveShadow = true;
      this.supports.add(block);
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, w * 1.15, 20), this.propMat);
      roll.rotation.x = Math.PI / 2;
      roll.position.set(this.span, botY - 0.09, 0);
      roll.castShadow = true;
      this.supports.add(roll);
    }
  }

  /** Update deformasi + panah. `moving` = anim masih bergerak (skip rebuild posisi bila false). */
  updateDeform(anim: BeamAnim, moving: boolean, o: DeformOpts): void {
    const { scale, loadAt, loadP, loadType, support, reactions } = o;
    const f = anim.factor;
    const P = this.profile.length;

    // UDL: 8 panah kecil merata sepanjang bentang
    const showUdl = loadType === 'udl' && loadP > 0 && f > 0.02;
    for (let i = 0; i < this.udlArrows.length; i++) {
      const a = this.udlArrows[i]!;
      a.visible = showUdl;
      if (showUdl) {
        const x = ((i + 0.5) / this.udlArrows.length) * this.span;
        const len = (0.35 + 0.5 * Math.min(loadP / 80e3, 1.5)) * Math.max(f, 0.001);
        const topY = this.centerY + this.depth / 2;
        a.position.set(x, topY + ARROW_REACH * len, 0);
        a.scale.set(0.55, len, 0.55);
      }
    }
    this.loadArrow.visible = loadType === 'point' && Math.abs(loadP) > 1 && f > 0.02;

    if (moving && this.posAttr && this.mesh) {
      const pos = this.posAttr.array as Float32Array;
      const dx = this.span / (this.rings - 1);
      for (let i = 0; i < this.rings; i++) {
        const x = i * dx;
        const yc = anim.y[i] * f * scale;
        const yPrev = anim.y[Math.max(i - 1, 0)] * f * scale;
        const yNext = anim.y[Math.min(i + 1, this.rings - 1)] * f * scale;
        const span2 = i === 0 || i === this.rings - 1 ? dx : 2 * dx;
        const th = Math.atan((yNext - yPrev) / span2);
        const ux = -Math.sin(th);
        const uy = Math.cos(th);
        const base = i * P * 3;
        for (let k = 0; k < P; k++) {
          const u = this.profile[k].x;
          const v = this.profile[k].y;
          pos[base + k * 3] = x + ux * v;
          pos[base + k * 3 + 1] = this.centerY + yc + uy * v;
          pos[base + k * 3 + 2] = u;
        }
      }
      // pusat kipas penutup ujung
      const c0 = this.rings * P * 3;
      pos[c0] = 0;
      pos[c0 + 1] = this.centerY + anim.y[0] * f * scale;
      pos[c0 + 2] = 0;
      pos[c0 + 3] = this.span;
      pos[c0 + 4] = this.centerY + anim.y[this.rings - 1] * f * scale;
      pos[c0 + 5] = 0;
      this.posAttr.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
    }

    // Panah beban titik (merah): tip menempel permukaan atas balok, memanjang ke atas ∝ P.
    const topY = this.centerY + this.depth / 2;
    const loadLen = (0.4 + 1.0 * Math.min(Math.abs(loadP) / REF_FORCE, 1.5)) * Math.max(f, 0.001);
    this.loadArrow.position.set(loadAt, topY + ARROW_REACH * loadLen, 0);
    this.loadArrow.scale.set(1, loadLen, 1);

    // Panah reaksi (hijau): tip menempel bawah balok, memanjang ke bawah ∝ R.
    const rLen = (r: number): number => 0.4 + 1.0 * Math.min(Math.abs(r) / REF_FORCE, 1.5);
    const botY = this.centerY - this.depth / 2;
    this.reactA.visible = Math.abs(reactions.Ra) > 1 && f > 0.02;
    this.reactA.position.set(0, botY - ARROW_REACH * rLen(reactions.Ra) * f, 0);
    this.reactA.scale.set(1, rLen(reactions.Ra) * f, 1);
    if (support === 'ss') {
      this.reactB.visible = Math.abs(reactions.Rb) > 1 && f > 0.02;
      this.reactB.position.set(this.span, botY - ARROW_REACH * rLen(reactions.Rb) * f, 0);
      this.reactB.scale.set(1, rLen(reactions.Rb) * f, 1);
    } else {
      this.reactB.visible = false;
    }
  }

  dispose(): void {
    disposeTree(this.group);
    this.scene.remove(this.group);
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m.dispose();
    }
  });
}
