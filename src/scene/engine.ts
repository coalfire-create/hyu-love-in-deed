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

export interface EngineState {
  hero: number; // 1 = 첫 화면
  explode: number; // 0 조립 → 1 분해
  focus: number; // 집중할 부품 번호 (0~4), -1 = 없음
  focusAmt: number; // 부품 클로즈업 정도
  launch: number; // 0 → 1 발사
  campus: number; // 캠퍼스 맵 상승
  finale: number; // 마지막 귀환
}

const SKY = new THREE.Color('#7fb2ff');
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
  private camPos = new THREE.Vector3(5.4, 1.5, 6.4);
  private camTgt = new THREE.Vector3(0, -0.1, 0);
  private raf = 0;
  private timer = new THREE.Timer();
  private time = 0;
  private mobile: boolean;
  private mouse = new THREE.Vector2();
  private mouseS = new THREE.Vector2();
  private shift = new THREE.Vector2(0.12, 0);

  private s: EngineState = { hero: 1, explode: 0, focus: -1, focusAmt: 0, launch: 0, campus: 0, finale: 0 };

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
  private campusG = new THREE.Group();
  private blocks!: THREE.InstancedMesh;
  private blockTops!: THREE.InstancedMesh;
  private blockData: { x: number; z: number; h: number; d: number; top: boolean }[] = [];
  private arcFlow!: THREE.Points;
  private arcCurve!: THREE.QuadraticBezierCurve3;
  private campusAnchors: THREE.Object3D[] = [];
  private beams: THREE.Mesh[] = [];
  private dust!: THREE.Points;
  private wordmark!: THREE.Mesh;
  private underGlow!: THREE.PointLight;

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
    this.buildCampus();

    this.resize();
    addEventListener('resize', this.onResizeBound);
    addEventListener('pointermove', this.onMoveBound);
    this.raf = requestAnimationFrame(this.tick);
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

    const key = new THREE.DirectionalLight('#ffffff', 2.4);
    key.position.set(4, 9, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -7;
    key.shadow.camera.right = key.shadow.camera.top = 7;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    sc.add(key);

    const rimL = new THREE.SpotLight('#3e7fd1', 160, 30, 0.6, 0.6, 2);
    rimL.position.set(-6, 4.5, -5);
    rimL.target.position.set(0, 0, 0);
    sc.add(rimL, rimL.target);
    const fill = new THREE.SpotLight('#cfe0ff', 50, 25, 0.7, 0.8, 2);
    fill.position.set(6, 2, -3);
    sc.add(fill);

    this.underGlow = new THREE.PointLight(SKY, 6, 5, 2);
    this.underGlow.position.set(0, -0.75, 0);
    sc.add(this.underGlow);

    // 반사 바닥 (모바일은 성능상 생략)
    if (!this.mobile) {
      const mirror = new Reflector(new THREE.PlaneGeometry(80, 80), {
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
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: '#04070e', metalness: 0.2, roughness: 0.55, transparent: true, opacity: this.mobile ? 1 : 0.86 })
    );
    tint.rotation.x = -Math.PI / 2;
    tint.position.y = FLOOR_Y - 0.001;
    tint.receiveShadow = true;
    sc.add(tint);
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.6 }));
    shadowCatcher.rotation.x = -Math.PI / 2;
    shadowCatcher.position.y = FLOOR_Y;
    shadowCatcher.receiveShadow = true;
    sc.add(shadowCatcher);

    // 바닥 그리드 + 차량 아래 원형 발광
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: SKY.clone() }, uTime: { value: 0 }, uPulse: { value: 0 } },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPulse; varying vec3 vW;
          float line(float x, float w){ float d = abs(fract(x-0.5)-0.5)/max(fwidth(x), 1e-4); return 1.0-min(d/w,1.0); }
          void main(){
            float r = length(vW.xz);
            float g = max(line(vW.x*1.0, 1.0), line(vW.z*1.0, 1.0))*0.22 + max(line(vW.x*0.25, 1.2), line(vW.z*0.25, 1.2))*0.35;
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
    grid.position.y = FLOOR_Y + 0.002;
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

    /* 차체 셸 */
    {
      const g = new THREE.Group();
      const s = new THREE.Shape();
      s.moveTo(-2.05, -0.32);
      s.lineTo(2.0, -0.32);
      s.quadraticCurveTo(2.26, -0.3, 2.22, -0.1);
      s.quadraticCurveTo(1.9, 0.04, 1.15, 0.1);
      s.quadraticCurveTo(0.55, 0.46, -0.25, 0.46);
      s.quadraticCurveTo(-1.15, 0.46, -1.85, 0.16);
      s.quadraticCurveTo(-2.14, 0.08, -2.1, -0.08);
      s.lineTo(-2.05, -0.32);
      const depth = 1.46;
      const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.1, bevelSegments: 10, curveSegments: 40 });
      geo.translate(0, 0, -depth / 2);
      geo.computeVertexNormals();
      this.paint = new THREE.MeshPhysicalMaterial({
        color: '#0a2f66',
        metalness: 0.78,
        roughness: 0.24,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        iridescence: 0.35,
        iridescenceIOR: 1.6,
        transparent: true,
        envMapIntensity: 1.6,
      });
      const shell = new THREE.Mesh(geo, this.paint);
      g.add(shell);
      this.rim = rimMat(SKY, 2.4, 0.9);
      const rimMesh = new THREE.Mesh(geo, this.rim);
      rimMesh.scale.setScalar(1.003);
      g.add(rimMesh);
      this.edgeMat = new THREE.LineBasicMaterial({ color: SKY.clone().multiplyScalar(2.2), transparent: true, opacity: 0, toneMapped: false });
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), this.edgeMat));

      // 캐노피 유리
      const c = new THREE.Shape();
      c.moveTo(1.1, 0.12);
      c.quadraticCurveTo(0.55, 0.58, -0.25, 0.6);
      c.quadraticCurveTo(-0.95, 0.6, -1.45, 0.27);
      c.lineTo(1.1, 0.12);
      const cg = new THREE.ExtrudeGeometry(c, { depth: 1.04, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.06, bevelSegments: 8, curveSegments: 32 });
      cg.translate(0, 0, -0.52);
      this.glass = new THREE.MeshPhysicalMaterial({ color: '#081426', metalness: 0.3, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.82, envMapIntensity: 2.6 });
      g.add(new THREE.Mesh(cg, this.glass));

      // 발광 라인: 헤드라이트 · 테일 · 숄더 라인
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 1.3), glow(SKY, 7));
      head.position.set(2.31, -0.12, 0);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 1.4), glow('#ff4f7b', 5));
      tail.position.set(-2.22, 0.02, 0);
      g.add(head, tail);
      for (const side of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(2.15, -0.16, side * 0.895),
          new THREE.Vector3(1.2, 0.0, side * 0.895),
          new THREE.Vector3(-0.4, 0.03, side * 0.895),
          new THREE.Vector3(-2.0, 0.04, side * 0.895),
        ]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.007, 6), glow(SKY, 3.5)));
      }
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if ((o as THREE.Mesh).isMesh && m.type === 'MeshBasicMaterial') {
          m.transparent = true;
          this.bodyGlows.push(m);
        }
      });
      this.body = this.addPart(g, [0, 0, 0], [0, 1.55, 0], 0.0, [0.8, 0.5, 0.9]);
    }

    /* 01 배터리 팩 */
    {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new RoundedBoxGeometry(3.1, 0.12, 1.5, 3, 0.035), dark));
      const nx = 15, nz = 7;
      this.cells = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.085, 16), new THREE.MeshBasicMaterial({ toneMapped: false }), nx * nz);
      const m = new THREE.Matrix4();
      let k = 0;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          m.makeTranslation((i - (nx - 1) / 2) * 0.19, 0.1, (j - (nz - 1) / 2) * 0.19);
          this.cells.setMatrixAt(k, m);
          this.cells.setColorAt(k++, SKY);
        }
      g.add(this.cells);
      this.lid = new THREE.Mesh(
        new RoundedBoxGeometry(3.1, 0.03, 1.5, 2, 0.012),
        new THREE.MeshPhysicalMaterial({ color: '#9fc4ff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.18, envMapIntensity: 2 })
      );
      this.lid.position.y = 0.17;
      g.add(this.lid);
      this.battery = this.addPart(g, [0, -0.52, 0], [0, -0.3, 0], 0.1, [0.9, 0.15, 0.55]);
    }

    /* 02 라이다 */
    {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.08, 48), dark));
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshPhysicalMaterial({ color: '#0d1d36', metalness: 0.2, roughness: 0.02, transparent: true, opacity: 0.55, envMapIntensity: 3 })
      );
      dome.position.y = 0.04;
      g.add(dome);
      this.lidarSpin = new THREE.Group();
      this.lidarSpin.position.y = 0.09;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 8, 48), glow(SKY, 5));
      ring.rotation.x = Math.PI / 2;
      const emitter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), glow('#ffffff', 8));
      emitter.position.x = 0.1;
      this.lidarSpin.add(ring, emitter);
      g.add(this.lidarSpin);
      this.lidar = this.addPart(g, [-0.2, 0.67, 0], [0, 2.0, 0], 0.2, [0, 0.12, 0]);
    }

    /* 03 모터 + 인버터 */
    {
      const g = new THREE.Group();
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
      // 플라즈마 스파크
      const n = 260;
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
      this.sparks = new THREE.Points(
        sg,
        new THREE.PointsMaterial({ size: 0.05, map: dotTexture(), color: SKY.clone().multiplyScalar(4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
      );
      g.add(this.sparks);
      this.motor = this.addPart(g, [-1.45, -0.55, 0], [-1.25, 0.35, 0], 0.15, [0, 0.36, 0.2]);
    }

    /* 04 콕핏 + 뇌파 신경망 */
    {
      const g = new THREE.Group();
      const leather = new THREE.MeshStandardMaterial({ color: '#151c2a', metalness: 0.2, roughness: 0.62 });
      const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.1, 0.5, 3, 0.04), leather);
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.62, 0.5, 3, 0.04), leather);
      back.position.set(-0.28, 0.3, 0);
      back.rotation.z = 0.25;
      const headrest = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.16, 0.3, 3, 0.035), leather);
      headrest.position.set(-0.37, 0.67, 0);
      headrest.rotation.z = 0.25;
      const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 12, 48, Math.PI * 1.3), chrome);
      yoke.position.set(0.58, 0.32, 0);
      yoke.rotation.set(0, Math.PI / 2, -Math.PI * 0.15 - Math.PI / 2);
      g.add(cushion, back, headrest, yoke);

      const center = new THREE.Vector3(-0.33, 0.78, 0);
      const N = 70;
      const nodes: THREE.Vector3[] = [];
      while (nodes.length < N) {
        const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        if (v.length() > 1 || v.length() < 0.55) continue;
        nodes.push(v.multiply(new THREE.Vector3(0.36, 0.3, 0.42)).add(center));
      }
      const pairs: [number, number][] = [];
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (nodes[i].distanceTo(nodes[j]) < 0.2) pairs.push([i, j]);
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
      this.cockpit = this.addPart(g, [0.25, -0.3, 0], [0.1, 0.85, 0], 0.25, [-0.33, 0.78, 0]);
    }

    /* 05 휠 + 로보틱 서스펜션 */
    for (const [x, side] of [[1.45, 1], [1.45, -1], [-1.45, 1], [-1.45, -1]] as const) {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.12, 32, 72), rubber);
      const rimDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.1, 48), chrome);
      rimDisc.rotation.x = Math.PI / 2;
      const spin = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.04), dark);
        sp.rotation.z = (i / 5) * Math.PI * 2;
        sp.position.z = side * 0.06;
        spin.add(sp);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.006, 6, 64), glow(SKY, 4));
      ring.position.z = side * 0.065;
      const hub = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), glow(SKY, 6));
      hub.position.z = side * 0.09;
      if (side < 0) hub.rotation.y = Math.PI;
      spin.add(tire, rimDisc, ring, hub);
      g.add(spin);
      g.userData.spin = spin;
      g.position.set(x, -0.58, side * 1.02);
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.car.add(g);
      this.wheels.push({ g, base: g.position.clone(), side });

      const arms = [0, 1].map((k) => {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 1), chrome);
        a.position.set(x, k ? -0.47 : -0.66, 0);
        a.castShadow = true;
        this.car.add(a);
        return a;
      });
      const helix = new THREE.Curve<THREE.Vector3>();
      helix.getPoint = (t: number, target = new THREE.Vector3()) => target.set(Math.cos(t * Math.PI * 14) * 0.055, t * 0.32 - 0.16, Math.sin(t * Math.PI * 14) * 0.055);
      const spring = new THREE.Mesh(new THREE.TubeGeometry(helix, 160, 0.011, 6), chrome);
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 12), glow(SKY, 3));
      this.car.add(spring, piston);
      this.susp.push({ arms, spring, piston, wheel: this.wheels.length - 1 });
    }
    // 휠은 Part 배열 대신 따로 관리하지만, 라벨용 앵커는 앞바퀴에 둔다
    const wa = new THREE.Object3D();
    wa.position.set(0, 0.45, 0);
    this.wheels[0].g.add(wa);
    this.parts.push({ g: this.wheels[0].g, base: this.wheels[0].base, off: new THREE.Vector3(), delay: 0.3, anchor: wa });
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
      m.position.set(-2.25 - 1.2, -0.08, z);
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
  }

  /* ───────────────────────── 캠퍼스: 서울 · ERICA 3D 맵 ───────────────────────── */
  private buildCampus() {
    const clusters = [
      { c: new THREE.Vector3(-3.7, 0, -1.2), r: 2.8 },
      { c: new THREE.Vector3(3.4, 0, 1.6), r: 3.1 },
    ];
    for (const { c, r } of clusters) {
      for (let gx = -12; gx <= 12; gx++)
        for (let gz = -12; gz <= 12; gz++) {
          const x = gx * 0.42 + (Math.random() - 0.5) * 0.06, z = gz * 0.42;
          const d = Math.hypot(x, z) / r;
          if (d > 1 || Math.random() < 0.18) continue;
          const h = (0.15 + Math.pow(Math.random(), 3) * 2.8) * (1.05 - d * 0.6);
          this.blockData.push({ x: c.x + x, z: c.z + z, h, d, top: Math.random() < 0.16 });
        }
      const a = new THREE.Object3D();
      a.position.set(c.x, 2.3, c.z);
      this.campusG.add(a);
      this.campusAnchors.push(a);
    }
    const bg = new THREE.BoxGeometry(0.32, 1, 0.32);
    bg.translate(0, 0.5, 0);
    this.blocks = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: '#0f2a4f', metalness: 0.7, roughness: 0.3, envMapIntensity: 1.2 }), this.blockData.length);
    this.blocks.castShadow = this.blocks.receiveShadow = true;
    const tops = this.blockData.filter((b) => b.top).length;
    this.blockTops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.33, 0.025, 0.33), glow(SKY, 4), tops);
    this.campusG.add(this.blocks, this.blockTops);

    // 두 캠퍼스를 잇는 데이터 아치
    this.arcCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-3.7, 1.5, -1.2), new THREE.Vector3(0, 6, 0), new THREE.Vector3(3.4, 1.8, 1.6));
    const an = 220;
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(an * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.arcFlow = new THREE.Points(ag, new THREE.PointsMaterial({ size: 0.09, map: dotTexture(), color: SKY.clone().multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.arcFlow.frustumCulled = false;
    const arcLine = new THREE.Mesh(new THREE.TubeGeometry(this.arcCurve, 80, 0.008, 6), glow(SKY, 2, 0.6));
    this.campusG.add(this.arcFlow, arcLine);
    this.campusG.visible = false;
    this.scene.add(this.campusG);
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
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;
    const S = this.s;
    const portrait = innerWidth / innerHeight < 0.9;

    this.mouseS.lerp(this.mouse, 1 - Math.exp(-dt * 3));

    /* 차량 위치·방향 */
    const carVisible = S.campus < 0.35 || S.finale > 0.02;
    this.car.visible = carVisible;
    let carX = 70 * easeIn3(S.launch);
    if (S.finale > 0) carX = lerp(-40, 0, easeOut3(clamp01(S.finale * 1.25)));
    this.car.position.x = carX;
    this.car.position.y = Math.sin(t * 1.4) * 0.015 * (1 - S.launch);
    const heroSpin = S.hero > 0.6 && S.explode < 0.01;
    const yawTarget = S.launch > 0.01 || S.finale > 0 ? (S.finale > 0 ? -0.55 * smooth(0.6, 1, S.finale) : 0) : -0.42;
    if (heroSpin) {
      let d = -0.25 + Math.sin(t * 0.22) * 0.75 - this.carYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.carYaw += d * (1 - Math.exp(-dt * 2));
    } else {
      let d = yawTarget - this.carYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.carYaw += d * (1 - Math.exp(-dt * 2.5));
    }
    this.car.rotation.y = this.carYaw;

    /* 분해 */
    const e = S.explode;
    this.parts.forEach((p, i) => {
      if (p.g === this.wheels[0].g) return;
      const ei = easeOut3(smooth(p.delay, p.delay + 0.6, e));
      p.g.position.copy(p.base).addScaledVector(p.off, ei);
      p.g.position.y += Math.sin(t * 1.2 + i * 1.7) * 0.035 * ei;
      p.g.rotation.z = Math.sin(t * 0.7 + i) * 0.03 * ei;
    });
    const we = easeOut3(smooth(0.3, 0.9, e));
    this.wheels.forEach((w) => {
      w.g.position.set(w.base.x, w.base.y + Math.sin(t * 1.1 + w.base.x) * 0.03 * we, w.side * (1.02 + 1.0 * we));
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
      s.spring.position.set(w.x, -0.42 + comp, mid);
      s.spring.scale.y = 1 + comp * 2;
      s.piston.position.set(w.x, -0.42 + comp, mid);
    });

    /* X-RAY 재질 */
    const xr = smooth(0, 0.55, e);
    const fq = S.focus >= 0 ? S.focusAmt : 0; // 클로즈업 중엔 차체 껍데기를 더 비운다
    this.paint.opacity = lerp(1, 0.14, xr) * (1 - fq * 0.65);
    this.paint.depthWrite = xr < 0.5;
    this.glass.opacity = lerp(0.82, 0.1, xr);
    this.edgeMat.opacity = xr * 0.85 * (1 - fq * 0.6);
    this.bodyGlows.forEach((m) => (m.opacity = 1 - fq * 0.85));
    this.rim.uniforms.uK.value = lerp(0.9, 1.8, xr) * (1 - fq * 0.8);

    const focusOn = (i: number) => (S.focus === i ? S.focusAmt : 0);

    // 배터리 셀 에너지 파동
    const c = new THREE.Color();
    const cellBoost = 0.45 + e * 0.5 + focusOn(0) * 0.6;
    for (let i = 0; i < this.cells.count; i++) {
      const ix = Math.floor(i / 7);
      const w = Math.pow(0.5 + 0.5 * Math.sin(ix * 0.7 - t * 4), 6);
      c.copy(SKY).multiplyScalar(0.18 + w * 2.2 * cellBoost);
      this.cells.setColorAt(i, c);
    }
    this.cells.instanceColor!.needsUpdate = true;
    this.lid.position.y = 0.17 + focusOn(0) * 0.35;

    // 라이다
    this.lidarSpin.rotation.y += dt * (6 + focusOn(1) * 10);
    const lidarWorld = this.lidar.g.getWorldPosition(new THREE.Vector3());
    const scanMat = this.scan.material as THREE.ShaderMaterial;
    scanMat.uniforms.uTime.value = t;
    scanMat.uniforms.uOrigin.value.copy(lidarWorld).add(new THREE.Vector3(0, 0.1, 0));
    scanMat.uniforms.uAmt.value = carVisible ? (0.18 + e * 0.5 + focusOn(1) * 1.2) * (1 - S.launch) * (1 - S.campus) : 0;

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
      const amt = carVisible ? e * (1 - S.launch) : 0;
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
    this.underGlow.intensity = carVisible ? 1.5 + e * 3 + boost * 14 : 0;
    this.underGlow.position.x = carX;

    /* 캠퍼스 */
    this.campusG.visible = S.campus > 0.001 && S.finale < 0.98;
    if (this.campusG.visible) {
      const m4 = new THREE.Matrix4();
      let ti = 0;
      const fall = 1 - smooth(0, 0.6, S.finale);
      this.blockData.forEach((b, i) => {
        const k = easeOut3(smooth(b.d * 0.45, b.d * 0.45 + 0.5, S.campus)) * fall;
        const h = Math.max(0.0001, b.h * k * (1 + Math.sin(t * 1.5 + b.x * 2 + b.z) * 0.04));
        m4.makeScale(1, h, 1).setPosition(b.x, FLOOR_Y, b.z);
        this.blocks.setMatrixAt(i, m4);
        if (b.top) this.blockTops.setMatrixAt(ti++, m4.makeTranslation(b.x, FLOOR_Y + h + 0.012, b.z));
      });
      this.blocks.instanceMatrix.needsUpdate = this.blockTops.instanceMatrix.needsUpdate = true;
      const ap = this.arcFlow.geometry.attributes.position as THREE.BufferAttribute;
      const q = new THREE.Vector3();
      for (let i = 0; i < ap.count; i++) {
        const u = (t * 0.18 + i / ap.count) % 1;
        this.arcCurve.getPoint(u, q);
        ap.setXYZ(i, q.x, q.y, q.z);
      }
      ap.needsUpdate = true;
      (this.arcFlow.material as THREE.PointsMaterial).opacity = smooth(0.4, 0.9, S.campus) * fall;
    }

    /* 공기·조명 */
    const ambient = (1 - S.launch * 0.7) * (1 - S.campus * 0.6) + S.finale;
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

    /* 카메라 */
    const pos = new THREE.Vector3(6.6, 1.55, 7.9);
    const tgt = new THREE.Vector3(0, -0.15, 0);
    let fov = 36;
    pos.lerp(new THREE.Vector3(7.8, 4.6, 10.2), smooth(0, 0.6, e));
    tgt.lerp(new THREE.Vector3(0, 0.5, 0), smooth(0, 0.6, e));
    fov = lerp(fov, 40, smooth(0, 0.6, e));
    if (S.focus >= 0 && S.focusAmt > 0) {
      const fp = this.parts[S.focus + 1].anchor.getWorldPosition(new THREE.Vector3());
      const dirs = [
        new THREE.Vector3(0.6, 0.7, 1.1),
        new THREE.Vector3(0.9, 0.55, 1.0),
        new THREE.Vector3(-0.9, 0.35, 1.1),
        new THREE.Vector3(0.85, -0.12, 1.0),
        new THREE.Vector3(0.5, 0.25, 1.2),
      ];
      const dist = [4.8, 4.0, 4.2, 3.6, 4.0][S.focus];
      const fpos = fp.clone().addScaledVector(dirs[S.focus].normalize(), dist);
      const k = easeOut3(S.focusAmt);
      pos.lerp(fpos, k);
      tgt.lerp(fp, k);
      fov = lerp(fov, 34, k);
    }
    const lk = smooth(0, 0.3, S.launch);
    pos.lerp(new THREE.Vector3(-3.4 + carX * 0.15, 0.25, 5.2), lk);
    tgt.lerp(new THREE.Vector3(carX + 1.5, -0.1, 0), lk);
    fov = lerp(fov, 58, smooth(0.05, 0.6, S.launch) * (1 - smooth(0.9, 1, S.launch)));
    const ck = smooth(0, 0.5, S.campus);
    const orbit = t * 0.04;
    pos.lerp(new THREE.Vector3(Math.sin(orbit) * 4, 9.5, 13 + Math.cos(orbit) * 1.5), ck);
    tgt.lerp(new THREE.Vector3(0, 0, 0), ck);
    fov = lerp(fov, 42, ck);
    const fk = smooth(0, 0.8, S.finale);
    pos.lerp(new THREE.Vector3(5.6, 1.1, 7.0), fk);
    tgt.lerp(new THREE.Vector3(carX * 0.3, 0, 0), fk);
    fov = lerp(fov, 34, fk);

    if (portrait) {
      pos.sub(tgt).multiplyScalar(1.55).add(tgt);
      fov += 6;
    }
    // 마우스 패럴랙스 (관성 있게)
    const right = new THREE.Vector3().subVectors(pos, tgt).cross(new THREE.Vector3(0, 1, 0)).normalize();
    pos.addScaledVector(right, -this.mouseS.x * 0.7).add(new THREE.Vector3(0, this.mouseS.y * 0.45, 0));
    // 발사 순간 카메라 진동
    const shake = boost * 0.03;
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
      sy = lerp(0.1, 0.16, smooth(0, 0.5, e)) * (1 - ck) * (1 - fk) - fk * 0.08;
    } else {
      sx = lerp(0.12, 0.16, smooth(0, 0.5, e));
      sx = lerp(sx, -0.19, S.focus >= 0 ? easeOut3(S.focusAmt) : 0);
      sx = lerp(sx, 0.04, lk);
      sx = lerp(sx, -0.17, ck);
      sx = lerp(sx, 0, fk);
      sy = lerp(-0.1 * ck, -0.22, fk);
    }
    this.shift.lerp(new THREE.Vector2(sx, sy), kk);
    const W = innerWidth, Hh = innerHeight;
    this.camera.setViewOffset(W, Hh, -this.shift.x * W, this.shift.y * Hh, W, Hh);
    this.camera.updateProjectionMatrix();

    /* 렌즈 */
    this.lensPass.uniforms.uTime.value = t;
    this.lensPass.uniforms.uCA.value = 0.0025 + boost * 0.012 + S.focusAmt * 0.002;
    this.bloom.strength = 0.7 + e * 0.15 - S.focusAmt * 0.2 + boost * 0.5;

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
      if (a >= 0.01) el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px, 0)`;
    };
    const partAlpha = carVisible ? smooth(0.55, 0.9, e) * (1 - S.launch) : 0;
    for (let i = 0; i < 5; i++) {
      const focusDim = S.focus >= 0 && S.focus !== i ? 1 - S.focusAmt * 0.75 : 1;
      place(this.labels[i], this.parts[i + 1].anchor, partAlpha * focusDim);
      this.labels[i]?.classList.toggle('on', S.focus === i && S.focusAmt > 0.5);
    }
    const ca = smooth(0.5, 0.9, S.campus) * (1 - smooth(0, 0.4, S.finale));
    place(this.labels[5], this.campusAnchors[0], ca);
    place(this.labels[6], this.campusAnchors[1], ca);
  }
}
