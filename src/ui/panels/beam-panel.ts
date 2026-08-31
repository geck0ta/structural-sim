import { MATERIALS } from '../../data/materials';
import { SECTION_PRESETS } from '../../structural/models/section';
import { fmtForce, fmtMoment, fmtLength, fmtStress, fmtSci } from '../../core/units';
import type { BeamSolution } from '../../structural/beam/beam-solver';
import { IOSSlider } from '../glass/slider';
import { SegmentedControl } from '../glass/segmented';
import { IOSPicker } from '../glass/picker';
import { icon } from '../glass/icons';

// §17 — panel Lab Balok. Panel DUMB: tak berhitung, hanya menampilkan.
// State dimiliki main.ts; panel emit perubahan lewat callback onChange.

export interface BeamParams {
  span: number;
  loadP: number;
  /** Beban merata w (N/m) — terpisah dari loadP agar satuan kN/m jujur. */
  loadW: number;
  loadAt: number;
  materialId: string;
  sectionId: string;
  support: 'cantilever' | 'ss';
  loadType: 'point' | 'udl';
  /** Kasus preset aktif — sinkron dengan loadType/support agar judul tak konflik. */
  presetId: 'cantilever' | 'bridge' | 'udl';
  deformScale: number;
}

export interface BeamPanel {
  readonly el: HTMLDivElement;
  readonly getParams: () => BeamParams;
  readonly showResults: (sol: BeamSolution) => void;
  readonly setMode: (m: 'explore' | 'explain') => void;
  readonly mathRow: HTMLDivElement;
}

export function buildBeamPanel(
  params: BeamParams,
  onChange: () => void,
): BeamPanel {
  const root = document.createElement('div');
  // Polos: tanpa judul/caption — inspector bicara lewat section, bukan heading.
  // Preset kasus umum → satu picker "Contoh kasus" (declutter: bukan 3 chip wrap)
  const onChipClick: Array<() => void> = [];
  const presets = [
    { id: 'cantilever', label: 'Kantilever — beban titik di ujung', apply: (): void => { params.support = 'cantilever'; params.span = 6; params.loadP = 20e3; params.loadAt = 6; params.loadType = 'point'; params.presetId = 'cantilever'; } },
    { id: 'bridge', label: 'Jembatan SS — beban titik di tengah', apply: (): void => { params.support = 'ss'; params.span = 8; params.loadP = 30e3; params.loadAt = 4; params.loadType = 'point'; params.presetId = 'bridge'; } },
    { id: 'udl', label: 'Beban merata sepanjang bentang', apply: (): void => { params.support = 'ss'; params.span = 8; params.loadW = 15e3; params.loadType = 'udl'; params.presetId = 'udl'; } },
  ];
  const presetPicker = new IOSPicker(
    presets.map((p) => ({ id: p.id, label: p.label })),
    params.presetId ?? 'cantilever',
    (id) => {
      const p = presets.find((x) => x.id === id)!;
      // D19: skeleton singkat saat ganti kasus — feedback transisi (300ms).
      results.replaceChildren();
      for (let i = 0; i < 3; i++) {
        const sk = document.createElement('div');
        sk.className = 'skeleton';
        sk.style.width = `${72 - i * 14}%`;
        results.append(sk);
      }
      p.apply();
      if (params.support === 'cantilever') params.loadAt = params.span;
      for (const f of onChipClick) f();
      onChange();
    },
    'Contoh kasus',
  );
  root.append(presetPicker.el);

  // Section inspector: judul micro 10px + isi. Struktur, bukan dekorasi.
  const section = (title: string): HTMLDivElement => {
    const s = document.createElement('div');
    s.className = 'insp-sec';
    const t = document.createElement('div');
    t.className = 'insp-sec-t';
    t.textContent = title;
    s.append(t);
    return s;
  };

  // Section GEOMETRI
  const secGeo = section('GEOMETRI');

  const modeSeg = new SegmentedControl(
    [
      { value: 'explore', label: 'Explore' },
      { value: 'explain', label: 'Explain' },
    ],
    'explore',
    (v) => {
      explainBlock.style.display = v === 'explain' ? 'block' : 'none';
      results.style.display = v === 'explain' ? 'none' : 'block';
    },
  );
  // Satu baris mode: Explore/Explain kiri + toggle ribbon kanan (declutter)
  const modeRow = document.createElement('div');
  modeRow.className = 'mode-row';
  // Row opsional — diisi main.ts (toggle ribbon Matematika).
  const mathRow = document.createElement('div');
  mathRow.className = 'math-row';
  modeRow.append(modeSeg.el, mathRow);
  root.append(modeRow);

  // P9: divider hanya sebelum blok hasil — spacing murni untuk sisanya.

  const sliderRow = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (v: number) => void,
    fmt: (v: number) => string,
  ): { row: HTMLDivElement; slider: IOSSlider } => {
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
    return { row, slider };
  };

  let posSlider: { row: HTMLDivElement; slider: IOSSlider } | null = null;
  const spanRow = sliderRow('Panjang bentang L', 2, 10, 0.1, () => params.span, (v) => {
    params.span = v;
    params.loadAt = Math.min(params.loadAt, v);
    if (posSlider) posSlider.slider.setRange(0.5, v, params.loadAt);
  }, fmtLength);
  const loadRow = sliderRow('Beban P', 0, 100, 1, () => params.loadP / 1000, (v) => { params.loadP = v * 1000; }, (v) => fmtForce(v * 1000));
  // Beban merata dalam kN/m — satuan keilmuan jujur (gaya per panjang), input N/m internal.
  const loadWRow = sliderRow('Beban merata w', 0, 40, 0.5, () => params.loadW / 1000, (v) => { params.loadW = v * 1000; }, (v) => `${v.toFixed(1)} kN/m`);
  posSlider = sliderRow('Posisi beban a', 0.5, params.span, 0.1, () => params.loadAt, (v) => { params.loadAt = v; }, fmtLength);
  // §7: skala deformasi ×N — user override terhadap auto-scale (default ×1.0).
  const deformRow = sliderRow('Skala deformasi', 1, 5, 0.5, () => params.deformScale, (v) => { params.deformScale = v; }, (v) => `×${v.toFixed(1)}`);

  // Susun ke section: GEOMETRI / BEBAN / TAMPILAN / TUMPUAN / MATERIAL (diisi saat kontrol dibuat)
  const secLoad = section('BEBAN');
  const secDisp = section('TAMPILAN');
  const secSup = section('TUMPUAN');
  const secMat = section('MATERIAL & PENAMPANG');

  // Sinkron seluruh kontrol UI ke state params (dipakai preset chip & restore).
  const syncAll = (): void => {
    spanRow.slider.set(params.span, false);
    loadRow.slider.set(params.loadP / 1000, false);
    loadWRow.slider.set(params.loadW / 1000, false);
    if (posSlider) posSlider.slider.setRange(0.5, params.span, params.loadAt);
    spanRow.row.querySelector('.val')!.textContent = fmtLength(params.span);
    loadRow.row.querySelector('.val')!.textContent = fmtForce(params.loadP);
    loadWRow.row.querySelector('.val')!.textContent = `${(params.loadW / 1000).toFixed(1)} kN/m`;
    supSeg.select(params.support);
    loadTypeSeg.select(params.loadType ?? 'point');
    applyLoadType(params.loadType ?? 'point');
  };
  onChipClick.push(syncAll);

  // Tipe beban: titik / merata — sembunyikan "posisi beban" saat merata
  const loadTypeLabel = document.createElement('div');
  loadTypeLabel.className = 'param-label';
  loadTypeLabel.textContent = 'Tipe beban';
  const applyLoadType = (v: 'point' | 'udl'): void => {
    params.loadType = v;
    loadRow.row.style.display = v === 'point' ? '' : 'none';
    loadWRow.row.style.display = v === 'udl' ? '' : 'none';
    posSlider.row.style.display = v === 'point' ? '' : 'none';
  };
  const loadTypeSeg = new SegmentedControl(
    [
      { value: 'point', label: 'Titik' },
      { value: 'udl', label: 'Merata' },
    ],
    params.loadType ?? 'point',
    (v) => {
      applyLoadType(v);
      onChange();
    },
  );
  if ((params.loadType ?? 'point') === 'udl') applyLoadType('udl');
  secLoad.append(loadTypeLabel, loadTypeSeg.el, loadRow.row, loadWRow.row, posSlider!.row);
  secDisp.append(deformRow.row);

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
  secSup.append(supLabel, supSeg.el);

  // Material & penampang — 2 picker sejajar (P8), label cukup sebagai title sheet (P3)
  const matPicker = new IOSPicker(
    Object.entries(MATERIALS).map(([id, m]) => ({ id, label: m.name })),
    params.materialId,
    (id) => {
      params.materialId = id;
      onChange();
    },
    'Pilih material',
  );
  const secPicker = new IOSPicker(
    SECTION_PRESETS.map((s) => ({ id: s.id, label: s.name })),
    params.sectionId,
    (id) => {
      params.sectionId = id;
      onChange();
    },
    'Pilih penampang',
  );
  const pickGrid = document.createElement('div');
  pickGrid.className = 'pick-grid';
  pickGrid.append(matPicker.el, secPicker.el);
  secGeo.append(spanRow.row);
  secMat.append(pickGrid);
  root.append(secGeo, secLoad, secDisp, secSup, secMat);

  // Replay dihapus dari panel (keputusan redesign) — Space tetap jalan dari main.ts.

  // Blok hasil (skeleton shimmer sampai solve pertama selesai) — satu border-top dari .result-block.
  const results = document.createElement('div');
  results.className = 'result-block';
  for (let i = 0; i < 3; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton';
    sk.style.width = `${72 - i * 14}%`;
    results.append(sk);
  }
  root.append(results);

  // Blok Explain (hidden default). P1: langkah = accordion default TUTUP; P2: asumsi collapse.
  const explainBlock = document.createElement('div');
  explainBlock.className = 'result-block explain-block';
  explainBlock.style.display = 'none';
  const eh = document.createElement('button');
  eh.type = 'button';
  eh.className = 'accordion-h';
  eh.setAttribute('aria-expanded', 'false');
  eh.append(icon('chevron-down', 13), Object.assign(document.createElement('span'), { textContent: 'Langkah perhitungan' }));
  const explainSteps = document.createElement('div');
  explainSteps.className = 'explain-steps';
  explainSteps.style.display = 'none'; // P1: accordion tutup — kontrol murni via style (hidden attr nyangkut)
  eh.addEventListener('click', () => {
    const open = explainSteps.style.display === 'none';
    explainSteps.style.display = open ? '' : 'none';
    eh.setAttribute('aria-expanded', String(open));
    eh.classList.toggle('open', open);
  });
  // Asumsi analisis — daftar bernomor, redaksi teknis ringkas.
  const assumBtn = document.createElement('button');
  assumBtn.type = 'button';
  assumBtn.className = 'accordion-h assum';
  assumBtn.setAttribute('aria-expanded', 'false');
  assumBtn.append(icon('chevron-down', 12), Object.assign(document.createElement('span'), { textContent: 'ASUMSI' }));
  const assumDetail = document.createElement('ol');
  assumDetail.className = 'caption assum-list';
  assumDetail.style.display = 'none';
  const asumsi = [
    'Material bekerja linier elastis mengikuti hukum Hooke.',
    'Perhitungan mengabaikan efek orde kedua (P-Δ) dan deformasi geser.',
    'Defleksi jauh lebih kecil daripada dimensi bentang (teori Euler-Bernoulli).',
    'Distorsi penampang diabaikan; bidang datar tetap datar setelah pembebanan.',
    'Hubungan balok-tumpuan dianggap kaku; tidak ada selip atau penurunan tumpuan.',
  ];
  asumsi.forEach((a) => {
    const li = document.createElement('li');
    li.textContent = a;
    assumDetail.append(li);
  });
  assumBtn.addEventListener('click', () => {
    const open = assumDetail.style.display === 'none';
    assumDetail.style.display = open ? '' : 'none';
    assumBtn.setAttribute('aria-expanded', String(open));
    assumBtn.classList.toggle('open', open);
  });
  explainBlock.append(eh, explainSteps, assumBtn, assumDetail);
  root.append(explainBlock);

  // §11: disclaimer tunggal (satu baris kecil, bukan kartu)
  const disclaimer = document.createElement('p');
  disclaimer.className = 'disclaimer';
  disclaimer.textContent = 'Simulasi edukasi — bukan pengganti desain & verifikasi teknik sipil profesional.';
  root.append(disclaimer);

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
    // Slider posisi beban ikut saat drag langsung di 3D (nilai + handle).
    if (posSlider) {
      posSlider.slider.set(params.loadAt, false);
      const vEl = posSlider.row.querySelector('.val');
      if (vEl) vEl.textContent = fmtLength(params.loadAt);
    }
    // P6: 2 headline sejajar grid — tinggi blok turun. P7: D/C jadi suffix baris SF.
    const headline = (label: string, value: string, warn = false): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = 'headline';
      const l = document.createElement('span');
      l.className = 'headline-label';
      // Label "σ lentur" → σ<sub>lentur</sub>; "δ maks" → δ<sub>maks</sub> (satu gaya).
      l.innerHTML = label.replace(/^(.+?) (.+)$/, '$1<sub>$2</sub>');
      const v = document.createElement('span');
      v.className = 'big-num' + (warn ? ' warn' : '');
      v.textContent = value;
      d.append(l, v);
      return d;
    };
    const grid = document.createElement('div');
    grid.className = 'headline-grid';
    // Lendutan: arah sebagai panah (↓), bukan minus — antarmuka lebih bersih.
    const defl = sol.maxDeflection.value;
    grid.append(
      headline('δ maks', `${defl < 0 ? '↓ ' : '↑ '}${fmtLength(Math.abs(defl))}`),
      headline('σ lentur', fmtStress(sol.maxBendingStress), sol.maxBendingStress > MATERIALS[params.materialId]!.yieldStrength),
    );
    const dc = sol.safetyFactor === Infinity ? '' : ` · D/C ${(1 / sol.safetyFactor).toPrecision(3)}${1 / sol.safetyFactor > 1 ? ' — LEBIH' : ''}`;
    results.replaceChildren(
      grid,
      row('Reaksi Ra', fmtForce(sol.reactions.Ra)),
      sol.reactions.Rb !== 0 || params.support === 'ss' ? row('Reaksi Rb', fmtForce(sol.reactions.Rb)) : row('Momen jepit Ma', fmtMoment(sol.reactions.Ma)),
      row('M maks', fmtMoment(sol.maxMoment.value)),
      row('V maks', fmtForce(sol.maxShear.value)),
      row('Energi regangan U', sol.strainEnergy > 0 ? `${(sol.strainEnergy).toPrecision(3)} J` : '0 J'), // F6
      row(`Safety factor${dc}`, sol.safetyFactor === Infinity ? '∞' : `${sol.safetyFactor.toPrecision(3)}`, sol.safetyFactor < 1.5 ? 'warn' : ''),
    );

    const sec = SECTION_PRESETS.find((s) => s.id === params.sectionId)!;
    const mat = MATERIALS[params.materialId]!;
    explainSteps.replaceChildren(
      step('1. EI = E·I', `EI = ${fmtStress(mat.elasticModulus)} × ${(sec.props.Iy / 1e6).toPrecision(4)}×10⁶ mm⁴ = ${(sol.EI / 1000).toPrecision(4)} kN·m²`),
      step('2. Reaksi', params.support === 'cantilever'
        ? `Kantilever: Ra = P = ${fmtForce(sol.reactions.Ra)}; Ma = P·a = ${fmtMoment(sol.reactions.Ma)}`
        : `ΣM tentang A: Rb = P·a/L = ${fmtForce(sol.reactions.Rb)}; Ra = P − Rb = ${fmtForce(sol.reactions.Ra)}`),
      step('3. σ = M·c/I', `σ = ${fmtMoment(sol.maxMoment.value)} × ${fmtLength((sec.shape === 'circular' ? sec.dims.d : sec.dims.h) / 2000)} / ${(sec.props.Iy / 1e6).toPrecision(4)}×10⁶ mm⁴ = ${fmtStress(sol.maxBendingStress)}`),
      step('4. SF = fy/σ', `SF = ${fmtStress(mat.yieldStrength)} / ${fmtStress(sol.maxBendingStress)} = ${sol.safetyFactor === Infinity ? '∞' : sol.safetyFactor.toPrecision(3)}`),
      step('5. Keseimbangan', `ΣV = ${fmtSci(sol.equilibrium.sumV)} N; ΣM = ${fmtSci(sol.equilibrium.sumM)} N·m → ${sol.equilibrium.ok ? 'SETIMBANG ✓' : 'CEK ULANG'}`), // F5
    );
  };

  const setMode = (m: 'explore' | 'explain'): void => {
    modeSeg.select(m);
  };

  return { el: root, getParams: () => params, showResults, setMode, mathRow };
}

function step(formula: string, detail: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'explain-step';
  // P15: rumus+substitusi satu baris monospace — ringkas, tak bertumpuk.
  const f = document.createElement('code');
  f.textContent = `${formula}  —  ${detail}`;
  d.append(f);
  return d;
}
