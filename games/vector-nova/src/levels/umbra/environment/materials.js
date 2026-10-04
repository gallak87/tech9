// Member-space surfaces and CPU-baked contact shading stay attached during
// stretching. Mineral structure, exposed breaks and machined metal have distinct
// response; fine detail fades with screen footprint instead of sparkling.
export function finishUmbraMaterial(material, kind = 'stone') {
  const stone = ['stone', 'fresh', 'aged'].includes(kind);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 umbraSurface; varying vec2 umbraDeck; varying float umbraSeed; ${kind === 'deck' ? 'attribute vec2 umbraCassette; varying vec2 umbraPanel;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        umbraSurface=position; umbraDeck=position.xz; umbraSeed=0.;
        ${kind === 'deck' ? 'umbraDeck=uv; umbraPanel=umbraCassette;' : ''}
        #ifdef USE_INSTANCING
          umbraSeed=dot(instanceMatrix[3].xyz,vec3(.013,.021,.037));
          umbraSurface=mat3(instanceMatrix)*position;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 umbraSurface; varying vec2 umbraDeck; varying float umbraSeed; ${kind === 'deck' ? 'varying vec2 umbraPanel;' : ''}
      float umHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float umNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(umHash(i),umHash(i+vec3(1,0,0)),f.x),mix(umHash(i+vec3(0,1,0)),umHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(umHash(i+vec3(0,0,1)),umHash(i+vec3(1,0,1)),f.x),mix(umHash(i+vec3(0,1,1)),umHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float umFbm(vec3 p){return umNoise(p)*.64+umNoise(p*2.17)*.25+umNoise(p*4.31)*.11;}
      vec3 umBump(vec3 n,float h){vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),cx=cross(dy,n),cy=cross(n,dx);float det=dot(dx,cx);return normalize(n-sign(det)*(dFdx(h)*cx+dFdy(h)*cy)/max(abs(det),.00001));}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec3 up=umbraSurface;
      float macro=umFbm(up*.065+vec3(umbraSeed));
      float grain=umNoise(up*2.1);
      float fine=umNoise(up*18.7);
      float visible=1.-smoothstep(.10,.65,max(length(dFdx(up)),length(dFdy(up))));
      float relief=0.;
      ${
        stone
          ? `
        float mineral=umFbm(up*vec3(.16,.41,.12)+vec3(macro*.8));
        float strata=sin(up.y*1.3+mineral*7.)*.5+.5;
        float splitField=umFbm(up*.32+vec3(macro*.7));
        float sparseSplit=(1.-smoothstep(.008,.035,abs(splitField-.51)))*smoothstep(.48,.73,macro);
        float deposit=smoothstep(.58,.77,macro);
        diffuseColor.rgb*=mix(${kind === 'fresh' ? '.82,1.10' : '.62,1.15'},macro)*mix(.96,1.025,mineral);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.63,.58,.47),deposit*${kind === 'fresh' ? '.08' : '.34'});
        diffuseColor.rgb*=mix(.90,1.07,mineral)*(1.-sparseSplit*.32);
        relief=(smoothstep(.32,.68,mineral)*.24+strata*.036+grain*.043+fine*.010*visible-sparseSplit*.045)*${kind === 'fresh' ? '.6' : '1.'};
      `
          : kind === 'metal'
            ? `
        float brush=umNoise(up*vec3(48.,.5,.7));
        brush=mix(.5,brush,1.-smoothstep(.15,1.,length(dFdx(up*vec3(48.,.5,.7)))+length(dFdy(up*vec3(48.,.5,.7)))));
        diffuseColor.rgb*=mix(.82,1.06,macro)*mix(.96,1.02,brush);
        relief=grain*.002+brush*.0009;
      `
            : kind === 'deck'
              ? `
        float longitudinal=umFbm(vec3(umbraDeck.x*.8,umbraDeck.y*.26,1.));
        float panelEdge=min(min(umbraPanel.x,1.-umbraPanel.x),min(umbraPanel.y,1.-umbraPanel.y));
        float dirt=1.-smoothstep(.012,.12,panelEdge);
        float polished=(1.-smoothstep(.006,.02,panelEdge))*smoothstep(.35,.7,longitudinal);
        float wear=exp(-pow((abs(umbraDeck.x)-5.8)/2.6,2.));
        float trackGrain=umNoise(vec3(umbraDeck.x*24.,umbraDeck.y*1.7,2.));
        diffuseColor.rgb*=mix(.76,1.13,longitudinal)*(1.-dirt*.14)+wear*.035+polished*.18;
        relief=longitudinal*.004+trackGrain*.0028*visible;
      `
              : `
        diffuseColor.rgb*=mix(.89,1.06,macro)*mix(.97,1.015,grain);
        relief=macro*.008+grain*.006+fine*.002*visible;
      `
      }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+(macro-.5)*${kind === 'metal' ? '.14' : '.10'},${kind === 'metal' ? '.32' : '.55'},.98);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal=umBump(normal,relief);',
      );
  };
  material.customProgramCacheKey = () => `umbra-surface-v2-${kind}`;
  return material;
}

export function finishUmbraAssets(scene) {
  const materials = new Set();
  scene.traverse((node) => {
    for (const material of [node.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const material of materials) {
    if (/fractures/i.test(material.name))
      finishUmbraMaterial(material, 'fresh');
    else if (/aged/i.test(material.name)) finishUmbraMaterial(material, 'aged');
    else if (/ivory/i.test(material.name))
      finishUmbraMaterial(material, 'stone');
    else if (/titanium|instrument/i.test(material.name))
      finishUmbraMaterial(material, 'metal');
    else if (/graphite/i.test(material.name))
      finishUmbraMaterial(material, 'graphite');
  }
}
