// 캠퍼스 카드 속 3D 조감도: 처음엔 바로 위에서 내려다본 평면 지도(2D)였다가,
// 스크롤하면 카메라가 비스듬히 기울고 건물이 땅에서 솟아오른다(3D).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type CampusRaw = { uni: number[]; b: number[][]; r: number[][]; g: number[][]; w: number[][] };

const S = 1 / 100; // 1 단위 = 100 m
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const inside = (ring: number[], x: number, z: number) => {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
// 지도 좌표(x 동쪽, z 남쪽)의 닫힌 다각형 → 바닥에 눕힐 Shape (Shape의 y = -z, 눕히면 다시 z)
const shapeOf = (f: number[], from = 0) => {
  const sh = new THREE.Shape();
  for (let i = from; i < f.length; i += 2) {
    const x = f[i] * S, y = -f[i + 1] * S;
    i === from ? sh.moveTo(x, y) : sh.lineTo(x, y);
  }
  return sh;
};

export class Campus3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
  private blds: THREE.Mesh;
  private bldMat: THREE.MeshStandardMaterial;
  private roads: THREE.LineSegments;
  private roadN: number;
  private border: THREE.Line;
  private borderN: number;
  private flats: THREE.Mesh[] = [];
  private center = new THREE.Vector3();
  private extent = 1;
  private p = 0;
  private active = false;
  private time = 0;
  private last = performance.now();
  private raf = 0;
  private ro: ResizeObserver;
  private mouse = 0;

  constructor(private canvas: HTMLCanvasElement, d: CampusRaw) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight('#cfe0ff', '#0b0e14', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(-4, 9, 6);
    this.scene.add(sun);

    // 화면에 담을 범위: 캠퍼스 경계 + 여백
    const xs = d.uni.filter((_, i) => i % 2 === 0), zs = d.uni.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    this.center.set(((x0 + x1) / 2) * S, 0, ((z0 + z1) / 2) * S);
    this.extent = (Math.max(x1 - x0, z1 - z0) / 2 + 110) * S;
    const R = this.extent * 1.5;
    const near = (x: number, z: number) => Math.hypot(x * S - this.center.x, z * S - this.center.z) < R;

    // 바닥: 캠퍼스 땅 · 녹지
    const flat = (geos: THREE.BufferGeometry[], color: string, y: number, op: number) => {
      if (!geos.length) return;
      const m = new THREE.Mesh(mergeGeometries(geos.map((g) => g.rotateX(-Math.PI / 2))), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
      m.position.y = y;
      m.userData.op = op;
      this.scene.add(m);
      this.flats.push(m);
    };
    flat([new THREE.ShapeGeometry(shapeOf(d.uni))], '#2997ff', 0.002, 0.1);
    flat(d.g.filter((g) => near(g[0], g[1])).map((g) => new THREE.ShapeGeometry(shapeOf(g))), '#30d158', 0.003, 0.12);

    // 도로: 캠퍼스 가운데에서 바깥으로 차례로 그려지도록 정렬
    const segs: { d: number; v: number[]; c: number }[] = [];
    d.r.forEach(([w, ...p]) => {
      const k = [0.16, 0.24, 0.34][w];
      for (let i = 0; i + 3 < p.length; i += 2) {
        if (!near(p[i], p[i + 1])) continue;
        const mx = ((p[i] + p[i + 2]) / 2) * S, mz = ((p[i + 1] + p[i + 3]) / 2) * S;
        segs.push({ d: Math.hypot(mx - this.center.x, mz - this.center.z), v: [p[i] * S, 0.005, p[i + 1] * S, p[i + 2] * S, 0.005, p[i + 3] * S], c: k });
      }
    });
    segs.sort((a, b) => a.d - b.d);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(segs.flatMap((s) => s.v), 3));
    rg.setAttribute('color', new THREE.Float32BufferAttribute(segs.flatMap((s) => [s.c, s.c, s.c, s.c, s.c, s.c]), 3));
    this.roads = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.roadN = segs.length * 2;
    this.scene.add(this.roads);

    // 캠퍼스 경계선
    const bp: number[] = [];
    for (let i = 0; i < d.uni.length; i += 2) bp.push(d.uni[i] * S, 0.01, d.uni[i + 1] * S);
    bp.push(bp[0], bp[1], bp[2]);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    this.border = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: '#2997ff' }));
    this.borderN = bp.length / 3;
    this.scene.add(this.border);

    // 건물: 실제 윤곽을 높이만큼 세운다 (조감도에서 잘 보이게 1.6배). 캠퍼스 안은 한양 블루, 밖은 짙은 회색
    const geos: THREE.BufferGeometry[] = [];
    const wall = new THREE.Color(), roof = new THREE.Color();
    d.b.forEach(([h, ...p]) => {
      let cx = 0, cz = 0;
      for (let i = 0; i < p.length; i += 2) (cx += p[i]), (cz += p[i + 1]);
      cx /= p.length / 2;
      cz /= p.length / 2;
      if (!near(cx, cz)) return;
      const inn = inside(d.uni, cx, cz);
      const g = new THREE.ExtrudeGeometry(shapeOf(p), { depth: Math.max(3, h) * S * 1.6, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.deleteAttribute('uv');
      wall.set(inn ? '#1f6fe0' : '#262a32');
      roof.set(inn ? '#5fa8ff' : '#3a3f4a');
      const n = g.attributes.normal, col = new Float32Array(n.count * 3);
      for (let i = 0; i < n.count; i++) (n.getY(i) > 0.5 ? roof : wall).toArray(col, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    });
    this.bldMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.55, transparent: true, opacity: 0 });
    this.blds = new THREE.Mesh(mergeGeometries(geos), this.bldMat);
    this.scene.add(this.blds);

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse = (e.clientX - r.left) / r.width - 0.5;
    });
    canvas.addEventListener('pointerleave', () => (this.mouse = 0));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  set(p: number, active: boolean) {
    this.p = p;
    this.active = active;
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;
    this.time += dt;
    const p = this.p;
    // 1) 평면 지도: 도로·경계선이 그려지고 건물 윤곽이 납작하게 채워진다
    const draw = smooth(0.02, 0.3, p);
    this.roads.geometry.setDrawRange(0, Math.floor((this.roadN * draw) / 2) * 2);
    this.border.geometry.setDrawRange(0, Math.max(2, Math.floor(this.borderN * draw)));
    this.bldMat.opacity = smooth(0.18, 0.34, p);
    this.bldMat.transparent = this.bldMat.opacity < 1;
    this.flats.forEach((m) => ((m.material as THREE.MeshBasicMaterial).opacity = m.userData.op * smooth(0.15, 0.35, p)));
    // 2) 3D: 카메라가 기울고 건물이 솟는다
    const tilt = smooth(0.38, 0.72, p);
    const rise = smooth(0.46, 0.8, p);
    this.blds.scale.y = Math.max(0.002, rise * (rise * (3 - 2 * rise)));
    // 카메라: 바로 위(위가 북쪽) → 남쪽에서 비스듬히 내려다보는 조감도, 그 뒤엔 천천히 돈다
    const fit = this.extent / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.min(1, this.camera.aspect);
    const elev = THREE.MathUtils.lerp(Math.PI / 2 - 0.001, 0.62, tilt);
    const az = -0.5 * tilt + Math.sin(this.time * 0.12) * 0.12 * tilt + this.mouse * 0.35 * tilt;
    const dist = fit * THREE.MathUtils.lerp(1.02, 0.95, tilt);
    const c = this.center;
    this.camera.position.set(c.x + Math.cos(elev) * Math.sin(az) * dist, Math.sin(elev) * dist, c.z + Math.cos(elev) * Math.cos(az) * dist);
    this.camera.up.set(0, tilt > 0.02 ? 1 : 0, tilt > 0.02 ? 0 : -1);
    this.camera.lookAt(c.x, 0, c.z + 0.08 * this.extent * tilt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
  }
}
