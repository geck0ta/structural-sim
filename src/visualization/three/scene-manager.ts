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
  /** Drag beban 3D: proxy hit + callback x meter (main.ts pasang). null = fitur mati. */
  dragProbe: { object: THREE.Object3D; onDragStart: (x: number) => void; onDragMove: (x: number) => void; onDragEnd: () => void } | null = null;
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
  private sun!: THREE.Group;
  private moon!: THREE.Group;
  private stars!: THREE.Group;
  private clouds!: THREE.Group;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); // F12: export PNG perlu buffer tersimpan
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
    key.shadow.mapSize.set(1024, 1024);
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

  /** Tema: 'light' | 'dusk' (senja) | 'dark'. 3D match tema UI. */
  setTheme(mode: 'light' | 'dusk' | 'dark'): void {
    const dome = this.skyDome.material as THREE.ShaderMaterial;
    if (mode === 'light') {
      this.scene.background = new THREE.Color(0xdfe3ea);
      this.scene.fog = new THREE.Fog(0xdfe3ea, 40, 130);
      (this.ground.material as THREE.MeshStandardMaterial).color.set(0xdadfe6);
      this.grid.material.color.set(0xc3cad4);
      this.ambient.intensity = 0.55;
      this.keyLight.intensity = 2.8;
      this.fillLight.intensity = 0.8;
      (dome.uniforms.zenith.value as THREE.Color).set(0x2f6fd0);
      (dome.uniforms.horizon.value as THREE.Color).set(0xe8f1f8);
      (dome.uniforms.below.value as THREE.Color).set(0xdfe3ea);
    } else if (mode === 'dusk') {
      this.scene.background = new THREE.Color(0x1c1420);
      this.scene.fog = new THREE.Fog(0x241826, 40, 130);
      (this.ground.material as THREE.MeshStandardMaterial).color.set(0x1f1824);
      this.grid.material.color.set(0x3d2f42);
      this.ambient.intensity = 0.42;
      this.keyLight.intensity = 2.4; // matahari rendah, hangat
      this.keyLight.color.set(0xffc9a3);
      this.fillLight.intensity = 0.7;
      this.fillLight.color.set(0x6f7db8); // isian dingin lawas arah berlawanan
      (dome.uniforms.zenith.value as THREE.Color).set(0x241b38);
      (dome.uniforms.horizon.value as THREE.Color).set(0xd4713e);
      (dome.uniforms.below.value as THREE.Color).set(0x1c1420);
    } else {
      this.scene.background = new THREE.Color(0x0d0f12);
      this.scene.fog = new THREE.Fog(0x0d0f12, 40, 130);
      (this.ground.material as THREE.MeshStandardMaterial).color.set(0x14171b);
      this.grid.material.color.set(0x2a3038);
      this.ambient.intensity = 0.35;
      this.keyLight.intensity = 2.2;
      this.keyLight.color.set(0xffffff);
      this.fillLight.intensity = 0.6;
      this.fillLight.color.set(0xdfe8ff);
      (dome.uniforms.zenith.value as THREE.Color).set(0x05070d);
      (dome.uniforms.horizon.value as THREE.Color).set(0x1a2436);
      (dome.uniforms.below.value as THREE.Color).set(0x0d0f12);
    }
    this.sun.visible = mode === 'light';
    this.clouds.visible = mode !== 'dark';
    this.moon.visible = mode === 'dark';
    this.stars.visible = mode === 'dark';
    // Tint awan per tema — putih siang, jingga-ungu senja (satu tekstur dua suasana).
    const tint = mode === 'dusk' ? 0xf0a06a : 0xffffff;
    for (const sp of this.clouds.children) {
      (sp as THREE.Sprite).material.color.set(tint);
      (sp as THREE.Sprite).material.opacity = mode === 'dusk' ? 0.42 : 0.5;
    }
    if (mode === 'dusk') {
      // Matahari senja: rendah di horizon, di dalam frame kamera default (theta=0).
      this.sun.visible = true;
      this.sun.position.set(0.5, 0.1, -0.86).normalize().multiplyScalar(128);
      (this.sun.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.color.set(0xffb46b);
      this.sun.scale.setScalar(1.35);
    } else {
      this.sun.position.set(0.55, 0.5, -0.55).normalize().multiplyScalar(128);
      (this.sun.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.color.set(0xfff6dc);
      this.sun.scale.setScalar(1);
    }
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
    gm.transparent = true;
    gm.opacity = 0.45; // samar — lantai tak bersaing model (declutter 15)
    gm.needsUpdate = true;
    grid.position.y = 0.002;
    this.scene.add(grid);
    this.ground = ground;
    this.grid = grid;
  }

  /** Langit 3D: dome shader gradien + matahari/bulan sphere + glow + bintang Points + awan sprite. */
  private setupSky(): void {
    // Dome: gradien zenith→horizon via shader (krisp, tanpa banding tekstur 2D).
    const domeMat = new THREE.ShaderMaterial({
      uniforms: {
        zenith: { value: new THREE.Color(0x2f6fd0) },
        horizon: { value: new THREE.Color(0xe8f1f8) },
        below: { value: new THREE.Color(0xdfe3ea) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 zenith; uniform vec3 horizon; uniform vec3 below;
        varying vec3 vDir;
        void main(){
          float t = pow(max(vDir.y, 0.0), 0.45);
          vec3 col = mix(horizon, zenith, t);
          if (vDir.y < 0.0) col = below;
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), domeMat);
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);

    // Matahari (siang): sphere kecil + glow sprite — terasa 3D, bukan gambar blur.
    this.sun = new THREE.Group();
    const sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }),
    );
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('sun'), transparent: true, depthWrite: false, fog: false }));
    sunGlow.scale.set(46, 46, 1);
    this.sun.add(sunBall, sunGlow);
    this.sun.position.set(0.55, 0.5, -0.55).normalize().multiplyScalar(128);
    this.scene.add(this.sun);

    // Bulan (malam): sphere + glow bluish.
    this.moon = new THREE.Group();
    const moonBall = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xe6ecf8, fog: false }),
    );
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('moon'), transparent: true, depthWrite: false, fog: false }));
    moonGlow.scale.set(30, 30, 1);
    this.moon.add(moonBall, moonGlow);
    this.moon.position.set(-0.5, 0.62, 0.42).normalize().multiplyScalar(128);
    this.scene.add(this.moon);

    // Bintang: dua layer Points, jumlah DIKENDALIKAN — ambiance, bukan noise (declutter).
    this.stars = new THREE.Group();
    this.stars.add(makeStars(110, 1.6, 0xffffff, 0.55), makeStars(12, 2.6, 0xcfe0ff, 0.8));
    this.scene.add(this.stars);

    // Awan: kluster 5-6 sprite per bawan (paruh, flat, tampak volumetrik) — bukan kartu datar.
    // 'light' putih; senja di-tint jingga/ungu via material.color (satu tekstur, dua suasana).
    this.clouds = new THREE.Group();
    const cloudTex = glowTex('cloud');
    const cloudCluster = (cx: number, cy: number, cz: number, n: number, s: number): void => {
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false }),
        );
        // Paruh: tengah lebih tinggi & besar, tepi rendah — siluet bawan alami.
        const t = n === 1 ? 0.5 : i / (n - 1);
        sp.position.set(
          cx + (t - 0.5) * s * 2.1 + (Math.random() - 0.5) * 3,
          cy + Math.sin(t * Math.PI) * s * 0.32 + (Math.random() - 0.5) * 1.5,
          cz + (Math.random() - 0.5) * 6,
        );
        const sc = s * (0.55 + Math.sin(t * Math.PI) * 0.5 + Math.random() * 0.18);
        sp.scale.set(sc, sc * 0.36, 1);
        this.clouds.add(sp);
      }
    };
    // 3 bawan kecil di horizon — JANGAN besar, dan dalam frame kamera default (y rendah,
    // |x| ≤ ~55): 2 ruas viewport atas, tidak menutup model.
    cloudCluster(-48, 30, -70, 6, 10);
    cloudCluster(20, 34, -78, 5, 12);
    cloudCluster(56, 28, -60, 6, 9);
    this.scene.add(this.clouds);
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let draggingLoad = false;
    let lastX = 0;
    let lastY = 0;
    // Drag beban titik: hit-test panah beban saat pointerdown; jika kena → orbit skip,
    // pointermove dipetakan ke x meter via Raycaster (dipasang main.ts).
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const toNDC = (e: PointerEvent): void => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      if (this.dragProbe) {
        toNDC(e);
        ray.setFromCamera(ndc, this.camera);
        const hits = ray.intersectObject(this.dragProbe.object, true);
        if (hits.length > 0) {
          draggingLoad = true;
          this.dragProbe.onDragStart(hits[0]!.point.x);
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (draggingLoad && this.dragProbe) {
        toNDC(e);
        ray.setFromCamera(ndc, this.camera);
        // Bidang kerja z=0 (sumbu balok) — x hasil intersect = posisi beban.
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const hit = new THREE.Vector3();
        ray.ray.intersectPlane(plane, hit);
        if (hit) this.dragProbe.onDragMove(hit.x);
        return;
      }
      if (!dragging) {
        // Hover probe → kursor grab saat di atas panah beban.
        if (this.dragProbe) {
          toNDC(e);
          ray.setFromCamera(ndc, this.camera);
          const hover = ray.intersectObject(this.dragProbe.object, true).length > 0;
          canvas.style.cursor = hover ? 'grab' : '';
        }
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.orbit.theta.target -= dx * 0.005;
      this.orbit.phi.target = THREE.MathUtils.clamp(this.orbit.phi.target - dy * 0.005, 0.05, Math.PI / 2 - 0.02);
    });
    const end = (): void => {
      if (draggingLoad && this.dragProbe) this.dragProbe.onDragEnd();
      draggingLoad = false;
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

  /** Auto-fit view ke bounding model (§7) — radius LEBIH DEKAT: model isi ~40% viewport (declutter 9). */
  fitTo(radius: number, targetY = 1): void {
    this.orbit.radius.target = THREE.MathUtils.clamp(radius * 1.45, 3, 60);
    this.orbit.targetY.target = targetY;
    this.orbit.targetX.target = 0;
    // Reset view penuh: theta/phi kembali ke awal (spring, halus).
    this.orbit.theta.target = 0;
    this.orbit.phi.target = 1.1;
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
    // Awan drift lambat — wrap di batas dome.
    if (this.clouds.visible) {
      for (const c of this.clouds.children) {
        c.position.x += dt * 0.6;
        if (c.position.x > 110) c.position.x = -110;
      }
    }
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

/** Cache tekstur glow (matahari/bulan/awan) — dibuat sekali per varian. */
const glowCache = new Map<string, THREE.CanvasTexture>();

function glowTex(kind: 'sun' | 'moon' | 'cloud'): THREE.CanvasTexture {
  const hit = glowCache.get(kind);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = kind === 'cloud' ? 128 : 256;
  const ctx = c.getContext('2d')!;
  if (kind === 'cloud') {
    for (const [x, y, r] of [[70, 70, 46], [110, 56, 52], [150, 68, 44], [190, 74, 36], [40, 80, 30]] as const) {
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (kind === 'sun') {
    const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 124);
    g.addColorStop(0, 'rgba(255,250,225,0.95)');
    g.addColorStop(0.22, 'rgba(255,242,200,0.42)');
    g.addColorStop(0.55, 'rgba(255,238,190,0.12)');
    g.addColorStop(1, 'rgba(255,238,190,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  } else {
    const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 120);
    g.addColorStop(0, 'rgba(215,228,255,0.55)');
    g.addColorStop(0.35, 'rgba(200,216,250,0.18)');
    g.addColorStop(1, 'rgba(200,216,250,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowCache.set(kind, tex);
  return tex;
}

/** Bintang: THREE.Points di hemisphere atas — tajam (bukan tekstur blur). */
function makeStars(count: number, size: number, color: number, opacity: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const az = Math.random() * Math.PI * 2;
    const el = Math.asin(Math.random() * 0.94 + 0.06); // elevasi > 0
    const r = 132;
    pos[i * 3] = r * Math.cos(el) * Math.cos(az);
    pos[i * 3 + 1] = r * Math.sin(el);
    pos[i * 3 + 2] = r * Math.cos(el) * Math.sin(az);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({ size, sizeAttenuation: false, color, transparent: true, opacity, fog: false, depthWrite: false }),
  );
}
