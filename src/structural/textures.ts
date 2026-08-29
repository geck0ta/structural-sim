import * as THREE from 'three';
import type { Material } from '../structural/models/types';

// §6/§14 — tekstur prosedural (canvas 2D → CanvasTexture): kayu serat, beton abu.
// Baja polos metalik. Tanpa file eksternal; dipakai semua modul 3D.

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia — tekstur 3D gagal dibuat.');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Serat kayu: garis-garis gelombang cokelat + butiran gelap. */
function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#a8823f';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 46; i++) {
      const x = (i / 46) * s;
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(93,64,32,0.5)' : 'rgba(176,141,86,0.45)';
      ctx.lineWidth = 1 + Math.random() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 8; y < s; y += 8) {
        const wob = Math.sin(y * 0.05 + i * 1.7) * 3 + Math.sin(y * 0.013 + i) * 5;
        ctx.lineTo(x + wob, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(80,52,28,0.35)';
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 3 + Math.random() * 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Beton: abu + noise halus + lubang angin kecil. */
function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#9e968c';
    ctx.fillRect(0, 0, s, s);
    const img = ctx.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 14;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = 'rgba(60,58,54,0.25)';
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export interface MaterialTextures {
  readonly wood: THREE.CanvasTexture;
  readonly concrete: THREE.CanvasTexture;
  readonly halo: THREE.CanvasTexture;
}

export function buildTextures(): MaterialTextures {
  return { wood: woodTexture(), concrete: concreteTexture(), halo: glowHaloTexture() };
}

/** Halo radial putih untuk dot glow (sprite additive). */
export function glowHaloTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export function material3D(m: Material, tex: MaterialTextures): THREE.MeshStandardMaterial {
  if (m.name.includes('Kayu')) {
    return new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.8, metalness: 0 });
  }
  if (m.name.includes('Beton')) {
    return new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95, metalness: 0 });
  }
  return new THREE.MeshStandardMaterial({ color: 0x97a1ab, roughness: 0.45, metalness: 0.7 });
}
