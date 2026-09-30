import * as THREE from 'three';

// Drafting lines that fly in from a scattered cloud and lock into a truss-built word.
export class Assembly {
  constructor(canvas, { lines, font = '700 200px "Space Grotesk", sans-serif', step, yShift = 0, fill = 0.8, dim = 1 }) {
    this.canvas = canvas;
    this.dim = dim;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.progress = 0;        // 0 = scattered, 1 = assembled
    this.explode = 0;         // scroll-driven break-apart
    this.rot = { x: 0, y: 0, vx: 0, vy: 0 };
    this.opts = { lines, font, step, yShift, fill };
    this.#build();
    this.#bindDrag();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  #sample() {
    const { lines, font } = this.opts;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    ctx.font = font;
    const lh = parseFloat(font.match(/(\d+)px/)[1]) * 1.02;
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 40;
    const h = Math.ceil(lh * lines.length) + 40;
    c.width = w; c.height = h;
    ctx.font = font; ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, w / 2, 20 + i * lh));
    const data = ctx.getImageData(0, 0, w, h).data;
    const step = this.opts.step ?? Math.max(5, Math.round(w / 150));
    const cols = Math.floor(w / step), rows = Math.floor(h / step);
    const on = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (data[((j * step + (step >> 1)) * w + i * step + (step >> 1)) * 4 + 3] > 140) on[j * cols + i] = 1;
    }
    return { on, cols, rows, w, h, step };
  }

  #build() {
    const { on, cols, rows } = this.#sample();
    const scale = 1 / cols;               // word spans 1 unit wide before fit
    const P = (i, j) => [(i - cols / 2) * scale, -(j - rows / 2) * scale];
    const seg = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (!on[j * cols + i]) continue;
      const nb = [[1, 0], [0, 1], [1, 1], [-1, 1]];
      for (const [di, dj] of nb) {
        const a = i + di, b = j + dj;
        if (a < 0 || a >= cols || b >= rows || !on[b * cols + a]) continue;
        if ((di && dj) && rnd() < 0.55) continue;           // sparse diagonals read as truss bracing
        seg.push([...P(i, j), ...P(a, b), rnd() < 0.035 ? 1 : 0]);
      }
    }
    this.aspect = rows / cols;
    const n = seg.length;
    const target = new Float32Array(n * 6), start = new Float32Array(n * 6), delay = new Float32Array(n * 2), mark = new Float32Array(n * 2), side = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) {
      const [x1, y1, x2, y2, m] = seg[k];
      target.set([x1, y1, 0, x2, y2, 0], k * 6);
      // scattered state: a rigid little stick flung somewhere in a shell around the word
      const r = 0.9 + rnd() * 1.6, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
      const cx = r * Math.sin(ph) * Math.cos(th), cy = r * Math.sin(ph) * Math.sin(th) * 0.7, cz = r * Math.cos(ph);
      const ang = rnd() * Math.PI * 2, len = Math.hypot(x2 - x1, y2 - y1) * (1.5 + rnd() * 2);
      start.set([cx - Math.cos(ang) * len / 2, cy - Math.sin(ang) * len / 2, cz, cx + Math.cos(ang) * len / 2, cy + Math.sin(ang) * len / 2, cz + (rnd() - 0.5) * len], k * 6);
      // assemble left-to-right with jitter, like a plotter pen crossing the sheet
      const d = ((x1 + 0.5) * 0.6 + rnd() * 0.4);
      delay.set([d, d], k * 2);
      mark.set([m, m], k * 2);
      side.set([0, 1], k * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(target, 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    g.setAttribute('aMark', new THREE.BufferAttribute(mark, 1));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.uniforms = { uP: { value: 0 }, uX: { value: 0 }, uTime: { value: 0 }, uDim: { value: this.dim } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aStart; attribute float aDelay; attribute float aMark; attribute float aSide;
        uniform float uP, uX, uTime; varying float vK; varying float vMark;
        void main(){
          float k = clamp((uP * 1.6 - aDelay * 0.6), 0.0, 1.0);
          k = k * k * (3.0 - 2.0 * k);
          k *= 1.0 - uX;
          vec3 p = mix(aStart + vec3(0.0, sin(uTime * 0.6 + aDelay * 9.0) * 0.03, 0.0), position, k);
          p.z += uX * (aDelay - 0.5) * 2.0 + sin(aDelay * 40.0) * uX * 0.6;
          vK = k; vMark = aMark;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDim; varying float vK; varying float vMark;
        void main(){
          vec3 cyan = vec3(0.50, 0.83, 1.0), mark = vec3(1.0, 0.42, 0.29);
          vec3 c = mix(cyan, mark, vMark);
          float a = (0.22 + 0.78 * vK) * uDim;
          gl_FragColor = vec4(c * a, a);
        }`,
    });
    this.lines = new THREE.LineSegments(g, mat);
    this.group.add(this.lines);

    // node dots only where segments meet in the assembled word
    const dots = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: mat.vertexShader.replace('gl_Position =', 'gl_PointSize = 2.2 * vK + 0.6; gl_Position ='),
      fragmentShader: mat.fragmentShader,
    }));
    this.group.add(dots);
  }

  #bindDrag() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!down) { this.hover = { x: e.clientX / innerWidth - 0.5, y: e.clientY / innerHeight - 0.5 }; return; }
      this.rot.vy = (e.clientX - down.x) * 0.006; this.rot.vx = (e.clientY - down.y) * 0.004;
      down = { x: e.clientX, y: e.clientY };
    });
    const up = () => (down = null);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // fit: word width = fill * visible width at z=0
    const vh = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    const vw = vh * this.camera.aspect;
    const s = Math.min(vw * this.opts.fill, (vh * 0.6) / this.aspect);
    this.group.scale.setScalar(s);
    this.group.position.y = vh * this.opts.yShift;
  }

  render(time) {
    const r = this.rot;
    r.y += r.vy; r.x += r.vx; r.vy *= 0.93; r.vx *= 0.93;
    r.x += (0 - r.x) * 0.02; r.y += (0 - r.y) * 0.015;               // spring back to the front view
    const hv = this.hover || { x: 0, y: 0 };
    this.group.rotation.y = r.y + hv.x * 0.25 + Math.sin(time * 0.3) * 0.05;
    this.group.rotation.x = r.x + hv.y * 0.18;
    this.uniforms.uP.value = this.progress;
    this.uniforms.uX.value = this.explode;
    this.uniforms.uTime.value = time;
    this.renderer.render(this.scene, this.camera);
  }
}
