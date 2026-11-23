import * as T from 'three';
import { replaceShader } from '../../../renderer/shader-patch.js';
import { NACRE_WAVE_GLSL } from '../../nacre/environment/ocean-waves.js';

// Original sheltered-basin finish shared without its campaign placement.
export function createNightweirBasinMaterial(
  clock,
  rippleTexture,
  { name = 'Nightweir / sheltered flowing basin', color = '#29484b' } = {},
) {
  const river = new T.MeshStandardMaterial({
    name,
    color,
    roughness: 0.22,
    metalness: 0.12,
  });
  river.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = clock;
    shader.uniforms.basinRipples = { value: rippleTexture };
    shader.vertexShader =
      'uniform float waterTime;varying vec3 waterPoint;\n' +
      NACRE_WAVE_GLSL +
      '\n' +
      replaceShader(
        replaceShader(
          shader.vertexShader,
          '#include <begin_vertex>',
          '#include <begin_vertex>\nNacreOcean wave=nacreOcean(position.xz,waterTime,vec3(.055,0.,0.),vec3(50.,0.,0.));transformed+=wave.displacement;waterPoint=position;',
        ),
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nNacreOcean wn=nacreOcean(position.xz,waterTime,vec3(.055,0.,0.),vec3(50.,0.,0.));objectNormal=normalize(normal+(wn.normal-vec3(0.,1.,0.))*.35);',
      );
    shader.fragmentShader =
      'varying vec3 waterPoint;uniform float waterTime;uniform sampler2D basinRipples;\n' +
      replaceShader(
        replaceShader(
          shader.fragmentShader,
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        vec2 current=vec2(waterTime*.00025,waterTime*.0007);
        vec2 broad=texture2D(basinRipples,waterPoint.xz*.004+current).rg*2.-1.;
        vec2 fine=texture2D(basinRipples,waterPoint.xz*.045-current*4.).rg*2.-1.;
        float nearRipple=1.-smoothstep(400.,2400.,length(vViewPosition));
        vec2 slope=broad*.48+fine*.22*nearRipple;
        roughnessFactor=.21+min(.10,length(broad)*.22);
      `,
        ),
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Mipmapped wind/current ripples break the reflected sky at basin scale;
        // the coarse analytic wave mesh still supplies the underlying normal.
        normal=normalize(normal+mat3(viewMatrix)*vec3(slope.x,0.,slope.y));
      `,
      );
  };
  river.customProgramCacheKey = () => 'nightweir-nacre-basin-v2';
  return river;
}
