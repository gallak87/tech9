import * as THREE from 'three';

// Paint belongs on one opaque deck. Separate subpixel white slivers alias at
// the starting-grid distance; integrate each stripe over the pixel footprint.
export function createVectorDeckMaterial(materials, pulseUniforms, device) {
  const material = materials.case;
  const from = device.distance - device.length / 2;
  const rows = Math.ceil((device.length - 2.8) / 3.3);
  const uniforms = {
    ...pulseUniforms,
    deckLayout: {
      value: new THREE.Vector4(
        device.lateral,
        device.width * 0.39,
        from + 1.8,
        rows,
      ),
    },
    deckGold: { value: materials.signal.color },
    deckWhite: { value: materials.white.color },
    deckGoldEmission: { value: materials.signal.emissive },
    deckWhiteEmission: { value: materials.white.emissive },
    deckIntensity: { value: new THREE.Vector2() },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 roadCoord; varying vec2 pickupCoord;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\npickupCoord = roadCoord;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      uniform vec4 deckLayout;
      uniform vec3 deckGold, deckWhite, deckGoldEmission, deckWhiteEmission;
      uniform vec2 deckIntensity;
      uniform float pickupTime, pickupMotion;
      varying vec2 pickupCoord;
      // Integral of a repeated unit-period box; differencing the integral is
      // stable even when several stripes fit inside a distant screen pixel.
      float deckIntegral(float x, float width) {
        return floor(x) * width + min(fract(x), width);
      }
      float deckStripe(float coordinate, float start, float width) {
        float footprint = max(fwidth(coordinate), .0001);
        float lo = (coordinate - start - footprint * .5) / 3.3;
        float hi = (coordinate - start + footprint * .5) / 3.3;
        float coverage = 3.3 * (deckIntegral(hi, width / 3.3) - deckIntegral(lo, width / 3.3)) / footprint;
        float end = start + (deckLayout.w - 1.) * 3.3 + width;
        float bounds = clamp((coordinate - start) / footprint + .5, 0., 1.)
          * clamp((end - coordinate) / footprint + .5, 0., 1.);
        return clamp(coverage, 0., 1.) * bounds;
      }
    `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float lateral = abs(pickupCoord.x - deckLayout.x);
      float sideCoverage = clamp((deckLayout.y - lateral) / max(fwidth(lateral), .0001) + .5, 0., 1.);
      float chevron = 1. - lateral / deckLayout.y;
      float station = pickupCoord.y - deckLayout.z;
      float gold = deckStripe(station - chevron * 1.85, -1.1, 1.25) * sideCoverage;
      float white = deckStripe(station - chevron * 1.86, .24, .15) * sideCoverage;
      float paint = clamp(gold + white, 0., 1.);
      diffuseColor.rgb = diffuseColor.rgb * (1. - paint) + deckGold * gold * .65 + deckWhite * white * .8;
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
      roughnessFactor = roughnessFactor * (1. - paint) + .37 * gold + .38 * white;
    `,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
      metalnessFactor = metalnessFactor * (1. - paint) + .22 * gold + .25 * white;
    `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
      float chase = pow(.5 + .5 * sin(pickupCoord.y * .72 - pickupTime * 6.4), 4.);
      totalEmissiveRadiance += deckGoldEmission * deckIntensity.x * gold * .18 * mix(1., .66 + chase * 1.25, pickupMotion)
        + deckWhiteEmission * deckIntensity.y * white * .32;
    `,
      );
  };
  material.customProgramCacheKey = () => 'vector-filtered-deck-v1';
  return { material, intensity: uniforms.deckIntensity.value };
}
