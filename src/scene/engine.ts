// PROJECT BLUE ENGINE — 스크롤로 분해·결합·발사되는 미래 모빌리티 3D 씬.
// 차량은 전부 절차적으로(코드로) 만든 지오메트리이고, 실물감은 환경맵 반사 + 그림자 + 반사 바닥 + 블룸으로 낸다.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import archivo from '../assets/archivo-black.typeface.json';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Lion, sampleSurface } from './lion';

export interface EngineState {
  hero: number; // 1 = 첫 화면
  explode: number; // 0 조립 → 1 분해
  focus: number; // 집중할 부품 번호 (0~4), -1 = 없음
  focusAmt: number; // 부품 클로즈업 정도
  launch: number; // 0 → 1 발사
  finale: number; // 마지막 귀환
}


const SKY = new THREE.Color('#7fb2ff');
// 부품별 고유 색 (배터리·라이다·모터·콕핏·서스펜션) — 클로즈업 무대 조명과 발광에 쓴다
export const ACCENTS = ['#3ff0c8', '#a98bff', '#ffb547', '#ff6fae', '#5fd3ff'];
const ACC = ACCENTS.map((c) => new THREE.Color(c));
const FLOOR_Y = -1;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIn3 = (t: number) => t * t * t;
const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);

function glow(hex: THREE.ColorRepresentation, k = 3, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false, transparent: opacity < 1, opacity });
}

// 시선과 면이 비스듬할수록 빛나는 프레넬 림 라이트
function rimMat(color: THREE.Color, power = 2.4, k = 1.4) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uK: { value: k }, uP: { value: power } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uK; uniform float uP; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(clamp(1.0-abs(dot(normalize(vN),normalize(vV))), 0.0, 1.0), uP); gl_FragColor = vec4(uColor*f*uK, f*uK); }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// 무대 바닥 격자: 중심에서 멀어질수록 사라지고, uScroll로 바닥이 흘러가게(러닝머신) 할 수 있다
function makeGrid(cx: number, cz: number) {
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: SKY.clone() }, uTime: { value: 0 }, uPulse: { value: 0 }, uCenter: { value: new THREE.Vector2(cx, cz) }, uScroll: { value: 0 } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPulse; uniform vec2 uCenter; uniform float uScroll; varying vec3 vW;
        float line(float x, float w){ float d = abs(fract(x-0.5)-0.5)/max(fwidth(x), 1e-4); return 1.0-min(d/w,1.0); }
        void main(){
          vec2 q = vW.xz - uCenter;
          float r = length(q);
          float gx = q.x + uScroll;
          float g = max(line(gx, 1.0), line(q.y, 1.0))*0.22 + max(line(gx*0.25, 1.2), line(q.y*0.25, 1.2))*0.35;
          float fade = exp(-r*0.16);
          float ring = smoothstep(0.08, 0.0, abs(r - mod(uTime*1.6, 14.0)))*0.5*uPulse;
          float pad = smoothstep(3.4, 0.0, r)*0.18;
          gl_FragColor = vec4(uColor*(g*fade + ring*fade + pad), (g*fade + ring*fade + pad));
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      extensions: { derivatives: true } as any,
    })
  );
  grid.rotation.x = -Math.PI / 2;
  grid.position.set(cx, FLOOR_Y + 0.002, cz);
  return grid;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const WHEEL_Y_ALL = -0.573;
const TRACK = 1.035;

// 1차원 캣멀-롬(에르미트) 스플라인: [x, 값] 키들을 부드럽게 잇는다
function spline(keys: [number, number][]) {
  const n = keys.length;
  const m = keys.map((_, i) => {
    const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)];
    return (b[1] - a[1]) / (b[0] - a[0] || 1);
  });
  return (x: number) => {
    if (x <= keys[0][0]) return keys[0][1];
    if (x >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 1;
    while (keys[i][0] < x) i++;
    const [x0, y0] = keys[i - 1], [x1, y1] = keys[i];
    const h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i - 1] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i];
  };
}

interface LoftOpts {
  x0: number; x1: number; // 꼬리 · 코 끝
  cap0: number; cap1: number; // 양 끝을 둥글게 오므리는 길이
  top: (x: number) => number; bot: (x: number) => number; half: (x: number) => number;
  n: number; nBot: number; // 슈퍼타원 지수 (클수록 각진 단면)
  stations: number; ring: number;
  carve?: (x: number, y: number, z: number) => [number, number] | null;
}

// 슈퍼타원 단면을 x축을 따라 이어 붙여 매끈한 차체 곡면을 만든다
function loft(o: LoftOpts) {
  const pw = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const capScale = (x: number) => {
    if (x > o.x1 - o.cap1) { const t = (x - (o.x1 - o.cap1)) / o.cap1; return Math.sqrt(Math.max(0, 1 - t * t)); }
    if (x < o.x0 + o.cap0) { const t = (o.x0 + o.cap0 - x) / o.cap0; return Math.sqrt(Math.max(0, 1 - t * t)); }
    return 1;
  };
  const surf = (x: number, th: number, k = 1) => {
    const s = capScale(x);
    const yt = o.top(x), yb = o.bot(x), yc = (yt + yb) / 2, hh = ((yt - yb) / 2) * s;
    const c = Math.cos(th), sn = Math.sin(th);
    let y = yc + hh * pw(sn, 2 / (sn > 0 ? o.n : o.nBot)) * k;
    let z = o.half(x) * s * pw(c, 2 / o.n) * k;
    const cv = o.carve?.(x, y, z);
    if (cv) [y, z] = cv;
    return new THREE.Vector3(x, y, z);
  };
  const S = o.stations, R = o.ring;
  const pos = new Float32Array((S + 1) * (R + 1) * 3);
  const grid: THREE.Vector3[][] = [];
  for (let i = 0; i <= S; i++) {
    const x = o.x0 + ((o.x1 - o.x0) * i) / S;
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= R; j++) {
      const v = surf(x, -Math.PI / 2 + (j / R) * Math.PI * 2);
      v.toArray(pos, (i * (R + 1) + j) * 3);
      row.push(v);
    }
    grid.push(row);
  }
  const idx: number[] = [];
  for (let i = 0; i < S; i++)
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + R + 1, c = b + 1, d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, grid, surf };
}

// 로프트 격자에서 일정 간격의 가로·세로 선만 뽑아 홀로그램 와이어프레임을 만든다
function cageLines(grid: THREE.Vector3[][], everyStation: number, everyRing: number) {
  const pts: number[] = [];
  for (let i = 0; i < grid.length; i += everyStation)
    for (let j = 0; j < grid[i].length - 1; j++) pts.push(...grid[i][j].toArray(), ...grid[i][j + 1].toArray());
  for (let j = 0; j < grid[0].length - 1; j += everyRing)
    for (let i = 0; i < grid.length - 1; i++) pts.push(...grid[i][j].toArray(), ...grid[i + 1][j].toArray());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

interface Part {
  g: THREE.Group;
  base: THREE.Vector3;
  off: THREE.Vector3;
  delay: number;
  anchor: THREE.Object3D; // 라벨·카메라가 바라볼 지점
}

interface Stream {
  to: () => THREE.Vector3;
}

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private lensPass: ShaderPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  // 첫 프레임부터 하이리온 얼굴을 정면으로
  private camPos = new THREE.Vector3(1.6, 1.7, 9.6);
  private camTgt = new THREE.Vector3(0, -0.05, -2.4);
  private raf = 0;
  private timer = new THREE.Timer();
  private time = 0;
  private mobile: boolean;
  private mouse = new THREE.Vector2();
  private mouseS = new THREE.Vector2();
  private shift = new THREE.Vector2(0.12, 0);

  private s: EngineState = { hero: 1, explode: 0, focus: -1, focusAmt: 0, launch: 0, finale: 0 };

  private car = new THREE.Group();
  private carYaw = 0;
  private parts: Part[] = [];
  private body!: Part;
  private battery!: Part;
  private lidar!: Part;
  private motor!: Part;
  private cockpit!: Part;
  private wheels: { g: THREE.Group; base: THREE.Vector3; side: number }[] = [];
  private susp: { arms: THREE.Mesh[]; spring: THREE.Mesh; piston: THREE.Mesh; wheel: number }[] = [];

  private paint!: THREE.MeshPhysicalMaterial;
  private glass!: THREE.MeshPhysicalMaterial;
  private edgeMat!: THREE.LineBasicMaterial;
  private rim!: THREE.ShaderMaterial;
  private bodyGlows: THREE.MeshBasicMaterial[] = [];
  // 실사 차체(GLB)의 유리·트림 재질 — X-RAY 때 도장과 함께 비워진다
  private shellMats: { m: THREE.MeshStandardMaterial; o: number }[] = [];
  private cells!: THREE.InstancedMesh;
  private lid!: THREE.Mesh;
  private lidarSpin!: THREE.Group;
  private scan!: THREE.Points;
  private rotor!: THREE.Group;
  private coils: THREE.MeshBasicMaterial[] = [];
  private sparks!: THREE.Points;
  private neural!: { pts: THREE.Points; lines: THREE.LineSegments; phase: number[]; pairs: [number, number][] };
  private streams: Stream[] = [];
  private flow!: THREE.Points;
  private flowLines!: THREE.LineSegments;
  private boosters: THREE.Mesh[] = [];
  private streaks!: THREE.InstancedMesh;
  private streakData: { x: number; y: number; z: number; len: number; v: number }[] = [];
  private beams: THREE.Mesh[] = [];
  private dust!: THREE.Points;
  private wordmark!: THREE.Mesh;
  private underGlow!: THREE.PointLight;
  private letters: THREE.Mesh[] = [];
  private lion!: Lion;
  private roarWave!: THREE.Mesh;
  private energy!: THREE.Points;
  private lettersG = new THREE.Group();
  private key!: THREE.DirectionalLight;
  private focusSpot!: THREE.SpotLight;
  private holo = new THREE.Group();
  private holoMats: THREE.Material[] = [];

  // 오프닝 변신
  private introT = 0;
  private introDone = false;
  private burst = false;
  private clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e4);
  private shards!: THREE.InstancedMesh;
  private sFrom!: Float32Array;
  private sTo!: Float32Array;
  private sMid!: Float32Array;
  private sDel!: Float32Array;
  private scanRing!: THREE.Mesh;

  private labels: HTMLElement[] = [];
  private onResizeBound = () => this.resize();
  private onMoveBound = (e: PointerEvent) => {
    this.mouse.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.mobile = innerWidth < 820 || matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(devicePixelRatio, this.mobile ? 1.5 : 1.75);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    this.scene.background = new THREE.Color('#02040a');
    this.scene.fog = new THREE.FogExp2('#02040a', 0.045);

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.mobile ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // 셰이더에서 드물게 나오는 NaN/Inf 픽셀을 지운다 — 블룸이 이걸 화면 전체로 번지게 해서 검은 화면이 됐었다
    this.composer.addPass(
      new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
          void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0); gl_FragColor = min(c, vec4(48.0)); }`,
      })
    );
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    // 색수차 + 비네팅 + 필름 그레인 — 시네마 렌즈 느낌
    this.lensPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.0025 }, uVig: { value: 0.75 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uCA; uniform float uVig; varying vec2 vUv;
        void main(){
          vec2 c = vUv-0.5; float d = length(c); vec2 off = c*d*uCA*4.0;
          vec3 col = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);
          col *= 1.0 - uVig*smoothstep(0.3, 0.95, d);
          float n = fract(sin(dot(vUv*vec2(1733.0, 977.0) + uTime, vec2(12.9898, 78.233)))*43758.5453);
          col += (n-0.5)*0.03;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.composer.addPass(this.lensPass);
    this.composer.addPass(new OutputPass());

    this.buildStage();
    this.buildCar();
    this.buildFx();
    this.buildLetters();
    this.buildBrand();
    this.buildLion();
    this.buildIntro();

    this.resize();
    addEventListener('resize', this.onResizeBound);
    addEventListener('pointermove', this.onMoveBound);
    this.raf = requestAnimationFrame(this.tick);
  }

  private paused = false;
  // 밝은(불투명) 섹션이 화면을 덮고 있을 땐 렌더링을 쉰다
  setPaused(p: boolean) {
    this.paused = p;
  }

  // 오프닝(사자 → 자동차)을 처음부터 다시
  replayIntro() {
    this.introT = 0;
    this.introDone = false;
    this.burst = false;
  }

  setState(s: Partial<EngineState>) {
    Object.assign(this.s, s);
  }

  // 0~4 = 부품 라벨, 5~6 = 캠퍼스 라벨
  setLabels(els: HTMLElement[]) {
    this.labels = els;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResizeBound);
    removeEventListener('pointermove', this.onMoveBound);
    this.renderer.dispose();
  }

  /* ───────────────────────── stage: 바닥·조명·공기 ───────────────────────── */
  private buildStage() {
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight('#9fbfff', '#05070c', 0.35));

    const key = (this.key = new THREE.DirectionalLight('#ffffff', 2.4));
    key.position.set(4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -7;
    key.shadow.camera.right = key.shadow.camera.top = 7;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    sc.add(key, key.target);

    const rimL = new THREE.SpotLight('#3e7fd1', 160, 30, 0.6, 0.6, 2);
    rimL.position.set(-6, 4.5, -5);
    rimL.target.position.set(0, 0, 0);
    sc.add(rimL, rimL.target);
    const fill = new THREE.SpotLight('#cfe0ff', 50, 25, 0.7, 0.8, 2);
    fill.position.set(6, 2, -3);
    sc.add(fill);

    this.underGlow = new THREE.PointLight(SKY, 6, 5, 2);
    this.underGlow.position.set(0, -0.88, 0);
    sc.add(this.underGlow);

    // 반사 바닥 (모바일은 성능상 생략)
    if (!this.mobile) {
      const mirror = new Reflector(new THREE.PlaneGeometry(260, 260), {
        textureWidth: Math.floor(innerWidth * 0.6),
        textureHeight: Math.floor(innerHeight * 0.6),
        color: new THREE.Color('#6d7c99'),
      });
      mirror.rotation.x = -Math.PI / 2;
      mirror.position.y = FLOOR_Y - 0.002;
      sc.add(mirror);
    }
    // 반사 위를 덮는 반투명 짙은 바닥 → 광택 있는 검은 석재 느낌
    const tint = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 260),
      new THREE.MeshStandardMaterial({ color: '#04070e', metalness: 0.2, roughness: 0.55, transparent: true, opacity: this.mobile ? 1 : 0.9 })
    );
    tint.rotation.x = -Math.PI / 2;
    tint.position.y = FLOOR_Y - 0.001;
    tint.receiveShadow = true;
    sc.add(tint);
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.ShadowMaterial({ opacity: 0.6 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = FLOOR_Y;
    shadowCatcher.receiveShadow = true;
    sc.add(shadowCatcher);

    // 바닥 그리드 + 차량 아래 원형 발광
    const grid = makeGrid(0, 0);
    grid.name = 'grid';
    sc.add(grid);

    // 위에서 떨어지는 빛기둥
    const beamMat = () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: SKY.clone() }, uAmt: { value: 0.5 } },
        vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uAmt; varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.0); float a = edge*smoothstep(0.0, 0.6, vY)*smoothstep(1.0, 0.75, vY)*0.12*uAmt; gl_FragColor = vec4(uColor*a, a); }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
    [[-2.6, -1.2, 0.08], [0, 0, 0], [2.8, 1.4, -0.08]].forEach(([x, z, tilt]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 2.3, 11, 48, 1, true), beamMat());
      m.position.set(x, FLOOR_Y + 5.5, z);
      m.rotation.z = tilt;
      this.beams.push(m);
      sc.add(m);
    });

    // 떠다니는 미세먼지
    const n = this.mobile ? 600 : 1400;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 30;
      p[i * 3 + 1] = FLOOR_Y + Math.random() * 7;
      p[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({ size: 0.035, map: dotTexture(), color: SKY.clone().multiplyScalar(1.2), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    );
    sc.add(this.dust);

    // 차 뒤에 서 있는 거대한 워드마크 — 3D 공간에 있어서 카메라가 움직이면 깊이감이 생긴다
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 420;
    const g = c.getContext('2d')!;
    const draw = () => {
      g.clearRect(0, 0, c.width, c.height);
      g.font = '700 360px "Space Grotesk", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(160,200,255,0.9)';
      g.strokeText('HANYANG', 1024, 220);
      g.fillStyle = 'rgba(127,178,255,0.10)';
      g.fillText('HANYANG', 1024, 220);
      tex.needsUpdate = true;
    };
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    draw();
    document.fonts?.load('700 360px "Space Grotesk"').then(draw).catch(() => {});
    this.wordmark = new THREE.Mesh(
      new THREE.PlaneGeometry(21, 21 * (420 / 2048)),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false })
    );
    this.wordmark.position.set(2.5, 1.2, -9);
    this.wordmark.visible = false;
    sc.add(this.wordmark);
  }

  /* ───────────────────────── 차량 ───────────────────────── */
  private addPart(g: THREE.Group, base: [number, number, number], off: [number, number, number], delay: number, anchorAt: [number, number, number]) {
    g.position.set(...base);
    const anchor = new THREE.Object3D();
    anchor.position.set(...anchorAt);
    g.add(anchor);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !((o as THREE.Mesh).material as THREE.Material).transparent) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.car.add(g);
    const p: Part = { g, base: new THREE.Vector3(...base), off: new THREE.Vector3(...off), delay, anchor };
    this.parts.push(p);
    return p;
  }

  private buildCar() {
    this.scene.add(this.car);
    const dark = new THREE.MeshStandardMaterial({ color: '#0b111c', metalness: 0.75, roughness: 0.38 });
    const chrome = new THREE.MeshStandardMaterial({ color: '#d5deee', metalness: 1, roughness: 0.14 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#07090d', metalness: 0.1, roughness: 0.85 });

    /* 차체 — 단면을 x축으로 이어 붙인(로프트) 하이퍼카 바디 */
    {
      const g = new THREE.Group();
      const WHEEL_Y = -0.61;
      const top = spline([[-2.34, -0.34], [-2.0, -0.2], [-1.45, -0.13], [-0.8, -0.17], [0.2, -0.22], [0.8, -0.27], [1.45, -0.27], [2.0, -0.4], [2.42, -0.56]]);
      const bot = spline([[-2.34, -0.66], [-1.8, -0.78], [0, -0.81], [1.8, -0.79], [2.42, -0.7]]);
      const half = spline([[-2.34, 0.7], [-1.95, 0.88], [-1.45, 0.97], [-0.8, 0.88], [0.1, 0.84], [0.9, 0.87], [1.45, 0.94], [2.0, 0.8], [2.42, 0.6]]);
      // 휠 아치: 바퀴 주변 옆면을 안쪽으로 밀어 넣어 휠하우스를 만든다
      const carve = (x: number, y: number, z: number): [number, number] | null => {
        for (const wx of [1.45, -1.45]) {
          const dx = x - wx, dy = y - WHEEL_Y;
          if (dx * dx + dy * dy < 0.5 * 0.5 && Math.abs(z) > 0.6) return [y, Math.sign(z) * 0.6];
        }
        return null;
      };
      const body = loft({ x0: -2.34, x1: 2.42, cap0: 0.22, cap1: 0.36, top, bot, half, n: 2.8, nBot: 5, stations: 220, ring: 96, carve });
      this.paint = new THREE.MeshPhysicalMaterial({
        color: '#0a2f66',
        metalness: 0.78,
        roughness: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        iridescence: 0.3,
        iridescenceIOR: 1.6,
        transparent: true,
        envMapIntensity: 1.7,
      });
      g.add(new THREE.Mesh(body.geo, this.paint));
      this.rim = rimMat(SKY, 2.4, 0.9);
      const rimMesh = new THREE.Mesh(body.geo, this.rim);
      rimMesh.scale.setScalar(1.004);
      g.add(rimMesh);
      // X-RAY 때 보이는 홀로그램 격자
      this.edgeMat = new THREE.LineBasicMaterial({ color: SKY.clone().multiplyScalar(2.2), transparent: true, opacity: 0, toneMapped: false });
      g.add(new THREE.LineSegments(cageLines(body.grid, 11, 8), this.edgeMat));

      // 캐노피(그린하우스) — 차체보다 좁고 둥근 단면
      const cTop = spline([[-1.3, -0.2], [-0.9, -0.04], [-0.35, 0.07], [0.15, 0.08], [0.6, -0.02], [1.05, -0.24]]);
      const cBot = (x: number) => top(x) - 0.14;
      const cHalf = spline([[-1.3, 0.48], [-0.4, 0.66], [0.4, 0.66], [1.05, 0.56]]);
      const canopy = loft({ x0: -1.3, x1: 1.05, cap0: 0.3, cap1: 0.45, top: cTop, bot: cBot, half: cHalf, n: 2.3, nBot: 2.3, stations: 120, ring: 72 });
      this.glass = new THREE.MeshPhysicalMaterial({ color: '#06101f', metalness: 0.35, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.85, envMapIntensity: 2.8 });
      g.add(new THREE.Mesh(canopy.geo, this.glass));

      // 발광 라인 — 차체 표면을 그대로 따라가게 표면 함수에서 뽑는다
      const surf = body.surf;
      const wrap = (xs: number[], th: number) => {
        const right = xs.map((x) => surf(x, th, 1.012));
        const left = xs.map((x) => surf(x, Math.PI - th, 1.012)).reverse();
        return new THREE.CatmullRomCurve3([...left, ...right]);
      };
      const headXs = Array.from({ length: 18 }, (_, i) => 2.1 + (i / 17) * 0.315);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(wrap(headXs.slice().reverse(), 0.42), 120, 0.012, 8), glow(SKY, 7)));
      const tailXs = Array.from({ length: 18 }, (_, i) => -2.32 + (i / 17) * 0.22);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(wrap(tailXs, 0.5), 120, 0.011, 8), glow('#ff4f7b', 5)));
      for (const side of [1, -1]) {
        const pts = Array.from({ length: 40 }, (_, i) => {
          const p = surf(-1.95 + (i / 39) * 3.9, side > 0 ? 0.2 : Math.PI - 0.2, 1.01);
          return p;
        });
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.005, 6), glow(SKY, 3)));
      }
      // 리어 윙 · 프런트 스플리터 · 디퓨저
      const carbon = new THREE.MeshStandardMaterial({ color: '#0a0e16', metalness: 0.6, roughness: 0.35 });
      const wing = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.025, 1.62, 2, 0.01), carbon);
      wing.position.set(-2.02, 0.02, 0);
      wing.rotation.z = 0.08;
      const wingLine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 1.6), glow(SKY, 4));
      wingLine.position.set(-2.18, 0.03, 0);
      g.add(wing, wingLine);
      for (const z of [-0.45, 0.45]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), carbon);
        strut.position.set(-1.98, -0.08, z);
        strut.rotation.z = -0.2;
        g.add(strut);
      }
      const splitter = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.02, 1.3, 2, 0.008), carbon);
      splitter.position.set(2.2, -0.78, 0);
      g.add(splitter);
      for (let i = 0; i < 6; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.012), carbon);
        fin.position.set(-2.12, -0.74, -0.5 + i * 0.2);
        g.add(fin);
      }
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if ((o as THREE.Mesh).isMesh && m.type === 'MeshBasicMaterial') {
          m.transparent = true;
          this.bodyGlows.push(m);
        }
      });
      this.body = this.addPart(g, [0, 0, 0], [-0.15, 2.05, 0], 0.0, [0.9, -0.15, 0.85]);
    }

    /* 01 배터리 팩 */
    {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new RoundedBoxGeometry(2.7, 0.1, 1.2, 3, 0.03), dark));
      const nx = 14, nz = 6;
      this.cells = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 16), new THREE.MeshBasicMaterial({ toneMapped: false }), nx * nz);
      const m = new THREE.Matrix4();
      let k = 0;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          m.makeTranslation((i - (nx - 1) / 2) * 0.18, 0.09, (j - (nz - 1) / 2) * 0.18);
          this.cells.setMatrixAt(k, m);
          this.cells.setColorAt(k++, SKY);
        }
      g.add(this.cells);
      this.lid = new THREE.Mesh(
        new RoundedBoxGeometry(2.7, 0.025, 1.2, 2, 0.01),
        new THREE.MeshPhysicalMaterial({ color: '#9fc4ff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.18, envMapIntensity: 2 })
      );
      this.lid.position.y = 0.15;
      g.add(this.lid);
      this.battery = this.addPart(g, [0.05, -0.71, 0], [-0.2, -0.13, -0.6], 0.1, [-0.7, 0.12, -0.35]);
    }

    /* 02 라이다 */
    {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.07, 48), dark));
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: '#0d1d36', metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.55, envMapIntensity: 3 })
      );
      dome.position.y = 0.035;
      g.add(dome);
      this.lidarSpin = new THREE.Group();
      this.lidarSpin.position.y = 0.08;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.007, 8, 48), glow(SKY, 5));
      ring.rotation.x = Math.PI / 2;
      const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.02), glow('#ffffff', 8));
      emitter.position.x = 0.085;
      this.lidarSpin.add(ring, emitter);
      g.add(this.lidarSpin);
      this.lidar = this.addPart(g, [-0.15, 0.1, 0], [0.05, 3.0, -0.2], 0.2, [0, 0.1, 0]);
    }

    /* 03 모터 + 인버터 */
    {
      const g = new THREE.Group();
      g.scale.setScalar(0.78);
      const housing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.27, 0.64, 48, 1, true),
        new THREE.MeshPhysicalMaterial({ color: '#b9c6dc', metalness: 1, roughness: 0.2, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      housing.rotation.x = Math.PI / 2;
      g.add(housing);
      for (let i = 0; i < 6; i++) {
        const mat = glow(SKY, 1.5);
        this.coils.push(mat);
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.022, 10, 48), mat);
        coil.position.z = -0.25 + i * 0.1;
        g.add(coil);
      }
      this.rotor = new THREE.Group();
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 24), chrome);
      core.rotation.x = Math.PI / 2;
      this.rotor.add(core);
      for (let i = 0; i < 8; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.6), dark);
        const a = (i / 8) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0);
        fin.rotation.z = a + Math.PI / 2;
        this.rotor.add(fin);
      }
      g.add(this.rotor);
      const inv = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.14, 0.38, 2, 0.03), dark);
      inv.position.set(0.12, 0.34, 0);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.02), glow(SKY, 5));
      strip.position.set(0.12, 0.42, 0.15);
      g.add(inv, strip);
      const n = 260;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      this.sparks = new THREE.Points(
        sg,
        new THREE.PointsMaterial({ size: 0.05, map: dotTexture(), color: SKY.clone().multiplyScalar(4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      );
      g.add(this.sparks);
      this.motor = this.addPart(g, [-1.45, -0.58, 0], [-2.2, 0.55, -0.2], 0.15, [0, 0.36, 0.2]);
    }

    /* 04 콕핏 + 뇌파 신경망 */
    {
      const g = new THREE.Group();
      const leather = new THREE.MeshStandardMaterial({ color: '#1a2233', metalness: 0.2, roughness: 0.6 });
      const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.08, 0.42, 3, 0.035), leather);
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.5, 0.42, 3, 0.035), leather);
      back.position.set(-0.24, 0.24, 0);
      back.rotation.z = 0.3;
      const headrest = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.14, 0.26, 3, 0.03), leather);
      headrest.position.set(-0.33, 0.55, 0);
      headrest.rotation.z = 0.3;
      const stitch = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.44, 0.012), glow(SKY, 3));
      stitch.position.set(-0.195, 0.24, 0);
      stitch.rotation.z = 0.3;
      const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 12, 48, Math.PI * 1.3), chrome);
      yoke.position.set(0.5, 0.24, 0);
      yoke.rotation.set(0, Math.PI / 2, -Math.PI * 0.15 - Math.PI / 2);
      g.add(cushion, back, headrest, stitch, yoke);

      const center = new THREE.Vector3(-0.3, 0.64, 0);
      const N = 70;
      const nodes: THREE.Vector3[] = [];
      while (nodes.length < N) {
        const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (v.length() > 1 || v.length() < 0.55) continue;
        nodes.push(v.multiply(new THREE.Vector3(0.32, 0.26, 0.36)).add(center));
      }
      const pairs: [number, number][] = [];
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (nodes[i].distanceTo(nodes[j]) < 0.18) pairs.push([i, j]);
      const pg = new THREE.BufferGeometry().setFromPoints(nodes);
      pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.045, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      const lp = new Float32Array(pairs.length * 6);
      pairs.forEach(([a, b], i) => {
        nodes[a].toArray(lp, i * 6);
        nodes[b].toArray(lp, i * 6 + 3);
      });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3));
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      g.add(pts, lines);
      this.neural = { pts, lines, pairs, phase: nodes.map(() => Math.random() * Math.PI * 2) };
      this.cockpit = this.addPart(g, [0.05, -0.68, 0], [1.45, 1.4, 0.55], 0.25, [-0.3, 0.64, 0]);
    }

    /* 05 휠 + 로보틱 서스펜션 */
    const caliperMat = glow(SKY, 2.2);
    for (const [x, side] of [[1.45, 1], [1.45, -1], [-1.45, 1], [-1.45, -1]] as const) {
      const g = new THREE.Group();
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.088, 32, 80), rubber);
      tire.scale.z = 1.55;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.24, 48, 1, true), dark);
      barrel.rotation.x = Math.PI / 2;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.012, 8, 64), chrome);
      lip.position.z = side * 0.115;
      // 트윈 Y 스포크
      for (let i = 0; i < 5; i++) {
        for (const d of [-0.11, 0.11]) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.25, 0.03), chrome);
          sp.position.set(0, 0.125, side * 0.1);
          const arm = new THREE.Group();
          arm.rotation.z = (i / 5) * Math.PI * 2 + d;
          arm.add(sp);
          spin.add(arm);
        }
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.005, 6, 64), glow(SKY, 4));
      ring.position.z = side * 0.112;
      const hub = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), glow(SKY, 3));
      hub.position.z = side * 0.125;
      if (side < 0) hub.rotation.y = Math.PI;
      spin.add(tire, barrel, lip, ring, hub);
      g.add(spin);
      // 브레이크 디스크 + 캘리퍼 (회전하지 않음)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.018, 48), chrome);
      disc.rotation.x = Math.PI / 2;
      disc.position.z = side * 0.02;
      const caliper = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.07, 0.06, 2, 0.02), caliperMat);
      caliper.position.set(0.1, 0.13, side * 0.05);
      caliper.rotation.z = -0.6;
      g.add(disc, caliper);
      g.userData.spin = spin;
      g.position.set(x, WHEEL_Y_ALL, side * TRACK);
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.car.add(g);
      this.wheels.push({ g, base: g.position.clone(), side });

      const arms = [0, 1].map((k) => {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 1), chrome);
        a.position.set(x, k ? WHEEL_Y_ALL + 0.1 : WHEEL_Y_ALL - 0.08, 0);
        a.castShadow = true;
        this.car.add(a);
        return a;
      });
      const helix = new THREE.Curve<THREE.Vector3>();
      helix.getPoint = (t: number, target = new THREE.Vector3()) => target.set(Math.cos(t * Math.PI * 14) * 0.05, t * 0.28 - 0.14, Math.sin(t * Math.PI * 14) * 0.05);
      const spring = new THREE.Mesh(new THREE.TubeGeometry(helix, 160, 0.01, 6), chrome);
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.32, 12), glow(SKY, 3));
      this.car.add(spring, piston);
      this.susp.push({ arms, spring, piston, wheel: this.wheels.length - 1 });
    }
    // 휠은 Part 배열 대신 따로 관리하지만, 라벨용 앵커는 앞바퀴에 둔다
    const wa = new THREE.Object3D();
    wa.position.set(0, 0.42, 0);
    this.wheels[0].g.add(wa);
    this.parts.push({ g: this.wheels[0].g, base: this.wheels[0].base, off: new THREE.Vector3(0.35, 0, 1.1), delay: 0.3, anchor: wa });
    this.loadRealCar();
  }

  /* 실사 차체: CC0 컨셉카 GLB를 불러와 기존 로프트 껍데기와 휠을 갈아 끼운다.
     원본은 +z가 앞, 바닥이 y=0 — 앞뒤 바퀴 사이 중점을 원점에 두고 x축 방향으로 돌려 휠베이스(2.9)에 맞춘다. */
  private loadRealCar() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(`${import.meta.env.BASE_URL}models/concept-car.glb`, (gltf) => {
      const inner = gltf.scene;
      inner.position.z = 2.209;
      const real = new THREE.Group();
      real.add(inner);
      real.rotation.y = Math.PI / 2;
      real.scale.setScalar(1.155);
      real.position.y = FLOOR_Y;
      real.updateMatrixWorld(true);

      const spinMats = /rubber|tireProtector|rims|chrome/;
      const fixedMats = /brakeCalipers|metal_1/;
      const meshes: THREE.Mesh[] = [];
      real.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));

      // 기존 절차적 휠·차체 껍데기는 숨긴다 (라벨 앵커와 회전 그룹은 그대로 쓴다)
      this.body.g.children.forEach((c) => (c.visible = !(c as THREE.Mesh).isMesh && !(c as THREE.LineSegments).isLineSegments));
      this.wheels.forEach((w) => {
        (w.g.userData.spin as THREE.Group).children.forEach((c) => (c.visible = false));
        w.g.children.forEach((c) => (c as THREE.Mesh).isMesh && (c.visible = false));
      });

      // 건메탈 그레이 도장: 금속감은 적당히, 광택은 클리어코트로
      this.paint.color.set('#41464e');
      this.paint.metalness = 0.65;
      this.paint.roughness = 0.3;
      this.paint.iridescence = 0;
      this.paint.envMapIntensity = 0.85;
      this.paint.needsUpdate = true;
      const box = new THREE.Box3(), c = new THREE.Vector3(), m = new THREE.Matrix4();
      for (const mesh of meshes) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const name = mat.name || '';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (spinMats.test(name) || fixedMats.test(name)) {
          // 가장 가까운 휠 그룹으로 옮겨 붙여 회전·분해를 그대로 따르게 한다
          box.setFromObject(mesh).getCenter(c);
          const w = this.wheels.reduce((a, b) => (Math.hypot(b.base.x - c.x, b.base.z - c.z) < Math.hypot(a.base.x - c.x, a.base.z - c.z) ? b : a));
          m.makeTranslation(-w.base.x, -w.base.y, -w.base.z).multiply(mesh.matrixWorld);
          mesh.removeFromParent();
          m.decompose(mesh.position, mesh.quaternion, mesh.scale);
          (fixedMats.test(name) ? w.g : (w.g.userData.spin as THREE.Group)).add(mesh);
          if (/brakeCalipers/.test(name)) mesh.material = glow(SKY, 1.6);
          continue;
        }
        if (/body_color/.test(name)) {
          mesh.material = this.paint;
          continue;
        }
        if (/^light$/.test(name)) {
          mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff0ff').multiplyScalar(1.4), toneMapped: false, transparent: true });
          this.bodyGlows.push(mesh.material as THREE.MeshBasicMaterial);
          continue;
        }
        if (/^taillights$/.test(name)) {
          mesh.material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3355').multiplyScalar(1.8), toneMapped: false, transparent: true });
          this.bodyGlows.push(mesh.material as THREE.MeshBasicMaterial);
          continue;
        }
        if (/plasticShiny/.test(name)) {
          // 유리: 짙은 스모크 글라스
          mesh.material = new THREE.MeshPhysicalMaterial({ color: '#05070c', metalness: 0.2, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.6 });
        }
        const mm = mesh.material as THREE.MeshStandardMaterial;
        mm.transparent = true;
        this.shellMats.push({ m: mm, o: mm.opacity });
      }
      // 오프닝 클리핑을 새 재질에도 건다
      real.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) {
          mat.clippingPlanes = [this.clip];
          mat.clipShadows = true;
        }
      });
      this.wheels.forEach((w) =>
        w.g.traverse((o) => {
          const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (mat) {
            mat.clippingPlanes = [this.clip];
            mat.clipShadows = true;
          }
        })
      );
      this.body.g.add(real);
      (window as unknown as { __carReady?: boolean }).__carReady = true;
    });
  }

  /* ───────────────────────── 이펙트: 라이다 스캔·에너지 흐름·부스터·속도선 ───────────────────────── */
  private buildFx() {
    // 라이다 포인트 클라우드 — 광선이 바닥에 닿으면 바닥을 따라 퍼진다
    const n = this.mobile ? 2600 : 6000;
    const dir = new Float32Array(n * 3);
    const off = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const th = ((i % 240) / 240) * Math.PI * 2 + Math.random() * 0.01;
      const el = -(0.03 + Math.floor(Math.random() * 18) * 0.03);
      dir[i * 3] = Math.cos(th) * Math.cos(el);
      dir[i * 3 + 1] = Math.sin(el);
      dir[i * 3 + 2] = Math.sin(th) * Math.cos(el);
      off[i] = Math.floor(Math.random() * 6) / 6 + Math.random() * 0.02;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    sg.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    sg.setAttribute('aOff', new THREE.BufferAttribute(off, 1));
    this.scan = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uR: { value: 9 }, uFloor: { value: FLOOR_Y }, uSize: { value: 16 * this.renderer.getPixelRatio() }, uColor: { value: SKY.clone().multiplyScalar(2.2) } },
        vertexShader: `attribute vec3 aDir; attribute float aOff; uniform float uTime; uniform vec3 uOrigin; uniform float uR; uniform float uFloor; uniform float uSize; varying float vA;
          void main(){
            float f = fract(uTime*0.22 + aOff);
            vec3 p = uOrigin + aDir*f*uR;
            float hit = step(p.y, uFloor + 0.01);
            p.y = max(p.y, uFloor + 0.012);
            vA = (1.0 - f)*(0.25 + 0.75*hit);
            vec4 mv = modelViewMatrix*vec4(p, 1.0);
            gl_PointSize = uSize*(0.5 + hit*0.6)/-mv.z;
            gl_Position = projectionMatrix*mv;
          }`,
        fragmentShader: `uniform vec3 uColor; uniform float uAmt; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, (1.0 - d*2.0)*vA*uAmt); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.scan.frustumCulled = false;
    this.scene.add(this.scan);

    // 배터리 → 각 부품으로 흐르는 에너지 입자
    const wpos = (o: THREE.Object3D, y = 0) => () => o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, y, 0));
    this.streams = [
      { to: wpos(this.motor.g) },
      ...this.wheels.map((w) => ({ to: wpos(w.g) })),
      { to: wpos(this.cockpit.anchor) },
      { to: wpos(this.lidar.g) },
    ];
    const per = 70;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.streams.length * per * 3), 3).setUsage(THREE.DynamicDrawUsage));
    fg.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(this.streams.length * per), 1).setUsage(THREE.DynamicDrawUsage));
    this.flow = new THREE.Points(
      fg,
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: SKY.clone().multiplyScalar(3) }, uSize: { value: 26 * this.renderer.getPixelRatio() } },
        vertexShader: `attribute float aA; uniform float uSize; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize/-mv.z; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; gl_FragColor = vec4(uColor, (1.0-d*2.0)*vA); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.flow.frustumCulled = false;
    const segs = 28;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.streams.length * segs * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.flowLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: SKY.clone().multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.flowLines.frustumCulled = false;
    this.scene.add(this.flow, this.flowLines);

    // 트윈 부스터
    const flame = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
      vertexShader: `varying float vY; varying vec2 vUv; void main(){ vY = position.y/2.4 + 0.5; vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uAmt; varying float vY; varying vec2 vUv;
        void main(){
          float n = sin(vY*28.0 - uTime*60.0)*0.5 + 0.5;
          float n2 = sin(vUv.x*40.0 + uTime*23.0)*0.5 + 0.5;
          float a = pow(clamp(1.0 - vY, 0.0, 1.0), 1.6)*(0.55 + 0.45*n*n2)*uAmt;
          vec3 c = mix(vec3(1.0), vec3(0.35, 0.6, 1.0), smoothstep(0.0, 0.5, vY))*3.0;
          gl_FragColor = vec4(c*a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (const z of [-0.42, 0.42]) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 2.4, 32, 8, true), flame);
      m.rotation.z = Math.PI / 2;
      m.position.set(-2.34 - 1.2, -0.5, z * 0.85);
      this.car.add(m);
      this.boosters.push(m);
    }

    // 발사 때 스쳐 지나가는 속도선
    const sn = this.mobile ? 140 : 260;
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: SKY.clone().multiplyScalar(3), transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }), sn);
    for (let i = 0; i < sn; i++) {
      let y = 0, z = 0;
      do {
        y = FLOOR_Y + 0.1 + Math.random() * 5;
        z = (Math.random() - 0.5) * 18;
      } while (Math.abs(z) < 1.6 && y < 1.2);
      this.streakData.push({ x: (Math.random() - 0.5) * 80, y, z, len: 2 + Math.random() * 6, v: 0.6 + Math.random() * 0.8 });
    }
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);

    // 클로즈업한 부품만 비추는 스포트라이트 + 바닥 홀로그램 받침
    this.focusSpot = new THREE.SpotLight('#dbe8ff', 0, 14, 0.38, 0.55, 1.4);
    this.scene.add(this.focusSpot, this.focusSpot.target);
    const ringM = glow(SKY, 3, 1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 128), ringM);
    const ring2M = glow(SKY, 2, 1);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.71, 128, 1, 0, Math.PI * 1.4), ring2M);
    const discM = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: SKY.clone() }, uA: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; float a = smoothstep(1.0, 0.0, r)*0.35*uA; gl_FragColor = vec4(uColor*a*2.0, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), discM);
    const tickPts: number[] = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, r0 = i % 6 ? 1.04 : 1.02, r1 = i % 6 ? 1.08 : 1.16;
      tickPts.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
    }
    const tickG = new THREE.BufferGeometry();
    tickG.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
    const tickM = new THREE.LineBasicMaterial({ color: SKY.clone().multiplyScalar(2), transparent: true, toneMapped: false });
    const ticks = new THREE.LineSegments(tickG, tickM);
    [ringM, ring2M, tickM].forEach((m) => {
      m.transparent = true;
      m.depthWrite = false;
      (m as THREE.MeshBasicMaterial).side = THREE.DoubleSide;
    });
    this.holoMats = [ringM, ring2M, tickM, discM];
    const spinner = new THREE.Group();
    spinner.add(ring2, ticks);
    this.holo.add(disc, ring, spinner);
    this.holo.userData.spinner = spinner;
    this.holo.rotation.x = -Math.PI / 2;
    this.holo.visible = false;
    this.scene.add(this.holo);
  }

  /* ───────────────────────── 바닥에 서 있는 입체 글자 HANYANG ───────────────────────── */
  private buildLetters() {
    const font = new FontLoader().parse(archivo as any);
    const metal = new THREE.MeshPhysicalMaterial({ color: '#0e4a84', metalness: 0.85, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 });
    const face = new THREE.MeshPhysicalMaterial({ color: '#b9c9e6', metalness: 0.7, roughness: 0.38, clearcoat: 0.6, envMapIntensity: 1.1 });
    const size = 1.3, gap = 0.12;
    const geos = [...'HANYANG'].map((ch) => {
      const g = new TextGeometry(ch, { font, size, depth: 0.5, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 3 });
      g.computeBoundingBox();
      return g;
    });
    const widths = geos.map((g) => g.boundingBox!.max.x - g.boundingBox!.min.x);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (geos.length - 1);
    let x = -total / 2;
    geos.forEach((g, i) => {
      g.translate(-g.boundingBox!.min.x, 0, -0.25);
      // 앞면(z+)은 밝은 크롬, 옆면은 한양 블루 — TextGeometry 그룹 0=앞뒤 면, 1=옆면
      const m = new THREE.Mesh(g, [face, metal]);
      m.position.x = x;
      m.castShadow = m.receiveShadow = true;
      m.userData.x = x;
      x += widths[i] + gap;
      this.letters.push(m);
      this.lettersG.add(m);
    });
    // 글자 밑 발광 라인
    const base = new THREE.Mesh(new THREE.BoxGeometry(total + 0.6, 0.02, 0.02), glow(SKY, 4));
    base.position.set(0, 0.01, 0.4);
    this.lettersG.add(base);
    this.lettersG.position.set(0, FLOOR_Y, -6.2);
    this.scene.add(this.lettersG);
  }

  /* ───────────────────────── 배터리 클로즈업용 에너지 입자 ───────────────────────── */
  private buildBrand() {
    // 배터리 셀에서 솟는 에너지 입자 (배터리 클로즈업용)
    const n = 360;
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) seed.set([(Math.random() - 0.5) * 2.5, Math.random(), (Math.random() - 0.5) * 1.05], i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.userData.seed = seed;
    this.energy = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, map: dotTexture(), color: ACC[0].clone().multiplyScalar(2.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.battery.g.add(this.energy);
  }

  /* ───────────────────────── 사자 (오프닝 전용) ───────────────────────── */
  private buildLion() {
    this.lion = new Lion();
    this.scene.add(this.lion.root);
    this.lion.root.visible = false;
    this.roarWave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 8), new THREE.MeshBasicMaterial({ visible: false }));
  }

  /* ───────────────────────── 오프닝: 달려온 사자가 파편으로 터져 자동차로 다시 조립된다 ───────────────────────── */
  private buildIntro() {
    this.renderer.localClippingEnabled = true;
    this.car.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((mm) => {
        mm.clippingPlanes = [this.clip];
        mm.clipShadows = true;
        if ((mm as THREE.ShaderMaterial).isShaderMaterial) (mm as THREE.ShaderMaterial).clipping = true;
      });
    });
    const N = this.mobile ? 900 : 1800;
    const g = new THREE.TetrahedronGeometry(0.055, 0);
    this.shards = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ toneMapped: false }), N);
    this.shards.frustumCulled = false;
    this.shards.visible = false;
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const k = Math.random();
      c.set(k < 0.7 ? '#173f82' : k < 0.94 ? '#5f95e8' : '#cfe4ff').multiplyScalar(k < 0.7 ? 0.9 : k < 0.94 ? 1.4 : 2.4);
      this.shards.setColorAt(i, c);
    }
    this.sFrom = new Float32Array(N * 3);
    this.sTo = new Float32Array(N * 3);
    this.sMid = new Float32Array(N * 3);
    this.sDel = new Float32Array(N);
    this.scene.add(this.shards);
    // 재조립 경계선을 따라 흐르는 빛의 단면
    this.scanRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: SKY.clone().multiplyScalar(3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
    this.scanRing.scale.set(2.1, 1.3, 1);
    this.scene.add(this.scanRing);
  }

  /* ───────────────────────── 매 프레임 ───────────────────────── */
  private resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.camera.aspect = w / h;
    // 세로 화면에서는 차가 잘리지 않게 뒤로 뺀다
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    this.timer.update();
    if (this.paused) return;
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;
    const S = this.s;
    const portrait = innerWidth / innerHeight < 0.9;

    this.mouseS.lerp(this.mouse, 1 - Math.exp(-dt * 3));

    /* 오프닝 시계: 스크롤을 내리면 바로 완성된 차로 넘어간다 */
    if (!this.introDone) {
      this.introT += dt;
      if (S.hero < 0.97 && this.introT < 2.6) this.introT = 5.3;
      if (this.introT >= 5.3) {
        this.introDone = true;
        this.clip.constant = 1e4;
        this.shards.visible = false;
        (this.scanRing.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }

    /* 차량 위치·방향 */
    const carVisible = true;
    this.car.visible = carVisible;
    let carX = 70 * easeIn3(S.launch);
    if (S.finale > 0) carX = lerp(-40, 0, easeOut3(clamp01(S.finale * 1.25)));
    this.car.position.x = carX;
    this.car.position.y = Math.sin(t * 1.4) * 0.015 * (1 - S.launch);
    const heroSpin = S.hero > 0.6 && S.explode < 0.01;
    const yawTarget = S.launch > 0.01 || S.finale > 0 ? (S.finale > 0 ? -0.55 * smooth(0.6, 1, S.finale) : 0) : -0.42;
    if (!this.introDone) this.carYaw = -0.25;
    else if (heroSpin) {
      let d = -0.25 + Math.sin(t * 0.22) * 0.75 - this.carYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.carYaw += d * (1 - Math.exp(-dt * 2));
    } else {
      let d = yawTarget - this.carYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.carYaw += d * (1 - Math.exp(-dt * 2.5));
    }
    this.car.rotation.y = this.carYaw;

    /* 오프닝: 사자 → 파편 → 자동차 */
    let introFlash = 0;
    if (!this.introDone) {
      const IT = this.introT, tau = IT - 3.0;
      const dir = new THREE.Vector3(Math.cos(this.carYaw), 0, -Math.sin(this.carYaw));
      if (tau >= 0 && !this.burst) {
        this.burst = true;
        sampleSurface(this.lion.root, this.sDel.length, this.sFrom);
        this.clip.constant = 1e4;
        this.car.updateMatrixWorld(true);
        sampleSurface(this.car, this.sDel.length, this.sTo);
        const tv = new THREE.Vector3();
        for (let i = 0; i < this.sDel.length; i++) {
          tv.fromArray(this.sTo, i * 3);
          const lx = tv.dot(dir);
          this.sDel[i] = 0.8 + 1.1 * clamp01((lx + 2.6) / 5.3) - 0.75 + (Math.random() - 0.5) * 0.1;
          this.sMid.set([
            this.sFrom[i * 3] + (Math.random() - 0.3) * 2.2,
            this.sFrom[i * 3 + 1] + 0.8 + Math.random() * 2.2,
            this.sFrom[i * 3 + 2] + (Math.random() - 0.5) * 3,
          ], i * 3);
        }
      }
      const reveal = this.burst ? -2.6 + clamp01((tau - 0.8) / 1.1) * 5.4 : -10;
      this.clip.normal.copy(dir).negate();
      this.clip.constant = reveal;
      this.shards.visible = this.burst && tau < 2.1;
      if (this.shards.visible) {
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
        for (let i = 0; i < this.sDel.length; i++) {
          const u = clamp01((tau - this.sDel[i]) / 0.75);
          const k = u * u * (3 - 2 * u), ik = 1 - k;
          p.set(
            this.sFrom[i * 3] * ik * ik + this.sMid[i * 3] * 2 * ik * k + this.sTo[i * 3] * k * k,
            this.sFrom[i * 3 + 1] * ik * ik + this.sMid[i * 3 + 1] * 2 * ik * k + this.sTo[i * 3 + 1] * k * k,
            this.sFrom[i * 3 + 2] * ik * ik + this.sMid[i * 3 + 2] * 2 * ik * k + this.sTo[i * 3 + 2] * k * k
          );
          const s = u >= 1 ? 0 : 0.7 + 0.9 * Math.sin(Math.PI * Math.min(1, u + 0.15));
          q.setFromEuler(e3.set(i + tau * 7, i * 1.3 + tau * 5, 0));
          this.shards.setMatrixAt(i, m4.compose(p, q, sc.setScalar(s)));
        }
        this.shards.instanceMatrix.needsUpdate = true;
      }
      const sr = this.scanRing.material as THREE.MeshBasicMaterial;
      sr.opacity = this.burst ? smooth(0.8, 0.95, tau) * (1 - smooth(1.8, 1.95, tau)) * 0.55 : 0;
      this.scanRing.position.copy(dir).multiplyScalar(reveal).setY(-0.4);
      this.scanRing.lookAt(this.scanRing.position.clone().add(dir));
      introFlash = this.burst ? smooth(1.7, 1.95, tau) * (1 - smooth(1.95, 2.3, tau)) : 0;
    }

    /* 분해 */
    const e = S.explode;
    const fa = S.focus >= 0 ? easeOut3(S.focusAmt) : 0;
    this.parts.forEach((p, i) => {
      if (p.g === this.wheels[0].g) return;
      const ei = easeOut3(smooth(p.delay, p.delay + 0.6, e));
      // 클로즈업: 주인공 부품만 남고 나머지는 화면 밖으로 비켜난다. 주인공은 커지며 턴테이블처럼 돈다
      const lift = i - 1 === S.focus ? fa : 0;
      const away = S.focus >= 0 && i - 1 !== S.focus ? fa : 0;
      if (p.g.userData.s0 === undefined) p.g.userData.s0 = p.g.scale.x;
      p.g.position.copy(p.base).addScaledVector(p.off, ei).addScaledVector(p.off.clone().normalize(), 0.5 * lift);
      p.g.position.y -= 1.2 * away * away;
      p.g.position.y += Math.sin(t * 1.2 + i * 1.7) * 0.035 * ei;
      p.g.rotation.z = Math.sin(t * 0.7 + i) * 0.03 * ei;
      p.g.userData.turn = lift > 0.01 ? (p.g.userData.turn || 0) + dt * 0.45 : 0;
      p.g.rotation.y = p.g.userData.turn * lift;
      p.g.scale.setScalar(Math.max(1e-4, p.g.userData.s0 * (1 + 0.3 * lift) * (1 - away)));
      p.g.visible = away < 0.97;
    });
    const we = easeOut3(smooth(0.3, 0.9, e));
    this.wheels.forEach((w) => {
      const wl = w === this.wheels[0] && S.focus === 4 ? fa : 0;
      const wa = S.focus >= 0 && !(w === this.wheels[0] && S.focus === 4) ? fa : 0;
      w.g.position.set(w.base.x + Math.sign(w.base.x) * (0.35 * we + 0.3 * wl), w.base.y + Math.sin(t * 1.1 + w.base.x) * 0.03 * we + 0.15 * wl - 1.0 * wa * wa, w.base.z + w.side * (1.1 * we + 0.45 * wl));
      w.g.userData.turn = wl > 0.01 ? (w.g.userData.turn || 0) + dt * 0.45 : 0;
      w.g.rotation.y = w.g.userData.turn * wl;
      w.g.scale.setScalar(Math.max(1e-4, (1 + 0.3 * wl) * (1 - wa)));
      w.g.visible = wa < 0.97;
      const spinRate = 2 + S.launch * 60 + S.finale * 6 + (S.focus === 4 ? S.focusAmt * 3 : 0);
      (w.g.userData.spin as THREE.Group).rotation.z -= dt * spinRate;
    });
    this.susp.forEach((s) => {
      const w = this.wheels[s.wheel].g.position;
      const inner = s.wheel < 99 ? Math.sign(w.z) * 0.42 : 0;
      const len = Math.abs(w.z - inner);
      const mid = (w.z + inner) / 2;
      s.arms.forEach((a) => {
        a.scale.z = len;
        a.position.z = mid;
      });
      const comp = Math.sin(t * 3.2 + w.x) * 0.04 * (0.3 + we);
      s.spring.position.set(w.x, w.y + 0.2 + comp, mid);
      s.spring.scale.y = 1 + comp * 2;
      s.piston.position.set(w.x, w.y + 0.2 + comp, mid);
      s.arms.forEach((a) => (a.position.x = w.x));
      // 다른 부품 클로즈업 중엔 서스펜션 막대도 치운다 (휠 클로즈업이면 앞바퀴 것만 남김)
      const keep = S.focus < 0 || fa < 0.3 || (S.focus === 4 && s.wheel === 0);
      s.arms.forEach((a) => (a.visible = keep));
      s.spring.visible = s.piston.visible = keep;
    });

    /* X-RAY 재질 */
    const xr = smooth(0, 0.55, e);
    const fq = S.focus >= 0 ? S.focusAmt : 0; // 클로즈업 중엔 차체 껍데기를 더 비운다
    this.paint.opacity = lerp(1, 0.14, xr) * (1 - fq * 0.65);
    this.paint.depthWrite = xr < 0.5;
    this.glass.opacity = lerp(0.82, 0.1, xr);
    this.shellMats.forEach((s) => {
      s.m.opacity = s.o * this.paint.opacity;
      s.m.depthWrite = xr < 0.5;
    });
    this.edgeMat.opacity = xr * 0.85 * (1 - fq * 0.92);
    this.bodyGlows.forEach((m) => (m.opacity = 1 - fq * 0.85));
    // 오프닝 중엔 림 셰이더가 클리핑을 못 받으니, 차가 다 조립된 뒤에 켠다
    this.rim.uniforms.uK.value = lerp(0.9, 1.8, xr) * (1 - fq * 0.8) * (this.introDone ? 1 : smooth(4.2, 4.9, this.introT));

    const focusOn = (i: number) => (S.focus === i ? S.focusAmt : 0);

    // 배터리 셀 에너지 파동
    const c = new THREE.Color();
    const cellBoost = (0.45 + e * 0.5) * (1 - focusOn(0) * 0.45);
    for (let i = 0; i < this.cells.count; i++) {
      const ix = Math.floor(i / 7);
      const w = Math.pow(0.5 + 0.5 * Math.sin(ix * 0.7 - t * 4), 6);
      // 클로즈업하면 셀이 민트→블루 그라데이션으로 충전되듯 차오른다
      const fb = focusOn(0);
      const col = SKY.clone().lerp(ACC[0].clone().lerp(new THREE.Color('#3f7dff'), ix / 13), fb);
      const charge = fb > 0 ? (ix / 13 < ((t * 0.35) % 1.2) ? 1 : 0.25) : 1;
      c.copy(col).multiplyScalar((0.18 + w * 2.2 * cellBoost) * (1 - fb) + fb * (0.18 + 0.7 * charge + w * 0.35));
      this.cells.setColorAt(i, c);
    }
    this.cells.instanceColor!.needsUpdate = true;
    this.lid.position.y = 0.15 + focusOn(0) * 0.25;
    this.lid.rotation.x = -focusOn(0) * 0.5; // 덮개가 경첩처럼 열린다
    {
      const ep = this.energy.geometry.attributes.position as THREE.BufferAttribute;
      const seed = this.energy.geometry.userData.seed as Float32Array;
      for (let i = 0; i < ep.count; i++) {
        const u = (seed[i * 3 + 1] + t * 0.35) % 1;
        ep.setXYZ(i, seed[i * 3] + Math.sin(t + i) * 0.02, 0.12 + u * 1.3, seed[i * 3 + 2]);
      }
      ep.needsUpdate = true;
      (this.energy.material as THREE.PointsMaterial).opacity = focusOn(0) * 0.6;
    }

    // 라이다
    this.lidarSpin.rotation.y += dt * (6 + focusOn(1) * 10);
    const lidarWorld = this.lidar.g.getWorldPosition(new THREE.Vector3());
    const scanMat = this.scan.material as THREE.ShaderMaterial;
    scanMat.uniforms.uTime.value = t;
    scanMat.uniforms.uOrigin.value.copy(lidarWorld).add(new THREE.Vector3(0, 0.1, 0));
    scanMat.uniforms.uAmt.value = carVisible ? ((0.18 + e * 0.5) * (1 - fa) + focusOn(1) * 1.2) * (1 - S.launch) : 0;

    // 모터
    this.rotor.rotation.z -= dt * (8 + focusOn(2) * 30 + S.launch * 40);
    this.coils.forEach((m, i) => m.color.copy(SKY).multiplyScalar(0.8 + (0.5 + 0.5 * Math.sin(t * 9 - i)) * (0.8 + focusOn(2) * 1.6)));
    const sp = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.24 + Math.random() * 0.12 * (Math.random() < 0.1 ? 3 : 1);
      sp.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, (Math.random() - 0.5) * 0.6);
    }
    sp.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).opacity = (0.15 + focusOn(2) * 0.6) * (0.6 + Math.random() * 0.4) * e;

    // 뇌파 신경망
    {
      const amt = 0.15 + e * 0.5 + focusOn(3) * 1.6;
      const pc = this.neural.pts.geometry.attributes.color as THREE.BufferAttribute;
      const v = this.neural.phase.map((ph) => Math.pow(0.5 + 0.5 * Math.sin(t * 5 + ph), 4));
      v.forEach((k, i) => pc.setXYZ(i, SKY.r * (0.3 + k * 3) * amt, SKY.g * (0.3 + k * 3) * amt, SKY.b * (0.3 + k * 3) * amt));
      pc.needsUpdate = true;
      const lc = this.neural.lines.geometry.attributes.color as THREE.BufferAttribute;
      this.neural.pairs.forEach(([a, b], i) => {
        const ka = 0.15 + v[a] * 1.6, kb = 0.15 + v[b] * 1.6;
        lc.setXYZ(i * 2, SKY.r * ka * amt, SKY.g * ka * amt, SKY.b * ka * amt);
        lc.setXYZ(i * 2 + 1, SKY.r * kb * amt, SKY.g * kb * amt, SKY.b * kb * amt);
      });
      lc.needsUpdate = true;
    }

    // 에너지 흐름
    {
      const src = this.battery.g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
      const amt = carVisible ? e * (1 - S.launch) * (1 - fa) : 0;
      const pp = this.flow.geometry.attributes.position as THREE.BufferAttribute;
      const pa = this.flow.geometry.attributes.aA as THREE.BufferAttribute;
      const lp = this.flowLines.geometry.attributes.position as THREE.BufferAttribute;
      const per = pp.count / this.streams.length;
      const segs = lp.count / 2 / this.streams.length;
      const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), q = new THREE.Vector3(), q2 = new THREE.Vector3();
      const bez = (u: number, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) => {
        const iu = 1 - u;
        return out
          .copy(a)
          .multiplyScalar(iu * iu * iu)
          .addScaledVector(p1, 3 * iu * iu * u)
          .addScaledVector(p2, 3 * iu * u * u)
          .addScaledVector(b, u * u * u);
      };
      this.streams.forEach((s, si) => {
        const dst = s.to();
        p1.copy(src).lerp(dst, 0.3).setY(src.y - 0.25);
        p2.copy(src).lerp(dst, 0.7).setY(dst.y + 0.35);
        for (let j = 0; j < per; j++) {
          const u = (t * 0.45 + j / per + si * 0.13) % 1;
          bez(u, src, dst, q);
          pp.setXYZ(si * per + j, q.x, q.y, q.z);
          pa.setX(si * per + j, Math.sin(Math.PI * u) * amt * (0.6 + 0.4 * Math.sin(j * 1.7)));
        }
        for (let k = 0; k < segs; k++) {
          bez(k / segs, src, dst, q);
          bez((k + 1) / segs, src, dst, q2);
          const o = (si * segs + k) * 2;
          lp.setXYZ(o, q.x, q.y, q.z);
          lp.setXYZ(o + 1, q2.x, q2.y, q2.z);
        }
      });
      pp.needsUpdate = pa.needsUpdate = lp.needsUpdate = true;
      (this.flowLines.material as THREE.LineBasicMaterial).opacity = amt * 0.35;
    }

    // 부스터 · 속도선
    const boost = Math.max(smooth(0, 0.25, S.launch) * (1 - smooth(0.9, 1, S.launch)), smooth(0, 0.4, S.finale) * (1 - smooth(0.55, 0.85, S.finale)) * 0.8);
    this.boosters.forEach((b) => {
      const m = b.material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = t;
      m.uniforms.uAmt.value = boost;
      b.scale.set(1, 0.6 + boost * 0.9 + Math.random() * 0.15 * boost, 1);
    });
    const streakAmt = Math.sin(Math.PI * clamp01(S.launch)) * 0.6;
    (this.streaks.material as THREE.MeshBasicMaterial).opacity = streakAmt;
    if (streakAmt > 0.001) {
      const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
      this.streakData.forEach((d, i) => {
        d.x -= dt * d.v * (20 + 120 * S.launch);
        if (d.x < -40) d.x += 80;
        this.streaks.setMatrixAt(i, m4.compose(p4.set(d.x + carX * 0.5, d.y, d.z), q4, s4.set(d.len * (1 + S.launch * 3), 1, 1)));
      });
      this.streaks.instanceMatrix.needsUpdate = true;
    }
    this.underGlow.intensity = carVisible ? 0.5 + e * 2 + boost * 12 + introFlash * 30 : 0;
    this.underGlow.position.x = carX;

    /* ───── 사자: 화면 왼쪽 밖에서 질주해 들어와 차로 뛰어들며 변신 ───── */
    {
      const lion = this.lion;
      const L = lion.pose;
      const IT = this.introT;
      const on = !this.introDone && IT < 3.0;
      lion.root.visible = on;
      if (on) {
        const dir = new THREE.Vector3(Math.cos(this.carYaw), 0, -Math.sin(this.carYaw));
        const run = -15 + Math.max(0, IT - 0.2) * 5.2;
        const leap = smooth(2.7, 3.0, IT);
        lion.root.position.copy(dir).multiplyScalar(run).setY(FLOOR_Y + Math.sin(Math.PI * leap) * 0.9 * (IT > 2.7 ? 1 : 0));
        lion.root.rotation.set(0, this.carYaw, 0);
        lion.root.scale.setScalar(1.05);
        L.speed = 5.2 / 1.05;
        L.gait = 1;
        L.roar = 0;
        L.look = 0;
        L.bow = 0;
        lion.update(dt);
      }
    }

    /* 입체 글자: 첫 화면과 마지막 화면에서만 바닥에서 솟아오른다 */
    {
      const amt = Math.max(S.hero * (this.introDone ? 1 : smooth(4.3, 5.3, this.introT)), smooth(0.3, 0.9, S.finale));
      this.lettersG.visible = amt > 0.01;
      this.lettersG.scale.setScalar(portrait ? 0.6 : 1); // 세로 화면에선 글자가 잘리지 않게
      this.letters.forEach((m, i) => {
        const k = easeOut3(smooth(i * 0.06, 0.6 + i * 0.06, amt));
        m.position.y = -2.2 * (1 - k) + Math.sin(t * 1.1 + i * 0.7) * 0.03 * k;
        m.rotation.y = (1 - k) * 0.8 + Math.sin(t * 0.5 + i) * 0.03;
      });
    }

    /* 공기·조명 */
    const ambient = (1 - S.launch * 0.7) + S.finale;
    this.beams.forEach((b, i) => ((b.material as THREE.ShaderMaterial).uniforms.uAmt.value = ambient * (0.8 + 0.2 * Math.sin(t * 0.8 + i))));
    const dp = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) {
      let y = dp.getY(i) + dt * 0.05;
      if (y > FLOOR_Y + 7) y = FLOOR_Y;
      dp.setY(i, y);
    }
    dp.needsUpdate = true;
    const grid = this.scene.getObjectByName('grid') as THREE.Mesh;
    const gm = grid.material as THREE.ShaderMaterial;
    gm.uniforms.uTime.value = t;
    gm.uniforms.uPulse.value = 0.4 + e * 0.6;
    (this.wordmark.material as THREE.MeshBasicMaterial).opacity = S.hero * 0.85;

    /* 클로즈업 무대: 스포트라이트 · 홀로그램 받침 · 주변 조명 낮춤 */
    if (S.focus >= 0 && fa > 0.001 && carVisible) {
      const fpart = this.parts[S.focus + 1];
      const gp = fpart.g.getWorldPosition(new THREE.Vector3());
      const drop = [0.08, 0.06, 0.32, 0.08, 0.42][S.focus];
      const size = [2.2, 0.5, 0.7, 0.75, 0.8][S.focus];
      this.holo.visible = true;
      this.holo.position.set(gp.x, gp.y - drop, gp.z);
      this.holo.scale.setScalar(size * (0.85 + 0.15 * fa));
      (this.holo.userData.spinner as THREE.Group).rotation.z = t * 0.6;
      this.holoMats.forEach((m) => {
        if ((m as THREE.ShaderMaterial).uniforms) (m as THREE.ShaderMaterial).uniforms.uA.value = fa;
        else m.opacity = fa;
      });
      this.focusSpot.intensity = [22, 40, 40, 40, 26][S.focus] * fa;
      this.focusSpot.color.copy(ACC[S.focus]).lerp(new THREE.Color('#ffffff'), 0.45);
      this.holoMats.forEach((m) => {
        const mm = m as any;
        if (mm.uniforms) mm.uniforms.uColor.value.copy(ACC[S.focus]);
        else mm.color.copy(ACC[S.focus]).multiplyScalar(2.6);
      });
      this.focusSpot.position.copy(gp).add(new THREE.Vector3(0.8, 3.2, 1.6));
      this.focusSpot.target.position.copy(gp);
    } else {
      this.holo.visible = false;
      this.focusSpot.intensity = 0;
    }
    this.key.intensity = 2.4 * (1 - 0.5 * fa);
    this.scene.environmentIntensity = 0.55 * (1 - 0.45 * fa);

    /* 카메라 */
    const pos = new THREE.Vector3(1.6, 1.7, 9.6);
    const tgt = new THREE.Vector3(0, -0.05, -2.4);
    let fov = 36;
    pos.lerp(new THREE.Vector3(7.4, 3.8, 10.0), smooth(0, 0.6, e));
    tgt.lerp(new THREE.Vector3(-0.3, 0.4, 0.2), smooth(0, 0.6, e));
    fov = lerp(fov, 40, smooth(0, 0.6, e));
    if (S.focus >= 0 && S.focusAmt > 0) {
      const fp = this.parts[S.focus + 1].anchor.getWorldPosition(new THREE.Vector3());
      const dirs = [
        new THREE.Vector3(0.75, 0.5, 1.0),
        new THREE.Vector3(0.9, 0.45, 1.0),
        new THREE.Vector3(-0.8, 0.35, 1.1),
        new THREE.Vector3(0.9, 0.3, 1.0),
        new THREE.Vector3(0.55, 0.25, 1.2),
      ];
      const dist = [7.2, 2.9, 3.6, 3.3, 3.5][S.focus];
      const fpos = fp.clone().addScaledVector(dirs[S.focus].normalize(), dist);
      const k = easeOut3(S.focusAmt);
      pos.lerp(fpos, k);
      tgt.lerp(fp, k);
      fov = lerp(fov, 34, k);
    }
    const lk = smooth(0, 0.3, S.launch);
    pos.lerp(new THREE.Vector3(-3.4 + carX * 0.15, -0.05, 5.2), lk);
    tgt.lerp(new THREE.Vector3(carX + 1.5, -0.42, 0), lk);
    fov = lerp(fov, 58, smooth(0.05, 0.6, S.launch) * (1 - smooth(0.9, 1, S.launch)));
    const fk = smooth(0, 0.8, S.finale);
    pos.lerp(new THREE.Vector3(1.4, 1.6, 9.2), fk);
    tgt.lerp(new THREE.Vector3(carX * 0.3, -0.05, -2.4), fk);
    fov = lerp(fov, 34, fk);

    if (portrait) {
      pos.sub(tgt).multiplyScalar(1.55).add(tgt);
      fov += 6;
    }
    // 마우스 패럴랙스 (관성 있게)
    const right = new THREE.Vector3().subVectors(pos, tgt).cross(new THREE.Vector3(0, 1, 0)).normalize();
    pos.addScaledVector(right, -this.mouseS.x * 0.7).add(new THREE.Vector3(0, this.mouseS.y * 0.45, 0));
    // 발사 순간 카메라 진동
    const shake = boost * 0.03 + introFlash * 0.05;
    pos.x += (Math.random() - 0.5) * shake;
    pos.y += (Math.random() - 0.5) * shake;

    const kk = 1 - Math.exp(-dt * 3.2);
    this.camPos.lerp(pos, kk);
    this.camTgt.lerp(tgt, kk);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTgt);
    this.camera.fov = lerp(this.camera.fov, fov, kk);
    // 화면 구도: 글이 있는 반대편으로 차를 비켜 세운다 (카메라는 그대로, 투영만 이동)
    let sx = 0, sy = 0;
    if (portrait) {
      sy = lerp(0.1, 0.16, smooth(0, 0.5, e)) * (1 - fk) - fk * 0.08;
    } else {
      sx = lerp(0.1, 0.13, smooth(0, 0.5, e));
      sx = lerp(sx, 0, S.hero);
      sy = 0.04 * S.hero; // 첫 화면: 3D 글자와 차를 가운데에
      const fq2 = S.focus >= 0 ? easeOut3(S.focusAmt) : 0;
      sx = lerp(sx, 0.14, fq2); // 설명 카드는 왼쪽 아래, 부품은 가운데-오른쪽
      sy = lerp(sy, 0.04, fq2);
      sx = lerp(sx, 0.04, lk);
      sx = lerp(sx, 0, fk);
      sy = lerp(sy, -0.12, fk);
    }
    this.shift.lerp(new THREE.Vector2(sx, sy), kk);
    const W = innerWidth, Hh = innerHeight;
    this.camera.setViewOffset(W, Hh, -this.shift.x * W, this.shift.y * Hh, W, Hh);
    this.camera.updateProjectionMatrix();

    /* 렌즈 */
    this.lensPass.uniforms.uTime.value = t;
    this.lensPass.uniforms.uCA.value = 0.0025 + boost * 0.012 + S.focusAmt * 0.002;
    this.bloom.strength = 0.7 + e * 0.15 - S.focusAmt * 0.2 + boost * 0.5 + introFlash * 0.8;
    // 오프닝 클로즈업에선 빛 번짐을 줄여 하이리온 얼굴이 하얗게 날아가지 않게
    this.updateLabels(e, carVisible);
    this.composer.render(dt);
  };

  private updateLabels(e: number, carVisible: boolean) {
    if (!this.labels.length) return;
    const w = innerWidth, h = innerHeight;
    const S = this.s;
    const v = new THREE.Vector3();
    const place = (el: HTMLElement | undefined, o: THREE.Object3D, alpha: number) => {
      if (!el) return;
      o.getWorldPosition(v).project(this.camera);
      const behind = v.z > 1;
      const a = behind ? 0 : alpha;
      el.style.opacity = a.toFixed(3);
      el.style.visibility = a < 0.01 ? 'hidden' : 'visible';
      // tag--left 라벨은 점 왼쪽으로 글씨를 붙인다 (이웃 라벨과 겹치지 않게)
      const dx = el.classList.contains('tag--left') ? el.offsetWidth : 0;
      const px = Math.min(Math.max((v.x * 0.5 + 0.5) * w - dx, 6), w - el.offsetWidth - 6); // 화면 밖으로 잘리지 않게
      if (a >= 0.01) el.style.transform = `translate3d(${px.toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0)`;
    };
    const partAlpha = carVisible ? smooth(0.55, 0.9, e) * (1 - S.launch) : 0;
    for (let i = 0; i < 5; i++) {
      const focusDim = S.focus >= 0 && S.focus !== i ? 1 - Math.min(1, S.focusAmt * 2) : 1;
      place(this.labels[i], this.parts[i + 1].anchor, partAlpha * focusDim);
      this.labels[i]?.classList.toggle('on', S.focus === i && S.focusAmt > 0.5);
    }
  }
}
