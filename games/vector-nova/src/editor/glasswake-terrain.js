import { finishIceMaterial } from '../levels/glasswake/environment/materials.js';
import { appendShaderPatch, replaceShader } from '../renderer/shader-patch.js';

export function finishGlasswakeTerrain({ soil }, { ice }) {
  soil.name = 'Glasswake / windpacked frost terrain';
  soil.color.set('#a6becd');
  // Retain the shared ice texture, gather snow on the flatter ground and
  // expose darker blue ice along slopes and wind-scoured channels.
  finishIceMaterial(soil, ice);
  appendShaderPatch(soil, ':editor-glacier-terrain', (shader) => {
    const anchor = 'float vein=smoothstep';
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      anchor,
      `vec3 iceUp=normalize(vIceNormal);
      float flow=iceNoise(vec3(p.x*.0019,0.,p.z*.0037));
      float wind=iceNoise(vec3((p.x+p.z*.7)*.007,p.y*.011,p.z*.023));
      float snow=smoothstep(.42,.77,flow*.72+wind*.28)
        *smoothstep(.53,.91,iceUp.y);
      vec3 blueIce=diffuseColor.rgb*vec3(.62,.80,.95);
      vec3 snowPack=vec3(.61,.70,.77)*(.75+iceLuma*.28+wind*.20);
      diffuseColor.rgb=mix(blueIce,snowPack,snow*.82);
      ${anchor}`,
    );
  });
}

// Extend only the distant part of the existing ground ring. These ridges
// start beyond the surveyed terrain and keep its exact inner edge and normals.
const horizonEnd = 7100;
export const glasswakeHorizon = Object.freeze({
  offsets: [540, 970, 1540, 2380, 3600, 5200, horizonEnd],
  heightAt(x, z, offset, plan) {
    if (offset === horizonEnd) return 0;
    const phase = (plan.seed % 997) * 0.037;
    const fold = x * 0.0021 + z * 0.00135 + phase;
    const brokenRim = Math.abs(Math.sin(fold + 0.6 * Math.sin(z * 0.0022)));
    const mass = 0.55 + 0.45 * Math.sin(x * 0.00054 - z * 0.0009 + phase);
    const distance = (offset - 1680) / 1560;
    const distant = (offset - 4300) / 1550;
    const relief =
      360 * Math.exp(-distance * distance) + 325 * Math.exp(-distant * distant);
    return 22 + relief * (0.22 + 0.78 * brokenRim ** 1.8) * (0.6 + mass * 0.4);
  },
});
