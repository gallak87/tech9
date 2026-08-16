import * as THREE from 'three';
import { SkyDome, Starfield } from './sky.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment — sky, sun, shadow rig, image-based lighting, atmosphere and the
// per-preset grade, driven by a single named preset. The sun direction is the
// one source of truth: the sky shader, the key light, the IBL probe, the fog
// inscattering, the god-ray origin and the lens flare all read it, so changing
// `elevation` re-lights the entire game coherently.
//
// A preset is not just "where is the sun". It carries its own tone curve,
// split-tone, bloom energy, flare character and atmospheric model, because
// that is the difference between three times of day and three *places*.
//
// `blend(a, b, t)` crossfades two of them continuously. Everything that reaches
// the frame through a uniform interpolates; the two things that do not are the
// atmosphere shader chunks (baked literals — see below) and the IBL probe, both
// of which cost a full material rebuild. Presets therefore declare the same key
// set even where a value is inert, because a key present on one side and absent
// on the other is a step, not a ramp.
// ─────────────────────────────────────────────────────────────────────────────

export const PRESETS = {
  corneria: {
    kind: 'atmosphere', stars: 0, nebulaAmount: 0,
    turbidity: 2.7, rayleigh: 1.85, mieCoefficient: 0.0032, mieDirectionalG: 0.80,
    elevation: 27, azimuth: 148,
    sunColor: 0xfff0d2, sunIntensity: 5.6,
    // Ambient is two-sided on purpose: cool sky from above, warm bounce off the
    // ground. That split is the only thing separating a shadow's hue from a
    // shadow's value, and without it every unlit face collapses to one navy.
    hemiSky: 0xaed2fb, hemiGround: 0x7a6746, hemiIntensity: 0.62,
    fillColor: 0x8ab0dd, fillIntensity: 0.30,
    rimColor: 0xffdcb4, rimIntensity: 0.55,
    // Density is the single biggest control on whether this level reads as a
    // place or as a blue wash. The haze colour is ~3x brighter than lit rock,
    // so at 0.00050 a ridge 2 km out was 63% haze and every surface past the
    // near bank collapsed to one flat blue — no aerial layering, no material
    // response, no rock colour. 0.00022 keeps ~2 km of honest colour and still
    // separates the far ridgelines.
    fog: { color: 0xa6c6e6, density: 0.00022 },
    exposure: 0.20,
    // Exposure is deliberately untouched by the sludge pull-back: shadowed-gorge
    // angles already composite *under* the 0.10–0.20 target (`w-shore` at 0.068),
    // so pulling exposure to calm the glow would drive those further down. The
    // over-cranked read comes from the glow and over-processing terms, and those
    // are what came down — bloom, lens dirt, flare, god rays, AO, saturation,
    // contrast and CA. Same look, less veil.
    // God rays and the lens flare are off by owner call (live-tuned 2026-08-11,
    // M1, in Chrome). Zero intensity is also free rather than merely invisible:
    // both passes early-out on it, so there is no reason to disable the passes
    // as well. Raise either knob in the dev panel to get them back.
    godray: { intensity: 0.0, tint: 0xffd9a8, clamp: 2.4, density: 0.60, decay: 0.947, weight: 2.2, threshold: 1.7 },
    envIntensity: 0.95,

    sky: {
      sunDisc: 62, aureole: 1.20, aureoleTight: 1500, aureoleWide: 0.22, skyGain: 1.0,
      // Haze values are pre-exposure linear, same units as the dome itself: the
      // clear zenith sits near 1.2, so a horizon at ~2.0–3.0 reads as bright air
      // with three stops of headroom left instead of a blown band.
      hazeColor: [1.42, 1.86, 2.42], hazeSunColor: [2.90, 2.72, 2.42],
      hazeAmount: 0.88, hazeHeight: 0.27, hazeFalloff: 1.7, hazeSunPow: 3.0,
      zenithTint: [0.84, 0.92, 1.07],
      cloudAmount: 1.0, coverage: 0.47, cloudHeight: 2100, cloudScale: 0.00020,
      cloudWind: [0.0020, 0.0008], cloudThickness: 640, absorb: 2.7, erode: 0.20,
      cloudSun: [1.95, 1.92, 1.84], cloudShade: [0.34, 0.41, 0.55],
      cirrusAmount: 0.55, cirrusCoverage: 0.44, cirrusHeight: 8200,
      cirrusScale: 0.000050, cirrusWind: [0.0010, 0.0004],
    },
    atmos: {
      heightFalloff: 0.0016, baseHeight: -20,
      highTint: [0.70, 0.83, 1.02], lowTint: [1.06, 1.02, 0.96],
      sunTint: [0.40, 0.29, 0.16], sunPow: 6.0,
    },
    bloom: { strength: 0.040, radius: 1.05, threshold: 1.1, knee: 0.55, clamp: 4.0, anamorphic: 1.0, dirt: 0.022 },
    flare: { intensity: 0.0, ghosts: 0.8, streak: 0.26, tint: 0xfff0d8 },
    ao: { radius: 2.6, intensity: 0.86, strength: 0.60, tint: 0x22364c },
    grade: {
      toneMode: 2, shoulder: 0.74, linStart: 0.18, linLen: 0.22, toe: 1.12, white: 1.0,
      highlightDesat: 0.14, highlightKnee: 1.6,
      // ca 0 by owner call. It had never actually applied before the uniform-name
      // fix, so 0 is closer to what the game always looked like than the 1.6 the
      // fix briefly exposed.
      saturation: 1.08, contrast: 1.05, ca: 0.0, vignette: 0.92, grain: 0.010,
      lift: [0.004, 0.012, 0.030], gain: [1.0, 1.0, 1.0], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.88, 0.97, 1.17], highlightTint: [1.05, 1.015, 0.955],
      sharpen: 0.26,
    },
  },

  sunset: {
    kind: 'atmosphere', stars: 0, nebulaAmount: 0,
    turbidity: 8.0, rayleigh: 2.4, mieCoefficient: 0.0090, mieDirectionalG: 0.90,
    elevation: 4.2, azimuth: 190,
    sunColor: 0xffb066, sunIntensity: 5.2,
    hemiSky: 0xc09ad0, hemiGround: 0x30202a, hemiIntensity: 0.7,
    fillColor: 0x7060a0, fillIntensity: 0.5,
    rimColor: 0xff8a4a, rimIntensity: 1.3,
    fog: { color: 0xe0a184, density: 0.00075 },
    exposure: 0.42,
    godray: { intensity: 0.60, tint: 0xffb373, clamp: 3.0, density: 0.68, decay: 0.952, weight: 2.6, threshold: 1.1 },
    envIntensity: 1.0,

    sky: {
      sunDisc: 34, aureole: 2.6, aureoleTight: 420, aureoleWide: 0.30, skyGain: 1.0,
      // A low sun sits *inside* the aerosol layer, so the haze is thin and its
      // sunward colour is the sunset itself rather than a correction to it.
      hazeColor: [1.55, 1.30, 1.48], hazeSunColor: [4.20, 2.30, 1.05],
      hazeAmount: 0.55, hazeHeight: 0.16, hazeFalloff: 1.5, hazeSunPow: 2.2,
      zenithTint: [0.90, 0.90, 1.05],
      cloudAmount: 1.0, coverage: 0.56, cloudHeight: 2600, cloudScale: 0.00016,
      cloudWind: [0.0016, 0.0006], cloudThickness: 900, absorb: 3.4, erode: 0.24,
      cloudSun: [2.60, 1.42, 0.72], cloudShade: [0.26, 0.21, 0.32],
      cirrusAmount: 0.80, cirrusCoverage: 0.50, cirrusHeight: 9000,
      cirrusScale: 0.000044, cirrusWind: [0.0008, 0.0003],
    },
    atmos: {
      heightFalloff: 0.0011, baseHeight: -20,
      highTint: [0.60, 0.62, 0.92], lowTint: [1.10, 0.92, 0.80],
      sunTint: [1.40, 0.66, 0.26], sunPow: 4.5,
    },
    bloom: { strength: 0.105, radius: 1.05, threshold: 0.95, knee: 0.65, clamp: 7.0, anamorphic: 1.15, dirt: 0.10 },
    flare: { intensity: 0.85, ghosts: 1.1, streak: 0.45, tint: 0xffc98a },
    ao: { radius: 2.8, intensity: 1.1, strength: 0.62, tint: 0x2a1c22 },
    grade: {
      toneMode: 2, shoulder: 0.80, linStart: 0.18, linLen: 0.24, toe: 1.20, white: 1.0,
      highlightDesat: 0.20, highlightKnee: 1.3,
      saturation: 1.20, contrast: 1.12, ca: 2.0, vignette: 1.20, grain: 0.015,
      lift: [0.014, 0.008, 0.022], gain: [1.03, 0.995, 0.965], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.84, 0.92, 1.18], highlightTint: [1.09, 1.00, 0.89],
      sharpen: 0.26,
    },
  },

  // Vacuum. The sun is the only light that matters and nothing bounces, so the
  // read is entirely terminator contrast: a hard lit face, a shadow side held up
  // by rim alone, and no ambient to soften the edge between them. Exposure sits
  // near corneria's rather than four stops over it — the subject is still the
  // Arwing under a 5.2 key, and the black sky around it is not a reason to open
  // up. Sky radiance instead comes from the emitters that belong in space: the
  // starfield and the planet carry their own linear values.
  space: {
    kind: 'space', stars: 1, nebulaAmount: 0.55,
    turbidity: 1.0, rayleigh: 0.0, mieCoefficient: 0.0, mieDirectionalG: 0.80,
    // The sun sits behind the shoulder rather than down the nose, so a body
    // ahead of the ship shows a lit face with a terminator across it instead of
    // a black disc with a rim. In vacuum that lighting angle is the whole shot.
    elevation: 16, azimuth: 75,
    sunColor: 0xfff4e2, sunIntensity: 5.2,
    hemiSky: 0x14203a, hemiGround: 0x05060c, hemiIntensity: 0.14,
    fillColor: 0x2a3a66, fillIntensity: 0.14,
    rimColor: 0x9cc6ff, rimIntensity: 1.05,
    fog: { color: 0x04060d, density: 0.00002 },
    exposure: 0.26,
    godray: { intensity: 0.0, tint: 0xbdd6ff, clamp: 2.5, density: 0.55, decay: 0.94, weight: 2.0, threshold: 1.6 },
    nebula: [0x2a3f7a, 0x6b2a6a, 0x123048],
    envIntensity: 0.30,

    sky: {
      sunDisc: 90, aureole: 0.0, aureoleTight: 6000, aureoleWide: 0.0, skyGain: 0.0,
      hazeColor: [0, 0, 0], hazeSunColor: [0, 0, 0],
      hazeAmount: 0.0, hazeHeight: 0.20, hazeFalloff: 1.7, hazeSunPow: 3.0,
      zenithTint: [1.0, 1.0, 1.0],
      cloudAmount: 0.0, coverage: 0.30, cloudHeight: 2100, cloudScale: 0.00020,
      cloudWind: [0.0020, 0.0008], cloudThickness: 640, absorb: 2.7, erode: 0.20,
      cloudSun: [1.0, 1.0, 1.0], cloudShade: [0.2, 0.2, 0.2],
      cirrusAmount: 0.0, cirrusCoverage: 0.40, cirrusHeight: 8200,
      cirrusScale: 0.000050, cirrusWind: [0.0010, 0.0004],
    },
    atmos: {
      heightFalloff: 0.0002, baseHeight: -200,
      highTint: [0.30, 0.42, 0.86], lowTint: [0.80, 0.86, 1.05],
      sunTint: [0.24, 0.34, 0.62], sunPow: 9.0,
    },
    bloom: { strength: 0.115, radius: 1.15, threshold: 0.85, knee: 0.5, clamp: 10.0, anamorphic: 1.35, dirt: 0.14 },
    flare: { intensity: 0.55, ghosts: 1.2, streak: 0.75, tint: 0xcfe4ff },
    ao: { radius: 3.0, intensity: 1.2, strength: 0.70, tint: 0x0b1120 },
    grade: {
      toneMode: 2, shoulder: 0.82, linStart: 0.16, linLen: 0.22, toe: 1.30, white: 1.0,
      highlightDesat: 0.12, highlightKnee: 1.5,
      saturation: 1.10, contrast: 1.16, ca: 1.2, vignette: 1.10, grain: 0.006,
      lift: [0.002, 0.004, 0.014], gain: [0.98, 0.995, 1.045], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.82, 0.90, 1.22], highlightTint: [0.98, 1.00, 1.06],
      sharpen: 0.32,
    },
  },

  // The Foundry. Lit from BELOW — a furnace under the deck — which is a key
  // direction nothing else in the game uses and the cheapest way to make a built
  // interior read as hot and occupied rather than as an unlit box. So the
  // hemisphere is inverted against every other preset here: `hemiGround` is the
  // bright term and `hemiSky` is nearly black, because in a roofed bay there is
  // no sky to bounce and the deck is the only source with any area. Exposure is
  // double `space`'s: the sun barely reaches inside and almost all of the light
  // in frame is fill.
  foundry: {
    kind: 'space', stars: 1, nebulaAmount: 0.22,
    turbidity: 1.0, rayleigh: 0.0, mieCoefficient: 0.0, mieDirectionalG: 0.80,
    // The sun sits behind the shoulder rather than down the nose, so a body
    // ahead of the ship shows a lit face with a terminator across it instead of
    // a black disc with a rim. In vacuum that lighting angle is the whole shot.
    elevation: 16, azimuth: 75,
    sunColor: 0xffd9a8, sunIntensity: 3.4,
    hemiSky: 0x36415c, hemiGround: 0xff8a3e, hemiIntensity: 3.6,
    fillColor: 0xffa055, fillIntensity: 1.9,
    rimColor: 0xa8ccff, rimIntensity: 2.1,
    fog: { color: 0x0a0710, density: 0.00016 },
    exposure: 1.30,
    godray: { intensity: 0.0, tint: 0xbdd6ff, clamp: 2.5, density: 0.55, decay: 0.94, weight: 2.0, threshold: 1.6 },
    nebula: [0x3a2038, 0x5c2412, 0x101828],
    envIntensity: 1.30,

    sky: {
      sunDisc: 90, aureole: 0.0, aureoleTight: 6000, aureoleWide: 0.0, skyGain: 0.0,
      hazeColor: [0, 0, 0], hazeSunColor: [0, 0, 0],
      hazeAmount: 0.0, hazeHeight: 0.20, hazeFalloff: 1.7, hazeSunPow: 3.0,
      zenithTint: [1.0, 1.0, 1.0],
      cloudAmount: 0.0, coverage: 0.30, cloudHeight: 2100, cloudScale: 0.00020,
      cloudWind: [0.0020, 0.0008], cloudThickness: 640, absorb: 2.7, erode: 0.20,
      cloudSun: [1.0, 1.0, 1.0], cloudShade: [0.2, 0.2, 0.2],
      cirrusAmount: 0.0, cirrusCoverage: 0.40, cirrusHeight: 8200,
      cirrusScale: 0.000050, cirrusWind: [0.0010, 0.0004],
    },
    atmos: {
      heightFalloff: 0.0002, baseHeight: -200,
      highTint: [0.30, 0.42, 0.86], lowTint: [0.80, 0.86, 1.05],
      sunTint: [0.24, 0.34, 0.62], sunPow: 9.0,
    },
    bloom: { strength: 0.115, radius: 1.15, threshold: 0.85, knee: 0.5, clamp: 10.0, anamorphic: 1.35, dirt: 0.14 },
    flare: { intensity: 0.55, ghosts: 1.2, streak: 0.75, tint: 0xcfe4ff },
    ao: { radius: 3.0, intensity: 1.2, strength: 0.70, tint: 0x0b1120 },
    grade: {
      toneMode: 2, shoulder: 0.82, linStart: 0.16, linLen: 0.22, toe: 1.30, white: 1.0,
      highlightDesat: 0.12, highlightKnee: 1.5,
      saturation: 1.10, contrast: 1.16, ca: 1.2, vignette: 1.10, grain: 0.006,
      lift: [0.002, 0.004, 0.014], gain: [0.98, 0.995, 1.045], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.82, 0.90, 1.22], highlightTint: [0.98, 1.00, 1.06],
      sharpen: 0.32,
    },
  },

  // Fichina. Ice, thin clean air and a snowfield that bounces most of the key
  // straight back up, so the ground term of the hemisphere is nearly as bright
  // as the sky term — that inversion is what separates a white world from an
  // overexposed green one. Rayleigh runs high and turbidity low: cold air holds
  // no aerosol, so the sky deepens toward the zenith instead of hazing over.
  fichina: {
    kind: 'atmosphere', stars: 0, nebulaAmount: 0,
    turbidity: 1.7, rayleigh: 3.1, mieCoefficient: 0.0022, mieDirectionalG: 0.78,
    elevation: 19, azimuth: 206,
    sunColor: 0xfff3e4, sunIntensity: 5.3,
    hemiSky: 0xbcd8ff, hemiGround: 0xc8d6e2, hemiIntensity: 0.95,
    fillColor: 0x9ec2ea, fillIntensity: 0.44,
    rimColor: 0xe6f2ff, rimIntensity: 0.80,
    fog: { color: 0xd6e6f4, density: 0.00046 },
    exposure: 0.155,
    godray: { intensity: 0.0, tint: 0xd8e8ff, clamp: 2.4, density: 0.62, decay: 0.948, weight: 2.2, threshold: 1.5 },
    nebula: [0x2a3f7a, 0x6b2a6a, 0x123048],
    envIntensity: 1.05,

    sky: {
      sunDisc: 58, aureole: 0.85, aureoleTight: 2400, aureoleWide: 0.16, skyGain: 1.0,
      hazeColor: [1.90, 2.25, 2.70], hazeSunColor: [2.95, 3.00, 3.05],
      hazeAmount: 0.92, hazeHeight: 0.30, hazeFalloff: 1.5, hazeSunPow: 2.4,
      zenithTint: [0.76, 0.86, 1.10],
      cloudAmount: 1.0, coverage: 0.58, cloudHeight: 1500, cloudScale: 0.00013,
      cloudWind: [0.0034, 0.0013], cloudThickness: 820, absorb: 2.2, erode: 0.16,
      cloudSun: [2.10, 2.14, 2.20], cloudShade: [0.44, 0.52, 0.66],
      cirrusAmount: 0.85, cirrusCoverage: 0.52, cirrusHeight: 7200,
      cirrusScale: 0.000042, cirrusWind: [0.0016, 0.0006],
    },
    atmos: {
      heightFalloff: 0.0013, baseHeight: -20,
      highTint: [0.74, 0.86, 1.08], lowTint: [1.02, 1.04, 1.06],
      sunTint: [0.30, 0.32, 0.38], sunPow: 5.0,
    },
    bloom: { strength: 0.055, radius: 1.10, threshold: 1.0, knee: 0.55, clamp: 5.0, anamorphic: 1.0, dirt: 0.030 },
    flare: { intensity: 0.0, ghosts: 0.9, streak: 0.30, tint: 0xe8f2ff },
    ao: { radius: 2.6, intensity: 0.92, strength: 0.58, tint: 0x2a3a4c },
    grade: {
      toneMode: 2, shoulder: 0.76, linStart: 0.18, linLen: 0.22, toe: 1.10, white: 1.0,
      highlightDesat: 0.22, highlightKnee: 1.5,
      saturation: 0.96, contrast: 1.10, ca: 0.0, vignette: 0.96, grain: 0.010,
      lift: [0.006, 0.010, 0.022], gain: [0.99, 1.0, 1.03], gamma: [1.0, 1.0, 1.0],
      shadowTint: [0.86, 0.94, 1.20], highlightTint: [1.0, 1.01, 1.04],
      sharpen: 0.26,
    },
  },
};

/* ── Atmosphere: height fog + aerial perspective + sun inscattering ──────────
   three's FogExp2 is a single flat colour multiplied in by view depth, which is
   why distance reads as a wall rather than as air. These replacement chunks
   integrate an exponential *height* falloff along the ray, tint the haze toward
   the sky above and the ground haze below, and add a forward-scatter lobe so
   looking toward the sun through 3 km of air actually glows.

   Per-preset values are baked in as literals rather than uniforms, because
   three composes built-in material uniforms at import time and there is no seam
   to add new ones. Presets change roughly never, so the recompile is free; the
   cache-key hook below is what stops three handing back a stale program.     */
let _atmKey = '0';
let _cacheKeyPatched = false;

function f(v) {
  const s = Number(v).toFixed(6);
  return s.includes('.') ? s : s + '.0';
}

/** FNV-1a over the installed chunk text. Short, stable, and not a checksum. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function installAtmosphere(preset, sunDir) {
  const a = preset.atmos || {};
  const hi = a.highTint || [0.75, 0.85, 1.0];
  const lo = a.lowTint || [1.0, 1.0, 1.0];
  const st = a.sunTint || [0.4, 0.3, 0.2];

  if (!_cacheKeyPatched) {
    // Built-in materials key their compiled program off parameters, not off
    // chunk text — without this, re-patching a chunk silently reuses the old
    // program. This is the documented extension point for exactly that.
    const base = THREE.Material.prototype.customProgramCacheKey;
    THREE.Material.prototype.customProgramCacheKey = function () {
      return base.call(this) + '|atm' + _atmKey;
    };
    _cacheKeyPatched = true;
  }

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying float vFogHeight;
  varying float vFogSunCos;
#endif
`;

  // World height and the view/sun angle are derived from the view-space
  // position and the view matrix basis, so this stays correct for instanced
  // and skinned geometry where modelMatrix alone would not be.
  THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec3 fogUpV  = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
  vec3 fogSunV = mat3( viewMatrix ) * vec3( ${f(sunDir.x)}, ${f(sunDir.y)}, ${f(sunDir.z)} );
  vFogHeight = cameraPosition.y + dot( mvPosition.xyz, fogUpV );
  vFogSunCos = dot( normalize( mvPosition.xyz + vec3( 1e-5 ) ), fogSunV );
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying float vFogHeight;
  varying float vFogSunCos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;

  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  {
    const float ATM_K  = ${f(a.heightFalloff ?? 0.0015)};
    const float ATM_H0 = ${f(a.baseHeight ?? 0.0)};
    const vec3  ATM_HI = vec3( ${f(hi[0])}, ${f(hi[1])}, ${f(hi[2])} );
    const vec3  ATM_LO = vec3( ${f(lo[0])}, ${f(lo[1])}, ${f(lo[2])} );
    const vec3  ATM_SUN = vec3( ${f(st[0])}, ${f(st[1])}, ${f(st[2])} );
    const float ATM_SUNPOW = ${f(a.sunPow ?? 6.0)};

    #ifdef FOG_EXP2
      float atmDens = fogDensity;
    #else
      float atmDens = 1.0 / max( 1.0, fogFar - fogNear );
    #endif

    // analytic integral of exp(-k*h) along the view ray
    float dh = vFogHeight - cameraPosition.y;
    float baseD = exp( -ATM_K * ( cameraPosition.y - ATM_H0 ) );
    float kh = ATM_K * dh;
    float ramp = ( abs( kh ) < 0.02 ) ? 1.0 : ( 1.0 - exp( -kh ) ) / kh;
    float od = atmDens * vFogDepth * baseD * ramp;
    float fogFactor = 1.0 - exp( -max( 0.0, od ) );

    // aerial perspective: haze takes the colour of the sky it is standing in
    float dirY = clamp( dh / max( vFogDepth, 1.0 ), -1.0, 1.0 );
    vec3 atmCol = fogColor * mix( ATM_LO, ATM_HI, smoothstep( -0.12, 0.42, dirY ) );
    atmCol += ATM_SUN * pow( max( 0.0, vFogSunCos ), ATM_SUNPOW );

    gl_FragColor.rgb = mix( gl_FragColor.rgb, atmCol, clamp( fogFactor, 0.0, 1.0 ) );
  }
#endif
`;

  // Key the cache off what was actually installed, not off how many times this
  // ran. A counter makes every `apply()` a cache miss for every material in the
  // scene, which is most of the hop's compile stall — re-applying the *same*
  // preset, or hopping between two levels that share one, recompiled the world
  // for no reason. Hashing the chunk text means a program is reused exactly
  // when the shader it came from is unchanged, which is the actual rule.
  _atmKey = hash(
    THREE.ShaderChunk.fog_pars_vertex + THREE.ShaderChunk.fog_vertex
    + THREE.ShaderChunk.fog_pars_fragment + THREE.ShaderChunk.fog_fragment,
  );
}

export class Environment {
  constructor(engine, presetName = 'corneria') {
    this.engine = engine;
    this.scene = engine.scene;
    this.root = new THREE.Group();
    this.root.name = 'environment';
    this.scene.add(this.root);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sunWorld = new THREE.Vector3();
    this.sunScreen = new THREE.Vector2(0.5, 0.5);
    this.sunVisible = 0;
    this.cameraRoll = 0;
    this.time = 0;
    this._sunFirst = true;

    this._pmrem = new THREE.PMREMGenerator(engine.renderer);
    this._pmrem.compileEquirectangularShader();
    this._envRT = null;

    // ── sky dome (Preetham scattering + lit cloud decks)
    this.sky = new SkyDome();
    this.root.add(this.sky);

    // ── starfield backdrop. Built up front rather than on first space preset:
    // it is one draw call of 3400 points and it has to be able to fade *in*
    // over an atmosphere preset, which a lazily-created mesh cannot do without
    // a first-frame compile stall in the middle of the fade.
    this.stars = new Starfield();
    this.stars.setPixelRatio(engine.renderer.getPixelRatio());
    this.stars.setAmount(0);
    this.root.add(this.stars);
    this.nebulaMesh = null;
    this._starOverride = null;

    // ── lights
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = engine.q.shadows;
    this.sun.shadow.mapSize.set(engine.q.shadowMap, engine.q.shadowMap);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1200;
    // A heightfield this large self-shadows into pure acne unless the normal
    // bias is on the order of a shadow texel in world units.
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 1.8;
    this.sun.shadow.blurSamples = 16;
    this._shadowSpan = 190;
    this._setShadowSpan(this._shadowSpan);
    this.root.add(this.sun);
    this.root.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.root.add(this.hemi);

    this.fill = new THREE.DirectionalLight(0xffffff, 0.4);
    this.root.add(this.fill);

    this.rim = new THREE.DirectionalLight(0xffffff, 0.7);
    this.root.add(this.rim);

    this.preset = null;
    this.apply(presetName);
  }

  _setShadowSpan(s) {
    const c = this.sun.shadow.camera;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s;
    c.updateProjectionMatrix();
  }

  /**
   * Hard-set the whole look, including the two parts a blend cannot touch: the
   * atmosphere chunks (a full program rebuild) and the IBL probe (a PMREM bake).
   * Both are frame-time spikes, so a transition that has to stay seamless calls
   * `blend` and saves this for a moment the frame is already hidden.
   */
  apply(name) {
    const p = PRESETS[name];
    if (!p) throw new Error(`unknown environment preset: ${name}`);
    this.presetName = name;
    this.preset = p;

    this._applyLook(p);

    if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(p.fog.color, p.fog.density);
    installAtmosphere(p, this.sunDir);
    this._dirtyMaterials();

    this._sunFirst = true;
    this.refreshEnvMap();
    return this;
  }

  /**
   * Crossfade the look from preset `fromName` to preset `toName`.
   * Pure in `t` — no captured state, so the caller can drive it non-monotonically
   * and re-issue the same t twice without drift.
   *
   * What does NOT interpolate: the atmosphere chunk constants and the sun vector
   * baked into them, and the IBL probe. Both need a rebuild. The fog *colour and
   * density* do interpolate and they are what carries an aerial-perspective
   * change; the baked constants only reshape the height ramp and the sunward
   * lobe underneath it.
   */
  blend(fromName, toName, t) {
    const a = PRESETS[fromName], b = PRESETS[toName];
    if (!a) throw new Error(`unknown environment preset: ${fromName}`);
    if (!b) throw new Error(`unknown environment preset: ${toName}`);
    const k = THREE.MathUtils.clamp(t, 0, 1);
    lerpPreset(_blend, a, b, k);
    _blend.kind = k < 0.5 ? a.kind : b.kind;
    this.presetName = k < 0.5 ? fromName : toName;
    this.preset = _blend;
    this._applyLook(_blend);
    return this;
  }

  /** Absolute starfield/nebula amount, or null to follow the preset. */
  setStars(amount) {
    this._starOverride = amount;
    const p = this.preset;
    if (p) this._applyStars(p);
    return this;
  }

  _applyStars(p) {
    const a = this._starOverride != null ? this._starOverride : (p.stars ?? 0);
    this.stars.setAmount(a);
    if (this.nebulaMesh) {
      const n = a * (p.nebulaAmount ?? 1);
      this.nebulaMesh.material.uniforms.uAmount.value = n;
      this.nebulaMesh.visible = n > 0.002;
    }
  }

  /** Everything a preset drives that is a uniform or a pass parameter. */
  _applyLook(p) {
    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);

    this.sky.visible = true;
    this.sky.set({
      turbidity: p.turbidity, rayleigh: p.rayleigh,
      mieCoefficient: p.mieCoefficient, mieDirectionalG: p.mieDirectionalG,
      ...(p.sky || {}),
    });
    this.sky.setSun(this.sunDir);

    if (p.nebula && !this.nebulaMesh) this._buildNebula(p.nebula);
    this._applyStars(p);

    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.fill.color.setHex(p.fillColor);
    this.fill.intensity = p.fillIntensity;
    this.rim.color.setHex(p.rimColor);
    this.rim.intensity = p.rimIntensity;

    // Mutated, not replaced: three keys material programs on whether a fog
    // object exists, so swapping the instance every frame of a blend would
    // recompile the scene. Values are plain uniforms and are free to move.
    const fog = this.scene.fog;
    if (fog) { fog.color.setHex(p.fog.color); fog.density = p.fog.density; }

    this.scene.environmentIntensity = p.envIntensity ?? 1;
    this._applyPost(p);
  }

  /** Push the preset's post-process character into the composer. */
  _applyPost(p) {
    const post = this.engine.post;
    if (!post) return;

    post.params.exposure = p.exposure;

    const gr = post.godRays.params;
    const g = p.godray || {};
    if (g.intensity != null) gr.intensity = g.intensity;
    if (g.tint != null) gr.tint.setHex(g.tint);
    if (g.clamp != null) gr.clamp = g.clamp;
    if (g.density != null) gr.density = g.density;
    if (g.decay != null) gr.decay = g.decay;
    if (g.weight != null) gr.weight = g.weight;
    if (g.threshold != null) gr.threshold = g.threshold;

    if (p.bloom) Object.assign(post.params.bloom, p.bloom);

    if (p.flare && post.flare) {
      const fp = post.flare.params;
      for (const [k, v] of Object.entries(p.flare)) {
        if (k === 'tint') fp.tint.setHex(v); else fp[k] = v;
      }
    }

    if (p.ao && post.ao) {
      const ap = post.ao.params;
      for (const [k, v] of Object.entries(p.ao)) {
        if (k === 'tint') ap.tint.setHex(v); else ap[k] = v;
      }
    }

    if (p.grade && post.grade) {
      const u = post.grade.material.uniforms;
      for (const [k, v] of Object.entries(p.grade)) {
        // Acronym uniforms are spelled in caps (`uCA`), so title-casing the key
        // alone misses them and the `continue` below then drops the value in
        // silence. `ca` went unapplied in all three presets that way, leaving
        // every one of them on the pass default — which was *higher* than any
        // preset asked for. Try the caps form before giving up.
        const uni = u['u' + k[0].toUpperCase() + k.slice(1)] || u['u' + k.toUpperCase()];
        if (!uni) continue;
        if (Array.isArray(v) && uni.value?.set) uni.value.set(...v);
        else uni.value = v;
      }
    }
  }

  /** Force a rebuild of every material's program after an atmosphere swap. */
  _dirtyMaterials() {
    this.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) { for (const mm of m) mm.needsUpdate = true; }
      else m.needsUpdate = true;
    });
  }

  _buildNebula(colors) {
    // Nebula haze rendered as an additive inner shell so stars show through it.
    {
      const geo = new THREE.SphereGeometry(15600, 48, 32);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, transparent: true, fog: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          cA: { value: new THREE.Color() }, cB: { value: new THREE.Color() }, cC: { value: new THREE.Color() },
          uAmount: { value: 0 },
        },
        vertexShader: /* glsl */`
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 cA, cB, cC;
          uniform float uAmount;
          varying vec3 vDir;
          float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
          float noise(vec3 x){
            vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
            return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                           mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                       mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                           mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
          }
          float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<6;i++){ s+=a*noise(p); p*=2.03; a*=0.52; } return s; }
          void main() {
            vec3 d = vDir;
            float n1 = fbm(d * 2.4);
            float n2 = fbm(d * 5.1 + 13.0);
            float n3 = fbm(d * 1.1 - 7.0);
            vec3 col = cA * pow(n1, 2.6) * 1.5 + cB * pow(n2, 3.4) * 0.9 + cC * pow(n3, 2.0) * 0.7;
            float band = smoothstep(-0.55, 0.45, d.y * 0.5 + fbm(d*0.9));
            gl_FragColor = vec4(col * band * 0.55 * uAmount, 1.0);
          }`,
      });
      this.nebulaMesh = new THREE.Mesh(geo, mat);
      this.nebulaMesh.renderOrder = -999;
      this.nebulaMesh.frustumCulled = false;
      this.nebulaMesh.visible = false;
      this.root.add(this.nebulaMesh);
    }
    const u = this.nebulaMesh.material.uniforms;
    u.cA.value.setHex(colors[0]);
    u.cB.value.setHex(colors[1]);
    u.cC.value.setHex(colors[2]);
  }

  /** Bake the sky (and its clouds) into a PMREM probe used by every PBR material. */
  refreshEnvMap() {
    const prevBg = this.scene.background;
    const prevFog = this.scene.fog;

    // isolate: only the dome contributes to the probe
    const capture = new THREE.Scene();
    if (this.preset.kind === 'atmosphere') {
      const proxy = this.sky.makeProbeMesh(1000);
      capture.add(proxy);
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(capture, 0.02, 0.1, 2000);
      proxy.geometry.dispose(); proxy.material.dispose();
    } else {
      // Vacuum has no sky to bake, and the fog colour it would otherwise stand
      // in for is now near-black. The hemisphere's own sky term is the only
      // honest ambient left, so the probe carries that and nothing else.
      capture.background = new THREE.Color(this.preset.hemiSky);
      if (this._envRT) this._envRT.dispose();
      this._envRT = this._pmrem.fromScene(capture, 0.04, 0.1, 100);
    }

    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = this.preset.envIntensity ?? 1;
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
  }

  /**
   * Keeps the shadow frustum tight around the action, advances the weather and
   * recomputes the sun's screen-space position for god rays and the flare.
   */
  update(dt, focus, camera) {
    this.time += dt;
    const dist = 420;
    this.sunWorld.copy(this.sunDir).multiplyScalar(dist).add(focus);
    this.sun.position.copy(this.sunWorld);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();

    this.hemi.position.copy(focus).addScaledVector(_up, 50);
    this.fill.position.copy(focus).add(_v2.set(-this.sunDir.x, 0.35, -this.sunDir.z).multiplyScalar(200));
    this.rim.position.copy(focus).add(_v3.set(-this.sunDir.x, -0.12, -this.sunDir.z).multiplyScalar(-260));

    this.stars.position.copy(camera.position);
    if (this.nebulaMesh) this.nebulaMesh.position.copy(camera.position);
    this.sky.position.copy(camera.position);
    this.sky.setTime(this.time);

    // sun in screen space, for god rays and the flare
    const p = _v.copy(this.sunDir).multiplyScalar(9000).add(camera.position);
    p.project(camera);
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const behind = p.z > 1;
    const off = Math.max(
      Math.abs(this.sunScreen.x - 0.5) - 0.5,
      Math.abs(this.sunScreen.y - 0.5) - 0.5,
    );
    const target = behind ? 0 : THREE.MathUtils.clamp(1 - off / 0.35, 0, 1);
    if (this._sunFirst) { this.sunVisible = target; this._sunFirst = false; }
    else this.sunVisible += (target - this.sunVisible) * Math.min(1, dt * 9);

    // screen-space roll, so the flare's starburst stays welded to the lens
    const e = camera.matrixWorld.elements;
    this.cameraRoll = Math.atan2(e[1], e[5]);

    const post = this.engine.post;
    if (post) {
      post.godRays.sun.copy(this.sunScreen);
      post.godRays.visible = this.sunVisible;
      if (post.flare) {
        post.flare.sun.copy(this.sunScreen);
        post.flare.visible = this.sunVisible;
        post.flare.roll = this.cameraRoll;
      }
    }
  }

  dispose() {
    if (this._envRT) this._envRT.dispose();
    this._pmrem.dispose();
    this.stars.dispose();
  }
}

/* ── preset interpolation ────────────────────────────────────────────────────
   Presets are plain data, so the blend is a structural walk rather than a list
   of hand-written lerps: a key added to a preset is blendable the moment it
   exists. `out` is reused across frames — the walk allocates only on the first
   call for a given shape.

   Colours are stored as sRGB hex but mixed after `setHex` has converted them
   into the linear working space, because a channel-wise mix of two hex ints is
   a mix in a nonlinear space and it bends the hue on the way across.          */
const HEX_KEYS = new Set(['sunColor', 'hemiSky', 'hemiGround', 'fillColor', 'rimColor', 'color', 'tint']);
const SKIP_KEYS = new Set(['kind', 'nebula']);

const _cA = new THREE.Color();
const _cB = new THREE.Color();
const _blend = {};

function lerpPreset(out, a, b, t) {
  for (const k in b) {
    const vb = b[k], va = a[k];
    if (SKIP_KEYS.has(k)) { out[k] = vb; continue; }
    if (va === undefined) { out[k] = vb; continue; }
    if (typeof vb === 'number') {
      out[k] = HEX_KEYS.has(k)
        ? _cA.setHex(va).lerp(_cB.setHex(vb), t).getHex()
        : va + (vb - va) * t;
    } else if (Array.isArray(vb)) {
      let arr = out[k];
      if (!Array.isArray(arr) || arr.length !== vb.length) arr = out[k] = new Array(vb.length);
      for (let i = 0; i < vb.length; i++) {
        arr[i] = typeof vb[i] === 'number' ? va[i] + (vb[i] - va[i]) * t : vb[i];
      }
    } else if (vb && typeof vb === 'object') {
      let o = out[k];
      if (!o || typeof o !== 'object' || Array.isArray(o)) o = out[k] = {};
      lerpPreset(o, va, vb, t);
    } else {
      out[k] = t < 0.5 ? va : vb;
    }
  }
  return out;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
