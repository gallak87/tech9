// Object-space detail stays attached during tidal stretching and fragment motion.
// Geometry supplies the large fractures; these fields add stone pores, graphite
// grain and machined metal response without loading unowned texture resources.
export function finishUmbraMaterial(material, kind = 'stone') {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 umbraSurface;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\numbraSurface=position;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 umbraSurface;
      float umHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float umNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(umHash(i),umHash(i+vec3(1,0,0)),f.x),mix(umHash(i+vec3(0,1,0)),umHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(umHash(i+vec3(0,0,1)),umHash(i+vec3(1,0,1)),f.x),mix(umHash(i+vec3(0,1,1)),umHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float umFbm(vec3 p){return umNoise(p)*.57+umNoise(p*2.13)*.28+umNoise(p*4.57)*.15;}
      vec3 umBump(vec3 n,float h){vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),cx=cross(dy,n),cy=cross(n,dx);float det=dot(dx,cx);return normalize(n-sign(det)*(dFdx(h)*cx+dFdy(h)*cy)/max(abs(det),.00001));}
      `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec3 up=umbraSurface;
      float macro=umFbm(up*.15);
      float grain=umNoise(up*3.4);
      float fine=umNoise(up*14.7);
      float fineVisibility=1.-smoothstep(.12,.8,max(length(dFdx(up)),length(dFdy(up))));
      float warped=umFbm(up*.39+vec3(macro*1.7));
      float vein=(1.-smoothstep(.008,.031,abs(warped-.48)))*smoothstep(.2,.6,macro);
      float stoneRelief=macro*.13+grain*.025-vein*.022+fine*.006*fineVisibility;
      ${kind === 'stone' ? 'diffuseColor.rgb*=mix(.74,1.15,macro)*mix(.95,1.025,grain)*(1.-vein*.29); diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.78,.72,.66),smoothstep(.59,.73,macro)*.25);' : kind === 'metal' ? 'float brush=sin((up.x+up.z)*70.+umNoise(up*.4)*2.)*.5+.5; brush=mix(.5,brush,fineVisibility); diffuseColor.rgb*=mix(.79,1.12,macro)*mix(.91,1.06,brush); stoneRelief=grain*.007+brush*.002;' : 'diffuseColor.rgb*=mix(.76,1.13,macro)*mix(.93,1.03,grain); stoneRelief=macro*.014+grain*.014+fine*.005*fineVisibility;'}
      `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(macro-.5)*${kind === 'metal' ? '.20' : '.16'},.26,.98);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal=umBump(normal,stoneRelief);',
      );
  };
  material.customProgramCacheKey = () => `umbra-surface-v1-${kind}`;
  return material;
}

export function finishUmbraAssets(scene) {
  const materials = new Set();
  scene.traverse((node) => {
    for (const material of [node.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const material of materials) {
    if (/ivory|fractures/i.test(material.name))
      finishUmbraMaterial(material, 'stone');
    else if (/titanium|instrument/i.test(material.name))
      finishUmbraMaterial(material, 'metal');
    else if (/graphite/i.test(material.name))
      finishUmbraMaterial(material, 'graphite');
  }
}
