import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { fbm2D, ridged2D, worley2D, cached } from '../render/textures.js';
import { WORLD, centrelineX, centrelineDX, terrainHeight, profileAt, heightAtU } from './profile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Materials owned by the world. Nothing here touches render/materials.js — the
// render lane owns that file — but everything is built on the same procedural
// texture kit so the level responds to light like the rest of the game.
//
// The three that matter:
//   terrainMaterial()  triplanar rock, wet band at the waterline, strata
//   waterMaterial()    Gerstner surface that knows where the shore is
//   cityMaterial()     concrete with analytically anti-aliased windows
// ─────────────────────────────────────────────────────────────────────────────

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

  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      height[y * S + x] = strata(u, v * 0.5) * 0.80
        + Math.pow(crack(u, v), 3) * 0.72
        + grit(u, v) * 0.11
        - Math.pow(1 - flake(u, v), 2) * 0.22;
    }
  }
  const map = bake(S, S, (u, v, o) => {
    const s = strata(u, v * 0.5);
    const c = Math.pow(crack(u, v), 3);
    const g = grit(u, v);
    const p = patch(u * 0.5, v * 0.5);
    const fl = 1 - flake(u, v);
    o[0] = clamp01(0.26 + g * 0.52 + c * 0.34 + fl * 0.16);
    o[1] = clamp01(0.14 + s * 0.90);
    o[2] = clamp01(p * 1.05);
    o[3] = clamp01(0.56 + g * 0.26 + c * 0.20 - fl * 0.12);
  }, { srgb: false });
  return { map, normalMap: normalFrom(height, S, 2.8) };
});

/* ── shore field: terrain height under the water plane, in rail space ─────── */
//
// The water shader needs to know where the land is. Sampling the height field
// per-fragment is impossible, so it is baked once into a texture indexed by
// (lateral offset from the centreline, distance down the level). The shader
// reproduces `centrelineX` exactly, so the lookup lands on the right spot even
// though the river meanders.

export const SHORE = { halfU: 1250, z0: WORLD.zStart, zLen: WORLD.zStart - WORLD.zEnd, w: 384, h: 1024 };

const shoreField = () => cached('world.shore', () => {
  const { halfU, z0, zLen, w, h } = SHORE;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
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
  const t = tex(data, w, h, { wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
});

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
export const HORIZON = { halfU: 2000, z0: WORLD.zStart, zLen: WORLD.zStart - WORLD.zEnd, w: 256, h: 660 };

// Ray steps in texels, geometric: dense near the shading point where the
// horizon changes fastest, sparse out at the range where only a whole mountain
// can still matter. 112 texels ≈ 1.8 km, which is as far as a 27° sun can throw
// a shadow from the tallest thing in the level.
const HSTEPS = [1, 2, 3, 4, 5, 7, 9, 12, 16, 21, 28, 37, 49, 64, 85, 112];
const HDIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

const horizonField = () => cached('world.horizon', () => {
  const { halfU, z0, zLen, w, h } = HORIZON;
  const du = (2 * halfU) / w;      // metres per texel across the rail
  const dz = zLen / h;             // metres per texel along it

  const F = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const z = z0 - (j + 0.5) * dz;
    const P = profileAt(z);
    const row = j * w;
    for (let i = 0; i < w; i++) F[row + i] = heightAtU((-0.5 + (i + 0.5) / w) * 2 * halfU, z, P);
  }

  const A = new Uint8Array(w * h * 4);
  const B = new Uint8Array(w * h * 4);
  const INV = 1 / (Math.PI * 0.5);
  for (let j = 0; j < h; j++) {
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
  const mk = (data) => {
    const t = tex(data, w, h, { wrap: THREE.ClampToEdgeWrapping, aniso: 4 });
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  };
  return { a: mk(A), b: mk(B) };
});

const GLSL_HORIZON = /* glsl */`
  uniform sampler2D uHorizA;
  uniform sampler2D uHorizB;
  uniform vec3 uHorizCfg;               // halfU, z0, zLen

  float centrelineDX(float z) {
    float t = -z;
    return -(cos(t * 0.00055) * 210.0 * 0.00055
           + cos(t * 0.00181 + 1.7) * 78.0 * 0.00181
           + cos(t * 0.0041 + 0.4) * 22.0 * 0.0041);
  }
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

export const GLSL_CENTRELINE = /* glsl */`
  float centrelineX(float z) {
    float t = -z;
    return sin(t * 0.00055) * 210.0 + sin(t * 0.00181 + 1.7) * 78.0 + sin(t * 0.0041 + 0.4) * 22.0;
  }
`;

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

// Linear albedos. Real stone lives between 0.10 and 0.42; anything above that
// is snow. The separation that makes a cliff read as sedimentary is *hue*
// between the members, not brightness — so the ochre and the shale differ by
// 0.20 in red and almost nothing in blue.
const GLSL_LITHOLOGY = /* glsl */`
  const vec3 L_OCHRE = vec3(0.312, 0.208, 0.126);   // iron-stained sandstone
  const vec3 L_BUFF  = vec3(0.352, 0.312, 0.240);   // pale weathered limestone
  const vec3 L_SHALE = vec3(0.176, 0.166, 0.166);   // cool grey mudstone
  const vec3 L_RED   = vec3(0.276, 0.152, 0.100);   // red bed
  const vec3 L_BASE  = vec3(0.246, 0.204, 0.156);   // undifferentiated country rock

  // 0..1 around the formation cycle → which member is exposed here. Most of the
  // cycle is country rock on purpose: a wall where every band is a different
  // mineral is not a cliff, it is marbled endpaper. The named members are
  // narrow, and they never fully replace the base.
  vec3 lithology(float f) {
    vec3 c = L_BASE;
    c = mix(c, L_OCHRE, 0.85 * smoothstep(0.03, 0.11, f) * (1.0 - smoothstep(0.19, 0.30, f)));
    c = mix(c, L_SHALE, 0.70 * smoothstep(0.38, 0.45, f) * (1.0 - smoothstep(0.50, 0.58, f)));
    c = mix(c, L_BUFF,  0.80 * smoothstep(0.63, 0.70, f) * (1.0 - smoothstep(0.78, 0.86, f)));
    c = mix(c, L_RED,   0.55 * smoothstep(0.90, 0.94, f) * (1.0 - smoothstep(0.98, 1.00, f)));
    return c;
  }
`;

export function terrainMaterial() {
  const rock = rockSet();
  const m = new THREE.MeshStandardMaterial({
    map: rock.map,
    normalMap: rock.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.62,
    vertexColors: true,
    dithering: true,
  });
  // ?terrdbg=sun|sky|cav flat-shades one baked field instead of the surface.
  // Always defined, never conditional: GLSL ES makes an undefined identifier in
  // an #if a compile error, not a zero.
  m.defines = { TERR_DBG: { sun: 1, sky: 2, cav: 3 }[new URLSearchParams(location.search).get('terrdbg')] || 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScale = { value: 0.112 };
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
        ${GLSL_LITHOLOGY}
        ${GLSL_CENTRELINE}
        ${GLSL_HORIZON}
        vec3 gBW; vec2 gUX, gUY, gUZ; vec4 gTri;
        vec3 gFaceUp;
        float gWet, gDetail, gSteep, gAO, gBedSlope, gBedK, gWpx, gDbg;`)
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

        gDetail = (1.0 - smoothstep(0.22, 0.85, gWpx));
        gAO = mix(1.0, sky, 0.92) * mix(1.0, 0.70, gully * 0.7);
        gFaceUp = normalize(vec3(0.0, 1.0, 0.0) - wn * wn.y + vec3(1e-5, 0.0, 0.0));

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
        wNormal = normalize(wNormal + gFaceUp * gBedSlope * 0.30 * smoothstep(0.20, 0.60, gSteep));
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

   1. Every band is faded on **pixel footprint**, not on camera distance. wpx
      folds range and grazing angle into the one number Nyquist cares about,
      and at 200 m/s over a flat plane the grazing term dominates: the water
      forty metres ahead of the nose covers more world per pixel than a cliff
      four hundred metres away. Fading on distance is what left the near field
      of `wdiag2/graze.png` with no ripple structure at all.

   2. Amplitude a band loses to that fade is not thrown away, it is handed to
      roughness. That is the whole physical story of distant water: the sheen
      of a kilometre-away sea is the same chop you can resolve at ten metres,
      integrated over the pixel. Drop it without the hand-off and the surface
      turns to glass, which is precisely how this started.                    */
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
  // Roughness is the whole ball game here. A mirror-smooth plane seen at a
  // grazing angle reflects the horizon sky straight down the barrel of the
  // camera and clips to white across the entire frame — which is exactly what
  // the first build did. Real water gets its distant sheen from ripples the
  // pixel can no longer resolve, so the shader roughens with footprint instead.
  //
  // ior 1.333 rather than the 1.5 default: water's F0 is 0.02, half the glass
  // value three assumes. That single number is most of the reason the river
  // used to render brighter than the rock beside it.
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
        ${GLSL_CENTRELINE}
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
        ${GLSL_CENTRELINE}
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
        // contour. That one term is the difference between a shore and a
        // clipping boundary.
        float bed = vBed;
        float d = max(0.0, vWave - bed);

        // ── colour ────────────────────────────────────────────────────────
        // Absorption, roughly: red is gone by 4 m, green by 20, blue survives.
        // Doing it as a Beer curve rather than a lerp is what gives the delta
        // its band of jade over the sand bars without any of it being painted.
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
 * This used to be a bare MeshStandardMaterial, and because it sat only 2.5 m
 * under a surface whose swell troughs reach ~4.8 m, it won the depth test over
 * most of the river at grazing angles. Every "the water is a plastic sheet"
 * frame in `shots/base01` is this material, not the one above it. It is now
 * dropped clear of the troughs (see water.js) *and* given a real surface, so
 * the open sea past the level holds up on its own.
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

/* ── concrete, city, metal ────────────────────────────────────────────────── */

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
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    height[y * S + x] = -joint(u, v) * 0.6 + grain(u, v) * 0.14;
  }
  const map = bake(S, S, (u, v, o) => {
    const j = joint(u, v), g = grain(u, v), s = stain(u, v);
    const k = (0.60 + g * 0.16) * (1 - j * 0.42) * (0.82 + s * 0.30);
    o[0] = k * 1.00; o[1] = k * 0.985; o[2] = k * 0.94;
    o[3] = Math.min(1, 0.62 + g * 0.20 + j * 0.16 + s * 0.10);
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

/** Dry scrub and conifer canopy — vertex-coloured, no texture, cheap at range. */
export function foliageMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.0,
    envMapIntensity: 0.5, flatShading: false, dithering: true,
  });
}

/**
 * Free-standing rock — arches, stacks, boulders. Shares the terrain's texture
 * set and its lithology, so a natural arch springing from a canyon wall is made
 * of the same stone as the wall, banded on the same 14 m rhythm.
 */
export function rockPropMaterial({ scale = 0.112, tint = 0xffffff } = {}) {
  const rock = rockSet();
  const m = new THREE.MeshStandardMaterial({
    color: tint, map: rock.map, normalMap: rock.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 1.0, metalness: 0.0, envMapIntensity: 0.6,
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
        ${GLSL_LITHOLOGY}
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
        float pYw = vWPos.y + (pCrs.g - 0.5) * 30.0 + (pTri.g - 0.5) * 5.0;
        float pBedT = abs(fract(pYw * (1.0 / 14.0)) * 2.0 - 1.0);
        float pFade = 1.0 - smoothstep(1.4, 4.8, pWpx);
        vec3 pRock = lithology(fract(pYw * (1.0 / 78.0) + pCrs.b * 0.62));
        pRock *= (0.68 + 0.62 * pTri.r) * (0.72 + 0.52 * pCrs.g);
        pRock *= mix(1.0, mix(0.74, 1.18, smoothstep(0.05, 0.72, pBedT)), pFade);
        pWet = (1.0 - smoothstep(-1.0, 5.5, vWPos.y)) * smoothstep(-16.0, -6.0, vWPos.y);
        pRock *= mix(1.0, 0.40, pWet);
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
