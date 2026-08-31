// MATH-1 — Label kanvas untuk ribbon 3D Matematika (dipakai juga modul lain).
// Di-engineer dari TextSprite beam-3d: sprite kanvas, redraw hanya saat teks berubah.

import * as THREE from 'three';

const FONT = '600 38px -apple-system, Inter, system-ui, sans-serif';
const PAD = 24;

export class CanvasLabel {
  readonly sprite: THREE.Sprite;
  private readonly c: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private last = '';
  constructor(private readonly height = 0.4) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    this.c = c;
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
    ctx.font = FONT;
    // Kanvas selebar teks — pixel aspect seragam: scale.x = (w/64)·h, scale.y = h.
    // (Bug lama: kanvas diam 512px, scale dari w/64 → glyph ter-squash & ukuran
    // berubah-ubah mengikuti panjang teks.)
    const w = Math.ceil(ctx.measureText(text).width) + PAD;
    if (this.c.width !== w) {
      this.c.width = w; // resize mereset ctx — font wajib diset ulang
      ctx.font = FONT;
    }
    ctx.clearRect(0, 0, w, 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(text, w / 2, 33);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, 33);
    this.tex.needsUpdate = true;
    this.sprite.scale.set((w / 64) * this.height, this.height, 1);
  }
}
