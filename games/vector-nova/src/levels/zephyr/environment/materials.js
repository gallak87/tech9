// Local metric surface detail: geometry owns silhouettes and carved relief;
// these layers give the stone pores, sediment, repaired joints and bronze patina.
const noise = `
float zephyrHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float zephyrNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(zephyrHash(i),zephyrHash(i+vec3(1,0,0)),f.x),mix(zephyrHash(i+vec3(0,1,0)),zephyrHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(zephyrHash(i+vec3(0,0,1)),zephyrHash(i+vec3(1,0,1)),f.x),mix(zephyrHash(i+vec3(0,1,1)),zephyrHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
export function finishZephyrMaterial(material, { stoneTexture } = {}) {
  if (
    material.userData.zephyrFinished ||
    /water|foam|silver|glass/i.test(material.name)
  )
    return;
  material.userData.zephyrFinished = true;
  const bronze = /bronze|copper/i.test(material.name);
  const rock = /strata|underside/i.test(material.name);
  if (stoneTexture && !bronze) material.map = stoneTexture;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 zephyrSurface;varying vec3 zephyrLocalNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nzephyrSurface=position;zephyrLocalNormal=normal;',
      );
    shader.fragmentShader =
      'varying vec3 zephyrSurface;varying vec3 zephyrLocalNormal;\n' +
      noise +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
      vec3 zp=zephyrSurface;
      float broad=zephyrNoise(zp*.17);
      float grain=zephyrNoise(zp*3.2);
      float pore=pow(zephyrNoise(zp*11.),4.);
      float sediment=zephyrNoise(vec3(zp.x*.14,zp.y*.9,zp.z*.14));
      ${
        bronze
          ? `float patina=smoothstep(.48,.78,broad)*.55;
      diffuseColor.rgb=mix(diffuseColor.rgb*(.64+grain*.5),vec3(.075,.14,.125),patina);`
          : `diffuseColor.rgb*=.72+broad*.22+grain*.12-pore*.12;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.67,.61),smoothstep(.57,.8,sediment)*.33);
      ${rock ? 'float strata=zephyrNoise(vec3(zp.x*.05,zp.y*.42,zp.z*.05));float fracture=pow(1.-abs(zephyrNoise(zp*.18)*2.-1.),14.);diffuseColor.rgb*=(.82+strata*.2)*(1.-fracture*.16);' : ''}`
      }
    `,
        )
        .replace(
          '#include <map_fragment>',
          material.map
            ? `
      vec3 blend=pow(abs(zephyrLocalNormal),vec3(4.));blend/=max(.0001,blend.x+blend.y+blend.z);
      vec3 stoneSample=texture2D(map,zephyrSurface.yz*.15).rgb*blend.x+texture2D(map,zephyrSurface.xz*.15).rgb*blend.y+texture2D(map,zephyrSurface.xy*.15).rgb*blend.z;
      diffuseColor.rgb*=mix(vec3(1.),clamp(stoneSample/vec3(.45,.42,.36),.5,1.5),.72);
    `
            : '',
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
      float relief=zephyrNoise(zephyrSurface*1.7)*.07+zephyrNoise(zephyrSurface*8.)*.018;
      ${rock ? 'relief+=zephyrNoise(zephyrSurface*.25)*.38;' : ''}
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
      vec3 rx=cross(sy,normal),ry=cross(normal,sx);
      float det=dot(sx,rx);float safeDet=max(abs(det),.00001);
      normal=normalize(normal-sign(det)*(dFdx(relief)*rx+dFdy(relief)*ry)/safeDet);
    `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
    roughnessFactor=clamp(roughnessFactor+zephyrNoise(zephyrSurface*2.1)*.12-.06,.2,1.);`,
        );
  };
  material.customProgramCacheKey = () =>
    `zephyr-weathered-v4-${bronze}-${rock}-${!!material.map}`;
}
