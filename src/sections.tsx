// 漢陽 · 덕목 · 연표 · 캠퍼스 — 애플 제품 페이지처럼: 큰 글자, 넉넉한 여백, 한 화면에 하나의 주인공.
// 섹션마다 스크롤 진행도(0~1)를 CSS 변수로 흘려 보내고, 움직임은 대부분 CSS가 맡는다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Studio } from './scene/studio';
import { Campus3D } from './scene/campus3d';
import { Eras3D } from './scene/eras3d';
import { Corridor } from './scene/corridor';
import campusData from './assets/campus.json';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const progressOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - innerHeight));
};
const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.bottom > -innerHeight * 0.2 && r.top < innerHeight * 1.2;
};

// 화면에 걸쳐 있을 때만 매 프레임 진행도를 넘겨준다
function useScrub(ref: React.RefObject<HTMLElement | null>, fn: (p: number, el: HTMLElement) => void) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const el = ref.current;
      if (el && visible(el)) cb.current(progressOf(el), el);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}

const setVars = (el: HTMLElement, vars: Record<string, number>) => {
  for (const k in vars) el.style.setProperty(k, vars[k].toFixed(4));
};

/* ───────────────────────── FIG 01·02 — 漢陽 ───────────────────────── */
const NUMBERS: [number, string, string][] = [
  [1939, '개교', '동아공과학원에서 시작한 해'],
  [2, '캠퍼스', '서울 왕십리 · ERICA 안산'],
  [25, '단과대학', '공학에서 예술까지'],
  [87, '년', '쉬지 않고 달려온 시간'],
];

// 숫자 카드 속 그림: 개교(빛나는 교표) · 캠퍼스(두 점을 오가는 빛) · 단과대학(차례로 켜지는 25개 점) · 87년(차오르는 링)
function BentoFx({ i }: { i: number }) {
  if (i === 0)
    return (
      <span className="bfx bfx--seal" aria-hidden>
        <img src="/brand/seal.svg" alt="" />
      </span>
    );
  if (i === 1)
    return (
      <svg className="bfx bfx--link" viewBox="0 0 200 80" aria-hidden>
        <path className="bfx__arc" d="M30 60 Q100 -10 170 60" pathLength={1} />
        <circle className="bfx__dot" r="5" cx="30" cy="60" />
        <circle className="bfx__dot bfx__dot--b" r="5" cx="170" cy="60" />
        <circle className="bfx__run" r="3.5"><animateMotion dur="2.2s" repeatCount="indefinite" path="M30 60 Q100 -10 170 60" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" /></circle>
        <text x="30" y="78">SEOUL</text>
        <text x="170" y="78">ERICA</text>
      </svg>
    );
  if (i === 2)
    return (
      <span className="bfx bfx--grid" aria-hidden>
        {Array.from({ length: 25 }, (_, k) => <i key={k} style={{ '--k': k } as React.CSSProperties} />)}
      </span>
    );
  return (
    <svg className="bfx bfx--ring" viewBox="0 0 120 120" aria-hidden>
      <circle className="bfx__track" cx="60" cy="60" r="50" />
      <circle className="bfx__fill" cx="60" cy="60" r="50" pathLength={1} />
      <text x="60" y="56">1939</text>
      <text x="60" y="74">→ 2026</text>
    </svg>
  );
}

export function NameSection() {
  const ref = useRef<HTMLElement>(null);
  const nums = useRef<(HTMLElement | null)[]>([]);
  const mouse = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      mouse.current.x = e.clientX / innerWidth - 0.5;
      mouse.current.y = e.clientY / innerHeight - 0.5;
    };
    addEventListener('pointermove', mv);
    return () => {
      removeEventListener('pointermove', mv);
    };
  }, []);
  useScrub(ref, (p, el) => {
    // 0 한 문장 → 2 교표 → 3 漢陽 → 4 숫자
    const W: Record<number, number[]> = { 0: [0, 0.045, 0.14, 0.18], 2: [0.18, 0.225, 0.35, 0.39], 3: [0.39, 0.435, 0.59, 0.63], 4: [0.63, 0.69, 2, 2] };
    const vars: Record<string, number> = { '--p': p };
    Object.entries(W).forEach(([i, [a, b, c, d]]) => {
      vars[`--in${i}`] = smooth(a, b, p);
      vars[`--out${i}`] = smooth(c, d, p);
    });
    // 숫자 카드는 마우스를 따라 입체적으로 기운다
    const m = mouse.current;
    m.sx += (m.x - m.sx) * 0.08;
    m.sy += (m.y - m.sy) * 0.08;
    vars['--mx'] = m.sx;
    vars['--my'] = m.sy;
    setVars(el, vars);
    nums.current.forEach((n, i) => {
      if (!n) return;
      const k = smooth(0.67 + i * 0.045, 0.88 + i * 0.022, p);
      // 카드마다 진행도(--n): 카드 속 애니메이션이 숫자와 함께 차오르고, 다 차면 카드가 번쩍인다
      const cell = n.parentElement as HTMLElement;
      cell.style.setProperty('--n', k.toFixed(3));
      cell.classList.toggle('done', k > 0.995);
      const v = Math.round(NUMBERS[i][0] * (1 - Math.pow(1 - k, 3)));
      if (n.textContent !== String(v)) n.textContent = String(v);
    });
    const s = p < 0.18 ? 0 : p < 0.39 ? 2 : p < 0.63 ? 3 : 4;
    setStage((o) => (o === s ? o : s));
  });
  return (
    <section className="hy" id="name" ref={ref} data-opaque>
      <div className="sticky hy__sticky">
        {/* 한 문장 */}
        <div className="hy__l hy__l--0" aria-hidden={stage !== 0}>
          <p className="eyebrow">FIG. 01 — SYMBOL</p>
          <h2 className="hy__motto">용기 있되,<br />만용을 멀리하라.</h2>
        </div>
        {/* 교표 */}
        <div className="hy__l hy__l--2" aria-hidden={stage !== 2}>
          <div className="hy__sealimg">
            <img src="/brand/seal.svg" alt="한양대학교 교표" />
          </div>
          <p className="hy__sub">사랑의 실천을 품은 교표.</p>
        </div>
        {/* 校名 */}
        <div className="hy__l hy__l--3" aria-hidden={stage !== 3}>
          <p className="eyebrow">FIG. 02 — 校名</p>
          <div className="hy__hanja"><span>漢</span><span>陽</span></div>
          <div className="hy__mean">
            <div><b>漢</b><span>한수 한</span><p>한강, 큰 물줄기</p></div>
            <div><b>陽</b><span>볕 양</span><p>그 북쪽의 밝은 땅</p></div>
          </div>
          <p className="hy__sub">서울의 옛 이름을 교명으로 건 대학.</p>
        </div>
        {/* 숫자 */}
        <div className="hy__l hy__l--4" aria-hidden={stage !== 4}>
          <p className="eyebrow">IN NUMBERS</p>
          <h2 className="hy__h hy__h--sm">숫자로 보는 한양.</h2>
          <div className="bento-stage">
            <div className="bento">
              {NUMBERS.map(([n, unit, d], i) => (
                <div key={unit} className={`bento__cell bento__cell--${i}`} style={{ '--i': i } as React.CSSProperties}
                  onPointerMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    e.currentTarget.style.setProperty('--sx', `${e.clientX - r.left}px`);
                    e.currentTarget.style.setProperty('--sy', `${e.clientY - r.top}px`);
                  }}>
                  <i className="bento__shine" />
                  <i className="bento__spot" />
                  <BentoFx i={i} />
                  <b ref={(e) => { nums.current[i] = e; }}>{n}</b>
                  <span>{unit}</span>
                  <p>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FIG 03 — 네 가지 덕목 (화이트 스튜디오) ───────────────────────── */
const VIRTUES = [
  { ko: '근면', en: 'Diligence', line: '오늘의 작은 수고가\n내일의 구조를 만든다.', d: '맞물린 톱니처럼, 하나의 수고가 다른 수고를 움직입니다.', c: '#b8862b' },
  { ko: '정직', en: 'Honesty', line: '숨김없이,\n있는 그대로.', d: '한 줄기 빛이 프리즘을 지나 일곱 빛깔을 모두 드러내듯.', c: '#0a84ff' },
  { ko: '겸손', en: 'Humility', line: '익을수록\n고개를 숙인다.', d: '앞서 나가되 교만하지 않는 지성인의 태도.', c: '#8a6a1f' },
  { ko: '봉사', en: 'Service', line: '배운 것을\n세상의 빛으로.', d: '배움을 세상의 쓸모로 돌려주는 실천, 사랑의 실천.', c: '#e8711a' },
];

export function VirtuesSection() {
  const ref = useRef<HTMLElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const studio = useRef<Studio | null>(null);
  const [i, setI] = useState(0);
  useEffect(() => {
    try {
      studio.current = new Studio(cv.current!);
    } catch {
      studio.current = null;
    }
    return () => studio.current?.dispose();
  }, []);
  useScrub(ref, (p, el) => {
    const r = el.getBoundingClientRect();
    studio.current?.setActive(r.bottom > 0 && r.top < innerHeight);
    studio.current?.set(p);
    const k = Math.min(3, Math.floor(p * 4));
    setVars(el, { '--p': p, '--q': p * 4 - k });
    setI((o) => (o === k ? o : k));
  });
  const v = VIRTUES[i];
  return (
    <section className="vt" id="values" ref={ref} data-opaque style={{ '--c': v.c } as React.CSSProperties}>
      <div className="sticky vt__sticky">
        <div className="vt__copy">
          <p className="eyebrow eyebrow--dark">FIG. 03 — FOUR VIRTUES</p>
          <div className="vt__word" key={i}>
            <span className="vt__no">0{i + 1} — {v.en}</span>
            <h2>{v.ko}</h2>
            <p className="vt__line">{v.line}</p>
            <p className="vt__d">{v.d}</p>
          </div>
        </div>
        <canvas className="vt__cv" ref={cv} aria-hidden />
        <ol className="vt__nav">
          {VIRTUES.map((x, k) => (
            <li key={x.ko} className={k === i ? 'on' : ''} style={{ '--c': x.c } as React.CSSProperties}>
              <i />
              {x.ko}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────── FIG 04 — 연표 (굴러가는 연도) ───────────────────────── */
const ERAS = [
  { y: 1939, t: '동아공과학원', b: '2층 벽돌 교사 · 당시 학교 건물 재현', d: '사랑의 실천을 건학이념으로, 공학 교육으로 나라의 내일을 세우겠다는 뜻에서 출발했습니다.', c: ['#7fb2ff', '#2f6fd0'] },
  { y: 1959, t: '한양대학교', b: '서울캠퍼스 본관', d: '종합대학으로 승격. 공학의 뿌리 위에 인문 · 사회 · 의학이 더해집니다.', c: ['#5ff2d2', '#1a9e8f'] },
  { y: 1979, t: '안산캠퍼스', b: '서울 본관 + ERICA캠퍼스 본관', d: '오늘의 ERICA. 산업 현장과 맞닿은 두 번째 캠퍼스가 문을 엽니다.', c: ['#c6adff', '#6a45d6'] },
  { y: 2026, t: '두 개의 엔진', b: '서울 · ERICA + 한양종합기술연구원 (HIT)', d: '서울과 ERICA, 25개 단과대학이 함께 움직이는 대한민국의 푸른 심장.', c: ['#ffd27a', '#e8711a'] },
];
// 연도 사이를 굴러가는 구간
const ROLLS: [number, number][] = [[0.12, 0.3], [0.42, 0.6], [0.72, 0.9]];
const yearAt = (p: number) => ERAS[0].y + ROLLS.reduce((s, [a, b], i) => s + (ERAS[i + 1].y - ERAS[i].y) * smooth(a, b, p), 0);

export function HistorySection() {
  const ref = useRef<HTMLElement>(null);
  const drums = useRef<(HTMLElement | null)[]>([]);
  const faces = useRef<HTMLElement[][]>([[], [], [], []]);
  const cv = useRef<HTMLCanvasElement>(null);
  const scene = useRef<Eras3D | null>(null);
  const [era, setEra] = useState(0);
  useEffect(() => {
    try {
      scene.current = new Eras3D(cv.current!);
    } catch {
      scene.current = null;
    }
    return () => scene.current?.dispose();
  }, []);
  useScrub(ref, (p, el) => {
    // 시대가 바뀌는 구간의 앞 절반엔 옛 건물이 위에서부터 해체되고, 뒤 절반엔 새 건물이 아래에서부터 지어진다
    // 1939 교사만 해체되어 1959 본관으로 바뀌고, 그 뒤로는 서울 본관을 그대로 둔 채 ERICA·HIT가 더해진다
    const build = [1, 0, 0, 0];
    {
      const [a0, b0] = ROLLS[0], m0 = (a0 + b0) / 2;
      build[0] = 1 - smooth(a0, m0, p);
      build[1] = smooth(m0, b0, p);
      build[2] = smooth(ROLLS[1][0] + 0.04, ROLLS[1][1], p);
      build[3] = smooth(ROLLS[2][0] + 0.04, ROLLS[2][1], p);
    }
    const focus = ROLLS.reduce((s, [a, b]) => s + smooth(a, b, p), 0);
    const r = el.getBoundingClientRect();
    scene.current?.set(build, focus, ERAS[Math.min(3, Math.round(focus))].c[0], r.bottom > 0 && r.top < innerHeight);
    const v = yearAt(p);
    // 원통 네 개: 일의 자리는 연속으로, 윗자리는 아랫자리가 9→0 넘어갈 때만 함께 돈다
    drums.current.forEach((d, i) => {
      if (!d) return;
      const k = 3 - i, p10 = Math.pow(10, k);
      const digit = Math.floor(v / p10) % 10;
      const lower = v - Math.floor(v / p10) * p10;
      const carry = k === 0 ? lower - Math.floor(lower) : clamp01(lower - (p10 - 1));
      const val = digit + carry;
      d.style.transform = `rotateX(${val * 36}deg)`;
      // 앞을 향한 면만 또렷하게, 돌아가는 면은 어둡게
      faces.current[i].forEach((f, n) => {
        let a = (((val - n) % 10) + 10) % 10;
        if (a > 5) a -= 10;
        const c = Math.cos((a * Math.PI) / 5);
        f.style.opacity = Math.min(1, Math.max(0, (c - 0.84) * 6.5)).toFixed(3);
      });
    });
    const e = Math.min(3, Math.round(ROLLS.reduce((s, [a, b]) => s + smooth(a, b, p), 0)));
    setVars(el, { '--p': p, '--roll': Math.max(...ROLLS.map(([a, b]) => Math.sin(Math.PI * clamp01((p - a) / (b - a))))) });
    setEra((o) => (o === e ? o : e));
  });
  const E = ERAS[era];
  return (
    <section className="hs" id="history" ref={ref} data-opaque style={{ '--c1': E.c[0], '--c2': E.c[1] } as React.CSSProperties}>
      <div className="sticky hs__sticky">
        <i className="hs__aura" aria-hidden />
        <canvas className="hs__cv" ref={cv} aria-hidden />
        <p className="eyebrow">FIG. 04 — SINCE 1939</p>
        <div className="hs__year" aria-label={String(E.y)}>
          <i className="hs__window" aria-hidden />
          {[0, 1, 2, 3].map((i) => (
            <span className="hs__digit" key={i}>
              <span className="hs__drum" ref={(e) => { drums.current[i] = e; }}>
                {'0123456789'.split('').map((d, n) => (
                  <span key={d} className="hs__face" style={{ '--n': n } as React.CSSProperties} ref={(e) => { if (e) faces.current[i][n] = e; }}>{d}</span>
                ))}
              </span>
            </span>
          ))}
        </div>
        <div className="hs__card" key={era}>
          <span className="hs__bld">{E.b}</span>
          <h3>{E.t}</h3>
          <p>{E.d}</p>
        </div>
        <ol className="hs__line">
          {ERAS.map((x, k) => (
            <li key={x.y} className={k === era ? 'on' : k < era ? 'done' : ''}>{x.y}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────── FIG 05 — 스물다섯 개의 단과대학 (3D 회전 카드 링) ───────────────────────── */
type Floor = { ko: string; en: string; campus: 'SEOUL' | 'ERICA' };
export const COLLEGES: Floor[] = [
  ['공과대학', 'Engineering'], ['의과대학', 'Medicine'], ['간호대학', 'Nursing'], ['인문과학대학', 'Humanities'], ['사회과학대학', 'Social Sciences'],
  ['자연과학대학', 'Natural Sciences'], ['정책과학대학', 'Policy Science'], ['경제금융대학', 'Economics & Finance'], ['경영대학', 'Business'], ['사범대학', 'Education'],
  ['생활과학대학', 'Human Ecology'], ['음악대학', 'Music'], ['예술·체육대학', 'Performing Arts & Sports'], ['국제대학', 'International Studies'], ['산업융합학부', 'Industrial Convergence'],
].map(([ko, en]) => ({ ko, en, campus: 'SEOUL' as const })).concat(
  [
    ['공학대학', 'Engineering Sciences'], ['소프트웨어융합대학', 'Software Convergence'], ['약학대학', 'Pharmacy'], ['첨단융합대학', 'Advanced Convergence'], ['글로벌문화통상대학', 'Global Culture & Commerce'],
    ['커뮤니케이션&컬처대학', 'Communication & Culture'], ['경상대학', 'Business & Economics'], ['디자인대학', 'Design'], ['예체능대학', 'Sports & Arts'], ['LIONS칼리지', 'LIONS College'],
  ].map(([ko, en]) => ({ ko, en, campus: 'ERICA' as const }))
);
const SEOUL_N = COLLEGES.filter((c) => c.campus === 'SEOUL').length;

export function CollegesSection() {
  const ref = useRef<HTMLElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const hall = useRef<Corridor | null>(null);
  const [ci, setCi] = useState(0);
  const N = COLLEGES.length;
  useEffect(() => {
    try {
      hall.current = new Corridor(
        cv.current!,
        COLLEGES.map((c, i) => ({ ...c, no: (c.campus === 'SEOUL' ? i : i - SEOUL_N) + 1 }))
      );
    } catch {
      hall.current = null;
    }
    return () => hall.current?.dispose();
  }, []);
  useScrub(ref, (p, el) => {
    // 문마다 잠깐 머물렀다 다음 문으로 걸어간다
    const f = smooth(0.03, 0.97, p) * (N - 1);
    const fi = Math.floor(f), fr = f - fi;
    const cur = fi + smooth(0.45, 1, fr);
    const r = el.getBoundingClientRect();
    hall.current?.set(cur, r.bottom > 0 && r.top < innerHeight);
    setVars(el, { '--p': p, '--erica': smooth(SEOUL_N - 1.3, SEOUL_N - 0.7, cur) });
    const k = Math.min(N - 1, Math.round(cur));
    setCi((o) => (o === k ? o : k));
  });
  const c = COLLEGES[ci];
  const isS = c.campus === 'SEOUL';
  const no = (isS ? ci : ci - SEOUL_N) + 1;
  return (
    <section className="cl" id="colleges" ref={ref} data-opaque>
      <div className="sticky cl__sticky">
        <canvas className="cl__cv" ref={cv} aria-hidden />
        <div className="cl__head">
          <p className="eyebrow">FIG. 05 — COLLEGES</p>
          <h2>스물다섯 개의 문,<br />당신의 문은?</h2>
        </div>
        <div className="cl__now" key={ci}>
          <span>{isS ? 'SEOUL CAMPUS' : 'ERICA CAMPUS'} · {String(no).padStart(2, '0')}</span>
          <h3>{c.ko}</h3>
          <em>{c.en}</em>
        </div>
        <div className="cl__count">
          <b>{String(ci + 1).padStart(2, '0')}</b>
          <span>/ {N}</span>
          <i><i style={{ width: `${((ci + 1) / N) * 100}%` }} /></i>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── FIG 06 — 두 캠퍼스 (실제 지도) ───────────────────────── */
type CampusRaw = { uni: number[]; b: number[][]; r: number[][]; g: number[][]; w: number[][] };
const toD = (f: number[], from = 0) => {
  let d = '';
  for (let i = from; i < f.length; i += 2) d += (i === from ? 'M' : 'L') + f[i].toFixed(0) + ' ' + f[i + 1].toFixed(0);
  return d;
};
const inside = (ring: number[], x: number, z: number) => {
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], zi = ring[i + 1], xj = ring[j], zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};

function CampusMap({ data }: { data: CampusRaw }) {
  const m = useMemo(() => {
    const xs = data.uni.filter((_, i) => i % 2 === 0), zs = data.uni.filter((_, i) => i % 2 === 1);
    const pad = 120;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, z0 = Math.min(...zs) - pad, z1 = Math.max(...zs) + pad;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2;
    const near = (f: number[], from: number) => Math.abs(f[from] - cx) < (x1 - x0) / 2 + 60 && Math.abs(f[from + 1] - cz) < (z1 - z0) / 2 + 60;
    const blds = data.b
      .filter((b) => near(b, 1))
      .map((b) => {
        let sx = 0, sz = 0;
        for (let i = 1; i < b.length; i += 2) (sx += b[i]), (sz += b[i + 1]);
        const n = (b.length - 1) / 2;
        const inn = inside(data.uni, sx / n, sz / n);
        return { d: toD(b, 1) + 'Z', inn, k: clamp01(Math.hypot(sx / n - cx, sz / n - cz) / R) };
      });
    const roads = data.r.filter((r) => near(r, 1)).map((r) => ({ d: toD(r, 1), w: r[0] }));
    const green = data.g.filter((g) => near(g, 0)).map((g) => toD(g) + 'Z');
    return { vb: `${x0} ${z0} ${x1 - x0} ${z1 - z0}`, blds, roads, green, uni: toD(data.uni) + 'Z' };
  }, [data]);
  return (
    <svg className="map" viewBox={m.vb} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g className="map__green">{m.green.map((d, i) => <path key={i} d={d} />)}</g>
      <g className="map__roads">{m.roads.map((r, i) => <path key={i} d={r.d} className={`w${r.w}`} pathLength={1} />)}</g>
      <path className="map__uni-fill" d={m.uni} />
      <g className="map__blds">
        {m.blds.map((b, i) => <path key={i} d={b.d} className={b.inn ? 'in' : ''} style={{ '--k': b.k.toFixed(3) } as React.CSSProperties} />)}
      </g>
      <path className="map__uni" d={m.uni} pathLength={1} />
    </svg>
  );
}

// 카드 속 지도: 평면 지도로 시작해 3D 조감도로 솟아오른다. WebGL이 없으면 2D 지도(SVG)로
function CampusView({ data, view }: { data: CampusRaw; view: React.MutableRefObject<Campus3D | null> }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    try {
      view.current = new Campus3D(cv.current!, data);
    } catch {
      setFail(true);
    }
    return () => view.current?.dispose();
  }, [data, view]);
  return fail ? <CampusMap data={data} /> : <canvas className="map map--3d" ref={cv} aria-hidden />;
}

export function CampusSection() {
  const ref = useRef<HTMLElement>(null);
  const d = campusData as unknown as Record<'seoul' | 'erica', CampusRaw>;
  const views = { seoul: useRef<Campus3D | null>(null), erica: useRef<Campus3D | null>(null) };
  const [is3d, set3d] = useState(false);
  useScrub(ref, (p, el) => {
    const r = el.getBoundingClientRect();
    const on = r.bottom > 0 && r.top < innerHeight;
    // 두 카드는 살짝 시차를 두고 바뀐다
    views.seoul.current?.set(p, on);
    views.erica.current?.set(clamp01(p - 0.04), on);
    setVars(el, { '--p': p, '--draw': smooth(0.05, 0.45, p), '--fill': smooth(0.3, 0.75, p) });
    const k = p > 0.5;
    set3d((o) => (o === k ? o : k));
  });
  return (
    <section className="cp" id="campus" ref={ref} data-opaque>
      <div className="sticky cp__sticky">
        <div className="cp__head">
          <p className="eyebrow">FIG. 06 — TWO CAMPUSES</p>
          <h2>하나의 한양,<br />두 개의 엔진.</h2>
        </div>
        <div className="cp__grid">
          {(['seoul', 'erica'] as const).map((k) => (
            <article key={k} className={`cp__card cp__card--${k}`}>
              <CampusView data={d[k]} view={views[k]} />
              <span className="cp__mode">{is3d ? '3D' : '2D'}</span>
              <div className="cp__info">
                <span>{k === 'seoul' ? 'SEOUL CAMPUS' : 'ERICA CAMPUS'}</span>
                <h3>{k === 'seoul' ? '서울캠퍼스' : 'ERICA캠퍼스'}</h3>
                <p>{k === 'seoul' ? '서울 성동구 왕십리. 공과대학과 의과대학을 비롯한 한양의 본교.' : '경기 안산. 산학협력과 융합 교육을 설계하는, 현장과 가장 가까운 캠퍼스.'}</p>
                <dl>
                  <div><dt>단과대학</dt><dd>{k === 'seoul' ? 15 : 10}</dd></div>
                  <div><dt>{k === 'seoul' ? '개교' : '개교'}</dt><dd>{k === 'seoul' ? 1939 : 1979}</dd></div>
                </dl>
              </div>
            </article>
          ))}
        </div>
        <p className="cp__credit">지도 데이터 © OpenStreetMap contributors</p>
      </div>
    </section>
  );
}
