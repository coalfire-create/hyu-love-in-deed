// Four meshing spur gears — 근면·정직·겸손·봉사 — driven by one scroll value.
const NS = 'http://www.w3.org/2000/svg';
const VIRTUES = [
  { ko: '근면', en: 'DILIGENCE', teeth: 18 },
  { ko: '정직', en: 'HONESTY', teeth: 12 },
  { ko: '겸손', en: 'HUMILITY', teeth: 15 },
  { ko: '봉사', en: 'SERVICE', teeth: 10 },
];
const M = 16; // module: pitch radius = M * teeth / 2

function gearPath(t) {
  const r = (M * t) / 2, rt = r + M * 0.9, rr = r - M * 1.1, p = (Math.PI * 2) / t;
  const pt = (rad, a) => `${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`;
  let d = '';
  for (let k = 0; k < t; k++) {
    const a = k * p;
    d += `${k ? 'L' : 'M'}${pt(rr, a - 0.34 * p)} L${pt(rt, a - 0.14 * p)} L${pt(rt, a + 0.14 * p)} L${pt(rr, a + 0.34 * p)} `;
    d += `A${rr},${rr} 0 0 1 ${pt(rr, a + 0.66 * p)} `;
  }
  return d + 'Z';
}

export function buildGears(svg) {
  // lay the chain out on a gentle zig-zag so all four read at once
  const dirs = [-0.35, 0.55, -0.25];
  const g = [];
  let x = 150, y = 330;
  VIRTUES.forEach((v, i) => {
    const r = (M * v.teeth) / 2;
    if (i > 0) {
      const prev = g[i - 1], d = prev.r + r, phi = dirs[i - 1];
      x = prev.x + d * Math.cos(phi); y = prev.y + d * Math.sin(phi);
      // mesh phase: the tooth phase of this gear at the contact line mirrors the previous
      // gear's phase shifted by half a pitch, so teeth sit in gaps (and stay there as they turn)
      const pA = (Math.PI * 2) / prev.teeth, pB = (Math.PI * 2) / v.teeth;
      v.base = phi + Math.PI - pB * (0.5 - (phi - prev.base) / pA);
    } else v.base = 0;
    g.push({ ...v, r, x, y, base: v.base });
  });
  // centre the whole chain in the viewBox
  const minX = Math.min(...g.map((a) => a.x - a.r)), maxX = Math.max(...g.map((a) => a.x + a.r));
  const minY = Math.min(...g.map((a) => a.y - a.r)), maxY = Math.max(...g.map((a) => a.y + a.r));
  const ox = 0, oy = 0, pad = 24;
  svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);

  const els = g.map((a, i) => {
    const grp = document.createElementNS(NS, 'g');
    grp.setAttribute('class', 'gear');
    grp.setAttribute('transform', `translate(${a.x + ox} ${a.y + oy})`);
    const rotor = document.createElementNS(NS, 'g');
    const body = document.createElementNS(NS, 'path');
    body.setAttribute('d', gearPath(a.teeth));
    body.setAttribute('class', 'gear-body');
    const hub = document.createElementNS(NS, 'circle');
    hub.setAttribute('r', a.r * 0.62);
    hub.setAttribute('class', 'gear-hub');
    const axle = document.createElementNS(NS, 'circle');
    axle.setAttribute('r', 5); axle.setAttribute('fill', '#7fd4ff');
    rotor.append(body, hub, axle);
    // spokes
    for (let s = 0; s < 4; s++) {
      const l = document.createElementNS(NS, 'line');
      const ang = (s * Math.PI) / 2;
      l.setAttribute('x1', Math.cos(ang) * 10); l.setAttribute('y1', Math.sin(ang) * 10);
      l.setAttribute('x2', Math.cos(ang) * a.r * 0.6); l.setAttribute('y2', Math.sin(ang) * a.r * 0.6);
      l.setAttribute('stroke', 'rgba(127,212,255,.4)');
      rotor.append(l);
    }
    const ko = document.createElementNS(NS, 'text');
    ko.textContent = a.ko; ko.setAttribute('class', 'gear-label'); ko.setAttribute('font-size', Math.max(20, a.r * 0.36));
    ko.setAttribute('y', -6);
    const en = document.createElementNS(NS, 'text');
    en.textContent = a.en; en.setAttribute('class', 'gear-en'); en.setAttribute('y', a.r * 0.26);
    grp.append(rotor, ko, en);
    svg.append(grp);
    return { rotor, grp, a, i };
  });

  return (progress) => {
    // drive gear 0; every other gear follows the tooth ratio with alternating direction
    const theta0 = progress * Math.PI * 2.2;
    const hot = Math.min(3, Math.floor(progress * 4));
    let angle = theta0;
    els.forEach(({ rotor, grp, a, i }) => {
      if (i > 0) angle = -angle * (VIRTUES[i - 1].teeth / a.teeth);
      rotor.setAttribute('transform', `rotate(${((a.base + angle) * 180) / Math.PI})`);
      grp.classList.toggle('is-hot', i === hot);
    });
  };
}
