import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Volumetric FX banks — the things a billboard cannot fake.
//
// A shockwave drawn as a sprite is a circle painted on the camera. A shockwave
// drawn as an *expanding shell* has a silhouette that grows past the debris,
// clips into terrain, and lights up at grazing angles — it reads as a pressure
// front travelling through the world. Same for the ring, and same for a shield
// hit, which has to wrap the target's surface rather than sit in front of it.
//
// All three are one InstancedBufferGeometry + one draw call each. Instances are
// alive purely by virtue of their (t0, life) window; the vertex shader collapses
// dead ones outside the clip volume, so there is no per-frame CPU work at all
// beyond a small dirty-range upload at spawn.
// ─────────────────────────────────────────────────────────────────────────────

/** Copy a base geometry into an instanced one and allocate per-instance attrs. */
function instance(base, capacity, defs) {
  const geo = new THREE.InstancedBufferGeometry();
  if (base.index) geo.setIndex(base.index);
  for (const name of ['position', 'normal', 'uv', 'aProf']) {
    if (base.attributes[name]) geo.setAttribute(name, base.attributes[name]);
  }
  const arrays = {};
  const attrs = {};
  for (const [name, size] of Object.entries(defs)) {
    const arr = new Float32Array(capacity * size);
    const attr = new THREE.InstancedBufferAttribute(arr, size);
    attr.setUsage(THREE.DynamicDrawUsage);
    arrays[name] = arr; attrs[name] = attr;
    geo.setAttribute(name, attr);
  }
  geo.instanceCount = capacity;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return { geo, arrays, attrs };
}

/** Shared ring-buffer allocation + dirty tracking for the banks below. */
class Bank {
  constructor(capacity) {
    this.capacity = capacity;
    this._next = 0;
    this.time = 0;
  }
  slot() {
    const i = this._next;
    this._next = (this._next + 1) % this.capacity;
    return i;
  }
  flush() {
    for (const k of Object.keys(this.attrs)) this.attrs[k].needsUpdate = true;
  }
  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    if (this._dirty) { this.flush(); this._dirty = false; }
  }
  clear() {
    for (const k of Object.keys(this.arrays)) this.arrays[k].fill(0);
    this._next = 0; this._dirty = true;
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* ── shockwave shell ──────────────────────────────────────────────────────── */

const SHELL_VERT = /* glsl */`
precision highp float;
attribute vec3 iOrigin;
attribute vec4 iT;     // t0, life, r0, r1
attribute vec4 iC;     // rgb, alpha
attribute vec2 iA;     // seed, wobble
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vU;
varying vec4 vC;
varying float vDepth;
void main() {
  float age = uTime - iT.x;
  float u = age / max(iT.y, 1e-3);
  if (age < 0.0 || u >= 1.0 || iC.a <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vN = vec3(0.0); vV = vec3(0.0); vU = 0.0; vC = vec4(0.0); vDepth = 0.0;
    return;
  }
  vec3 n = normalize(position);
  // radius: violent at the front, asymptotic after — a blast decelerates hard
  float e = 1.0 - pow(1.0 - u, 3.0);
  float r = mix(iT.z, iT.w, e);
  // a real front is not a sphere: lumpy early, smoothing as it expands
  float s = iA.x * 31.7;
  float w = (sin(n.x * 5.3 + s) + sin(n.y * 4.1 + s * 1.7) + sin(n.z * 6.7 + s * 2.3)
           + sin((n.x + n.z) * 9.1 + s * 3.1) * 0.5) * 0.25;
  r *= 1.0 + iA.y * w * (1.0 - u * 0.75);
  vec3 wp = iOrigin + n * r;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
  vN = n; vV = normalize(cameraPosition - wp); vU = u; vC = iC;
}
`;

const SHELL_FRAG = /* glsl */`
precision highp float;
uniform float uPower;
uniform float uFogDensity;
varying vec3 vN;
varying vec3 vV;
varying float vU;
varying vec4 vC;
varying float vDepth;
void main() {
  // grazing-angle emission — the shell is only visible where it is edge-on,
  // which is exactly what makes it read as a thin surface and not a ball
  float fres = pow(1.0 - abs(dot(vN, vV)), uPower);
  float a = fres * vC.a * pow(max(0.0, 1.0 - vU), 1.5) * smoothstep(0.0, 0.05, vU);
  if (a < 0.003) discard;
  float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  gl_FragColor = vec4(vC.rgb * a * fog, a);
}
`;

export class ShellBank extends Bank {
  constructor(capacity = 20, { detail = 3, renderOrder = 11 } = {}) {
    super(capacity);
    const base = new THREE.IcosahedronGeometry(1, detail);
    const { geo, arrays, attrs } = instance(base, capacity, {
      iOrigin: 3, iT: 4, iC: 4, iA: 2,
    });
    base.dispose();
    this.arrays = arrays; this.attrs = attrs; this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 3.4 }, uFogDensity: { value: 0.00042 } },
      vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, side: THREE.DoubleSide,
      toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fx.shells';
  }

  spawn(p, { r0 = 1, r1 = 40, life = 0.6, color = null, alpha = 1, seed = 0, wobble = 0.12 } = {}) {
    const i = this.slot();
    const a = this.arrays;
    a.iOrigin[i * 3] = p.x; a.iOrigin[i * 3 + 1] = p.y; a.iOrigin[i * 3 + 2] = p.z;
    a.iT[i * 4] = this.time; a.iT[i * 4 + 1] = life; a.iT[i * 4 + 2] = r0; a.iT[i * 4 + 3] = r1;
    const c = color || { r: 1, g: 0.86, b: 0.66 };
    a.iC[i * 4] = c.r; a.iC[i * 4 + 1] = c.g; a.iC[i * 4 + 2] = c.b; a.iC[i * 4 + 3] = alpha;
    a.iA[i * 2] = seed; a.iA[i * 2 + 1] = wobble;
    this._dirty = true;
    return i;
  }
}

/* ── expanding ring ───────────────────────────────────────────────────────── */

function annulusGeometry(segments = 128, rings = 6) {
  const n = (segments + 1) * rings;
  const pos = new Float32Array(n * 3);
  const prof = new Float32Array(n);
  let o = 0;
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    for (let s = 0; s <= segments; s++) {
      const ang = (s / segments) * Math.PI * 2;
      pos[o * 3] = Math.cos(ang); pos[o * 3 + 1] = Math.sin(ang); pos[o * 3 + 2] = 0;
      prof[o] = t;
      o++;
    }
  }
  const row = segments + 1;
  const idx = new Uint32Array((rings - 1) * segments * 6);
  let k = 0;
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * row + s, b = a + 1, c = a + row, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aProf', new THREE.BufferAttribute(prof, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const RING_VERT = /* glsl */`
precision highp float;
attribute float aProf;
attribute vec3 iOrigin;
attribute vec3 iNrm;
attribute vec4 iT;    // t0, life, r0, r1
attribute vec4 iC;    // rgb, alpha
attribute vec3 iA;    // seed, band, tilt-spin
uniform float uTime;
varying float vProf;
varying float vU;
varying float vAng;
varying vec4 vC;
varying float vSeed;
varying float vDepth;
void main() {
  float age = uTime - iT.x;
  float u = age / max(iT.y, 1e-3);
  if (age < 0.0 || u >= 1.0 || iC.a <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vProf = 0.0; vU = 0.0; vAng = 0.0; vC = vec4(0.0); vSeed = 0.0; vDepth = 0.0;
    return;
  }
  float e = 1.0 - pow(1.0 - u, 3.2);
  float r = mix(iT.z, iT.w, e);
  // the band thins as the front outruns its own thickness
  float rf = 1.0 - (1.0 - aProf) * iA.y * mix(1.0, 0.42, u);

  vec3 n = normalize(iNrm);
  vec3 up = abs(n.y) > 0.985 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 t = normalize(cross(up, n));
  vec3 b = cross(n, t);
  float sp = iA.z * u;
  float cs = cos(sp), sn = sin(sp);
  vec2 q = vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs);
  vec3 wp = iOrigin + (t * q.x + b * q.y) * (r * rf);

  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
  vProf = aProf; vU = u; vAng = atan(position.y, position.x); vC = iC; vSeed = iA.x;
}
`;

const RING_FRAG = /* glsl */`
precision highp float;
uniform float uFogDensity;
varying float vProf;
varying float vU;
varying float vAng;
varying vec4 vC;
varying float vSeed;
varying float vDepth;
void main() {
  // hot leading edge with a soft wash trailing inward
  float edge = pow(vProf, 4.5);
  float wash = pow(max(0.0, 1.0 - vProf), 1.4) * 0.14;
  // azimuthal break-up so it never reads as a perfect CAD hoop
  float s = vSeed * 17.0;
  float az = 0.72 + 0.28 * (sin(vAng * 5.0 + s) * sin(vAng * 11.0 - s * 1.7) * 0.5 + 0.5);
  float a = (edge + wash) * az * vC.a * pow(max(0.0, 1.0 - vU), 1.7) * smoothstep(0.0, 0.04, vU);
  if (a < 0.003) discard;
  float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  gl_FragColor = vec4(vC.rgb * a * fog, a);
}
`;

const _rn = new THREE.Vector3();

export class RingBank extends Bank {
  constructor(capacity = 28, { renderOrder = 11 } = {}) {
    super(capacity);
    const base = annulusGeometry(128, 6);
    const { geo, arrays, attrs } = instance(base, capacity, {
      iOrigin: 3, iNrm: 3, iT: 4, iC: 4, iA: 3,
    });
    base.dispose();
    this.arrays = arrays; this.attrs = attrs; this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFogDensity: { value: 0.00042 } },
      vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, side: THREE.DoubleSide,
      toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fx.rings';
  }

  spawn(p, normal, { r0 = 0.5, r1 = 30, life = 0.55, color = null, alpha = 1, seed = 0, band = 0.45, spin = 0 } = {}) {
    const i = this.slot();
    const a = this.arrays;
    a.iOrigin[i * 3] = p.x; a.iOrigin[i * 3 + 1] = p.y; a.iOrigin[i * 3 + 2] = p.z;
    _rn.copy(normal);
    if (_rn.lengthSq() < 1e-8) _rn.set(0, 1, 0);
    _rn.normalize();
    a.iNrm[i * 3] = _rn.x; a.iNrm[i * 3 + 1] = _rn.y; a.iNrm[i * 3 + 2] = _rn.z;
    a.iT[i * 4] = this.time; a.iT[i * 4 + 1] = life; a.iT[i * 4 + 2] = r0; a.iT[i * 4 + 3] = r1;
    const c = color || { r: 1, g: 0.88, b: 0.7 };
    a.iC[i * 4] = c.r; a.iC[i * 4 + 1] = c.g; a.iC[i * 4 + 2] = c.b; a.iC[i * 4 + 3] = alpha;
    a.iA[i * 3] = seed; a.iA[i * 3 + 1] = band; a.iA[i * 3 + 2] = spin;
    this._dirty = true;
    return i;
  }
}

/* ── hex shield impact ────────────────────────────────────────────────────── */

const SHIELD_VERT = /* glsl */`
precision highp float;
attribute vec3 iOrigin;
attribute vec4 iHit;    // hit direction (unit), radius
attribute vec4 iT;      // t0, life, seed, alpha
attribute vec3 iC;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vU;
varying vec3 vC;
varying vec4 vHit;
varying float vSeed;
varying float vAlpha;
varying float vDepth;
void main() {
  float age = uTime - iT.x;
  float u = age / max(iT.y, 1e-3);
  if (age < 0.0 || u >= 1.0 || iT.w <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    vN = vec3(0.0); vV = vec3(0.0); vU = 0.0; vC = vec3(0.0);
    vHit = vec4(0.0); vSeed = 0.0; vAlpha = 0.0; vDepth = 0.0;
    return;
  }
  vec3 n = normalize(position);
  // the shell flexes inward where it was struck, then rebounds
  float ang = acos(clamp(dot(n, iHit.xyz), -1.0, 1.0));
  float dent = exp(-ang * ang * 5.0) * sin(min(u, 0.5) * 12.566) * 0.055 * (1.0 - u);
  vec3 wp = iOrigin + n * iHit.w * (1.0 + u * 0.035 - dent);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
  vN = n; vV = normalize(cameraPosition - wp); vU = u; vC = iC;
  vHit = iHit; vSeed = iT.z; vAlpha = iT.w;
}
`;

const SHIELD_FRAG = /* glsl */`
precision highp float;
uniform float uHexScale;
uniform float uFogDensity;
varying vec3 vN;
varying vec3 vV;
varying float vU;
varying vec3 vC;
varying vec4 vHit;
varying float vSeed;
varying float vAlpha;
varying float vDepth;

// hex lattice: returns xy = offset from cell centre, zw = cell id
vec4 hexInfo(vec2 p) {
  vec2 s = vec2(1.0, 1.7320508);
  vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hC.xy) : vec4(h.zw, hC.zw + 0.5);
}
float hexDist(vec2 h) {
  vec2 a = abs(h);
  return max(dot(a, vec2(0.5, 0.8660254)), a.x);
}
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

void main() {
  // project the lattice along the impact axis, so the cells are undistorted
  // exactly where the ripple is brightest
  vec3 hn = normalize(vHit.xyz);
  vec3 up = abs(hn.y) > 0.985 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 tx = normalize(cross(up, hn));
  vec3 ty = cross(hn, tx);
  vec2 uv = vec2(dot(vN, tx), dot(vN, ty)) * uHexScale;

  vec4 hx = hexInfo(uv);
  float hd = hexDist(hx.xy);
  float edge = smoothstep(0.50, 0.42, hd);           // 1 inside the cell
  float rim = smoothstep(0.36, 0.50, hd) * edge;     // thin border band

  // angular distance from the strike, and the cell's own centre angle so cells
  // pop as discrete units instead of a smooth gradient sliding over them
  float ang = acos(clamp(dot(vN, hn), -1.0, 1.0));
  vec3 cellDir = normalize(hn + tx * (hx.z * 1.0 / uHexScale) + ty * (hx.w * 1.7320508 / uHexScale));
  float cellAng = acos(clamp(dot(cellDir, hn), -1.0, 1.0));

  float front = vU * 2.6;
  float wave = exp(-pow((cellAng - front) / 0.30, 2.0));
  float wave2 = exp(-pow((cellAng - front * 0.55) / 0.42, 2.0)) * 0.35;
  float flicker = 0.72 + 0.28 * hash21(hx.zw + floor(vU * 9.0));

  float local = exp(-ang * ang * 9.0);              // the strike itself
  float body = (wave + wave2) * flicker;

  float fres = pow(1.0 - abs(dot(vN, vV)), 2.6);
  float a = (rim * (0.55 + body * 2.6) + edge * body * 0.55 + local * 1.4 + fres * 0.35 * (0.25 + body))
          * vAlpha * pow(max(0.0, 1.0 - vU), 1.5);
  if (a < 0.004) discard;
  vec3 col = mix(vC, vec3(1.0), min(1.0, (body * 0.6 + local) * 0.8));
  float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  gl_FragColor = vec4(col * a * fog, a);
}
`;

const _hd = new THREE.Vector3();

export class ShieldBank extends Bank {
  constructor(capacity = 8, { renderOrder = 12 } = {}) {
    super(capacity);
    const base = new THREE.SphereGeometry(1, 40, 24);
    const { geo, arrays, attrs } = instance(base, capacity, {
      iOrigin: 3, iHit: 4, iT: 4, iC: 3,
    });
    base.dispose();
    this.arrays = arrays; this.attrs = attrs; this.geometry = geo;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHexScale: { value: 7.5 }, uFogDensity: { value: 0.00042 } },
      vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, side: THREE.DoubleSide,
      toneMapped: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = 'fx.shields';
  }

  spawn(center, hitDir, { radius = 3, life = 0.75, color = null, alpha = 1, seed = 0 } = {}) {
    const i = this.slot();
    const a = this.arrays;
    a.iOrigin[i * 3] = center.x; a.iOrigin[i * 3 + 1] = center.y; a.iOrigin[i * 3 + 2] = center.z;
    _hd.copy(hitDir);
    if (_hd.lengthSq() < 1e-8) _hd.set(0, 0, 1);
    _hd.normalize();
    a.iHit[i * 4] = _hd.x; a.iHit[i * 4 + 1] = _hd.y; a.iHit[i * 4 + 2] = _hd.z; a.iHit[i * 4 + 3] = radius;
    a.iT[i * 4] = this.time; a.iT[i * 4 + 1] = life; a.iT[i * 4 + 2] = seed; a.iT[i * 4 + 3] = alpha;
    const c = color || { r: 0.42, g: 0.78, b: 1.0 };
    a.iC[i * 3] = c.r; a.iC[i * 3 + 1] = c.g; a.iC[i * 3 + 2] = c.b;
    this._dirty = true;
    return i;
  }
}
