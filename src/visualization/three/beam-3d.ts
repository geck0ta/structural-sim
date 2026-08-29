import * as THREE from 'three';
import type { Section } from '../../structural/models/types';
import type { BeamSupport } from '../../structural/beam/beam-solver';
import type { BeamAnim } from '../animation/beam-anim';
import { dotStyle } from './dot-style';
import { glowHaloTexture } from '../../structural/textures';

// §7/§17 — Lab Balok 3D: profil penampang ASLI (IPE300 dsb.) di-sweep mengikuti
// kurva defleksi y(x). Satu BufferGeometry, posisi di-update per frame (tanpa rebuild).
// Gaya = dot putih UKURAN KONSTAN: beban glow (makin besar makin terang),
// reaksi polos (makin besar makin pucat). Defleksi diperbesar — skala dari main.

const STEEL = 0x97a1ab;
const SUPPORT_COLOR = 0x484f57;
const SUPPORT_H = 1.2; // elevasi balok — memberi ruang dot reaksi di bawah

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

/** Dot putih menandai gaya: core bola + halo sprite (glow) atau polos. Ukuran KONSTAN. */
interface ForceDot {
  readonly core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  readonly halo: THREE.Sprite | null;
}

function makeDot(haloTex: THREE.Texture, withHalo: boolean, radius = 0.09): ForceDot {
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  );
  let halo: THREE.Sprite | null = null;
  if (withHalo) {
    halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.5,
      }),
    );
    halo.scale.set(0.55, 0.55, 1);
    core.add(halo);
  }
  core.visible = false;
  return { core, halo };
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
  readonly loadDot: ForceDot;
  private readonly reactADot: ForceDot;
  private readonly reactBDot: ForceDot;
  private readonly udlDots: ForceDot[] = [];
  private readonly supports = new THREE.Group();
  private readonly beamMat: THREE.MeshStandardMaterial;
  private readonly propMat: THREE.MeshStandardMaterial;

  constructor(private readonly scene: THREE.Scene, beamMaterial?: THREE.MeshStandardMaterial) {
    this.beamMat = beamMaterial ?? new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.45, metalness: 0.7 });
    this.propMat = new THREE.MeshStandardMaterial({ color: SUPPORT_COLOR, roughness: 0.8, metalness: 0.2 });
    const haloTex = glowHaloTexture();
    this.loadDot = makeDot(haloTex, true);
    this.reactADot = makeDot(haloTex, false);
    this.reactBDot = makeDot(haloTex, false);
    this.group.add(this.loadDot.core, this.reactADot.core, this.reactBDot.core, this.supports);
    for (let i = 0; i < 8; i++) {
      const d = makeDot(haloTex, true, 0.055);
      this.udlDots.push(d);
      this.group.add(d.core);
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

  /** Tumpuan pedestal persegi sederhana (simbol visual; BC matematis tetap di solver).
   *  Pembeda pin/roller/fixed ditampilkan panel & diagram, bukan bentuk 3D. */
  private buildSupports(support: BeamSupport): void {
    const botY = this.centerY - this.depth / 2; // = SUPPORT_H
    const w = Math.max(this.width * 1.5, 0.34);
    const box = (x: number, wd: number, h: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, w), this.propMat);
      m.position.set(x, h / 2, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    if (support === 'cantilever') {
      this.supports.add(box(-0.13, 0.26, botY + this.depth / 2 + 0.35)); // dinding jepit
    } else {
      this.supports.add(box(0, w * 0.85, botY), box(this.span, w * 0.85, botY));
    }
  }

  /** Update deformasi + dot gaya. `moving` = anim masih bergerak (skip rebuild posisi bila false). */
  updateDeform(anim: BeamAnim, moving: boolean, o: DeformOpts): void {
    const { scale, loadAt, loadP, loadType, support, reactions } = o;
    const f = anim.factor;
    const P = this.profile.length;
    const show = f > 0.02; // dot menyala setelah beban mulai diterapkan
    const topY = this.centerY + this.depth / 2;
    const botY = this.centerY - this.depth / 2;

    // UDL: 8 dot glow kecil merata sepanjang bentang — ukuran konstan, terang ∝ w
    const showUdl = show && loadType === 'udl' && Math.abs(loadP) > 1;
    const udlGlow = dotStyle(loadP).glow;
    for (let i = 0; i < this.udlDots.length; i++) {
      const d = this.udlDots[i]!;
      d.core.visible = showUdl;
      if (showUdl) {
        d.core.position.set(((i + 0.5) / this.udlDots.length) * this.span, topY + 0.14, 0);
        if (d.halo) (d.halo.material as THREE.SpriteMaterial).opacity = udlGlow;
      }
    }

    // Beban titik: 1 dot glow — makin besar makin terang
    this.loadDot.core.visible = show && loadType === 'point' && Math.abs(loadP) > 1;
    if (this.loadDot.core.visible) {
      this.loadDot.core.position.set(loadAt, topY + 0.18, 0);
      this.loadDot.core.material.opacity = 0.95;
      if (this.loadDot.halo) (this.loadDot.halo.material as THREE.SpriteMaterial).opacity = dotStyle(loadP).glow;
    }

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

    // Reaksi: dot polos — makin besar makin pucat (dotStyle.plain)
    const setReact = (d: ForceDot, r: number, x: number): void => {
      d.core.visible = show && Math.abs(r) > 1;
      if (d.core.visible) {
        d.core.position.set(x, botY - 0.18, 0);
        d.core.material.opacity = dotStyle(r).plain;
      }
    };
    setReact(this.reactADot, reactions.Ra, support === 'cantilever' ? 0.22 : 0);
    if (support === 'ss') setReact(this.reactBDot, reactions.Rb, this.span);
    else this.reactBDot.core.visible = false;
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
