// 덕목 섹션의 화이트 스튜디오: 밝은 배경 위에 오브젝트 하나씩 — 후처리 없이 선명하게.
// 근면(맞물린 톱니) → 정직(프리즘) → 겸손(고개 숙인 벼) → 봉사(등불)
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// 이가 달린 톱니 (가운데 살 구멍 포함)
function gear(teeth: number, module: number, depth: number) {
  const rp = (teeth * module) / 2, rt = rp + module, rr = rp - 1.25 * module;
  const span = (Math.PI * 2) / teeth;
  const sh = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const c = i * span;
    const pts: [number, number][] = [[c - span * 0.5, rr], [c - span * 0.28, rr], [c - span * 0.15, rt], [c + span * 0.15, rt], [c + span * 0.28, rr]];
    pts.forEach(([a, r], k) => (i === 0 && k === 0 ? sh.moveTo(Math.cos(a) * r, Math.sin(a) * r) : sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)));
  }
  sh.closePath();
  const hub = new THREE.Path();
  hub.absarc(0, 0, rp * 0.16, 0, Math.PI * 2, true);
  sh.holes.push(hub);
  const nh = 6;
  for (let i = 0; i < nh; i++) {
    const a = (i / nh) * Math.PI * 2, d = rp * 0.55;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * d, Math.sin(a) * d, rp * 0.2, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 4, curveSegments: 24 });
  g.translate(0, 0, -depth / 2);
  return { g, rp };
}

export class Studio {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private items: THREE.Group[] = [];
  private gears: { m: THREE.Mesh; ratio: number; phase: number }[] = [];
  private stems: THREE.Group[] = [];
  private lanterns: { g: THREE.Group; s: number; x: number; z: number }[] = [];
  private beamIn!: THREE.Mesh;
  private rays: THREE.Mesh[] = [];
  private p = 0;
  private time = 0;
  private last = performance.now();
  private raf = 0;
  private active = false;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;

    this.camera.position.set(0, 1.35, 8.2);
    this.camera.lookAt(0, 1.1, 0);

    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(3, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
    key.shadow.bias = -0.0003;
    this.scene.add(key, new THREE.HemisphereLight('#ffffff', '#c9ccd4', 0.6));
    // 바닥은 보이지 않고 그림자만 은은하게
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.buildGears();
    this.buildPrism();
    this.buildRice();
    this.buildLantern();
    this.items.forEach((g) => g.traverse((o) => ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material as THREE.Material).transparent ? (o.castShadow = true) : 0)));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  private add() {
    const g = new THREE.Group();
    this.scene.add(g);
    this.items.push(g);
    return g;
  }

  /* 근면 — 금빛과 흑연빛 톱니가 맞물려 돈다 */
  private buildGears() {
    const g = this.add();
    const gold = new THREE.MeshPhysicalMaterial({ color: '#c99a3b', metalness: 1, roughness: 0.26, clearcoat: 0.4 });
    const graphite = new THREE.MeshPhysicalMaterial({ color: '#30343c', metalness: 0.9, roughness: 0.32, clearcoat: 0.6 });
    const mod = 0.105;
    const a = gear(20, mod, 0.24), b = gear(12, mod, 0.24);
    const ma = new THREE.Mesh(a.g, gold), mb = new THREE.Mesh(b.g, graphite);
    ma.position.set(-0.42, 1.25, 0);
    mb.position.set(-0.42 + a.rp + b.rp, 1.25, 0.06);
    g.add(ma, mb);
    this.gears.push({ m: ma, ratio: 1, phase: 0 }, { m: mb, ratio: -20 / 12, phase: Math.PI / 12 });
  }

  /* 정직 — 흰빛이 유리 프리즘을 지나 일곱 빛깔로 펼쳐진다 */
  private buildPrism() {
    const g = this.add();
    const tri = new THREE.Shape([new THREE.Vector2(-0.85, 0), new THREE.Vector2(0.85, 0), new THREE.Vector2(0, 1.47)]);
    const prism = new THREE.Mesh(
      new THREE.ExtrudeGeometry(tri, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4 }).translate(0, 0, -0.45),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.04, transmission: 1, thickness: 1.2, ior: 1.5, clearcoat: 1, attenuationColor: new THREE.Color('#dfe9ff'), attenuationDistance: 3 })
    );
    prism.position.y = 0.05;
    // 흰 배경에서도 유리 윤곽이 읽히도록 가장자리에 가는 선
    prism.add(new THREE.LineSegments(new THREE.EdgesGeometry(prism.geometry, 30), new THREE.LineBasicMaterial({ color: '#b9bec8' })));
    g.add(prism);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#9aa3b2', transparent: true, opacity: 0.9 });
    this.beamIn = new THREE.Mesh(new THREE.BoxGeometry(1, 0.022, 0.022).translate(-0.5, 0, 0), beamMat);
    this.beamIn.position.set(-0.42, 0.75, 0);
    this.beamIn.rotation.z = -0.22;
    g.add(this.beamIn);
    ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#32ade6', '#007aff', '#af52de'].forEach((c, k) => {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.03).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 }));
      ray.position.set(0.4, 0.68, 0);
      ray.rotation.z = 0.08 - k * 0.055;
      g.add(ray);
      this.rays.push(ray);
    });
  }

  /* 겸손 — 익은 벼 이삭이 고개를 숙인다 */
  private buildRice() {
    const g = this.add();
    const stemMat = new THREE.MeshPhysicalMaterial({ color: '#b8923f', metalness: 0.35, roughness: 0.45 });
    const grainMat = new THREE.MeshPhysicalMaterial({ color: '#e2b65a', metalness: 0.5, roughness: 0.3, clearcoat: 0.5 });
    const grain = new THREE.SphereGeometry(1, 12, 8).scale(0.045, 0.085, 0.045);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.12, 48), new THREE.MeshPhysicalMaterial({ color: '#30343c', metalness: 0.8, roughness: 0.35 }));
    base.position.y = 0.06;
    g.add(base);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const stem = new THREE.Group();
      stem.position.set(Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08);
      stem.rotation.y = -a + (i % 2 ? 0.3 : -0.3);
      g.add(stem);
      // 줄기는 곧게 올라가다 끝에서 활처럼 휘어 내려온다
      const h = 1.7 + (i % 3) * 0.18;
      const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.08, h * 0.6, 0), new THREE.Vector3(0.35, h * 1.05, 0), new THREE.Vector3(0.75, h * 0.72, 0));
      stem.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.013, 6), stemMat));
      // 끝부분을 따라 낟알이 촘촘히 달린다
      const grains = new THREE.InstancedMesh(grain, grainMat, 22);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (let k = 0; k < 22; k++) {
        const u = 0.62 + (k / 22) * 0.38;
        const p = curve.getPoint(u), tng = curve.getTangent(u);
        const side = (k % 2 ? 1 : -1) * 0.035;
        p.add(new THREE.Vector3(0, 0, side));
        q.setFromUnitVectors(up, tng.clone().multiplyScalar(-1).add(new THREE.Vector3(0, -0.3, side * 6)).normalize());
        grains.setMatrixAt(k, m4.compose(p, q, new THREE.Vector3(1, 1, 1)));
      }
      stem.add(grains);
      this.stems.push(stem);
    }
  }

  /* 봉사 — 따뜻한 등불이 떠오른다 */
  private buildLantern() {
    const g = this.add();
    const paper = new THREE.MeshPhysicalMaterial({ color: '#ffb35c', emissive: '#ff8a2a', emissiveIntensity: 1.1, roughness: 0.6, metalness: 0, transmission: 0.2, thickness: 0.2 });
    const wood = new THREE.MeshPhysicalMaterial({ color: '#30343c', metalness: 0.7, roughness: 0.35 });
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      prof.push(new THREE.Vector2(0.18 + Math.sin(Math.PI * t) * 0.42, t * 1.1));
    }
    const mk = (s: number) => {
      const l = new THREE.Group();
      const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), paper);
      // 대나무 살
      for (let k = 1; k < 6; k++) {
        const t = k / 6, r = 0.18 + Math.sin(Math.PI * t) * 0.42;
        const rib = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.006, 6, 64), wood);
        rib.rotation.x = Math.PI / 2;
        rib.position.y = t * 1.1;
        l.add(rib);
      }
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 32), wood);
      top.position.y = 1.12;
      const bot = top.clone();
      bot.position.y = -0.02;
      l.add(body, top, bot);
      l.scale.setScalar(s);
      return l;
    };
    const main = mk(1);
    main.position.y = 0.55;
    const light = new THREE.PointLight('#ffa040', 6, 4, 2);
    light.position.y = 0.55;
    main.add(light);
    g.add(main);
    [[-1.3, -0.6, 0.38, 0.0], [1.2, -0.9, 0.32, 0.35], [-0.7, -1.6, 0.26, 0.65], [0.9, 0.5, 0.22, 0.85]].forEach(([x, z, s, o]) => {
      const l = mk(s);
      g.add(l);
      this.lanterns.push({ g: l, s: o, x, z });
    });
  }

  setActive(a: boolean) {
    this.active = a;
  }

  set(p: number) {
    this.p = p;
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 좁은 화면에선 뒤로 물러나 오브젝트가 잘리지 않게
    this.camera.position.z = w / h < 0.9 ? 15 : 8.2;
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;
    this.time += dt;
    const t = this.time;
    const q = this.p * 4;

    // 오브젝트마다 자기 구간 가운데서 가장 크게. 구간 끝에선 돌아서며 작아지고 아래로 가라앉는다
    this.items.forEach((g, k) => {
      const d = q - (k + 0.5);
      const w = 1 - smooth(0.3, 0.5, Math.abs(d));
      g.visible = w > 0.002;
      const e = w * w * (3 - 2 * w);
      g.scale.setScalar(0.6 + 0.4 * e);
      g.position.y = (1 - e) * (d > 0 ? 0.8 : -0.8);
      g.rotation.y = d * 1.4 + Math.sin(t * 0.4) * 0.12 - 0.35;
    });
    // 근면: 스크롤해도 돌고, 가만있어도 천천히 돈다
    const spin = t * 0.35 + q * 2.2;
    this.gears.forEach((gr) => (gr.m.rotation.z = gr.phase + spin * gr.ratio));
    // 정직: 빛이 차례로 뻗는다
    {
      const k = clamp01((q - 1) / 0.5);
      this.beamIn.scale.x = Math.max(1e-3, 3 * smooth(0, 0.45, k));
      this.rays.forEach((r, i) => (r.scale.x = Math.max(1e-3, 3.2 * smooth(0.4 + i * 0.05, 0.85 + i * 0.02, k))));
    }
    // 겸손: 구간에 들어서면 이삭이 더 깊이 숙이고, 바람에 살짝 흔들린다
    {
      const bow = smooth(2.1, 2.6, q);
      this.stems.forEach((s, i) => (s.rotation.z = -0.05 - bow * 0.22 + Math.sin(t * 1.1 + i) * 0.025));
    }
    // 봉사: 작은 등불들이 천천히 떠오른다
    this.lanterns.forEach((l) => {
      const u = (l.s + t * 0.05) % 1;
      l.g.position.set(l.x + Math.sin(t * 0.6 + l.s * 9) * 0.08, 0.3 + u * 3.4, l.z);
      l.g.visible = u < 0.95;
    });
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
  }
}
