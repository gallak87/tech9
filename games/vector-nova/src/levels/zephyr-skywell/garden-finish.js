import { replaceShader } from '../../renderer/shader-patch.js';

// Local cultivated topsoil over the canonical mineral finish. Source-local
// height and normals keep the cliff faces and pale outer rim untouched; the
// existing triplanar grain, relief and lighting remain the substrate.
export function finishSkywellGarden(
  material,
  { footprint = [143, 120], strength = 0.82 } = {},
) {
  if (
    material.userData.skywellGardenFinished ||
    !/ancient.*strata|topsoil|grass|turf/i.test(material.name)
  )
    return material;
  if (!material.userData.zephyrFinished)
    throw new Error(
      'Skywell garden finish requires the canonical Zephyr finish first',
    );

  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  const radiusX = Math.max(1, footprint[0]);
  const radiusZ = Math.max(1, footprint[1]);
  const opacity = Math.max(0, Math.min(1, strength));
  material.userData.skywellGardenFinished = true;
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = replaceShader(
      shader.fragmentShader,
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      // Cultivation follows the actual y=0 mineral court, not every upward
      // ledge of the island. An irregular bare rim retains the limestone edge.
      float skywellCourtUp=smoothstep(.78,.96,normalize(zephyrLocalNormal).y);
      float skywellCourtHeight=1.-smoothstep(.8,4.,abs(zephyrSurface.y));
      vec2 skywellCourtRadius=vec2(zephyrSurface.x/${radiusX.toFixed(4)},zephyrSurface.z/${radiusZ.toFixed(4)}-.07);
      float skywellCourtRim=1.-smoothstep(.58,.80,length(skywellCourtRadius));
      float skywellCourt=skywellCourtUp*skywellCourtHeight*skywellCourtRim;
      if(skywellCourt>.001){
        vec3 skywellBed=vec3(zephyrSurface.x*.027,7.9,zephyrSurface.z*.027);
        float skywellMeadow=zephyrNoise(skywellBed);
        float skywellCourtBreak=zephyrNoise(vec3(zephyrSurface.x*.071,3.4,zephyrSurface.z*.071));
        float skywellPlanting=smoothstep(.36,.62,skywellMeadow*.76+skywellCourtBreak*.24)*skywellCourt;
        // Broad muted sage/olive courts retain the original rock's lightness
        // variation and shallow relief. No luminous lawn or fine grass noise.
        vec3 skywellSage=mix(vec3(.13,.175,.085),vec3(.205,.235,.145),skywellMeadow);
        float skywellMineralLight=clamp(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))/.28,.65,1.35);
        diffuseColor.rgb=mix(diffuseColor.rgb,skywellSage*skywellMineralLight,skywellPlanting*${opacity.toFixed(4)});
        roughnessFactor=mix(roughnessFactor,.92,skywellPlanting*.65);
      }
      `,
    );
  };
  material.customProgramCacheKey = () =>
    `${key}:skywell-mineral-gardens-v1:${radiusX}:${radiusZ}:${opacity}`;
  material.needsUpdate = true;
  return material;
}
