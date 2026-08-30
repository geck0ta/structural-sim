import * as THREE from 'three';
import { SpringNumber } from '../animation/spring';

// §7 — SceneManager: satu renderer/scene/kamera/loop dipakai semua modul.
// Camera rig orbit + spring-damped inersia (feel trackpad Mac).

const DPR_MAX = 2;

export interface OrbitState {
  theta: SpringNumber;
  phi: SpringNumber;
  radius: SpringNumber;
  targetX: SpringNumber;
  targetY: SpringNumber;
}

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly orbit: OrbitState;
  private readonly clock = new THREE.Clock();
  private readonly subscribers = new Set<(dt: number) => void>();
  private running = false;
  private readonly scratchTarget = new THREE.Vector3();
  private ground!: THREE.Mesh;
  private grid!: THREE.GridHelper;
  private keyLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.35);
  private skyDome!: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_MAX));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0d0f12, 30, 90);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.orbit = {
      theta: new SpringNumber(0.9), // azimuth rad
      phi: new SpringNumber(1.05), // polar rad
      radius: new SpringNumber(12),
      targetX: new SpringNumber(0),
      targetY: new SpringNumber(1.5),
    };

    this.setupLights();
    this.setupGround();
    this.setupSky();
    this.bindPointer(canvas);
    this.bindVisibility();
  }

  private setupLights(): void {
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(6, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = key.shadow.camera.bottom = -15;
    key.shadow.camera.right = key.shadow.camera.top = 15;
    this.scene.add(key);
    this.scene.add(this.ambient);
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
    fill.position.set(-8, 6, -4);
    this.scene.add(fill);
    this.keyLight = key;
    this.fillLight = fill;
  }

  /** Tema terang: latar/grid/fog lebih terang (3D match tema UI). */
  setTheme(light: boolean): void {
    if (light) {
      this.scene.background = new THREE.Color(0xdfe3ea);
      this.scene.fog = new THREE.Fog(0xdfe3ea, 40, 130);
      (this.ground.material as THREE.MeshStandardMaterial).color.set(0xdadfe6);
      this.grid.material.color.set(0xc3cad4);
      this.ambient.intensity = 0.55;
      this.keyLight.intensity = 2.8;
      this.fillLight.intensity = 0.8;
    } else {
      this.scene.background = new THREE.Color(0x0d0f12);
      this.scene.fog = new THREE.Fog(0x0d0f12, 40, 130);
      (this.ground.material as THREE.MeshStandardMaterial).color.set(0x14171b);
      this.grid.material.color.set(0x2a3038);
      this.ambient.intensity = 0.35;
      this.keyLight.intensity = 2.2;
      this.fillLight.intensity = 0.6;
    }
    this.setSky(!light);
  }

  private setupGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(200, 100, 0x2a3038, 0x1d2126);
    // GridHelper membakar warna ke vertex — matikan agar material.color bisa diganti tema.
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.vertexColors = false;
    gm.needsUpdate = true;
    grid.position.y = 0.002;
    this.scene.add(grid);
    this.ground = ground;
    this.grid = grid;
  }

  /** Langit: dome gradien (prosedural, canvas). Tema terang = siang cerah, gelap = malam berbintang. */
  private setupSky(): void {
    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(150, 24, 16),
      new THREE.MeshBasicMaterial({
        map: skyTexture(false),
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);
  }

  /** Ganti tekstur langit saat tema berganti. */
  setSky(night: boolean): void {
    const mat = this.skyDome.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.map = skyTexture(night);
    mat.needsUpdate = true;
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.orbit.theta.target -= dx * 0.005;
      this.orbit.phi.target = THREE.MathUtils.clamp(this.orbit.phi.target - dy * 0.005, 0.05, Math.PI / 2 - 0.02);
    });
    const end = (): void => {
      dragging = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.orbit.radius.target = THREE.MathUtils.clamp(this.orbit.radius.target * Math.exp(e.deltaY * 0.001), 1.5, 80);
      },
      { passive: false },
    );
  }

  /** Auto-fit view ke bounding model (§7) — dipanggil saat modul berganti / model berubah. */
  fitTo(radius: number, targetY = 1): void {
    this.orbit.radius.target = THREE.MathUtils.clamp(radius * 2.2, 3, 60);
    this.orbit.targetY.target = targetY;
    this.orbit.targetX.target = 0;
  }

  private bindVisibility(): void {
    // §13 — pause rAF saat tab hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else if (this.subscribers.size > 0) this.start();
    });
  }

  onFrame(fn: (dt: number) => void): () => void {
    this.subscribers.add(fn);
    this.start();
    return () => {
      this.subscribers.delete(fn);
      if (this.subscribers.size === 0) this.stop();
    };
  }

  private start(): void {
    if (this.running || document.hidden) return;
    this.running = true;
    this.clock.getDelta();
    const loop = (): void => {
      if (!this.running) return;
      const dt = this.clock.getDelta();
      this.stepOrbit(dt);
      for (const fn of this.subscribers) fn(dt);
      this.updateCamera();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private stop(): void {
    this.running = false;
  }

  private stepOrbit(dt: number): void {
    for (const s of Object.values(this.orbit)) s.step(dt);
  }

  private updateCamera(): void {
    const { theta, phi, radius, targetX, targetY } = this.orbit;
    this.scratchTarget.set(targetX.value, targetY.value, 0);
    this.camera.position.set(
      targetX.value + radius.value * Math.sin(phi.value) * Math.sin(theta.value),
      targetY.value + radius.value * Math.cos(phi.value),
      radius.value * Math.sin(phi.value) * Math.cos(theta.value),
    );
    this.camera.lookAt(this.scratchTarget);
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** §7 — dispose benar saat scene dibongkar. */
  static disposeObject(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}

/** Cache tekstur langit prosedural — dua varian (siang/malam), dibuat sekali. */
const skyCache = new Map<string, THREE.CanvasTexture>();

/**
 * Tekstur langit procedural: gradien vertikal + glow benda langit + awan (siang) / bintang (malam).
 * 1024×1024, wrap horizontal. Dipakai dome BackSide.
 */
function skyTexture(night: boolean): THREE.CanvasTexture {
  const key = night ? 'night' : 'day';
  const hit = skyCache.get(key);
  if (hit) return hit;
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const horizonY = S * 0.62; // horizon di ~62% tinggi (dome: bawah = tanah blur)
  // Gradien vertikal langit
  const g = ctx.createLinearGradient(0, 0, 0, S);
  if (night) {
    g.addColorStop(0, '#05070d');
    g.addColorStop(0.45, '#0b1120');
    g.addColorStop(0.62, '#101a2e');
    g.addColorStop(0.72, '#1a2436');
    g.addColorStop(1, '#0d0f12');
  } else {
    g.addColorStop(0, '#2f6fd0');
    g.addColorStop(0.4, '#5b9be5');
    g.addColorStop(0.62, '#a8cff0');
    g.addColorStop(0.72, '#e8f1f8');
    g.addColorStop(1, '#dfe3ea');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  if (night) {
    // Bintang: titik putih acak, padat ke atas, sebagian berkelip (statis di tekstur)
    for (let i = 0; i < 340; i++) {
      const x = Math.random() * S;
      const y = Math.random() * horizonY * 0.92;
      const r = Math.random();
      if (r > 0.97) continue;
      const size = r > 0.9 ? 1.6 : r > 0.7 ? 1.1 : 0.7;
      ctx.globalAlpha = 0.35 + Math.random() * 0.65;
      ctx.fillStyle = Math.random() > 0.85 ? '#cfe0ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Bulan + glow
    const mx = S * 0.74;
    const my = S * 0.16;
    const glow = ctx.createRadialGradient(mx, my, 4, mx, my, 110);
    glow.addColorStop(0, 'rgba(230,238,255,0.5)');
    glow.addColorStop(0.4, 'rgba(200,215,245,0.14)');
    glow.addColorStop(1, 'rgba(200,215,245,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 120, my - 120, 240, 240);
    ctx.fillStyle = '#e8edf7';
    ctx.beginPath();
    ctx.arc(mx, my, 26, 0, Math.PI * 2);
    ctx.fill();
    // kawah samar
    ctx.fillStyle = 'rgba(190,200,220,0.5)';
    for (const [dx, dy, r] of [[-8, -5, 5], [7, 4, 4], [2, 9, 3], [-5, 8, 2.5]] as const) {
      ctx.beginPath();
      ctx.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Matahari glow lembut
    const sx = S * 0.7;
    const sy = S * 0.18;
    const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 170);
    glow.addColorStop(0, 'rgba(255,252,235,0.95)');
    glow.addColorStop(0.25, 'rgba(255,246,214,0.35)');
    glow.addColorStop(1, 'rgba(255,246,214,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 180, sy - 180, 360, 360);
    // Awan kumulus lembut: elips putih bertumpuk, samar
    const cloud = (cx: number, cy: number, w: number, alpha: number): void => {
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      const blobs = 7;
      for (let i = 0; i < blobs; i++) {
        const bx = cx + (i - blobs / 2) * (w / blobs) + (Math.random() - 0.5) * w * 0.1;
        const by = cy + Math.sin(i * 1.3 + cx) * w * 0.05;
        const br = w * (0.16 + Math.random() * 0.12);
        ctx.beginPath();
        ctx.ellipse(bx, by, br * 1.5, br, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    cloud(S * 0.22, S * 0.3, 260, 0.75);
    cloud(S * 0.52, S * 0.42, 330, 0.55);
    cloud(S * 0.86, S * 0.35, 230, 0.65);
    cloud(S * 0.1, S * 0.5, 300, 0.4);
    cloud(S * 0.68, S * 0.54, 280, 0.35);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  skyCache.set(key, tex);
  return tex;
}
