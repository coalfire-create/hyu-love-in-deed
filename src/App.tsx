import { useEffect, useRef, useState, type ReactNode } from 'react';
import VectorWordmark from './ok/vector-wordmark';
import XylophoneHelix from './ok/xylophone-helix-02';
import CogTrain from './ok/cog-train';
import IsoCubeTrail from './ok/iso-cube-trail';
import TypeSlabField from './ok/type-slab-field';
import Chain from './ok/wobble-fence';

const HY = '#0E4A84';
const SKY = '#7FB2FF';
const INK = '#05070C';

// Mount a WebGL scene only while it is near the viewport, so the page never holds
// more GL contexts than it is actually showing.
function Stage({ children, className = '', margin = '40% 0px' }: { children: ReactNode; className?: string; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, [margin]);
  return <div ref={ref} className={`stage ${className}`}>{on && children}</div>;
}

// Fade/rise elements in as they enter.
function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.18 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const narrow = () => typeof window !== 'undefined' && window.innerWidth < 820;

const VIRTUES = [
  { ko: '근면', en: 'Diligence', d: '오늘의 작은 수고가 내일의 구조를 만든다.' },
  { ko: '정직', en: 'Honesty', d: '하중을 속이지 않는 설계처럼, 사람에게도 정직하게.' },
  { ko: '겸손', en: 'Humility', d: '앞서 나가되 교만하지 않는 지성인의 태도.' },
  { ko: '봉사', en: 'Service', d: '배운 것을 세상의 쓸모로 돌려주는 실천.' },
];
const COLLEGES = {
  seoul: ['공과대학', '의과대학', '간호대학', '인문과학대학', '사회과학대학', '자연과학대학', '정책과학대학', '경제금융대학', '경영대학', '사범대학', '생활과학대학', '음악대학', '예술·체육대학', '국제대학', '산업융합학부'],
  erica: ['공학대학', '소프트웨어융합대학', '약학대학', '첨단융합대학', '글로벌문화통상대학', '커뮤니케이션&컬처대학', '경상대학', '디자인대학', '예체능대학', 'LIONS칼리지'],
};

export default function App() {
  useReveal();
  const [tab, setTab] = useState<'seoul' | 'erica'>('seoul');
  const m = narrow();

  return (
    <>
      <header className="nav">
        <a href="#top" className="nav__logo"><span className="nav__mark">HY</span>Hanyang University</a>
        <nav className="nav__links">
          <a href="#deed">사랑의 실천</a><a href="#virtues">4덕목</a><a href="#since">1939</a><a href="#campus">캠퍼스</a><a href="#colleges">단과대학</a>
        </nav>
        <a className="nav__cta" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학 안내 <span>↗</span></a>
      </header>

      {/* HERO — the wordmark turns into its own vector construction lines under the cursor */}
      <section className="hero" id="top">
        <Stage className="hero__stage" margin="0px">
          <VectorWordmark
            text={m ? 'HY' : 'HANYANG'}
            font={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: m ? '760px' : '250px', lineHeight: '1em', letterSpacing: '-0.04em', textAlign: 'center' }}
            background={INK}
            textColor="#EEF3FF"
            shade={HY}
            accent={SKY}
            reach={m ? 260 : 300}
            handles={m ? { size: 70, spread: 22, labels: true } : undefined}
          />
        </Stage>
        <div className="hero__top mono"><span>EST. 1939</span><span>SEOUL · ERICA</span></div>
        <div className="hero__bottom">
          <div>
            <p className="kicker mono">LOVE IN DEED — 사랑의 실천</p>
            <h1 className="hero__title">생각을 설계하고,<br />사랑을 짓는 대학.</h1>
          </div>
          <div className="hero__side">
            <p>말이 아니라 행동으로. 1939년부터 한양은 실천으로 증명해 왔습니다.</p>
            <a href="#deed" className="pill">Scroll to explore <span>↓</span></a>
          </div>
        </div>
      </section>

      {/* DEED — chrome blade ring */}
      <section className="deed" id="deed">
        <div className="deed__copy">
          <p className="eyebrow rv">01 — Founding Philosophy</p>
          <h2 className="rv">사랑의 실천<span className="en">Love in Deed and Truth</span></h2>
          <p className="lead rv">한양대학교의 건학이념은 <b>사랑의 실천</b>입니다. 일제강점기였던 1939년, 공학 교육으로 나라의 내일을 세우겠다는 뜻에서 출발했습니다.</p>
          <p className="lead rv">한양이 길러내는 사람은 근면·정직·겸손·봉사의 네 가지 덕목을 갖춘 <b>사랑의 실천자</b>입니다.</p>
          <p className="hint mono rv">↔ 드래그하거나 스크롤해서 링을 돌려보세요</p>
        </div>
        <Stage className="deed__stage">
          <XylophoneHelix
            background={INK}
            baseColor="#C9D3E6"
            bars={m ? 34 : 48}
            shape="wheel"
            scale={m ? 62 : 58}
            speed={70}
            hover={{ colors: ['#0E4A84', '#3E7FD1', '#EEF3FF', '#7FB2FF'], strength: 100, tint: 100, glow: 45 }}
            camera={{ tilt: 52, sideTilt: -8 }}
          />
        </Stage>
      </section>

      {/* VIRTUES — a working gear train behind four glass cards */}
      <section className="virtues" id="virtues">
        <Stage className="virtues__stage">
          <CogTrain background={INK} baseColor={HY} accentColor={SKY} density={m ? 60 : 85} size={m ? 60 : 78} speed={60} accentMix={40} />
        </Stage>
        <div className="virtues__inner">
          <p className="eyebrow rv">02 — Four Virtues</p>
          <h2 className="rv">하나가 돌면,<br />모두가 함께 움직인다.</h2>
          <div className="cards">
            {VIRTUES.map((v, i) => (
              <article className="card rv" key={v.ko} style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="card__no mono">0{i + 1}</span>
                <h3>{v.ko}<em>{v.en}</em></h3>
                <p>{v.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SINCE — typographic timeline */}
      <section className="since" id="since">
        <p className="eyebrow rv">03 — Since 1939</p>
        <div className="since__rows">
          {[
            ['1939', '동아공과학원 설립', '김연준 설립자가 사랑의 실천을 건학이념으로 세운 공학 교육기관.'],
            ['1942', '동아고등공업학원 인가', '한양 공학 교육의 뿌리가 된 이름.'],
            ['NOW', '서울 · ERICA 두 캠퍼스', '공학과 의학, 인문과 예술을 아우르는 종합대학.'],
          ].map(([y, t, d]) => (
            <div className="row rv" key={y}>
              <span className="row__year">{y}</span>
              <div><h3>{t}</h3><p>{d}</p></div>
            </div>
          ))}
        </div>
        <p className="lion rv"><span className="mono">SYMBOL</span> 한양의 상징은 <b>사자</b>. 용기가 있되 만용을 멀리하고, 앞서되 교만하지 않는 지성인의 의지를 뜻합니다. 마스코트는 HanYang + Lion, <b>하이리온</b>.</p>
      </section>

      {/* CAMPUS — an isometric city of cubes */}
      <section className="campus" id="campus">
        <Stage className="campus__stage">
          <IsoCubeTrail background={INK} baseColor={HY} density={m ? 60 : 80} gap={50} speed={45} distance={4} cursor={{ reach: 55, lift: -220, grow: 0 }} />
        </Stage>
        <div className="campus__inner">
          <p className="eyebrow rv">04 — Two Campuses</p>
          <h2 className="rv">하나의 한양,<br />두 개의 도시.</h2>
          <div className="campus__cards">
            <article className="glass rv"><span className="mono">SITE A</span><h3>서울캠퍼스</h3><p>서울 성동구 왕십리. 공과대학과 의과대학을 비롯한 한양의 본교.</p></article>
            <article className="glass rv"><span className="mono">SITE B</span><h3>ERICA캠퍼스</h3><p>경기 안산. 산학협력과 융합 교육을 설계하는, 현장과 가장 가까운 캠퍼스.</p></article>
          </div>
        </div>
      </section>

      {/* COLLEGES — 3D type slabs stand up under the cursor */}
      <section className="colleges" id="colleges">
        <Stage className="colleges__stage">
          <TypeSlabField
            background={INK}
            baseColor="#DCE6F8"
            accentColor={SKY}
            keyColor="#3E7FD1"
            text={m ? 'HY' : 'LOVE IN DEED'}
            font={{ fontFamily: 'Inter', fontWeight: 800 }}
            density={m ? 14 : 17}
            size={60}
          />
        </Stage>
        <div className="colleges__inner">
          <p className="eyebrow rv">05 — Colleges</p>
          <h2 className="rv">당신이 설계할 전공은?</h2>
          <div className="tabs rv">
            {(['seoul', 'erica'] as const).map((k) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{k === 'seoul' ? '서울캠퍼스 15' : 'ERICA캠퍼스 10'}</button>
            ))}
          </div>
          <ul className="list" key={tab}>
            {COLLEGES[tab].map((c, i) => (
              <li key={c} style={{ animationDelay: `${i * 30}ms` }}><span className="mono">{tab === 'seoul' ? 'S' : 'E'}{String(i + 1).padStart(2, '0')}</span>{c}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* FINALE — woven metal wires */}
      <section className="finale" id="apply">
        <Stage className="finale__stage">
          <Chain finish="metal" tint={SKY} color={HY} />
        </Stage>
        <div className="finale__inner">
          <p className="eyebrow rv">06 — Apply</p>
          <h2 className="rv">사랑의 실천자,<br />한양에서 시작됩니다.</h2>
          <a className="btn rv" href="https://go.hanyang.ac.kr" target="_blank" rel="noopener">입학처 바로가기 →</a>
        </div>
        <footer className="footer mono">
          <span>본 페이지는 Team Semicolon이 제작한 비공식 홍보 페이지입니다.</span>
          <span>한양대학교 공식 정보 · <a href="https://www.hanyang.ac.kr" target="_blank" rel="noopener">hanyang.ac.kr</a></span>
        </footer>
      </section>
    </>
  );
}
