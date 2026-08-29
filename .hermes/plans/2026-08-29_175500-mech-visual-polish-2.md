# Mekanika Struktur — Polish Visual 2 (Tumpuan Balok + Dot Gaya) Implementation Plan

> **For Hermes:** Implement task-by-task. Verify gate `npm run verify` hijau sebelum commit tiap task.

**Goal:** Tumpuan "Sederhana" jadi balok persegi polos (seperti dinding kantilever), panah gaya diganti dot putih — beban = putih glow (makin besar makin terang), reaksi = putih polos (makin besar makin pucat).

**Architecture:** Visual-only, solver tidak disentuh. Mapping magnitude→gaya visual diekstrak jadi pure function teruji; dot = bola `MeshBasicMaterial` + halo sprite additive untuk glow. Tumpuan = `BoxGeometry` pedestal.

**Tech Stack:** Three.js (sphere/sprite/box), Vitest, Vite, TS strict.

---

## Jawaban pertanyaan hukum tumpuan (untuk notes implementer)

TIDAK merusak hukum. Boundary condition (pin = jepat x,y bebas rotasi; roller = jepat y saja) adalah **matematika di solver** (`beam-solver.ts` hitung Ra/Rb dari keseimbangan statis) — bentuk 3D cuma simbol. Segitiga-lingkaran adalah konvensi gambar 2D, bukan fisika. Bangunan nyata pakai pedestal/bearing pad balok persegi. Tradeoff yang jujur: pembeda visual pin vs roller hilang → digantikan teks mode Explain + panel hasil (Ra/Rb tetap beda perhitungannya). Diterima user.

## Files

- Create: `src/visualization/three/dot-style.ts` (pure mapping)
- Create: `src/tests/unit/dot-style.test.ts`
- Modify: `src/structural/textures.ts` (tambah `glowHaloTexture`)
- Modify: `src/visualization/three/beam-3d.ts` (hapus makeArrow → makeDot; tumpuan SS = 2 blok persegi; UDL 8 dot glow)
- Tidak disentuh: `beam-solver.ts`, `beam-panel.ts`, `main.ts` (signature `updateDeform`/`DeformOpts` tetap)

---

### Task 1: Pure mapping magnitude → intensitas dot (TDD)

**Files:**
- Create: `src/visualization/three/dot-style.ts`
- Test: `src/tests/unit/dot-style.test.ts`

**Step 1: tulis test gagal**

```ts
import { describe, expect, it } from 'vitest';
import { dotStyle } from '../../visualization/three/dot-style';

describe('dotStyle — magnitude → gaya visual', () => {
  it('P=0: glow redup, plain solid', () => {
    expect(dotStyle(0)).toEqual({ glow: 0.25, plain: 0.85 });
  });
  it('P=REF 60 kN: glow terang, plain pucat', () => {
    const s = dotStyle(60e3);
    expect(s.glow).toBeCloseTo(0.85);
    expect(s.plain).toBeCloseTo(0.35);
  });
  it('P sangat besar: clamp glow ≤1, plain ≥0.15', () => {
    expect(dotStyle(1e6)).toEqual({ glow: 1, plain: 0.15 });
  });
  it('magnitude: negatif = positif', () => {
    expect(dotStyle(-60e3)).toEqual(dotStyle(60e3));
  });
});
```

**Step 2:** `npx vitest run src/tests/unit/dot-style.test.ts` → FAIL (module not found)

**Step 3: implementasi**

```ts
// §14 — magnitude gaya → intensitas visual dot. Pure + clamp.
const REF = 60e3; // N — saturasi visual

export interface DotStyle {
  readonly glow: number; // opacity halo/emissive 0..1 — beban
  readonly plain: number; // opacity dot polos — reaksi (makin besar beban makin pucat)
}

export function dotStyle(force: number, ref = REF): DotStyle {
  const t = Math.min(Math.abs(force) / ref, 1.5);
  return {
    glow: Math.min(0.25 + t * 0.6, 1),
    plain: Math.max(0.85 - t * 0.5, 0.15),
  };
}
```

**Step 4:** rerun → 4 PASS. **Step 5:** `git add src/visualization/three/dot-style.ts src/tests/unit/dot-style.test.ts && git commit -m "dot-style: pure magnitude→glow/pale mapping + tests"`

---

### Task 2: Halo texture radial-gradient

**Files:**
- Modify: `src/structural/textures.ts` (append fungsi + export)

**Implementasi** (setelah `concreteTexture`):

```ts
/** Halo radial putih untuk dot glow (sprite additive). */
export function glowHaloTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}
```

**Verifikasi:** `npx tsc --noEmit` → 0 error. **Commit:** `git commit -m "textures: glowHaloTexture radial gradient"`

---

### Task 3: Dot menggantikan panah — `beam-3d.ts`

**Files:**
- Modify: `src/visualization/three/beam-3d.ts`

**3a. Hapus** konstanta `LOAD_COLOR/REACT_COLOR`, fungsi `makeArrow`, field `loadArrow/reactA/reactB/udlArrows`, dan seluruh blok panah di `updateDeform`.

**3b. Tambah** (import `glowHaloTexture` dari `../../structural/textures`, `dotStyle` dari `./dot-style`):

```ts
interface ForceDot {
  readonly core: THREE.Mesh; // bola putih
  readonly halo: THREE.Sprite | null; // null = plain
}

function makeDot(haloTex: THREE.Texture, withHalo: boolean): ForceDot {
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 20, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  );
  let halo: THREE.Sprite | null = null;
  if (withHalo) {
    halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, color: 0xffffff, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, opacity: 0.5,
    }));
    halo.scale.set(0.55, 0.55, 1);
    core.add(halo);
  }
  core.visible = false;
  return { core, halo };
}
```

**3c. Constructor `BeamView`:** buat satu `haloTex = glowHaloTexture()`; field baru:
`loadDot = makeDot(haloTex, true)`, `reactADot/reactBDot = makeDot(haloTex, false)`, `udlDots: ForceDot[]` (8× glow, radius core 0.055 → `core.scale.setScalar(0.62)`). Semua di-add ke `this.group`. (Ganti `beamMaterial` optional param tetap.)

**3d. `updateDeform` — blok panah diganti:**

```ts
const st = dotStyle(loadP);
const f = anim.factor;
const topY = this.centerY + this.depth / 2;
const botY = this.centerY - this.depth / 2;

// beban titik: glow putih — terang ∝ P
this.loadDot.core.visible = loadType === 'point' && loadP > 1 && f > 0.02;
this.loadDot.core.position.set(loadAt, topY + 0.22, 0);
if (this.loadDot.halo) this.loadDot.halo.material.opacity = st.glow * Math.max(f, 0.001);

// UDL: 8 dot glow kecil
const showUdl = loadType === 'udl' && loadP > 1 && f > 0.02;
for (let i = 0; i < this.udlDots.length; i++) {
  const d = this.udlDots[i]!;
  d.core.visible = showUdl;
  if (showUdl) {
    d.core.position.set(((i + 0.5) / this.udlDots.length) * this.span, topY + 0.18, 0);
    if (d.halo) d.halo.material.opacity = st.glow * 0.7 * f;
  }
}

// reaksi: dot polos — pucat ∝ P (putih pudar)
const plainMat = (d: ForceDot): THREE.MeshBasicMaterial => d.core.material as THREE.MeshBasicMaterial;
this.reactADot.core.visible = Math.abs(reactions.Ra) > 1 && f > 0.02;
this.reactADot.core.position.set(0, botY - 0.22, 0);
plainMat(this.reactADot).opacity = st.plain;
if (support === 'ss') {
  this.reactBDot.core.visible = Math.abs(reactions.Rb) > 1 && f > 0.02;
  this.reactBDot.core.position.set(this.span, botY - 0.22, 0);
  plainMat(this.reactBDot).opacity = st.plain;
} else {
  this.reactBDot.core.visible = false;
}
```

Catatan: gunakan `loadAt`/`loadP`/`loadType`/`support`/`reactions` yang sudah di-destructure. Hapus `ARROW_REACH`/`REF_FORCE` bila tak terpakai lagi.

**Verifikasi:** `npx tsc --noEmit` → 0 error; `npx vitest run` → 32 PASS. **Commit:** `git commit -m "beam-3d: panah → dot putih (glow beban / polos reaksi), intensitas ∝ magnitude"`

---

### Task 4: Tumpuan SS = 2 balok persegi polos

**Files:**
- Modify: `src/visualization/three/beam-3d.ts` — ganti isi cabang `else` `buildSupports`:

```ts
} else {
  // pin & roller: pedestal persegi polos — pembeda pin/roller via Explain/panel (simbol 2D tak wajib di 3D)
  const w = Math.max(this.width * 1.3, 0.3);
  const block = (x: number): THREE.Mesh => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, botY, w), this.propMat);
    b.position.set(x, botY / 2, 0);
    b.castShadow = true;
    b.receiveShadow = true;
    return b;
  };
  this.supports.add(block(0), block(this.span));
}
```

Kantilever (dinding) tetap. Hapus `tri`/`block`/`roll` lama.

**Verifikasi:** `npx tsc --noEmit` + `npx vitest run` hijau. **Commit:** `git commit -m "beam-3d: tumpuan sederhana = pedestal persegi (pin/roller), hapus segitiga+silinder"`

---

### Task 5: Gate + verifikasi visual

1. `npm run verify` → tsc 0 error · 32/32 tests · build OK.
2. Dev server HMR: cek preview — kantilever & SS: 2 balok tumpuan persegi; P=0 → dot redup/pucat; drag P 0→100 kN → dot beban makin glow terang, reaksi makin pudar; UDL = 8 dot glow kecil; ganti material kayu → tekstur serat tetap.
3. Orbit/zoom jalan (tidak tersentuh).
4. **Commit final:** `git commit -m "mech polish 2: dot gaya + tumpuan persegi — verifikasi visual"` (jika ada sisa perbaikan).

---

## Risks / Tradeoffs

- **Pembeda pin vs roller hilang secara visual** — disengaja (permintaan "simple"); makna fisik tetap dibawa solver + teks Explain. Upgrade path: ikon kecil di panel bila user minta.
- **Sprite additive bisa wash-out di background terang** — light mode belum ada; cek lagi saat PHASE 7 light mode.
- **MeshBasicMaterial putih vs baja abu** — kontras cukup (baja 0x97a1ab gelap); bila kurang, naikkan radius core 0.09→0.11.
- Kontaminasi tulisan file TS besar pernah terjadi di sesi ini — tulis patch kecil bertahap, `tsc` tiap task (sudah di gate).

## Open questions (tidak memblokir)

- Dot reaksi untuk kantilever hanya 1 (ujung jepit) — momen jepit Ma tak divisualkan sebagai dot; cukup panel? (YAGNI: ya.)
- Skala halo ikut magnitude? (Sekarang hanya opacity — sesuai permintaan "cahaya makin terang".)
