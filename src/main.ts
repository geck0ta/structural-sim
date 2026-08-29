import './style.css';
import { SceneManager } from './visualization/three/scene-manager';
import { BeamView } from './visualization/three/beam-3d';
import { BeamAnim } from './visualization/animation/beam-anim';
import { MiniChart, CHART_COLORS } from './visualization/diagrams/mini-chart';
import { buildBeamPanel } from './ui/panels/beam-panel';
import type { BeamParams } from './ui/panels/beam-panel';
import { solveBeam } from './structural/beam/beam-solver';
import type { BeamLoad } from './structural/beam/beam-solver';
import type { ChartData } from './visualization/diagrams/mini-chart';
import { buildTextures, material3D } from './structural/textures';
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

  let sm: SceneManager;
  try {
    sm = new SceneManager(canvas);
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
  };

  const section = (): typeof SECTION_PRESETS[number] => SECTION_PRESETS.find((s) => s.id === params.sectionId) ?? SECTION_PRESETS[0]!;
  const material = (): (typeof MATERIALS)[string] => MATERIALS[params.materialId] ?? MATERIALS.steelS355;

  // ===== 3D =====
  const textures = buildTextures();
  const view = new BeamView(sm.scene, material3D(material(), textures));
  const anim = new BeamAnim(RINGS);

  // ===== Diagrams =====
  const charts = {
    shear: new MiniChart('Gaya geser V(x)', CHART_COLORS.shear, 260, 64, fmtForce),
    moment: new MiniChart('Momen M(x)', CHART_COLORS.moment, 260, 64, fmtMoment),
    deflect: new MiniChart('Defleksi y(x)', CHART_COLORS.deflect, 260, 64, fmtLength),
  };

  const timeline = document.createElement('footer');
  timeline.id = 'timeline';
  timeline.className = 'glass';
  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row';
  chartsRow.append(charts.shear.el, charts.moment.el, charts.deflect.el);
  timeline.append(chartsRow);
  document.body.append(timeline);

  // ===== Panel kanan =====
  const panelHost = document.createElement('aside');
  panelHost.id = 'panel';
  panelHost.className = 'glass';
  const panel = buildBeamPanel(
    params,
    () => scheduleSolve(),
    () => {
      anim.setFactor(0, 1); // replay ramp beban 0→penuh
      scheduleSolve();
    },
  );
  panelHost.append(panel.el);
  document.body.append(panelHost);

  // ===== Sidebar 6 modul (§17 — nav utama; modul dibangun fase berikutnya disabled) =====
  const MODULES = [
    { id: 'mech', label: 'Mekanika Struktur', icon: 'ruler', ready: true },
    { id: 'math', label: 'Matematika', icon: 'sigma', ready: false },
    { id: 'fem', label: 'FEM', icon: 'grid-3x3', ready: false },
    { id: 'dyn', label: 'Gempa / Dinamika', icon: 'activity', ready: false },
    { id: 'loads', label: 'Beban Lingkungan', icon: 'wind', ready: false },
    { id: 'model3d', label: 'Model 3D', icon: 'boxes', ready: false },
  ] as const;

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
    btn.disabled = !m.ready;
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
  sidebar.append(brand, nav);

  // Toggle tema terang/gelap
  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'module-btn theme-btn';
  themeBtn.append(icon('sun-moon', 18));
  const themeLabel = document.createElement('span');
  themeLabel.textContent = 'Tema terang';
  themeBtn.append(themeLabel);
  const applyTheme = (light: boolean): void => {
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    themeLabel.textContent = light ? 'Tema gelap' : 'Tema terang';
    sm.setTheme(light);
  };
  themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme !== 'light');
  });
  sidebar.append(themeBtn);
  document.body.append(sidebar);

  // ===== Disclaimer =====
  const dis = document.createElement('div');
  dis.className = 'disclaimer';
  dis.textContent = 'Educational simulation — not a substitute for professional structural engineering design or verification.';
  panelHost.append(dis);

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
    // material 3D ikut material terpilih (tekstur kayu/beton)
    view.setBeamMaterial(material3D(material(), textures));
    const geoChanged = view.span !== params.span || view.support !== params.support
      || view.sectionId !== params.sectionId || view.matId !== params.materialId;
    if (geoChanged) deformScaleVal = 0; // skala deformasi dihitung ulang (dijangkar geometri baru)
    view.matId = params.materialId;
    view.setBeam(section(), params.span, params.support);
    panel.showResults(sol);
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
    view.updateDeform(anim, moving || solveScheduled, {
      scale: deformScale(),
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
    charts.deflect.update(chartData(anim.y, deformScale()));
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
  applySolution();
}

main().catch((err: unknown) => {
  document.body.textContent = `Gagal memuat aplikasi: ${err instanceof Error ? err.message : String(err)}`;
});
