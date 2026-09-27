import { DoubleSide, MeshPhysicalMaterial } from 'three';

/** Reflect the consumer's environment with shallow, broken muddy margins. */
export function createPuddleMaterial(uniforms) {
  const material = new MeshPhysicalMaterial({
    name: 'Weather shallow puddles',
    color: '#33342d',
    roughness: 0.045,
    metalness: 0,
    ior: 1.333,
    envMapIntensity: 2.4,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float phase; varying vec2 vPuddleUv; varying float vPuddlePhase;',
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvPuddleUv=uv;vPuddlePhase=phase;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      uniform float time;uniform float wet;uniform float rain;uniform float snow;
      varying vec2 vPuddleUv; varying float vPuddlePhase;
    `,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
      vec2 q=(vPuddleUv-0.5)*2.0;
      float edge=length(q)+sin(q.x*7.0+vPuddlePhase*9.0)*sin(q.y*9.0+vPuddlePhase*5.0)*0.2+sin(q.x*21.0+q.y*17.0)*0.045;
      float waterMask=1.0-smoothstep(0.43,0.98,edge);
      float cycle=fract(time*1.7+vPuddlePhase*13.0);
      float waterRipple=pow(max(0.0,1.0-abs(length(q)-cycle*0.9)*33.0),2.0)*(1.0-cycle)*rain;
      diffuseColor.rgb*=mix(vec3(0.5,0.41,0.29),vec3(0.73,0.75,0.69),waterMask);
      diffuseColor.a*=waterMask*smoothstep(0.3,0.95,wet)*(1.0-smoothstep(0.08,0.5,snow))*0.88;
    `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor+=waterRipple*0.13+(1.0-waterMask)*0.25;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(dFdx(waterRipple),dFdy(waterRipple),0.0)*0.12);',
      );
  };
  material.customProgramCacheKey = () => 'weather-puddle-physical-v1';
  return material;
}
