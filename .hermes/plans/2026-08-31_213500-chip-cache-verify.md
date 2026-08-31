# Chip Ribbon Simetris — Verifikasi Cache & Hard-Reset Tampilan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Memastikan chip "Ribbon V/M/y" benar-benar tampil dengan metrik segmented Explore/Explain di browser user — diagnose kemungkinan browser menampilkan CSS lama (cache), dan bila perlu memaksa samakan tinggi eksplisit.

**Architecture:** Chip & segmented kini berbagi formula persis di `src/style.css` (pad 6/14, font 12, line-height 1, bg `rgba(120,128,136,.18)`, radius 9). Deploy GitHub Actions sudah sukses dan CSS produksi (`assets/index-CoBVh_SG.css`) terverifikasi berisi `padding:6px 14px` via curl. Sisa kemungkinan: (a) browser user menyajikan CSS lama dari cache (Vite hash berubah tiap build, tapi HTML bisa di-cache), (b) perbedaan render optik dari `font-weight`/`border` yang masih beda.

**Tech Stack:** statik CSS, GitHub Pages, curl verifikasi.

---

## Temuan verifikasi (read-only, sudah dilakukan)

- Live Pages HTML → `assets/index-CoBVh_SG.css` (hash terbaru).
- Live CSS: `.chip{...background:#7880882e;border:1px solid #0000;border-radius:9px;padding:6px 14px;font-size:12px;line-height:1...}` ✓ = kode baru ter-deploy.
- `.segmented{background:#7880882e;border-radius:9px;padding:2px}` + `.segmented-btn{padding:4px 14px;font-size:12px}` ✓.
- Kesimpulan: **server sudah benar; yang mungkin basi adalah tampilan di browser** (cache HTML/CSS) ATAU beda optik kecil (font-weight, border).

## Task 1: Hard reload + verifikasi di browser user (tanpa ubah kode)

**Objective:** Pastikan browser memuat CSS hash terbaru.

**Step 1:** Buka https://geck0ta.github.io/structural-sim/ , tekan **Ctrl+Shift+R** (hard reload). Bila perlu: DevTools (F12) → Network → Disable cache → reload.

**Step 2:** Inspect chip: computed style harus `padding 6px 14px`, `background rgb(120,128,136,0.18)`, `font-size 12px`, `line-height 1`.

**Verifikasi:** chip & segmented setinggi persis; klik chip → toggle ribbon tetap berfungsi.

## Task 2 (hanya bila Task 1 masih beda setelah hard reload): paksa metrik identik eksplisit

**Objective:** Hilangkan selisih optik terakhir dengan properti eksplisit di kedua komponen.

**Files:**
- Modify: `src/style.css` `.chip` (~line 614) dan `.segmented` (~line 498)

**Step 1:** Di `.chip`, ganti padding dengan tinggi eksplisit:
```css
.chip {
  height: 24px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  /* sisanya sama */
}
```

**Step 2:** Samakan font-weight (chip 500 vs segmented-btn normal) — pilih salah satu untuk keduanya; normal lebih senyap:
```css
/* hapus `font-weight: 500` dari .chip jika masih ada */
```

**Step 3:** Jika segmented tampak lebih "gemuk" karena pill putih (state aktif), itu wajar — bukan asimetri.

**Verifikasi:** `npm run verify` (31/31) → commit `fix: chip height eksplisit 24px` → push → deploy sukses.

## Task 3: Kalau user masih melihat tak berubah

**Objective:** Buktikan masalah cache, bukan kode.

**Step 1:** Minta user buka URL cache-buster: `https://geck0ta.github.io/structural-sim/?v=$(date +%s)`.

**Step 2:** Bila tampilan benar di URL itu → cache; rekomendasi permanen: HTML Pages memakai `Cache-Control: no-cache` (default GitHub Pages umumnya sudah demikian; bila tidak, tambah header via workflow action `httpx` atau pindah ke hash-name-only caching).

**Risks:** Task 2 mengubah tinggi chip 26→24px — bila segmented justru 26px (font rendering Windows), selisih balik arah; mitigasi: ukur dulu computed height kedua elemen di DevTools sebelum memilih angka, atau samakan keduanya `height: 24px` eksplisit.

## Open question

- Angka tinggi final di Windows Chrome: 24 vs 26px — putuskan dari computed style DevTools, jangan tebakan.
