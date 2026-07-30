import * as THREE from 'three';
import { fxAtlas, ATLAS_COLS, ATLAS_ROWS } from './fxtextures.js';

// ─────────────────────────────────────────────────────────────────────────────
// GPU-integrated particle system.
//
// One InstancedBufferGeometry, one draw call, one material per blend mode. A
// particle is written **once** at spawn and never touched again: the vertex
// shader integrates its whole trajectory analytically from (p0, v0, drag,
// gravity), so a frame with 6000 live particles costs zero JavaScript and zero
// bus traffic. Only newly spawned slots are uploaded, as a single dirty range.
//
//   dv/dt = -k·v + g          →    v(t) = v₀·e^(−kt) + g·F(t)
//                                  p(t) = p₀ + v₀·F(t) + g·H(t)
//   F(t) = (1 − e^(−kt)) / k        H(t) = (t − F(t)) / k
//
// Both F and H cancel catastrophically as k→0 in float precision, so the shader
// switches to their series expansions below kt = 1e-3. (Skipping that is how you
// get particles that teleport to the origin when drag is zero.)
//
// Allocation is a ring — the oldest slot is recycled. No free list to walk, no
// GC, no per-particle Object3D, ever.
// ─────────────────────────────────────────────────────────────────────────────

const STRIDE = {
  p0: 3, vel: 3, t: 4, s: 4, d: 4, m: 4, ca: 4, cb: 3,
};

const VERT = /* glsl */`
precision highp float;

attribute vec3 iP0;
attribute vec3 iVel;
attribute vec4 iT;    // t0, life, fadeIn, fadePow
attribute vec4 iS;    // size0, size1, rot0, rotVel
attribute vec4 iD;    // drag, gravity, turbulence, stretch
attribute vec4 iM;    // seed, cell, mode, alphaPeak
attribute vec4 iCA;   // colourA.rgb, colour bias
attribute vec3 iCB;   // colourB.rgb

uniform float uTime;
uniform vec2  uCellScale;   // 1/cols, 1/rows
uniform vec2  uCells;       // cols, rows
uniform float uNearFade;    // metres
uniform float uSizeScale;

varying vec2  vUv;
varying vec4  vCol;
varying float vDepth;

void main() {
  float age  = uTime - iT.x;
  float life = max(iT.y, 1e-4);
  float u    = age / life;

  if (age < 0.0 || u >= 1.0 || iM.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);   // outside the clip volume
    vUv = vec2(0.0); vCol = vec4(0.0); vDepth = 0.0;
    return;
  }

  float k  = max(iD.x, 0.0);
  float kt = k * age;
  float F, H;
  if (kt < 1e-3) {
    F = age * (1.0 - 0.5 * kt);
    H = age * age * 0.5 * (1.0 - kt / 3.0);
  } else {
    F = (1.0 - exp(-kt)) / k;
    H = (age - F) / k;
  }
  vec3 g = vec3(0.0, -iD.y, 0.0);

  float mode = iM.z;
  vec3 p, vNow;
  if (mode > 1.5) {
    p = iP0;
    vNow = iVel;
  } else {
    p = iP0 + iVel * F + g * H;
    vNow = iVel * exp(-kt) + g * F;
    if (iD.z > 0.0) {
      float sd = iM.x * 64.0;
      p += iD.z * u * vec3(
        sin(sd * 1.31 + age * 2.7),
        sin(sd * 2.13 + age * 2.1 + 1.7),
        sin(sd * 0.77 + age * 3.3 + 3.1));
    }
  }

  float ease = u * u * (3.0 - 2.0 * u);
  float sz = mix(iS.x, iS.y, ease) * uSizeScale;
  float rot = iS.z + iS.w * age;

  vec3 off;
  if (mode < 0.5) {
    // camera-facing billboard
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float c = cos(rot), s = sin(rot);
    vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * sz;
    off = camRight * q.x + camUp * q.y;
  } else if (mode < 1.5) {
    // velocity-aligned stretched billboard
    float spd = length(vNow);
    vec3 dir = spd > 1e-4 ? vNow / spd : vec3(0.0, 1.0, 0.0);
    vec3 toEye = normalize(cameraPosition - p);
    vec3 side = cross(dir, toEye);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
    float len = sz + iD.w * spd;
    off = dir * (position.x * len) + side * (position.y * sz);
  } else {
    // plane-aligned card; iVel is the plane normal
    vec3 n = normalize(iVel);
    vec3 up = abs(n.y) > 0.985 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 t = normalize(cross(up, n));
    vec3 b = cross(n, t);
    float c = cos(rot), s = sin(rot);
    vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * sz;
    off = t * q.x + b * q.y;
  }

  vec4 mv = viewMatrix * vec4(p + off, 1.0);
  gl_Position = projectionMatrix * mv;
  vDepth = -mv.z;

  float cell = iM.y;
  float cx = mod(cell, uCells.x);
  float cy = floor(cell / uCells.x);
  vUv = (uv + vec2(cx, cy)) * uCellScale;

  float a = iM.w
          * smoothstep(0.0, max(iT.z, 1e-4), u)
          * pow(max(0.0, 1.0 - u), max(iT.w, 0.0));
  // never let a particle swallow the near plane
  a *= smoothstep(0.0, uNearFade, vDepth);

  vec3 col = mix(iCA.rgb, iCB.rgb, pow(u, max(iCA.w, 1e-3)));
  vCol = vec4(col, a);
}
`;

const FRAG_ADD = /* glsl */`
precision highp float;
uniform sampler2D uMap;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec2 vUv;
varying vec4 vCol;
varying float vDepth;
void main() {
  float a = texture2D(uMap, vUv).a * vCol.a;
  if (a < 0.002) discard;
  // additive light scatters out of the beam with distance: attenuate, never tint
  float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  gl_FragColor = vec4(vCol.rgb * a * fog, a);
}
`;

const FRAG_ALPHA = /* glsl */`
precision highp float;
uniform sampler2D uMap;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec2 vUv;
varying vec4 vCol;
varying float vDepth;
void main() {
  float a = texture2D(uMap, vUv).a * vCol.a;
  if (a < 0.004) discard;
  float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  vec3 c = mix(uFogColor, vCol.rgb, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(c, a);
}
`;

/** Spawn-parameter scratch object — reused so `emit()` never allocates. */
export const P = {
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  life: 1, fadeIn: 0.1, fadePow: 1.5,
  size0: 1, size1: 1, rot: 0, rotVel: 0,
  drag: 0, gravity: 0, turb: 0, stretch: 0,
  seed: 0, cell: 0, mode: 0, alpha: 1,
  r0: 1, g0: 1, b0: 1, bias: 1,
  r1: 1, g1: 1, b1: 1,
};

export function resetP() {
  P.x = P.y = P.z = 0;
  P.vx = P.vy = P.vz = 0;
  P.life = 1; P.fadeIn = 0.1; P.fadePow = 1.5;
  P.size0 = 1; P.size1 = 1; P.rot = 0; P.rotVel = 0;
  P.drag = 0; P.gravity = 0; P.turb = 0; P.stretch = 0;
  P.seed = 0; P.cell = 0; P.mode = 0; P.alpha = 1;
  P.r0 = P.g0 = P.b0 = 1; P.bias = 1;
  P.r1 = P.g1 = P.b1 = 1;
  return P;
}

export class ParticleSystem {
  /**
   * @param {number} capacity max live particles
   * @param {'add'|'alpha'} blend
   */
  constructor(capacity, blend = 'add', { renderOrder = 10, nearFade = 1.8 } = {}) {
    this.capacity = capacity;
    this.blend = blend;
    this._next = 0;
    this._hi = 0;
    this._dirtyLo = Infinity;
    this._dirtyHi = -1;
    this.time = 0;
    this.spawned = 0;

    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    quad.setIndex([0, 1, 2, 0, 2, 3]);

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));

    this.arrays = {};
    this.attrs = {};
    for (const [name, size] of Object.entries(STRIDE)) {
      const arr = new Float32Array(capacity * size);
      const attr = new THREE.InstancedBufferAttribute(arr, size);
      attr.setUsage(THREE.DynamicDrawUsage);
      this.arrays[name] = arr;
      this.attrs[name] = attr;
      geo.setAttribute('i' + name[0].toUpperCase() + name.slice(1), attr);
    }
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const uniforms = {
      uMap: { value: fxAtlas() },
      uTime: { value: 0 },
      uCellScale: { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) },
      uCells: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
      uNearFade: { value: nearFade },
      uSizeScale: { value: 1 },
      uFogColor: { value: new THREE.Color(0x93b7dc) },
      uFogDensity: { value: 0.00042 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: blend === 'add' ? FRAG_ADD : FRAG_ALPHA,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });

    this.uniforms = uniforms;
    this.material = mat;
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fx.particles.' + blend;
  }

  /** Write the scratch `P` into a slot. @returns the slot index (a handle). */
  emit() {
    const i = this._next;
    this._next = (this._next + 1) % this.capacity;
    if (i + 1 > this._hi) this._hi = i + 1;
    this.spawned++;

    const a = this.arrays;
    let o = i * 3;
    a.p0[o] = P.x; a.p0[o + 1] = P.y; a.p0[o + 2] = P.z;
    a.vel[o] = P.vx; a.vel[o + 1] = P.vy; a.vel[o + 2] = P.vz;
    a.cb[o] = P.r1; a.cb[o + 1] = P.g1; a.cb[o + 2] = P.b1;

    o = i * 4;
    a.t[o] = this.time; a.t[o + 1] = P.life; a.t[o + 2] = P.fadeIn; a.t[o + 3] = P.fadePow;
    a.s[o] = P.size0; a.s[o + 1] = P.size1; a.s[o + 2] = P.rot; a.s[o + 3] = P.rotVel;
    a.d[o] = P.drag; a.d[o + 1] = P.gravity; a.d[o + 2] = P.turb; a.d[o + 3] = P.stretch;
    a.m[o] = P.seed; a.m[o + 1] = P.cell; a.m[o + 2] = P.mode; a.m[o + 3] = P.alpha;
    a.ca[o] = P.r0; a.ca[o + 1] = P.g0; a.ca[o + 2] = P.b0; a.ca[o + 3] = P.bias;

    if (i < this._dirtyLo) this._dirtyLo = i;
    if (i > this._dirtyHi) this._dirtyHi = i;
    return i;
  }

  /** Kill a live particle (a laser bolt that hit something before its range). */
  retire(i) {
    if (i == null || i < 0 || i >= this.capacity) return;
    this.arrays.m[i * 4 + 3] = 0;
    if (i < this._dirtyLo) this._dirtyLo = i;
    if (i > this._dirtyHi) this._dirtyHi = i;
  }

  clear() {
    this.arrays.m.fill(0);
    this._dirtyLo = 0; this._dirtyHi = this.capacity - 1;
    this._next = 0;
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.geometry.instanceCount = this._hi;
    if (this._dirtyHi < 0) return;
    const lo = this._dirtyLo, hi = this._dirtyHi;
    const n = hi - lo + 1;
    for (const [name, size] of Object.entries(STRIDE)) {
      const attr = this.attrs[name];
      attr.clearUpdateRanges();
      attr.addUpdateRange(lo * size, n * size);
      attr.needsUpdate = true;
    }
    this._dirtyLo = Infinity;
    this._dirtyHi = -1;
  }

  setFog(color, density) {
    this.uniforms.uFogColor.value.copy(color);
    this.uniforms.uFogDensity.value = density;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
