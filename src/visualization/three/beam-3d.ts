import * as THREE from 'three';
import type { Section } from '../../structural/models/types';
import type { BeamSupport } from '../../structural/beam/beam-solver';
import type { BeamAnim } from '../animation/beam-anim';

// §7/§17 — Lab Balok 3D: profil penampang ASLI (IPE300 dsb.) di-sweep mengikuti
// kurva defleksi y(x). Satu BufferGeometry, posisi di-update per frame (tanpa rebuild).

const STEEL = 0x97a1ab;
const SUPPORT_COLOR = 0x484f57;
const SUPPORT_H = 1.2; // elevasi balok — memberi ruang tanda reaksi di bawah

/** Panah kecil satu warna: batang silinder + kepala kerucut. Panjang konstan. */
class ForceArrow {
  readonly group = new THREE.Group();
  constructor(color: number, len: number) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 8), mat);
    shaft.position.y = len / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 10), mat);
    head.position.y = len;
    this.group.add(shaft, head);
    // origin = tip; group diposisikan di titik terpasang lalu dirotasi.
    this.group.visible = false;
  }
}

/** Tekstur blob bayangan kontak (radial gradient) — dibuat SEKALI, dipakai ulang tiap rebuild. */
let shadowTex: THREE.CanvasTexture | null = null;
function getShadowTex(): THREE.CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 32, 4, 64, 32, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.38)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.scale(1, 0.5); // elips memanjang mengikuti bentang
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

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
      if (s.dims.t !== undefined && s.dims.t > 0) {
        // CHS — dua loop (luar + dalam) untuk cap annulus di ujung.
        const ri = m(s.dims.d / 2 - s.dims.t);
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a)));
        }
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          pts.push(new THREE.Vector2(ri * Math.cos(a), ri * Math.sin(a)));
        }
        return pts;
      }
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

export interface DeformOpts {
  readonly scale: number; // faktor perbesaran defleksi
  readonly loadAt: number; // m
  readonly loadP: number; // N
  readonly loadType: 'point' | 'udl';
  readonly support: BeamSupport;
  readonly reactions: { readonly Ra: number; readonly Rb: number; readonly Ma: number };
}

const CURVE_N = 64; // titik kurva elastis y(x)

export class BeamView {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private posAttr: THREE.BufferAttribute | null = null;
  private curve: THREE.Line | null = null; // kurva elastis y(x) muka depan
  private profile: THREE.Vector2[] = [];
  private rings = 101;
  span = 0; // public: main cek apakah geometri berubah (re-fit kamera)
  support: BeamSupport | null = null;
  sectionId = '';
  matId = '';
  private centerY = SUPPORT_H;
  private depth = 0.3;
  private width = 0.2;
  readonly loadArrow: ForceArrow;
  private readonly reactA: ForceArrow;
  private readonly reactB: ForceArrow;
  private readonly udlArrows: ForceArrow[] = [];
  private readonly supports = new THREE.Group();
  private readonly crosshair!: THREE.Line;
  private readonly pin!: THREE.Mesh;
  /** Proxy hit drag beban titik (invisible, mengikuti panah). */
  private readonly dragProxy!: THREE.Mesh;
  /** Marker hover sinkron dari chart (garis vertikal + titik di beam). */
  private readonly beamMat: THREE.MeshStandardMaterial;
  private readonly propMat: THREE.MeshStandardMaterial;

  constructor(private readonly scene: THREE.Scene, beamMaterial?: THREE.MeshStandardMaterial) {
    this.beamMat = beamMaterial ?? new THREE.MeshStandardMaterial({ color: STEEL, roughness: 0.45, metalness: 0.7 });
    this.propMat = new THREE.MeshStandardMaterial({ color: SUPPORT_COLOR, roughness: 0.8, metalness: 0.2 });
    this.loadArrow = new ForceArrow(0xff453a, 0.5);
    this.reactA = new ForceArrow(0xffd60a, 0.3);
    this.reactB = new ForceArrow(0xffd60a, 0.3);
    this.group.add(this.loadArrow.group, this.reactA.group, this.reactB.group, this.supports);
    for (let i = 0; i < 8; i++) {
      const a = new ForceArrow(0xff453a, 0.32);
      this.udlArrows.push(a);
      this.group.add(a.group);
    }
    this.scene.add(this.group);

    // Crosshair hover chart → marker vertikal di scene (sinkron 3D↔2D, satu data).
    const cGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
    ]);
    this.crosshair = new THREE.Line(
      cGeo,
      new THREE.LineDashedMaterial({ color: 0x0a84ff, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.75 }),
    );
    this.crosshair.visible = false;
    this.crosshair.computeLineDistances();
    this.scene.add(this.crosshair);

    // Pin persist dari klik chart — titik kecil accent, tetap sampai klik lagi (F1).
    this.pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x0a84ff }),
    );
    this.pin.visible = false;
    this.scene.add(this.pin);

    // Drag beban titik: proxy invisible (silinder tipis sepanjang tinggi panah, radius
    // murah hati 0.28) — hit area jauh lebih besar dari panah kecil, tak menghalangi view.
    this.dragProxy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 1.1, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.dragProxy.visible = false;
    this.group.add(this.dragProxy);
  }

  /** Crosshair 3D: x meter → garis vertikal accent di posisi hover chart. null = sembunyi. */
  setCrosshair(xM: number | null): void {
    if (xM === null || xM < 0 || xM > this.span) {
      this.crosshair.visible = false;
      return;
    }
    const p = this.crosshair.geometry.attributes.position as THREE.BufferAttribute;
    const top = this.centerY + 0.9;
    p.setXYZ(0, xM, 0.005, 0);
    p.setXYZ(1, xM, top, 0);
    p.needsUpdate = true;
    this.crosshair.geometry.computeBoundingSphere();
    this.crosshair.computeLineDistances();
    this.crosshair.visible = true;
  }

  /** F1: pin marker persist di x (klik chart toggle). x null = lepas. */
  setPin(xM: number | null): void {
    if (xM === null || xM < 0 || xM > this.span) {
      this.pin.visible = false;
      return;
    }
    this.pin.position.set(xM, this.beamCenterY, 0);
    this.pin.visible = true;
  }

  get beamCenterY(): number {
    return this.centerY;
  }

  /** Proxy drag beban titik (invisible) — diekspos ke SceneManager via main. */
  get dragProxyObject(): THREE.Object3D {
    return this.dragProxy;
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

  /** Tema: tumpuan lebih terang di tema terang (dark gray hilang di siang hari). */
  setTheme(light: boolean): void {
    this.propMat.color.set(light ? 0x8b939c : 0x484f57);
  }

  /** Rebuild geometri (dipanggil saat penampang/panjang/support berubah). */
  setBeam(section: Section, span: number, support: BeamSupport): void {
    this.span = span;
    this.support = support;
    this.sectionId = section.id;
    this.profile = profilePoints(section);
    this.depth = (section.shape === 'circular' ? section.dims.d : section.dims.h) / 1000;
    this.width = (section.shape === 'circular' ? section.dims.d : section.dims.b) / 1000;
    this.centerY = this.depth / 2 + SUPPORT_H;

    if (!this.curve) {
      // Kurva elastis y(x) — companion analitis dashed di muka depan (§64 pipeline).
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CURVE_N * 3), 3).setUsage(THREE.DynamicDrawUsage));
      this.curve = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xe88f5a, dashSize: 0.14, gapSize: 0.09, transparent: true, opacity: 0.9 }));
      this.curve.frustumCulled = false;
      this.group.add(this.curve);
    }

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
    // UV: s = keliling profil, t = sepanjang bentang (repeat tiap 2 m) — serat kayu
    // memanjang, tak ter-stretch walau bentang berubah. Diisi sekali di sini (bukan
    // per frame — frame statis tak pernah menulis UV).
    const uvs = new Float32Array(vertCount * 2);
    const uvAttr = new THREE.BufferAttribute(uvs, 2);
    for (let i = 0; i < this.rings; i++) {
      for (let k = 0; k < P; k++) {
        uvAttr.setXY(i * P + k, k / (P - 1), (i / (this.rings - 1)) * (this.span / 2));
      }
    }
    uvAttr.setXY(this.rings * P, 0.5, 0);
    uvAttr.setXY(this.rings * P + 1, 0.5, this.span / 2);
    geo.setAttribute('uv', uvAttr);
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

    // Contact shadow: blob lembut tepat di bawah model — membumikan balok yang
    // dulu kesan melayang (shadowMap directional saja offset & terlalu tipis).
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(this.span + 1.4, 1.7),
      new THREE.MeshBasicMaterial({ map: getShadowTex(), transparent: true, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(this.span / 2, 0.004, 0);
    this.supports.add(blob);
  }

  /** Update deformasi + panah kecil. `moving` = anim masih bergerak (skip rebuild posisi bila false). */
  updateDeform(anim: BeamAnim, moving: boolean, o: DeformOpts): void {
    const { scale, loadAt, loadP, loadType, support, reactions } = o;
    const f = anim.factor;
    const P = this.profile.length;
    const show = f > 0.02; // panah menyala setelah beban mulai diterapkan
    const dx = this.span / (this.rings - 1);
    // Pulse halus beban (§7): skala berdenyut pelan — reaksi tenang (statika).
    const pulse = 1 + 0.05 * Math.sin(performance.now() / 1000 * 2.4);
    this.loadArrow.group.scale.setScalar(pulse);
    for (const a of this.udlArrows) a.group.scale.setScalar(pulse);

    // Y permukaan terdeformasi pada x (interpolasi sampel anim).
    const yAt = (x: number): number => {
      const i = Math.min(Math.max(x / dx, 0), this.rings - 1);
      const i0 = Math.floor(i);
      const i1 = Math.min(i0 + 1, this.rings - 1);
      return anim.y[i0]! * f * scale + (anim.y[i1]! * f * scale - anim.y[i0]! * f * scale) * (i - i0);
    };
    // Beban (merah): tip DIKURVE PERMUKAAN — beban naik → permukaan turun → panah ikut turun.
    // Reaksi (kuning): DI BELAKANG balok (z = −width), dari bawah tumpuan ke atas —
    // tak menembus balok, kecil, tak mencolok.
    const placeLoad = (a: ForceArrow, x: number, on: boolean): void => {
      a.group.visible = on;
      if (!on) return;
      const yTop = this.centerY + yAt(x) + this.depth / 2;
      a.group.position.set(x, yTop, 0);
      a.group.rotation.z = Math.PI; // +Y panah = arah gaya (ke bawah)
    };
    const placeReact = (a: ForceArrow, x: number, on: boolean): void => {
      a.group.visible = on;
      if (!on) return;
      a.group.position.set(x, SUPPORT_H - 0.12, -this.width * 0.75);
      a.group.rotation.z = 0; // ke atas
    };
    // UDL: 8 panah kecil merata — semua tip menempel kurva, jadi deretan simetris
    const showUdl = show && loadType === 'udl' && Math.abs(loadP) > 1;
    for (let i = 0; i < this.udlArrows.length; i++) {
      placeLoad(this.udlArrows[i]!, ((i + 0.5) / this.udlArrows.length) * this.span, showUdl);
    }

    // Beban titik: 1 panah + proxy drag mengikuti (posisi x sama, tinggi panah).
    const pointOn = show && loadType === 'point' && Math.abs(loadP) > 1;
    placeLoad(this.loadArrow, Math.min(loadAt, this.span), pointOn);
    this.dragProxy.visible = pointOn;
    if (pointOn) {
      this.dragProxy.position.set(Math.min(loadAt, this.span), this.centerY + this.depth / 2 + 0.35, 0);
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

    // Reaksi (kuning): kecil, di belakang balok, dari bawah tumpuan ke atas
    placeReact(this.reactA, support === 'cantilever' ? 0.25 : 0, show && Math.abs(reactions.Ra) > 1);
    placeReact(this.reactB, this.span, support === 'ss' && show && Math.abs(reactions.Rb) > 1);

    // Kurva elastis y(x): 64 titik pada lintang sumbu netral, muka depan (z = width/2+0.06).
    if (this.curve) {
      this.curve.visible = show;
      if (show) {
        const cp = this.curve.geometry.getAttribute('position') as THREE.BufferAttribute;
        const arr = cp.array as Float32Array;
        const zf = this.width / 2 + 0.06;
        for (let k = 0; k < CURVE_N; k++) {
          const x = (k / (CURVE_N - 1)) * this.span;
          arr[k * 3] = x;
          arr[k * 3 + 1] = this.centerY + yAt(x);
          arr[k * 3 + 2] = zf;
        }
        cp.needsUpdate = true;
        this.curve.computeLineDistances();
      }
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
