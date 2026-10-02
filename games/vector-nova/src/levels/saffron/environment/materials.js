import * as T from 'three';

function weathered(material, kind) {
  const bone = kind === 'bone';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 vSaffronWorld;\n${shader.vertexShader}`.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvec4 saffronWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nsaffronWorld=instanceMatrix*saffronWorld;\n#endif\nvSaffronWorld=(modelMatrix*saffronWorld).xyz;`,
      );
    shader.fragmentShader = `varying vec3 vSaffronWorld;
      float sHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float sNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(sHash(i),sHash(i+vec3(1,0,0)),f.x),mix(sHash(i+vec3(0,1,0)),sHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(sHash(i+vec3(0,0,1)),sHash(i+vec3(1,0,1)),f.x),mix(sHash(i+vec3(0,1,1)),sHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      ${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float broad=sNoise(vSaffronWorld*.041);
      float relief=sNoise(vSaffronWorld*${bone ? '.8' : '.28'});
      float strata=sin(vSaffronWorld.y*${bone ? '.24' : '.075'}+broad*5.);
      float filtered=1.-smoothstep(.3,1.4,length(fwidth(vSaffronWorld)));
      float pores=smoothstep(.64,.87,relief)*filtered;
      float fissure=smoothstep(.76,.94,sNoise(vSaffronWorld*vec3(.07,.20,.12)))*filtered;
      diffuseColor.rgb *= ${bone ? '.69+broad*.39+strata*.045-pores*.15-fissure*.12' : '.80+broad*.28+strata*.095'};`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+pores*.14+relief*.12-broad*.09,.45,1.);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float micro=sNoise(vSaffronWorld*${bone ? '.43' : '.32'});
      vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
      vec3 r0=cross(q1,normal),r1=cross(normal,q0);
      float det=dot(q0,r0);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(micro)*r0+dFdy(micro)*r1)*${bone ? '.075' : '.14'});`,
    );
  };
  material.customProgramCacheKey = () => `saffron-weathered-${kind}-v5`;
  return material;
}

export function createSaffronMaterials(resources, shape = false) {
  const standard = (name, options) =>
    resources.material(
      new T.MeshStandardMaterial({ name, roughness: 0.88, ...options }),
    );
  return {
    terrain: weathered(
      standard('Saffron / wind-smoothed mineral sand', {
        color: shape ? '#9b9590' : '#ffffff',
        vertexColors: true,
      }),
      'sand',
    ),
    sand: weathered(
      standard('Saffron / displaced dunes', {
        color: shape ? '#aaa6a0' : '#c9954d',
      }),
      'sand',
    ),
    bone: weathered(
      standard('Saffron / stratified ivory fossil', {
        color: shape ? '#c7c4ba' : '#d5c4a2',
      }),
      'bone',
    ),
    boneDark: weathered(
      standard('Saffron / old exposed marrow', { color: '#887353' }),
      'bone',
    ),
    mineral: weathered(
      standard('Saffron / mineral crust', {
        color: '#77584e',
        metalness: 0.08,
      }),
      'bone',
    ),
    ceramic: standard('Saffron / survey ceramic', {
      color: '#ccc2a6',
      roughness: 0.6,
      metalness: 0.25,
    }),
    dark: standard('Saffron / aged survey metal', {
      color: '#3c4249',
      roughness: 0.67,
      metalness: 0.55,
    }),
    window: standard('Saffron / smoked survey glazing', {
      color: '#31535a',
      roughness: 0.17,
      metalness: 0.6,
      emissive: '#729696',
      emissiveIntensity: 0.18,
    }),
    signal: standard('Saffron / warm survey lamps', {
      color: '#ffcb74',
      emissive: '#ffc578',
      emissiveIntensity: 0.85,
      roughness: 0.5,
    }),
    cloth: standard('Saffron / ochre shade sails', {
      color: '#a55436',
      roughness: 0.92,
      side: T.DoubleSide,
    }),
  };
}

export function applyFossilWeathering(material) {
  material.roughness = Math.max(material.roughness ?? 0.8, 0.8);
  return weathered(material, 'bone');
}

export function applyGeologicalWeathering(material) {
  return weathered(material, 'sand');
}

export function applyCreatureWeathering(material) {
  return weathered(material, 'armor');
}
