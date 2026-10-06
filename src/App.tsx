import React, { useEffect, useRef, useState } from 'react';
import { Engine, ACCENTS } from './scene/engine';

const PARTS = [
  {
    no: '01', en: 'Battery', ko: '하부 배터리 팩',
    lab: '에너지공학과 · 선양국 교수 연구팀',
    title: '농도구배형 하이니켈 양극재',
    body: '입자의 안쪽과 바깥쪽 니켈 농도를 다르게 설계해, 높은 에너지 밀도와 안정성을 동시에 잡은 양극재 원천 기술.',
  },
  {
    no: '02', en: 'LiDAR', ko: '루프탑 라이다 · AI 유닛',
    lab: '미래자동차공학과 · 자율주행 연구',
    title: '도심을 읽는 자율주행',
    body: '라이다·카메라·레이더를 융합해 복잡한 도심 도로를 스스로 인지하고 판단하는 자율주행 알고리즘.',
  },
  {
    no: '03', en: 'E-Motor', ko: '전동화 모터 · 인버터',
    lab: '신소재공학부 · 기계공학부',
    title: '고출력 파워트레인과 경량 소재',
    body: '고속 회전과 열을 견디는 경량 합금, 전력을 효율적으로 바꾸는 인버터. 한양 공학의 재료·기계 역량이 모입니다.',
  },
  {
    no: '04', en: 'Cockpit', ko: '스마트 콕핏 · 뇌파 센서',
    lab: '바이오메디컬공학과 · 임창환 교수 연구팀',
    title: '생각으로 움직이는 인터페이스',
    body: '뇌파 신호를 읽어 생각만으로 기기를 조작하는 뇌-컴퓨터 인터페이스(BCI). 운전자의 상태를 읽는 지능형 콕핏으로.',
  },
  {
    no: '05', en: 'Suspension', ko: '로보틱 액티브 서스펜션',
    lab: '로봇공학 · 한창수 교수 연구팀',
    title: '사람을 걷게 한 모션 제어',
    body: '착용형 외골격 로봇 연구에서 쌓은 정밀 구동·제어 기술. 노면에 실시간으로 반응하는 서스펜션과 맞닿아 있습니다.',
  },
];

const VIRTUES = [
  { ko: '근면', en: 'Diligence', d: '오늘의 작은 수고가 내일의 구조를 만든다.', hue: ['#7fb2ff', '#1f4fc4'] },
  { ko: '정직', en: 'Honesty', d: '하중을 속이지 않는 설계처럼, 사람에게도 정직하게.', hue: ['#5ff2d2', '#0b7a86'] },
  { ko: '겸손', en: 'Humility', d: '앞서 나가되 교만하지 않는 지성인의 태도.', hue: ['#c6adff', '#5a33c4'] },
  { ko: '봉사', en: 'Service', d: '배운 것을 세상의 쓸모로 돌려주는 실천.', hue: ['#ffc56b', '#c2511a'] },
];

const HISTORY = [
  ['1939', '동아공과학원', '사랑의 실천을 건학이념으로, 공학 교육으로 나라의 내일을 세우겠다는 뜻에서 출발했습니다.'],
  ['1959', '한양대학교', '종합대학으로 승격. 공학의 뿌리 위에 인문·사회·의학이 더해집니다.'],
  ['1979', '안산캠퍼스', '오늘의 ERICA. 산업 현장과 맞닿은 두 번째 캠퍼스가 문을 엽니다.'],
  ['Now', '두 개의 엔진', '서울과 ERICA, 25개 단과대학이 함께 움직이는 대한민국의 푸른 심장.'],
];

const COLLEGES: { ko: string; en: string; campus: 'SEOUL' | 'ERICA' }[] = [
  ['공과대학', 'Engineering'], ['의과대학', 'Medicine'], ['간호대학', 'Nursing'], ['인문과학대학', 'Humanities'], ['사회과학대학', 'Social Sciences'],
  ['자연과학대학', 'Natural Sciences'], ['정책과학대학', 'Policy Science'], ['경제금융대학', 'Economics & Finance'], ['경영대학', 'Business'], ['사범대학', 'Education'],
  ['생활과학대학', 'Human Ecology'], ['음악대학', 'Music'], ['예술·체육대학', 'Performing Arts & Sports'], ['국제대학', 'International Studies'], ['산업융합학부', 'Industrial Convergence'],
].map(([ko, en]) => ({ ko, en, campus: 'SEOUL' as const })).concat(
  [
    ['공학대학', 'Engineering Sciences'], ['소프트웨어융합대학', 'Software Convergence'], ['약학대학', 'Pharmacy'], ['첨단융합대학', 'Advanced Convergence'], ['글로벌문화통상대학', 'Global Culture & Commerce'],
    ['커뮤니케이션&컬처대학', 'Communication & Culture'], ['경상대학', 'Business & Economics'], ['디자인대학', 'Design'], ['예체능대학', 'Sports & Arts'], ['LIONS칼리지', 'LIONS College'],
  ].map(([ko, en]) => ({ ko, en, campus: 'ERICA' as const }))
);

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const progress = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - innerHeight));
};
const inView = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight;
};
// 화면을 완전히 덮고 있는지 (덮고 있으면 3D 렌더를 쉰다)
const covers = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.top <= 0 && r.bottom >= innerHeight;
};

// 기술 섹션: 0 소개 · 1 분해 · 2~6 부품 · 7 재결합
const TECH_STEPS = 8;
function techMap(p: number) {
  const PART0 = 0.17, PART_LEN = (0.85 - PART0) / 5;
  let step = p < 0.06 ? 0 : p < PART0 ? 1 : p < 0.85 ? 2 + Math.floor((p - PART0) / PART_LEN) : 7;
  step = Math.min(step, 7);
  let focus = -1, focusAmt = 0;
  if (step >= 2 && step <= 6) {
    focus = step - 2;
    const local = (p - PART0 - focus * PART_LEN) / PART_LEN;
    focusAmt = smooth(0, 0.22, local) * (1 - smooth(0.82, 1, local));
  }
  const explode = smooth(0.05, 0.16, p) * (1 - smooth(0.86, 0.96, p));
  return { step, focus, focusAmt, explode };
}

const SEOUL_N = COLLEGES.filter((c) => c.campus === 'SEOUL').length;

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const tech = useRef<HTMLElement>(null);
  const launch = useRef<HTMLElement>(null);
  const values = useRef<HTMLElement | null>(null);
  const prism = useRef<HTMLOListElement>(null);
  const history = useRef<HTMLElement | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const colleges = useRef<HTMLElement | null>(null);
  const campus = useRef<HTMLElement>(null);
  const finale = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLElement>(null);
  const [nameStep, setNameStep] = useState(0);
  const opaque = useRef<HTMLElement[]>([]);
  const [step, setStep] = useState(0);
  const [virtue, setVirtue] = useState(0);
  const [college, setCollege] = useState(0);
  const [glFail, setGlFail] = useState(false);

  useEffect(() => {
    let engine: Engine | null = null;
    try {
      engine = new Engine(canvas.current!);
      if (import.meta.env.DEV || location.search.includes('debug')) (window as any).__engine = engine;
      engine.setLabels(Array.from(labels.current!.children) as HTMLElement[]);
    } catch {
      setGlFail(true);
    }

    let raf = 0, lastStep = -1, lastVirtue = -1, lastCollege = -1, lastName = -1;
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX / innerWidth - 0.5;
      mouse.y = e.clientY / innerHeight - 0.5;
    };
    addEventListener('pointermove', onMove);
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));
    const rows = Array.from(prism.current!.children) as HTMLElement[];
    // 숫자 카운트업 (보일 때 한 번)
    const cio = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target as HTMLElement, to = +el.dataset.to!, t0 = performance.now();
      const step = (n: number) => {
        const k = Math.min(1, (n - t0) / 1600), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
        el.textContent = String(v);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    }), { threshold: 0.6 });
    document.querySelectorAll('[data-to]').forEach((el) => cio.observe(el));

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const vh = innerHeight;
      mouse.sx += (mouse.x - mouse.sx) * 0.08;
      mouse.sy += (mouse.y - mouse.sy) * 0.08;
      const tm = techMap(progress(tech.current!));
      const lp = progress(launch.current!);
      const cp = progress(campus.current!);
      const fr = finale.current!.getBoundingClientRect();
      const fin = clamp01((vh - fr.top) / vh);
      const nr = nameRef.current!.getBoundingClientRect();
      const np = progress(nameRef.current!);
      const emblem = Math.min(clamp01((vh - nr.top) / vh), clamp01(nr.bottom / vh));
      const ns = np < 0.33 ? 0 : np < 0.66 ? 1 : 2;
      if (ns !== lastName) {
        setNameStep((lastName = ns));
        // 숫자 단계가 새로 그려지면 카운트업을 다시 건다
        requestAnimationFrame(() => document.querySelectorAll('.nums [data-to]').forEach((el) => cio.observe(el)));
      }
      engine?.setState({ emblem, emblemP: np, hero: clamp01(1 - scrollY / vh), explode: tm.explode, focus: tm.focus, focusAmt: tm.focusAmt, launch: smooth(0.05, 0.85, lp), campus: smooth(0, 0.55, cp), finale: fin });
      const paused = opaque.current.some(covers);
      engine?.setPaused(paused);
      // 라벨마다 visibility가 따로 걸려 있어 부모 visibility로는 못 숨긴다 → display로 끈다
      labels.current!.style.display = paused || fin > 0.3 || (!inView(tech.current!) && !inView(campus.current!)) ? 'none' : '';

      if (tm.step !== lastStep) setStep((lastStep = tm.step));

      // 덕목 인덱스: 지금 덕목 줄의 진행선이 차오른다
      const vp = clamp01(progress(values.current!)) * 4;
      const v = Math.min(3, Math.floor(vp));
      rows.forEach((r, i) => r.style.setProperty('--fill', String(i < v ? 1 : i === v ? clamp01(vp - v) : 0)));
      if (v !== lastVirtue) setVirtue((lastVirtue = v));

      if (track.current) {
        const max = track.current.scrollWidth - innerWidth;
        track.current.style.transform = `translate3d(${-max * smooth(0.04, 0.96, progress(history.current!))}px,0,0)`;
      }

      // 단과대학 타워: 스크롤에 따라 한 층씩 빠져나온다
      const ci = Math.min(COLLEGES.length - 1, Math.floor(smooth(0.03, 0.97, progress(colleges.current!)) * COLLEGES.length));
      if (ci !== lastCollege) setCollege((lastCollege = ci));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      io.disconnect();
      cio.disconnect();
      engine?.dispose();
    };
  }, []);

  const addOpaque = (el: HTMLElement | null) => {
    if (el && !opaque.current.includes(el)) opaque.current.push(el);
  };
  const c = COLLEGES[college];
  const tower = (campusKey: 'SEOUL' | 'ERICA') => {
    const list = COLLEGES.map((cc, i) => ({ ...cc, i })).filter((cc) => cc.campus === campusKey);
    return (
      <div className={`tower tower--${campusKey.toLowerCase()}`}>
        {list.map((cc, k) => (
          <div key={cc.ko} className={`fl ${cc.i === college ? 'on' : ''} ${cc.i < college ? 'past' : ''}`} style={{ '--z': k } as React.CSSProperties}>
            <i className="fl__t"><span>{String(cc.i + 1).padStart(2, '0')}</span></i>
            <i className="fl__a" />
            <i className="fl__b" />
          </div>
        ))}
        <span className="tower__name">{campusKey === 'SEOUL' ? 'SEOUL' : 'ERICA'}</span>
      </div>
    );
  };

  return (
    <>
      <canvas ref={canvas} className="gl" aria-hidden />
      {glFail && <div className="gl-fallback" />}

      <div className="labels" ref={labels} aria-hidden>
        {PARTS.map((p) => (
          <div className={p.no === '03' ? 'tag tag--left' : 'tag'} key={p.no} style={{ '--acc': ACCENTS[+p.no - 1] } as React.CSSProperties}>
            <i />
            <b><em>{p.no}</em>{p.en}</b>
          </div>
        ))}
        <div className="tag tag--campus"><i /><b>SEOUL · 왕십리</b></div>
        <div className="tag tag--campus"><i /><b>ERICA · 안산</b></div>
      </div>

      <header className="nav">
        <a href="#top" className="nav__logo"><img className="nav__seal" src="/brand/seal.png" alt="" /><span className="nav__word">HANYANG<br />UNIVERSITY</span></a>
        <nav className="nav__links">
          <a href="#name"><em>01</em>漢陽</a><a href="#tech"><em>02</em>Tech</a><a href="#values"><em>03</em>Virtues</a><a href="#colleges"><em>04</em>Colleges</a><a href="#campus"><em>05</em>Campus</a>
        </nav>
        <a className="nav__cta" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학 안내</a>
      </header>

      <main>
        {/* HERO — 3D 글자 HANYANG 은 캔버스 안에 서 있다 */}
        <section className="hero" id="top">
          <h1 className="sr-only">한양대학교 HANYANG UNIVERSITY</h1>
          <div className="hero__top">
            <span className="coord">37.557°N · 127.045°E</span>
            <span className="coord">EST. 1939 — SEOUL / ERICA</span>
          </div>
          <div className="hero__bottom">
            <h2 className="hero__title">Engine of <span>Korea</span></h2>
            <div className="hero__side">
              <p>사랑의 실천 — Love in Deed and Truth. 1939년부터, 말이 아니라 기술로 증명해 온 대학.</p>
              <div className="hero__cta">
                <a href="#tech" className="btn btn--blue">엔진 열어보기</a>
                <a href="#name" className="btn btn--line">Scroll</a>
              </div>
            </div>
          </div>
        </section>

        {/* NAME — 3D 교표 무대: 사자 면 → 교표 면 → 숫자 */}
        <section className="name" id="name" ref={nameRef}>
          <div className="sticky name__sticky">
            <div className="name__cap" key={nameStep}>
              {nameStep === 0 && (
                <>
                  <span className="fig">FIG. 01 — SYMBOL</span>
                  <h2>용기 있되<br />만용을 멀리하는<br /><span className="grad">사자.</span></h2>
                  <p className="lead">한양의 상징은 사자입니다. 앞서되 교만하지 않는 지성인의 의지. 마스코트의 이름은 HanYang + Lion, <b>하이리온</b>.</p>
                </>
              )}
              {nameStep === 1 && (
                <>
                  <span className="fig">FIG. 02 — 校名</span>
                  <h2><span className="name__hanja">漢陽</span><br />서울의 옛 이름을<br />교명으로 건 대학.</h2>
                  <p className="lead"><b>漢</b> 한수 한 · <b>陽</b> 볕 양. 1939년, 나라의 내일을 공학으로 세우겠다는 뜻으로 문을 연 대학은 수도의 이름을 걸고 대한민국 산업의 길을 함께 걸어 왔습니다.</p>
                </>
              )}
              {nameStep === 2 && (
                <>
                  <span className="fig">FIG. 03 — IN NUMBERS</span>
                  <div className="nums">
                    <div><b data-to="1939">1939</b><span>개교</span></div>
                    <div><b data-to="2">2</b><span>캠퍼스 · 서울 / ERICA</span></div>
                    <div><b data-to="25">25</b><span>단과대학</span></div>
                  </div>
                </>
              )}
            </div>
            <ol className="name__steps">
              {['SYMBOL', '校名', 'NUMBERS'].map((t, i) => <li key={t} className={i === nameStep ? 'on' : i < nameStep ? 'done' : ''}>{t}</li>)}
            </ol>
          </div>
        </section>

        {/* TECH — 3D 분해도 */}
        <section className="tech" id="tech" ref={tech} style={{ height: `${TECH_STEPS * 110}vh` }}>
          <div className="sticky">
            <div className="tech__intro" data-show={step <= 1 || step === 7}>
              {step === 0 && (
                <div key="s0" className="swap">
                  <span className="fig">FIG. 02 — TECHNOLOGY</span>
                  <h2>미래의 차 한 대,<br />그 안의 한양.</h2>
                  <p className="lead">스크롤하면 차가 열립니다.</p>
                </div>
              )}
              {step === 1 && (
                <div key="s1" className="swap">
                  <span className="fig">EXPLODED VIEW</span>
                  <h2>다섯 개의 부품,<br />다섯 개의 한양 기술.</h2>
                </div>
              )}
              {step === 7 && (
                <div key="s7" className="swap">
                  <span className="fig">REASSEMBLE</span>
                  <h2>다섯 개의 기술이,<br />하나의 심장으로.</h2>
                </div>
              )}
            </div>
            <div className="spec" data-show={step >= 2 && step <= 6}>
              {step >= 2 && step <= 6 && (() => {
                const p = PARTS[step - 2];
                return (
                  <article key={p.no} className="spec__card swap" style={{ '--acc': ACCENTS[step - 2] } as React.CSSProperties}>
                    <div className="spec__head"><span className="spec__no">{p.no}</span><span className="spec__en">{p.en}</span><span className="spec__ko">{p.ko}</span></div>
                    <h3>{p.title}</h3>
                    <p className="spec__body">{p.body}</p>
                    <p className="spec__lab">{p.lab}</p>
                  </article>
                );
              })()}
              <ol className="spec__dots">
                {PARTS.map((p, i) => <li key={p.no} className={step - 2 === i ? 'on' : step - 2 > i ? 'done' : ''}>{p.no}</li>)}
              </ol>
            </div>
          </div>
        </section>

        {/* LAUNCH */}
        <section className="launch" ref={launch}>
          <div className="sticky launch__inner">
            <h2 className="launch__title"><span>FULL</span><span>THROTTLE</span></h2>
            <p className="launch__sub">미래로, 질주.</p>
          </div>
        </section>

        {/* VALUES — 덕목 인덱스 */}
        <section className="values" id="values" ref={(el) => { values.current = el; addOpaque(el); }} style={{ '--v1': VIRTUES[virtue].hue[0], '--v2': VIRTUES[virtue].hue[1] } as React.CSSProperties}>
          <div className="sticky values__inner">
            <div className="values__glow" aria-hidden />
            <div className="values__head">
              <span className="fig">FIG. 04 — FOUR VIRTUES</span>
              <p>한양인이 지켜 온<br />네 가지 덕목</p>
            </div>
            <ol className="vindex" ref={prism}>
              {VIRTUES.map((v, i) => (
                <li key={v.ko} className={i === virtue ? 'on' : i < virtue ? 'done' : ''}>
                  <span className="vindex__no">0{i + 1}</span>
                  <span className="vindex__ko">{v.ko}</span>
                  <span className="vindex__en">{v.en}</span>
                  <i className="vindex__bar" />
                </li>
              ))}
            </ol>
            <div className="values__quote" key={virtue}>
              <span>{VIRTUES[virtue].en}</span>
              <p>{VIRTUES[virtue].d}</p>
            </div>
          </div>
        </section>

        {/* HISTORY — 입체 숫자 연표 */}
        <section className="history" id="history" ref={(el) => { history.current = el; addOpaque(el); }}>
          <div className="sticky history__sticky">
            <span className="fig history__fig">FIG. 04 — SINCE 1939</span>
            <div className="history__track" ref={track}>
              {HISTORY.map(([y, t, d], i) => (
                <article className="era" key={y}>
                  <span className="era__year" data-t={y}>{y}</span>
                  <div className="era__body">
                    <span>0{i + 1}</span>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* COLLEGES — 아이소메트릭 3D 타워 */}
        <section className="colleges" id="colleges" ref={(el) => { colleges.current = el; addOpaque(el); }}>
          <div className="sticky colleges__sticky">
            <div className="colleges__head">
              <span className="fig">FIG. 05 — COLLEGES</span>
              <h2>스물다섯 층,<br />당신의 층은?</h2>
            </div>
            <div className="iso-stage">
              <div className="iso">
                {tower('SEOUL')}
                {tower('ERICA')}
              </div>
            </div>
            <div className="colleges__now" key={college}>
              <span className="fig">{c.campus === 'SEOUL' ? 'SEOUL CAMPUS' : 'ERICA CAMPUS'} · FLOOR {String((c.campus === 'SEOUL' ? college : college - SEOUL_N) + 1).padStart(2, '0')}</span>
              <h3>{c.ko}</h3>
              <em>{c.en}</em>
              <div className="colleges__bar"><i style={{ width: `${((college + 1) / COLLEGES.length) * 100}%` }} /></div>
              <span className="colleges__count">{String(college + 1).padStart(2, '0')} / {COLLEGES.length}</span>
            </div>
          </div>
        </section>

        {/* CAMPUS — 3D 맵 */}
        <section className="campus" id="campus" ref={campus}>
          <div className="sticky campus__inner">
            <span className="fig">FIG. 06 — TWO CAMPUSES</span>
            <h2>하나의 한양,<br />두 개의 엔진.</h2>
            <div className="campus__cards">
              <article><span>SITE A</span><h3>서울캠퍼스</h3><p>서울 성동구 왕십리. 공과대학과 의과대학을 비롯한 한양의 본교.</p></article>
              <article><span>SITE B</span><h3>ERICA캠퍼스</h3><p>경기 안산. 산학협력과 융합 교육을 설계하는, 현장과 가장 가까운 캠퍼스.</p></article>
            </div>
          </div>
        </section>

        {/* FINALE — 3D 무대로 돌아온 차와 솟아오르는 글자 */}
        <section className="finale" id="apply" ref={finale}>
          <div className="finale__inner">
            <span className="fig">FIG. 07 — IGNITION</span>
            <h2>사랑의 실천자,<br />한양에서 시동을 겁니다.</h2>
            <a className="btn btn--blue btn--big" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학처 바로가기 →</a>
          </div>
          <footer className="footer">
            <span>본 페이지는 Team Semicolon이 제작한 비공식 홍보 페이지입니다.</span>
            <span>공식 정보 · <a href="https://www.hanyang.ac.kr" target="_blank" rel="noopener">hanyang.ac.kr</a></span>
          </footer>
        </section>
      </main>
    </>
  );
}
