import type { Material } from '../structural/models/types';

// §9 — materials dengan sumber. E beton C30 = 4700√fc′ (SNI 2847) ≈ 25,7 GPa; prompt memakai 30 GPa (nilai desain umum).
export const MATERIALS: Readonly<Record<string, Material>> = {
  concreteC30: {
    name: 'Beton C30',
    elasticModulus: 30e9,
    density: 2400,
    poissonRatio: 0.2,
    yieldStrength: 30e6, // fc′ karakteristik
    thermalExpansion: 10e-6,
    color: 0x9e968c,
    source: 'SNI 2847:2019 (fc′ 30 MPa)',
  },
  steelS355: {
    name: 'Baja S355',
    elasticModulus: 200e9,
    density: 7850,
    poissonRatio: 0.3,
    yieldStrength: 355e6,
    thermalExpansion: 12e-6,
    color: 0x97a1ab,
    source: 'EN 10025-2',
  },
  timber: {
    name: 'Kayu Struktural',
    elasticModulus: 11e9,
    density: 500,
    poissonRatio: 0.3,
    yieldStrength: 25e6, // kuat lentur perkiraan kelas struktural
    thermalExpansion: 5e-6,
    color: 0xa8823f,
    source: 'SNI 7973:2013 (perkiraan kelas C)',
  },
};
