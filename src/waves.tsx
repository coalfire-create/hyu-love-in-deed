import { useEffect, useRef } from 'react';

// 덕목 섹션 배경: 수십 가닥의 빛줄이 리본처럼 흐르는 2D 캔버스 (WebGL 없이 가볍게)
export function Waves({ colors }: { colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const col = useRef(colors);
  col.current = colors;

  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    let shown = [...col.current];
    const mix = (a: string, b: string, t: number) => {
      const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
      const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    };
    const toHex = (rgb: string) => '#' + rgb.match(/\d+/g)!.map((n) => (+n).toString(16).padStart(2, '0')).join('');
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const dpr = Math.min(devicePixelRatio, 2);
      if (c.width !== Math.round(r.width * dpr)) {
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
      }
      const W = c.width, H = c.height, t = now / 1000;
      shown = shown.map((s, i) => toHex(mix(s, col.current[i], 0.04)));
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      const lines = 46;
      for (let i = 0; i < lines; i++) {
        const k = i / (lines - 1);
        const grad = g.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.25, shown[1]);
        grad.addColorStop(0.6, shown[0]);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.strokeStyle = grad;
        g.globalAlpha = 0.18 + 0.5 * Math.sin(Math.PI * k);
        g.lineWidth = dpr * 1.1;
        g.beginPath();
        for (let x = 0; x <= W; x += 8 * dpr) {
          const u = x / W;
          const env = Math.sin(Math.PI * u);
          const y = H * 0.55 + Math.sin(u * 5.2 + t * 0.6 + k * 1.4) * H * 0.16 * env + Math.sin(u * 2.1 - t * 0.35) * H * 0.08 + (k - 0.5) * H * 0.22 * (0.4 + env);
          x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} className="waves" aria-hidden />;
}
