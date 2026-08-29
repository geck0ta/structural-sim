import { MATERIALS } from '../../data/materials';
import { SECTION_PRESETS } from '../../structural/models/section';
import { fmtForce, fmtMoment, fmtStress, fmtLength } from '../../core/units';
import type { BeamSolution } from '../../structural/beam/beam-solver';
import { IOSSlider } from '../glass/slider';
import { SegmentedControl } from '../glass/segmented';

// §17 — panel Lab Balok. Panel DUMB: tak berhitung, hanya menampilkan.
// State dimiliki main.ts; panel emit perubahan lewat callback onChange.

export interface BeamParams {
  span: number; // m
  loadP: number; // N
  loadAt: number; // m
  materialId: string;
  sectionId: string;
  support: 'ss' | 'cantilever';
}

export interface BeamPanel {
  readonly el: HTMLDivElement;
  readonly getParams: () => BeamParams;
  readonly showResults: (sol: BeamSolution) => void;
  readonly setMode: (m: 'explore' | 'explain' | 'sim') => void;
}

export function buildBeamPanel(
  params: BeamParams,
  onChange: () => void,
  onMode: (m: 'explore' | 'explain' | 'sim') => void,
): BeamPanel {
  const root = document.createElement('div');

  const h = document.createElement('h2');
  h.textContent = 'Lab Balok 3D';
  const cap = document.createElement('p');
  cap.className = 'caption';
  cap.textContent = 'IPE300 · S355 — geser slider, 3D + diagram + angka ikut bersama.';
  root.append(h, cap);

  const modeSeg = new SegmentedControl(
    [
      { value: 'explore', label: 'Explore' },
      { value: 'explain', label: 'Explain' },
      { value: 'sim', label: 'Simulation' },
    ],
    'explore',
    (v) => {
      onMode(v);
      explainBlock.style.display = v === 'explain' ? 'block' : 'none';
    },
  );
  root.append(modeSeg.el);

  const sliderRow = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    fmt: (v: number) => string,
  ): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'param-row';
    const lab = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = label;
    const val = document.createElement('span');
    val.className = 'val num';
    lab.append(name, val);
    const slider = new IOSSlider(min, max, step, get(), fmt, (v) => {
      set(v);
      val.textContent = fmt(v);
      onChange();
    }, label);
    val.textContent = fmt(get());
    row.append(lab, slider.el);
    return row;
  };

  root.append(
    sliderRow('Panjang bentang L', 2, 10, 0.1, () => params.span, (v) => { params.span = v; params.loadAt = Math.min(params.loadAt, v); }, fmtLength),
  );
  root.append(sliderRow('Beban titik P', 0, 100, 1, () => params.loadP / 1000, (v) => { params.loadP = v * 1000; }, (v) => fmtForce(v * 1000)));
  root.append(sliderRow('Posisi beban a', 0.5, 10, 0.1, () => params.loadAt, (v) => { params.loadAt = v; }, fmtLength));

  // Tumpuan
  const supLabel = document.createElement('div');
  supLabel.className = 'param-label';
  supLabel.textContent = 'Tipe tumpuan';
  const supSeg = new SegmentedControl(
    [
      { value: 'cantilever', label: 'Kantilever' },
      { value: 'ss', label: 'Sederhana' },
    ],
    params.support,
    (v) => {
      params.support = v;
      if (params.support === 'cantilever') params.loadAt = params.span;
      onChange();
    },
  );
  root.append(supLabel, supSeg.el);

  // Material & penampang — native select
  const matLabel = document.createElement('div');
  matLabel.className = 'param-label';
  matLabel.textContent = 'Material';
  const matSel = document.createElement('select');
  for (const m of Object.values(MATERIALS)) {
    const o = document.createElement('option');
    o.value = m.name;
    o.textContent = m.name;
    if (m.name === MATERIALS[params.materialId]!.name) o.selected = true;
    matSel.append(o);
  }
  matSel.addEventListener('change', () => {
    const found = Object.entries(MATERIALS).find(([, m]) => m.name === matSel.value);
    if (found) params.materialId = found[0];
    onChange();
  });
  root.append(matLabel, matSel);

  const secLabel = document.createElement('div');
  secLabel.className = 'param-label';
  secLabel.textContent = 'Penampang';
  const secSel = document.createElement('select');
  for (const s of SECTION_PRESETS) {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.name;
    if (s.id === params.sectionId) o.selected = true;
    secSel.append(o);
  }
  secSel.addEventListener('change', () => {
    params.sectionId = secSel.value;
    onChange();
  });
  root.append(secLabel, secSel);

  // Blok hasil
  const results = document.createElement('div');
  results.className = 'result-block';
  root.append(results);

  // Blok Explain (hidden default)
  const explainBlock = document.createElement('div');
  explainBlock.className = 'result-block explain-block';
  explainBlock.style.display = 'none';
  const eh = document.createElement('h3');
  eh.textContent = 'Langkah perhitungan';
  const explainSteps = document.createElement('div');
  explainSteps.className = 'explain-steps';
  explainBlock.append(eh, explainSteps);
  root.append(explainBlock);

  const row = (label: string, value: string, cls = ''): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = 'result-row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'num' + (cls ? ' ' + cls : '');
    v.textContent = value;
    d.append(l, v);
    return d;
  };

  const showResults = (sol: BeamSolution): void => {
    results.replaceChildren(
      row('Reaksi Ra', fmtForce(sol.reactions.Ra)),
      sol.reactions.Rb !== 0 || params.support === 'ss' ? row('Reaksi Rb', fmtForce(sol.reactions.Rb)) : row('Momen jepit Ma', fmtMoment(sol.reactions.Ma)),
      row('M maks', fmtMoment(sol.maxMoment.value)),
      row('V maks', fmtForce(sol.maxShear.value)),
      row('δ maks', fmtLength(sol.maxDeflection.value)),
      row('σ lentur', fmtStress(sol.maxBendingStress)),
      row('Safety factor', sol.safetyFactor === Infinity ? '∞' : `${sol.safetyFactor.toPrecision(3)}`, sol.safetyFactor < 1.5 ? 'warn' : ''),
    );

    const sec = SECTION_PRESETS.find((s) => s.id === params.sectionId)!;
    const mat = MATERIALS[params.materialId]!;
    explainSteps.replaceChildren(
      step('1. EI = E·I', `EI = ${fmtStress(mat.elasticModulus)} × ${sec.props.Iy.toPrecision(4)} mm⁴ = ${(sol.EI / 1000).toPrecision(4)} kN·m²`),
      step('2. Reaksi', params.support === 'cantilever'
        ? `Kantilever: Ra = P = ${fmtForce(sol.reactions.Ra)}, Ma = −P·a = ${fmtMoment(sol.reactions.Ma)}`
        : `ΣM tentang A → Rb = P·a/L = ${fmtForce(sol.reactions.Rb)}; Ra = P − Rb = ${fmtForce(sol.reactions.Ra)}`),
      step('3. σ = M·c/I', `σ = ${fmtMoment(sol.maxMoment.value)} × ${fmtLength((sec.shape === 'circular' ? sec.dims.d : sec.dims.h) / 2000)} / ${sec.props.Iy.toPrecision(4)} mm⁴ = ${fmtStress(sol.maxBendingStress)}`),
      step('4. SF = fy/σ', `SF = ${fmtStress(mat.yieldStrength)} / ${fmtStress(sol.maxBendingStress)} = ${sol.safetyFactor === Infinity ? '∞' : sol.safetyFactor.toPrecision(3)}`),
    );
  };

  const setMode = (m: 'explore' | 'explain' | 'sim'): void => {
    modeSeg.select(m);
  };

  return { el: root, getParams: () => params, showResults, setMode };
}

function step(formula: string, detail: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'explain-step';
  const f = document.createElement('code');
  f.textContent = formula;
  const t = document.createElement('span');
  t.textContent = detail;
  d.append(f, t);
  return d;
}
