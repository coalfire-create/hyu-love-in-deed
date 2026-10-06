// 걷고·달리고·포효하는 3D 사자. 관절(어깨·팔꿈치·손목 / 엉덩이·무릎·발목)을 가진 계층 구조이고,
// 보행은 다리마다 위상이 다른 주기 함수로 만든다. 걷기(lateral walk) ↔ 질주(rotary gallop)를 연속으로 섞는다.
// 사자는 +x 방향을 보고, 원점은 몸통 아래 바닥이다.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export interface LionPose {
  speed: number; // 지면에 대한 이동 속도 (단위/초) — 보폭 주기를 정한다
  gait: number; // 0 걷기 → 1 질주
  roar: number; // 0~1 입 벌리고 고개 쳐들기
  bow: number; // 0~1 고개 숙이기
  look: number; // 고개를 옆(카메라 쪽)으로 돌리는 정도 (-1~1)
  pitch: number; // 오르막에서 몸을 앞으로 드는 각
  ground: ((x: number) => number) | null; // 사자 좌표의 x에서 바닥 높이 (계단 등). 없으면 평지
  sit: number; // 0 서 있음 → 1 늠름하게 앉음 (앞다리는 곧게, 뒷다리는 접고 엉덩이를 바닥에)
  crouch: number; // 도약 전후로 몸을 낮춘다
  air: number; // 공중에서 앞다리는 앞으로, 뒷다리는 뒤로 쭉 뻗는다
}

interface Leg {
  root: THREE.Group;
  j1: THREE.Group;
  j2: THREE.Group;
  j3: THREE.Group;
  front: boolean;
  side: number;
  base: THREE.Vector3; // 몸통 안에서의 어깨/엉덩이 기본 위치
  L: [number, number, number]; // 위팔(허벅지) · 아래팔(정강이) · 발허리 길이
}

// 각진 면이 살아 있는 타원체 (로우폴리 조각 느낌)
function ell(rx: number, ry: number, rz: number, _detail = 2) {
  const g = new THREE.SphereGeometry(1, 40, 28);
  g.scale(rx, ry, rz);
  return g;
}

// 1차원 키프레임 보간 (부드러운 단면 프로파일용)
function prof(keys: [number, number][]) {
  return (x: number) => {
    if (x <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (x <= keys[i][0]) {
        const [x0, y0] = keys[i - 1], [x1, y1] = keys[i];
        const t = (x - x0) / (x1 - x0), k = t * t * (3 - 2 * t);
        return y0 + (y1 - y0) * k;
      }
    }
    return keys[keys.length - 1][1];
  };
}

// 구를 x축 방향으로 늘려 단면마다 높이·폭·중심을 다르게 준다 → 가슴은 깊고 허리는 잘록한 한 덩어리 몸통
function sculpt(halfLen: number, ry: (u: number) => number, rz: (u: number) => number, yc: (u: number) => number, _detail = 3) {
  // x축을 길이 방향으로 쓰는 매끈한 구 (양 끝이 x = ±1)
  const g = new THREE.SphereGeometry(1, 64, 40).rotateZ(Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, u * halfLen, yc(u) + y * ry(u), z * rz(u));
  }
  g.computeVertexNormals();
  return g;
}

// 한쪽 끝이 가늘어지는 다리 토막 (위 끝이 원점, -y로 뻗는다)
function limb(len: number, r0: number, r1: number) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 28, 1);
  g.translate(0, -len / 2, 0);
  return g;
}

export class Lion {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private neck = new THREE.Group();
  readonly head = new THREE.Group();
  private jaw = new THREE.Group();
  private legs: Leg[] = [];
  private tail: THREE.Group[] = [];
  private mane!: THREE.InstancedMesh;
  private maneData: { m: THREE.Matrix4; dir: THREE.Vector3; ph: number }[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private fangs: THREE.Mesh[] = [];
  readonly mats: THREE.Material[] = [];
  private phase = 0;
  private time = 0;
  private gaitS = 0;
  private speedS = 0;
  readonly pose: LionPose = { speed: 0, gait: 0, roar: 0, bow: 0, look: 0, pitch: 0, ground: null, sit: 0, crouch: 0, air: 0 };

  constructor(env?: { paint?: THREE.Color }) {
    // 한양 블루 도장 · 교표의 은빛 · 금빛 포인트
    const hide = new THREE.MeshPhysicalMaterial({
      color: env?.paint ?? new THREE.Color('#0e4a84'),
      metalness: 0.45,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.4,
    });
    const steel = new THREE.MeshPhysicalMaterial({ color: '#e9edf5', metalness: 1, roughness: 0.18, envMapIntensity: 1.4 });
    const dark = new THREE.MeshPhysicalMaterial({ color: '#081a33', metalness: 0.5, roughness: 0.35, clearcoat: 0.8 });
    const maneMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    const gold = new THREE.MeshPhysicalMaterial({ color: '#d4a64a', metalness: 1, roughness: 0.22, clearcoat: 0.6 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f2a640').multiplyScalar(1.6), toneMapped: false });
    this.mats.push(hide, steel, dark, maneMat, gold, this.eyeMat);

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      return o;
    };

    // 몸통 — 앞가슴은 두껍고 허리는 잘록, 엉덩이는 다시 둥글게
    this.root.add(this.body);
    this.body.position.y = 1.07;
    // u: -1 엉덩이 끝 → +1 가슴 앞. 등선은 거의 수평, 배는 허리에서 말려 올라간다
    const torso = sculpt(
      0.98,
      prof([[-1, 0.2], [-0.75, 0.37], [-0.45, 0.38], [-0.05, 0.31], [0.4, 0.42], [0.75, 0.4], [1, 0.2]]),
      prof([[-1, 0.18], [-0.7, 0.3], [-0.45, 0.31], [-0.05, 0.25], [0.45, 0.32], [0.8, 0.28], [1, 0.16]]),
      prof([[-1, 0.06], [-0.6, 0.05], [-0.05, 0.11], [0.5, 0.0], [1, 0.05]])
    );
    this.body.add(mesh(torso, hide, 0.02, 0, 0));

    // 다리: 앞다리(어깨→팔꿈치→손목), 뒷다리(엉덩이→무릎→발목)
    const mkLeg = (front: boolean, side: number) => {
      const root = new THREE.Group();
      root.position.set(front ? 0.62 : -0.6, front ? -0.06 : 0.02, side * (front ? 0.2 : 0.21));
      this.body.add(root);
      const j1 = new THREE.Group();
      root.add(j1);
      const L1 = front ? 0.42 : 0.4, L2 = front ? 0.38 : 0.37, L3 = front ? 0.1 : 0.24;
      // 허벅지/어깨 근육 덩어리 — 몸통 옆면에 붙어 다리가 몸에서 자연스럽게 나온다
      j1.add(mesh(ell(front ? 0.22 : 0.27, front ? 0.32 : 0.34, 0.13), hide, front ? 0.0 : -0.02, -0.12, side * 0.04));
      j1.add(mesh(limb(L1, 0.13, 0.095), hide));
      const j2 = new THREE.Group();
      j2.position.y = -L1;
      j1.add(j2);
      j2.add(mesh(new THREE.SphereGeometry(0.088, 24, 16), hide)); // 관절
      j2.add(mesh(limb(L2, front ? 0.095 : 0.085, front ? 0.075 : 0.065), hide));
      const j3 = new THREE.Group();
      j3.position.y = -L2;
      j2.add(j3);
      j3.add(mesh(new THREE.SphereGeometry(0.07, 24, 16), hide));
      j3.add(mesh(limb(L3, 0.07, 0.072), hide));
      // 발 — 크고 뭉툭하게
      const paw = mesh(ell(0.13, 0.06, 0.1, 1), dark, 0.05, -L3 - 0.02, 0);
      j3.add(paw);
      this.legs.push({ root, j1, j2, j3, front, side, base: root.position.clone(), L: [L1, L2, L3] });
    };
    mkLeg(false, 1); // 0 LH
    mkLeg(true, 1); // 1 LF
    mkLeg(false, -1); // 2 RH
    mkLeg(true, -1); // 3 RF

    // 목 · 머리
    this.neck.position.set(0.86, 0.2, 0);
    this.body.add(this.neck);
    this.neck.add(mesh(ell(0.3, 0.3, 0.25), hide, 0.08, 0.06, 0));
    this.head.position.set(0.3, 0.22, 0);
    this.head.scale.setScalar(1.18);
    this.neck.add(this.head);
    // 품위 있는 사자 얼굴: 길고 곧은 콧등, 도드라진 이마 능선, 깊고 네모난 주둥이, 낮게 자리한 호박색 눈.
    // 얼굴은 은빛으로 — 한양 교표의 은빛 사자처럼
    const face = new THREE.MeshPhysicalMaterial({ color: '#dfe5ef', metalness: 0.8, roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.3 });
    this.mats.push(face);
    this.head.add(
      // 두개: 뒤통수는 둥글고 이마는 넓고 평평하게
      mesh(sculpt(0.27, prof([[-1, 0.13], [-0.4, 0.21], [0.3, 0.2], [1, 0.11]]), prof([[-1, 0.13], [-0.3, 0.23], [0.4, 0.22], [1, 0.12]]), prof([[-1, 0], [0, 0.03], [1, 0.03]])), face, -0.03, 0.02, 0),
      // 콧등과 주둥이: 이마에서 코끝까지 곧게 이어진다
      mesh(sculpt(0.16, prof([[-1, 0.13], [0, 0.12], [1, 0.1]]), prof([[-1, 0.16], [0, 0.14], [1, 0.12]]), prof([[-1, 0.0], [1, -0.02]])), face, 0.24, -0.07, 0),
      mesh(ell(0.085, 0.04, 0.23, 2), face, 0.12, 0.1, 0), // 이마 능선
      mesh(ell(0.024, 0.034, 0.07, 2), dark, 0.392, -0.022, 0) // 넓적한 코
    );
    for (const s of [1, -1]) {
      this.head.add(mesh(ell(0.085, 0.075, 0.075, 2), face, 0.3, -0.12, s * 0.07)); // 수염 패드
      this.head.add(mesh(ell(0.045, 0.07, 0.06, 1), face, -0.13, 0.21, s * 0.17)); // 둥근 귀
      // 호박색 눈: 이마 능선 아래 가늘게 — 매섭게 앞을 노려본다
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 8), this.eyeMat);
      eye.position.set(0.165, 0.052, s * 0.128);
      eye.scale.set(1, 0.45, 0.75);
      eye.rotation.y = -s * 0.35;
      this.head.add(eye);
    }
    this.jaw.position.set(0.08, -0.15, 0);
    this.head.add(this.jaw);
    this.jaw.add(mesh(ell(0.17, 0.045, 0.1, 2), face, 0.15, -0.02, 0));
    // 송곳니 — 포효할 때만 드러난다
    for (const s of [1, -1]) {
      const fang = mesh(new THREE.ConeGeometry(0.014, 0.055, 4), steel, 0.27, 0.025, s * 0.06);
      this.jaw.add(fang);
      const top = mesh(new THREE.ConeGeometry(0.014, 0.055, 4), steel, 0.36, -0.16, s * 0.06);
      top.rotation.z = Math.PI;
      this.head.add(top);
      this.fangs.push(fang, top);
    }

    // 갈기 — 얼굴을 둥글게 감싸는 두툼한 털 뭉치들. 바깥 겹일수록 길고 뒤로 넘어간다
    {
      const tuft = new THREE.SphereGeometry(1, 16, 12);
      tuft.scale(0.07, 0.5, 0.11);
      tuft.translate(0, 0.42, 0);
      const N = 150;
      this.mane = new THREE.InstancedMesh(tuft, maneMat, N);
      this.mane.castShadow = true;
      const up = new THREE.Vector3(0, 1, 0);
      const col = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const layer = i % 5; // 0 = 얼굴 둘레 안쪽 → 4 = 목 뒤 바깥
        const a = (i / N) * TAU * 5 + layer * 0.63 + Math.sin(i * 12.9) * 0.12;
        const cy = Math.cos(a), cz = Math.sin(a);
        const dir = new THREE.Vector3(-0.12 - layer * 0.2, cy, cz * 1.05).normalize();
        // 위쪽과 턱 밑(수염)은 길게
        const len = (0.24 + layer * 0.04 - 0.05 * Math.max(0, cy) * layer * 0.4 + (cy < -0.4 ? 0.12 : 0)) * (0.8 + 0.4 * Math.abs(Math.sin(i * 7.31)));
        const base = new THREE.Vector3(0.34 - layer * 0.08, 0.24 + cy * (0.15 + layer * 0.02), cz * (0.16 + layer * 0.02));
        const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
        const th = 1.0 + layer * 0.12;
        const m = new THREE.Matrix4().compose(base, q, new THREE.Vector3(th, len, th));
        this.maneData.push({ m, dir, ph: Math.random() * TAU });
        this.mane.setMatrixAt(i, m);
        // 안쪽은 밝은 은빛, 바깥은 짙은 남색 — 깊이감
        col.set('#6fa2ea').lerp(new THREE.Color('#123f7c'), layer / 4.5); // 한양 블루 갈기 — 흰 얼굴이 또렷하게
        this.mane.setColorAt(i, col);
      }
      this.neck.add(this.mane);
    }

    // 꼬리 — 마디 8개 + 끝 술
    {
      let parent: THREE.Object3D = this.body;
      const base = new THREE.Group();
      base.position.set(-0.96, 0.2, 0);
      parent.add(base);
      parent = base;
      for (let i = 0; i < 8; i++) {
        const seg = new THREE.Group();
        if (i > 0) seg.position.x = -0.11;
        parent.add(seg);
        const piece = mesh(new THREE.CylinderGeometry(0.03 - i * 0.002, 0.034 - i * 0.002, 0.12, 5), hide, -0.055, 0, 0);
        piece.rotation.z = Math.PI / 2;
        seg.add(piece);
        this.tail.push(seg);
        parent = seg;
      }
      const tip = mesh(ell(0.1, 0.06, 0.06, 1), maneMat, -0.14, 0, 0);
      parent.add(tip);
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  /** 보행 · 표정 갱신. dt 초. */
  update(dt: number) {
    const P = this.pose;
    this.time += dt;
    const t = this.time;
    this.gaitS += (P.gait - this.gaitS) * (1 - Math.exp(-dt * 4));
    this.speedS += (P.speed - this.speedS) * (1 - Math.exp(-dt * 5));
    const g = this.gaitS, v = Math.abs(this.speedS);
    const moving = smoothstep(v / 0.25);

    // 보행 파라미터: 걷기 ↔ 질주
    // 고양잇과 걸음: 디딘 발은 땅에 그대로 박혀 있고(미끄러짐 없음), 몸이 그 위로 미끄러지듯 지나간다.
    // 발 위치를 먼저 정하고 관절 각은 역운동학(IK)으로 푼다.
    const beta = lerp(0.7, 0.4, g); // 한 주기 중 발이 땅에 붙어 있는 비율 — 사자는 오래 디디며 무겁게 걷는다
    const S = lerp(0.78, 1.45, g) * moving; // 한 걸음 보폭: 길고 느긋하게
    const H = lerp(0.09, 0.3, g); // 발을 드는 높이 — 걸을 땐 발을 낮게 끈다
    // 주기 진동수 = 속도 × 디딤비율 / 보폭  → 디딘 발의 속도가 정확히 몸의 속도와 같아진다
    const freq = moving > 0.01 ? (v * beta) / Math.max(S, 0.05) : 0;
    this.phase = (this.phase + freq * dt) % 1;
    const offs = [
      [0, 0.25, 0.5, 0.75], // 걷기: 왼뒤 → 왼앞 → 오른뒤 → 오른앞 (고양잇과의 측대 순서)
      [0, 0.58, 0.1, 0.68], // 질주: 뒷다리 한 쌍 → 앞다리 한 쌍
    ];
    const cyc = this.phase * TAU;

    // 몸통: 야생 사자의 걸음 — 어깨 사이에 몸이 매달린 듯 낮게, 앞발이 디딜 때마다 무게가 실려 살짝 가라앉고
    // 엉덩이는 뒷발을 따라 좌우로 흔들린다 (몸 전체가 기울지는 않는다)
    const w = 1 - g;
    const bob = lerp(-0.016 * Math.abs(Math.sin(cyc * 2 + 0.6)), 0.09 * Math.sin(cyc), g) * moving;
    // 앉으면 엉덩이를 내리고 가슴을 세운다 (몸통을 약 32° 들어 올림)
    const sit = P.sit;
    this.body.position.set(0, lerp(1.07 - 0.05 * moving * w + bob - P.bow * 0.06, 0.7, sit) - 0.3 * P.crouch, -0.0);
    this.body.rotation.set(0, 0.045 * Math.sin(cyc) * moving * w, lerp(0.012 * Math.sin(cyc * 2 + 1.2), 0.1 * Math.sin(cyc + 0.6), g) * moving + P.roar * 0.06 - P.bow * 0.04 + P.pitch + 0.46 * sit);
    const breath = 1 + Math.sin(t * 1.7) * 0.012 * (1 - moving);
    this.body.scale.set(1, breath, breath);
    this.body.updateMatrix();
    const inv = new THREE.Matrix4().copy(this.body.matrix).invert();
    const pitch = this.body.rotation.z;
    const F = new THREE.Vector3(), E = new THREE.Vector3(), R = new THREE.Vector3();
    const ang = (dx: number, dy: number) => Math.atan2(dx, -dy); // -y(아래)를 0으로 하는 z축 회전각

    this.legs.forEach((L, i) => {
      const ph = (this.phase + lerp(offs[0][i], offs[1][i], g)) % 1;
      const [L1, L2, L3] = L.L;
      // 바닥(사자 원점) 기준 발 목표: 디딤 = 앞에서 뒤로 일정하게, 들기 = 낮은 호를 그리며 앞으로
      const nx = L.base.x + (L.front ? 0.05 : -0.02);
      let fx: number, fy: number, lift = 0;
      if (ph < beta) {
        fx = nx + S / 2 - (S * ph) / beta;
        fy = 0;
      } else {
        const u = (ph - beta) / (1 - beta);
        const k = u * u * (3 - 2 * u);
        fx = nx - S / 2 + S * k;
        lift = Math.sin(Math.PI * u) * moving;
        // 발은 들자마자 높이 올라가고 내려놓을 땐 낮게 앞으로 뻗는다
        fy = H * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 1.4) * moving;
      }
      // 앉기: 앞발은 가슴 아래 곧게, 뒷발은 엉덩이 앞에 납작하게
      fx = lerp(fx, L.front ? nx + 0.08 : L.base.x + 0.4, sit);
      fy *= 1 - sit;
      // 도약: 앞다리는 앞으로 뻗고 뒷다리는 뒤로 차낸다
      fx += (L.front ? 0.5 : -0.55) * P.air;
      fy += (L.front ? 0.3 : 0.22) * P.air;
      const gy = P.ground ? P.ground(fx) : 0;
      F.set(fx, fy + gy + 0.08, 0).applyMatrix4(inv); // 0.08 = 발바닥 두께
      // 견갑골: 앞다리가 몸무게를 받을 때 어깨가 솟는다 (고양잇과 특유의 어깨 굴림)
      const support = ph < beta ? Math.sin((Math.PI * ph) / beta) : 0;
      R.copy(L.base);
      // 앞다리 디딤 땐 견갑골이 크게 솟아 등선 위로 드러나고, 뒷다리는 엉덩이가 오르내린다
      R.y += (L.front ? 0.085 : 0.035) * (support - 0.5) * moving * w;
      L.root.position.copy(R);
      // 발을 몸 중심선 쪽으로 모아 디딘다 (고양잇과의 한 줄 걸음)
      L.root.rotation.x = L.side * 0.07 * moving * w;
      // 어깨 근육 덩어리가 디딤 때 위로 밀려 올라간다
      const musc = L.j1.children[0];
      musc.position.y = -0.12 + (L.front ? 0.06 : 0.02) * support * moving * w;
      // 발허리 기울기: 디딜 땐 발목이 앞으로 살짝 누운 각, 들 땐 앞발은 뒤로 접히고 뒷발은 앞으로 흔들린다
      const a3w = lerp(L.front ? 0.12 - 1.5 * lift : 0.28 + 0.35 * lift, L.front ? 0.05 : 1.4, sit) + (L.front ? -0.4 : 0.9) * P.air;
      const a3 = a3w - pitch;
      E.set(F.x - Math.sin(a3) * (L3 + 0.02), F.y + Math.cos(a3) * (L3 + 0.02), 0);
      // 두 마디 IK: 앞다리 팔꿈치는 뒤로, 뒷다리 무릎은 앞으로 꺾인다
      const dx = E.x - R.x, dy = E.y - R.y;
      const D = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, Math.hypot(dx, dy)));
      const cosA = (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D);
      const A = Math.acos(Math.min(1, Math.max(-1, cosA)));
      const base = ang(dx, dy);
      const a1 = base + (L.front ? -A : A);
      const mx = R.x + Math.sin(a1) * L1, my = R.y - Math.cos(a1) * L1;
      const a2 = ang(E.x - mx, E.y - my);
      L.j1.rotation.z = a1;
      L.j2.rotation.z = a2 - a1;
      L.j3.rotation.z = a3 - a2;
    });

    // 목·머리: 걸음마다 끄덕, 포효 땐 쳐들고, 겸손 땐 숙인다
    // 걸을 땐 머리를 어깨 높이로 낮게, 시선은 흔들리지 않게 (몸 출렁임을 목이 상쇄)
    // 야생 사자는 걸을 때 머리를 어깨선보다 낮게 늘어뜨리고, 머리는 걸음에 맞춰 무겁게 끄덕인다.
    // 가끔 고개를 돌려 주변을 살핀다
    const nod = Math.sin(cyc * 2 + 0.8) * 0.035 * moving * w;
    const scan = (Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.13 + 1) * 0.4) * 0.35 * moving * w;
    this.neck.rotation.z = nod - P.bow * 0.7 + P.roar * 0.3 - 0.42 * moving * w * (1 - P.roar) - g * 0.12 * moving - this.body.rotation.z * 0.7 - 0.2 * sit;
    this.neck.rotation.y = P.look * 0.5 + scan - this.body.rotation.y * 1.2;
    this.head.rotation.z = -P.bow * 0.35 + P.roar * 0.2 + 0.28 * moving * w * (1 - P.roar) + Math.sin(t * 0.9) * 0.03 * (1 - moving);
    this.head.rotation.y = P.look * 0.25 + scan * 0.4;
    this.jaw.rotation.z = -P.roar * 0.62 - Math.max(0, Math.sin(t * 9)) * 0.03 * g * moving;

    // 갈기는 바람과 걸음에 흔들린다
    const tmp = new THREE.Matrix4(), rot = new THREE.Matrix4();
    this.maneData.forEach((d, i) => {
      const sway = Math.sin(t * (3 + g * 5) + d.ph) * (0.05 + 0.12 * g * moving + 0.15 * P.roar);
      rot.makeRotationZ(sway - g * 0.15 * moving - P.roar * 0.1);
      tmp.multiplyMatrices(rot, d.m);
      this.mane.setMatrixAt(i, tmp);
    });
    this.mane.instanceMatrix.needsUpdate = true;

    // 눈빛: 포효하면 번쩍, 송곳니가 드러난다
    this.eyeMat.color.set('#f2a640').multiplyScalar(1.6 + P.roar * 5);
    this.fangs.forEach((f) => f.scale.setScalar(Math.max(1e-3, smoothstep((P.roar - 0.1) / 0.4))));

    // 꼬리: 파도처럼 흔들리고 질주하면 뒤로 뻗는다
    this.tail.forEach((s, i) => {
      const k = i / this.tail.length;
      // 아래로 늘어졌다가 끝이 살짝 말려 올라간다. 질주하면 뒤로 뻗는다
      // 걸음에 맞춰 느긋하게 좌우로 흔들린다
      s.rotation.z = (i === 0 ? lerp(lerp(0.85, 0.3, g * moving), 1.5, sit) - 0.6 * P.air : 0) + (i > 3 ? -0.18 * sit : 0) + Math.sin(t * lerp(1.2, 7, g) - i * 0.5) * (0.04 + 0.06 * k) * (1 - 0.5 * g) - (i > 4 ? 0.2 * (1 - g) : 0);
      s.rotation.y = Math.sin(cyc + Math.PI - i * 0.35) * (0.05 + 0.1 * k) * moving + Math.sin(t * 0.9 - i * 0.5) * 0.06 * (1 - moving);
    });

    // 눈빛: 포효하면 번쩍
  }

  /** 사자 표면 위의 점들 (월드 좌표) — 변신 파편의 출발점 */
  sample(n: number, out: Float32Array) {
    sampleSurface(this.root, n, out);
  }
}

/** 오브젝트 표면(정점) 위의 무작위 점 n개를 월드 좌표로 뽑는다. 큰 덩어리일수록 점을 많이. */
export function sampleSurface(root: THREE.Object3D, n: number, out: Float32Array) {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && m.visible && m.geometry.attributes.position) meshes.push(m);
  });
  const w = meshes.map((m) => {
    const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    return Math.sqrt(s.x * s.y + s.y * s.z + s.x * s.z);
  });
  const total = w.reduce((a, b) => a + b, 0);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    let r = Math.random() * total, k = 0;
    while (k < w.length - 1 && r > w[k]) r -= w[k++];
    const pos = meshes[k].geometry.attributes.position;
    v.fromBufferAttribute(pos as THREE.BufferAttribute, Math.floor(Math.random() * pos.count)).applyMatrix4(meshes[k].matrixWorld);
    out.set([v.x, v.y, v.z], i * 3);
  }
}
