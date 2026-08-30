# Audit Master Prompt v3 + Polish Mekanika Struktur — Implementation Plan

> **For Hermes:** Eksekusi berurutan task-by-task. User pre-authorized autonomous run ("langsung kerjakan otomatis").

**Goal:** Audit kesesuaian prompt v3 vs implementasi, lalu eksekusi gap: langit 3D krisp (matahari/bulan/bintang beneran objek 3D), UI skala deformasi (wajib §7), disclaimer + asumsi (wajib §11), pulse panah beban, utilisasi D/C, a11y ring.

**Architecture:** Satu solver → 3D + 2D + angka. Sky = objek 3D di SceneManager (shader dome + sphere + points), bukan tekstur blur. UI tetap glass vanilla.

**Tech Stack:** TS strict, Vite, Three.js (vanilla), SVG hand-written, Vitest.

---

## HASIL AUDIT v3

**Sudah sesuai:** PHASE 1–3 (core, solver+benchmark ≤0.1%, 3D Beam Lab), glass UI shell, segmented/slider/picker iOS, spring deform + load ramp (replay), label 3D P/Ra/Rb, contact shadow, 2D companion live-sync, Explain mode, preset, localStorage, code split (30 kB initial), verify gate 28 test, dark/light, mobile breakpoint.

**Gap ditemukan (urutan eksekusi):**
1. Langit masih tekstur 2D di dome → blur/burem. §3 prompt: matahari (siang) & bulan (malam) harus terasa 3D. → **T1**
2. §7 WAJIB: label "Deformation scale ×N" + slider — belum ada di UI. → **T2**
3. §11 WAJIB: disclaimer permanen + assumptions di UI — belum ada. → **T4**
4. §7: load vectors "pulse halus" — panah masih statis. → **T3**
5. §8/§16: utilisasi D/C berwarna — SF ada, rasio D/C belum. → **T3**
6. §14: `:focus-visible` ring — belum ada. → **T4**
7. Buckling visual (kolom melengkung) → bukan modul balok; tunda ke Phase 4/5 (scope, bukan polish balok).
8. FEM/gempa/wind partikel → Phase 4–5 (roadmap, bukan gap polish).

---

### Task 1: Langit 3D — shader dome + matahari + bulan + bintang + awan

**Objective:** Langit krisp tanpa banding; matahari/bulan = sphere 3D + glow sprite; bintang = THREE.Points tajam; awan sprite lembut (siang).

**Files:**
- Modify: `src/visualization/three/scene-manager.ts` (ganti skyTexture → buildSky: ShaderMaterial dome, sun/moon mesh, star Points, cloud sprites; setTheme toggle visible/uniform)

**Detail implementasi:**
- Dome: `SphereGeometry(140, 32, 16)`, `ShaderMaterial` uniforms `{zenith, horizon, below}`, fragment: `pow(max(dir.y,0),0.45)` mix zenith→horizon; di bawah horizon → `below` (match fog). Side BackSide, depthWrite false, fog false. Warna: siang zenith #2f6fd0 horizon #e8f1f8; malam zenith #05070d horizon #1a2436.
- Matahari: `SphereGeometry(3.5)` MeshBasic #fff6dc di dir(0.55,0.5,-0.55)*130 + Sprite glow canvas radial 256 warm scale 46. Visibel siang.
- Bulan: sphere 2.8 #e6ecf8 dir(-0.5,0.6,0.4)*130 + glow bluish scale 30 + glow kecil. Visibel malam.
- Bintang: BufferGeometry 420 titik hemisphere atas r=132, `PointsMaterial{size:1.6, sizeAttenuation:false, color:#fff, transparent, opacity:.9}` + layer kedua 40 bintang terang size 2.6 #cfe0ff. Visibel malam.
- Awan: canvas radial soft-blob texture → 4 Sprite scale (40,14), posisi y 30–55 sebar, opacity 0.5–0.8, drift lambat x di onFrame (wrap ±120). Visibel siang.
- Dispose lama saat rebuild tema (glow texture cached 2 varian).
- `setTheme(light)`: set uniforms dome, toggle `.visible` sun/moon/stars/clouds.

**Step:** implement → `npx tsc --noEmit` → visual via dev server → commit `polish 12: langit 3D ...`.

### Task 2: Slider + label skala deformasi (§7 wajib)

**Objective:** User bisa atur "Deformation scale ×N"; default auto tetap.

**Files:**
- Modify: `src/ui/panels/beam-panel.ts` — row "Skala deformasi" slider 1→5 step 0.5, val "×N.N" tabular-nums, callback ke onChange.
- Modify: `src/ui/panels/beam-panel.ts` BeamParams + `src/main.ts` — `deformUser` factor; `deformScale()` hasil × factor; chart deflect ikut.

**Step:** implement → tsc → commit.

### Task 3: Pulse panah beban + utilisasi D/C

**Files:**
- Modify: `src/visualization/three/beam-3d.ts` — di updateDeform: `const pulse = 1 + 0.05 * Math.sin(performance.now() / 1000 * 2.4);` apply ke loadArrow.group & udlArrows scale (bukan reaksi — reaksi tenang).
- Modify: `src/ui/panels/beam-panel.ts` showResults — row "Utilisasi D/C" = 1/SF (skip ∞), class warn hijau<0.5 / >1 merah via warn.

**Step:** implement → tsc → commit.

### Task 4: Disclaimer + asumsi + a11y ring

**Files:**
- Modify: `src/ui/panels/beam-panel.ts` — footer panel: caption "Simulasi edukasi — bukan pengganti desain & verifikasi teknik sipil profesional." + blok asumsi di Explain (list: linear elastis, small displacement, Euler-Bernoulli, plane sections, sambungan rigid).
- Modify: `src/style.css` — `:focus-visible` ring accent untuk .module-btn/.picker-opt/.picker-btn/.chip/.ghost-btn + `.ios-slider:focus-visible`.

**Step:** implement → verify full (`npm run verify` bg + wait) → commit → lapor.

## Validation
- `npm run verify` hijau (tsc + 28 test + build) tiap commit.
- Visual: toggle tema → siang (matahari 3D + awan) ↔ malam (bulan + bintang tajam); slider skala deformasi mengubah pelengkung; pulse halus; disclaimer tampak.

## Risks
- ShaderMaterial dome: cek fog=false & renderOrder — kalau dome ketutup fog, naikkan fog far (sudah 130 < dome 140 aman).
- Points sizeAttenuation false → DPR tinggi tampak kecil; naikkan size jika perlu.
- Jangan sentuh solver (benchmark ≤0.1% tidak boleh tersentuh).
