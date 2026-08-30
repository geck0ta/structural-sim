// MATH-1 — Label kanvas untuk ribbon 3D Matematika (dipakai juga modul lain).
// Di-engineer dari TextSprite beam-3d: sprite kanvas, redraw hanya saat teks berubah.

import * as THREE from 'three';

const NS_W = 512;

export class CanvasLabel {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private last = '';
  constructor(private readonly height = 0.26) {
    const c = document.createElement('canvas');
    c.width = NS_W;
    c.height = 64;
    this.ctx = c.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.renderOrder = 20;
    this.sprite.visible = false;
  }
  set(text: string, color = '#f5f5f7'): void {
    const key = `${text}|${color}`;
    if (key === this.last) return;
    this.last = key;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, NS_W, 64);
    ctx.font = '600 38px -apple-system, Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText(text, NS_W / 2, 32);
    ctx.fillStyle = color;
    ctx.fillText(text, NS_W / 2, 32);
    this.tex.needsUpdate = true;
    const w = Math.max(ctx.measureText(text).width + 28, 60);
    this.sprite.scale.set((w / 64) * this.height, this.height, 1);
  }
}
