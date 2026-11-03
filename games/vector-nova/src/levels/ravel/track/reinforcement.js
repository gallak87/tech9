import * as T from 'three';

export const carbonFunctions = `
  float ravelTow(vec2 uv){
    vec2 cell=floor(uv),p=fract(uv);
    float over=step(2.,mod(cell.x+cell.y,4.));
    return mix(4.*p.y*(1.-p.y),4.*p.x*(1.-p.x),over);
  }
`;

/** Thin formed silver lap, recessed washers and raised hexagonal bond heads.
 * The existing swept strip supplies real seated depth and follows the sail. */
export function createRavelBondMaterial() {
  const material = new T.MeshPhysicalMaterial({
    name: 'Ravel / formed racing reinforcement laps',
    color: '#a3a295',
    metalness: 0.78,
    roughness: 0.3,
    clearcoat: 0.15,
    clearcoatRoughness: 0.3,
    side: T.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 roadCoord; varying vec2 bondCoord;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nbondCoord=roadCoord;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 bondCoord;
        float ravelBondRelief(vec2 uv){
          vec2 p=vec2(mod(uv.x+4.,8.)-4.,uv.y);
          float hex=max(abs(p.y),abs(p.x)*.8660254+abs(p.y)*.5);
          float head=.016*(1.-smoothstep(.10,.14,hex));
          float washer=.006*exp(-pow((length(p)-.18)/.035,2.));
          float hem=.018*exp(-pow((abs(uv.y)-.26)/.055,2.));
          return max(head,washer)+hem;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float reinforcement=1.;
        float across=mod(bondCoord.y+50.,100.)-50.-6.*sin(bondCoord.x/170.);
        vec2 fitting=vec2(bondCoord.x,abs(across)-8.4);
        vec2 p=vec2(mod(fitting.x+4.,8.)-4.,fitting.y);
        float pixel=max(.005,max(fwidth(bondCoord.x),fwidth(across)));
        float visibleFitting=reinforcement*(1.-smoothstep(.12,.6,pixel));
        float hex=max(abs(p.y),abs(p.x)*.8660254+abs(p.y)*.5);
        float head=1.-smoothstep(.12,.12+pixel,hex);
        float washer=(1.-smoothstep(.22,.22+pixel,length(p)))*(1.-head);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.065,.08,.085),washer*visibleFitting*.8);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.50,.57,.59),head*visibleFitting*.85);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.27,reinforcement);
        roughnessFactor=mix(roughnessFactor,.23,head*visibleFitting);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.9,reinforcement);',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 dx=dFdx(fitting),dy=dFdy(fitting);
        float relief=ravelBondRelief(fitting);
        vec2 slope=vec2(ravelBondRelief(fitting+dx)-relief,ravelBondRelief(fitting+dy)-relief)*visibleFitting;
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
        vec3 rx=cross(sy,normal),ry=cross(normal,sx);float det=dot(sx,rx)*faceDirection;
        normal=normalize(abs(det)*normal-sign(det)*(slope.x*rx+slope.y*ry));`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
        material.clearcoat*=reinforcement;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'ravel-formed-reinforcement-lap-v1';
  return material;
}
