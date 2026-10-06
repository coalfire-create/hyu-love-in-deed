// 연표 무대: 시대마다 한양의 건물이 바뀐다.
// 1939 동아공과학원 교사(재현) → 1959 서울캠퍼스 본관 → 1979 ERICA 본관 → 2026 한양종합기술연구원(HIT)
// 1959·1979·2026은 OpenStreetMap의 실제 건물 윤곽을 세운 것. 옛 건물은 위에서부터 해체되고, 새 건물은 아래에서부터 층층이 지어진다.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import eras from '../assets/eras.json';

const S = 1 / 16; // 1 단위 = 16 m — 모든 시대를 같은 축척으로: 건물이 커지는 것 자체가 이야기
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// 한 층 · 한 칸의 입면 텍스처 (반복해서 벽 전체를 덮는다)
function facade(kind: 'brick' | 'stone' | 'concrete' | 'glass') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const P = {
    brick: { wall: '#8a4a36', win: '#1d2a3a', frame: '#e8dccb', lit: '#ffd38a' },
    stone: { wall: '#d9d2c3', win: '#22344d', frame: '#f2ede2', lit: '#ffe2a8' },
    concrete: { wall: '#c9ccd2', win: '#1f2f45', frame: '#e6e8ec', lit: '#ffe9bf' },
    glass: { wall: '#2a5f9e', win: '#3f86d6', frame: '#c8d6ea', lit: '#bfe3ff' },
  }[kind];
  g.fillStyle = P.wall;
  g.fillRect(0, 0, 256, 256);
  if (kind === 'brick') {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < 256; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
      for (let x = (y / 16) % 2 ? 0 : 16; x < 256; x += 32) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 16);
        g.stroke();
      }
    }
  }
  if (kind === 'glass') {
    // 커튼월: 층마다 가로 띠, 가는 세로 멀리언
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5aa0ee');
    gr.addColorStop(1, '#1d4f8f');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = P.frame;
    g.fillRect(0, 226, 256, 30);
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 6, 256);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(20, 10, 30, 200);
  } else {
    const lit = Math.random() < 0.35;
    g.fillStyle = P.frame;
    g.fillRect(52, 48, 152, 150);
    g.fillStyle = lit ? P.lit : P.win;
    g.fillRect(62, 58, 132, 130);
    g.fillStyle = P.frame;
    g.fillRect(124, 58, 8, 130);
    g.fillRect(62, 118, 132, 6);
    if (kind === 'stone') {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(0, 230, 256, 26);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

interface Era {
  g: THREE.Group;
  plane: THREE.Plane;
  h: number; // 높이 (단위)
  r: number; // 평면 반지름 (카메라 거리용)
  scan: THREE.LineLoop;
  wire: THREE.LineSegments; // 지어지기 전에 먼저 그려지는 설계도
  outline: THREE.Vector3[];
  prev: number; // 지난 프레임의 지어진 정도 (완공 순간을 잡는다)
  pos: THREE.Vector3; // 무대 위 자리
}

// 시대별 건물 자리: 서울(왼쪽)에 1939 → 1959 본관이 서고, 1979엔 오른쪽에 ERICA가 생기고, 2026엔 서울에 HIT가 더해진다
const SPOTS = [new THREE.Vector3(-2.6, 0, 0.4), new THREE.Vector3(-2.6, 0, 0.4), new THREE.Vector3(3.6, 0, -0.4), new THREE.Vector3(-3.4, 0, -6.4)];

export class Eras3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private eras: Era[] = [];
  private glow: THREE.Mesh;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private city!: THREE.InstancedMesh;
  private cityData: { x: number; z: number; w: number; d: number; h: number[]; }[] = [];
  private debris!: THREE.Points;
  private dv: { v: THREE.Vector3; life: number }[] = [];
  private wave!: THREE.Mesh;
  private waveT = 9;
  private wavePos = new THREE.Vector3();
  private bridge!: THREE.Mesh;
  private bridgeCurve!: THREE.QuadraticBezierCurve3;
  private bridgeDots!: THREE.Points;
  private tags: THREE.Mesh[] = [];
  private camPos = new THREE.Vector3(3, 4, 9);
  private camTgt = new THREE.Vector3(0, 0.5, 0);
  private center = new THREE.Vector3(-2.6, 0, 0.4);
  private ext = 2;
  private build = [1, 0, 0, 0];
  private focus = 0;
  private color = new THREE.Color('#7fb2ff');
  private active = false;
  private last = performance.now();
  private time = 0;
  private raf = 0;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    const sun = (this.sun = new THREE.DirectionalLight('#fff3e0', 2.4));
    sun.position.set(-6, 10, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -13;
    sun.shadow.camera.right = sun.shadow.camera.top = 13;
    this.hemi = new THREE.HemisphereLight('#bcd4ff', '#0a0e16', 0.6);
    this.scene.add(sun, sun.target, this.hemi);

    // 바닥: 은은한 원판 + 시대 색으로 번지는 빛
    const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 96), new THREE.ShadowMaterial({ opacity: 0.55 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.003;
    const grid = new THREE.PolarGridHelper(15, 24, 12, 96, '#1c2a44', '#121c2e');
    grid.position.y = 0.004;
    this.scene.add(ground, this.glow, grid);

    // 주변 동네: 시대가 지날수록 낮은 집들 → 빌딩 숲으로 자란다 (높이는 시대별로 따로)
    {
      const N = 150;
      const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      this.city = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#2a3446', metalness: 0.3, roughness: 0.6 }), N);
      this.city.castShadow = this.city.receiveShadow = true;
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < N; i++) {
        let x = 0, z = 0;
        // 건물 자리와 다리 아래는 비워 둔다
        for (let tries = 0; tries < 40; tries++) {
          x = (rnd() - 0.5) * 22;
          z = (rnd() - 0.5) * 18;
          const clear = SPOTS.every((sp, si) => Math.hypot(x - sp.x, z - sp.z) > [2.2, 3.2, 3.4, 4.6][si]) && !(Math.abs(z) < 1.4 && x > -1 && x < 1.6);
          if (clear) break;
        }
        const w = 0.25 + rnd() * 0.45, d = 0.25 + rnd() * 0.45;
        // 1939엔 드문드문 낮은 집, 1959·1979엔 늘어나고, 2026엔 높은 빌딩이 선다
        const k = rnd();
        const h = [k < 0.25 ? 0.12 + rnd() * 0.1 : 0, k < 0.55 ? 0.2 + rnd() * 0.25 : 0, k < 0.8 ? 0.3 + rnd() * 0.5 : 0, 0.35 + Math.pow(rnd(), 2) * 1.8];
        this.cityData.push({ x, z, w, d, h });
      }
      this.scene.add(this.city);
    }
    // 해체되는 건물에서 흩날리는 파편
    {
      const n = 900;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-99), 3).setUsage(THREE.DynamicDrawUsage));
      this.debris = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.06, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.debris.frustumCulled = false;
      this.dv = Array.from({ length: n }, () => ({ v: new THREE.Vector3(), life: 0 }));
      this.scene.add(this.debris);
    }
    // 완공 순간 바닥에 퍼지는 빛의 충격파
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 128), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.wave.rotation.x = -Math.PI / 2;
    this.wave.position.y = 0.01;
    this.scene.add(this.wave);
    // 두 캠퍼스를 잇는 빛의 다리 (1979부터)
    this.bridgeCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-2.6, 0.4, 0.4), new THREE.Vector3(0.5, 4.2, 0), new THREE.Vector3(3.6, 0.4, -0.4));
    this.bridge = new THREE.Mesh(new THREE.TubeGeometry(this.bridgeCurve, 80, 0.018, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const bd = new THREE.BufferGeometry();
    bd.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.bridgeDots = new THREE.Points(bd, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.bridgeDots.frustumCulled = false;
    this.scene.add(this.bridge, this.bridgeDots);
    // 바닥에 새긴 캠퍼스 이름
    [['SEOUL', -2.6, 2.6], ['ERICA', 3.6, 2.2]].forEach(([t, x, z]) => {
      const c2 = document.createElement('canvas');
      c2.width = 512;
      c2.height = 128;
      const g2 = c2.getContext('2d')!;
      g2.fillStyle = '#ffffff';
      g2.font = '700 92px "Space Grotesk", sans-serif';
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      g2.fillText(t as string, 256, 68);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x as number, 0.012, z as number);
      this.scene.add(m);
      this.tags.push(m);
    });

    const E = eras as Record<string, { pts: number[][]; levels: string | null }>;
    // 1939 — 2층 벽돌 교사, 모임지붕, 가운데 현관 (당시 사진 자료가 없어 그 시대 학교 건물을 재현)
    this.add(this.schoolhouse());
    this.add(this.fromFootprint(E['1959'].pts, 4, 'stone', '#e8e2d4', 0.9));
    this.add(this.fromFootprint(E['1979'].pts, 5, 'concrete', '#d7dae0', 0.7));
    this.add(this.fromFootprint(E['2026'].pts, Number(E['2026'].levels) || 6, 'glass', '#cfd8e6', 0.5));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  private add(b: { g: THREE.Group; h: number; r: number; outline: THREE.Vector3[] }) {
    const pos = SPOTS[this.eras.length];
    b.g.position.copy(pos);
    b.outline = b.outline.map((v) => v.clone().add(pos));
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    b.g.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((mm) => {
        mm.clippingPlanes = [plane];
        mm.clipShadows = true;
      });
      o.castShadow = o.receiveShadow = true;
    });
    // 지어지는 높이를 따라 오르내리는 빛의 윤곽선
    const lg = new THREE.BufferGeometry().setFromPoints(b.outline);
    const scan = new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
    // 설계도: 건물의 모든 모서리를 빛나는 선으로
    const segs: number[] = [];
    b.g.updateMatrixWorld(true);
    b.g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const eg = new THREE.EdgesGeometry(m.geometry, 25).applyMatrix4(m.matrixWorld);
      segs.push(...(eg.attributes.position.array as Float32Array));
    });
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    const wire = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#7fb2ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(b.g, scan, wire);
    this.eras.push({ g: b.g, plane, h: b.h, r: b.r, scan, wire, outline: b.outline, prev: 1, pos });
  }

  private wallMat(kind: 'brick' | 'stone' | 'concrete' | 'glass', bay: number, floor: number) {
    const t = facade(kind);
    t.repeat.set(1 / bay, 1 / floor);
    return kind === 'glass'
      ? new THREE.MeshPhysicalMaterial({ map: t, metalness: 0.6, roughness: 0.08, clearcoat: 1, envMapIntensity: 1.6 })
      : new THREE.MeshStandardMaterial({ map: t, metalness: 0.05, roughness: 0.75 });
  }

  // 실제 건물 윤곽(미터)을 층수만큼 세운다
  private fromFootprint(pts: number[][], levels: number, kind: 'stone' | 'concrete' | 'glass', roof: string, parapet: number) {
    const FLOOR = 3.8;
    const H = levels * FLOOR;
    const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ color: roof, roughness: 0.8 }), this.wallMat(kind, 3.4, FLOOR)]);
    body.scale.setScalar(S);
    g.add(body);
    // 옥상 난간
    const par = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: parapet, bevelEnabled: false }).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: roof, roughness: 0.7 }));
    par.scale.setScalar(S * 1.0);
    par.position.y = H * S;
    par.scale.set(S * 1.01, S, S * 1.01);
    g.add(par);
    const r = Math.max(...pts.map(([x, z]) => Math.hypot(x, z))) * S;
    const outline = pts.map(([x, z]) => new THREE.Vector3(x * S, 0, z * S));
    return { g, h: (H + parapet) * S, r, outline };
  }

  private schoolhouse() {
    const g = new THREE.Group();
    const W = 36, D = 12, H = 8;
    const wall = this.wallMat('brick', 3.6, 4);
    // 박스 UV는 면마다 0~1이라 미터 단위로 반복하도록 면 크기에 맞춘다
    const box = new THREE.BoxGeometry(W, H, D);
    const uv = box.attributes.uv as THREE.BufferAttribute, nrm = box.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const sx = Math.abs(nrm.getX(i)) > 0.5 ? D : W;
      uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * H);
    }
    const body = new THREE.Mesh(box, wall);
    body.position.y = H / 2;
    // 모임지붕 (네 모 원뿔을 늘려서)
    // 네모 원뿔을 먼저 45° 돌려 변이 축과 나란하게 한 뒤 늘린다 (늘린 다음 돌리면 마름모가 된다)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT2, 1, 4, 1).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: '#3b4048', roughness: 0.7 }));
    roof.scale.set(W / 2 + 0.8, 4.2, D / 2 + 0.8);
    roof.position.y = H + 2.1;
    // 가운데 현관 (돌출)
    const porch = new THREE.Mesh(new THREE.BoxGeometry(7, 9.6, 3.2), new THREE.MeshStandardMaterial({ color: '#e8dccb', roughness: 0.7 }));
    porch.position.set(0, 4.8, D / 2 + 1.4);
    const ped = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 3, 1), new THREE.MeshStandardMaterial({ color: '#3b4048', roughness: 0.7 }));
    ped.rotation.set(Math.PI / 2, 0, 0);
    ped.scale.set(4.6, 3.4, 2.2);
    ped.position.set(0, 10.4, D / 2 + 1.4);
    const inner = new THREE.Group();
    inner.add(body, roof, porch, ped);
    inner.scale.setScalar(S);
    g.add(inner);
    const outline = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([x, z]) => new THREE.Vector3(x * S, 0, z * S));
    return { g, h: 12.5 * S, r: Math.hypot(W / 2, D / 2) * S, outline };
  }

  // 잘리는 높이의 윤곽선 위 아무 데서나 파편을 뿜는다
  private emit(e: Era, y: number, n: number) {
    const dp = this.debris.geometry.attributes.position as THREE.BufferAttribute;
    let made = 0;
    for (let k = 0; k < this.dv.length && made < n; k++) {
      const p = this.dv[k];
      if (p.life > 0) continue;
      const i = Math.floor(Math.random() * e.outline.length);
      const a = e.outline[i], b = e.outline[(i + 1) % e.outline.length];
      const q = a.clone().lerp(b, Math.random());
      dp.setXYZ(k, q.x, y, q.z);
      const out = new THREE.Vector3(q.x, 0, q.z).normalize();
      p.v.set(out.x * (0.5 + Math.random()), 1.2 + Math.random() * 1.8, out.z * (0.5 + Math.random()));
      p.life = 0.8 + Math.random() * 0.9;
      made++;
    }
  }

  /** build: 시대별 지어진 정도(0~1), focus: 카메라가 볼 시대(소수 허용), color: 시대 색 */
  set(build: number[], focus: number, color: string, active: boolean) {
    this.build = build;
    this.focus = focus;
    this.color.set(color);
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
    const t = this.time;
    const fi = Math.min(3, Math.floor(this.focus)), ff = this.focus - fi;
    const swing = Math.sin(Math.PI * ff); // 시대가 넘어가는 한가운데서 1
    const dpos = this.debris.geometry.attributes.position as THREE.BufferAttribute;
    let spawn = 0;
    this.eras.forEach((e, i) => {
      const b = this.build[i];
      e.g.visible = b > 0.002;
      // 잘라내는 높이 = 지어진 높이. 짓는 중엔 그 높이에 빛의 윤곽선이 떠 있다
      const y = b * (e.h + 0.02);
      e.plane.constant = y;
      e.scan.visible = b > 0.01 && b < 0.99;
      e.scan.position.y = y;
      const lm = e.scan.material as THREE.LineBasicMaterial;
      lm.color.copy(this.color).multiplyScalar(2);
      lm.opacity = Math.sin(Math.PI * b);
      // 설계도: 다음 시대로 넘어가기 시작하면 먼저 빛의 선으로 그려지고, 다 지어지면 사라진다
      const coming = i === fi + 1 ? smooth(0.02, 0.35, ff) : 0;
      const wm = e.wire.material as THREE.LineBasicMaterial;
      wm.color.copy(this.color).multiplyScalar(1.8);
      wm.opacity = Math.max(coming, b > 0.01 && b < 0.99 ? 1 : 0) * (1 - smooth(0.92, 1, b)) * 0.75;
      e.wire.visible = wm.opacity > 0.01;
      // 해체 중(지어진 정도가 줄어드는 중)이면 잘리는 높이에서 파편이 흩날린다
      if (b < e.prev - 1e-4 && b > 0.005) spawn = Math.max(spawn, 1), this.emit(e, y, 22);
      // 완공 순간: 충격파
      if (e.prev < 0.985 && b >= 0.985) (this.waveT = 0), this.wavePos.copy(e.pos);
      e.prev = b;
    });
    void spawn;
    // 파편: 위로 튀었다가 흩어지며 사라진다
    this.dv.forEach((p, k) => {
      if (p.life <= 0) return;
      p.life -= dt;
      p.v.y -= dt * 1.2;
      p.v.multiplyScalar(1 - dt * 0.6);
      dpos.setXYZ(k, dpos.getX(k) + p.v.x * dt, dpos.getY(k) + p.v.y * dt, dpos.getZ(k) + p.v.z * dt);
      if (p.life <= 0) dpos.setXYZ(k, 0, -99, 0);
    });
    dpos.needsUpdate = true;
    (this.debris.material as THREE.PointsMaterial).color.copy(this.color).multiplyScalar(1.5);
    // 충격파
    this.waveT += dt;
    {
      const k = clamp01(this.waveT / 1.6);
      this.wave.position.set(this.wavePos.x, 0.01, this.wavePos.z);
      this.wave.scale.setScalar(0.5 + k * 9);
      const wm = this.wave.material as THREE.MeshBasicMaterial;
      wm.opacity = (1 - k) * 0.9 * (this.waveT < 1.6 ? 1 : 0);
      wm.color.copy(this.color).multiplyScalar(1.6);
    }
    // 동네가 시대를 따라 자란다
    {
      const m4 = new THREE.Matrix4();
      this.cityData.forEach((c, k) => {
        const h0 = c.h[fi], h1 = c.h[Math.min(3, fi + 1)];
        const g = smooth(0.35 + (k % 7) * 0.05, 0.75 + (k % 7) * 0.03, ff);
        const h = Math.max(0.001, THREE.MathUtils.lerp(h0, h1, g));
        m4.makeScale(c.w, h, c.d).setPosition(c.x, 0, c.z);
        this.city.setMatrixAt(k, m4);
      });
      this.city.instanceMatrix.needsUpdate = true;
    }
    // 타임랩스: 시대가 넘어가는 동안 해가 하늘을 한 바퀴 돈다 — 그림자가 쓸고 지나가고, 한가운데는 노을빛
    {
      const sa = -0.9 + this.focus * Math.PI * 2;
      this.sun.position.set(Math.cos(sa) * 9, 6 + 5 * Math.cos(Math.PI * ff * 2) * 0.5 + 2, Math.sin(sa) * 9);
      this.sun.intensity = 2.4 - 1.4 * swing;
      this.sun.color.set('#fff3e0').lerp(new THREE.Color('#ff9a52'), swing);
      this.hemi.intensity = 0.6 - 0.25 * swing;
    }
    (this.glow.material as THREE.MeshBasicMaterial).color.copy(this.color).multiplyScalar(0.22 + 0.25 * swing);
    // 빛의 다리: ERICA가 지어지는 만큼 이어진다
    {
      const k = this.build[2];
      (this.bridge.material as THREE.MeshBasicMaterial).opacity = smooth(0.2, 0.9, k) * 0.8;
      (this.bridge.material as THREE.MeshBasicMaterial).color.copy(this.color).multiplyScalar(1.4);
      const bp = this.bridgeDots.geometry.attributes.position as THREE.BufferAttribute;
      const q = new THREE.Vector3();
      for (let n = 0; n < bp.count; n++) {
        this.bridgeCurve.getPoint((t * 0.15 + n / bp.count) % 1, q);
        bp.setXYZ(n, q.x, q.y, q.z);
      }
      bp.needsUpdate = true;
      (this.bridgeDots.material as THREE.PointsMaterial).opacity = smooth(0.5, 1, k);
      (this.tags[0].material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(this.build[0], this.build[1]);
      (this.tags[1].material as THREE.MeshBasicMaterial).opacity = 0.55 * k;
    }
    // 카메라: 지금 서 있는(또는 지어지는) 건물들을 모두 담도록 물러나고, 넘어가는 동안 크게 돌며 위로 솟는다
    const c = new THREE.Vector3();
    let wsum = 0, h = 0;
    this.eras.forEach((e, i) => {
      const w = Math.max(this.build[i], i === fi + 1 ? smooth(0, 0.3, ff) : 0);
      c.addScaledVector(e.pos, w);
      wsum += w;
      h = Math.max(h, e.h * w);
    });
    c.multiplyScalar(1 / Math.max(wsum, 1e-3));
    let ext = 0;
    this.eras.forEach((e, i) => {
      const w = Math.max(this.build[i], i === fi + 1 ? smooth(0, 0.3, ff) : 0);
      if (w > 0.05) ext = Math.max(ext, e.pos.distanceTo(c) + e.r);
    });
    this.center.lerp(c, 1 - Math.exp(-dt * 2));
    this.ext += (ext - this.ext) * (1 - Math.exp(-dt * 2));
    const dist = Math.max(6, this.ext * 2.5 + h * 2) * (1 + 0.2 * swing);
    const a = 0.75 + t * 0.05 + this.focus * 0.9;
    const pos = new THREE.Vector3(this.center.x + Math.sin(a) * dist, h * 0.9 + dist * (0.42 + 0.25 * swing), this.center.z + Math.cos(a) * dist);
    const tgt = new THREE.Vector3(this.center.x, h * 0.35, this.center.z);
    const kk = 1 - Math.exp(-dt * 2.5);
    this.camPos.lerp(pos, kk);
    this.camTgt.lerp(tgt, kk);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTgt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
  }
}
