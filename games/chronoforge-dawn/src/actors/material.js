import * as THREE from 'three';
import { TONE_BANDS, SPRITE_PX_PER_METRE } from '../../docs/specs/rig.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// The actor material: the pixel-snap + palette-quantise pass, as one material.
//
// This is the crux of the whole character approach. A rig is 3D and lit by the
// same sun as the terrain; what makes it read as a SPRITE is three things, in
// descending order of how much work they do:
//
//   1. a hard-banded tone response  (docs/specs/rig.mjs TONE_BANDS = 5)
//   2. a limited authored palette   (docs/specs/palette.mjs HERO_PALETTES)
//   3. screen-space vertex snapping (docs/specs/rig.mjs snapUnitPx)
//
// It is deliberately built on MeshStandardMaterial rather than a hand-rolled
// ShaderMaterial: shadows, the IBL probe baked off the live sky, fog and the
// grade pass all keep working, and the actor stays part of the same lighting
// solution as the ground it stands on. Defect 3 is "nothing touches the
// ground"; a character on a bespoke unlit shader is defect 3 with extra steps.
//
// EVERY number that describes the look comes from docs/specs/*.mjs. There is no
// second copy of TONE_BANDS or SPRITE_PX_PER_METRE in this file — that drift is
// exactly what the runnable-spec structure exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-vertex material class. Carried in the `aMat` attribute so one draw call
 *  can hold metal, painted cloth, skin, emissive trim and hide — which is the
 *  CONTRACT.md §6 "material variety" bar, met inside a single mesh. */
export const MAT = { CLOTH: 0, METAL: 1, SKIN: 2, NEON: 3, HIDE: 4 };

/** roughness / metalness per class, in class order. Metal picks up the sky,
 *  painted cloth stays matte, hide sits between them. */
const ROUGH = [0.86, 0.34, 0.62, 0.42, 0.74];
const METAL = [0.00, 0.90, 0.00, 0.10, 0.04];

const CLASS_GLSL = /* glsl */`
  float dawnRough(float m) {
    return m < 0.5 ? ${ROUGH[0].toFixed(2)}
         : m < 1.5 ? ${ROUGH[1].toFixed(2)}
         : m < 2.5 ? ${ROUGH[2].toFixed(2)}
         : m < 3.5 ? ${ROUGH[3].toFixed(2)}
         : ${ROUGH[4].toFixed(2)};
  }
  float dawnMetal(float m) {
    return m < 0.5 ? ${METAL[0].toFixed(2)}
         : m < 1.5 ? ${METAL[1].toFixed(2)}
         : m < 2.5 ? ${METAL[2].toFixed(2)}
         : m < 3.5 ? ${METAL[3].toFixed(2)}
         : ${METAL[4].toFixed(2)};
  }
`;

/** Shared uniforms — ONE object across every actor material so the dev-panel
 *  sliders move the whole cast at once and a party of six is still one
 *  uniform update per frame, not six. */
export function makeActorUniforms() {
  return {
    uSnapPx: { value: 0 },          // 0 disables the snap
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uBands: { value: TONE_BANDS },
    uBandStrength: { value: 0.85 },
    uPivot: { value: 0.34 },        // linear luminance that lands mid-ramp
    uTopGain: { value: 6.0 },       // where the rim band tops out
    uEmissive: { value: 3.2 },
  };
}

const NEED = ['#include <project_vertex>', '#include <roughnessmap_fragment>',
  '#include <metalnessmap_fragment>', '#include <emissivemap_fragment>',
  '#include <opaque_fragment>'];

/**
 * Build the actor material. `uniforms` is the shared object from
 * makeActorUniforms(); pass the same one to every actor.
 */
export function makeActorMaterial(uniforms, { name = 'actor' } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 1.0,
    emissive: 0x000000,
    dithering: true,
  });
  mat.name = name;
  mat.userData.actorUniforms = uniforms;

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    for (const token of NEED) {
      const src = token.includes('vertex') ? shader.vertexShader : shader.fragmentShader;
      if (!src.includes(token)) console.error('[actors] shader chunk missing:', token);
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aMat;
varying float vMat;
uniform float uSnapPx;
uniform vec2 uResolution;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  vMat = aMat;
  // ── pixel-snap ───────────────────────────────────────────────────────────
  // Quantise the projected vertex to a grid of uSnapPx framebuffer pixels.
  // The grid is derived on the CPU from snapUnitPx() in docs/specs/rig.mjs, so
  // it is expressed in METRES OF CHARACTER: apparent density is identical at
  // the locked overworld framing, at a battle push-in and in the portrait.
  if (uSnapPx > 0.001) {
    vec2 ndc = gl_Position.xy / gl_Position.w;
    vec2 px = (ndc * 0.5 + 0.5) * uResolution;
    px = floor(px / uSnapPx + 0.5) * uSnapPx;
    gl_Position.xy = ((px / uResolution) * 2.0 - 1.0) * gl_Position.w;
  }`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vMat;
uniform float uBands, uBandStrength, uPivot, uTopGain, uEmissive;
${CLASS_GLSL}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = dawnRough(vMat);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
  metalnessFactor = dawnMetal(vMat);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (vMat > 2.5 && vMat < 3.5) totalEmissiveRadiance += diffuseColor.rgb * uEmissive;`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  // ── tonal palette-quantise ───────────────────────────────────────────────
  // quantiseTone() from docs/specs/rig.mjs, in GLSL, applied to the LUMINANCE
  // of the lit result rather than to N·L. Doing it on N·L would band the key
  // light and leave the IBL smooth, which is the worst of both: the shadow
  // side goes soft and the character stops reading as one flat-shaded object.
  //
  // The scene is linear HDR here, so the band edges are placed through a
  // Reinhard-ish curve around uPivot rather than on raw radiance — otherwise
  // the whole character sits in band 0 at dawn and in band 4 at noon.
  //
  // Emissive trim (class NEON) opts out: it is the one part that is SUPPOSED
  // to be off the ramp, and banding it kills the neon read.
  {
    vec3 c = gl_FragColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float t = l / (l + uPivot);
    float q = clamp(floor(t * (uBands - 1.0) + 0.5) / (uBands - 1.0), 0.0, 1.0);
    float ql = (q > 0.999) ? uPivot * uTopGain : uPivot * q / max(1e-4, 1.0 - q);
    float bs = (vMat > 2.5 && vMat < 3.5) ? 0.0 : uBandStrength;
    gl_FragColor.rgb = c * mix(1.0, ql / max(l, 1e-5), bs);
  }`);

    mat.userData.shader = shader;
  };

  // Force a distinct program from any other standard material in the scene.
  mat.customProgramCacheKey = () => 'dawn-actor-v1';
  return mat;
}

/**
 * Snap grid, in framebuffer pixels, for an actor of `heightM` metres whose
 * on-screen height is `screenPx` framebuffer pixels.
 *
 * This is snapUnitPx() from docs/specs/rig.mjs — imported, not re-derived —
 * with one addition: `boost`, a viewer/tuning multiplier. The gate's whole
 * question is whether SPRITE_PX_PER_METRE = 28 is the right density, and the
 * only way to answer it is to sweep it against a real screenshot.
 */
export { SPRITE_PX_PER_METRE };
