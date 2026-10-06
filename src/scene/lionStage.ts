// 漢陽 섹션의 하이리온 무대: 아기 사자가 무대 위를 종종걸음으로 오가다 멈춰 서서 카메라를 바라본다.
// 서 있을 땐 포인터를 따라 고개를 돌리고, 터치하면 멈춰서 반응하고(머리 = 쓰다듬기, 몸 = 폴짝, 연타 = 어흥), 좌우로 끌면 돌아간다.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Mascot } from './mascot';

function glowTexture(inner: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export class LionStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  private mascot = new Mascot();
  private ring: THREE.Mesh;
  private p = 0;
  private active = false;
  private last = performance.now();
  private time = 0;
  private raf = 0;
  private ro: ResizeObserver;
  // 끌어서 돌리기
  private yaw = 0;
  private yawV = 0;
  private drag: { x: number; moved: boolean; id: number } | null = null;
  private taps: number[] = [];
  // 걷기: 무대 양 끝을 오가며, 끝에 닿으면 잠깐 서서 카메라를 본다
  private x = -1.05;
  private dir = 1;
  private pause = 1.6;
  private heading = 0;
  private ray = new THREE.Raycaster();
  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    // 화면 어디서든 사자가 포인터를 바라본다 (캔버스 기준 -1~1)
    const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    this.mascot.lookAt(x * 1.2, y * 0.9 + 0.1);
    if (this.drag && e.pointerId === this.drag.id) {
      const dx = e.clientX - this.drag.x;
      if (Math.abs(dx) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        this.yawV = dx * 0.01;
        this.yaw += dx * 0.01;
        this.drag.x = e.clientX;
      }
    }
  };
  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, moved: false, id: e.pointerId };
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved || !this.active) return;
    // 탭: 무엇을 눌렀는지 확인
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hits = this.ray.intersectObjects(this.mascot.hit, false);
    if (!hits.length) return;
    const now = performance.now();
    this.taps = this.taps.filter((t) => now - t < 1200).concat(now);
    if (this.taps.length >= 3) {
      this.taps = [];
      this.mascot.trigger('roar');
      return;
    }
    const head = this.ray.intersectObjects(this.mascot.headHit, false).length > 0 || hits[0].point.y > 0.85;
    this.pause = Math.max(this.pause, 2.6); // 만지면 멈춰서 바라본다
    this.mascot.trigger(head ? 'pet' : 'joy');
  };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    // 조명: 앞에서 부드러운 주광 + 뒤에서 윤곽을 그리는 푸른 역광
    const key = new THREE.SpotLight('#ffffff', 30, 20, 0.55, 0.7, 1.2);
    key.position.set(1.8, 5.5, 5.5);
    key.target.position.set(0, 1, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    const fill = new THREE.PointLight('#cfe0ff', 6, 12, 2);
    fill.position.set(-3, 2, 4);
    const rimA = new THREE.PointLight('#4d8dff', 26, 10, 2);
    rimA.position.set(-2.4, 2.8, -2);
    const rimB = new THREE.PointLight('#8fe3ff', 16, 10, 2);
    rimB.position.set(2.4, 2.2, -2);
    this.scene.add(key, key.target, fill, rimA, rimB, new THREE.HemisphereLight('#cfe0ff', '#000000', 0.35));

    // 바닥: 그림자 + 발밑의 은은한 빛 웅덩이 + 얇은 빛의 링
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.5 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.receiveShadow = true;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: glowTexture('rgba(47,111,208,0.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.002;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.162, 160), new THREE.MeshBasicMaterial({ color: '#7fb2ff', transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.003;
    this.scene.add(shadow, pool, this.ring, this.mascot.root);

    canvas.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.tick);
  }

  set(p: number, active: boolean) {
    // 처음 무대에 들어오면 한 번 반갑게 인사
    if (active && !this.active) this.mascot.trigger('joy');
    this.p = p;
    this.active = active;
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const far = w / h < 0.9 ? 1.5 : 1;
    this.camera.position.set(0, 1.45, 7.6 * far);
    this.camera.lookAt(0, 0.85, 0);
    this.camera.updateProjectionMatrix();
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.active) return;
    this.time += dt;
    // 끈 만큼 돌고, 놓으면 관성으로 미끄러지다 정면으로 천천히 돌아온다
    if (!this.drag) {
      this.yaw += this.yawV;
      this.yawV *= Math.exp(-dt * 4);
      if (Math.abs(this.yawV) < 0.002) this.yaw += (0 - this.yaw) * (1 - Math.exp(-dt * 1.2));
    }
    // 걷기 ↔ 멈춰 서기 (끌고 있거나 반응 중이면 멈춘다)
    if (this.drag?.moved || this.mascot.busy) this.pause = Math.max(this.pause, 1.2);
    let face: number;
    if (this.pause > 0) {
      this.pause -= dt;
      this.mascot.walk = 0;
      face = 0; // 카메라를 본다
    } else {
      this.mascot.walk = 1;
      this.x += this.dir * dt * 0.75;
      face = (this.dir * Math.PI) / 2;
      const lim = this.camera.aspect < 0.9 ? 0.45 : 1.05; // 좁은 화면에선 짧게 오간다
      if (Math.abs(this.x) > lim) {
        this.x = Math.sign(this.x) * lim;
        this.dir *= -1;
        this.pause = 2.2 + Math.random() * 1.2;
      }
    }
    this.heading += Math.atan2(Math.sin(face - this.heading), Math.cos(face - this.heading)) * (1 - Math.exp(-dt * 6));
    this.mascot.root.position.x = this.x;
    this.mascot.root.rotation.y = this.heading + this.yaw;
    this.mascot.update(dt);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.2 * Math.sin(this.time * 1.4);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    removeEventListener('pointermove', this.onMove);
    removeEventListener('pointerup', this.onUp);
    this.ro.disconnect();
    this.renderer.dispose();
  }
}
