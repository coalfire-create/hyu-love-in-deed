import { useEffect, useRef, useState } from 'react';
import { Engine } from './scene/engine';

const PARTS = [
  {
    no: '01', en: 'HIGH-NICKEL BATTERY', ko: '하부 배터리 팩',
    lab: '에너지공학과 · 선양국 교수 연구팀',
    title: '농도구배형 하이니켈 양극재',
    body: '입자의 안쪽과 바깥쪽 니켈 농도를 다르게 설계해, 높은 에너지 밀도와 안정성을 동시에 잡은 양극재 원천 기술. 전기차 배터리 소재 연구를 대표하는 한양의 성과입니다.',
    tags: ['Core–Shell', 'Energy Density', 'Thermal Safety'],
  },
  {
    no: '02', en: 'LiDAR & AI COMPUTE', ko: '루프탑 라이다 · AI 유닛',
    lab: '미래자동차공학과 · 자율주행 연구',
    title: '도심을 읽는 자율주행',
    body: '라이다·카메라·레이더를 융합해 복잡한 도심 도로를 스스로 인지하고 판단하는 자율주행 알고리즘. 실제 도로 위에서 검증을 이어 온 연구입니다.',
    tags: ['Sensor Fusion', 'V2X', 'Urban Driving'],
  },
  {
    no: '03', en: 'E-MOTOR & POWER CORE', ko: '전동화 모터 · 인버터',
    lab: '신소재공학부 · 기계공학부',
    title: '고출력 파워트레인과 경량 소재',
    body: '고속 회전과 열을 견디는 경량 합금, 전력을 효율적으로 바꾸는 인버터. 1939년 공학 교육으로 출발한 한양의 재료·기계 역량이 한곳에 모입니다.',
    tags: ['Lightweight Alloy', 'Inverter', 'Powertrain'],
  },
  {
    no: '04', en: 'BIO-COCKPIT & BCI', ko: '스마트 콕핏 · 뇌파 센서',
    lab: '바이오메디컬공학과 · 임창환 교수 연구팀',
    title: '생각으로 움직이는 인터페이스',
    body: '뇌파 신호를 읽어 생각만으로 기기를 조작하는 뇌-컴퓨터 인터페이스(BCI). 운전자의 졸음과 집중 상태를 읽어내는 지능형 콕핏으로 확장됩니다.',
    tags: ['EEG', 'Neural Signal', 'Driver State'],
  },
  {
    no: '05', en: 'ROBOTIC SUSPENSION', ko: '로보틱 액티브 서스펜션',
    lab: '로봇공학 · 한창수 교수 연구팀',
    title: '사람을 걷게 한 모션 제어',
    body: '착용형 외골격 로봇 연구에서 쌓은 정밀 구동·제어 기술. 노면에 실시간으로 반응하는 능동형 서스펜션의 원리와 맞닿아 있습니다.',
    tags: ['Actuator', 'Exoskeleton', 'Motion Control'],
  },
];

const HISTORY = [
  ['1939', '동아공과학원', '사랑의 실천을 건학이념으로, 공학 교육으로 나라의 내일을 세우겠다는 뜻에서 출발.'],
  ['1959', '한양대학교', '종합대학으로 승격. 공학의 뿌리 위에 인문·사회·의학이 더해진다.'],
  ['1979', '안산캠퍼스', '오늘의 ERICA. 산업 현장과 맞닿은 두 번째 캠퍼스가 문을 연다.'],
  ['NOW', '두 개의 엔진', '서울과 ERICA, 25개 단과대학이 함께 돌아가는 대한민국의 푸른 심장.'],
];

const COLLEGES = {
  seoul: ['공과대학', '의과대학', '간호대학', '인문과학대학', '사회과학대학', '자연과학대학', '정책과학대학', '경제금융대학', '경영대학', '사범대학', '생활과학대학', '음악대학', '예술·체육대학', '국제대학', '산업융합학부'],
  erica: ['공학대학', '소프트웨어융합대학', '약학대학', '첨단융합대학', '글로벌문화통상대학', '커뮤니케이션&컬처대학', '경상대학', '디자인대학', '예체능대학', 'LIONS칼리지'],
};

const FIELDS = ['배터리', '반도체', '모빌리티', '건설·플랜트', '바이오·헬스', 'AI·소프트웨어', '에너지', '로보틱스', '소재', '금융', '콘텐츠', '스타트업'];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// 스티키 섹션 안에서 스크롤이 얼마나 진행됐는지 (0~1)
const progress = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - innerHeight));
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
  const history = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const campus = useRef<HTMLElement>(null);
  const finale = useRef<HTMLElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [tab, setTab] = useState<'seoul' | 'erica'>('seoul');
  const [glFail, setGlFail] = useState(false);

  useEffect(() => {
    let engine: Engine;
    try {
      engine = new Engine(canvas.current!);
    } catch {
      setGlFail(true);
      return;
    }
    if (import.meta.env.DEV || location.search.includes('debug')) (window as any).__engine = engine;
    engine.setLabels(Array.from(labels.current!.children) as HTMLElement[]);

    let raf = 0, lastStep = -1;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const vh = innerHeight;
      const hero = clamp01(1 - scrollY / vh);
      const tp = progress(tech.current!);
      const tm = techMap(tp);
      const lp = progress(launch.current!);
      const hp = progress(history.current!);
      const cp = progress(campus.current!);
      const fr = finale.current!.getBoundingClientRect();
      const fin = clamp01((vh - fr.top) / vh);
      engine.setState({ hero, explode: tm.explode, focus: tm.focus, focusAmt: tm.focusAmt, launch: smooth(0.05, 0.85, lp), campus: smooth(0, 0.55, cp), finale: fin });

      if (tm.step !== lastStep) {
        lastStep = tm.step;
        setStep(tm.step);
      }
      if (track.current) {
        const max = track.current.scrollWidth - innerWidth;
        track.current.style.transform = `translate3d(${-max * smooth(0.04, 0.96, hp)}px,0,0)`;
      }
      // HUD 텔레메트리
      const h = hud.current;
      if (h) {
        const docP = scrollY / Math.max(1, document.documentElement.scrollHeight - vh);
        const histTop = history.current!.getBoundingClientRect().top;
        const mode =
          fin > 0.4 ? 'ROAR' : cp > 0.02 ? 'CAMPUS MAP' : histTop < vh * 0.5 ? 'ARCHIVE' : lp > 0.02 ? 'LAUNCH'
          : tm.step === 0 ? 'ASSEMBLED' : tm.step === 1 ? 'EXPLODED VIEW' : tm.step === 7 ? 'REASSEMBLE' : `X-RAY · 0${tm.focus + 1}`;
        (h.querySelector('[data-mode]') as HTMLElement).textContent = mode;
        h.classList.toggle('quiet', mode === 'ARCHIVE' || mode === 'ROAR');
        (h.querySelector('[data-pct]') as HTMLElement).textContent = String(Math.round(docP * 100)).padStart(3, '0');
        (h.querySelector('[data-speed]') as HTMLElement).textContent = String(Math.round(smooth(0.05, 0.85, lp) * 320)).padStart(3, '0');
        (h.querySelector('[data-bar]') as HTMLElement).style.transform = `scaleY(${docP})`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      engine.dispose();
    };
  }, []);

  const stepCopy = [
    { k: 'ASSEMBLED', h: '오늘 당신이 경험하는\n모든 첨단 기술 속에,', p: '한양의 기술이 숨 쉬고 있습니다. 스크롤을 내려 차를 열어보세요.' },
    { k: 'EXPLODED VIEW', h: '분해하면,\n보입니다.', p: '차체가 떠오르고, 배터리가 내려앉고, 바퀴가 펼쳐집니다. 다섯 개의 부품, 다섯 개의 한양 원천 기술.' },
  ];

  return (
    <>
      <canvas ref={canvas} className="gl" aria-hidden />
      {glFail && <div className="gl-fallback" />}

      <div className="labels" ref={labels} aria-hidden>
        {PARTS.map((p) => (
          <div className="tag" key={p.no}>
            <i />
            <span className="mono">{p.no}</span>
            <b>{p.en}</b>
          </div>
        ))}
        <div className="tag tag--campus"><i /><span className="mono">SITE A</span><b>SEOUL · 왕십리</b></div>
        <div className="tag tag--campus"><i /><span className="mono">SITE B</span><b>ERICA · 안산</b></div>
      </div>

      <header className="nav">
        <a href="#top" className="nav__logo"><span className="nav__mark">HY</span><span>PROJECT BLUE ENGINE</span></a>
        <nav className="nav__links">
          <a href="#tech">기술</a><a href="#history">1939</a><a href="#people">사람</a><a href="#campus">캠퍼스</a>
        </nav>
        <a className="nav__cta" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학 안내 <span>↗</span></a>
      </header>

      <div className="hud mono" ref={hud} aria-hidden>
        <div className="hud__tl"><span>HYU / 1939</span><span>SYS <em data-mode>ASSEMBLED</em></span></div>
        <div className="hud__bl"><span>SPD <em data-speed>000</em> km/h</span><span>SCR <em data-pct>000</em>%</span></div>
        <div className="hud__rail"><i data-bar /></div>
      </div>

      <main>
        {/* HERO */}
        <section className="hero" id="top">
          <div className="hero__copy">
            <p className="kicker mono rv in">PROJECT BLUE ENGINE — 대한민국을 움직이는 푸른 심장</p>
            <h1 className="hero__title">
              <span className="line"><span>The Engine</span></span>
              <span className="line"><span>of <em>Korea.</em></span></span>
            </h1>
          </div>
          <div className="hero__side">
            <p>세상을 설계하고, 사랑을 실천하는 지성.<br />Driven by <b>Love in Deed.</b></p>
            <a href="#tech" className="pill">Scroll to ignite <span>↓</span></a>
          </div>
        </section>

        {/* TECH — 스크롤 분해도 */}
        <section className="tech" id="tech" ref={tech} style={{ height: `${TECH_STEPS * 110}vh` }}>
          <div className="sticky">
            <div className="tech__intro" data-show={step <= 1 || step === 7}>
              {step <= 1 && (
                <div key={step} className="swap">
                  <p className="eyebrow">{stepCopy[step].k}</p>
                  <h2>{stepCopy[step].h.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</h2>
                  <p className="lead">{stepCopy[step].p}</p>
                </div>
              )}
              {step === 7 && (
                <div key="re" className="swap">
                  <p className="eyebrow">REASSEMBLE</p>
                  <h2>다섯 개의 기술이,<br />하나의 심장으로.</h2>
                  <p className="lead">모든 부품이 다시 맞물립니다. 이제 달릴 차례입니다.</p>
                </div>
              )}
            </div>

            <div className="spec" data-show={step >= 2 && step <= 6}>
              {step >= 2 && step <= 6 && (() => {
                const p = PARTS[step - 2];
                return (
                  <article key={p.no} className="spec__card swap">
                    <header>
                      <span className="spec__no">{p.no}</span>
                      <div><p className="mono">{p.en}</p><h3>{p.ko}</h3></div>
                    </header>
                    <h4>{p.title}</h4>
                    <p className="spec__body">{p.body}</p>
                    <p className="spec__lab mono">{p.lab}</p>
                    <ul>{p.tags.map((t) => <li key={t} className="mono">{t}</li>)}</ul>
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
            <p className="eyebrow">LAUNCH SEQUENCE</p>
            <h2 className="launch__title"><span>미래로,</span><span>질주.</span></h2>
          </div>
        </section>

        {/* HISTORY — 가로로 흐르는 연표 */}
        <section className="history" id="history" ref={history}>
          <div className="sticky history__sticky">
            <p className="eyebrow history__eyebrow">ENGINE OF KOREA — SINCE 1939</p>
            <div className="history__track" ref={track}>
              {HISTORY.map(([y, t, d], i) => (
                <article className="era" key={y}>
                  <span className="era__year">{y}</span>
                  <div className="era__body">
                    <span className="mono">0{i + 1} / 0{HISTORY.length}</span>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                </article>
              ))}
              <article className="era era--lion">
                <span className="era__year">LION</span>
                <div className="era__body">
                  <span className="mono">SYMBOL</span>
                  <h3>용기 있되 만용을 멀리하는</h3>
                  <p>한양의 상징은 사자. 앞서되 교만하지 않는 지성인의 의지. 마스코트는 HanYang + Lion, 하이리온.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* PEOPLE */}
        <section className="people" id="people">
          <p className="eyebrow rv">GREAT MINDS & ENTREPRENEURS</p>
          <h2 className="rv">기술을 만든 사람들이,<br />회사를 만듭니다.</h2>
          <p className="lead rv">‘CEO 사관학교’라 불리는 이유. 실험실에서 배운 설계를 현장의 산업과 창업으로 옮겨 온 한양인들이 대한민국 곳곳의 엔진을 돌리고 있습니다.</p>
          <div className="marquee rv" aria-hidden>
            <div>{[...FIELDS, ...FIELDS].map((f, i) => <span key={i}>{f}</span>)}</div>
          </div>
          <div className="stats">
            {[['1939', '공학 교육으로 시작한 해'], ['2', '서울 · ERICA 캠퍼스'], ['25', '단과대학'], ['4', '근면 · 정직 · 겸손 · 봉사']].map(([n, l], i) => (
              <div className="stat rv" key={l} style={{ transitionDelay: `${i * 80}ms` }}>
                <b>{n}</b><span>{l}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CAMPUS — 3D 맵 */}
        <section className="campus" id="campus" ref={campus}>
          <div className="sticky campus__inner">
            <div className="campus__head">
              <p className="eyebrow">CAMPUS & BEYOND</p>
              <h2>하나의 한양,<br />두 개의 엔진.</h2>
            </div>
            <div className="campus__panel">
              <div className="tabs">
                {(['seoul', 'erica'] as const).map((k) => (
                  <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'seoul' ? '서울캠퍼스 15' : 'ERICA캠퍼스 10'}</button>
                ))}
              </div>
              <ul className="list" key={tab}>
                {COLLEGES[tab].map((c, i) => (
                  <li key={c} style={{ animationDelay: `${i * 25}ms` }}><span className="mono">{tab === 'seoul' ? 'S' : 'E'}{String(i + 1).padStart(2, '0')}</span>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FINALE */}
        <section className="finale" id="apply" ref={finale}>
          <div className="finale__inner">
            <p className="eyebrow">THE ROAR</p>
            <h2>미래를 향한 포효,<br />한양에서 시동을 겁니다.</h2>
            <a className="btn" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학처 바로가기 <span>→</span></a>
          </div>
          <footer className="footer mono">
            <span>본 페이지는 Team Semicolon이 제작한 비공식 홍보 페이지입니다.</span>
            <span>한양대학교 공식 정보 · <a href="https://www.hanyang.ac.kr" target="_blank" rel="noopener">hanyang.ac.kr</a></span>
          </footer>
        </section>
      </main>
    </>
  );
}
