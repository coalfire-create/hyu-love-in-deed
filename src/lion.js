// A geometric lion head drafted as a blueprint, revealed stroke by stroke.
const NS = 'http://www.w3.org/2000/svg';
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
const poly = (pts, close = false) => 'M' + pts.map((p) => p.join(',')).join(' L') + (close ? ' Z' : '');

function manePoints(spikes, ro, ri, squash, phase = 0) {
  const pts = [];
  for (let k = 0; k < spikes * 2; k++) {
    const a = (k / (spikes * 2)) * Math.PI * 2 - Math.PI / 2 + phase;
    const r = k % 2 ? ri : ro;
    pts.push([+(Math.cos(a) * r).toFixed(1), +(Math.sin(a) * r * squash).toFixed(1)]);
  }
  return pts;
}

export function buildLion(svg) {
  const paths = [];
  const add = (d, cls = 'ln', order = 0) => paths.push({ d, cls, order });

  // construction geometry first — circles, axes, radial guides
  add('M-250,0 L250,0', 'ln ln--thin', 0);
  add('M0,-250 L0,250', 'ln ln--thin', 0);
  add('M-240,0 A240,240 0 1,1 240,0 A240,240 0 1,1 -240,0', 'ln ln--thin', 0.02);
  add('M-150,0 A150,150 0 1,1 150,0 A150,150 0 1,1 -150,0', 'ln ln--thin', 0.05);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    add(`M${(Math.cos(a) * 160).toFixed(1)},${(Math.sin(a) * 160).toFixed(1)} L${(Math.cos(a) * 236).toFixed(1)},${(Math.sin(a) * 236).toFixed(1)}`, 'ln ln--thin', 0.08);
  }

  // mane: outer star, inner ring, and the facets joining them
  const outer = manePoints(16, 228, 178, 1.02);
  const inner = manePoints(12, 172, 150, 1.0, Math.PI / 24);
  add(poly(outer, true), 'ln', 0.18);
  add(poly(inner, true), 'ln', 0.3);
  for (let k = 0; k < outer.length; k += 2) {
    const o = outer[k];
    let best = inner[0], bd = 1e9;
    for (const q of inner) { const d = (q[0] - o[0]) ** 2 + (q[1] - o[1]) ** 2; if (d < bd) { bd = d; best = q; } }
    add(poly([o, best]), 'ln ln--thin', 0.36);
  }

  // face silhouette (right half mirrored)
  const faceR = [[0, -122], [58, -118], [104, -82], [120, -22], [108, 38], [82, 96], [46, 136], [0, 152]];
  const face = [...faceR, ...mirror(faceR).reverse().slice(1, -1)];
  add(poly(face, true), 'ln', 0.45);
  add(poly(face, true), 'fill', 0.45);

  // ears
  for (const s of [1, -1]) {
    add(poly([[s * 70, -112], [s * 128, -158], [s * 108, -84]]), 'ln', 0.52);
    add(poly([[s * 86, -114], [s * 118, -142], [s * 106, -98]]), 'ln ln--thin', 0.55);
  }
  // brows, eyes
  for (const s of [1, -1]) {
    add(poly([[s * 88, -44], [s * 58, -58], [s * 22, -50]]), 'ln', 0.6);
    add(poly([[s * 76, -16], [s * 54, -30], [s * 30, -16], [s * 54, -6]], true), 'ln ln--mark', 0.66);
  }
  // nose bridge, nose, muzzle
  for (const s of [1, -1]) add(poly([[s * 18, -36], [s * 26, 38]]), 'ln', 0.7);
  add(poly([[-30, 38], [30, 38], [0, 70]], true), 'ln', 0.74);
  add(poly([[0, 70], [0, 90]]), 'ln', 0.78);
  for (const s of [1, -1]) {
    add(poly([[0, 90], [s * 36, 104]]), 'ln', 0.8);
    add(poly([[s * 30, 38], [s * 108, 38]]), 'ln ln--thin', 0.82);
    add(poly([[s * 30, 38], [s * 82, 96]]), 'ln ln--thin', 0.84);
    add(poly([[s * 36, 104], [s * 46, 136]]), 'ln ln--thin', 0.86);
    // whisker dots
    for (let w = 0; w < 3; w++) add(`M${s * (44 + w * 14)},${60 + w * 6} l0.1,0`, 'ln ln--mark', 0.88);
  }
  add(poly([[-30, 122], [0, 136], [30, 122]]), 'ln', 0.9);

  // dimension line under the drawing
  add('M-150,248 L150,248 M-150,240 L-150,256 M150,240 L150,256', 'ln ln--mark', 0.94);

  const els = paths.map(({ d, cls, order }) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    svg.append(p);
    const len = cls === 'fill' ? 0 : p.getTotalLength();
    if (len) { p.style.strokeDasharray = `${len} ${len}`; p.style.strokeDashoffset = len; }
    return { p, len, order, fill: cls === 'fill' };
  });
  const label = document.createElementNS(NS, 'text');
  label.textContent = 'LION — HY SYMBOL / 1 : 1';
  label.setAttribute('y', 238); label.setAttribute('text-anchor', 'middle');
  label.setAttribute('style', 'font: 10px JetBrains Mono, monospace; fill: #ff6b4a; letter-spacing: .12em; opacity: 0');
  svg.append(label);

  return (progress) => {
    for (const e of els) {
      const k = Math.min(1, Math.max(0, (progress - e.order * 0.85) / 0.16));
      if (e.fill) e.p.style.opacity = Math.max(0, (progress - 0.92) / 0.08);
      else e.p.style.strokeDashoffset = e.len * (1 - k);
    }
    label.style.opacity = progress > 0.95 ? 1 : 0;
  };
}

// Stylised site plans for the two campuses, drawn on when they scroll in.
export function buildPlan(svg, kind) {
  let seed = kind === 'seoul' ? 11 : 29;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.append(e); return e; };
  // hill contours for Seoul, a flat grid + lake for ERICA
  if (kind === 'seoul') {
    for (let i = 0; i < 5; i++) mk('ellipse', { cx: 150, cy: 150, rx: 150 - i * 26, ry: 100 - i * 17, class: 'p-ln', opacity: 0.35 });
    mk('path', { d: 'M0,230 C90,200 140,120 260,110 S400,60 400,60', class: 'p-road' });
  } else {
    for (let x = 0; x <= 400; x += 40) mk('path', { d: `M${x},0 L${x},260`, class: 'p-ln', opacity: 0.18 });
    mk('path', { d: 'M0,190 L400,170', class: 'p-road' });
    mk('path', { d: 'M300,20 C360,30 390,80 370,120 C330,140 280,110 285,70 Z', class: 'p-ln', opacity: 0.6 });
  }
  const shapes = [];
  for (let i = 0; i < 14; i++) {
    const w = 22 + rnd() * 46, h = 16 + rnd() * 30;
    const x = 20 + rnd() * (360 - w), y = 20 + rnd() * (200 - h);
    shapes.push(mk('rect', { x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), class: 'p-bd', transform: `rotate(${((rnd() - 0.5) * 20).toFixed(1)} ${x + w / 2} ${y + h / 2})` }));
  }
  mk('text', { x: 14, y: 250, class: 'p-txt' }).textContent = kind === 'seoul' ? 'N 37.557° · E 127.045°  — SEONGDONG-GU' : 'N 37.297° · E 126.835°  — ANSAN';
  mk('path', { d: 'M372,18 l0,26 M364,30 l8,-12 l8,12', class: 'p-ln' });
  mk('text', { x: 368, y: 56, class: 'p-txt' }).textContent = 'N';
  const all = [...svg.querySelectorAll('rect, path, ellipse')];
  all.forEach((e) => { const l = e.getTotalLength?.() || 400; e.style.strokeDasharray = l; e.style.strokeDashoffset = l; e.style.transition = 'stroke-dashoffset 1.6s ease, fill-opacity 1s'; if (e.classList.contains('p-bd')) e.style.fillOpacity = 0; });
  return () => all.forEach((e, i) => setTimeout(() => { e.style.strokeDashoffset = 0; e.style.fillOpacity = ''; }, i * 45));
}
