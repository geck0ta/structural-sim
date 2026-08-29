// §14 — ikon Lucide line icons, vanilla. SVG sprite di-load sekali, <use> per instance.
// ponytail: sprite statis dari unpkg; offline build bisa memindahkan ke assets lokal.

const SPRITE_URL = 'https://unpkg.com/lucide-static@latest/sprite.svg';

let spriteLoaded = false;

export async function ensureSprite(): Promise<void> {
  if (spriteLoaded) return;
  const res = await fetch(SPRITE_URL);
  if (!res.ok) throw new Error(`Gagal memuat ikon: ${res.status}`);
  const svg = new DOMParser().parseFromString(await res.text(), 'image/svg+xml');
  const holder = document.createElement('div');
  holder.hidden = true;
  holder.append(svg.documentElement);
  document.body.append(holder);
  spriteLoaded = true;
}

/** Buat elemen ikon lucide, stroke mengikuti currentColor. */
export function icon(name: string, size = 18): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'lucide-icon');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}
