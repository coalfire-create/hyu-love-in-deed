import React, { useEffect, useRef, useState } from 'react';
import { Engine, ACCENTS } from './scene/engine';
import { VirtuesSection, HistorySection, CollegesSection, CampusSection } from './sections';

// 부품 소개: 이름 · 한 줄 카피 · 기술 이름과 연구한 곳
const PARTS = [
  {
    no: '01', en: 'Battery', ko: '배터리',
    title: '한 번 충전으로 더 멀리, 더 안전하게.',
    tech: '농도구배형 하이니켈 양극재',
    lab: '에너지공학과 · 선양국 교수 연구팀',
  },
  {
    no: '02', en: 'LiDAR', ko: '라이다 · AI',
    title: '사람 대신 길을 보고 판단해요.',
    tech: '센서 융합 자율주행',
    lab: '미래자동차공학과 · 자율주행 연구',
  },
  {
    no: '03', en: 'E-Motor', ko: '모터 · 인버터',
    title: '가볍지만, 힘은 세게.',
    tech: '고출력 파워트레인 · 경량 소재',
    lab: '신소재공학부 · 기계공학부',
  },
  {
    no: '04', en: 'Cockpit', ko: '콕핏',
    title: '생각만으로 조작해요.',
    tech: '뇌-컴퓨터 인터페이스 (BCI)',
    lab: '바이오메디컬공학과 · 임창환 교수 연구팀',
  },
  {
    no: '05', en: 'Suspension', ko: '서스펜션',
    title: '사람을 걷게 한 기술로, 편안한 승차감을.',
    tech: '로보틱 모션 제어',
    lab: '로봇공학 · 한창수 교수 연구팀',
  },
];

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
  const finale = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
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

    let raf = 0, lastStep = -1;
    // 불투명 섹션이 화면을 덮으면 3D 렌더를 쉰다
    const opaque = Array.from(document.querySelectorAll<HTMLElement>('[data-opaque]'));
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX / innerWidth - 0.5;
      mouse.y = e.clientY / innerHeight - 0.5;
    };
    addEventListener('pointermove', onMove);
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.2 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const vh = innerHeight;
      mouse.sx += (mouse.x - mouse.sx) * 0.08;
      mouse.sy += (mouse.y - mouse.sy) * 0.08;
      const tm = techMap(progress(tech.current!));
      const lp = progress(launch.current!);
      const fr = finale.current!.getBoundingClientRect();
      const fin = clamp01((vh - fr.top) / vh);
      engine?.setState({ hero: clamp01(1 - scrollY / vh), explode: tm.explode, focus: tm.focus, focusAmt: tm.focusAmt, launch: smooth(0.05, 0.85, lp), finale: fin });
      // 메뉴바 아래에 흰 섹션(덕목)이 있으면 메뉴바를 밝은 유리로
      const vt = document.getElementById('values');
      if (vt) {
        const r = vt.getBoundingClientRect();
        document.body.classList.toggle('nav-light', r.top < 60 && r.bottom > 60);
      }
      const paused = opaque.some(covers);
      engine?.setPaused(paused);
      // 라벨마다 visibility가 따로 걸려 있어 부모 visibility로는 못 숨긴다 → display로 끈다
      labels.current!.style.display = paused || fin > 0.3 || !inView(tech.current!) ? 'none' : '';

      if (tm.step !== lastStep) setStep((lastStep = tm.step));

    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      io.disconnect();
      engine?.dispose();
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} className="gl" aria-hidden />
      {glFail && <div className="gl-fallback" />}

      <div className="labels" ref={labels} aria-hidden>
        {PARTS.map((p) => (
          <div className={p.no === '03' ? 'tag tag--left' : 'tag'} key={p.no} style={{ '--acc': ACCENTS[+p.no - 1] } as React.CSSProperties}>
            <i />
            <b><em>{p.no}</em>{p.ko}</b>
          </div>
        ))}
      </div>

      <header className="nav">
        <a href="#top" className="nav__logo"><img className="nav__seal" src="/brand/seal.svg" alt="" /><span className="nav__word">HANYANG<br />UNIVERSITY</span></a>
        <nav className="nav__links">
          <a href="#tech"><em>01</em>Tech</a><a href="#values"><em>02</em>Virtues</a><a href="#colleges"><em>03</em>Colleges</a><a href="#campus"><em>04</em>Campus</a>
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
                <a href="#tech" className="btn btn--line">Scroll</a>
              </div>
            </div>
          </div>
        </section>


        {/* TECH — 3D 분해도 */}
        <section className="tech" id="tech" ref={tech} style={{ height: `${TECH_STEPS * 110}vh` }}>
          <div className="sticky">
            <div className="tech__intro" data-show={step <= 1 || step === 7}>
              {step === 0 && (
                <div key="s0" className="swap">
                  <span className="fig">FIG. 01 — TECHNOLOGY</span>
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
                  <article key={p.no} className="spec__card" style={{ '--acc': ACCENTS[step - 2] } as React.CSSProperties}>
                    <span className="spec__eyebrow">{p.no} — {p.en}</span>
                    <h3>{p.ko}</h3>
                    <p className="spec__tag">{p.title}</p>
                    <p className="spec__meta">{p.tech}<i />{p.lab}</p>
                  </article>
                );
              })()}
              <ol className="spec__dots">
                {PARTS.map((p, i) => <li key={p.no} className={step - 2 === i ? 'on' : step - 2 > i ? 'done' : ''} style={{ '--acc': ACCENTS[i] } as React.CSSProperties}>{p.ko}</li>)}
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

        <VirtuesSection />

        <HistorySection />

        <CollegesSection />

        <CampusSection />

        {/* FINALE — 3D 무대로 돌아온 차와 솟아오르는 글자 */}
        <section className="finale" id="apply" ref={finale}>
          <div className="finale__inner">
            <span className="fig">FIG. 06 — IGNITION</span>
            <h2>사랑의 실천자,<br />한양에서 시동을 겁니다.</h2>
            <a className="btn btn--blue btn--big" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학처 바로가기 →</a>
          </div>
          <footer className="footer">
            <span>본 페이지는 Team Semicolon이 제작한 비공식 홍보 페이지입니다.</span>
            <span>공식 정보 · <a href="https://www.hanyang.ac.kr" target="_blank" rel="noopener">hanyang.ac.kr</a></span>
            <span>3D 차량 모델 · Free Concept Car 025 by Unity Fan (Sketchfab, CC0)</span>
          </footer>
        </section>
      </main>
    </>
  );
}
