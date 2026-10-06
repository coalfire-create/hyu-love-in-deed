// 하이리온 마스코트: 네 발로 걷는 귀여운 아기 사자 (한양 블루 몸 · 흰 주둥이와 발 · 블루 갈기 · 목의 교표 메달)
// 치비 비율 — 머리는 몸통만큼 크고, 다리는 짧고 통통하고, 눈은 작고 반짝이는 타원으로 얼굴 아래쪽에 넓게.
// 걸으면 대각선 다리끼리 짝지어 종종걸음하고, 서 있으면 고개가 포인터를 따라온다. 터치하면 반응한다.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => t * t * (3 - 2 * t);

export type Reaction = 'pet' | 'joy' | 'roar';

function heartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff7aa2';
  g.beginPath();
  g.moveTo(64, 112);
  g.bezierCurveTo(10, 72, 8, 30, 38, 22);
  g.bezierCurveTo(54, 18, 62, 30, 64, 40);
  g.bezierCurveTo(66, 30, 74, 18, 90, 22);
  g.bezierCurveTo(120, 30, 118, 72, 64, 112);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export class Mascot {
  readonly root = new THREE.Group();
  readonly hit: THREE.Object3D[] = [];
  readonly headHit: THREE.Object3D[] = [];
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legs: { g: THREE.Group; front: boolean; side: number }[] = [];
  private eyes: THREE.Group[] = [];
  private pupils: THREE.Mesh[] = [];
  private happyEyes: THREE.Mesh[] = [];
  private ears: THREE.Group[] = [];
  private mouthClosed = new THREE.Group();
  private mouthOpen = new THREE.Group();
  private blush: THREE.MeshBasicMaterial;
  private tail = new THREE.Group();
  private hearts: { s: THREE.Sprite; v: THREE.Vector3; life: number }[] = [];
  private rings: { m: THREE.Mesh; life: number }[] = [];
  private heartTex: THREE.Texture;
  private t = 0;
  private phase = 0;
  private walkS = 0;
  private blinkT = 2;
  private earT = 3;
  private look = new THREE.Vector2();
  private lookS = new THREE.Vector2();
  private react: { type: Reaction; t: number } | null = null;
  /** 0 서 있음 → 1 걷는 중 */
  walk = 0;

  constructor() {
    // 봉제인형 같은 보송한 벨벳 재질 (광택 대신 가장자리에 부드러운 빛)
    const blue = new THREE.MeshPhysicalMaterial({ color: '#2a63b8', roughness: 0.85, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#a9ccff') });
    const cream = new THREE.MeshPhysicalMaterial({ color: '#fff8ee', roughness: 0.85, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ffffff') });
    const ink = new THREE.MeshPhysicalMaterial({ color: '#141a26', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02 });
    const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const gold = new THREE.MeshPhysicalMaterial({ color: '#d9ad55', metalness: 1, roughness: 0.25 });
    const pink = new THREE.MeshPhysicalMaterial({ color: '#ffb3c4', roughness: 0.5 });
    this.blush = new THREE.MeshBasicMaterial({ color: '#ff9db5', transparent: true, opacity: 0.45, depthWrite: false });
    const ball = (r: number, m: THREE.Material, sx = 1, sy = 1, sz = 1) => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), m);
      o.scale.set(sx, sy, sz);
      o.castShadow = true;
      return o;
    };
    const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);

    // 사자는 +z(카메라 쪽)를 바라본다
    this.root.add(this.body);
    // 몸통: 통통한 콩 모양 + 흰 배
    this.body.add(at(ball(1, blue, 0.36, 0.32, 0.44), 0, 0.52, -0.04));
    this.body.add(at(ball(1, cream, 0.25, 0.19, 0.3), 0, 0.43, 0.02));
    // 다리 네 개: 짧고 통통한 기둥 + 동그란 흰 발 (어깨/엉덩이에서 흔든다)
    for (const front of [true, false])
      for (const side of [1, -1]) {
        const g = new THREE.Group();
        g.position.set(side * 0.19, 0.4, front ? 0.18 : -0.26);
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.14, 8, 24), blue);
        leg.position.y = -0.15;
        leg.castShadow = true;
        const paw = at(ball(0.135, cream, 1, 0.65, 1.1), 0, -0.32, 0.03);
        // 발바닥 젤리 (앞발만, 앞에서 살짝 보인다)
        if (front) paw.add(at(ball(0.035, pink, 1, 0.6, 0.6), 0, -0.02, 0.1));
        g.add(leg, paw);
        this.body.add(g);
        this.legs.push({ g, front, side });
      }
    // 꼬리: 뒤로 뻗어 위로 말리고 끝에 블루 술
    {
      this.tail.position.set(0, 0.56, -0.44);
      const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.04, -0.18), new THREE.Vector3(0, 0.14, -0.3), new THREE.Vector3(0.02, 0.3, -0.28));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.035, 12), blue);
      tube.castShadow = true;
      this.tail.add(tube, at(ball(0.09, new THREE.MeshPhysicalMaterial({ color: '#0d3a73', roughness: 0.5, clearcoat: 0.5 }), 1, 1.25, 1), 0.02, 0.35, -0.28));
      this.body.add(this.tail);
    }

    // 머리: 몸통만큼 큰 동그란 머리
    this.head.position.set(0, 0.93, 0.26);
    this.head.scale.setScalar(1.22); // 머리를 크게 — 치비 비율
    this.body.add(this.head);
    // 갈기: 크고 부드러운 꽃잎 모양 털이 얼굴을 둥글게 감싼다 (작은 공을 많이 쓰면 포도송이처럼 보여서)
    {
      const outer = new THREE.MeshPhysicalMaterial({ color: '#1c4f9c', roughness: 0.9, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#9cc4ff') });
      const inner = new THREE.MeshPhysicalMaterial({ color: '#3a7bd6', roughness: 0.9, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#cfe2ff') });
      const N = 11;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + Math.PI / 2;
        const petal = ball(0.2, outer, 1, 0.82, 0.6);
        petal.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.35, -0.1);
        petal.rotation.z = a;
        this.head.add(petal);
        const p2 = ball(0.15, inner, 1, 0.8, 0.55);
        p2.position.set(Math.cos(a + Math.PI / N) * 0.3, Math.sin(a + Math.PI / N) * 0.29, -0.03);
        p2.rotation.z = a + Math.PI / N;
        this.head.add(p2);
      }
    }
    const face = at(ball(0.34, cream, 1.04, 0.92, 0.88), 0, -0.01, 0.05);
    this.head.add(face);
    this.headHit.push(face);
    // 귀: 갈기 위로 쏙 나온 동그란 귀
    for (const s of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.27, 0.36, 0.0);
      ear.add(ball(0.1, cream, 1, 1, 0.65), at(ball(0.055, pink, 1, 1, 0.35), 0, -0.005, 0.05));
      this.head.add(ear);
      this.ears.push(ear);
    }
    // 눈: 작고 반짝이는 타원, 얼굴 아래쪽에 넓게 — 하이라이트 하나
    for (const s of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.14, -0.025, 0.3);
      eye.rotation.y = s * 0.28;
      const pupil = ball(0.048, ink, 0.88, 1.12, 0.55);
      pupil.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), shine), -0.014, 0.022, 0.03));
      pupil.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), shine), 0.016, -0.02, 0.03));
      const happy = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.01, 8, 20, Math.PI), ink);
      happy.position.z = 0.015;
      happy.visible = false;
      eye.add(pupil, happy);
      this.head.add(eye);
      this.eyes.push(eye);
      this.pupils.push(pupil);
      this.happyEyes.push(happy);
      // 볼 홍조
      const bl = at(new THREE.Mesh(new THREE.CircleGeometry(0.055, 32), this.blush), s * 0.2, -0.095, 0.285);
      bl.rotation.y = s * 0.55;
      this.head.add(bl);
      // 작고 볼록한 주둥이 두 볼
      this.head.add(at(ball(0.068, cream, 1, 0.82, 0.85), s * 0.047, -0.12, 0.3));
    }
    // 코: 작은 하트 같은 역삼각
    const nose = at(ball(0.035, ink, 1.35, 0.8, 0.8), 0, -0.07, 0.345);
    nose.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), shine), -0.012, 0.012, 0.02));
    this.head.add(nose);
    // 입: 평소엔 작은 ω, 반응하면 동그랗게 벌어진 입 + 혀
    for (const s of [1, -1]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0065, 8, 20, Math.PI), ink);
      arc.rotation.z = Math.PI;
      arc.position.set(s * 0.024, -0.125, 0.355);
      this.mouthClosed.add(arc);
    }
    const hole = at(ball(0.045, ink, 1, 0.9, 0.4), 0, -0.15, 0.34);
    hole.add(at(ball(0.026, pink, 1, 0.6, 0.6), 0, -0.018, 0.016));
    this.mouthOpen.add(hole);
    this.mouthOpen.visible = false;
    this.head.add(this.mouthClosed, this.mouthOpen);
    // 목에 건 교표 메달
    {
      const tex = new THREE.TextureLoader().load('/brand/seal.png');
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.center.set(0.5, 0.5);
      tex.rotation = -Math.PI / 2;
      const seal = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 1 });
      const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 40).rotateX(Math.PI / 2), [gold, seal, gold]);
      medal.position.set(0, 0.66, 0.4);
      medal.rotation.x = -0.3;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 10, 48), gold);
      collar.position.set(0, 0.76, 0.3);
      collar.rotation.x = Math.PI / 2 - 0.45;
      this.body.add(medal, collar);
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.hit.push(o);
    });
    this.heartTex = heartTexture();
  }

  /** 포인터 위치 (-1~1) — 서 있을 때 고개와 눈동자가 따라온다 */
  lookAt(x: number, y: number) {
    this.look.set(x, y);
  }

  trigger(type: Reaction) {
    this.react = { type, t: 0 };
    if (type !== 'roar') {
      const n = type === 'joy' ? 7 : 3;
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heartTex, transparent: true, depthWrite: false }));
        s.position.set((Math.random() - 0.5) * 0.5, 1.35 + Math.random() * 0.15, 0.4);
        s.scale.setScalar(0.13 + Math.random() * 0.07);
        this.root.add(s);
        this.hearts.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.7 + Math.random() * 0.5, 0.15), life: 1.4 });
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: '#7fb2ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        m.position.set(0, 0.85, 0.75);
        this.root.add(m);
        this.rings.push({ m, life: 1.2 + i * 0.18 });
      }
    }
  }

  get busy() {
    return !!this.react;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    let joy = 0, pet = 0, roar = 0;
    if (this.react) {
      this.react.t += dt;
      const d = { joy: 0.9, pet: 1.5, roar: 1.3 }[this.react.type];
      const k = this.react.t / d;
      if (this.react.type === 'joy') joy = Math.sin(Math.PI * clamp01(k));
      if (this.react.type === 'pet') pet = ease(clamp01(k * 3)) * (1 - ease(clamp01((k - 0.7) / 0.3)));
      if (this.react.type === 'roar') roar = ease(clamp01(k * 4)) * (1 - ease(clamp01((k - 0.6) / 0.4)));
      if (k >= 1) this.react = null;
    }
    // 걷기: 대각선 다리끼리 짝지어 종종걸음 (치비라 보폭은 작고 빠르게)
    this.walkS += (this.walk - this.walkS) * (1 - Math.exp(-dt * 6));
    const w = this.walkS;
    this.phase += dt * 9 * w;
    const sw = Math.sin(this.phase);
    this.legs.forEach((L) => {
      const ph = (L.front ? 0 : Math.PI) + (L.side > 0 ? 0 : Math.PI);
      L.g.rotation.x = Math.sin(this.phase + ph) * 0.55 * w;
      L.g.position.y = 0.4 + Math.max(0, Math.sin(this.phase + ph + Math.PI / 2)) * 0.03 * w;
    });
    const hopK = joy > 0 && this.react ? Math.max(0, Math.sin(Math.PI * clamp01(this.react.t / 0.55))) : 0;
    this.body.position.y = Math.abs(sw) * 0.035 * w + hopK * 0.3;
    this.body.rotation.z = sw * 0.04 * w;
    const breath = 1 + Math.sin(t * 1.9) * 0.012 * (1 - w);
    this.body.scale.set(1, breath, 1);
    // 고개: 서 있으면 포인터를 따라오고, 걸을 땐 앞을 보며 까딱
    this.lookS.lerp(this.look, 1 - Math.exp(-dt * 6));
    const idle = 1 - w;
    this.head.rotation.y = this.lookS.x * 0.6 * idle;
    this.head.rotation.x = -this.lookS.y * 0.35 * idle - roar * 0.35 + Math.sin(this.phase * 2) * 0.05 * w + Math.sin(t * 0.9) * 0.02;
    // 가끔 고개를 갸웃 — 귀여운 버릇
    const tilt = Math.max(0, Math.sin(t * 0.55)) ** 6 * 0.22 * idle;
    this.head.rotation.z = -this.lookS.x * 0.08 * idle + pet * 0.32 + tilt;
    this.pupils.forEach((p) => p.position.set(this.lookS.x * 0.012 * idle, -this.lookS.y * 0.01 * idle, 0));
    // 깜빡임 · 기쁜 눈
    this.blinkT -= dt;
    if (this.blinkT < -0.14) this.blinkT = 2.5 + Math.random() * 3;
    const happy = pet > 0.2 || joy > 0.2;
    this.eyes.forEach((e) => (e.scale.y = happy ? 1 : this.blinkT < 0 ? 0.1 : 1));
    this.pupils.forEach((p) => (p.visible = !happy));
    this.happyEyes.forEach((h) => (h.visible = happy));
    // 입
    const open = Math.max(joy, roar);
    this.mouthClosed.visible = open < 0.15;
    this.mouthOpen.visible = open >= 0.15;
    this.mouthOpen.scale.set(1, 0.5 + open * (roar > 0 ? 1.2 : 0.6), 1);
    this.blush.opacity = 0.4 + 0.4 * Math.max(pet, joy);
    // 귀 쫑긋, 꼬리 살랑
    this.earT -= dt;
    if (this.earT < -0.3) this.earT = 2 + Math.random() * 4;
    const twitch = this.earT < 0 ? Math.sin((-this.earT / 0.3) * Math.PI) * 0.35 : 0;
    this.ears.forEach((e, i) => (e.rotation.z = (i ? -1 : 1) * (twitch * (i ? 0.4 : 1) - pet * 0.25)));
    this.tail.rotation.y = Math.sin(t * (2.4 + joy * 6 + w * 3)) * (0.3 + joy * 0.3);
    // 하트
    this.hearts = this.hearts.filter((h) => {
      h.life -= dt;
      h.s.position.addScaledVector(h.v, dt);
      h.v.y -= dt * 0.4;
      h.s.material.opacity = clamp01(h.life / 0.6);
      if (h.life > 0) return true;
      this.root.remove(h.s);
      h.s.material.dispose();
      return false;
    });
    // 어흥 음파
    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      const k = clamp01(1 - r.life / 1.2);
      r.m.scale.setScalar(0.1 + k * 0.7);
      (r.m.material as THREE.MeshBasicMaterial).opacity = r.life < 1.2 ? (1 - k) * 0.8 : 0;
      if (r.life > 0) return true;
      this.root.remove(r.m);
      return false;
    });
  }
}
