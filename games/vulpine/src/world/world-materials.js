import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { fbm2D, ridged2D, worley2D, cached } from '../render/textures.js';
import { WORLD, centrelineX, terrainHeight } from './profile.js';

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

/* ── rock: albedo in RGB, roughness in A (one tap instead of two) ─────────── */

/** Linear → sRGB, because `bake` writes bytes into an sRGB-tagged texture. */
const enc = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

const rockSet = () => cached('world.rock', () => {
  const r = new RNG('world:rock');
  const strata = fbm2D(r, { octaves: 6, base: 5, gain: 0.55 });
  const crack = ridged2D(r, { octaves: 5, base: 9, gain: 0.52 });
  const grit = fbm2D(r, { octaves: 4, base: 40, gain: 0.58 });
  const patch = fbm2D(r, { octaves: 3, base: 3, gain: 0.6 });
  const S = 512;

  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      height[y * S + x] = strata(u, v * 0.55) * 0.75 + Math.pow(crack(u, v), 3) * 0.62 + grit(u, v) * 0.10;
    }
  }
  // Physically plausible stone: 0.10 linear in the shaded bands to 0.31 on the
  // bleached faces, which is where andesite through sandstone actually sits.
  // The texture stays close to neutral on purpose — all the hue lives in the
  // shader's strata and in the vertex tint, both of which vary over tens of
  // metres, so a 9 m tile can never announce itself as a repeating colour.
  const A = [0.104, 0.089, 0.074], B = [0.312, 0.276, 0.228];
  const map = bake(S, S, (u, v, o) => {
    const s = strata(u, v * 0.55);
    const c = Math.pow(crack(u, v), 4);
    const g = grit(u, v);
    const p = patch(u * 0.5, v * 0.5);
    const k = s * 0.66 + g * 0.34;
    const warm = 0.90 + p * 0.20;
    o[0] = enc((A[0] + (B[0] - A[0]) * k) * (1 - c * 0.55) * warm);
    o[1] = enc((A[1] + (B[1] - A[1]) * k) * (1 - c * 0.55) * (warm * 0.98 + 0.02));
    o[2] = enc((A[2] + (B[2] - A[2]) * k) * (1 - c * 0.55) * (0.92 + p * 0.16));
    o[3] = Math.min(1, 0.66 + g * 0.22 + c * 0.14);      // roughness
  }, { srgb: true });
  return { map, normalMap: normalFrom(height, S, 2.6) };
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

export function terrainMaterial() {
  const rock = rockSet();
  const m = new THREE.MeshStandardMaterial({
    map: rock.map,
    normalMap: rock.normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.62,
    vertexColors: true,
    dithering: true,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uScale = { value: 0.112 };
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
        vec3 gBW; vec2 gUX, gUY, gUZ; vec4 gTri;
        float gWet, gDetail, gSteep, gAO;`)
      .replace('#include <map_fragment>', `
        vec3 wn = normalize(vWNrm);
        gBW = pow(abs(wn), vec3(6.0));
        gBW /= (gBW.x + gBW.y + gBW.z);
        gUX = vWPos.zy * uScale; gUY = vWPos.xz * uScale; gUZ = vWPos.xy * uScale;
        gTri = texture2D(map, gUX) * gBW.x + texture2D(map, gUY) * gBW.y + texture2D(map, gUZ) * gBW.z;

        float camD = length(vWPos - cameraPosition);
        gSteep = 1.0 - clamp(wn.y, 0.0, 1.0);
        float cav = vTerr.x;
        float sky = vTerr.y;

        // broad tonal drift so a 9 m tile never announces itself at altitude
        float macro = texture2D(map, vWPos.xz * uScale * 0.038).g;
        float macro2 = texture2D(map, vWPos.xz * uScale * 0.0095 + 0.37).r;
        vec3 albedo = gTri.rgb * mix(0.82, 1.14, macro) * mix(0.86, 1.12, macro2);

        // ── bedding planes ──────────────────────────────────────────────────
        // Beds are laid down flat and then folded, so the band coordinate is
        // world Y warped by the same low-frequency field that drives the tint.
        // A triangle wave, not fract(), or every 13 m there is a hard seam that
        // reads as a contour line rather than as rock.
        float yw = vWPos.y + (macro2 - 0.5) * 34.0 + (macro - 0.5) * 9.0 + gTri.g * 3.0;
        float bedT = abs(fract(yw * (1.0 / 11.5)) * 2.0 - 1.0);
        float bed = smoothstep(0.10, 0.62, bedT);
        float bedFine = abs(fract(yw * (1.0 / 3.1) + gTri.r * 0.8) * 2.0 - 1.0);

        // formations: which mineral this stack of beds is made of
        float form = fract(yw * (1.0 / 96.0) + macro2 * 0.55);
        float formT = smoothstep(0.06, 0.48, form) * (1.0 - smoothstep(0.55, 0.95, form));
        vec3 ochre = vec3(1.30, 0.90, 0.56);      // iron-stained sandstone
        vec3 slate = vec3(0.80, 0.86, 0.96);      // cool grey shale
        vec3 stratCol = mix(slate, ochre, formT);

        // Strata only exist where there is a face to show them, and they have
        // to dissolve before the band period drops under a few pixels.
        float faceMask = smoothstep(0.16, 0.62, gSteep) * (1.0 - smoothstep(1400.0, 4200.0, camD));
        float stratK = mix(0.78, 1.20, bed) * mix(0.94, 1.06, bedFine);
        albedo *= mix(vec3(1.0), stratCol * stratK, faceMask * 0.72);

        // ── cavity ──────────────────────────────────────────────────────────
        // Gullies collect dirt and damp; rims are scoured and dusty.
        float gully = smoothstep(0.54, 1.0, cav);
        float rim = smoothstep(0.46, 0.02, cav);
        albedo *= mix(1.0, 0.58, gully * 0.85);
        albedo *= mix(1.0, 1.13, rim * 0.8);

        // the waterline: rock darkens and glosses where it is permanently wet
        gWet = (1.0 - smoothstep(-2.0, 6.0, vWPos.y)) * smoothstep(-18.0, -7.0, vWPos.y);
        // a bleached tide mark just above it — the single cue that says "sea"
        float tide = smoothstep(2.0, 5.0, vWPos.y) * (1.0 - smoothstep(6.0, 12.0, vWPos.y));
        albedo *= mix(1.0, 0.44, gWet);
        albedo *= mix(1.0, 1.22, tide * (1.0 - gSteep * 0.5));

        gDetail = (1.0 - smoothstep(45.0, 210.0, camD)) * smoothstep(0.10, 0.35, gSteep);
        gAO = mix(1.0, sky, 0.92) * mix(1.0, 0.70, gully * 0.7);

        diffuseColor *= vec4(albedo, 1.0);
      `)
      .replace('#include <roughnessmap_fragment>', `
        // Wet rock is glossy, scoured rims are matte-dusty, gullies are matte.
        float roughnessFactor = roughness * mix(gTri.a, 0.16, gWet);
        roughnessFactor = min(1.0, roughnessFactor + smoothstep(0.54, 1.0, vTerr.x) * 0.10);
      `)
      .replace('#include <normal_fragment_maps>', `
        vec3 tnX = texture2D(normalMap, gUX).xyz * 2.0 - 1.0;
        vec3 tnY = texture2D(normalMap, gUY).xyz * 2.0 - 1.0;
        vec3 tnZ = texture2D(normalMap, gUZ).xyz * 2.0 - 1.0;
        // Second octave at 2.4 m, faded out well before it can alias. This is
        // the difference between a cliff you can read the grain of at 60 m and
        // a smooth grey sheet.
        if (gDetail > 0.004) {
          float k = gDetail * 0.85;
          tnX.xy += (texture2D(normalMap, gUX * 4.7 + 0.31).xy * 2.0 - 1.0) * k;
          tnY.xy += (texture2D(normalMap, gUY * 4.7 + 0.31).xy * 2.0 - 1.0) * k;
          tnZ.xy += (texture2D(normalMap, gUZ * 4.7 + 0.31).xy * 2.0 - 1.0) * k;
        }
        // Vertical faces carry more relief than the silted floor does.
        vec2 nsc = normalScale * mix(0.55, 1.45, gSteep);
        tnX.xy *= nsc; tnY.xy *= nsc; tnZ.xy *= nsc;
        vec3 wnn = normalize(vWNrm);
        // whiteout blend — keeps detail through the 45° zones where UDN goes flat
        vec3 bX = vec3(tnX.xy + wnn.zy, abs(tnX.z) * wnn.x);
        vec3 bY = vec3(tnY.xy + wnn.xz, abs(tnY.z) * wnn.y);
        vec3 bZ = vec3(tnZ.xy + wnn.xy, abs(tnZ.z) * wnn.z);
        vec3 wNormal = normalize(bX.zyx * gBW.x + bY.xzy * gBW.y + bZ.xyz * gBW.z);
        normal = normalize((viewMatrix * vec4(wNormal, 0.0)).xyz);
      `)
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

export function waterMaterial() {
  // Roughness is the whole ball game here. A mirror-smooth plane seen at a
  // grazing angle reflects the horizon sky straight down the barrel of the
  // camera and clips to white across the entire frame — which is exactly what
  // the first build did. Real water gets its distant sheen from ripples the
  // pixel can no longer resolve, so the shader roughens with distance instead.
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.13,
    metalness: 0.0,
    envMapIntensity: 0.95,
    clearcoat: 0.0,
  });
  m.normalMap = rippleMap();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    sh.uniforms.uShore = { value: shoreField() };
    sh.uniforms.uShoreCfg = { value: new THREE.Vector3(SHORE.halfU, SHORE.z0, SHORE.zLen) };
    sh.uniforms.uFoamTex = { value: foamMap() };

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying vec3 vWPos;
        varying vec3 vWNrm;
        varying float vCrest;
        varying float vShallow;
        ${GLSL_CENTRELINE}
        ${GLSL_SHORE}
        ${GERSTNER}`)
      .replace('#include <beginnormal_vertex>', `
        vec3 _wp = (modelMatrix * vec4(position, 1.0)).xyz;
        vec2 _sh = shoreAt(_wp);
        // waves shoal: they shorten and flatten as the bed comes up
        float _damp = smoothstep(-1.0, 22.0, -_sh.x);
        vShallow = 1.0 - _damp;
        vec3 _tan = vec3(1.0, 0.0, 0.0);
        vec3 _bin = vec3(0.0, 0.0, 1.0);
        vec3 _off = vec3(0.0);
        _off += gerstner(W0, _wp, uTime, _damp, _tan, _bin);
        _off += gerstner(W1, _wp, uTime, _damp, _tan, _bin);
        _off += gerstner(W2, _wp, uTime, _damp * 0.8 + 0.2, _tan, _bin);
        _off += gerstner(W3, _wp, uTime, _damp * 0.6 + 0.4, _tan, _bin);
        vec3 objectNormal = normalize(cross(_bin, _tan));
        vWNrm = objectNormal;
        vCrest = clamp(_off.y * 0.42 + 0.30, 0.0, 1.0);
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
        varying float vCrest;
        varying float vShallow;
        float gFoam;
        ${GLSL_CENTRELINE}
        ${GLSL_SHORE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 sh = shoreAt(vWPos);
        float depth = clamp(-sh.x / 30.0, 0.0, 1.0);

        vec3 shallow = vec3(0.085, 0.290, 0.300);
        vec3 deep    = vec3(0.0075, 0.045, 0.098);
        vec3 col = mix(shallow, deep, smoothstep(0.04, 0.72, depth));
        // the bed shows through where it is only a couple of metres down
        col = mix(vec3(0.235, 0.205, 0.150), col, smoothstep(0.0, 0.20, depth));

        // surf: a band that hugs the waterline, breaking with the swell
        float band = 1.0 - smoothstep(0.0, 0.13, depth);
        float roll = sin(sh.x * 0.55 + uTime * 1.25) * 0.5 + 0.5;
        float ft = texture2D(uFoamTex, vWPos.xz * 0.030).r
                 * texture2D(uFoamTex, vWPos.xz * 0.009 + uTime * 0.004).r * 2.1;
        float surf = band * (0.35 + 0.75 * roll) * ft;
        float crest = smoothstep(0.62, 1.0, vCrest) * ft * 0.55;
        gFoam = clamp(surf * 1.5 + crest, 0.0, 1.0);

        diffuseColor.rgb *= mix(col, vec3(0.90, 0.95, 1.0), gFoam);
      `)
      .replace('#include <roughnessmap_fragment>', `
        // sub-pixel chop the mesh cannot carry, folded back in as roughness
        float camDist = length(vWPos - cameraPosition);
        float far = smoothstep(90.0, 2200.0, camDist);
        float roughnessFactor = mix(mix(roughness, 0.30, far), 0.80, gFoam) + vShallow * 0.06;
      `)
      .replace('#include <normal_fragment_maps>', `
        float nd = 1.0 - smoothstep(120.0, 1800.0, length(vWPos - cameraPosition));
        vec2 r1 = vWPos.xz * 0.055 + vec2(uTime * 0.016, uTime * -0.011);
        vec2 r2 = vWPos.xz * 0.017 + vec2(uTime * -0.007, uTime * 0.013);
        vec2 r3 = vWPos.xz * 0.190 + vec2(uTime * 0.031, uTime * 0.024);
        vec3 m1 = texture2D(normalMap, r1).xyz * 2.0 - 1.0;
        vec3 m2 = texture2D(normalMap, r2).xyz * 2.0 - 1.0;
        vec3 m3 = texture2D(normalMap, r3).xyz * 2.0 - 1.0;
        vec2 rip = m1.xy * 0.55 + m2.xy * 0.80 + m3.xy * 0.35 * nd * (1.0 - gFoam);
        vec3 wN = normalize(vWNrm + vec3(rip.x, 0.0, rip.y) * (0.42 - 0.28 * gFoam));
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
      `);
    m.userData.shader = sh;
  };
  return m;
}

/** The apron under everything — open ocean, no shore lookup, no displacement. */
export function deepWaterMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x0a1e30, roughness: 0.34, metalness: 0.0, envMapIntensity: 0.85,
  });
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

export function rockPropMaterial() {
  const rock = rockSet();
  const m = new THREE.MeshStandardMaterial({
    map: rock.map, normalMap: rock.normalMap,
    roughness: 1.0, metalness: 0.0, envMapIntensity: 0.6, vertexColors: true,
  });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * texture2D(map, vMapUv).a;`);
  };
  return m;
}
