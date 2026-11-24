import { finishIceMaterial } from '../levels/glasswake/environment/materials.js';
import { appendShaderPatch, replaceShader } from '../renderer/shader-patch.js';

export function finishGlasswakeProp(material, asset, { ice }) {
  const previousCompile = material.onBeforeCompile;
  finishIceMaterial(material, ice);
  if (material.onBeforeCompile === previousCompile) return;
  if (!asset.startsWith('glacier-')) return;

  // Keep the authored cobalt floors and fractures. Only wind-exposed crowns
  // and upward-facing shoulders gather broad patches of compacted snow.
  appendShaderPatch(material, ':editor-glasswake-snow-shelf', (shader) => {
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <alphamap_fragment>',
      `#include <alphamap_fragment>
        vec3 iceSlope = normalize(vIceNormal);
        float crown = smoothstep(.48, .92, iceSlope.y);
        float shelter = iceNoise(p * vec3(.021, .054, .034));
        float windpack = smoothstep(.24, .69, shelter);
        float snowCover = max(frostIce * .8, crown * windpack * .52)
          * (1. - darkIce) * (1. - freshIce * .65);
        vec3 snowTone = mix(vec3(.48, .60, .70), vec3(.85, .88, .91),
          smoothstep(.18, .53, iceLuma * .64 + windpack * .36));
        vec3 faultTint = mix(vec3(.68, .82, .98), vec3(.88, .95, 1.),
          .5 + .5 * dot(iceSlope, normalize(vec3(.67, .12, -.73))));
        diffuseColor.rgb *= mix(faultTint, vec3(1.), max(crown, frostIce));
        diffuseColor.rgb = mix(diffuseColor.rgb, snowTone, snowCover);
      `,
    );
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .92, snowCover);
      `,
    );
  });
}
