import * as T from 'three';
import { assetURL } from '../../../assets/url.js';

export const SAFFRON_WEATHERING_SIZE = 64;
export const SAFFRON_WEATHERING_URL = assetURL(
  'assets/levels/saffron/weathering-noise-v1.r8',
);

function createBakedNoise(resources, shape, loadNoise) {
  if (shape) return { texture: null, ready: Promise.resolve(false) };
  const texture = resources.texture(
    new T.Data3DTexture(
      new Uint8Array(SAFFRON_WEATHERING_SIZE ** 3).fill(128),
      SAFFRON_WEATHERING_SIZE,
      SAFFRON_WEATHERING_SIZE,
      SAFFRON_WEATHERING_SIZE,
    ),
  );
  texture.name = 'Saffron / shared baked weathering noise';
  texture.format = T.RedFormat;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = T.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  let disposed = false;
  texture.addEventListener('dispose', () => {
    disposed = true;
  });
  const canLoad = loadNoise || typeof document !== 'undefined';
  const ready = canLoad
    ? Promise.resolve()
        .then(() => {
          const loader = new T.FileLoader().setResponseType('arraybuffer');
          return (loadNoise ?? ((url) => loader.loadAsync(url)))(
            SAFFRON_WEATHERING_URL,
          );
        })
        .then((bytes) => {
          const data =
            bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          if (data.byteLength !== SAFFRON_WEATHERING_SIZE ** 3)
            throw new Error('Invalid Saffron weathering volume length');
          if (disposed) return false;
          texture.image.data = data;
          texture.needsUpdate = true;
          return true;
        })
        .catch((cause) => {
          throw new Error('Saffron baked material detail could not load', {
            cause,
          });
        })
    : Promise.resolve(false);
  return { texture, ready };
}

function weathered(material, kind, texture) {
  if (!texture) return material;
  const bone = kind === 'bone';
  // Also expose the shader-owned sampler to resource collection/accounting.
  material.saffronWeatheringNoise = texture;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.saffronWeatheringNoise = { value: texture };
    shader.vertexShader =
      `varying vec3 vSaffronWorld;\n${shader.vertexShader}`.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvec4 saffronWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nsaffronWorld=instanceMatrix*saffronWorld;\n#endif\nvSaffronWorld=(modelMatrix*saffronWorld).xyz;`,
      );
    shader.fragmentShader = `varying vec3 vSaffronWorld;
      uniform highp sampler3D saffronWeatheringNoise;
      float sNoise(vec3 p){vec3 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);return textureGrad(saffronWeatheringNoise,(cell+f+.5)/64.,dFdx(p)/64.,dFdy(p)/64.).r;}
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
  material.customProgramCacheKey = () => `saffron-baked-weathered-${kind}-v1`;
  return material;
}

export function createSaffronMaterials(
  resources,
  shape = false,
  { loadNoise } = {},
) {
  const noise = createBakedNoise(resources, shape, loadNoise);
  const standard = (name, options) =>
    resources.material(
      new T.MeshStandardMaterial({ name, roughness: 0.88, ...options }),
    );
  return {
    weatheringTexture: noise.texture,
    ready: noise.ready,
    terrain: weathered(
      standard('Saffron / wind-smoothed mineral sand', {
        color: shape ? '#9b9590' : '#ffffff',
        vertexColors: true,
      }),
      'sand',
      noise.texture,
    ),
    sand: weathered(
      standard('Saffron / displaced dunes', {
        color: shape ? '#aaa6a0' : '#c9954d',
      }),
      'sand',
      noise.texture,
    ),
    bone: weathered(
      standard('Saffron / stratified ivory fossil', {
        color: shape ? '#c7c4ba' : '#d5c4a2',
      }),
      'bone',
      noise.texture,
    ),
    boneDark: weathered(
      standard('Saffron / old exposed marrow', { color: '#887353' }),
      'bone',
      noise.texture,
    ),
    mineral: weathered(
      standard('Saffron / mineral crust', {
        color: '#77584e',
        metalness: 0.08,
      }),
      'bone',
      noise.texture,
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

export function applyFossilWeathering(material, texture) {
  material.roughness = Math.max(material.roughness ?? 0.8, 0.8);
  return weathered(material, 'bone', texture);
}

export function applyGeologicalWeathering(material, texture) {
  return weathered(material, 'sand', texture);
}

export function applyCreatureWeathering(material, texture) {
  return weathered(material, 'armor', texture);
}
