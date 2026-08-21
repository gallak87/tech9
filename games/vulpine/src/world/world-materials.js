import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { fbm2D, ridged2D, worley2D, cached } from '../render/textures.js';
import {
  WORLD, DNA, centrelineX, terrainHeight, profileAt, heightAtU,
  centrelineUniforms, MAXW, MAXB,
} from './profile.js';
import { DEFAULTS } from './dna.js';

// ─────────────────────────────────────────────────────────────────────────────
// Materials owned by the world. Nothing here touches render/materials.js — the
// render lane owns that file — but everything is built on the same procedural
// texture kit so the level responds to light like the rest of the game.
//
// The four that matter:
//   terrainMaterial()  triplanar wall, structure chosen by DNA.surfaceKind
//   waterMaterial()    Gerstner surface that knows where the shore is
//   iceMaterial()      the same plane frozen: cracks, no swell, no shoaling
//   rockPropMaterial() free-standing bodies — Sector Omega's belt
//   concreteMaterial() / steelMaterial() / cityMaterial() — the built world
//
// ── Per-world state ──────────────────────────────────────────────────────────
// Two things here depend on the active DNA and must be rebuilt when it changes:
// the baked shore/horizon fields (`worldFieldJobs`, `disposeWorldFields`), and
// the generated GLSL for the centreline and the lithology. The generators emit
// the DNA's numbers as literals rather than uploading them as uniforms, because
// a uniform-driven meander costs a loop and two extra sin() in every terrain and
// water fragment; a world swap already rebuilds every material it touches.
//
// Tile bakes that do NOT depend on the DNA (rock, ripple, foam, ice, concrete)
// stay in `cached()` and survive a swap.
// ─────────────────────────────────────────────────────────────────────────────

/** GLSL float literal. Integers need the point or the compiler reads an int. */
function gf(v) {
  if (!Number.isFinite(v)) throw new Error(`glsl float: ${v}`);
  const s = String(v);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}
const gv3 = (c) => `vec3(${gf(c[0])}, ${gf(c[1])}, ${gf(c[2])})`;

/* ── small bakery helpers ─────────────────────────────────────────────────── */

function tex(data, w, h, { srgb = false, aniso = 16, wrap = THREE.RepeatWrapping } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = wrap;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function bake(w, h, fn, opts) {
  const data = new Uint8Array(w * h * 4);
  const out = [0, 0, 0, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      fn(x / w, y / h, out, x, y);
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) data[i + c] = Math.max(0, Math.min(255, out[c] * 255)) | 0;
    }
  }
  return tex(data, w, h, opts);
}

/**
 * One pass, two outputs: the RGBA map and the height field it shares its noise
 * with. `fn` fills `o` and *returns* the texel's height.
 *
 * Every material set below used to run two full loops over the same 512² grid,
 * evaluating the same fbm at the same coordinate in each — ~15 octaves a time,
 * twice. Fusing beats caching the samples: nothing is stored, so the scratch
 * arrays a cache would need never exist. Interleaving is safe because the
 * samplers are pure — their RNG is consumed at construction, not at sample.
 */
function bakeHeightAndMap(S, fn, opts) {
  const data = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  const o = [0, 0, 0, 1];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      height[i] = fn(x / S, y / S, o, x, y);
      const j = i * 4;
      for (let c = 0; c < 4; c++) data[j + c] = Math.max(0, Math.min(255, o[c] * 255)) | 0;
    }
  }
  return { height, map: tex(data, S, S, opts) };
}

function normalFrom(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      let ny = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len * 0.5 + 0.5) * 255) | 0;
      data[i + 1] = ((ny / len * 0.5 + 0.5) * 255) | 0;
      data[i + 2] = ((1 / len * 0.5 + 0.5) * 255) | 0;
      data[i + 3] = 255;
    }
  }
  return tex(data, size, size);
}

/* ── rock: a mask set, not a colour map ───────────────────────────────────── */
//
// The first version of this baked rock *colour* into a 9 m tile. At the ranges
// this game is actually played at — 200 m to 2 km — that tile mips down to its
// own mean and the entire canyon renders as one flat neutral value. That is the
// whole reason the level read as folded paper.
//
// So the texture carries no colour at all now. It carries four decorrelated
// scalar fields; every hue in the level is generated in the fragment shader
// from world position, where it varies over tens of metres and therefore cannot
// be averaged away by a mipmap:
//
//   R  fine detail value   (grit, cracks, flake spall) — the 9 m band
//   G  broad value         (strata) — still legible at the 65 m band
//   B  a decorrelated mask (patches) — drives varnish streaks and lichen
//   A  roughness

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const rockSet = () => cached('world.rock2', () => {
  const r = new RNG('world:rock2');
  const strata = fbm2D(r, { octaves: 5, base: 4, gain: 0.55 });
  const crack = ridged2D(r, { octaves: 5, base: 8, gain: 0.52 });
  const grit = fbm2D(r, { octaves: 4, base: 34, gain: 0.58 });
  const patch = fbm2D(r, { octaves: 3, base: 3, gain: 0.62 });
  const flake = worley2D(r, 11);
  const S = 512;

  const { height, map } = bakeHeightAndMap(S, (u, v, o) => {
    const s = strata(u, v * 0.5);
    const c = Math.pow(crack(u, v), 3);
    const g = grit(u, v);
    const p = patch(u * 0.5, v * 0.5);
    const fl = 1 - flake(u, v);
    o[0] = clamp01(0.26 + g * 0.52 + c * 0.34 + fl * 0.16);
    o[1] = clamp01(0.14 + s * 0.90);
    o[2] = clamp01(p * 1.05);
    o[3] = clamp01(0.56 + g * 0.26 + c * 0.20 - fl * 0.12);
    return s * 0.80 + c * 0.72 + g * 0.11 - Math.pow(fl, 2) * 0.22;
  }, { srgb: false });
  return { map, normalMap: normalFrom(height, S, 2.8) };
});

// The same four channels for a wall of ice, which weathers by a completely
// different set of processes: it fractures rather than cracking, it ablates
// into dish-shaped sun-cups rather than spalling flakes, and its fine grain is
// firn — packed snow — not grit. Nothing here is a recolour of `rockSet`; the
// bands themselves are different, which is the point.
//
//   R  firn grain + fracture      the 9 m band
//   G  foliation value            the 65 m band
//   B  decorrelated mask          wind scour and scallop fields
//   A  roughness — ice runs far glossier than rock, and varies less
const iceWallSet = () => cached('world.icewall', () => {
  const r = new RNG('world:icewall');
  const foliation = fbm2D(r, { octaves: 4, base: 3, gain: 0.58 });
  const fracture = ridged2D(r, { octaves: 4, base: 6, gain: 0.48 });
  const firn = fbm2D(r, { octaves: 4, base: 28, gain: 0.52 });
  const patch = fbm2D(r, { octaves: 3, base: 3, gain: 0.62 });
  const cup = worley2D(r, 16);
  const S = 512;

  const { height, map } = bakeHeightAndMap(S, (u, v, o) => {
    const f = foliation(u, v * 0.6);
    const fr = Math.pow(fracture(u, v), 2);
    const fn = firn(u, v);
    const p = patch(u * 0.5, v * 0.5);
    const cp = 1 - cup(u, v);
    o[0] = clamp01(0.34 + fn * 0.30 + fr * 0.44 + cp * 0.24);
    o[1] = clamp01(0.20 + f * 0.78);
    o[2] = clamp01(p * 1.05);
    // 0.18–0.52 against rock's 0.44–0.94. Wind-polished ice is nearly a mirror
    // at grazing angles and that is most of what says "ice" under a low sun.
    o[3] = clamp01(0.18 + fn * 0.16 + fr * 0.22 - cp * 0.08);
    // Fracture dominates the relief: a shear plane in ice is a clean deep step,
    // where a crack in sandstone is a hairline. Sun-cups subtract, because a
    // scallop is a hollow.
    return f * 0.52 + fr * 0.88 + fn * 0.07 - Math.pow(cp, 1.6) * 0.34;
  }, { srgb: false });
  // Shallower than rock's 2.8: ice weathers to smooth faces between fractures,
  // and pushing the same relief through it reads as frosted glass.
  return { map, normalMap: normalFrom(height, S, 1.7) };
});

/** The wall surface for the active world. */
const surfaceSet = () => (DNA.surfaceKind === 'glacial' ? iceWallSet() : rockSet());

/* ── shore field: terrain height under the water plane, in rail space ─────── */
//
// The water shader needs to know where the land is. Sampling the height field
// per-fragment is impossible, so it is baked once into a texture indexed by
// (lateral offset from the centreline, distance down the level). The shader
// reproduces `centrelineX` exactly, so the lookup lands on the right spot even
// though the river meanders.

export let SHORE = { halfU: 1250, z0: 0, zLen: 1, w: 384, h: 1024 };

let _shore = null;

function shoreRows(data, j0, j1) {
  const { halfU, z0, zLen, w, h } = SHORE;
  for (let j = j0; j < j1; j++) {
    const z = z0 - (j + 0.5) / h * zLen;
    const cx = centrelineX(z);
    for (let i = 0; i < w; i++) {
      const u = (-0.5 + (i + 0.5) / w) * 2 * halfU;
      const y = terrainHeight(cx + u, z);
      const k = (j * w + i) * 4;
      data[k] = Math.max(0, Math.min(255, (y + 70) / 140 * 255)) | 0;   // height, [-70,70]
      data[k + 1] = Math.max(0, Math.min(255, (1 - Math.min(1, -y / 34)) * 255)) | 0; // shallowness
      data[k + 2] = 0; data[k + 3] = 255;
    }
  }
}

function fieldTex(data, w, h) {
  const t = tex(data, w, h, { wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

const shoreField = () => _shore;

/* ── sun horizon field: terrain shadows without a shadow map ──────────────── */
//
// The level is a 10 km corridor between walls up to 1750 m tall, lit by a 27°
// sun. A cliff that high throws a shadow the better part of two kilometres, and
// those shadows are the only thing that gives the landscape form — without them
// a mountain range is a flat cut-out and the canyon reads as a painted backdrop.
//
// A shadow map cannot deliver that here. The sun's cascade is 380 m across and
// follows the ship (it exists for the Arwing and the props); switching the
// terrain to castShadow inside it produces a hard rectangular shadow boundary
// straight across the bank where the frustum ends, and self-shadowing acne on
// every 80° wall — which is exactly why terrain casting was turned off. Widening
// it to cover a 2 km shadow at any usable texel density means real CSM, several
// hundred extra draw calls of terrain re-rasterised per cascade, and a bias
// tuning problem on near-vertical faces that nobody wins.
//
// So the occlusion is baked instead — but as a *horizon map*, not as a shadow
// for one fixed sun. For every point in the corridor this stores how high the
// land stands, in each of eight compass sectors, as an elevation angle. Direct
// sun is then simply "is the sun higher than the horizon in the sun's own
// direction", evaluated per fragment against the live light. It costs two
// texture fetches, it has no cascade seam, no acne, no depth bias, no range
// limit, and it still responds correctly when the environment preset moves the
// sun. It cannot shadow *moving* geometry onto the terrain — that is what the
// real shadow map is still there for.
//
// Sector k runs anticlockwise from +u (world +X) toward -Z, 45° apart:
//   0:+u  1:+u-z  2:-z  3:-u-z  4:-u  5:-u+z  6:+z  7:+u+z
// Stored as an angle in 0..1 = 0..90°, so a byte buys 0.35° of resolution.

// The grid is deliberately near-isotropic (≈16 m either way) so that the four
// diagonal sectors really do point at 45° and the angular interpolation between
// sectors is not skewed by the aspect ratio.
export let HORIZON = { halfU: 2000, z0: 0, zLen: 1, w: 256, h: 660 };

// Ray steps in texels, geometric: dense near the shading point where the
// horizon changes fastest, sparse out at the range where only a whole mountain
// can still matter. 112 texels ≈ 1.8 km, which is as far as a 27° sun can throw
// a shadow from the tallest thing in the level.
const HSTEPS = [1, 2, 3, 4, 5, 7, 9, 12, 16, 21, 28, 37, 49, 64, 85, 112];
const HDIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

let _horiz = null;

function horizonHeightRows(F, j0, j1) {
  const { halfU, z0, zLen, w, h } = HORIZON;
  const dz = zLen / h;
  const P = {};
  for (let j = j0; j < j1; j++) {
    const z = z0 - (j + 0.5) * dz;
    profileAt(z, P);
    const row = j * w;
    for (let i = 0; i < w; i++) F[row + i] = heightAtU((-0.5 + (i + 0.5) / w) * 2 * halfU, z, P);
  }
}

function horizonSectorRows(F, A, B, j0, j1) {
  const { halfU, zLen, w, h } = HORIZON;
  const du = (2 * halfU) / w;      // metres per texel across the rail
  const dz = zLen / h;             // metres per texel along it
  const INV = 1 / (Math.PI * 0.5);
  for (let j = j0; j < j1; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const h0 = F[k];
      for (let d = 0; d < 8; d++) {
        const [si, sj] = HDIRS[d];
        const stepLen = Math.hypot(si * du, sj * dz);
        let best = 0;
        for (const s of HSTEPS) {
          const ii = i + si * s, jj = j + sj * s;
          if (ii < 0 || ii >= w || jj < 0 || jj >= h) break;
          // 2 m of slack: without it the noise on a convex slope puts a false
          // half-degree horizon on every sunlit face and the whole level dims.
          const t = (F[jj * w + ii] - h0 - 2) / (s * stepLen);
          if (t > best) best = t;
        }
        const v = Math.min(255, Math.atan(best) * INV * 255) | 0;
        if (d < 4) A[k * 4 + d] = v; else B[k * 4 + (d - 4)] = v;
      }
    }
  }
}

const horizonField = () => _horiz;

/* ── baking the two fields, a slice at a time ─────────────────────────────── */
//
// Between them these are ~560 k height samples and 22 M array reads — over a
// second of work, which is a stall the moment it happens inside a frame. So
// they are handed out as a queue of thunks and the caller spends a frame budget
// on them. Slice sizes are chosen so one thunk is single-digit milliseconds.

/** Field extents follow the active DNA's z range. Call before `worldFieldJobs`. */
export function configureWorldFields() {
  const zLen = WORLD.zStart - WORLD.zEnd;
  SHORE = { halfU: 1250, z0: WORLD.zStart, zLen, w: 384, h: 1024 };
  HORIZON = { halfU: 2000, z0: WORLD.zStart, zLen, w: 256, h: 660 };
}

/** Release the fields of the world being replaced. */
export function disposeWorldFields() {
  if (_shore) { _shore.dispose(); _shore = null; }
  if (_horiz) { _horiz.a.dispose(); _horiz.b.dispose(); _horiz = null; }
}

/** Build jobs for the shore and horizon fields of the active DNA. */
export function worldFieldJobs() {
  const jobs = [];

  const S = SHORE;
  const sData = new Uint8Array(S.w * S.h * 4);
  for (let j = 0; j < S.h; j += 16) {
    const a = j, b = Math.min(S.h, j + 16);
    jobs.push(() => shoreRows(sData, a, b));
  }
  jobs.push(() => { _shore = fieldTex(sData, S.w, S.h); });

  const H = HORIZON;
  const F = new Float32Array(H.w * H.h);
  for (let j = 0; j < H.h; j += 24) {
    const a = j, b = Math.min(H.h, j + 24);
    jobs.push(() => horizonHeightRows(F, a, b));
  }
  const A = new Uint8Array(H.w * H.h * 4);
  const B = new Uint8Array(H.w * H.h * 4);
  for (let j = 0; j < H.h; j += 8) {
    const a = j, b = Math.min(H.h, j + 8);
    jobs.push(() => horizonSectorRows(F, A, B, a, b));
  }
  jobs.push(() => { _horiz = { a: fieldTex(A, H.w, H.h), b: fieldTex(B, H.w, H.h) }; });

  return jobs;
}

const GLSL_HORIZON = () => /* glsl */`
  uniform sampler2D uHorizA;
  uniform sampler2D uHorizB;
  uniform vec3 uHorizCfg;               // halfU, z0, zLen

  ${GLSL_CENTRELINE_DX()}
  float pickSector(vec4 a, vec4 b, int k) {
    vec4 v = k < 4 ? a : b;
    int m = k < 4 ? k : k - 4;
    return m == 0 ? v.x : (m == 1 ? v.y : (m == 2 ? v.z : v.w));
  }
  /**
   * 1 where the sun clears the skyline, 0 where the land in front of it does
   * not. sunW points from the surface toward the sun, in world space.
   */
  float sunHorizon(vec3 p, vec3 sunW) {
    float u = p.x - centrelineX(p.z);
    vec2 st = vec2(u / (2.0 * uHorizCfg.x) + 0.5, (uHorizCfg.y - p.z) / uHorizCfg.z);
    // Off the baked corridor there is nothing tall enough left to cast, and a
    // hard edge there would be worse than no shadow — fade out over the last
    // eighth of the field instead of clipping.
    float inside = smoothstep(0.0, 0.06, st.x) * smoothstep(1.0, 0.94, st.x)
                 * smoothstep(0.0, 0.01, st.y) * smoothstep(1.0, 0.99, st.y);
    if (inside <= 0.001) return 1.0;

    // The stored sectors are laid out in rail space, and the rail shears with
    // the meander — so the sun's bearing has to be taken there too, or every
    // shadow in the level leans a few degrees off true wherever the river bends.
    vec2 rail = vec2(sunW.x - centrelineDX(p.z) * sunW.z, sunW.z);
    float len = max(length(rail), 1e-5);
    float ang = atan(-rail.y, rail.x);                 // 0 at +u, +90° at -z
    float f = ang * (4.0 / PI);
    f = f - 8.0 * floor(f / 8.0);                      // wrap into 0..8
    int k0 = int(f);
    int k1 = int(mod(float(k0) + 1.0, 8.0));
    vec4 ha = texture2D(uHorizA, st), hb = texture2D(uHorizB, st);
    float hz = mix(pickSector(ha, hb, k0), pickSector(ha, hb, k1), fract(f)) * (PI * 0.5);

    float sunEl = atan(sunW.y, len);
    // ~3.5° of terminator. The sun's disc is half a degree, but the field is
    // baked at 16 m and a hard edge on a soft field is just a staircase; the
    // softness also grows with distance from the occluder, which is what a real
    // penumbra does anyway.
    float lit = smoothstep(-0.030, 0.032, sunEl - hz);
    return mix(1.0, lit, inside);
  }
`;

/* ── shared GLSL ──────────────────────────────────────────────────────────── */

// The shader has to reproduce profile.js:centrelineX exactly, or every lookup
// into the shore and horizon fields lands on the wrong column and the waterline
// slides off the beach wherever the channel bends. Both are generated from the
// same DNA, from the same term list, so they cannot drift apart.
//
// A dog-leg is `1 - smoothstep(zc-hw, zc+hw, z)` here and `smoothstep(zc+hw,
// zc-hw, z)` in JS: GLSL's smoothstep is undefined for edge0 > edge1, and the
// two forms are algebraically the same cubic.
// Declared once per shader stage, whichever chunk gets there first. Both
// `centrelineX` and `centrelineDX` need these and a stage can include either or
// both, so the guard is what keeps the pair composable in any order.
const GLSL_CENTRELINE_UNIFORMS = /* glsl */`
  #ifndef CENTRELINE_UNIFORMS
  #define CENTRELINE_UNIFORMS
  uniform vec3 uCxWave[${MAXW}];       // (frequency, phase, amplitude)
  uniform vec3 uCxBend[${MAXB}];       // (edge0, edge1, dx)
  uniform int uCxNWave;
  uniform int uCxNBend;
  #endif
`;

export function GLSL_CENTRELINE() {
  return /* glsl */`
  ${GLSL_CENTRELINE_UNIFORMS}
  float centrelineX(float z) {
    float t = -z;
    float s = 0.0;
    for (int i = 0; i < ${MAXW}; i++) {
      if (i >= uCxNWave) break;
      s += sin(t * uCxWave[i].x + uCxWave[i].y) * uCxWave[i].z;
    }
    for (int i = 0; i < ${MAXB}; i++) {
      if (i >= uCxNBend) break;
      s += (1.0 - smoothstep(uCxBend[i].x, uCxBend[i].y, z)) * uCxBend[i].z;
    }
    return s;
  }
`;
}

function GLSL_CENTRELINE_DX() {
  return /* glsl */`
  ${GLSL_CENTRELINE_UNIFORMS}
  float centrelineDX(float z) {
    float t = -z;
    float d = 0.0;
    for (int i = 0; i < ${MAXW}; i++) {
      if (i >= uCxNWave) break;
      d -= cos(t * uCxWave[i].x + uCxWave[i].y) * uCxWave[i].z * uCxWave[i].x;
    }
    for (int i = 0; i < ${MAXB}; i++) {
      if (i >= uCxNBend) break;
      // The bend's width is the gap between its own edges — no extra uniform.
      float w = uCxBend[i].y - uCxBend[i].x;
      float bt = clamp((z - uCxBend[i].x) / w, 0.0, 1.0);
      d -= uCxBend[i].z * 6.0 * bt * (1.0 - bt) / w;
    }
    return d;
  }
`;
}

/**
 * Feed the centreline uniforms into a patched built-in material. Every shader
 * that includes either centreline chunk needs this in its `onBeforeCompile`.
 */
function centrelineInto(sh) {
  const c = centrelineUniforms();
  sh.uniforms.uCxWave = { value: c.wave };
  sh.uniforms.uCxBend = { value: c.bend };
  sh.uniforms.uCxNWave = { value: c.nWave };
  sh.uniforms.uCxNBend = { value: c.nBend };
}

const GLSL_SHORE = /* glsl */`
  uniform sampler2D uShore;
  uniform vec3 uShoreCfg;              // halfU, z0, zLen
  vec2 shoreLookup(vec3 p) {
    float u = p.x - centrelineX(p.z);
    return vec2(u / (2.0 * uShoreCfg.x) + 0.5, (uShoreCfg.y - p.z) / uShoreCfg.z);
  }
  // .x = terrain height under p, .y = shallowness 0..1
  // Off the edge of the baked field is open ocean, not whatever the border texel
  // happened to be — otherwise the horizon turns turquoise.
  vec2 shoreAt(vec3 p) {
    vec2 st = shoreLookup(p);
    float inside = step(0.0, st.x) * step(st.x, 1.0) * step(0.0, st.y) * step(st.y, 1.0);
    vec2 s = texture2D(uShore, clamp(st, 0.002, 0.998)).rg;
    return mix(vec2(-70.0, 0.0), vec2(s.x * 140.0 - 70.0, s.y), inside);
  }
`;

/* ── terrain ──────────────────────────────────────────────────────────────── */

// Linear albedos from the DNA. Real stone lives between 0.10 and 0.42; above
// that is snow. The separation that makes a cliff read as sedimentary is *hue*
// between the members, not brightness — Corneria's ochre and shale differ by
// 0.14 in red and 0.04 in blue.
//
// 0..1 around the formation cycle → which member is exposed. Most of the cycle
// is country rock on purpose: a wall where every band is a different mineral is
// not a cliff, it is marbled endpaper. The named members are narrow, and they
// never fully replace the base.
function GLSL_LITHOLOGY() {
  const L = { ...DEFAULTS.lithology, ...DNA.lithology };
  const lines = L.members.map((m, i) => `    c = mix(c, L_M${i}, ${gf(m.k)}`
    + ` * smoothstep(${gf(m.in[0])}, ${gf(m.in[1])}, f)`
    + ` * (1.0 - smoothstep(${gf(m.out[0])}, ${gf(m.out[1])}, f)));`);
  return /* glsl */`
  const vec3 L_BASE = ${gv3(L.base)};
${L.members.map((m, i) => `  const vec3 L_M${i} = ${gv3(m.color)};`).join('\n')}

  vec3 lithology(float f) {
    vec3 c = L_BASE;
${lines.join('\n')}
    return c;
  }
`;
}

/* ── surface structure ────────────────────────────────────────────────────── */
//
// What the wall is made of, as opposed to what colour it is. This is generated
// per-DNA for the same reason `lithology` is — the alternative is a runtime
// branch in the innermost fragment path — and it is the difference between two
// worlds and two coats of paint. `lithology()` only ever chose the *colours* of
// a sedimentary sequence; until this existed, every world in the game was
// folded bedrock with 13 m beds no matter what it was supposed to be.
//
// A block must set `rock` (vec3), `gBedK` and `gBedSlope`, and may read
// `vWPos`, `gTri`, `crs`, `gSteep`, `gWpx` and `cav`.

const GLSL_SEDIMENTARY = /* glsl */`
        // ── bedding ─────────────────────────────────────────────────────────
        // Beds are laid down flat and then folded, and the folding is doing all
        // the work here. A perfectly horizontal band on a curved wall is not
        // strata — it is a contour line, and a canyon ruled with contour lines
        // reads as a topographic model of a canyon rather than as rock.
        //
        // The fold has to be three long sines and not a texture tap. Every band
        // in the rock tile carries structure down to a tenth of its own period,
        // so a warp built out of one wiggles at tens of metres: that is a
        // corrugation, not a fold, and corrugated bedding is exactly what made
        // these walls read as sheets of cardboard. 2.3 km / 900 m / 350 m at
        // ±34 / ±21 / ±8 m works out to 4–9° of local dip, which is what a
        // gently deformed sedimentary basin actually looks like.
        float fold = sin(vWPos.x * 0.00071 - vWPos.z * 0.0017 + 2.1) * 34.0
                   + sin(vWPos.x * 0.0027 + vWPos.z * 0.0011) * 21.0
                   + sin(vWPos.z * 0.0043 + vWPos.x * 0.0009 + 1.3) * 8.0;
        // …plus a metre of local wander, because a bed contact is a surface that
        // was deposited, not machined.
        float yw = vWPos.y + fold + (gTri.g - 0.5) * 2.2;

        // Two incommensurate periods, so the sequence reads thick / thin / pair
        // instead of the single ruled pitch that reads as wallpaper…
        const float BEDP = 13.0;
        float bedG = yw * (1.0 / BEDP);
        float bi = floor(bedG);
        float bedF = bedG - bi;
        float bedT = abs(bedF * 2.0 - 1.0) * 0.70
                   + abs(fract(yw * (1.0 / 31.0)) * 2.0 - 1.0) * 0.30;
        // …and every individual bed gets its own character: how pale it is, how
        // far it weathers back, how hard the contact beneath it cuts. This is
        // the difference between a sedimentary sequence and a barcode. One hash
        // of the bed index buys all of it, and because it is constant *within* a
        // bed it follows the fold instead of fighting it.
        float bh = fract(sin(bi * 91.73) * 4375.85);
        // dissolve the member banding once its period drops toward a few pixels
        float bedFade = 1.0 - smoothstep(BEDP * 0.10, BEDP * 0.34, gWpx);
        float bed = smoothstep(0.10, 0.78, bedT);
        float parting = (1.0 - smoothstep(0.0, 0.16, bedT)) * bedFade;
        // Relief belongs at the contact, not across the whole bed: a member
        // weathers to a flat face and only the parting between two of them is a
        // groove. Spread across the bed it becomes a sawtooth, and a sawtooth
        // under a low sun is a hard stripe every 13 m all the way up the wall.
        gBedSlope = (bedF < 0.5 ? 1.0 : -1.0) * (1.0 - smoothstep(0.02, 0.40, bedT))
                  * (0.30 + 1.7 * bh) * bedFade;

        // Beds only *outcrop* where the land cuts through them. Stand on a bench
        // and you are standing on one bedding plane — a single rock over the
        // whole terrace — not on a section through fifty of them. Applied
        // regardless of slope, a Y-banded lithology turns every plateau in the
        // level into a contour map of its own topography, in colour, which is
        // the single most artificial thing a procedural terrain can do.
        float outcrop = mix(0.16, 1.0, smoothstep(0.08, 0.42, gSteep));
        float form = fract(yw * (1.0 / 96.0) + crs.b * 0.10);
        vec3 rock = mix(L_BASE, lithology(form), outcrop);

        // value: fine grain over broad grain, both band-limited by the tile
        // they came from rather than by a magic distance
        float v = (0.70 + 0.58 * gTri.r) * (0.76 + 0.44 * crs.g);
        rock *= v;
        // The member-to-member value swing was 29%. Past a couple of hundred
        // metres a 29% swing on a 13 m pitch is a zebra, not a cliff — what
        // survives distance and still reads as sediment is the *hue* difference
        // between members, so the value difference goes down to 14% and the
        // relief term below picks up the slack.
        rock *= mix(1.0, mix(0.94, 1.04, bed) * mix(0.93, 1.08, bh)
                       * (1.0 - parting * 0.22 * bedFade), outcrop);
        gBedK = bed;

        // ── desert varnish ──────────────────────────────────────────────────
        // The dark streaks that run down every real canyon wall from the rim.
        // Deliberately anisotropic: 16 m across, 220 m down.
        float streak = texture2D(map, vec2((vWPos.x * 0.62 + vWPos.z * 0.62) * uScale,
                                            vWPos.y * uScale * 0.045 + 0.6)).b;
        float faceK = smoothstep(0.24, 0.72, gSteep);
        rock *= mix(1.0, 0.52 + streak * 0.86, faceK * 0.55 * (1.0 - smoothstep(2.0, 7.0, gWpx)));

        // ── cavity ──────────────────────────────────────────────────────────
        // Gullies collect dirt and damp; rims are scoured and dusty.
        float gully = smoothstep(0.54, 1.0, cav);
        float rim = smoothstep(0.46, 0.02, cav);
        rock *= mix(1.0, 0.56, gully * 0.85);
        rock *= mix(1.0, 1.16, rim * 0.8);

        // the waterline: rock darkens and glosses where it is permanently wet
        gWet = (1.0 - smoothstep(-1.0, 5.5, vWPos.y)) * smoothstep(-16.0, -6.0, vWPos.y);
        // a bleached tide mark just above it — the single cue that says "sea"
        float tide = smoothstep(1.5, 4.5, vWPos.y) * (1.0 - smoothstep(5.5, 11.0, vWPos.y));
        rock *= mix(1.0, 0.40, gWet);
        rock *= mix(1.0, 1.26, tide * (1.0 - gSteep * 0.5));
`;

const GLSL_GLACIAL = /* glsl */`
        // ── foliation ───────────────────────────────────────────────────────
        // Ice is not bedded, and drawing it as if it were is what made an ice
        // sheet read as a sandstone canyon. What a glacier wall actually shows
        // is foliation: layers sheared by flow into planes that stand close to
        // vertical in a valley wall and arc downglacier, at a pitch of a couple
        // of metres rather than thirteen.
        //
        // So the coordinate is lateral distance across the channel, not height.
        // That one substitution is the whole difference: banding that climbs the
        // wall instead of ringing it, and it swings with the corridor because
        // the flow does.
        float flow = sin(vWPos.z * 0.00083 + 1.7) * 46.0
                   + sin(vWPos.z * 0.0021 + vWPos.y * 0.0016) * 17.0;
        float fw = vWPos.x - centrelineX(vWPos.z) + flow + (gTri.g - 0.5) * 3.4;

        const float FOLP = 2.6;
        float folG = fw * (1.0 / FOLP);
        float fi = floor(folG);
        float folF = folG - fi;
        float folT = abs(folF * 2.0 - 1.0) * 0.62
                   + abs(fract(fw * (1.0 / 7.3)) * 2.0 - 1.0) * 0.38;
        float fh = fract(sin(fi * 57.31) * 2917.44);
        float folFade = 1.0 - smoothstep(FOLP * 0.10, FOLP * 0.40, gWpx);
        float fol = smoothstep(0.14, 0.72, folT);
        gBedSlope = (folF < 0.5 ? 1.0 : -1.0) * (1.0 - smoothstep(0.03, 0.44, folT))
                  * (0.24 + 1.3 * fh) * folFade;

        // Blue ice is what is exposed where wind and ablation scour the face
        // back; anything shallow enough to hold snow is firn, and firn is one
        // flat white. Same masking idea as the sedimentary outcrop term, opposite
        // material.
        float scour = smoothstep(0.20, 0.66, gSteep);
        float form = fract(fw * (1.0 / 23.0) + crs.b * 0.14);
        vec3 rock = mix(L_BASE, lithology(form), scour);

        float v = (0.78 + 0.40 * gTri.r) * (0.84 + 0.30 * crs.g);
        rock *= v;
        rock *= mix(1.0, mix(0.96, 1.05, fol) * mix(0.95, 1.06, fh), scour);
        gBedK = fol;

        // ── ablation scallops ───────────────────────────────────────────────
        // Sun-cups: the dish-shaped hollows a snowfield weathers into under a
        // high sun. Isotropic and sub-metre, so they live on the low-angle
        // surfaces the foliation does not reach — which is exactly where a rock
        // world would have put nothing at all.
        rock *= mix(1.0, 0.90 + crs.r * 0.24,
                    (1.0 - gSteep) * 0.75 * (1.0 - smoothstep(1.5, 6.0, gWpx)));

        // ── englacial debris ────────────────────────────────────────────────
        // Thin dirt bands frozen into the ice — the one horizontal feature on
        // the whole wall, and rare enough to read as an event rather than a
        // pattern. Their scarcity is what keeps the vertical foliation reading.
        float band = smoothstep(0.88, 0.98, fract(vWPos.y * (1.0 / 38.0) + crs.g * 0.42));
        rock = mix(rock, rock * vec3(0.60, 0.59, 0.58), band * 0.55 * scour * folFade);

        // ── wind scour ──────────────────────────────────────────────────────
        // Sastrugi run with the wind, across the corridor, not down the wall
        // from the rim. The anisotropy is the opposite of desert varnish.
        float sast = texture2D(map, vec2(vWPos.z * uScale * 0.055 + 0.4,
                                         (vWPos.x * 0.7 + vWPos.y * 0.7) * uScale)).b;
        rock *= mix(1.0, 0.86 + sast * 0.30,
                    (1.0 - gSteep) * 0.6 * (1.0 - smoothstep(2.0, 8.0, gWpx)));

        // ── cavity ──────────────────────────────────────────────────────────
        // Inverted against rock: a hollow in ice fills with drifted snow and
        // goes brighter, where a gully in rock collects dirt and goes darker.
        // Rims are wind-stripped to blue ice instead of scoured to dust.
        float gully = smoothstep(0.54, 1.0, cav);
        float rim = smoothstep(0.46, 0.02, cav);
        rock *= mix(1.0, 1.14, gully * 0.7);
        rock *= mix(1.0, 0.88, rim * 0.6);

        // Where the wall meets the frozen channel the ice is pressure-welded and
        // denser, so it goes bluer and glossier. No tide mark: there is no tide.
        gWet = (1.0 - smoothstep(-1.0, 7.0, vWPos.y)) * smoothstep(-20.0, -8.0, vWPos.y);
        rock *= mix(1.0, 0.78, gWet);
`;

const GLSL_VOLCANIC = /* glsl */`
        // ── columnar jointing ───────────────────────────────────────────────
        // Columns grow perpendicular to the cooling front, and in a ponded flow
        // that front is horizontal — so the column axis is vertical and the cell
        // pattern is a function of XZ alone. Invariant along Y is the whole
        // read: it draws a cliff as parallel columns running its full height,
        // where sedimentary bedding and glacial foliation both draw bands
        // across one. The same field on a terrace is a pavement of column tops,
        // which is what a real flow surface is, so nothing masks it by slope.
        //
        // Hexagonal by construction, not by a Worley search: a two-candidate
        // offset lattice is 2 tests against 9, and well-developed jointing is
        // hexagonal anyway.
        vec2 colP = (vWPos.xz + vec2(crs.g - 0.5, crs.b - 0.5) * 11.0) * (1.0 / 4.6);
        vec2 hs = vec2(1.0, 1.7320508);
        vec4 hcell = floor(vec4(colP, colP - vec2(0.5, 1.0)) / hs.xyxy) + 0.5;
        vec4 hA = vec4(colP - hcell.xy * hs, colP - (hcell.zw + 0.5) * hs);
        vec4 hc = dot(hA.xy, hA.xy) < dot(hA.zw, hA.zw)
                ? vec4(hA.xy, hcell.xy) : vec4(hA.zw, hcell.zw + 0.5);
        vec2 hq = abs(hc.xy);
        // 0 at the column axis, 0.5 at a joint.
        float hd = max(dot(hq, vec2(0.5, 0.8660254)), hq.x);
        float ch = fract(sin(dot(hc.zw, vec2(37.19, 61.73))) * 4271.53);
        float colFade = 1.0 - smoothstep(4.6 * 0.14, 4.6 * 0.55, gWpx);
        float joint = smoothstep(0.32, 0.50, hd) * colFade;

        // Entablature: the master joints that break a colonnade into tiers.
        // Rare enough to read as events; without them a 600 m wall is one
        // unbroken comb from the river to the rim.
        float tierT = fract(vWPos.y * (1.0 / 46.0) + ch * 0.17 + crs.r * 0.09);
        float master = (1.0 - smoothstep(0.0, 0.09, tierT)) * colFade;

        // Every column is its own cooling unit, so the member varies per CELL
        // rather than per height band. That is the one place this structure
        // spends the lithology table differently from the other two.
        float form = fract(ch * 0.83 + crs.b * 0.12);
        vec3 rock = mix(L_BASE, lithology(form), 0.15 + smoothstep(0.05, 0.45, gSteep) * 0.85);

        float v = (0.72 + 0.56 * gTri.r) * (0.78 + 0.42 * crs.g);
        rock *= v;
        rock *= mix(1.0, 0.86 + ch * 0.30, colFade);
        rock *= 1.0 - joint * 0.46;
        rock *= 1.0 - master * 0.32;
        gBedK = 1.0 - joint;

        // The groove runs ACROSS the surface, not up it — see gGrooveAcross in
        // terrainMaterial. Sign is the horizontal component of the cell
        // gradient; the local x sign is that component to within the cell.
        gGrooveAcross = 1.0;
        gBedSlope = (hc.x < 0.0 ? 1.0 : -1.0)
                  * (1.0 - smoothstep(0.05, 0.40, 0.5 - hd))
                  * (0.35 + 1.45 * ch) * colFade;

        // ── ash ─────────────────────────────────────────────────────────────
        // Fall settles on anything flat and is stripped off anything steep, so
        // it is the inverse mask to everything the wall does.
        float ash = (1.0 - gSteep) * smoothstep(0.30, 0.86, crs.r);
        rock = mix(rock, rock * vec3(2.30, 2.16, 2.02), ash * 0.55 * (1.0 - smoothstep(3.0, 12.0, gWpx)));

        // ── cavity ──────────────────────────────────────────────────────────
        // A hollow in young basalt is shadowed rubble; a rim is ash-dusted.
        float gully = smoothstep(0.54, 1.0, cav);
        float rim = smoothstep(0.46, 0.02, cav);
        rock *= mix(1.0, 0.60, gully * 0.85);
        rock *= mix(1.0, 1.22, rim * 0.75);

        // The chill margin: rock quenched by the channel is glass, so it is the
        // darkest and the glossiest thing in the level. gWet drives roughness
        // toward 0.14 in the shared block above, which is what glass wants.
        // No tide mark — a lava channel does not have one.
        gWet = (1.0 - smoothstep(-1.0, 9.0, vWPos.y)) * smoothstep(-24.0, -9.0, vWPos.y);
        rock *= mix(1.0, 0.30, gWet);
`;

const GLSL_STRUCTURE = () => (
  DNA.surfaceKind === 'glacial' ? GLSL_GLACIAL
    : DNA.surfaceKind === 'volcanic' ? GLSL_VOLCANIC
      : GLSL_SEDIMENTARY);

/* ── ground that emits ────────────────────────────────────────────────────────
   `DNA.glow` turns the terrain into a light source. One level uses it, and it
   is the only way that level can exist: bioluminescence is the ground being
   bright, and no light rig produces that. A hemisphere with a bright ground
   colour lights everything ELSE from below and leaves the ground itself at
   whatever the sky term gives it, which on a night world is black.

   The mask is damp and shelter — `cav` is already the baked cavity field, and a
   colony grows where water collects — times a two-scale patchiness, because an
   even coat is paint and paint does not read as alive. It fades out with height
   so a skyline stays dark and the glow reads as coming from the valley floor.

   @typedef {Object} Glow
   @property {number[]} color   linear radiance at full mask, not a colour
   @property {number}   amount
   @property {number[]} height  [full, none] in world Y
   @property {number}   pulse   rad/s of the breathing term                    */
function GLSL_GLOW() {
  const g = DNA.glow;
  if (!g) return '';
  return /* glsl */`
        {
          // Three masks, and the shape of the combination is the whole look.
          // A SUM of them lit every square metre of the level and the terrain
          // composited pure white; what a colony field actually is is a dim
          // wash where it is damp, with sparse hot patches inside that.
          float damp = smoothstep(0.40, 0.90, vTerr.x);
          float patch = smoothstep(0.50, 0.90, gCrsG);
          float speck = smoothstep(0.68, 0.97, gTri.b);
          float fade = 1.0 - smoothstep(${gf(g.height[0])}, ${gf(g.height[1])}, vWPos.y);
          float wash = patch * (0.20 + 0.80 * damp) * fade;
          float hot = patch * speck * fade;
          // Slow, and spatially phased: a field of colonies that all pulse
          // together is a strobe, not a forest.
          float pulse = 0.70 + 0.30 * sin(uGlowTime * ${gf(g.pulse ?? 0.9)}
                        + vWPos.x * 0.0041 + vWPos.z * 0.0029);
          // Two colonies, not one: a single hue over 9 km is a filter, and the
          // hue split is what makes the stalk field read as populated.
          vec3 gcol = mix(${gv3(g.color)}, ${gv3(g.color2 || g.color)},
                          smoothstep(0.32, 0.78, gTri.r));
          totalEmissiveRadiance += gcol * ((wash * 0.26 + hot * 1.25)
                                   * ${gf(g.amount ?? 1)} * pulse);
        }`;
}

export function terrainMaterial() {
  const rock = surfaceSet();
  // Ice is a dielectric that reflects its whole sky, so it takes far more of the
  // environment than rock and carries less normal relief. Leaving these at the
  // rock values is what made blue-tinted ice still light like sandstone.
  const glacial = DNA.surfaceKind === 'glacial';
  const glow = !!DNA.glow;
  const m = new THREE.MeshStandardMaterial({
    map: rock.map,
    normalMap: rock.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25).multiplyScalar(glacial ? 0.62 : 1),
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: glacial ? 1.35 : 0.62,
    vertexColors: true,
    dithering: true,
    // three only declares `emissive` and the emissive chunk when the material
    // carries a non-black one, so this is what makes the injection below legal.
    emissive: glow ? 0xffffff : 0x000000,
  });
  // ?terrdbg=sun|sky|cav flat-shades one baked field instead of the surface.
  // Always defined, never conditional: GLSL ES makes an undefined identifier in
  // an #if a compile error, not a zero.
  m.defines = { TERR_DBG: { sun: 1, sky: 2, cav: 3 }[new URLSearchParams(location.search).get('terrdbg')] || 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScale = { value: 0.112 };
    sh.uniforms.uGlowTime = { value: 0 };
    centrelineInto(sh);
    const hz = horizonField();
    sh.uniforms.uHorizA = { value: hz.a };
    sh.uniforms.uHorizB = { value: hz.b };
    sh.uniforms.uHorizCfg = { value: new THREE.Vector3(HORIZON.halfU, HORIZON.z0, HORIZON.zLen) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNrm;
        varying vec2 vTerr;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);
        vTerr = uv;`);          // .x = cavity, .y = sky visibility — see terrain.js

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNrm;
        varying vec2 vTerr;
        uniform float uScale;
        uniform float uGlowTime;
        ${GLSL_LITHOLOGY()}
        ${GLSL_CENTRELINE()}
        ${GLSL_HORIZON()}
        vec3 gBW; vec2 gUX, gUY, gUZ; vec4 gTri;
        vec3 gFaceUp;
        float gWet, gDetail, gSteep, gAO, gBedSlope, gBedK, gWpx, gDbg, gGrooveAcross, gCrsG;`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWNrm);
        // A softer blend exponent than the usual 6 — at 4 the three projections
        // overlap through the 45° band, which is where a hard blend leaves the
        // seam you can see running along every buttress edge.
        gBW = pow(abs(wn), vec3(4.0));
        gBW /= (gBW.x + gBW.y + gBW.z);
        gUX = vWPos.zy * uScale; gUY = vWPos.xz * uScale; gUZ = vWPos.xy * uScale;
        gTri = texture2D(map, gUX) * gBW.x + texture2D(map, gUY) * gBW.y + texture2D(map, gUZ) * gBW.z;

        // ── the band that survives distance ─────────────────────────────────
        // 9 m of detail is gone by 400 m. A second tile at 65 m is what still
        // reads as structure when the cliff is a kilometre away, and it costs
        // three taps.
        const float CRS = 0.137;
        vec4 crs = texture2D(map, gUX * CRS + 0.19) * gBW.x
                 + texture2D(map, gUY * CRS + 0.19) * gBW.y
                 + texture2D(map, gUZ * CRS + 0.19) * gBW.z;
        // …and a regional tap on a scale nothing in frame can repeat against,
        // so 65 m never beats against itself into a visible lattice.
        float reg = texture2D(map, vWPos.xz * uScale * 0.0197 + 0.61).r;
        crs.g = mix(crs.g, crs.g * (0.55 + reg * 0.95), 0.75);

        // World units covered by one pixel. This, not camera distance, is the
        // quantity every detail band has to be faded against: it collapses
        // range and grazing angle into the one number Nyquist actually cares
        // about, and it is exact for free.
        gWpx = max(fwidth(vWPos.x), max(fwidth(vWPos.y), fwidth(vWPos.z))) + 1e-4;
        gSteep = 1.0 - clamp(wn.y, 0.0, 1.0);
        float cav = vTerr.x;
        float sky = vTerr.y;

        // Which way a structural groove runs in the surface plane: 0 up the
        // face (bedding, foliation), 1 across it (columnar jointing).
        gGrooveAcross = 0.0;

        ${GLSL_STRUCTURE()}

        gDetail = (1.0 - smoothstep(0.22, 0.85, gWpx));
        gAO = mix(1.0, sky, 0.92) * mix(1.0, 0.70, gully * 0.7);
        gFaceUp = normalize(vec3(0.0, 1.0, 0.0) - wn * wn.y + vec3(1e-5, 0.0, 0.0));

        gCrsG = crs.g;
        diffuseColor *= vec4(rock, 1.0);
      `)
      // ?terrdbg=sun|sky|cav — flat-shade one of the three baked scalar fields.
      // These are the terms you cannot see in a finished frame because lighting,
      // fog and the grade are all sitting on top of them, and every one of them
      // is a field that goes subtly wrong in a way that reads as "the terrain
      // looks off" rather than as an identifiable bug.
      .replace('#include <opaque_fragment>', `
        #if TERR_DBG > 0
          gl_FragColor = vec4( vec3( gDbg ), 1.0 );
        #else
          #include <opaque_fragment>
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${GLSL_GLOW()}`)
      .replace('#include <roughnessmap_fragment>', `
        // Wet rock is glossy, scoured rims are matte-dusty, shale partings
        // catch a sheen the sandstone members do not.
        float roughnessFactor = roughness * mix(gTri.a, 0.14, gWet);
        roughnessFactor *= mix(1.06, 0.90, gBedK);
        roughnessFactor = min(1.0, roughnessFactor + smoothstep(0.54, 1.0, vTerr.x) * 0.10);
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 tnX = texture2D(normalMap, gUX).xyz * 2.0 - 1.0;
        vec3 tnY = texture2D(normalMap, gUY).xyz * 2.0 - 1.0;
        vec3 tnZ = texture2D(normalMap, gUZ).xyz * 2.0 - 1.0;
        // Second octave at 1.9 m, faded by pixel footprint rather than by range
        // so it survives a close cliff and dies on a grazing plateau.
        if (gDetail > 0.004) {
          float k = gDetail * 0.9;
          tnX.xy += (texture2D(normalMap, gUX * 4.7 + 0.31).xy * 2.0 - 1.0) * k;
          tnY.xy += (texture2D(normalMap, gUY * 4.7 + 0.31).xy * 2.0 - 1.0) * k;
          tnZ.xy += (texture2D(normalMap, gUZ * 4.7 + 0.31).xy * 2.0 - 1.0) * k;
        }
        // Vertical faces carry more relief than the silted floor does.
        vec2 nsc = normalScale * mix(0.50, 1.55, gSteep);
        tnX.xy *= nsc; tnY.xy *= nsc; tnZ.xy *= nsc;
        vec3 wnn = normalize(vWNrm);
        // whiteout blend — keeps detail through the 45° zones where UDN goes flat
        vec3 bX = vec3(tnX.xy + wnn.zy, abs(tnX.z) * wnn.x);
        vec3 bY = vec3(tnY.xy + wnn.xz, abs(tnY.z) * wnn.y);
        vec3 bZ = vec3(tnZ.xy + wnn.xy, abs(tnZ.z) * wnn.z);
        vec3 wNormal = normalize(bX.zyx * gBW.x + bY.xzy * gBW.y + bZ.xyz * gBW.z);
        // Bedding relief: each member weathers back to its own depth, so the
        // parting between two of them is a V-groove, not a painted line. This
        // is the term that makes strata catch the key light instead of just
        // tinting — a stripe you can only see in albedo reads as wallpaper.
        vec3 gDir = mix(gFaceUp, normalize(cross(wnn, gFaceUp) + vec3(0.0, 1e-5, 0.0)), gGrooveAcross);
        wNormal = normalize(wNormal + gDir * gBedSlope * 0.30 * smoothstep(0.20, 0.60, gSteep));
        normal = normalize((viewMatrix * vec4(wNormal, 0.0)).xyz);
      `)
      // ── terrain shadows ───────────────────────────────────────────────────
      // The key light is whichever directional light is brightest — the rig
      // adds sun, fill and rim in that order, but relying on the index would
      // make this break silently the day someone reorders them.
      //
      // Re-running RE_Direct for that one light and subtracting the occluded
      // fraction is the only way to shadow it without touching the fill and the
      // rim: those two exist precisely to keep a shadowed face from collapsing
      // to a single navy value, so scaling the whole directDiffuse would undo
      // the thing that makes shadows here read as air rather than as paint.
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        #if ( NUM_DIR_LIGHTS > 0 )
        {
          int keyI = 0;
          float keyB = -1.0;
          for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
            float b = dot( directionalLights[ i ].color, vec3( 0.2126, 0.7152, 0.0722 ) );
            if ( b > keyB ) { keyB = b; keyI = i; }
          }
          IncidentLight keyLight;
          getDirectionalLightInfo( directionalLights[ keyI ], keyLight );
          // directionalLights[].direction is view space; the horizon field is
          // indexed in world space, so rotate it back (w = 0 drops the
          // translation, and the row-vector product is the inverse rotation).
          vec3 sunW = normalize( ( vec4( keyLight.direction, 0.0 ) * viewMatrix ).xyz );
          float occ = 1.0 - sunHorizon( vWPos, sunW );
          #if TERR_DBG == 1
            gDbg = 1.0 - occ;
          #elif TERR_DBG == 2
            gDbg = vTerr.y;
          #elif TERR_DBG == 3
            gDbg = vTerr.x;
          #endif
          if ( occ > 0.002 ) {
            ReflectedLight keyRL = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
            RE_Direct( keyLight, geometryPosition, geometryNormal, geometryViewDir,
                       geometryClearcoatNormal, material, keyRL );
            reflectedLight.directDiffuse  -= keyRL.directDiffuse  * occ;
            reflectedLight.directSpecular -= keyRL.directSpecular * occ;
          }
        }
        #endif`)
      // Baked sky visibility, applied where a real AO map would be. Indirect
      // only — direct sun is unaffected, so a gorge floor goes dark and blue
      // while the rim above it keeps its warm key light.
      .replace('#include <aomap_fragment>', `
        reflectedLight.indirectDiffuse *= gAO;
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNVao = saturate( dot( geometryNormal, geometryViewDir ) );
          reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNVao, gAO, material.roughness );
        #endif
      `);
    m.userData.shader = sh;
  };
  return m;
}

/* ── water ────────────────────────────────────────────────────────────────── */

const rippleMap = () => cached('world.ripple', () => {
  const r = new RNG('world:ripple');
  const f = fbm2D(r, { octaves: 5, base: 6, gain: 0.55 });
  const g = ridged2D(r, { octaves: 4, base: 10, gain: 0.5 });
  const S = 256;
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    h[y * S + x] = f(u, v) * 0.7 + g(u * 1.0, v * 1.0) * 0.3;
  }
  return normalFrom(h, S, 1.5);
});

const foamMap = () => cached('world.foam', () => {
  const r = new RNG('world:foam');
  const f = fbm2D(r, { octaves: 5, base: 5, gain: 0.6 });
  const w = worley2D(r, 7);
  return bake(256, 256, (u, v, o) => {
    const k = Math.pow(f(u, v), 1.3) * 0.75 + (1 - w(u, v)) * 0.45;
    o[0] = o[1] = o[2] = Math.min(1, k); o[3] = 1;
  });
});

const GERSTNER = /* glsl */`
  // (dirX, dirZ, steepness, wavelength)
  // Nothing shorter than ~50 m: the surface mesh samples every 9–12 m, and a
  // wave the grid cannot resolve is not a wave, it is a stair pattern. The
  // chop below that scale is carried by the scrolling normal maps instead.
  const vec4 W0 = vec4( 0.94,  0.34, 0.085, 205.0);
  const vec4 W1 = vec4(-0.62,  0.78, 0.068, 113.0);
  const vec4 W2 = vec4( 0.31, -0.95, 0.050,  67.0);
  const vec4 W3 = vec4(-0.88, -0.47, 0.034,  51.0);

  vec3 gerstner(vec4 w, vec3 p, float t, float damp, inout vec3 tangent, inout vec3 binormal) {
    float k = 6.28318530718 / w.w;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(w.xy);
    float f = k * (dot(d, p.xz) - c * t);
    float st = w.z * damp;
    float a = st / k;
    tangent  += vec3(-d.x * d.x * (st * sin(f)), d.x * (st * cos(f)), -d.x * d.y * (st * sin(f)));
    binormal += vec3(-d.x * d.y * (st * sin(f)), d.y * (st * cos(f)), -d.y * d.y * (st * sin(f)));
    return vec3(d.x * (a * cos(f)), a * sin(f), d.y * (a * cos(f)));
  }
`;

/* ── the surface itself, shared by the river mesh and the open-ocean apron ──
   Six decorrelated reads of one tileable ripple tile, at 0.9 m through 190 m.
   Two rules run this:

   1. Bands fade on **pixel footprint**, not camera distance. wpx folds range
      and grazing angle into the one number Nyquist cares about, and at 200 m/s
      the grazing term dominates — water 40 m ahead covers more world per pixel
      than a cliff at 400 m.

   2. Amplitude lost to that fade is handed to roughness, not discarded: the
      sheen of a distant sea is unresolved chop integrated over the pixel.
      Without the hand-off the surface goes to glass.                         */
const GLSL_WATER_SURFACE = /* glsl */`
  // World size one pixel covers on the surface, in metres.
  float waterFootprint(vec3 wp) {
    return max(max(fwidth(wp.x), fwidth(wp.z)), fwidth(wp.y) * 0.35) + 1e-4;
  }

  // .xy  slope perturbation      .z  fraction of the chop that mipped away
  // .w   near-field glint mask (the band that only exists inside ~20 m)
  vec4 waterRipple(sampler2D nm, vec3 wp, float t, float wpx) {
    vec2 p = wp.xz;

    // repeat length → fade window. A band survives until its tile is roughly
    // three pixels across, which is where the mip chain has flattened it out.
    float k0 = 1.0 - smoothstep(0.11, 0.34, wpx);   // 0.9 m  glint
    float k1 = 1.0 - smoothstep(0.34, 1.05, wpx);   // 2.7 m
    float k2 = 1.0 - smoothstep(0.95, 3.10, wpx);   // 7.6 m
    float k3 = 1.0 - smoothstep(2.70, 9.00, wpx);   // 22 m
    float k4 = 1.0 - smoothstep(8.00, 27.0, wpx);   // 64 m
    float k5 = 1.0 - smoothstep(23.0, 78.0, wpx);   // 190 m

    vec2 n0 = texture2D(nm, p * (1.0 /   0.9) + vec2( 0.62,  0.29) * t + 0.11).xy * 2.0 - 1.0;
    vec2 n1 = texture2D(nm, p * (1.0 /   2.7) + vec2(-0.26,  0.33) * t + 0.43).xy * 2.0 - 1.0;
    vec2 n2 = texture2D(nm, p * (1.0 /   7.6) + vec2( 0.093,-0.126) * t + 0.77).xy * 2.0 - 1.0;
    vec2 n3 = texture2D(nm, p * (1.0 /  22.0) + vec2(-0.041,-0.022) * t + 0.19).xy * 2.0 - 1.0;
    vec2 n4 = texture2D(nm, p * (1.0 /  64.0) + vec2( 0.013, 0.010) * t + 0.58).xy * 2.0 - 1.0;
    vec2 n5 = texture2D(nm, p * (1.0 / 190.0) + vec2(-0.005, 0.004) * t + 0.92).xy * 2.0 - 1.0;

    const float A0 = 0.34, A1 = 0.52, A2 = 0.66, A3 = 0.78, A4 = 0.80, A5 = 0.62;
    const float ASUM = A0 + A1 + A2 + A3 + A4 + A5;

    vec2 slope = n0 * (A0 * k0) + n1 * (A1 * k1) + n2 * (A2 * k2)
               + n3 * (A3 * k3) + n4 * (A4 * k4) + n5 * (A5 * k5);

    float lost = (A0 * (1.0 - k0) + A1 * (1.0 - k1) + A2 * (1.0 - k2)
                + A3 * (1.0 - k3) + A4 * (1.0 - k4) + A5 * (1.0 - k5)) / ASUM;

    return vec4(slope, lost, k0);
  }

  /** Tilt a surface normal by a slope perturbation, without letting it fall
   *  below the horizon — a normal that does is a black speckle at 200 m/s. */
  vec3 waterNormal(vec3 base, vec2 slope, float amount) {
    vec3 n = base + vec3(slope.x, 0.0, slope.y) * amount;
    n.y = max(n.y, 0.34);
    return normalize(n);
  }
`;

/* ── planar reflection: sample and blend ──────────────────────────────────
   Injected at <lights_fragment_end> by *replacing the radiance*, not by
   overwriting reflectedLight.indirectSpecular. Radiance is the incoming light
   from the mirror direction and nothing else; three then puts it through the
   same split-sum BRDF as the probe would have got. Do it the other way and
   the Fresnel term has to be reproduced by hand, which is how planar
   reflections end up looking like a decal at normal incidence.

   alpha carries whether the mirrored ray hit anything. Where it did not — sky
   — the probe's value is kept, because a smooth sky probe is a perfectly good
   model of a smooth sky.                                                     */
const GLSL_WATER_REFLECT = /* glsl */`
  uniform sampler2D uReflTex;
  uniform mat4 uReflMat;
  uniform float uReflOn;

  vec4 planarReflection(vec4 clipUV, vec2 slope, float rough, float wpx) {
    // Distortion is a screen-space nudge along the slope. World +x maps to
    // screen right and world +z to screen up for a camera pointed down the
    // rail, which is the framing this game is played in; the error off-axis is
    // a wobble in a reflection that is already being smeared by ripples.
    vec2 d = vec2(slope.x, slope.y) * (0.030 + 0.10 * rough);
    // Long-range reads must not wander: a metre of lateral error at 2 km is a
    // whole cliff, and it strobes.
    d *= 1.0 - smoothstep(2.0, 22.0, wpx);
    clipUV.xy += d * clipUV.w;

    vec2 uv = clipUV.xy / max(clipUV.w, 1e-4);
    vec4 s = texture2DProj(uReflTex, clipUV);

    // off the edge of the mirror buffer, and behind it, fall back to the probe
    float edge = smoothstep(0.0, 0.035, uv.x) * smoothstep(1.0, 0.965, uv.x)
               * smoothstep(0.0, 0.035, uv.y) * smoothstep(1.0, 0.965, uv.y)
               * step(0.0, clipUV.w);
    return vec4(s.rgb, clamp(s.a, 0.0, 1.0) * edge * uReflOn);
  }
`;

export function waterMaterial(reflection = null) {
  // A mirror-smooth plane at a grazing angle reflects the horizon straight
  // into the camera and clips to white, so the shader roughens with footprint.
  // ior 1.333, not three's 1.5 default: water's F0 is 0.02, half the glass
  // value, and that alone decides whether the river out-shines the rock.
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.10,
    metalness: 0.0,
    ior: 1.333,
    envMapIntensity: 1.0,
    clearcoat: 0.0,
    dithering: true,
  });
  m.normalMap = rippleMap();
  m.defines = { WATER_REFL: reflection ? 1 : 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    centrelineInto(sh);
    sh.uniforms.uShore = { value: shoreField() };
    sh.uniforms.uShoreCfg = { value: new THREE.Vector3(SHORE.halfU, SHORE.z0, SHORE.zLen) };
    sh.uniforms.uFoamTex = { value: foamMap() };
    if (reflection) Object.assign(sh.uniforms, reflection.uniforms);

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        #if WATER_REFL
          uniform mat4 uReflMat;
          varying vec4 vRefl;
        #endif
        varying vec3 vWPos;
        varying vec3 vWNrm;
        varying float vWave;
        varying float vShallow;
        varying float vBed;
        ${GLSL_CENTRELINE()}
        ${GLSL_SHORE}
        ${GERSTNER}`)
      .replace('#include <beginnormal_vertex>', `
        vec3 _wp = (modelMatrix * vec4(position, 1.0)).xyz;
        vec2 _sh = shoreAt(_wp);
        // waves shoal: they shorten and flatten as the bed comes up
        float _damp = smoothstep(-1.0, 22.0, -_sh.x);
        vShallow = 1.0 - _damp;
        vBed = _sh.x;
        vec3 _tan = vec3(1.0, 0.0, 0.0);
        vec3 _bin = vec3(0.0, 0.0, 1.0);
        vec3 _off = vec3(0.0);
        _off += gerstner(W0, _wp, uTime, _damp, _tan, _bin);
        _off += gerstner(W1, _wp, uTime, _damp, _tan, _bin);
        _off += gerstner(W2, _wp, uTime, _damp * 0.8 + 0.2, _tan, _bin);
        _off += gerstner(W3, _wp, uTime, _damp * 0.6 + 0.4, _tan, _bin);
        vec3 objectNormal = normalize(cross(_bin, _tan));
        vWNrm = objectNormal;
        vWave = _off.y;
        #if WATER_REFL
          // Projected from the *undisplaced* point. The mirror is the plane,
          // not the swell riding on it; feeding the displaced position back in
          // doubles the wave into the reflection and it slides.
          vRefl = uReflMat * vec4(_wp, 1.0);
        #endif
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = position + _off;
        vWPos = _wp + _off;`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform sampler2D uFoamTex;
        varying vec3 vWPos;
        varying vec3 vWNrm;
        varying float vWave;
        varying float vShallow;
        varying float vBed;
        float gFoam, gWpx, gLost, gGlint, gSwash;
        vec2 gSlope;
        vec3 gWN;
        ${GLSL_CENTRELINE()}
        ${GLSL_SHORE}
        ${GLSL_WATER_SURFACE}
        #if WATER_REFL
          varying vec4 vRefl;
          ${GLSL_WATER_REFLECT}
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gWpx = waterFootprint(vWPos);
        vec4 _rip = waterRipple(normalMap, vWPos, uTime, gWpx);
        gSlope = _rip.xy;
        gLost  = _rip.z;
        gGlint = _rip.w;

        // ── how deep is the water under this bit of surface ────────────────
        // In metres, and measured to the *displaced* surface, so the waterline
        // advances and retreats with the swell instead of sitting on a ruled
        // contour.
        float bed = vBed;
        float d = max(0.0, vWave - bed);

        // ── colour ────────────────────────────────────────────────────────
        // Absorption: red gone by 4 m, green by 20, blue survives. A Beer
        // curve rather than a lerp, so the jade over sand bars falls out.
        vec3 shallow = vec3(0.155, 0.360, 0.352);
        vec3 sea     = vec3(0.0060, 0.0330, 0.0740);
        vec3 col = mix(shallow, sea, 1.0 - exp(-d * 0.135));
        // the bed itself shows through the first couple of metres
        float bedShow = exp(-d * 0.55);
        col = mix(col, vec3(0.250, 0.216, 0.156), bedShow * 0.85);

        // ── shoreline ─────────────────────────────────────────────────────
        // Three separate things, because one foam term always reads as paint:
        //   swash  the bright edge where the sheet of water runs up the sand
        //   surf   the wider broken band behind it, torn up by the texture
        //   crest  whitecaps offshore, where the swell steepens
        float ftA = texture2D(uFoamTex, vWPos.xz * 0.055 + vec2(uTime * 0.004, 0.0)).r;
        float ftB = texture2D(uFoamTex, vWPos.xz * 0.0125 - vec2(0.0, uTime * 0.0026)).r;
        float ft = clamp(ftA * 1.35 + ftB * 0.75 - 0.28, 0.0, 1.6);

        // the run-up: a travelling wave along the shore, not a static ring
        float run = sin(bed * 0.42 - uTime * 0.85
                      + texture2D(uFoamTex, vWPos.xz * 0.004).r * 6.0) * 0.5 + 0.5;
        float swash = (1.0 - smoothstep(0.0, 1.4 + 1.6 * run, d)) * (0.55 + 0.60 * ft);
        float surf  = (1.0 - smoothstep(0.6, 7.5, d)) * ft * (0.30 + 0.55 * run);
        // whitecaps: the top of a steep wave, and only where it is steep
        float steep = smoothstep(0.35, 1.0, length(gSlope) * 0.55 + vWave * 0.16);
        float crest = smoothstep(0.55, 1.0, steep) * ft * 0.55;

        gSwash = clamp(swash, 0.0, 1.0);
        gFoam = clamp(swash * 1.15 + surf + crest, 0.0, 1.0);

        // Wet backwash: the strip just seaward of the foam is darker than
        // either, because it is a thin sheet over wet sand. Without it the
        // foam has no edge to be an edge of.
        col *= mix(1.0, 0.72, (1.0 - smoothstep(0.4, 3.2, d)) * (1.0 - gFoam));

        diffuseColor.rgb *= mix(col, vec3(0.86, 0.92, 0.97), gFoam);
      `)
      .replace('#include <roughnessmap_fragment>', `
        // Chop the pixel can no longer resolve, handed to roughness — see the
        // note on GLSL_WATER_SURFACE. Foam is matte; the shoaling shallows are
        // choppier than the open channel.
        float roughnessFactor = mix(roughness, 0.36, pow(gLost, 0.80));
        roughnessFactor = mix(roughnessFactor, 0.82, gFoam);
        roughnessFactor += vShallow * 0.05;
      `)
      .replace('#include <normal_fragment_maps>', `
        gWN = waterNormal(normalize(vWNrm), gSlope, 0.62 * (1.0 - 0.55 * gFoam));
        normal = normalize((viewMatrix * vec4(gWN, 0.0)).xyz);
      `)
      .replace('#include <lights_fragment_end>', `
        #if WATER_REFL
        {
          vec4 pr = planarReflection(vRefl, gSlope, material.roughness, gWpx);
          radiance = mix(radiance, pr.rgb, pr.a);
        }
        #endif
        #include <lights_fragment_end>
        // Sun glitter. The specular lobe alone gives one smooth path down the
        // sun; real water breaks that path into flecks because each facet
        // inside the pixel is at its own angle. The 0.9 m band is the only one
        // that still exists close in, so it is the one that gets to do it.
        {
          float g = gGlint * (1.0 - gFoam);
          if (g > 0.002) {
            float f = abs(gSlope.x) + abs(gSlope.y);
            reflectedLight.directSpecular *= 1.0 + g * smoothstep(0.30, 1.30, f) * 2.6;
          }
        }
      `);
    m.userData.shader = sh;
  };
  return m;
}

/**
 * The apron under everything — open ocean out to the horizon. Same surface
 * model as the river, minus the shore lookup and the displacement: it is one
 * 42 km disc with 72 segments, so there is nothing to displace.
 *
 * Depth-sorts under the river mesh — see the clearance note in water.js.
 */
export function deepWaterMaterial(reflection = null) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.11,
    metalness: 0.0,
    ior: 1.333,
    envMapIntensity: 1.0,
    dithering: true,
  });
  m.normalMap = rippleMap();
  m.defines = { WATER_REFL: reflection ? 1 : 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    if (reflection) Object.assign(sh.uniforms, reflection.uniforms);

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        #if WATER_REFL
          uniform mat4 uReflMat;
          varying vec4 vRefl;
        #endif
        varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #if WATER_REFL
          // Projected at the plane, not at the apron's own depth: the apron is
          // only ever seen a kilometre out, where the parallax between the two
          // is a fraction of a pixel.
          vRefl = uReflMat * vec4(vWPos.x, 0.0, vWPos.z, 1.0);
        #endif`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vWPos;
        float gWpx, gLost, gGlint;
        vec2 gSlope;
        ${GLSL_WATER_SURFACE}
        #if WATER_REFL
          varying vec4 vRefl;
          ${GLSL_WATER_REFLECT}
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gWpx = waterFootprint(vWPos);
        vec4 _rip = waterRipple(normalMap, vWPos, uTime, gWpx);
        gSlope = _rip.xy; gLost = _rip.z; gGlint = _rip.w;
        diffuseColor.rgb *= vec3(0.0060, 0.0330, 0.0740);
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = mix(roughness, 0.36, pow(gLost, 0.80));
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 wN = waterNormal(vec3(0.0, 1.0, 0.0), gSlope, 0.62);
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
      `)
      .replace('#include <lights_fragment_end>', `
        #if WATER_REFL
        {
          vec4 pr = planarReflection(vRefl, gSlope, material.roughness, gWpx);
          radiance = mix(radiance, pr.rgb, pr.a);
        }
        #endif
        #include <lights_fragment_end>
        {
          float g = gGlint;
          if (g > 0.002) {
            float f = abs(gSlope.x) + abs(gSlope.y);
            reflectedLight.directSpecular *= 1.0 + g * smoothstep(0.30, 1.30, f) * 2.6;
          }
        }
      `);
    m.userData.shader = sh;
  };
  return m;
}

/* ── ice ──────────────────────────────────────────────────────────────────── */
//
// The frozen channel runs on the same mesh as the river, and the same planar
// reflector, but nothing else survives the freeze: no Gerstner displacement, no
// shoaling, no shore lookup, no foam. What replaces them is a crack field.
//
// The whole read is silhouette-free — a flat plane at y = 0 — so it has to come
// from three things at once, all of which are in the tile below: the pressure
// cracks that catch a highlight along their lip, the milky lenses where
// refrozen meltwater scatters, and a roughness that goes from near-mirror on
// clear ice to matte on the frosted patches. One of the three alone reads as a
// dirty mirror.

const iceSet = () => cached('world.ice2', () => {
  const r = new RNG('world:ice2');
  const macro = ridged2D(r, { octaves: 4, base: 4, gain: 0.52 });   // pressure cracks
  const micro = ridged2D(r, { octaves: 3, base: 15, gain: 0.50 });  // craze
  const frost = fbm2D(r, { octaves: 4, base: 28, gain: 0.56 });     // wind-blown grain
  const lens = fbm2D(r, { octaves: 3, base: 3, gain: 0.60 });       // refrozen patches
  const S = 512;

  // Cracks are thin: a 6th power on a ridged field leaves a line a few texels
  // wide instead of a broad crease, which is the difference between ice and
  // crumpled paper.
  const crackAt = (u, v) => Math.pow(macro(u, v), 6) * 0.9 + Math.pow(micro(u, v), 8) * 0.55;

  const { height, map } = bakeHeightAndMap(S, (u, v, o) => {
    // The height wants the raw sum, the map wants it clamped — same sample.
    const ca = crackAt(u, v);
    const c = clamp01(ca);
    const f = frost(u, v);
    const l = clamp01(lens(u, v) * 1.3 - 0.15);
    o[0] = c;                                  // crack mask
    o[1] = clamp01(0.30 + f * 0.70);           // frost grain
    o[2] = l;                                  // milky lens
    o[3] = clamp01(0.06 + f * 0.34 + l * 0.42 + c * 0.20);  // roughness
    return -ca * 0.85 + f * 0.10;
  }, { srgb: false });
  return { map, normalMap: normalFrom(height, S, 3.2) };
});

/**
 * A frozen surface for `DNA.surface === 'ice'`. Shares the mesh, the reflector
 * and the material contract of `waterMaterial` — `userData.shader.uniforms
 * .uTime` exists so Corneria can drive it with the same clock — but the plane
 * does not move, so the clock only scrolls the wind-driven frost.
 */
export function iceMaterial(reflection = null) {
  const set = iceSet();
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.14,
    metalness: 0.0,
    ior: 1.31,
    // Ice is a dielectric over a scattering interior: the coat carries the
    // specular, the base carries the light that came back out.
    clearcoat: 0.55,
    clearcoatRoughness: 0.20,
    envMapIntensity: 1.0,
    dithering: true,
  });
  m.normalMap = set.normalMap;
  m.defines = { WATER_REFL: reflection ? 1 : 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uIce = { value: set.map };
    if (reflection) Object.assign(sh.uniforms, reflection.uniforms);

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        #if WATER_REFL
          uniform mat4 uReflMat;
          varying vec4 vRefl;
        #endif
        varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #if WATER_REFL
          vRefl = uReflMat * vec4(vWPos.x, 0.0, vWPos.z, 1.0);
        #endif`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform sampler2D uIce;
        varying vec3 vWPos;
        vec4 gIce; float gWpx, gCrack, gFrost;
        #if WATER_REFL
          varying vec4 vRefl;
          ${GLSL_WATER_REFLECT}
        #endif
        // Three tiles at incommensurate sizes. Each fades on pixel footprint,
        // not distance, and what it loses goes to roughness — an unresolved
        // crack field is a sheen, not a mirror.
        vec4 iceTaps(vec2 p, float wpx, out float crack) {
          float k0 = 1.0 - smoothstep(0.35, 1.20, wpx);    //  2.6 m
          float k1 = 1.0 - smoothstep(1.40, 5.00, wpx);    // 11 m
          float k2 = 1.0 - smoothstep(6.00, 22.0, wpx);    // 47 m
          vec4 t0 = texture2D(uIce, p * (1.0 /  2.6) + 0.13);
          vec4 t1 = texture2D(uIce, p * (1.0 / 11.0) + 0.57);
          vec4 t2 = texture2D(uIce, p * (1.0 / 47.0) + 0.81);
          crack = t0.r * k0 * 0.55 + t1.r * k1 * 0.80 + t2.r * k2;
          return t0 * k0 * 0.30 + t1 * k1 * 0.45 + t2 * 0.55;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gWpx = max(max(fwidth(vWPos.x), fwidth(vWPos.z)), fwidth(vWPos.y) * 0.35) + 1e-4;
        gIce = iceTaps(vWPos.xz, gWpx, gCrack);
        gFrost = gIce.g;

        // Clear ice over dark water is nearly black in albedo and lives on its
        // reflection; snow-ice is the opposite. The lens channel is what moves
        // between them, so the sheet reads as areas rather than as a texture.
        vec3 clearIce = vec3(0.052, 0.088, 0.118);
        vec3 snowIce  = vec3(0.640, 0.700, 0.760);
        vec3 col = mix(clearIce, snowIce, clamp(gIce.b * 1.8 + gFrost * 0.55, 0.0, 1.0));
        // A crack is a fracture face seen edge-on: it scatters, so it is the
        // brightest thing on clear ice and invisible on snow.
        col = mix(col, vec3(0.780, 0.840, 0.890), clamp(gCrack * 1.4, 0.0, 0.85));
        // Wind scour: long streaks across the channel, one metre of drift deep.
        float drift = texture2D(uIce, vWPos.xz * vec2(1.0 / 90.0, 1.0 / 14.0)
                                + vec2(uTime * 0.0016, 0.0)).g;
        col *= 0.82 + drift * 0.42;

        diffuseColor.rgb *= col;
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = clamp(gIce.a * 1.6 + gFrost * 0.22, 0.04, 0.95);
        // Everything the pixel can no longer resolve becomes gloss loss.
        roughnessFactor = mix(roughnessFactor, 0.30, smoothstep(2.0, 20.0, gWpx));
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 n0 = texture2D(normalMap, vWPos.xz * (1.0 /  2.6) + 0.13).xyz * 2.0 - 1.0;
        vec3 n1 = texture2D(normalMap, vWPos.xz * (1.0 / 11.0) + 0.57).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vWPos.xz * (1.0 / 47.0) + 0.81).xyz * 2.0 - 1.0;
        float f0 = 1.0 - smoothstep(0.35, 1.20, gWpx);
        float f1 = 1.0 - smoothstep(1.40, 5.00, gWpx);
        vec2 sl = (n0.xy * f0 * 0.9 + n1.xy * f1 * 0.7 + n2.xy * 0.5) * normalScale;
        // A normal below the horizon on a flat plane is a black speckle at
        // 200 m/s, exactly as on water.
        vec3 wN = normalize(vec3(sl.x, max(1.0 - length(sl) * 0.35, 0.40), sl.y));
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
      `)
      // The coat is the polished top of the sheet and stays flat; the cracks
      // live in the base normal above. three declares clearcoatNormal after
      // <normal_fragment_maps>, so it cannot be written from there anyway.
      .replace('#include <clearcoat_normal_fragment_begin>',
        `vec3 clearcoatNormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`)
      .replace('#include <lights_fragment_end>', `
        #if WATER_REFL
        {
          vec4 pr = planarReflection(vRefl, gIce.rg * 2.0 - 1.0, material.roughness, gWpx);
          radiance = mix(radiance, pr.rgb, pr.a);
        }
        #endif
        #include <lights_fragment_end>`);
    m.userData.shader = sh;
  };
  return m;
}

/* ── lava ─────────────────────────────────────────────────────────────────── */

const lavaSet = () => cached('world.lava', () => {
  const r = new RNG('world:lava');
  const veins = ridged2D(r, { octaves: 4, base: 5, gain: 0.55 });    // the network
  const fine = ridged2D(r, { octaves: 3, base: 17, gain: 0.50 });    // craze inside a plate
  const grain = fbm2D(r, { octaves: 5, base: 26, gain: 0.55 });      // crust texture
  const plate = fbm2D(r, { octaves: 3, base: 3, gain: 0.62 });       // raft blotch
  const S = 512;
  const { height, map } = bakeHeightAndMap(S, (u, v, o) => {
    // A power on a ridged field leaves a LINE rather than a crease — the same
    // trick the ice cracks use. The ice powers (6 and 8) are far too high here:
    // measured off the first capture, the network baked to a mean near 0.1, the
    // shader's bias then took most of that, and the channel emitted 0.13 linear
    // against an exposure of 0.34. A crack has to be a light, not a stain.
    const vn = Math.pow(veins(u, v), 2.2);
    const fn = Math.pow(fine(u, v), 3.5);
    const g = grain(u, v);
    const pl = clamp01(plate(u, v) * 1.25 - 0.12);
    o[0] = clamp01(vn * 1.60 + fn * 0.70);          // molten network
    o[1] = clamp01(0.25 + g * 0.75);                // crust grain
    o[2] = pl;                                      // raft mask
    o[3] = clamp01(0.54 + g * 0.42 - vn * 0.42);    // roughness
    return -(vn * 0.90 + fn * 0.34) + g * 0.14 + pl * 0.26;
  }, { srgb: false });
  return { map, normalMap: normalFrom(height, S, 2.6) };
});

/**
 * A molten surface for `DNA.surface === 'lava'`. Same contract as
 * `waterMaterial` and `iceMaterial` — one mesh, `userData.shader.uniforms.uTime`
 * driven by the world clock — and one thing neither of them is: a light source.
 * The emissive term is the key light for the whole level, so its radiance is
 * authored in linear units well above 1 and the preset's exposure is set
 * against it rather than against a sun.
 *
 * No reflector. A crusted channel is 4% specular black with a few per cent of
 * its area molten, and a planar mirror across it buys nothing but a pass.
 */
export function lavaMaterial() {
  const set = lavaSet();
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
    dithering: true,
  });
  m.normalMap = set.normalMap;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uLava = { value: set.map };
    centrelineInto(sh);
    sh.uniforms.uShore = { value: shoreField() };
    sh.uniforms.uShoreCfg = { value: new THREE.Vector3(SHORE.halfU, SHORE.z0, SHORE.zLen) };

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform sampler2D uLava;
        varying vec3 vWPos;
        ${GLSL_CENTRELINE()}
        ${GLSL_SHORE}
        float gWpx, gMolten, gCrust, gRough;
        // Three tiles at incommensurate sizes, each on its own drift rate. The
        // differential is the shear a channel actually has across its width;
        // one scroll rate reads as a texture sliding under a static surface.
        void lavaTaps(vec2 p, float wpx, float t) {
          float k0 = 1.0 - smoothstep(0.60, 2.20, wpx);   //  7 m
          float k1 = 1.0 - smoothstep(2.20, 8.00, wpx);   // 27 m
          float k2 = 1.0 - smoothstep(7.00, 26.0, wpx);   // 94 m
          vec4 t0 = texture2D(uLava, p * (1.0 /  7.0) + vec2(0.03, -0.148) * t + 0.17);
          vec4 t1 = texture2D(uLava, p * (1.0 / 27.0) + vec2(-0.011, -0.063) * t + 0.51);
          vec4 t2 = texture2D(uLava, p * (1.0 / 94.0) + vec2(0.004, -0.021) * t + 0.83);
          gMolten = t0.r * k0 * 0.42 + t1.r * k1 * 0.72 + t2.r * 0.90;
          gCrust  = t0.g * k0 * 0.30 + t1.g * k1 * 0.40 + t2.g * 0.62;
          gRough  = t0.a * k0 * 0.30 + t1.a * k1 * 0.36 + t2.a * 0.60;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        gWpx = max(fwidth(vWPos.x), fwidth(vWPos.z)) + 1e-4;
        lavaTaps(vWPos.xz, gWpx, uTime);

        // Crust thickens toward the bank, because that is where the channel is
        // slow and shallow. The shore field already answers exactly that, in
        // rail space, and it is baked for every natural world.
        float shallow = shoreAt(vWPos).y;
        float molten = clamp(gMolten * 1.35 - 0.05, 0.0, 1.0);
        molten *= 1.0 - shallow * 0.55;
        // A channel is never fully crusted over mid-stream. Without a floor the
        // rafts join up and the river reads as a wet road.
        molten = max(molten, (1.0 - shallow) * 0.16);
        // A surge every few seconds along the channel, so the glow is not a
        // still image with a scrolling texture over it.
        float surge = 0.78 + 0.34 * sin(vWPos.z * 0.0031 - uTime * 0.62)
                            * (0.5 + 0.5 * sin(vWPos.x * 0.0047 + uTime * 0.31));
        molten = clamp(molten * surge, 0.0, 1.0);

        vec3 crust = mix(vec3(0.016, 0.014, 0.013), vec3(0.070, 0.062, 0.058), gCrust);
        // Silvered pahoehoe skin on the rafts: the one non-black value on a
        // cooled surface, and what stops the un-lit area reading as a hole.
        crust = mix(crust, vec3(0.118, 0.108, 0.104), smoothstep(0.55, 0.95, gCrust) * 0.6);
        diffuseColor.rgb *= crust;
      `)
      .replace('#include <emissivemap_fragment>', `
        // Linear radiance, not a colour: the hot end is ~5x white and it is the
        // key light in every frame of this level.
        vec3 dull = vec3(1.60, 0.26, 0.030);
        vec3 hot  = vec3(7.40, 2.90, 0.640);
        float h = smoothstep(0.18, 0.88, molten);
        // Linear in the mask, not squared. Squared crushed a typical 0.3 crack
        // to 0.09 of its radiance and the channel came out the colour of wet
        // clay; the crust is already black, so the contrast does not need help.
        totalEmissiveRadiance = mix(dull, hot, h) * molten;
      `)
      .replace('#include <roughnessmap_fragment>', `
        // Molten rock is a smooth liquid; crust is rubble. Below the resolvable
        // band everything converges on the crust value rather than on a mirror.
        float roughnessFactor = mix(clamp(gRough, 0.30, 0.98), 0.16, molten);
        roughnessFactor = mix(roughnessFactor, 0.72, smoothstep(4.0, 26.0, gWpx));
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 n0 = texture2D(normalMap, vWPos.xz * (1.0 /  7.0) + vec2(0.03, -0.148) * uTime + 0.17).xyz * 2.0 - 1.0;
        vec3 n1 = texture2D(normalMap, vWPos.xz * (1.0 / 27.0) + vec2(-0.011, -0.063) * uTime + 0.51).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vWPos.xz * (1.0 / 94.0) + vec2(0.004, -0.021) * uTime + 0.83).xyz * 2.0 - 1.0;
        float f0 = 1.0 - smoothstep(0.60, 2.20, gWpx);
        float f1 = 1.0 - smoothstep(2.20, 8.00, gWpx);
        vec2 sl = (n0.xy * f0 * 0.9 + n1.xy * f1 * 0.8 + n2.xy * 0.6) * normalScale;
        // The crack floors are liquid and flat; only the crust carries relief.
        sl *= 1.0 - molten * 0.7;
        vec3 wN = normalize(vec3(sl.x, max(1.0 - length(sl) * 0.30, 0.42), sl.y));
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
      `);
    m.userData.shader = sh;
  };
  return m;
}

/* ── the canopy ───────────────────────────────────────────────────────────── */

const causticSet = () => cached('world.caustic', () => {
  const r = new RNG('world:caustic');
  const a = ridged2D(r, { octaves: 3, base: 6, gain: 0.52 });
  const b = ridged2D(r, { octaves: 3, base: 11, gain: 0.48 });
  const swell = fbm2D(r, { octaves: 3, base: 3, gain: 0.60 });
  const S = 512;
  return {
    map: bake(S, S, (u, v, o) => {
      // Caustics are the CUSPS of a wave-refracted beam sheet, so what they are
      // is the top few per cent of two crossed ridged fields — powered hard,
      // because anything gentler is a cloud pattern rather than a light net.
      const c = Math.pow(a(u, v), 6.0) * 1.05 + Math.pow(b(u + 0.31, v + 0.17), 7.0) * 0.80;
      o[0] = clamp01(c * 1.9);
      o[1] = clamp01(swell(u, v));
      o[2] = clamp01(Math.pow(a(u * 0.5 + 0.6, v * 0.5 + 0.2), 3.0));
      o[3] = 1;
    }, { srgb: false }),
  };
});

/**
 * The underside of a sea surface, for `DNA.canopy`. Unlit on purpose: what you
 * see looking up from 300 m down is transmitted daylight and total internal
 * reflection, and neither is a BRDF response to the scene's lights.
 *
 * The whole read is the angle to vertical. Straight up is Snell's window — the
 * sky punched through a rippling lens. Toward the horizontal the surface goes
 * past the critical angle and mirrors the murk below it, which is why the lid
 * darkens to the fog colour long before the fog itself would have taken it.
 *
 * `fog: true` matters: the atmosphere chunks are patched globally, so this
 * inherits the same extinction as every other surface and the lid recedes into
 * the same water the terrain does.
 */
export function seaCeilingMaterial({ tint = [0.20, 0.62, 0.66], sunTint = [1.30, 1.80, 1.72] } = {}) {
  const set = causticSet();
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, fog: true, side: THREE.DoubleSide, toneMapped: true, dithering: true,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uCaustic = { value: set.map };
    sh.uniforms.uSunDir = { value: new THREE.Vector3(0, 1, 0) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform sampler2D uCaustic;
        uniform vec3 uSunDir;
        varying vec3 vWPos;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 toFrag = vWPos - cameraPosition;
        float dist = length(toFrag) + 1e-4;
        // 1 looking straight up at the lid, 0 at the grazing angle where it
        // stops being a window and becomes a mirror.
        float up = clamp(toFrag.y / dist, 0.0, 1.0);
        // 2.4, not 1.45: at the grazing angles that fill the top of a forward
        // shot the lid has to be past the critical angle and dark, or it is a
        // white band across the whole frame instead of a surface receding.
        float window = pow(up, 2.4);

        // Two crossed sheets drifting at different rates: one swell period is a
        // repeating pattern, two is a moving one.
        vec2 p = vWPos.xz;
        float wpx = max(fwidth(vWPos.x), fwidth(vWPos.z)) + 1e-4;
        float k0 = 1.0 - smoothstep(2.0, 9.0, wpx);
        float k1 = 1.0 - smoothstep(7.0, 30.0, wpx);
        float c0 = texture2D(uCaustic, p * (1.0 / 26.0) + vec2(0.0031, 0.0019) * uTime).r;
        float c1 = texture2D(uCaustic, p * (1.0 / 61.0) - vec2(0.0017, 0.0026) * uTime).r;
        float c2 = texture2D(uCaustic, p * (1.0 / 210.0) + vec2(0.0006, 0.0004) * uTime).b;
        float caustic = c0 * k0 * 0.85 + c1 * k1 * 0.70 + c2 * 0.55;

        vec3 base = ${gv3(tint)};
        vec3 bright = ${gv3(sunTint)};
        // The sun's own patch: the surface directly between the camera and the
        // sun is the one part of the lid that is a source rather than a tint.
        float sunPatch = pow(clamp(dot(normalize(toFrag), uSunDir), 0.0, 1.0), 7.0);
        vec3 col = mix(base * 0.22, base, window);
        // The cusps are a light source, not a tint: they run well past 1 so the
        // bloom pass and the god-ray threshold both find them, which is what
        // turns the lid from a textured ceiling into the thing throwing shafts.
        col += bright * (caustic * caustic * (0.16 + window * 1.35) + sunPatch * 2.2);
        diffuseColor.rgb *= col;
      `);
    m.userData.shader = sh;
  };
  return m;
}

/* ── concrete, city, metal ────────────────────────────────────────────────── */

/**
 * Free-standing rock — arches, stacks, boulders. Shares the terrain's texture
 * set and its lithology, so a natural arch springing from a canyon wall is made
 * of the same stone as the wall, banded on the same 14 m rhythm.
 */
const concreteSet = () => cached('world.concrete', () => {
  const r = new RNG('world:concrete');
  const grain = fbm2D(r, { octaves: 5, base: 24, gain: 0.55 });
  const stain = fbm2D(r, { octaves: 4, base: 3, gain: 0.62 });
  const S = 512;
  const joint = (u, v) => {
    const a = Math.abs(((u * 4) % 1) - 0.5) * 2;
    const b = Math.abs(((v * 6) % 1) - 0.5) * 2;
    return Math.pow(Math.max(0, Math.max(a, b) - 0.94) / 0.06, 1.4);
  };
  const { height, map } = bakeHeightAndMap(S, (u, v, o) => {
    const j = joint(u, v), g = grain(u, v), s = stain(u, v);
    const k = (0.60 + g * 0.16) * (1 - j * 0.42) * (0.82 + s * 0.30);
    o[0] = k * 1.00; o[1] = k * 0.985; o[2] = k * 0.94;
    o[3] = Math.min(1, 0.62 + g * 0.20 + j * 0.16 + s * 0.10);
    return -j * 0.6 + g * 0.14;
  }, { srgb: true });
  return { map, normalMap: normalFrom(height, S, 2.2) };
});

/** Concrete for dams, bridges, decks and retaining walls. */
export function concreteMaterial({ color = 0xb9b6ad, scale = 0.055 } = {}) {
  const set = concreteSet();
  const m = new THREE.MeshStandardMaterial({
    color, map: set.map, normalMap: set.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1.0, metalness: 0.0, envMapIntensity: 0.7,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm; uniform float uScale; vec4 gC;`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWNrm);
        vec3 bw = pow(abs(wn), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
        gC = texture2D(map, vWPos.zy * uScale) * bw.x
           + texture2D(map, vWPos.xz * uScale) * bw.y
           + texture2D(map, vWPos.xy * uScale) * bw.z;
        // weathering streaks running down vertical faces
        float streak = texture2D(map, vec2(vWPos.x * 0.03 + vWPos.z * 0.03, vWPos.y * 0.0035)).g;
        float down = smoothstep(0.55, 0.05, wn.y);
        diffuseColor.rgb *= gC.rgb * mix(1.0, 0.62 + streak * 0.55, down * 0.75);
      `)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * gC.a;`);
    return m;
  };
  return m;
}

/**
 * City façades. Windows are generated in the fragment shader from world-space
 * position, so a 40 m tower and a 200 m tower get the same 3.6 m floor pitch no
 * matter how the instance is scaled — and they are anti-aliased with fwidth, or
 * they would boil into moiré the moment the camera moves.
 */
export function cityMaterial({ tint = 0xc8c6be, glass = 0x1b2a36, litColor = 0xffd9a0, lit = 0.16 } = {}) {
  const set = concreteSet();
  const m = new THREE.MeshStandardMaterial({
    color: tint, map: set.map, normalMap: set.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 1.0, metalness: 0.0, envMapIntensity: 0.85,
    emissive: new THREE.Color(litColor), emissiveIntensity: 1.0,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlass = { value: new THREE.Color(glass) };
    sh.uniforms.uLit = { value: lit };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm;
        uniform vec3 uGlass; uniform float uLit;
        float gPane, gLit, gSpandrel;
        float h21(vec2 p){ p = fract(p * vec2(127.1, 311.7)); float n = dot(p, p + 34.5); return fract(sin(n * 43758.5453) * 43758.5); }`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWNrm);
        float up = abs(wn.y);
        // pick the façade plane: X-facing walls read Z, Z-facing walls read X
        float useZ = step(abs(wn.x), abs(wn.z));
        vec2 fuv = vec2(mix(vWPos.z, vWPos.x, useZ), vWPos.y);
        vec2 cellSize = vec2(4.4, 3.65);
        vec2 g = fuv / cellSize;
        vec2 cell = floor(g);
        vec2 f = fract(g);
        vec2 aa = fwidth(g) * 1.2 + 0.002;
        vec2 lo = vec2(0.16, 0.20), hi = vec2(0.86, 0.80);
        vec2 win = smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
        gPane = win.x * win.y * (1.0 - smoothstep(0.55, 0.95, up));

        float rnd = h21(cell + floor(vWPos.xz * 0.011) * 17.0);
        gLit = step(1.0 - uLit, rnd) * gPane;
        gSpandrel = (1.0 - gPane) * (1.0 - smoothstep(0.55, 0.95, up));

        vec3 bw = pow(abs(wn), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
        vec4 c = texture2D(map, vWPos.zy * 0.09) * bw.x
               + texture2D(map, vWPos.xz * 0.09) * bw.y
               + texture2D(map, vWPos.xy * 0.09) * bw.z;
        float band = 0.82 + 0.30 * h21(vec2(cell.y, floor(vWPos.x * 0.006)));
        vec3 wall = diffuse * c.rgb * mix(1.0, band, gSpandrel * 0.6);
        diffuseColor.rgb = mix(wall, uGlass * (0.7 + rnd * 0.6), gPane);
        diffuseColor.rgb *= (0.55 + 0.45 * smoothstep(-40.0, 90.0, vWPos.y));  // grime at the base
      `)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.88, 0.10, gPane);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = gPane * 0.35;`)
      .replace('#include <emissivemap_fragment>', `totalEmissiveRadiance *= gLit * 1.6;`);
    m.userData.shader = sh;
  };
  return m;
}

/** Painted structural steel — bridge trusses, gantries, pylons. */
export function steelMaterial(color = 0x8d3a32) {
  const set = concreteSet();
  return new THREE.MeshStandardMaterial({
    color, map: set.map, normalMap: set.normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.52, metalness: 0.72, envMapIntensity: 1.0,
  });
}

/**
 * `bedded` is the difference between a prop cut from a canyon wall and a body
 * that was never on a planet. A bedded prop keys its lithology to world Y so an
 * arch springing from a wall is the same sequence as the wall; an unbedded one
 * has no up, so Y-banding gives it two stripes and reads as wood grain, and the
 * waterline term darkens whatever happens to be near y = 0 for no reason.
 */
export function rockPropMaterial({ scale = 0.112, tint = 0xffffff, bedded = true, env = 0.6 } = {}) {
  const rock = rockSet();
  const m = new THREE.MeshStandardMaterial({
    color: tint, map: rock.map, normalMap: rock.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 1.0, metalness: 0.0, envMapIntensity: env,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm; uniform float uScale;
        ${GLSL_LITHOLOGY()}
        vec3 pBW; vec2 pUX, pUY, pUZ; vec4 pTri; float pWet;`)
      .replace('#include <map_fragment>', `
        vec3 pwn = normalize(vWNrm);
        pBW = pow(abs(pwn), vec3(4.0)); pBW /= (pBW.x + pBW.y + pBW.z);
        pUX = vWPos.zy * uScale; pUY = vWPos.xz * uScale; pUZ = vWPos.xy * uScale;
        pTri = texture2D(map, pUX) * pBW.x + texture2D(map, pUY) * pBW.y + texture2D(map, pUZ) * pBW.z;
        vec4 pCrs = texture2D(map, pUX * 0.137 + 0.19) * pBW.x
                  + texture2D(map, pUY * 0.137 + 0.19) * pBW.y
                  + texture2D(map, pUZ * 0.137 + 0.19) * pBW.z;
        float pWpx = max(fwidth(vWPos.x), max(fwidth(vWPos.y), fwidth(vWPos.z))) + 1e-4;
        float pFade = 1.0 - smoothstep(1.4, 4.8, pWpx);
        ${bedded ? `
        float pYw = vWPos.y + (pCrs.g - 0.5) * 30.0 + (pTri.g - 0.5) * 5.0;
        float pBedT = abs(fract(pYw * (1.0 / 14.0)) * 2.0 - 1.0);
        vec3 pRock = lithology(fract(pYw * (1.0 / 78.0) + pCrs.b * 0.62));
        pRock *= (0.68 + 0.62 * pTri.r) * (0.72 + 0.52 * pCrs.g);
        pRock *= mix(1.0, mix(0.74, 1.18, smoothstep(0.05, 0.72, pBedT)), pFade);
        pWet = (1.0 - smoothstep(-1.0, 5.5, vWPos.y)) * smoothstep(-16.0, -6.0, vWPos.y);
        pRock *= mix(1.0, 0.40, pWet);` : `
        // No up, so the member is picked by two decorrelated triplanar taps
        // rather than by height: mineralogy that varies across a body instead of
        // banding around it.
        pWet = 0.0;
        vec3 pRock = lithology(fract(pCrs.b * 1.7 + pTri.g * 0.9));
        pRock *= (0.62 + 0.74 * pTri.r) * (0.70 + 0.58 * pCrs.g);
        // Fresh fracture faces are brighter than the space-weathered rind, and
        // the rind is what a body accumulates on whatever side it keeps out.
        pRock *= mix(1.0, mix(0.80, 1.30, smoothstep(0.30, 0.78, pTri.b)), pFade);`}
        diffuseColor.rgb *= pRock;
      `)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * mix(pTri.a, 0.14, pWet);`)
      .replace('#include <normal_fragment_maps>', `
        vec3 pnX = texture2D(normalMap, pUX).xyz * 2.0 - 1.0;
        vec3 pnY = texture2D(normalMap, pUY).xyz * 2.0 - 1.0;
        vec3 pnZ = texture2D(normalMap, pUZ).xyz * 2.0 - 1.0;
        pnX.xy *= normalScale; pnY.xy *= normalScale; pnZ.xy *= normalScale;
        vec3 pw = normalize(vWNrm);
        vec3 qX = vec3(pnX.xy + pw.zy, abs(pnX.z) * pw.x);
        vec3 qY = vec3(pnY.xy + pw.xz, abs(pnY.z) * pw.y);
        vec3 qZ = vec3(pnZ.xy + pw.xy, abs(pnZ.z) * pw.z);
        vec3 pN = normalize(qX.zyx * pBW.x + qY.xzy * pBW.y + qZ.xyz * pBW.z);
        normal = normalize((viewMatrix * vec4(pN, 0.0)).xyz);
      `);
    m.userData.shader = sh;
  };
  return m;
}
