import './style.css';
import type { SceneManager } from './visualization/three/scene-manager';
import { BeamAnim } from './visualization/animation/beam-anim';
import { MiniChart, CHART_COLORS } from './visualization/diagrams/mini-chart';
import { buildBeamPanel } from './ui/panels/beam-panel';
import type { BeamParams } from './ui/panels/beam-panel';
import { solveBeam } from './structural/beam/beam-solver';
import type { BeamLoad } from './structural/beam/beam-solver';
import type { ChartData } from './visualization/diagrams/mini-chart';
import { MATERIALS } from './data/materials';
import { SECTION_PRESETS } from './structural/models/section';
import { fmtForce, fmtMoment, fmtLength, fmtStress } from './core/units';
import { icon, ensureSprite } from './ui/glass/icons';

// PHASE 3 — Lab Balok 3D: satu solver → 3D (medium utama) + 3 diagram SVG + panel hasil.
// §12 single source of truth: solver dijalankan ulang saat param berubah; animasi
// spring menghaluskan transisi; store flush sekali per frame.

const RINGS = 101;

async function main(): Promise<void> {
  // Ikon bukan blocker: gagal fetch sprite (offline/adblock) → UI tetap jalan, ikon kosong.
  try {
    await ensureSprite();
  } catch {
    /* ikon opsional */
  }

  const canvas = document.createElement('canvas');
  canvas.id = 'canvas3d';
  document.body.append(canvas);

  // Three.js + tekstur = chunk terpisah (lazy ~500 kB) — kanvas & UI tampil dulu.
  const [{ SceneManager: SM }, { BeamView }, { buildTextures, material3D }, { Ribbon }, { CanvasLabel }] = await Promise.all([
    import('./visualization/three/scene-manager'),
    import('./visualization/three/beam-3d'),
    import('./structural/textures'),
    import('./visualization/three/ribbon'),
    import('./visualization/three/canvas-label'),
  ]);

  let sm: SceneManager;
  try {
    sm = new SM(canvas);
  } catch {
    const msg = document.createElement('div');
    msg.className = 'glass';
    msg.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;padding:16px;z-index:20';
    msg.textContent = 'WebGL tidak tersedia — visualisasi 3D dimatikan, diagram tetap berfungsi.';
    document.body.append(msg);
    return;
  }

  // ===== Parameter state (single source; panel dumb view) =====
  const params: BeamParams = {
    span: 6,
    loadP: 20e3,
    loadW: 15e3,
    loadAt: 6,
    materialId: 'steelS355',
    sectionId: 'ipe300',
    support: 'cantilever',
    loadType: 'point',
    presetId: 'cantilever',
    deformScale: 1,
  };
  // Restore param tersimpan (localStorage) — refresh tak reset pengaturan.
  try {
    const saved = JSON.parse(localStorage.getItem('sl-params') ?? 'null') as Partial<BeamParams> | null;
    if (saved) {
      if (typeof saved.span === 'number') params.span = saved.span;
      if (typeof saved.loadP === 'number') params.loadP = saved.loadP;
      if (typeof saved.loadW === 'number') params.loadW = saved.loadW;
      if (typeof saved.loadAt === 'number') params.loadAt = Math.min(saved.loadAt, params.span);
      if (typeof saved.deformScale === 'number' && saved.deformScale >= 1 && saved.deformScale <= 5) params.deformScale = saved.deformScale;
      if (saved.materialId && MATERIALS[saved.materialId]) params.materialId = saved.materialId;
      if (saved.sectionId && SECTION_PRESETS.some((s) => s.id === saved.sectionId)) params.sectionId = saved.sectionId;
      if (saved.support === 'ss' || saved.support === 'cantilever') params.support = saved.support;
      if (saved.loadType === 'point' || saved.loadType === 'udl') {
        params.loadType = saved.loadType;
        // Judul preset & picker mengikuti state tersimpan — tanpa konflik "P di ujung" saat udl.
        if (saved.loadType === 'udl') params.presetId = 'udl';
      }
      if (saved.presetId && ['cantilever', 'bridge', 'udl'].includes(saved.presetId)) params.presetId = saved.presetId;
    }
  } catch { /* default */ }
  // F13: URL params menang atas localStorage — state shareable (?span=8&p=30&at=4…).
  try {
    const q = new URLSearchParams(location.search);
    const qs = (k: string): number | null => { const v = Number.parseFloat(q.get(k) ?? ''); return Number.isFinite(v) ? v : null; };
    const span = qs('span'); if (span !== null && span > 0) params.span = span;
    const p = qs('p'); if (p !== null) params.loadP = Math.max(0, p) * 1000;
    const w = qs('w'); if (w !== null) params.loadW = Math.max(0, w) * 1000;
    const at = qs('at'); if (at !== null) params.loadAt = Math.min(Math.max(at, 0), params.span);
    const mat = q.get('mat'); if (mat && MATERIALS[mat]) params.materialId = mat;
    const sec = q.get('sec'); if (sec && SECTION_PRESETS.some((s) => s.id === sec)) params.sectionId = sec;
    const sup = q.get('sup'); if (sup === 'ss' || sup === 'cantilever') params.support = sup;
    const lt = q.get('lt'); if (lt === 'point' || lt === 'udl') params.loadType = lt;
    if (params.support === 'cantilever') params.loadAt = params.span;
    if (params.loadType === 'udl' && params.support === 'ss') params.presetId = 'udl';
    if (params.loadType === 'point' && params.support === 'ss') params.presetId = 'bridge';
    if (params.loadType === 'point' && params.support === 'cantilever') params.presetId = 'cantilever';
  } catch { /* default */ }

  let themeLight = false;

  const section = (): typeof SECTION_PRESETS[number] => SECTION_PRESETS.find((s) => s.id === params.sectionId) ?? SECTION_PRESETS[0]!;
  const material = (): (typeof MATERIALS)[string] => MATERIALS[params.materialId] ?? MATERIALS.steelS355;

  // ===== 3D =====
  const textures = buildTextures();
  const view = new BeamView(sm.scene, material3D(material(), textures, themeLight));
  const anim = new BeamAnim(RINGS);

  // ===== Modul Matematika: ribbon 3D V(x)/M(x)/y(x) mengambang di belakang beam =====
  const RIBBON_Z = -0.6;
  const ribbons = {
    V: new Ribbon(params.span, RINGS, RIBBON_Z),
    M: new Ribbon(params.span, RINGS, RIBBON_Z),
    y: new Ribbon(params.span, RINGS, RIBBON_Z),
  };
  const ribbonLabels = { V: new CanvasLabel(0.3), M: new CanvasLabel(0.3), y: new CanvasLabel(0.3) };
  ribbonLabels.V.set('V(x)', '#ff9f0a');
  ribbonLabels.M.set('M(x)', '#ff375f');
  ribbonLabels.y.set('y(x)', '#30d158');
  for (const k of ['V', 'M', 'y'] as const) {
    ribbons[k].group.visible = false;
    ribbonLabels[k].sprite.visible = false;
    sm.scene.add(ribbons[k].group, ribbonLabels[k].sprite);
  }
  // Normalisasi tinggi ribbon: dihitung dari sampel solver tiap solve (§3 — warna=sign, tinggi=nilai).
  let normScale = { v: 0, m: 0, y: 0 };

  // ===== Diagrams =====
  const charts = {
    shear: new MiniChart('Gaya geser V(x)', 'kN', CHART_COLORS.shear, 260, 64, fmtForce),
    moment: new MiniChart('Momen M(x)', 'kN·m', CHART_COLORS.moment, 260, 64, fmtMoment),
    deflect: new MiniChart('Defleksi y(x)', 'mm', CHART_COLORS.deflect, 260, 64, fmtLength, true), // sumbu gabung: label hanya di chart terakhir
  };
  // Hover chart mana pun → crosshair 3D di x sama (sinkron 2D→3D).
  let pinnedX: number | null = null; // F1: klik chart → pin persist; klik dekat sebelumnya = lepas
  for (const c of Object.values(charts)) {
    c.onHover = (x) => view.setCrosshair(x);
    c.onPin = (x) => {
      if (x !== null && pinnedX !== null && Math.abs(x - pinnedX) < 0.3) x = null; // toggle
      pinnedX = x;
      view.setPin(x);
    };
  }

  const timeline = document.createElement('footer');
  timeline.id = 'timeline';
  // Status bar instrumen: metrik kunci selalu terlihat, sekalipun inspector ditutup.
  const statusbar = document.createElement('div');
  statusbar.id = 'statusbar';
  const stDefl = document.createElement('span');
  const stStress = document.createElement('span');
  const stSF = document.createElement('span');
  const stEq = document.createElement('span');
  statusbar.append(stDefl, stStress, stSF, stEq);
  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row';
  chartsRow.append(charts.shear.el, charts.moment.el, charts.deflect.el);
  timeline.append(statusbar, chartsRow);
  document.body.append(timeline);

  // ===== Panel kanan (inspector) =====
  const panelHost = document.createElement('aside');
  panelHost.id = 'panel';
  panelHost.className = 'glass';
  const replay = (): void => {
    anim.setFactor(0, 1); // replay ramp beban 0→penuh
    scheduleSolve();
  };
  const panel = buildBeamPanel(params, () => scheduleSolve());
  // Drag beban titik di 3D: proxy → params.loadAt, lalu solve (slider ikut via syncAll internal).
  sm.dragProbe = {
    object: view.dragProxyObject,
    onDragStart: () => {},
    onDragMove: (x) => {
      if ((params.loadType ?? 'point') !== 'point') return;
      params.loadAt = Math.min(Math.max(x, 0.1), params.span);
      scheduleSolve();
    },
    onDragEnd: () => scheduleSolve(),
  };
  // Satu tombol toggle panel: x ↔ sliders — tak ada pasangan tombol yang state-nya bisa tercecer.
  const panelToggleBtn = document.createElement('button');
  panelToggleBtn.type = 'button';
  panelToggleBtn.className = 'tb-btn';
  panelToggleBtn.setAttribute('aria-label', 'Tutup panel');
  panelToggleBtn.append(icon('x', 16));
  let panelIsOpen = true;
  const setPanel = (open: boolean): void => {
    panelIsOpen = open;
    document.body.classList.toggle('panel-open', open);
    panelHost.style.transform = open ? '' : 'translateX(calc(100% + 24px))';
    panelToggleBtn.replaceChildren(icon(open ? 'x' : 'sliders-horizontal', 16));
    panelToggleBtn.setAttribute('aria-label', open ? 'Tutup panel' : 'Buka panel');
  };
  panelToggleBtn.addEventListener('click', () => setPanel(!panelIsOpen));
  panelHost.append(panel.el);
  document.body.append(panelHost);

  // Toggle ribbon Matematika (tampil di panel, bukan sidebar)
  const mathToggle = document.createElement('button');
  mathToggle.type = 'button';
  mathToggle.className = 'chip';
  mathToggle.textContent = 'Ribbon V·M·y';
  mathToggle.addEventListener('click', () => {
    const on = mathToggle.classList.toggle('on');
    for (const k of ['V', 'M', 'y'] as const) {
      ribbons[k].group.visible = on;
      ribbonLabels[k].sprite.visible = on;
    }
  });
  panel.mathRow.append(mathToggle);

  // Skip-link a11y (§14): Tab pertama → langsung ke panel parameter.
  const skip = document.createElement('a');
  skip.href = '#panel';
  skip.className = 'skip-link';
  skip.textContent = 'Lompat ke panel parameter';
  document.body.append(skip);

  // ===== Sidebar rail 48px — polos: ikon saja, tanpa brand/teks mati =====
  const sidebar = document.createElement('aside');
  sidebar.id = 'sidebar';
  sidebar.className = 'glass';
  const nav = document.createElement('nav');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'module-btn';
  btn.setAttribute('aria-label', 'Mekanika Struktur');
  btn.append(icon('ruler', 16));
  btn.setAttribute('aria-current', 'true');
  nav.append(btn);
  sidebar.append(nav);

  // Toggle panel (mobile only — CSS sembunyikan di desktop)
  const panelToggle = document.createElement('button');
  panelToggle.type = 'button';
  panelToggle.className = 'module-btn panel-toggle';
  panelToggle.setAttribute('aria-label', 'Panel parameter');
  panelToggle.append(icon('sliders-horizontal', 16));
  panelToggle.addEventListener('click', () => document.body.classList.toggle('panel-open'));
  sidebar.append(panelToggle);

  // ===== Toggle tema — siklus terang → senja → gelap (klik lanjut) =====
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'tb-btn';
  themeBtn.setAttribute('aria-label', 'Ganti tema (terang/senja/gelap)');
  themeBtn.title = 'Tema: terang → senja → gelap';
  themeBtn.append(icon('sun-moon', 16));
  type ThemeMode = 'light' | 'dusk' | 'dark';
  const applyTheme = (mode: ThemeMode): void => {
    document.documentElement.dataset.theme = mode;
    themeLight = mode !== 'dark';
    sm.setTheme(mode);
    view.setTheme(mode !== 'dark');
    view.setBeamMaterial(material3D(material(), textures, mode !== 'dark'));
    try {
      localStorage.setItem('sl-theme', mode);
    } catch { /* abaikan */ }
  };
  // Restore tema tersimpan (legacy 'light'/'dark' tetap valid).
  try {
    const saved = localStorage.getItem('sl-theme');
    applyTheme(saved === 'light' || saved === 'dusk' ? saved : 'dark');
  } catch { /* default dark */ }
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    applyTheme(cur === 'light' ? 'dusk' : cur === 'dusk' ? 'dark' : 'light');
  });
  document.body.append(sidebar);

  // ===== Toolbar atas 44px — satu rumah untuk brand tipis + viewport tools + tema =====
  const toolbar = document.createElement('header');
  toolbar.id = 'toolbar';
  const tbLeft = document.createElement('div');
  tbLeft.className = 'tb-group';
  // Logo mark tunggal — tanpa teks brand, tanpa latar (polos simetris).
  const logo = icon('activity', 16);
  logo.classList.add('tb-logo');
  tbLeft.append(logo);
  const tbRight = document.createElement('div');
  tbRight.className = 'tb-group';
  // Reset kamera — tinggi/radius/icon sama dengan tema (32px token).
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'tb-btn';
  resetBtn.setAttribute('aria-label', 'Reset tampilan kamera (R)');
  resetBtn.title = 'Reset tampilan (R)';
  resetBtn.append(icon('scan', 16));
  const resetView = (): void => sm.fitTo(params.span, view.beamCenterY);
  resetBtn.addEventListener('click', resetView);
  // Panel reopen + reset kamera + tema + tutup inspector — satu sistem di toolbar.
  tbRight.append(panelToggleBtn, resetBtn, themeBtn);
  toolbar.append(tbLeft, tbRight);
  document.body.append(toolbar);

  // Keyboard shortcut: R = reset view, Space = replay (bukan saat fokus input).
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
    if (e.key === 'r' || e.key === 'R') resetView();
    else if (e.code === 'Space') {
      e.preventDefault();
      replay();
    }
  });

  // ===== Solve + wire =====
  let solveScheduled = false;
  const scheduleSolve = (): void => {
    solveScheduled = true; // flush di frame berikut (§12 — sekali per frame, bukan per event slider)
  };

  const applySolution = (): void => {
    const loads: BeamLoad[] = [];
    if (params.loadType === 'udl') {
      if (params.loadW > 0) loads.push({ type: 'udl', value: params.loadW, from: 0, to: params.span });
    } else if (params.loadP > 0) {
      loads.push({ type: 'point', value: params.loadP, at: params.loadAt });
    }
    const case_ = {
      span: params.span,
      support: params.support,
      loads,
      section: section(),
      material: material(),
    };
    let sol;
    try {
      sol = solveBeam(case_);
    } catch (e) {
      showEngineError(e);
      return;
    }
    hideEngineError();
    const samples = sol.samples(RINGS);
    anim.setTargets(
      samples.map((s) => s.V),
      samples.map((s) => s.M),
      samples.map((s) => s.y),
    );
    // Normalisasi ribbon (Matematika): tinggi maks 0.28 × bentang per fungsi — hindari silang antar ribbon.
    const maxY = (arr: number[]): number => Math.max(...arr.map((v) => Math.abs(v)), 1e-9);
    normScale = {
      v: (0.22 * params.span) / maxY(samples.map((s) => s.V)),
      m: (0.22 * params.span) / maxY(samples.map((s) => s.M)),
      y: (0.14 * params.span) / maxY(samples.map((s) => s.y)),
    };
    // material 3D ikut material terpilih (tekstur kayu/beton)
    view.setBeamMaterial(material3D(material(), textures, themeLight));
    const geoChanged = view.span !== params.span || view.support !== params.support
      || view.sectionId !== params.sectionId || view.matId !== params.materialId;
    if (geoChanged) deformScaleVal = 0; // skala deformasi dihitung ulang (dijangkar geometri baru)
    for (const k of ['V', 'M', 'y'] as const) ribbons[k].setSpan(params.span);
    view.matId = params.materialId;
    view.setBeam(section(), params.span, params.support);
    panel.showResults(sol);
    // Status bar instrumen — metrik kunci + keseimbangan (selalu terlihat).
    stDefl.textContent = `↓ ${fmtLength(Math.abs(sol.maxDeflection.value))}`;
    stStress.textContent = `σ ${fmtStress(sol.maxBendingStress)}`;
    stSF.textContent = sol.safetyFactor === Infinity ? 'SF ∞' : `SF ${sol.safetyFactor.toPrecision(3)}`;
    stSF.classList.toggle('warn', sol.safetyFactor < 1.5);
    stEq.textContent = sol.equilibrium.ok ? '✓ setimbang' : '✗ tak setimbang';
    stEq.classList.toggle('bad', !sol.equilibrium.ok);
    saveParams();
    // Kamera hanya re-fit saat geometri berubah — bukan tiap geser slider beban.
    if (geoChanged) sm.fitTo(params.span, view.beamCenterY);
    currentSol = sol;
  };

  let currentSol: ReturnType<typeof solveBeam> | null = null;
  let showEngineError: (e: unknown) => void = () => {};
  let hideEngineError: () => void = () => {};

  const errHost = document.createElement('div');
  errHost.id = 'engine-error';
  errHost.style.display = 'none';
  errHost.className = 'glass';
  panelHost.append(errHost);

  showEngineError = (e: unknown) => {
    errHost.style.display = 'block';
    errHost.textContent = e instanceof Error ? e.message : String(e);
  };
  hideEngineError = () => {
    errHost.style.display = 'none';
  };

  // ===== Frame loop =====
  let needsInit = true;
  let visualDirty = true; // chart/ribbon hanya redraw saat animasi bergerak / setelah solve (hemat DOM)
  sm.onFrame((dt) => {
    if (solveScheduled) {
      solveScheduled = false;
      applySolution();
    }
    if (needsInit) {
      needsInit = false;
      anim.snapToTargets();
      view.setBeam(section(), params.span, params.support);
    }
    const moving = anim.step(dt);
    if (!moving && !visualDirty) return; // diam total → skip rebuild chart/ribbon (anti-lag, tak ubah visual)
    visualDirty = true;
    view.updateDeform(anim, moving || solveScheduled, {
      scale: deformScale() * params.deformScale,
      loadAt: params.loadAt,
      loadP: params.loadP,
      loadType: params.loadType ?? 'point',
      support: params.support,
      reactions: currentSol?.reactions ?? { Ra: 0, Rb: 0, Ma: 0 },
    });

    // Diagram ikut animasi spring (nilainya sudah dianimasikan BeamAnim).
    // Defleksi: bentuk kurva dianimasikan scaled (visual), readout menampilkan δ fisik asli.
    const chartData = (arr: Float64Array, scale = 1): ChartData[] => {
      const out: ChartData[] = [];
      for (let i = 0; i < arr.length; i++) {
        out.push({ x: (i * params.span) / (RINGS - 1), v: arr[i]! * scale, raw: arr[i] });
      }
      return out;
    };
    charts.shear.update(chartData(anim.V));
    charts.moment.update(chartData(anim.M));
    charts.deflect.update(chartData(anim.y, deformScale() * params.deformScale));

    // Ribbon Matematika: ikut spring anim (faktor sama dgn beam), tinggi = nilai ternormalisasi.
    if (ribbons.V.group.visible) {
      const ds = deformScale() * params.deformScale;
      ribbons.V.update(Array.from(anim.V, (v) => v * anim.factor), { scale: normScale.v, offset: 2.6, band: 0.1 });
      ribbons.M.update(Array.from(anim.M, (v) => v * anim.factor), { scale: normScale.m, offset: 1.9, band: 0.1 });
      ribbons.y.update(Array.from(anim.y, (v) => v * anim.factor * ds), { scale: normScale.y, offset: -0.5, band: 0.1 });
      ribbonLabels.V.sprite.position.set(-0.35, 2.6 + normScale.v * 0.5, RIBBON_Z);
      ribbonLabels.M.sprite.position.set(-0.35, 1.9 + normScale.m * 0.5, RIBBON_Z);
      ribbonLabels.y.sprite.position.set(-0.35, -0.5 + normScale.y * 0.5, RIBBON_Z);
    }
    visualDirty = false;
  });

  // ===== Deform scale: dijangkar ke respons beban referensi 100 kN pada bentang
  // dan penampang saat ini — δ tampil ∝ beban (P naik → pelengkung nyata bertambah,
  // P=10 dan P=90 terlihat beda). Fisika linear: respons ∝ P, jadi cukup satu solve. =====
  const REF_LOAD = 100e3; // N
  let deformScaleVal = 0;
  const deformScale = (): number => {
    if (!currentSol || Math.abs(currentSol.maxDeflection.value) < 1e-9) return 1;
    if (deformScaleVal === 0) {
      // satu solve beban referensi: skala = defleksi pada P=100 kN diperbesar 10% bentang
      const refSol = solveBeam({
        span: params.span,
        support: params.support,
        loads: params.loadType === 'udl'
          ? [{ type: 'udl', value: REF_LOAD / params.span, from: 0, to: params.span }]
          : [{ type: 'point', value: REF_LOAD, at: params.loadAt }],
        section: section(),
        material: material(),
      });
      const refD = Math.abs(refSol.maxDeflection.value);
      deformScaleVal = refD > 1e-9 ? (0.1 * params.span) / refD : 1;
    }
    return deformScaleVal;
  };

  window.addEventListener('resize', () => sm.resize());
  sm.resize();

  // Simpan param + tema (§localStorage — refresh tak reset); dipanggil dari applySolution/applyTheme.
  const saveParams = (): void => {
    try {
      localStorage.setItem('sl-params', JSON.stringify(params));
    } catch { /* storage penuh/blocked → abaikan */ }
  };

  // Toast kecil: modul belum aktif (backlog #14)
  applySolution();
}

main().catch((err: unknown) => {
  document.body.textContent = `Gagal memuat aplikasi: ${err instanceof Error ? err.message : String(err)}`;
});
