import './style.css';
import { SceneManager } from './visualization/three/scene-manager';
import { SimulationStore } from './core/simulation/store';
import type { SimulationState } from './structural/models/types';
import { MATERIALS } from './data/materials';
import { SECTION_PRESETS } from './structural/models/section';
import { SegmentedControl } from './ui/glass/segmented';
import { IOSSlider } from './ui/glass/slider';
import { icon, ensureSprite } from './ui/glass/icons';
import { fmtLength, fmtForce } from './core/units';

// §19 PHASE 1 — shell: SceneManager + glass UI. Modul diisi fase berikutnya.

interface AppState extends SimulationState {
  readonly module: 'mech' | 'math' | 'fem' | 'dyn' | 'loads' | 'model3d';
  readonly mode: 'explore' | 'explain' | 'sim';
}

const MODULES = [
  { id: 'mech', label: 'Mekanika Struktur', icon: 'ruler' },
  { id: 'math', label: 'Matematika', icon: 'sigma' },
  { id: 'fem', label: 'FEM', icon: 'grid-3x3' },
  { id: 'dyn', label: 'Gempa / Dinamika', icon: 'activity' },
  { id: 'loads', label: 'Beban Lingkungan', icon: 'wind' },
  { id: 'model3d', label: 'Model 3D', icon: 'boxes' },
] as const;

async function main(): Promise<void> {
  await ensureSprite();

  const canvas = document.createElement('canvas');
  canvas.id = 'canvas3d';
  document.body.append(canvas);

  let sm: SceneManager;
  try {
    sm = new SceneManager(canvas);
  } catch (err) {
    // §8 — fallback WebGL gagal
    const msg = document.createElement('div');
    msg.className = 'glass';
    msg.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;padding:16px;z-index:20';
    msg.textContent = 'WebGL tidak tersedia di browser ini — visualisasi 3D dimatikan. Diagram 2D tetap berfungsi.';
    document.body.append(msg);
    return;
  }

  const store = new SimulationStore<AppState>({
    model: null,
    time: 0,
    module: 'mech',
    mode: 'explore',
  });

  // ===== Sidebar rail =====
  const sidebar = document.createElement('aside');
  sidebar.id = 'sidebar';
  sidebar.className = 'glass';
  const nav = document.createElement('nav');
  for (const m of MODULES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'module-btn';
    btn.append(icon(m.icon, 18));
    const span = document.createElement('span');
    span.textContent = m.label;
    btn.append(span);
    btn.setAttribute('aria-current', String(m.id === 'mech'));
    btn.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', 'false'));
      btn.setAttribute('aria-current', 'true');
      store.set({ module: m.id });
    });
    nav.append(btn);
  }
  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.append(icon('landmark', 18));
  const brandText = document.createElement('span');
  brandText.textContent = 'Structural Lab';
  brand.append(brandText);
  sidebar.append(brand, nav);
  document.body.append(sidebar);

  // ===== Panel kanan: parameter contoh (preset beam §17) =====
  const panel = document.createElement('aside');
  panel.id = 'panel';
  panel.className = 'glass';
  const h = document.createElement('h2');
  h.textContent = 'Mekanika Struktur';
  const cap = document.createElement('p');
  cap.className = 'caption';
  cap.textContent = 'Preset: kantilever IPE300, beban titik ujung';
  panel.append(h, cap);

  // segmented Explore/Explain/Simulation
  const seg = new SegmentedControl(
    [
      { value: 'explore', label: 'Explore' },
      { value: 'explain', label: 'Explain' },
      { value: 'sim', label: 'Simulation' },
    ],
    'explore',
    (v) => store.set({ mode: v }),
  );
  panel.append(seg.el);

  // slider panjang (placeholder wiring ke store fase berikut; nilai sudah diformat unit §10)
  const lengthRow = document.createElement('div');
  lengthRow.className = 'param-row';
  const lenLabel = document.createElement('label');
  const lenText = document.createElement('span');
  lenText.textContent = 'Panjang bentang';
  const lenVal = document.createElement('span');
  lenVal.className = 'val num';
  lenLabel.append(lenText, lenVal);
  const lenSlider = new IOSSlider(2, 10, 0.1, 6, (v) => fmtLength(v), (v) => {
    lenVal.textContent = fmtLength(v);
  }, 'Panjang bentang (m)');
  lengthRow.append(lenLabel, lenSlider.el);
  panel.append(lengthRow);
  lenVal.textContent = fmtLength(6);

  const loadRow = document.createElement('div');
  loadRow.className = 'param-row';
  const loadLabel = document.createElement('label');
  const loadText = document.createElement('span');
  loadText.textContent = 'Beban ujung P';
  const loadVal = document.createElement('span');
  loadVal.className = 'val num';
  loadLabel.append(loadText, loadVal);
  const loadSlider = new IOSSlider(0, 100, 1, 20, (v) => fmtForce(v * 1000), (v) => {
    loadVal.textContent = fmtForce(v * 1000);
  }, 'Beban ujung (kN)');
  loadRow.append(loadLabel, loadSlider.el);
  panel.append(loadRow);
  loadVal.textContent = fmtForce(20e3);

  // material info (dari data §9 — angka sungguhan dari SECTION_PRESETS)
  const mat = MATERIALS.steelS355;
  const sec = SECTION_PRESETS[0]; // IPE300
  const matBlock = document.createElement('div');
  matBlock.className = 'result-block';
  matBlock.append(row('Material', mat.name));
  matBlock.append(row('Penampang', sec.name));
  matBlock.append(row('Iy', `${sig3m(sec.props.Iy)} mm⁴`));
  matBlock.append(row('A', `${sig3m(sec.props.A)} mm²`));
  const dis = document.createElement('div');
  dis.className = 'disclaimer';
  dis.textContent = 'Educational simulation — not a substitute for professional structural engineering design or verification.';
  matBlock.append(dis);
  matBlock.append(...[]);
  panel.append(matBlock);

  // ===== Timeline bawah (playback placeholder, fase berikut) =====
  const timeline = document.createElement('footer');
  timeline.id = 'timeline';
  timeline.className = 'glass';
  const controls = document.createElement('div');
  controls.className = 'controls';
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'ghost-btn';
  playBtn.setAttribute('aria-label', 'Play');
  playBtn.append(icon('play', 16));
  playBtn.addEventListener('click', () => {
    const playing = playBtn.getAttribute('aria-pressed') === 'true';
    playBtn.setAttribute('aria-pressed', String(!playing));
    playBtn.replaceChildren(icon(playing ? 'play' : 'pause', 16));
  });
  playBtn.setAttribute('aria-pressed', 'false');
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'ghost-btn';
  resetBtn.setAttribute('aria-label', 'Restart');
  resetBtn.append(icon('rotate-ccw', 16));
  controls.append(playBtn, resetBtn);
  timeline.append(controls);
  document.body.append(timeline);

  // ===== Wiring store → 3D =====
  sm.onFrame(() => {
    store.flush(); // §12 dirty-flag: listener sekali per frame
  });

  window.addEventListener('resize', () => sm.resize());
  sm.resize();
  sm.fitTo(6, 1.2);

  // contoh modul: beam IPE300 3D profil asli §6 — placeholder scene fase 3
  void MATERIALS;
}

function row(label: string, value: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'param-row';
  div.style.marginBottom = '8px';
  const lab = document.createElement('span');
  lab.textContent = label;
  const val = document.createElement('span');
  val.className = 'num';
  val.textContent = value;
  div.append(lab, val);
  div.style.display = 'flex';
  div.style.justifyContent = 'space-between';
  return div;
}

function sig3m(v: number): string {
  return v.toPrecision(4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

main().catch((err: unknown) => {
  const el = document.body.querySelector('#app') ?? document.body;
  el.textContent = `Gagal memuat aplikasi: ${err instanceof Error ? err.message : String(err)}`;
});
