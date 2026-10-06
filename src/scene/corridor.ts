// 스물다섯 개의 문: 빛나는 복도를 걸어가며 양옆의 문이 하나씩 열린다.
// 문은 좌우 번갈아 서 있고, 카메라가 다가가면 열리며 안쪽 빛이 복도 바닥으로 쏟아진다.
// 서울 구간은 한양 블루, ERICA 구간은 청록 — 두 구간 사이엔 빛의 문턱.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface DoorInfo {
  ko: string;
  en: string;
  campus: 'SEOUL' | 'ERICA';
  no: number;
}

const GAP = 3.2; // 문 사이 간격 (복도 길이 방향)
const HALF = 2.2; // 복도 반폭
const DW = 1.3, DH = 2.6; // 문 크기
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => t * t * (3 - 2 * t);

// 문 안쪽: 캠퍼스 빛으로 가득 찬 방, 안쪽 벽에 단과대학 이름
function innerTex(ko: string, en: string, mid: string, edge: string) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 1280;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(320, 700, 40, 320, 700, 900);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.3, mid);
  gr.addColorStop(1, edge);
  g.fillStyle = gr;
  g.fillRect(0, 0, 640, 1280);
  // 문 폭에 꽉 차게, 굵고 큰 이름 (길면 두세 줄로 나눈다)
  // 줄바꿈은 뜻 단위로: '소프트웨어융합 / 대학', 'LIONS / 칼리지', '예술·체육 / 대학'
  let lines: string[] = [ko];
  if (ko.length > 4) {
    const m = ko.match(/^(.+?)(대학|칼리지|학부)$/);
    lines = m ? [m[1], m[2]] : [ko];
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#071226';
  let size = 160;
  g.font = `900 ${size}px "Pretendard Variable", Pretendard, sans-serif`;
  const widest = Math.max(...lines.map((l) => g.measureText(l).width));
  size = Math.min(160, Math.floor((size * 560) / widest));
  g.font = `900 ${size}px "Pretendard Variable", Pretendard, sans-serif`;
  const top = 600 - ((lines.length - 1) * size * 1.12) / 2;
  lines.forEach((l, k) => g.fillText(l, 320, top + k * size * 1.12));
  g.font = '600 30px "Space Grotesk", sans-serif';
  g.fillStyle = 'rgba(7,18,38,0.65)';
  g.fillText(en.toUpperCase(), 320, top + (lines.length - 1) * size * 1.12 + size * 0.8 + 10, 580);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 문짝에 새기는 번호와 이름
function plate(no: number, ko: string, campus: string, col: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 1024);
  gr.addColorStop(0, '#141b2a');
  gr.addColorStop(1, '#070a12');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 1024);
  // 은은한 유리 반사
  const sh = g.createLinearGradient(0, 0, 512, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0.07)');
  sh.addColorStop(0.4, 'rgba(255,255,255,0.0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 512, 1024);
  g.fillStyle = col;
  g.font = '500 30px "Space Grotesk", sans-serif';
  g.fillText(campus, 48, 80);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = '300 260px "Space Grotesk", sans-serif';
  g.fillText(String(no).padStart(2, '0'), 36, 880);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '800 58px "Pretendard Variable", Pretendard, sans-serif';
  g.fillText(ko, 44, 970, 430);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface Door {
  leaf: THREE.Group; // 경첩 축
  frame: THREE.LineBasicMaterial;
  inner: THREE.MeshBasicMaterial;
  spill: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  z: number;
  side: number;
  col: THREE.Color;
}

export class Corridor {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
  private doors: Door[] = [];
  private cur = 0;
  private active = false;
  private last = performance.now();
  private time = 0;
  private raf = 0;
  private ro: ResizeObserver;
  private camZ = 4;
  private camX = 0;
  private look = new THREE.Vector3(0, 1.4, -2);
  private mouse = new THREE.Vector2();
  private onMove = (e: PointerEvent) => this.mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
  private strips: THREE.MeshBasicMaterial[] = [];
  private gateMat: THREE.MeshBasicMaterial;

  constructor(private canvas: HTMLCanvasElement, list: DoorInfo[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color('#03050a');
    this.scene.fog = new THREE.Fog('#03050a', 6, 30);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    this.scene.add(new THREE.HemisphereLight('#9fbfff', '#000000', 0.25));

    const len = list.length * GAP + 20;
    // 바닥: 짙은 광택 석재 (빛이 비친다)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, len), new THREE.MeshStandardMaterial({ color: '#05070d', roughness: 0.55, metalness: 0.3, envMapIntensity: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -len / 2 + 8;
    // 벽 · 천장
    const wallMat = new THREE.MeshStandardMaterial({ color: '#070a12', roughness: 0.9, envMapIntensity: 0 });
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(len, 4), wallMat);
      w.rotation.y = -s * Math.PI / 2;
      w.position.set(s * HALF, 2, -len / 2 + 8);
      this.scene.add(w);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, len), wallMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 4, -len / 2 + 8);
    this.scene.add(floor, ceil);
    // 천장 · 바닥 가장자리의 가는 빛줄기 (복도의 원근을 그린다)
    for (const [x, y] of [[-HALF + 0.02, 0.01], [HALF - 0.02, 0.01], [-0.6, 3.99], [0.6, 3.99]]) {
      const m = new THREE.MeshBasicMaterial({ color: '#7fb2ff' });
      this.strips.push(m);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, len), m);
      b.position.set(x, y, -len / 2 + 8);
      this.scene.add(b);
    }

    // 바닥에 번지는 빛: 문 쪽은 진하고 멀어질수록 부드럽게 사라진다
    const spillTex = (() => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 256;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(64, 0, 0, 64, 0, 230);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 256);
      return new THREE.CanvasTexture(c);
    })();
    // 문들
    const seoulN = list.filter((d) => d.campus === 'SEOUL').length;
    list.forEach((d, i) => {
      const side = i % 2 ? 1 : -1;
      const z = -i * GAP - (i >= seoulN ? GAP : 0); // ERICA 앞엔 한 칸 비워 문턱을 둔다
      const col = new THREE.Color(d.campus === 'SEOUL' ? '#5f9bff' : '#3fe6c8');
      const g = new THREE.Group();
      g.position.set(side * (HALF - 0.005), 0, z);
      g.rotation.y = -side * Math.PI / 2; // 문 앞면이 복도 쪽을 본다
      this.scene.add(g);
      // 문 안쪽: 캠퍼스 색으로 가득 찬 빛
      const inner = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.15), map: d.campus === 'SEOUL' ? innerTex(d.ko, d.en, '#bcd8ff', '#2a5fb8') : innerTex(d.ko, d.en, '#bff7ea', '#13887a') });
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), inner);
      hole.position.set(0, DH / 2, 0.006); // 벽보다 살짝 앞에 (벽에 가려지지 않게)
      g.add(hole);
      // 문틀: 가는 빛선
      const fm = new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(0.4) });
      const fp = [[-DW / 2, 0], [-DW / 2, DH], [DW / 2, DH], [DW / 2, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0.01));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fp), fm));
      // 문짝: 경첩(복도 안쪽 기준 먼 쪽)을 축으로 열린다
      const leaf = new THREE.Group();
      leaf.position.set(-DW / 2, 0, 0.02);
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(DW, DH, 0.05),
        [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: '#0b0f18', roughness: 0.4 })).concat([
          new THREE.MeshStandardMaterial({ map: plate(d.no, d.ko, d.campus, d.campus === 'SEOUL' ? '#7fb2ff' : '#5ff2d2'), roughness: 0.35, metalness: 0.2 }),
          new THREE.MeshStandardMaterial({ color: '#0b0f18', roughness: 0.4 }),
        ])
      );
      slab.position.set(DW / 2, DH / 2, 0);
      leaf.add(slab);
      g.add(leaf);
      // 열린 문에서 바닥으로 쏟아지는 빛
      const spill = new THREE.MeshBasicMaterial({ color: col, map: spillTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(DW * 2.4, 3.2), spill);
      sp.rotation.x = -Math.PI / 2;
      sp.position.set(0, 0.012, 1.5);
      g.add(sp);
      const light = new THREE.PointLight(col, 0, 6, 1.6);
      light.position.set(0, 1.6, 0.6);
      g.add(light);
      this.doors.push({ leaf, frame: fm, inner, spill, light, z, side, col });
    });
    // 서울 → ERICA 사이의 빛의 문턱
    {
      const z = -(seoulN - 0.5) * GAP - GAP / 2 - GAP / 2;
      this.gateMat = new THREE.MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 - 0.1, 0.02), this.gateMat);
      for (const y of [0.02, 3.98]) {
        const r = ring.clone();
        r.position.set(0, y, z);
        this.scene.add(r);
      }
      for (const x of [-HALF + 0.05, HALF - 0.05]) {
        const v = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 4), this.gateMat);
        v.position.set(x, 2, z);
        v.rotation.y = Math.PI / 2;
        this.scene.add(v);
      }
    }

    addEventListener('pointermove', this.onMove);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** cur: 지금 단과대학 (소수 = 넘어가는 중) */
  set(cur: number, active: boolean) {
    this.cur = cur;
    this.active = active;
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 70 : 50;
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;
    this.time += dt;
    const ci = Math.min(this.doors.length - 1, Math.max(0, Math.round(this.cur)));
    const fi = Math.floor(this.cur), ff = this.cur - fi;
    const A = this.doors[Math.max(0, Math.min(this.doors.length - 1, fi))], B = this.doors[Math.min(this.doors.length - 1, fi + 1)];
    // 카메라: 지금 문 앞 복도 가운데, 살짝 문 쪽으로 몸을 돌린다
    // 카메라: 복도 반대편 벽 쪽에 서서 지금 문을 비스듬히 바라본다. 문 사이를 걸을 땐 복도 끝을 본다
    const cur = this.doors[ci];
    const walking = Math.sin(Math.PI * ff);
    // 문 앞에 서면 문을 거의 정면으로 마주 보고, 걸을 땐 뒤로 물러나 복도 끝을 본다
    const z = THREE.MathUtils.lerp(A.z, B.z, ease(ff)) + 1.6 + walking * 3.2;
    this.camZ += (z - this.camZ) * (1 - Math.exp(-dt * 4));
    this.camX += (-cur.side * 1.6 * (1 - walking) - this.camX) * (1 - Math.exp(-dt * 3));
    this.camera.position.set(this.camX + this.mouse.x * 0.25, 1.5 - this.mouse.y * 0.15, this.camZ);
    const door = new THREE.Vector3(cur.side * HALF, 1.3, cur.z);
    const ahead = new THREE.Vector3(0, 1.4, this.camZ - 6);
    this.look.lerp(ahead.lerp(door, 0.96 * (1 - walking)), 1 - Math.exp(-dt * 4));
    this.camera.lookAt(this.look);
    // 넓은 화면에선 장면을 오른쪽으로 비켜 왼쪽에 글자 자리를 남긴다
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (W / H >= 0.9) this.camera.setViewOffset(W, H, -W * 0.14, 0, W, H);
    else this.camera.clearViewOffset();
    // 문 열기: 지금 문은 활짝, 지나온 문은 반쯤 열린 채, 앞의 문은 닫혀 있다
    const camCol = new THREE.Color();
    this.doors.forEach((d, i) => {
      const k = i === ci ? 1 : 0;
      const past = i < ci ? 1 : 0;
      const target = k; // 지금 문만 열고, 지나온 문은 다시 닫는다
      void past;
      const cur = d.leaf.userData.o ?? 0;
      const o = cur + (target - cur) * (1 - Math.exp(-dt * 5));
      d.leaf.userData.o = o;
      d.leaf.rotation.y = o * 1.6; // 방 안쪽으로 열린다
      const glow = clamp01(o);
      d.inner.color.set('#ffffff').multiplyScalar(0.08 + glow * 0.95);
      d.frame.color.copy(d.col).multiplyScalar(0.35 + glow * 1.8);
      d.spill.opacity = glow * 0.55;
      d.light.intensity = glow * 7;
      if (i === ci) camCol.copy(d.col);
    });
    this.strips.forEach((m) => m.color.lerp(camCol.clone().multiplyScalar(1.2), 1 - Math.exp(-dt * 3)));
    this.gateMat.opacity = 0.35 + 0.25 * Math.sin(this.time * 2);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('pointermove', this.onMove);
    this.ro.disconnect();
    this.renderer.dispose();
  }
}
