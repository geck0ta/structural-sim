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
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
    fill.position.set(-8, 6, -4);
    this.scene.add(fill);
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
    grid.position.y = 0.002;
    this.scene.add(grid);
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
