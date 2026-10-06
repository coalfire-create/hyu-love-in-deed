import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// 영상 녹화(?capture)할 땐 부드러운 스크롤을 끈다 — 녹화 스크립트가 스크롤 위치를 직접 정한다
if (!location.search.includes('capture')) {
  const lenis = new Lenis({ lerp: 0.09 });
  const raf = (t: number) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    lenis.scrollTo(a.getAttribute('href')!, { duration: 1.6 });
  });
}
