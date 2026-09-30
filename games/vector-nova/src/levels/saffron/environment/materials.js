import * as T from 'three';

function weathered(material, kind) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 vSaffronWorld;\n${shader.vertexShader}`.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvec4 saffronWorld = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nsaffronWorld = instanceMatrix * saffronWorld;\n#endif\nvSaffronWorld = (modelMatrix * saffronWorld).xyz;`,
      );
    shader.fragmentShader =
      `varying vec3 vSaffronWorld;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float strata = sin(vSaffronWorld.y * ${kind === 'bone' ? '0.19' : '0.071'} + sin(vSaffronWorld.x*.009)*3. + sin(vSaffronWorld.z*.015));
      float smallGrain = sin(vSaffronWorld.x*1.9 + vSaffronWorld.z*.84) * sin(vSaffronWorld.y*2.37-vSaffronWorld.z*1.13);
      float windRibs = sin((vSaffronWorld.x*.68+vSaffronWorld.z*.39)+sin(vSaffronWorld.z*.04)*2.);
      diffuseColor.rgb *= ${kind === 'bone' ? '0.95 + strata * 0.065 + smallGrain * .035' : '0.96 + strata * 0.05 + windRibs * .024 + smallGrain * .025'};
      `,
      );
  };
  material.customProgramCacheKey = () => `saffron-weathered-${kind}-v1`;
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
