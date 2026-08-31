// §9 — data model. Besaran SI (m, N, Pa, s). Section props basis mm (konvensi tabel baja).

export interface Material {
  readonly name: string;
  readonly elasticModulus: number; // Pa
  readonly density: number; // kg/m³
  readonly poissonRatio: number;
  readonly yieldStrength: number; // Pa (beton: fc′)
  readonly thermalExpansion: number; // 1/K
  readonly color: number; // hex warna 3D
  readonly source: string;
}

export interface RectDims {
  readonly b: number; // mm
  readonly h: number; // mm
}
export interface IDims {
  readonly h: number; // mm
  readonly b: number; // mm
  readonly tw: number; // web mm
  readonly tf: number; // flange mm
}
export interface CircularDims {
  readonly d: number; // mm
  readonly t?: number; // ketebalan dinding mm — ada = hollow (CHS), tidak = rod solid
}

export interface SectionProps {
  readonly A: number; // mm²
  readonly Iy: number; // mm⁴ (strong axis)
  readonly Iz: number; // mm⁴
  readonly J: number; // mm⁴ (torsi)
  readonly Sy: number; // mm³
  readonly Sz: number; // mm³
  readonly ry: number; // mm
  readonly rz: number; // mm
}

export type Section =
  | { readonly id: string; readonly name: string; readonly shape: 'rect'; readonly dims: RectDims; readonly props: SectionProps }
  | { readonly id: string; readonly name: string; readonly shape: 'i'; readonly dims: IDims; readonly props: SectionProps }
  | { readonly id: string; readonly name: string; readonly shape: 'circular'; readonly dims: CircularDims; readonly props: SectionProps };

export type SectionShape = Section['shape'];

export interface BoundaryCondition {
  readonly fixed: readonly ('x' | 'y' | 'z' | 'rx' | 'ry' | 'rz')[];
}

export interface Node {
  readonly id: string;
  x: number; // m
  y: number; // m
  z: number; // m
  bc?: BoundaryCondition;
}

export interface Load {
  readonly type: 'point' | 'udl' | 'moment' | 'thermal';
  readonly value: number; // N (udl: N/m; moment: N·m; thermal: K)
  readonly dir: 'x' | 'y' | 'z';
  readonly at?: number; // posisi sepanjang elemen (m) untuk point/moment
}

export interface Element {
  readonly id: string;
  readonly startNode: string;
  readonly endNode: string;
  readonly materialId: string;
  readonly sectionId: string;
  readonly loads: readonly Load[];
}

export interface StructuralModel {
  readonly id: string;
  readonly nodes: readonly Node[];
  readonly elements: readonly Element[];
  readonly materials: Readonly<Record<string, Material>>;
  readonly sections: Readonly<Record<string, Section>>;
}

// §15 — CalcTrace: dibawa engine untuk mode Explain, bukan teks hardcoded di UI.
export interface CalcStep {
  readonly formula: string;
  readonly substitution: string;
  readonly result: string;
  readonly unit: string;
}
export interface CalcTrace {
  readonly steps: readonly CalcStep[];
}

/** Diisi bertahap per fase (§19) — PHASE 2 menambah displacements/forces. */
export interface AnalysisResult {
  readonly trace?: CalcTrace;
}

export interface SimulationState {
  readonly model: StructuralModel | null;
  readonly time: number; // s — physical time §13, terpisah dari render frame
}
