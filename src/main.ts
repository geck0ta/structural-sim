import './style.css';

// ponytail: scaffold shell — diganti routing modul di PHASE 3.
const nav = document.querySelector<HTMLDivElement>('.modules');
const modules = [
  'Mekanika Struktur',
  'Matematika',
  'FEM',
  'Gempa / Dinamika',
  'Beban Lingkungan',
  'Model 3D',
];
if (nav) {
  for (const name of modules) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = name;
    nav.append(btn);
  }
}

const viewport = document.querySelector<HTMLElement>('#viewport');
if (viewport) viewport.textContent = 'Viewport — menunggu implementasi modul.';
