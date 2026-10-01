"use client"

import * as React from "react"
import { useEffect, useRef } from "react"

const FIELD = 27.5

const EYE: [number, number, number] = [40, 40, 40]
const NEAR = 0.001
const FAR = 1000

const HIT_HALF = 10

const CORNER_R = 0.2
const CORNER_SEGS = 3
const CYL_RADIUS = 1.0
const CYL_HEIGHT = 1.0
const CYL_SEGS = 24
const TORUS_RING = 0.5
const TORUS_TUBE = 0.3
const TORUS_TUBULAR = 32
const TORUS_RADIAL = 10
const ICO_RADIUS = 1.0

const INTRO_SECONDS = 3
const INTRO_LIFT_CELLS = 2
const BOB_CELLS = 0.2
const ROT_INTRO_PHASE = 3.14

const FIT_U = Math.SQRT1_2
const FIT_V = Math.sqrt(1.5)
const MARGIN_CELLS = 0.5 + BOB_CELLS + INTRO_LIFT_CELLS + 4 + 1
const COLS_MAX = 160

const FIT_REF = FIT_U * 6 + FIT_V * 4

const REACH_REF = 5
const REACH_INNER_RATIO = 0.4

const POS_K = 5.004
const VEL_K = 3.078
const VEL_GAIN = 3.0
const PRESENCE_K = 8.0

const AMBIENT = 1.0
const HEMI_SKY = 0.346566
const HEMI_GROUND = 1.0
const KEY_DIR: [number, number, number] = [10, 5, 10]
const KEY_INTENSITY = 4.0
const FILL_DIR: [number, number, number] = [-10, 5, 10]
const FILL_INTENSITY = 0.279013
const ROUGH_FLOOR = 0.0525
const F0 = 0.04

const SHADOW_SIZE = 2048
const SHADOW_HALF = 10
const SHADOW_NEAR = 0.5
const SHADOW_FAR = 40
const SHADOW_BIAS = 0.0006
const SHADOW_NORMAL_OFFSET = 1.5

const MAX_DPR = 1.5

const SOLVE = `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aOffset;

uniform float uSide;
uniform vec2  uPos0;
uniform vec2  uPos1;
uniform float uInner;
uniform float uOuter;
uniform float uGrow;
uniform float uLift;
uniform float uBob;
uniform float uIntroLift;
uniform float uRotAmount;
uniform float uRotPhase;
uniform float uTwist;
uniform float uBobPhase;
uniform float uFreq;
uniform float uAnimate;

float map(float value, float min1, float max1, float min2, float max2){
    return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

// The source's rotationMatrix, which is the transpose of the usual Rodrigues
// form — i.e. a turn by -angle. Kept as-is: with one axis and one dial, the
// sign is the direction the source spins in.
mat3 rotationMatrix(vec3 axis, float angle){
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    return mat3(
        oc * axis.x * axis.x + c,          oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c,          oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c);
}

float sdSegment(vec2 p, vec2 a, vec2 b){
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
    return length(pa - ba * h);
}

// glsl-easings, as glslify inlined them into the source's built bundle.
float cubicOut(float t){ float f = t - 1.0; return f * f * f + 1.0; }
float cubicInOut(float t){
    return t < 0.5 ? 4.0 * t * t * t : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0;
}

void solve(out vec3 world, out vec3 nrm, out float toCenter){
    vec3 t = aPos * uSide;
    nrm = aNormal;
    toCenter = length(aOffset);

    float mt = smoothstep(uInner, uOuter, sdSegment(aOffset, uPos0, uPos1));

    // Mouse scale
    t *= 1.0 + cubicOut(1.0 - mt) * uGrow;

    // Instance animation: a per-cube window opening later the further out it is.
    // end - start is (toCenter + 1.5) * 0.06, never zero, so map() is safe.
    float start = toCenter * 0.02;
    float end = start + (toCenter + 1.5) * 0.06;
    float anim = map(clamp(uAnimate, start, end), start, end, 0.0, 1.0);

    if (uRotAmount != 0.0) {
        mat3 R = rotationMatrix(vec3(0.0, 1.0, 1.0),
            uRotAmount * (anim * ${ROT_INTRO_PHASE.toFixed(4)} + uRotPhase + toCenter * 0.4 * uTwist));
        t = R * t;
        nrm = R * nrm;
    }

    // Mouse offset — the dent. uLift is signed and already in world units.
    t.y += (1.0 - mt) * uLift;

    t *= cubicInOut(anim);
    t.y += cubicInOut(1.0 - anim) * uIntroLift;
    t.y += sin(uBobPhase + toCenter * uFreq) * uBob;

    world = vec3(aOffset.x, 0.0, aOffset.y) + t;
}
`

const SHADOW_VERT = `#version 300 es
precision highp float;
${SOLVE}
uniform mat4 uLightViewProj;
void main(){
    vec3 world; vec3 nrm; float tc;
    solve(world, nrm, tc);
    gl_Position = uLightViewProj * vec4(world, 1.0);
}
`

const SHADOW_FRAG = `#version 300 es
precision highp float;
void main(){}
`

const SCENE_VERT = `#version 300 es
precision highp float;
${SOLVE}
uniform mat4  uViewProj;
uniform mat4  uLightViewProj;
uniform float uNormalOffset;
uniform vec3  uBase;
uniform vec3  uWeights;
uniform float uDegrade;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vDiffuse;
out vec4 vLightPos;

void main(){
    vec3 world; vec3 nrm; float toCenter;
    solve(world, nrm, toCenter);

    vWorld = world;
    vNormal = nrm;

    float center = 1.0 - toCenter * 0.12 * uDegrade;
    vec3 tint = clamp(center * uWeights + (1.0 - uWeights), 0.0, 1.0);
    vDiffuse = uBase * tint;

    vLightPos = uLightViewProj * vec4(world + nrm * uNormalOffset, 1.0);
    gl_Position = uViewProj * vec4(world, 1.0);
}
`

const SCENE_FRAG = `#version 300 es
precision highp float;

precision highp sampler2DShadow;

in vec3 vWorld;
in vec3 vNormal;
in vec3 vDiffuse;
in vec4 vLightPos;
out vec4 fragColor;

uniform vec3  uEye;
uniform vec3  uKeyDir;
uniform vec3  uFillDir;
uniform sampler2DShadow uShadowMap;
uniform float uShadowTexel;

const float PI = 3.141592653589793;
const float RECIPROCAL_PI = 0.3183098861837907;

float pow2(float x){ return x * x; }

vec3 F_Schlick(vec3 f0, float f90, float dotVH){
    float f = pow(1.0 - dotVH, 5.0);
    return f0 * (1.0 - f) + vec3(f90) * f;
}
float V_GGX_SmithCorrelated(float alpha, float dotNL, float dotNV){
    float a2 = pow2(alpha);
    float gv = dotNL * sqrt(a2 + (1.0 - a2) * pow2(dotNV));
    float gl = dotNV * sqrt(a2 + (1.0 - a2) * pow2(dotNL));
    return 0.5 / max(gv + gl, 1e-6);
}
float D_GGX(float alpha, float dotNH){
    float a2 = pow2(alpha);
    float d = pow2(dotNH) * (a2 - 1.0) + 1.0;
    return RECIPROCAL_PI * a2 / pow2(d);
}
vec3 BRDF_GGX(vec3 L, vec3 V, vec3 N, float roughness){
    float alpha = pow2(roughness);
    vec3 H = normalize(L + V);
    float dotNL = clamp(dot(N, L), 0.0, 1.0);
    float dotNV = clamp(dot(N, V), 0.0, 1.0);
    float dotNH = clamp(dot(N, H), 0.0, 1.0);
    float dotVH = clamp(dot(V, H), 0.0, 1.0);
    return F_Schlick(vec3(${F0.toFixed(6)}), 1.0, dotVH)
         * (V_GGX_SmithCorrelated(alpha, dotNL, dotNV) * D_GGX(alpha, dotNH));
}

float shadowFactor(){
    vec3 pc = vLightPos.xyz / vLightPos.w * 0.5 + 0.5;
    if (pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0 || pc.z > 1.0) return 1.0;
    float lit = 0.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            lit += texture(uShadowMap,
                vec3(pc.xy + vec2(float(x), float(y)) * uShadowTexel,
                     pc.z - ${SHADOW_BIAS.toFixed(6)}));
        }
    }
    return lit / 9.0;
}

vec3 toSRGB(vec3 c){
    return mix(c * 12.92,
               1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055,
               step(0.0031308, c));
}

void main(){
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uEye - vWorld);
    vec3 albedo = vDiffuse;

    vec3 dxy = max(abs(dFdx(N)), abs(dFdy(N)));
    float roughness = min(${ROUGH_FLOOR.toFixed(6)} + max(max(dxy.x, dxy.y), dxy.z), 1.0);

    float hemiWeight = 0.5 * N.y + 0.5;
    vec3 irradiance = vec3(${AMBIENT.toFixed(6)} + mix(${HEMI_GROUND.toFixed(6)}, ${HEMI_SKY.toFixed(6)}, hemiWeight));
    vec3 col = irradiance * albedo * RECIPROCAL_PI;

    {
        vec3 lc = vec3(${KEY_INTENSITY.toFixed(6)}) * shadowFactor();
        vec3 irr = max(dot(N, uKeyDir), 0.0) * lc;
        col += irr * (albedo * RECIPROCAL_PI + BRDF_GGX(uKeyDir, V, N, roughness));
    }

    {
        vec3 irr = max(dot(N, uFillDir), 0.0) * vec3(${FILL_INTENSITY.toFixed(6)});
        col += irr * (albedo * RECIPROCAL_PI + BRDF_GGX(uFillDir, V, N, roughness));
    }

    fragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
}
`

function parseColor(input: string): [number, number, number] {
    if (!input) return [0, 0, 0]
    let s = String(input).trim()

    const v = s.match(/^var\(\s*--[^,)]+\s*,\s*(.+)\)$/i)
    if (v) s = v[1].trim()

    if (s[0] === "#") {
        const h = s.slice(1)
        const n = (i: number, len: number) =>
            parseInt(len === 1 ? h[i] + h[i] : h.slice(i * 2, i * 2 + 2), 16) / 255
        if (h.length === 3 || h.length === 4) return [n(0, 1), n(1, 1), n(2, 1)]
        if (h.length === 6 || h.length === 8) return [n(0, 2), n(1, 2), n(2, 2)]
        return [0, 0, 0]
    }

    const rgb = s.match(/^rgba?\(([^)]+)\)$/i)
    if (rgb) {
        const p = rgb[1].split(/[\s,/]+/).filter(Boolean)
        const ch = (x: string) =>
            x.endsWith("%") ? parseFloat(x) / 100 : parseFloat(x) / 255
        return [ch(p[0]) || 0, ch(p[1]) || 0, ch(p[2]) || 0]
    }

    const hsl = s.match(/^hsla?\(([^)]+)\)$/i)
    if (hsl) {
        const p = hsl[1].split(/[\s,/]+/).filter(Boolean)
        const h = ((parseFloat(p[0]) % 360) + 360) % 360
        const sa = parseFloat(p[1]) / 100
        const l = parseFloat(p[2]) / 100
        const c = (1 - Math.abs(2 * l - 1)) * sa
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
        const m = l - c / 2
        const t: [number, number, number] =
            h < 60 ? [c, x, 0] :
            h < 120 ? [x, c, 0] :
            h < 180 ? [0, c, x] :
            h < 240 ? [0, x, c] :
            h < 300 ? [x, 0, c] : [c, 0, x]
        return [t[0] + m, t[1] + m, t[2] + m]
    }

    return [0, 0, 0]
}

function srgbToLinear(c: number): number {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

type M4 = Float32Array

function mul(a: M4, b: M4, out: M4): M4 {
    for (let c = 0; c < 4; c++) {
        const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3]
        out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3
        out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3
        out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3
        out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3
    }
    return out
}

function orthoBox(halfW: number, halfH: number, near: number, far: number, out: M4): M4 {
    out.fill(0)
    out[0] = 1 / halfW
    out[5] = 1 / halfH
    out[10] = -2 / (far - near)
    out[14] = -(far + near) / (far - near)
    out[15] = 1
    return out
}

function lookAtOrigin(
    ex: number, ey: number, ez: number,
    ux: number, uy: number, uz: number,
    out: M4
): M4 {
    let zx = ex, zy = ey, zz = ez
    let l = Math.hypot(zx, zy, zz) || 1
    zx /= l; zy /= l; zz /= l
    let xx = uy * zz - uz * zy
    let xy = uz * zx - ux * zz
    let xz = ux * zy - uy * zx
    l = Math.hypot(xx, xy, xz) || 1
    xx /= l; xy /= l; xz /= l
    const yx = zy * xz - zz * xy
    const yy = zz * xx - zx * xz
    const yz = zx * xy - zy * xx
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0
    out[12] = -(xx * ex + xy * ey + xz * ez)
    out[13] = -(yx * ex + yy * ey + yz * ez)
    out[14] = -(zx * ex + zy * ey + zz * ez)
    out[15] = 1
    return out
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("IsoCubeTrail shader:", gl.getShaderInfoLog(sh))
        gl.deleteShader(sh)
        return null
    }
    return sh
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
    const v = compile(gl, gl.VERTEX_SHADER, vs)
    const f = compile(gl, gl.FRAGMENT_SHADER, fs)
    if (!v || !f) return null
    const p = gl.createProgram()
    if (!p) return null
    gl.attachShader(p, v)
    gl.attachShader(p, f)
    gl.linkProgram(p)
    gl.deleteShader(v)
    gl.deleteShader(f)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("IsoCubeTrail link:", gl.getProgramInfoLog(p))
        return null
    }
    return p
}

function uniforms(
    gl: WebGL2RenderingContext,
    p: WebGLProgram
): Record<string, WebGLUniformLocation | null> {
    const out: Record<string, WebGLUniformLocation | null> = {}
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i)
        if (info) out[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, info.name)
    }
    return out
}

type Mesh = { pos: Float32Array; nor: Float32Array; idx: Uint16Array }

const FACES: [number[], number[], number[]][] = [
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
]

function roundedBox(r: number, segs: number): Mesh {
    const b = 0.5 - r
    const axis: number[] = []
    for (let k = 0; k <= segs; k++) axis.push(-b - r * Math.cos((k * Math.PI) / (2 * segs)))
    axis.push(b)
    for (let k = 1; k <= segs; k++) axis.push(b + r * Math.sin((k * Math.PI) / (2 * segs)))

    const m = axis.length
    const pos: number[] = []
    const nor: number[] = []
    const idx: number[] = []

    for (const [n, u, v] of FACES) {
        const base = pos.length / 3
        for (let i = 0; i < m; i++) {
            for (let j = 0; j < m; j++) {
                const su = axis[i]
                const sv = axis[j]
                const px = n[0] * 0.5 + u[0] * su + v[0] * sv
                const py = n[1] * 0.5 + u[1] * su + v[1] * sv
                const pz = n[2] * 0.5 + u[2] * su + v[2] * sv
                const cx = Math.max(-b, Math.min(b, px))
                const cy = Math.max(-b, Math.min(b, py))
                const cz = Math.max(-b, Math.min(b, pz))
                const dx = px - cx, dy = py - cy, dz = pz - cz
                const L = Math.hypot(dx, dy, dz) || 1
                nor.push(dx / L, dy / L, dz / L)
                pos.push(cx + (dx / L) * r, cy + (dy / L) * r, cz + (dz / L) * r)
            }
        }
        for (let i = 0; i < m - 1; i++) {
            for (let j = 0; j < m - 1; j++) {
                const a = base + i * m + j
                idx.push(a, a + m, a + m + 1, a, a + m + 1, a + 1)
            }
        }
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }
}

function cylinder(radius: number, height: number, segs: number): Mesh {
    const pos: number[] = []
    const nor: number[] = []
    const idx: number[] = []
    const h = height / 2

    for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2
        const sx = Math.sin(a), sz = Math.cos(a)
        pos.push(sx * radius, h, sz * radius)
        nor.push(sx, 0, sz)
        pos.push(sx * radius, -h, sz * radius)
        nor.push(sx, 0, sz)
    }
    for (let i = 0; i < segs; i++) {
        const a = i * 2
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2)
    }

    for (const sign of [1, -1]) {
        const base = pos.length / 3
        pos.push(0, sign * h, 0)
        nor.push(0, sign, 0)
        for (let i = 0; i <= segs; i++) {
            const a = (i / segs) * Math.PI * 2
            pos.push(Math.sin(a) * radius, sign * h, Math.cos(a) * radius)
            nor.push(0, sign, 0)
        }
        for (let i = 0; i < segs; i++) {
            if (sign > 0) idx.push(base, base + 1 + i, base + 2 + i)
            else idx.push(base, base + 2 + i, base + 1 + i)
        }
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }
}

function torus(ring: number, tube: number, tubular: number, radial: number): Mesh {
    const pos: number[] = []
    const nor: number[] = []
    const idx: number[] = []
    for (let j = 0; j <= radial; j++) {
        for (let i = 0; i <= tubular; i++) {
            const u = (i / tubular) * Math.PI * 2
            const v = (j / radial) * Math.PI * 2
            pos.push(
                (ring + tube * Math.cos(v)) * Math.cos(u),
                (ring + tube * Math.cos(v)) * Math.sin(u),
                tube * Math.sin(v)
            )
            nor.push(Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v))
        }
    }
    for (let j = 1; j <= radial; j++) {
        for (let i = 1; i <= tubular; i++) {
            const a = (tubular + 1) * j + i - 1
            const b = (tubular + 1) * (j - 1) + i - 1
            const c = (tubular + 1) * (j - 1) + i
            const d = (tubular + 1) * j + i
            idx.push(a, b, d, b, c, d)
        }
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }
}

function icosahedron(radius: number): Mesh {
    const t = (1 + Math.sqrt(5)) / 2
    const v = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map((p) => {
        const L = Math.hypot(p[0], p[1], p[2])
        return [(p[0] / L) * radius, (p[1] / L) * radius, (p[2] / L) * radius]
    })
    const f = [
        0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
        1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
        3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
        4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
    ]
    const pos: number[] = []
    const nor: number[] = []
    const idx: number[] = []
    for (let i = 0; i < f.length; i += 3) {
        const a = v[f[i]], b = v[f[i + 1]], c = v[f[i + 2]]
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        const nx = e1[1] * e2[2] - e1[2] * e2[1]
        const ny = e1[2] * e2[0] - e1[0] * e2[2]
        const nz = e1[0] * e2[1] - e1[1] * e2[0]
        const L = Math.hypot(nx, ny, nz) || 1

        const dot = nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2])
        const flip = dot < 0 ? -1 : 1
        const tri = flip > 0 ? [a, b, c] : [a, c, b]
        for (const p of tri) {
            pos.push(p[0], p[1], p[2])
            nor.push((nx / L) * flip, (ny / L) * flip, (nz / L) * flip)
        }
        idx.push(i, i + 1, i + 2)
    }
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }
}

type ShapeKind = "box" | "cylinder" | "torus" | "icosahedron"

function buildShape(kind: ShapeKind): Mesh {
    switch (kind) {
        case "cylinder": return cylinder(CYL_RADIUS, CYL_HEIGHT, CYL_SEGS)
        case "torus": return torus(TORUS_RING, TORUS_TUBE, TORUS_TUBULAR, TORUS_RADIAL)
        case "icosahedron": return icosahedron(ICO_RADIUS)
        default: return roundedBox(CORNER_R, CORNER_SEGS)
    }
}

interface FieldProps {
    falloff: number
    ripple: number
}
interface CursorProps {
    reach: number
    lift: number
    grow: number
}
interface RotationProps {
    amount: number
    twist: number
}
interface Props {
    background: string
    baseColor: string
    shape: ShapeKind
    density: number
    gap: number
    speed: number
    distance: number
    field: Partial<FieldProps>
    cursor: Partial<CursorProps>
    rotation: Partial<RotationProps>
    style?: React.CSSProperties
}

const FIELD_DEFAULTS: FieldProps = { falloff: 150, ripple: 100 }
const CURSOR_DEFAULTS: CursorProps = { reach: 50, lift: -200, grow: 0 }
const ROTATION_DEFAULTS: RotationProps = { amount: 0, twist: 100 }

export default function IsoCubeTrail(props: Partial<Props>) {
    const {
        background = "#000000",
        baseColor = "#00FFBF",
        shape = "box",
        density = 83,
        gap = 53,
        speed = 50,
        distance = 4,
        field,
        cursor,
        rotation,
        style,
    } = props

    const f: FieldProps = { ...FIELD_DEFAULTS, ...(field || {}) }
    const cu: CursorProps = { ...CURSOR_DEFAULTS, ...(cursor || {}) }
    const ro: RotationProps = { ...ROTATION_DEFAULTS, ...(rotation || {}) }

    const hostRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const live = useRef({
        base: [0, 0, 1] as number[],
        weights: [1, 1, 1] as number[],
        shape: shape as ShapeKind,
        density,
        gap,
        speed,
        distance,
        f,
        cu,
        ro,
    })

    {
        const lin = parseColor(baseColor).map(srgbToLinear)
        const total = lin[0] + lin[1] + lin[2]

        live.current.weights =
            total > 1e-6 ? lin.map((c) => 1 - 0.5 * (c / total)) : [1, 1, 1]
        live.current.base = lin
        live.current.shape = shape
        live.current.density = density
        live.current.gap = gap
        live.current.speed = speed
        live.current.distance = distance
        live.current.f = f
        live.current.cu = cu
        live.current.ro = ro
    }

    useEffect(() => {
        const canvas = canvasRef.current
        const host = hostRef.current
        if (!canvas || !host) return

        const gl = canvas.getContext("webgl2", {
            antialias: true,
            alpha: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: true,
        })
        if (!gl) {
            console.warn("IsoCubeTrail: WebGL2 unavailable")
            return
        }

        const progShadow = link(gl, SHADOW_VERT, SHADOW_FRAG)
        const progScene = link(gl, SCENE_VERT, SCENE_FRAG)
        if (!progShadow || !progScene) return
        const uShadowP = uniforms(gl, progShadow)
        const uSceneP = uniforms(gl, progScene)

        const posBuf = gl.createBuffer()!
        const norBuf = gl.createBuffer()!
        const idxBuf = gl.createBuffer()!
        const offBuf = gl.createBuffer()!

        const vao = gl.createVertexArray()!
        gl.bindVertexArray(vao)
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, norBuf)
        gl.enableVertexAttribArray(1)
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, offBuf)
        gl.enableVertexAttribArray(2)
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0)
        gl.vertexAttribDivisor(2, 1)
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
        gl.bindVertexArray(null)

        let shapeKind: ShapeKind | null = null
        let indexCount = 0

        function buildGeometry(kind: ShapeKind) {
            const mesh = buildShape(kind)
            gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuf)
            gl!.bufferData(gl!.ARRAY_BUFFER, mesh.pos, gl!.STATIC_DRAW)
            gl!.bindBuffer(gl!.ARRAY_BUFFER, norBuf)
            gl!.bufferData(gl!.ARRAY_BUFFER, mesh.nor, gl!.STATIC_DRAW)
            gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, idxBuf)
            gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, mesh.idx, gl!.STATIC_DRAW)
            indexCount = mesh.idx.length
            shapeKind = kind
        }

        let gridCols = -1
        let gridCell = -1
        let instances = 0

        function buildGrid(cols: number, cell: number) {
            const half = (cols * cell) / 2
            const off = new Float32Array(cols * cols * 2)
            for (let i = 0; i < cols; i++) {
                const x = i * cell - half + cell / 2
                for (let j = 0; j < cols; j++) {
                    const k = (i * cols + j) * 2
                    off[k] = x
                    off[k + 1] = j * cell - half + cell / 2
                }
            }
            gl!.bindBuffer(gl!.ARRAY_BUFFER, offBuf)
            gl!.bufferData(gl!.ARRAY_BUFFER, off, gl!.STATIC_DRAW)
            instances = cols * cols
            gridCols = cols
            gridCell = cell
        }

        const shadowTex = gl.createTexture()!
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, shadowTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0,
            gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)

        const shadowFbo = gl.createFramebuffer()!
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFbo)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0)

        gl.drawBuffers([gl.NONE])
        gl.readBuffer(gl.NONE)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)

        let mouseX = 0
        let mouseZ = 0
        let pos0X = 0, pos0Z = 0
        let pos1X = 0, pos1Z = 0
        let velX = 0, velZ = 0
        let hovering = false

        let presence = 0

        const axX = [1, 0, 0]
        const axY = [0, 1, 0]
        const axZ = [0, 0, 1]
        let halfW = 6
        let halfH = 4
        let hitHalf = HIT_HALF

        const onMove = (e: PointerEvent) => {
            hovering = true

            const r = host!.getBoundingClientRect()
            if (r.width <= 0 || r.height <= 0) return
            const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1
            const ndcY = -((e.clientY - r.top) / r.height) * 2 + 1

            const ox = EYE[0] + ndcX * halfW * axX[0] + ndcY * halfH * axY[0]
            const oy = EYE[1] + ndcX * halfW * axX[1] + ndcY * halfH * axY[1]
            const oz = EYE[2] + ndcX * halfW * axX[2] + ndcY * halfH * axY[2]
            const dy = -axZ[1]
            if (Math.abs(dy) < 1e-6) return
            const t = -oy / dy
            if (t <= 0) return
            const hx = ox + t * -axZ[0]
            const hz = oz + t * -axZ[2]

            if (Math.abs(hx) > hitHalf || Math.abs(hz) > hitHalf) return
            mouseX = hx
            mouseZ = hz
        }
        const onLeave = () => {
            hovering = false
        }
        host.addEventListener("pointermove", onMove)
        host.addEventListener("pointerleave", onLeave)

        const viewM = new Float32Array(16)
        const projM = new Float32Array(16)
        const vpM = new Float32Array(16)
        const lviewM = new Float32Array(16)
        const lprojM = new Float32Array(16)
        const lvpM = new Float32Array(16)

        const keyLen = Math.hypot(KEY_DIR[0], KEY_DIR[1], KEY_DIR[2])
        const keyN = KEY_DIR.map((v) => v / keyLen)
        const fillLen = Math.hypot(FILL_DIR[0], FILL_DIR[1], FILL_DIR[2])
        const fillN = FILL_DIR.map((v) => v / fillLen)

        let bobPhase = 0
        let rotPhase = 0
        let introT = 0

        let raf = 0
        let prev = performance.now()

        const frame = (now: number) => {
            raf = requestAnimationFrame(frame)
            const dt = Math.min(0.05, Math.max(0, (now - prev) / 1000))
            prev = now

            const L = live.current
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
            const cw = Math.max(1, Math.round(host!.clientWidth * dpr))
            const ch = Math.max(1, Math.round(host!.clientHeight * dpr))
            if (canvas!.width !== cw || canvas!.height !== ch) {
                canvas!.width = cw
                canvas!.height = ch
            }

            if (L.shape !== shapeKind) buildGeometry(L.shape)

            const aspect = cw / ch
            let rw = aspect
            let rh = 1 / aspect
            if (rw > rh) rh = 1
            else rw = 1
            halfW = L.distance * rw
            halfH = L.distance * rh

            lookAtOrigin(EYE[0], EYE[1], EYE[2], 0, 1, 0, viewM)
            axX[0] = viewM[0]; axX[1] = viewM[4]; axX[2] = viewM[8]
            axY[0] = viewM[1]; axY[1] = viewM[5]; axY[2] = viewM[9]
            axZ[0] = viewM[2]; axZ[1] = viewM[6]; axZ[2] = viewM[10]
            orthoBox(halfW, halfH, NEAR, FAR, projM)
            mul(projM, viewM, vpM)

            const n = Math.max(8, Math.min(140, Math.round(L.density)))
            const needBase = FIT_U * halfW + FIT_V * halfH
            const cellMin = (2 * needBase) / (COLS_MAX - 2 * MARGIN_CELLS)
            const cell = Math.max(FIELD / n, cellMin)
            const extent = Math.max(FIELD / 2, needBase + MARGIN_CELLS * cell)
            const cols = Math.min(COLS_MAX, Math.max(8, Math.ceil((2 * extent) / cell)))
            if (cols !== gridCols || cell !== gridCell) buildGrid(cols, cell)

            const side = cell * Math.max(0.05, 1 - L.gap / 100)
            const rate = L.speed / 50

            const fit = Math.max(1, needBase / FIT_REF)
            const lightHalf = SHADOW_HALF * fit
            hitHalf = HIT_HALF * fit
            const ld = keyLen * fit
            lookAtOrigin(keyN[0] * ld, keyN[1] * ld, keyN[2] * ld, 0, 1, 0, lviewM)
            orthoBox(lightHalf, lightHalf, SHADOW_NEAR * fit, SHADOW_FAR * fit, lprojM)
            mul(lprojM, lviewM, lvpM)

            bobPhase = (bobPhase + 2 * rate * dt) % (Math.PI * 2)
            rotPhase = (rotPhase + rate * dt) % (Math.PI * 2)

            const rMax = Math.SQRT2 * ((cols * cell) / 2 - cell / 2)
            const animMax = 0.08 * rMax + 0.09
            introT = Math.min(INTRO_SECONDS * animMax, introT + dt)
            const animate = introT / INTRO_SECONDS

            const kPos = 1 - Math.exp(-POS_K * dt)
            pos0X += (mouseX - pos0X) * kPos
            pos0Z += (mouseZ - pos0Z) * kPos
            const kVel = 1 - Math.exp(-VEL_K * dt)
            velX += ((pos0X - pos1X) * VEL_GAIN - velX) * kVel
            velZ += ((pos0Z - pos1Z) * VEL_GAIN - velZ) * kVel
            pos1X += velX * dt
            pos1Z += velZ * dt

            const kPresence = 1 - Math.exp(-PRESENCE_K * dt)
            presence += ((hovering ? 1 : 0) - presence) * kPresence

            const outer = Math.max(0.05, (REACH_REF * L.cu.reach) / 50)
            const inner = outer * REACH_INNER_RATIO

            const setSolve = (u: Record<string, WebGLUniformLocation | null>) => {
                gl!.uniform1f(u.uSide!, side)
                gl!.uniform2f(u.uPos0!, pos0X, pos0Z)
                gl!.uniform2f(u.uPos1!, pos1X, pos1Z)
                gl!.uniform1f(u.uInner!, inner)
                gl!.uniform1f(u.uOuter!, outer)
                gl!.uniform1f(u.uGrow!, (L.cu.grow / 100) * presence)
                gl!.uniform1f(u.uLift!, (L.cu.lift / 100) * cell * presence)
                gl!.uniform1f(u.uBob!, BOB_CELLS * cell)
                gl!.uniform1f(u.uIntroLift!, INTRO_LIFT_CELLS * cell)
                gl!.uniform1f(u.uRotAmount!, L.ro.amount / 100)
                gl!.uniform1f(u.uRotPhase!, rotPhase)
                gl!.uniform1f(u.uTwist!, L.ro.twist / 100)
                gl!.uniform1f(u.uBobPhase!, bobPhase)
                gl!.uniform1f(u.uFreq!, L.f.ripple / 100)
                gl!.uniform1f(u.uAnimate!, animate)
            }

            gl!.activeTexture(gl!.TEXTURE0)
            gl!.bindTexture(gl!.TEXTURE_2D, null)
            gl!.enable(gl!.DEPTH_TEST)
            gl!.enable(gl!.CULL_FACE)
            gl!.cullFace(gl!.BACK)
            gl!.bindFramebuffer(gl!.FRAMEBUFFER, shadowFbo)
            gl!.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE)
            gl!.clear(gl!.DEPTH_BUFFER_BIT)
            gl!.useProgram(progShadow)
            gl!.bindVertexArray(vao)
            setSolve(uShadowP)
            gl!.uniformMatrix4fv(uShadowP.uLightViewProj!, false, lvpM)
            gl!.drawElementsInstanced(gl!.TRIANGLES, indexCount, gl!.UNSIGNED_SHORT, 0, instances)

            gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
            gl!.viewport(0, 0, cw, ch)
            gl!.clearColor(0, 0, 0, 0)
            gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT)
            gl!.useProgram(progScene)
            setSolve(uSceneP)
            gl!.activeTexture(gl!.TEXTURE0)
            gl!.bindTexture(gl!.TEXTURE_2D, shadowTex)
            gl!.uniform1i(uSceneP.uShadowMap!, 0)
            gl!.uniform1f(uSceneP.uShadowTexel!, 1 / SHADOW_SIZE)
            gl!.uniform1f(uSceneP.uNormalOffset!,
                (SHADOW_NORMAL_OFFSET * 2 * lightHalf) / SHADOW_SIZE)
            gl!.uniform3f(uSceneP.uEye!, EYE[0], EYE[1], EYE[2])
            gl!.uniform3f(uSceneP.uKeyDir!, keyN[0], keyN[1], keyN[2])
            gl!.uniform3f(uSceneP.uFillDir!, fillN[0], fillN[1], fillN[2])
            gl!.uniform3f(uSceneP.uBase!, L.base[0], L.base[1], L.base[2])
            gl!.uniform3f(uSceneP.uWeights!, L.weights[0], L.weights[1], L.weights[2])
            gl!.uniform1f(uSceneP.uDegrade!, L.f.falloff / 100)
            gl!.uniformMatrix4fv(uSceneP.uViewProj!, false, vpM)
            gl!.uniformMatrix4fv(uSceneP.uLightViewProj!, false, lvpM)
            gl!.drawElementsInstanced(gl!.TRIANGLES, indexCount, gl!.UNSIGNED_SHORT, 0, instances)
        }

        raf = requestAnimationFrame(frame)

        return () => {
            cancelAnimationFrame(raf)
            host.removeEventListener("pointermove", onMove)
            host.removeEventListener("pointerleave", onLeave)

        }
    }, [])

    return (
        <div
            ref={hostRef}
            style={{
                position: "relative",
                overflow: "hidden",
                minWidth: 1200,
                minHeight: 800,
                background,
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "block",
                }}
            />
        </div>
    )
}