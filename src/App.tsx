import { useEffect, useRef, useState } from 'react';
import { Engine } from './scene/engine';
import { Waves } from './waves';

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
  { ko: '근면', en: 'Diligence', d: '오늘의 작은 수고가 내일의 구조를 만든다.', hue: ['#7fb2ff', '#3e7fd1'] },
  { ko: '정직', en: 'Honesty', d: '하중을 속이지 않는 설계처럼, 사람에게도 정직하게.', hue: ['#9ad7ff', '#2a6fd6'] },
  { ko: '겸손', en: 'Humility', d: '앞서 나가되 교만하지 않는 지성인의 태도.', hue: ['#b9a8ff', '#4b5be0'] },
  { ko: '봉사', en: 'Service', d: '배운 것을 세상의 쓸모로 돌려주는 실천.', hue: ['#8ff0d8', '#1d7fa8'] },
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

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const tech = useRef<HTMLElement>(null);
  const launch = useRef<HTMLElement>(null);
  const values = useRef<HTMLElement | null>(null);
  const history = useRef<HTMLElement | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const colleges = useRef<HTMLElement | null>(null);
  const ring = useRef<HTMLDivElement>(null);
  const campus = useRef<HTMLElement>(null);
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

    let raf = 0, lastStep = -1, lastVirtue = -1, lastCollege = -1;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));
    const cards = Array.from(ring.current!.children) as HTMLElement[];
    const N = cards.length, STEP = 360 / N;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const vh = innerHeight;
      const tm = techMap(progress(tech.current!));
      const lp = progress(launch.current!);
      const cp = progress(campus.current!);
      engine?.setState({ hero: clamp01(1 - scrollY / vh), explode: tm.explode, focus: tm.focus, focusAmt: tm.focusAmt, launch: smooth(0.05, 0.85, lp), campus: smooth(0, 0.55, cp), finale: 0 });
      const paused = opaque.current.some(covers);
      engine?.setPaused(paused);
      // 라벨마다 visibility가 따로 걸려 있어 부모 visibility로는 못 숨긴다 → display로 끈다
      const finTop = document.getElementById('apply')!.getBoundingClientRect().top;
      labels.current!.style.display = paused || finTop < vh * 0.7 || (!inView(tech.current!) && !inView(campus.current!)) ? 'none' : '';
      // 밝은 섹션 위에선 메뉴 글씨를 어둡게
      const navLight = opaque.current.some((el) => el.dataset.theme === 'light' && (() => { const r = el.getBoundingClientRect(); return r.top <= 40 && r.bottom > 40; })());
      document.body.classList.toggle('nav-dark', navLight);

      if (tm.step !== lastStep) setStep((lastStep = tm.step));

      const v = Math.min(3, Math.floor(progress(values.current!) * 4));
      if (v !== lastVirtue) setVirtue((lastVirtue = v));

      if (track.current) {
        const max = track.current.scrollWidth - innerWidth;
        track.current.style.transform = `translate3d(${-max * smooth(0.04, 0.96, progress(history.current!))}px,0,0)`;
      }

      // 단과대학 곡면 캐러셀: 스크롤에 따라 원통이 돈다
      const cpos = smooth(0.02, 0.98, progress(colleges.current!)) * (N - 1);
      ring.current!.style.transform = `translateZ(var(--r)) rotateY(${cpos * STEP}deg)`;
      cards.forEach((c, i) => {
        const d = Math.abs(i - cpos);
        c.style.opacity = d > 4.5 ? '0' : String(1 - Math.max(0, d - 3) / 1.5);
      });
      const ci = Math.round(cpos);
      if (ci !== lastCollege) setCollege((lastCollege = ci));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      engine?.dispose();
    };
  }, []);

  const addOpaque = (el: HTMLElement | null) => {
    if (el && !opaque.current.includes(el)) opaque.current.push(el);
  };
  const c = COLLEGES[college];

  return (
    <>
      <canvas ref={canvas} className="gl" aria-hidden />
      {glFail && <div className="gl-fallback" />}

      <div className="labels" ref={labels} aria-hidden>
        {PARTS.map((p) => (
          <div className={p.no === '03' ? 'tag tag--left' : 'tag'} key={p.no}>
            <i />
            <b><em>{p.no}</em>{p.en}</b>
          </div>
        ))}
        <div className="tag tag--campus"><i /><b>서울캠퍼스</b></div>
        <div className="tag tag--campus"><i /><b>ERICA캠퍼스</b></div>
      </div>

      <header className="nav">
        <a href="#top" className="nav__logo">Hanyang<sup>1939</sup></a>
        <nav className="nav__links">
          <a href="#name">Name</a><a href="#tech">Technology</a><a href="#values">Values</a><a href="#colleges">Colleges</a><a href="#campus">Campus</a>
        </nav>
        <a className="nav__cta" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학 안내 ↗</a>
      </header>

      <main>
        {/* HERO */}
        <section className="hero" id="top">
          <div className="hero__top">
            <span className="eyebrow">HANYANG UNIVERSITY · EST. 1939</span>
            <span className="eyebrow">SEOUL — ERICA</span>
          </div>
          <div className="hero__bottom">
            <p className="hero__kicker">사랑을 실천하는, 대한민국의 엔진.</p>
            <h1 className="hero__word"><span>Hanyang</span></h1>
            <div className="hero__bar">
              <p>사랑의 실천 — Love in Deed and Truth.<br />말이 아니라 기술과 행동으로 증명해 온 대학.</p>
              <div className="hero__cta">
                <a href="#tech" className="btn btn--light">기술 둘러보기</a>
                <a href="#name" className="btn btn--ghost">Scroll ↓</a>
              </div>
            </div>
          </div>
        </section>

        {/* NAME — 밝은 섹션 */}
        <section className="name" data-theme="light" id="name" ref={addOpaque}>
          <div className="name__card rv">
            <span className="eyebrow eyebrow--dark">01 — OUR NAME</span>
            <h2 className="name__glyph">漢陽</h2>
            <p className="name__line">서울의 옛 이름을 교명으로.</p>
            <dl className="name__dict">
              <div><dt>漢</dt><dd>한수 한</dd></div>
              <div><dt>陽</dt><dd>볕 양</dd></div>
            </dl>
          </div>
          <div className="name__copy">
            <p className="lead lead--dark rv">한양은 서울의 옛 이름입니다. 1939년, 나라의 내일을 공학으로 세우겠다는 뜻으로 문을 연 이 대학은 수도의 이름을 걸고 대한민국 산업의 길을 함께 걸어 왔습니다.</p>
            <div className="name__facts rv">
              <div><b>1939</b><span>개교</span></div>
              <div><b>2</b><span>캠퍼스</span></div>
              <div><b>25</b><span>단과대학</span></div>
            </div>
            <p className="name__lion rv"><span>SYMBOL</span> 한양의 상징은 <b>사자</b>. 용기가 있되 만용을 멀리하고, 앞서되 교만하지 않는 지성인의 의지. 마스코트는 HanYang + Lion, <b>하이리온</b>.</p>
          </div>
        </section>

        {/* TECH — 3D 분해도 */}
        <section className="tech" id="tech" ref={tech} style={{ height: `${TECH_STEPS * 110}vh` }}>
          <div className="sticky">
            <div className="tech__intro" data-show={step <= 1 || step === 7}>
              {step === 0 && (
                <div key="s0" className="swap">
                  <span className="eyebrow">02 — TECHNOLOGY</span>
                  <h2>당신이 타게 될 미래의 차,<br />그 안의 한양.</h2>
                  <p className="lead">스크롤을 내리면 차가 열립니다.</p>
                </div>
              )}
              {step === 1 && (
                <div key="s1" className="swap">
                  <span className="eyebrow">EXPLODED VIEW</span>
                  <h2>다섯 개의 부품,<br />다섯 개의 한양 기술.</h2>
                </div>
              )}
              {step === 7 && (
                <div key="s7" className="swap">
                  <span className="eyebrow">REASSEMBLE</span>
                  <h2>다섯 개의 기술이,<br />하나의 심장으로.</h2>
                </div>
              )}
            </div>
            <div className="spec" data-show={step >= 2 && step <= 6}>
              {step >= 2 && step <= 6 && (() => {
                const p = PARTS[step - 2];
                return (
                  <article key={p.no} className="spec__card swap">
                    <div className="spec__head"><span className="spec__no">{p.no}</span><span className="spec__en">{p.en}</span></div>
                    <p className="spec__part">{p.ko}</p>
                    <h3>{p.title}</h3>
                    <p className="spec__body">{p.body}</p>
                    <p className="spec__lab">{p.lab}</p>
                  </article>
                );
              })()}
              <ol className="spec__dots">
                {PARTS.map((p, i) => <li key={p.no} className={step - 2 === i ? 'on' : step - 2 > i ? 'done' : ''} />)}
              </ol>
            </div>
          </div>
        </section>

        {/* LAUNCH */}
        <section className="launch" ref={launch}>
          <div className="sticky launch__inner">
            <h2 className="launch__title">미래로, <em>질주.</em></h2>
          </div>
        </section>

        {/* VALUES — 한 단어 한 화면 */}
        <section className="values" id="values" ref={(el) => { values.current = el; addOpaque(el); }}>
          <div className="sticky values__inner">
            <Waves colors={VIRTUES[virtue].hue} />
            <span className="eyebrow values__eyebrow">03 — FOUR VIRTUES · 한양인의 덕목</span>
            <div className="values__word" key={virtue}>
              <h2>{VIRTUES[virtue].ko}</h2>
              <p className="values__en">{VIRTUES[virtue].en}</p>
              <p className="values__d">{VIRTUES[virtue].d}</p>
            </div>
            <ol className="values__nav">
              {VIRTUES.map((v, i) => <li key={v.ko} className={i === virtue ? 'on' : ''}><span>0{i + 1}</span>{v.ko}</li>)}
            </ol>
          </div>
        </section>

        {/* HISTORY — 밝은 섹션, 가로 연표 */}
        <section className="history" data-theme="light" id="history" ref={(el) => { history.current = el; addOpaque(el); }}>
          <div className="sticky history__sticky">
            <span className="eyebrow eyebrow--dark history__eyebrow">04 — SINCE 1939</span>
            <div className="history__track" ref={track}>
              {HISTORY.map(([y, t, d], i) => (
                <article className="era" key={y}>
                  <span className="era__year">{y}</span>
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

        {/* COLLEGES — 밝은 섹션, 곡면 카드 */}
        <section className="colleges" data-theme="light" id="colleges" ref={(el) => { colleges.current = el; addOpaque(el); }}>
          <div className="sticky colleges__sticky">
            <div className="colleges__head">
              <span className="eyebrow eyebrow--dark">05 — COLLEGES</span>
              <h2>스물다섯 개의 문,<br />당신의 길은?</h2>
            </div>
            <div className="stage3d">
              <div className="ring" ref={ring}>
                {COLLEGES.map((cc, i) => (
                  <article key={cc.ko} className={`ccard ccard--${cc.campus.toLowerCase()}`} style={{ transform: `rotateY(${-(i * 360) / COLLEGES.length}deg) translateZ(calc(var(--r) * -1))` }}>
                    <span className="ccard__no">{String(i + 1).padStart(2, '0')}</span>
                    <span className="ccard__campus">{cc.campus}</span>
                    <h3>{cc.ko}</h3>
                    <em>{cc.en}</em>
                  </article>
                ))}
              </div>
            </div>
            <div className="colleges__foot">
              <p><b>{c?.ko}</b> <em>{c?.en}</em> · {c?.campus === 'SEOUL' ? '서울캠퍼스' : 'ERICA캠퍼스'}</p>
              <span>{String(college + 1).padStart(2, '0')} / {COLLEGES.length}</span>
            </div>
          </div>
        </section>

        {/* CAMPUS — 3D 맵 */}
        <section className="campus" id="campus" ref={campus}>
          <div className="sticky campus__inner">
            <span className="eyebrow">06 — TWO CAMPUSES</span>
            <h2>하나의 한양,<br />두 개의 엔진.</h2>
            <div className="campus__cards">
              <article><span>SEOUL</span><h3>서울캠퍼스</h3><p>서울 성동구 왕십리. 공과대학과 의과대학을 비롯한 한양의 본교.</p></article>
              <article><span>ERICA</span><h3>ERICA캠퍼스</h3><p>경기 안산. 산학협력과 융합 교육을 설계하는, 현장과 가장 가까운 캠퍼스.</p></article>
            </div>
          </div>
        </section>

        {/* FINALE — 빛줄기 */}
        <section className="finale" data-theme="light" id="apply" ref={addOpaque}>
          <div className="rays" aria-hidden />
          <div className="finale__inner">
            <h2 className="rv">사랑의 실천자,<br />한양에서 시작됩니다.</h2>
            <a className="btn btn--dark rv" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학처 바로가기 →</a>
          </div>
          <footer className="footer">
            <span>서울캠퍼스 · 서울 성동구</span>
            <span>본 페이지는 Team Semicolon이 제작한 비공식 홍보 페이지입니다. 공식 정보 · <a href="https://www.hanyang.ac.kr" target="_blank" rel="noopener">hanyang.ac.kr</a></span>
            <span>ERICA캠퍼스 · 경기 안산</span>
          </footer>
        </section>
      </main>
    </>
  );
}
