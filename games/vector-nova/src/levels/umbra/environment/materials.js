// Member-space surfaces and CPU-baked contact shading stay attached during
// stretching. Mineral structure, exposed breaks and machined metal have distinct
// response; fine detail fades with screen footprint instead of sparkling.
export function finishUmbraMaterial(
  material,
  kind = 'stone',
  surfaceTexture = null,
) {
  if (surfaceTexture) material.map = surfaceTexture;
  const stone = ['stone', 'fresh', 'aged'].includes(kind);
  const metal = ['metal', 'plate'].includes(kind);
  material.onBeforeCompile = (shader) => {
    if (surfaceTexture) shader.uniforms.umbraAtlas = { value: surfaceTexture };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 umbraMember; varying vec3 umbraRaw; varying vec3 umbraSurface; varying vec3 umbraNormal; varying vec2 umbraDeck; varying float umbraSeed; ${kind === 'deck' ? 'attribute vec2 umbraCassette; varying vec2 umbraPanel;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        umbraRaw=position; umbraMember=position; umbraSurface=position; umbraNormal=normal; umbraDeck=position.xz; umbraSeed=0.;
        ${kind === 'deck' ? 'umbraDeck=uv; umbraPanel=umbraCassette;' : ''}
        #ifdef USE_INSTANCING
          umbraSeed=dot(instanceMatrix[3].xyz,vec3(.013,.021,.037));
          umbraMember=position*vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
          umbraSurface=mat3(instanceMatrix)*position;
          mat3 umBasis=mat3(instanceMatrix);
          umbraNormal=normalize(umBasis*(normal/vec3(dot(umBasis[0],umBasis[0]),dot(umBasis[1],umBasis[1]),dot(umBasis[2],umBasis[2]))));
          ${kind === 'plate' ? 'umbraNormal=normalize(normal/vec3(length(umBasis[0]),length(umBasis[1]),length(umBasis[2])));' : ''}
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 umbraMember; varying vec3 umbraRaw; varying vec3 umbraSurface; varying vec3 umbraNormal; varying vec2 umbraDeck; varying float umbraSeed; ${kind === 'deck' ? 'varying vec2 umbraPanel;' : ''}
      ${
        surfaceTexture
          ? `
      uniform sampler2D umbraAtlas;
      vec3 umTile(vec2 p){
        vec2 q=fract(p)*.988+.006;
        q.x=(q.x+${stone ? '1.' : metal ? '2.' : '0.'})/3.;
        return textureGrad(umbraAtlas,q,dFdx(p)*vec2(.988/3.,.988),dFdy(p)*vec2(.988/3.,.988)).rgb;
      }
      vec3 umSurfaceMap(vec3 p){
        vec3 weights=pow(abs(normalize(umbraNormal)),vec3(6.));
        weights/=max(dot(weights,vec3(1.)),.00001);
        p=p*${stone ? '.10' : metal ? '.30' : '.12'}+vec3(umbraSeed*2.7);
        return umTile(p.yz)*weights.x+umTile(p.xz)*weights.y+umTile(p.xy)*weights.z;
      }`
          : ''
      }
      float umHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float umNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(umHash(i),umHash(i+vec3(1,0,0)),f.x),mix(umHash(i+vec3(0,1,0)),umHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(umHash(i+vec3(0,0,1)),umHash(i+vec3(1,0,1)),f.x),mix(umHash(i+vec3(0,1,1)),umHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float umFbm(vec3 p){return umNoise(p)*.64+umNoise(p*2.17)*.25+umNoise(p*4.31)*.11;}
      vec3 umBump(vec3 n,float h){vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition),cx=cross(dy,n),cy=cross(n,dx);float det=dot(dx,cx);return normalize(n-sign(det)*(dFdx(h)*cx+dFdy(h)*cy)/max(abs(det),.00001));}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec3 up=${kind === 'plate' ? 'umbraMember' : 'umbraSurface'};
      float macro=umFbm(up*.065+vec3(umbraSeed));
      float grain=umNoise(up*2.1);
      float fine=umNoise(up*18.7);
      float visible=1.-smoothstep(.10,.65,max(length(dFdx(up)),length(dFdy(up))));
      float relief=0.;
      ${
        surfaceTexture
          ? `
        vec3 authoredSurface=${kind === 'deck' ? 'umTile(umbraDeck*vec2(.32,.11))' : 'umSurfaceMap(up)'};
        float surfaceTone=dot(authoredSurface,vec3(.2126,.7152,.0722));

      `
          : ''
      }
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
          : metal
            ? `
        float brush=umNoise(up*vec3(48.,.5,.7));
        brush=mix(.5,brush,1.-smoothstep(.15,1.,length(dFdx(up*vec3(48.,.5,.7)))+length(dFdy(up*vec3(48.,.5,.7)))));
        diffuseColor.rgb*=mix(.82,1.06,macro)*mix(.96,1.02,brush);
        float patina=smoothstep(.55,.72,macro)*umNoise(up*.9);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.79,.78,.72),patina*.32);
        relief=grain*.003+brush*.0012;
        ${
          kind === 'plate'
            ? `
          float arris=min(.5-abs(umbraRaw.y),.5-abs(umbraRaw.z));
          float edgeWear=(1.-smoothstep(.005,.035,arris))*smoothstep(.32,.67,umNoise(up*6.));
          float protectedFinish=1.-smoothstep(.03,.10,arris);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.85+vec3(.045),edgeWear*.65);
          diffuseColor.rgb*=1.-protectedFinish*.10;
        `
            : ''
        }
      `
            : kind === 'deck'
              ? `
        float longitudinal=umFbm(vec3(umbraDeck.x*.8,umbraDeck.y*.26,1.));
        float panelEdge=min(min(umbraPanel.x,1.-umbraPanel.x),min(umbraPanel.y,1.-umbraPanel.y));
        float dirt=1.-smoothstep(.012,.065,panelEdge);
        float polished=(1.-smoothstep(.004,.015,panelEdge))*smoothstep(.35,.7,longitudinal);
        float wear=exp(-pow((abs(umbraDeck.x)-5.8)/3.3,2.));
        vec2 cell=floor(umbraDeck/vec2(1.7,4.8));
        float scratchSeed=umHash(vec3(cell,3.));
        vec2 mark=fract(umbraDeck/vec2(1.7,4.8))-.5;
        mark.x+=(scratchSeed-.5)*.68+mark.y*(umHash(vec3(cell,7.))-.5)*.18;
        float scratchWidth=mix(.006,.016,umHash(vec3(cell,9.)));
        float abrasion=(1.-smoothstep(scratchWidth,scratchWidth+max(fwidth(mark.x)*1.5,.002),abs(mark.x)))*(1.-smoothstep(.17+scratchSeed*.08,.30+scratchSeed*.12,abs(mark.y)))*(1.-dirt)*smoothstep(.18,.5,wear)*step(.58,umHash(vec3(cell,11.)));
        diffuseColor.rgb*=1.+abrasion*.025;
        float trackGrain=umNoise(vec3(umbraDeck.x*24.,umbraDeck.y*1.7,2.));
        diffuseColor.rgb*=mix(.94,1.035,longitudinal)*(1.-dirt*.20)+wear*.028+polished*.12;
        relief=longitudinal*.0015+trackGrain*.0013*visible;
      `
              : `
        diffuseColor.rgb*=mix(.89,1.06,macro)*mix(.97,1.015,grain);
        relief=macro*.008+grain*.006+fine*.002*visible;
      `
      }
      ${surfaceTexture ? `diffuseColor.rgb*=mix(vec3(1.),clamp(authoredSurface/${stone ? 'vec3(.59,.53,.44)' : metal ? 'vec3(.26,.265,.27)' : 'vec3(.085)'},vec3(.68),vec3(1.32)),${kind === 'deck' ? '(.06+dirt*.24+abrasion*.13)' : stone ? '.8' : metal ? '.22' : '.24'});` : ''}
      ${surfaceTexture ? `relief=relief*${stone ? '.5' : '.25'}+surfaceTone*${stone ? '.06' : metal ? '.0015' : kind === 'deck' ? '.0004' : '.0012'};` : ''}`,
      )
      .replace(
        '#include <map_fragment>',
        surfaceTexture ? '' : '#include <map_fragment>',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+${surfaceTexture ? (stone ? '(surfaceTone-.35)*.14+' : '(surfaceTone-.35)*.035+') : ''}(macro-.5)*${stone ? '.14' : '.06'}${metal ? `+patina*.24${kind === 'plate' ? '-edgeWear*.13+protectedFinish*.06' : ''}` : kind === 'deck' ? '+dirt*.18-wear*.12-polished*.14-abrasion*.028' : ''},${stone ? '.72' : metal ? '.19' : '.24'},.98);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal=umBump(normal,relief);',
      );
  };
  material.customProgramCacheKey = () =>
    `umbra-surface-v5-${kind}-${!!surfaceTexture}`;
  return material;
}

export function finishUmbraAssets(scene, surfaceTexture = null) {
  const materials = new Set();
  scene.traverse((node) => {
    for (const material of [node.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const material of materials) {
    if (/fractures/i.test(material.name))
      finishUmbraMaterial(material, 'fresh', surfaceTexture);
    else if (/aged/i.test(material.name))
      finishUmbraMaterial(material, 'aged', surfaceTexture);
    else if (/ivory/i.test(material.name))
      finishUmbraMaterial(material, 'stone', surfaceTexture);
    else if (/titanium|instrument/i.test(material.name))
      finishUmbraMaterial(material, 'metal', surfaceTexture);
    else if (/graphite/i.test(material.name))
      finishUmbraMaterial(material, 'graphite', surfaceTexture);
  }
}
