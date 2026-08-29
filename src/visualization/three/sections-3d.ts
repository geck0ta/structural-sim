import * as THREE from 'three';
import type { Section } from '../../structural/models/types';

// §6/§7 — profil penampang asli tereksrusi: beam terlihat sebagai balok H sungguhan.
// Shape 2D dibangun sekali (Shape cache) lalu ExtrudeGeometry; dibuang pemiliknya.

export function sectionShape(section: Section): THREE.Shape {
  const s = (mm: number): number => mm / 1000; // mm → m
  switch (section.shape) {
    case 'rect': {
      const { b, h } = section.dims;
      const w = new THREE.Shape();
      w.moveTo(-s(b / 2), -s(h / 2));
      w.lineTo(s(b / 2), -s(h / 2));
      w.lineTo(s(b / 2), s(h / 2));
      w.lineTo(-s(b / 2), s(h / 2));
      w.closePath();
      return w;
    }
    case 'circular': {
      return new THREE.Shape().absarc(0, 0, s(section.dims.d / 2), 0, Math.PI * 2, false);
    }
    case 'i': {
      const { h, b, tw, tf } = section.dims;
      // profil I: 12 titik keliling, CCW dari kiri-bawah flange bawah
      const pts: [number, number][] = [
        [-s(b / 2), -s(h / 2)],
        [s(b / 2), -s(h / 2)],
        [s(b / 2), -s(h / 2 - tf)],
        [s(tw / 2), -s(h / 2 - tf)],
        [s(tw / 2), s(h / 2 - tf)],
        [s(b / 2), s(h / 2 - tf)],
        [s(b / 2), s(h / 2)],
        [-s(b / 2), s(h / 2)],
        [-s(b / 2), s(h / 2 - tf)],
        [-s(tw / 2), s(h / 2 - tf)],
        [-s(tw / 2), -s(h / 2 - tf)],
        [-s(b / 2), -s(h / 2 - tf)],
      ];
      const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      return shape;
    }
  }
}

/** Balok tereksrusi dari node A ke node B sepanjang sumbu X (beam level 2/3). */
export function extrudedBeam(section: Section, lengthM: number, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(sectionShape(section), {
    depth: lengthM,
    bevelEnabled: false,
    steps: 1,
    // step density mengikuti deformasi — cukup 1, kurva dilakukan via bend skinned? ponytail: PHASE 3 ganti TubeGeometry/segment-mesh agar lentur
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function materialForColor(color: number, metalness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness });
}
