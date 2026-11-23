import { replaceShader } from '../../renderer/shader-patch.js';

/** Filter fine salt cracks by their screen footprint to hold up at racing speed. */
export function finishNomadSalt(material, clock = { value: 0 }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.nomadSaltTravel = clock;
    shader.vertexShader = replaceShader(
      replaceShader(
        shader.vertexShader,
        '#include <common>',
        '#include <common>\nvarying vec3 saltPoint;',
      ),
      '#include <begin_vertex>',
      '#include <begin_vertex>\nsaltPoint=position;',
    );
    shader.fragmentShader = replaceShader(
      replaceShader(
        shader.fragmentShader,
        '#include <common>',
        `#include <common>
      varying vec3 saltPoint; uniform float nomadSaltTravel;
      vec2 saltHash(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}`,
      ),
      '#include <map_fragment>',
      `#include <map_fragment>
        vec2 p=vec2(saltPoint.x,saltPoint.z+nomadSaltTravel)/8.;
        vec2 cell=floor(p),f=fract(p);float first=9.,second=9.;
        for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
          vec2 g=vec2(float(x),float(y));vec2 r=g+.18+.64*saltHash(cell+g)-f;
          float d=dot(r,r);if(d<first){second=first;first=d;}else{second=min(second,d);}}
        float edge=(sqrt(second)-sqrt(first));
        float footprint=max(length(dFdx(p)),length(dFdy(p)));
        float aa=max(.001,fwidth(edge));
        float crack=(1.-smoothstep(.016-aa,.035+aa,edge))*(1.-smoothstep(.07,.25,footprint));
        float grain=fract(sin(dot(floor(p*25.),vec2(127.1,311.7)))*43758.5453);
        grain=mix(.5,grain,1.-smoothstep(.05,.35,footprint*25.));
        diffuseColor.rgb*=.96+grain*.055;
        diffuseColor.rgb*=1.-crack*.28;`,
    );
  };
  material.customProgramCacheKey = () => 'nomad-moving-salt-v2-filtered';
  return material;
}
