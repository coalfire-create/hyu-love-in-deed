import './style.css';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Assembly } from './assembly.js';
import { buildGears } from './gears.js';
import { buildLion, buildPlan } from './lion.js';

gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ lerp: 0.09 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); lenis.scrollTo(a.getAttribute('href'), { duration: 1.6 }); }));

const narrow = () => innerWidth < 820;
const clamp = (x) => Math.max(0, Math.min(1, x));
const progressOf = (el) => { const r = el.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };

await document.fonts.load('700 200px "Space Grotesk"').catch(() => {});

// HERO — word assembles on load, breaks apart as you scroll away
const hero = new Assembly(document.getElementById('cvHero'), {
  lines: narrow() ? ['HAN', 'YANG'] : ['HANYANG'],
  fill: narrow() ? 0.86 : 0.74,
  yShift: narrow() ? 0.16 : 0.12,
});
gsap.to(hero, { progress: 1, duration: 3.2, ease: 'power2.inOut', delay: 0.2 });

// FINALE — a dim second assembly behind the call to action
const finaleCv = document.getElementById('cvFinale');
const finale = new Assembly(finaleCv, { lines: ['사랑의', '실천'], font: '800 200px "Pretendard Variable", sans-serif', fill: narrow() ? 0.9 : 0.5, dim: 0.35 });

// 01 gears, 02 lion
const driveGears = buildGears(document.querySelector('#gears svg'));
const drawLion = buildLion(document.getElementById('lionSvg'));
const notes = [...document.querySelectorAll('.lion__notes .note')];

// 04 campus plans draw on when they enter
document.querySelectorAll('.plan').forEach((card) => {
  const play = buildPlan(card.querySelector('svg'), card.dataset.plan);
  ScrollTrigger.create({ trigger: card, start: 'top 80%', once: true, onEnter: play });
});

// 05 colleges
const COLLEGES = {
  seoul: ['공과대학', '의과대학', '간호대학', '인문과학대학', '사회과학대학', '자연과학대학', '정책과학대학', '경제금융대학', '경영대학', '사범대학', '생활과학대학', '음악대학', '예술·체육대학', '국제대학', '산업융합학부'],
  erica: ['공학대학', '소프트웨어융합대학', '약학대학', '첨단융합대학', '글로벌문화통상대학', '커뮤니케이션&컬처대학', '경상대학', '디자인대학', '예체능대학', 'LIONS칼리지'],
};
const spec = document.getElementById('spec');
function showColleges(key) {
  spec.innerHTML = COLLEGES[key].map((n, i) => `<li class="enter" style="animation-delay:${i * 35}ms"><span class="no">${key === 'seoul' ? 'S' : 'E'}-${String(i + 1).padStart(2, '0')}</span><span class="nm">${n}</span></li>`).join('');
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('is-active', x === t));
  showColleges(t.dataset.tab);
}));
showColleges('seoul');

// finale stamp
ScrollTrigger.create({ trigger: '.finale', start: 'top 45%', once: true, onEnter: () => {
  document.querySelector('.stamp').classList.add('is-on');
  gsap.to(finale, { progress: 1, duration: 2.0, ease: 'power2.out' });
} });

// scroll-linked state, read every frame
const $hero = document.getElementById('hero'), $deed = document.getElementById('deed'), $lion = document.getElementById('lion'), $since = document.getElementById('since');
const fill = document.querySelector('.timeline__fill'), tls = [...document.querySelectorAll('.tl')];
let visHero = true, visFinale = false;
new IntersectionObserver((es) => es.forEach((e) => { if (e.target === $hero) visHero = e.isIntersecting; else visFinale = e.isIntersecting; })).observe($hero);
new IntersectionObserver((es) => es.forEach((e) => (visFinale = e.isIntersecting))).observe(document.getElementById('finale'));

gsap.ticker.add((time) => {
  const hr = $hero.getBoundingClientRect();
  hero.explode = clamp(-hr.top / (hr.height * 0.9)) * 0.9;
  if (visHero) hero.render(time);
  if (visFinale) finale.render(time);

  driveGears(progressOf($deed));
  const lp = progressOf($lion);
  drawLion(lp);
  notes.forEach((n, i) => n.classList.toggle('is-on', lp > 0.55 + i * 0.1));

  const sp = progressOf($since);
  const f = clamp(sp / 0.85);
  if (narrow()) { fill.style.height = f * 100 + '%'; fill.style.width = '100%'; } else { fill.style.width = f * 100 + '%'; fill.style.height = '100%'; }
  tls.forEach((t, i) => t.classList.toggle('is-on', f >= i / 2 - 0.001 + (i ? 0 : 0.02)));
});
