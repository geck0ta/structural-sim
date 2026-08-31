# AUDIT UI/UX — Structural Lab (2026-08-31)

Fase 1 dari 3 (audit → tokens → implement). Tidak ada kode diubah.

## A. Temuan (urut keparahan)

### A1. Struktur shell salah bentuk
- Tidak ada top bar. Brand "Structural Lab" nyempil di sidebar; 4 tombol utilitas
  (tema/reset/kamera/share) jadi tombol fixed lepas dengan posisi inline
  `right: calc(324px + 42px)` — bukan sistem.
- **Bug nyata**: media query ≤1200px memindah `.theme-float` ke `right:300px`,
  tapi 3 tombol lain punya inline style 324-based → kolom tombol MELANDAI/tak
  lurus di laptop 13–15".
- Kbd-hint (kiri bawah), orbit-hint (tengah bawah), toast (atas) = 3 sistem
  informasi terpisah, tak punya rumah.

### A2. Sidebar oversized (196px full-height)
- Isi: 1 item aktif + 1 baris muted = ±10% terpakai, 90% ruang kosong.
- Tidak ada collapse toggle (collapse ≤1200px = kebetulan breakpoint, bukan kontrol).
- Item "FEM · Gempa · Beban · Model 3D — segera" = teks mati, bukan affordance.

### A3. Right panel = form panjang, bukan inspector
- 1 kolom vertikal tanpa section: title → caption → picker → mode → 4 slider →
  tipe beban → divider → hasil → accordion → asumsi → disclaimer.
- Hierarchy datar: label uppercase 10px bersaing dengan value 11.5px.
- Judul "Lab Balok 3D" + caption "Geser slider — …" makan prime space (copy AI-ish).
- Mode-row pakai `transform: scale(0.92)` hack → render teks blur/inconsistent.

### A4. Ukuran kontrol tak konsisten (inventory px aktual)
| Komponen | Tinggi |
|---|---|
| ghost-btn (timeline) | 30 |
| theme-float | 34 |
| panel-close | 26 |
| segmented-btn | ±28 |
| picker-btn | ±32 |
| chip | ±24 |
| replay-btn | ±34 |
6 tinggi berbeda, 3 radius (7/8/9/10/14), hit area X 26px < 32 minimum.

### A5. Spacing tanpa sistem
Padding terpakai: 2,3,4,5,6,7,8,9,10,11,12,14,16,20 px — 14 nilai arbitrer
(5px 11px chip, 7px 9px grid, 3px 9px bubble, 7px 14px toast…).

### A6. Tipografi 12 ukuran
9.5 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 15 / 20 / 22 / 28px.
Weight 400/500/600 campur tanpa aturan. Uppercase label sebagian saja.

### A7. Visual noise (AI-dashboard tells)
- Glass blur 18–24px + saturate + shadow 0 8px 24px di SEMUA permukaan.
- Slider: fill glow, thumb halo 8px, bubble bert ekor — ornamen > instrumen.
- Skeleton shimmer, rise-in stagger, vignette overlay, toast pill, chip dot.
- 4 tombol floating + 2 hint melayang di atas viewport.

### A8. Alignment/rhythm salah
- `#timeline` right:320 vs panel edge 296 → gap 24px tak beralasan.
- Sidebar 196+12=208 vs timeline left:220 → gap 12px lain.
- Chart strip 76px menggantung tanpa konteks hasil.

### A9. Close/reopen setengah jadi
- X fixed (20,20) melayang di viewport, TETAP TAMPIL setelah panel ditutup
  (handler tak menyembunyikan dirinya), reopen muncul di posisi lain.
- 2 sistem tutup: `body.panel-open` (≤820px) + inline transform (desktop).

### A10. Kontrol redundan (hapus)
- **Salin link / share** — tak dipakai (user konfirmasi hapus).
- **Simpan PNG** — hapus.
- "Ribbon fungsi V/M/y" chip di panel — pindah ke Display section timeline/viewport.
- Replay full-width di panel — milik viewport/toolbar.

### A11. Tanpa status bar
Angka kunci (δ, σ, SF) hanya hidup di panel; tertutup saat panel ditutup.
Software engineering: metrik kunci selalu terlihat.

### A12. Light theme = invert, bukan sistem
Glass putih 0.72 + border 0.08 di atas canvas 3D gelap → kontrol "tenggelam".
Belum ada token semantic (surface-elevated, text-muted, dsb).

## B. Mental model baru

```
┌──────────────────────────────────────────────────────────────┐
│ TOOLBAR 44px: [≡ Structural Lab · Mechanics]   [Reset][Replay] [Theme] │
├────┬──────────────────────────────────────────┬──────────────┤
│RAIL│                3D VIEWPORT                │  INSPECTOR   │
│ 48 │            (selalu terluas)              │  300px       │
│ ↔  │                                          │  [×] header  │
│200 │                                          │  sections:   │
│    ├──────────────────────────────────────────┤  GEOMETRY    │
│    │ STATUS BAR 28px: δ 12.4mm · σ 96MPa · SF 2.1 · ✓ │      │
│    ├──────────────────────────────────────────┤              │
│    │ CHARTS 3 strip (bagian status, bukan floats)│           │
└────┴──────────────────────────────────────────┴──────────────┘
```

- Rail 48px default (icon-only, tooltip), expand 200px via tombol ≡.
- Inspector 300px, header "Analysis — Cantilever Beam" + [×]; tutup = slide kanan,
  tombol buka balik DI TOOLBAR (bukan floating lepas).
- Status bar: metrik kunci + indikator keseimbangan, selalu terlihat.
- Charts menempel status bar — satu unit "output", bukan kartu lepas.

## C. Struktur komponen (vanilla, tanpa framework)

```
src/ui/shell/toolbar.ts      — top bar: brand, viewport tools, theme
src/ui/shell/sidebar.ts      — rail 48/200 + collapse
src/ui/shell/statusbar.ts    — metrik kunci + mount 3 MiniChart
src/ui/panels/inspector.ts   — header + InspectorSection (refactor beam-panel)
src/ui/glass/slider.ts       — SliderField: label-kiri value-kanan + track
src/ui/glass/segmented.ts    — tetap, height token
src/ui/glass/icons.ts        — tetap
style.css → tokens :root:
  --sp-1..6: 4/8/12/16/20/24/32
  --h-ctl: 32px (semua kontrol), --h-toolbar: 44, --h-status: 28
  --r-ctl: 8, --r-panel: 10
  --text-1/2/3: 13/11.5/10px, weight 400/600 saja
  surface: --bg / --surface / --surface-2 / --border / --text / --text-2 / --text-3
  --accent (satu-satunya warna aksi), --danger/--warn/--ok
```

## D. Yang dihapus
share btn, PNG btn, orbit-hint, kbd-hint, vignette, rise-in, skeleton shimmer,
bubble tail, glow fill, chip dot, scale(0.92) mode-row, sidebar-soon text.

## E. Yang dijaga (tidak disentuh)
beam-solver, equilibrium/strainEnergy, MiniChart logic + onPin, deformScale
anchor 100kN, preset picker data, URL state, localStorage, replay/anim,
theme persistence, semua binding slider→solve.

## F. Urutan implement (fase 3, nanti)
1. tokens + shell (toolbar/rail/statusbar) — layout berpindah, panel lama masih jalan
2. inspector refactor per-section
3. slider/slider-field + charts ke statusbar
4. hapus redundan + polish pass + QA checklist §20
