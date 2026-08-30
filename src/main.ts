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
import { fmtForce, fmtMoment, fmtLength } from './core/units';
import { icon, ensureSprite } from './ui/glass/icons';

// PHASE 3 — Lab Balok 3D: satu solver → 3D (medium utama) + 3 diagram SVG + panel hasil.
// §12 single source of truth: solver dijalankan ulang saat param berubah; animasi
// spring menghaluskan transisi; store flush sekali per frame.

const RINGS = 101;

async function main(): Promise<void> {
  await ensureSprite();

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
    loadAt: 6,
    materialId: 'steelS355',
    sectionId: 'ipe300',
    support: 'cantilever',
    loadType: 'point',
    deformScale: 1,
  };
  // Restore param tersimpan (localStorage) — refresh tak reset pengaturan.
  try {
    const saved = JSON.parse(localStorage.getItem('sl-params') ?? 'null') as Partial<BeamParams> | null;
    if (saved) {
      if (typeof saved.span === 'number') params.span = saved.span;
      if (typeof saved.loadP === 'number') params.loadP = saved.loadP;
      if (typeof saved.loadAt === 'number') params.loadAt = Math.min(saved.loadAt, params.span);
      if (typeof saved.deformScale === 'number' && saved.deformScale >= 1 && saved.deformScale <= 5) params.deformScale = saved.deformScale;
      if (saved.materialId && MATERIALS[saved.materialId]) params.materialId = saved.materialId;
      if (saved.sectionId && SECTION_PRESETS.some((s) => s.id === saved.sectionId)) params.sectionId = saved.sectionId;
      if (saved.support === 'ss' || saved.support === 'cantilever') params.support = saved.support;
      if (saved.loadType === 'point' || saved.loadType === 'udl') params.loadType = saved.loadType;
    }
  } catch { /* data korup → default */ }

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
  for (const c of Object.values(charts)) c.onHover = (x) => view.setCrosshair(x);

  const timeline = document.createElement('footer');
  timeline.id = 'timeline';
  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row';
  chartsRow.append(charts.shear.el, charts.moment.el, charts.deflect.el);
  timeline.append(chartsRow);
  document.body.append(timeline);

  // ===== Panel kanan =====
  const panelHost = document.createElement('aside');
  panelHost.id = 'panel';
  panelHost.className = 'glass';
  const replay = (): void => {
    anim.setFactor(0, 1); // replay ramp beban 0→penuh
    scheduleSolve();
  };
  const panel = buildBeamPanel(params, () => scheduleSolve(), replay);
  panelHost.append(panel.el);
  document.body.append(panelHost);

  // Toggle ribbon Matematika (tampil di panel, bukan sidebar)
  const mathToggle = document.createElement('button');
  mathToggle.type = 'button';
  mathToggle.className = 'chip';
  mathToggle.textContent = 'Ribbon fungsi V/M/y';
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

  // ===== Sidebar (declutter: modul belum siap = SATU baris hint, bukan 5 tombol redup) =====
  const MODULES = [
    { id: 'mech', label: 'Mekanika Struktur', icon: 'ruler', ready: true },
  ] as const;
  const SOON = 'FEM · Gempa · Beban · Model 3D — segera';

  const sidebar = document.createElement('aside');
  sidebar.id = 'sidebar';
  sidebar.className = 'glass';
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.append(icon('landmark', 18));
  const bt = document.createElement('span');
  bt.textContent = 'Structural Lab';
  brand.append(bt);
  const nav = document.createElement('nav');
  for (const m of MODULES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'module-btn';
    if (!m.ready) {
      btn.setAttribute('aria-disabled', 'true'); // tetap klikable → toast, bukan dead zone
    }
    btn.append(icon(m.icon, 18));
    const bs = document.createElement('span');
    bs.textContent = m.label;
    btn.append(bs);
    btn.setAttribute('aria-current', String(m.id === 'mech'));
    if (m.ready) {
      btn.addEventListener('click', () => {
        nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', 'false'));
        btn.setAttribute('aria-current', 'true');
      });
    }
    nav.append(btn);
  }
  // Hint modul mendatang — satu baris muted, bukan 5 tombol disabled
  const soon = document.createElement('div');
  soon.className = 'sidebar-soon';
  soon.textContent = SOON;
  nav.append(soon);
  sidebar.append(brand, nav);

  // Toggle panel (mobile only — CSS sembunyikan di desktop)
  const panelToggle = document.createElement('button');
  panelToggle.type = 'button';
  panelToggle.className = 'module-btn panel-toggle';
  panelToggle.setAttribute('aria-label', 'Panel parameter');
  panelToggle.append(icon('sliders-horizontal', 18));
  panelToggle.addEventListener('click', () => document.body.classList.toggle('panel-open'));
  sidebar.append(panelToggle);

  // ===== Toggle tema — tombol floating pojok kanan atas viewport (bukan di sidebar) =====
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'ghost-btn theme-float';
  themeBtn.setAttribute('aria-label', 'Ganti tema terang/gelap');
  themeBtn.append(icon('sun-moon', 18));
  const applyTheme = (light: boolean): void => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    themeLight = light;
    sm.setTheme(light);
    view.setTheme(light);
    view.setBeamMaterial(material3D(material(), textures, light));
    try {
      localStorage.setItem('sl-theme', light ? 'light' : 'dark');
    } catch { /* abaikan */ }
  };
  // Restore tema tersimpan
  try {
    applyTheme(localStorage.getItem('sl-theme') === 'light');
  } catch { /* default dark */ }
  themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme !== 'light');
  });
  document.body.append(themeBtn);
  document.body.append(sidebar);

  // ===== Solve + wire =====
  let solveScheduled = false;
  const scheduleSolve = (): void => {
    solveScheduled = true; // flush di frame berikut (§12 — sekali per frame, bukan per event slider)
  };

  const applySolution = (): void => {
    const loads: BeamLoad[] = [];
    if (params.loadP > 0) {
      if (params.loadType === 'udl') loads.push({ type: 'udl', value: params.loadP / params.span, from: 0, to: params.span });
      else loads.push({ type: 'point', value: params.loadP, at: params.loadAt });
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
    panel.setReplayState(moving);
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
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'glass';
  document.body.append(toast);
  let toastTimer: number | undefined;
  const showToast = (msg: string): void => {
    toast.textContent = msg;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
  };
  nav.querySelectorAll<HTMLButtonElement>(".module-btn[aria-disabled='true']").forEach((b) => {
    const label = b.querySelector('span')?.textContent ?? 'Modul';
    b.addEventListener('click', () => showToast(`${label} aktif di fase berikutnya.`));
  });

  applySolution();
}

main().catch((err: unknown) => {
  document.body.textContent = `Gagal memuat aplikasi: ${err instanceof Error ? err.message : String(err)}`;
});
