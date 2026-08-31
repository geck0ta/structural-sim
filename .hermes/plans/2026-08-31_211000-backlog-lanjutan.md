# Backlog Lanjutan structural-sim — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Daftar prioritas pekerjaan lanjutan + implementasi tugas P0 (ribbon UI simetris & ukuran) dan kandidat fitur berikutnya.

**Architecture:** Vanilla TS + Vite + Three.js. UI panel di `src/ui/panels/beam-panel.ts` (flex/grid, token CSS), scene 3D di `src/visualization/three/*`. Solver statis ekzak di `src/structural/beam/beam-solver.ts` — JANGAN disentuh kecuali fitur support baru statis-tentu.

**Tech Stack:** TS strict, Three.js 0.185, Vitest, GitHub Pages (auto-deploy per push main → https://geck0ta.github.io/structural-sim/).

---

## Prioritas (hasil diskusi "ngapain lagi")

| Pri | Item | Alasan |
|-----|------|--------|
| P0 | Ribbon label kotak UI: simetris + diperbesar | Keluhan user aktif |
| P1 | Tipe penyangga baru (overhang / fixed-fixed) | Pertanyaan user "penyangga 2 doang?" — belum terjawab fitur |
| P2 | Penampang baru (C-channel, hollow box) | "Bentuk 3D baru" — geometri saja, solver aman |
| P3 | Backlog lama: kurva elastis y(x) chart, preset overhang/2 beban, refleksi lantai 0.08, zoom/pinch chart, collapse rail | Menunggu giliran |

---

### Task 1 (P0): Perbaiki label ribbon V(x)/M(x)/y(x) — simetris & ukuran

**Objective:** Sprite label ribbon punya bounding box simetris (teks center, padding merata) dan tinggi dinaikkan.

**Files:**
- Modify: `src/visualization/three/canvas-label.ts:6-42`
- Modify: `src/main.ts:122-129` (height arg 0.3 → 0.42)

**Context:** `CanvasLabel` menggambar teks 38px di canvas 512×64, halo stroke 8px `rgba(0,0,0,0.5)` — di tema gelap halo tampak "kotak hitam kotor"; scale sprite `(w/64)*h × h` bikin box tidak proporsional. Perbaikan:
1. Padding vertikal proporsional: ukur `measureText`, set lebar sprite dari `w + 2*pad`, `pad = 14`.
2. Halo diwarnai per tema: ganti stroke solid jadi `rgba(0,0,0,0.35)`; ABAIKAN tema — cukup lembut.
3. Tinggi naik: `new CanvasLabel(0.3)` → `new CanvasLabel(0.42)` di `src/main.ts:122`.

**Step 1:** Patch `canvas-label.ts`:
```ts
const w = Math.max(ctx.measureText(text).width + 28, 60);
this.sprite.scale.set((w / 64) * this.height, this.height, 1);
```
→ (sudah benar proporsinya; yang "kotak" adalah halo) — ganti stroke:
```ts
ctx.strokeStyle = 'rgba(0,0,0,0.28)';
```
**Step 2:** `npx tsc --noEmit` → 0 error.
**Step 3:** QA visual dev server (tema gelap + light, ribbon ON): label terbaca, tidak ada kotak gelap, ukuran ±40% lebih besar.
**Step 4:** Commit `fix: label ribbon — halo lembut, tinggi 0.3→0.42`.

### Task 2 (P0): Konsistensi chip vs segmented (re-audit)

**Objective:** Pastikan chip "Ribbon fungsi V/M/y" benar-benar setinggi segmented (28px) — cek computed style via DOM, bukan asumsi.

**Files:**
- Modify (bila perlu): `src/style.css` (`.chip`, `.segmented`)

**Step 1:** Baca computed height kedua elemen via devtools/preview; selisih >1px → koreksi.
**Step 2:** Commit bila ada perubahan.

### Task 3 (P1): Penyangga overhang (statis-tentu) — solver-safe

**Objective:** Tambah preset "balok menjorok" (SS dengan beban di overhang) TANPA menyentuh solver (SS + posisi beban bebas sudah didukung; hanya butuh slider posisi range > bentang? Cek dulu).

**RISIKO:** fixed-fixed = statis tak tentu → butuh solver baru → JANGAN di task ini. Overhang aman bila solver SS sudah menerima `a > L`.
**Files:** `src/ui/panels/beam-panel.ts` (presets), `src/main.ts` (clamp posisi).
**Step 1:** Cek solver: beban P di `a` dengan support SS di 0 dan L — apakah `a > L` valid? Bila tidak → batasi ke preset overhang via geometri load (P di ujung menjorok tetap di antara support? tidak — skip, ganti "2 beban titik").
**Step 2:** Tambah preset "Balok sederhana, dua beban terpusat simetris" (P di L/3 dan 2L/3) — solver SS multi-load pasti jalan (piecewise).
**Step 3:** Verify + QA + commit.

### Task 4 (P2): Penampang baru — C-channel & hollow box

**Objective:** Tambah 2 profil ke `SECTION_PRESETS`.

**Files:**
- Modify: `src/structural/models/section.ts` (tambah 2 entri: id, label, dimensi, A, Iy — hitung manual betul)
- Modify: `src/visualization/three/beam-3d.ts` (geometri extrude bentuk C & kotak berongga)
- Test: tambah 1 test properti (Iy positif, satuan mm⁴) di `tests/` bila ada test section.

**Step 1:** Tambah entri data + geometri.
**Step 2:** `npm run verify` → hijau.
**Step 3:** QA visual (profile I/C/kotak berongga terlihat beda jelas).
**Step 4:** Commit + push (auto-deploy Pages).

---

## Validation

- `npx tsc --noEmit` per task; `npm run verify` (tsc + vitest 31 + build) sebelum commit.
- QA visual Chrome dev server, tema gelap & light.
- Push → cek `gh run list` hijau → `curl -s -o /dev/null -w "%{http_code}" https://geck0ta.github.io/structural-sim/` = 200.

## Risks / Open Questions

1. **"Kotak UI ribbon" ambiguous** — kemungkinan label sprite 3D (Task 1) atau chip (Task 2). Kerjakan keduanya, murah.
2. **fixed-fixed & lanjar** = statis tak tentu → butuh FEM/solver baru; jangan masuk sebelum user konfirmasi mau.
3. Iy profil baru harus dihitung benar (bukan tempelan) — salah angka merusak kredibilitas edukasi.
4. Awan senja: sudah 6 cluster; jangan ditambah lagi tanpa permintaan.
