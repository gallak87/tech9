import * as T from 'three';
import { assetURL } from '../../../assets/url.js';

export const SAFFRON_WEATHERING_SIZE = 64;
export const SAFFRON_WEATHERING_URL = assetURL(
  'assets/levels/saffron/weathering-noise-v1.r8',
);
export const SAFFRON_MINERAL_URL = assetURL(
  'assets/levels/shatterline/limestone-v1.png',
);

function createMineralSurface(resources, shape, loadSurface) {
  const surface = { texture: null, ready: Promise.resolve(false) };
  if (shape || (!loadSurface && typeof document === 'undefined'))
    return surface;
  surface.ready = Promise.resolve()
    .then(() =>
      (loadSurface ?? ((url) => new T.TextureLoader().loadAsync(url)))(
        SAFFRON_MINERAL_URL,
      ),
    )
    .then((texture) => {
      let released = false;
      texture.addEventListener('dispose', () => {
        released = true;
      });
      // The owner disposes late arrivals immediately; never attach those to a
      // material after a cancelled or failed environment has unwound.
      resources.texture(texture);
      if (released) return false;
      texture.name = 'Saffron / shared mineral surface from Shatterline';
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      surface.texture = texture;
      return true;
    })
    .catch((cause) => {
      throw new Error('Saffron mineral surface could not load', { cause });
    });
  return surface;
}

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

function weathered(material, kind, texture, mineralSurface = null) {
  if (!texture) return material;
  const bone = kind === 'bone';
  const marrow = bone && /marrow|cancellous|fracture/i.test(material.name);
  const chalk = bone && /chalk_edges/i.test(material.name);
  const mineralScale = bone
    ? marrow
      ? 1 / 16
      : chalk
        ? 1 / 24
        : 1 / 32
    : 1 / 54;
  const mineralStrength = bone ? (marrow ? 0.64 : chalk ? 0.24 : 0.42) : 0.72;
  const mineralRelief = bone ? (marrow ? 0.22 : chalk ? 0.045 : 0.075) : 0.24;
  // Also expose the shader-owned sampler to resource collection/accounting.
  material.saffronWeatheringNoise = texture;
  material.onBeforeCompile = (shader) => {
    const mineral = mineralSurface?.texture;
    shader.uniforms.saffronWeatheringNoise = { value: texture };
    if (mineral) {
      shader.uniforms.saffronMineralSurface = { value: mineral };
      // The renderer inventories direct material texture properties.
      material.saffronMineralSurface = mineral;
    }
    shader.vertexShader =
      `varying vec3 vSaffronWorld;\n${shader.vertexShader}`.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvec4 saffronWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nsaffronWorld=instanceMatrix*saffronWorld;\n#endif\nvSaffronWorld=(modelMatrix*saffronWorld).xyz;`,
      );
    shader.fragmentShader = `varying vec3 vSaffronWorld;
      uniform highp sampler3D saffronWeatheringNoise;
      ${mineral ? 'uniform sampler2D saffronMineralSurface;' : ''}
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
      diffuseColor.rgb *= ${bone ? '.74+broad*.31+strata*.018-pores*.045-fissure*.10' : '.80+broad*.28+strata*.095'};
      float mineralHeight=0.;
      ${
        mineral
          ? `
      vec3 mineralNormal=normalize(cross(dFdx(vSaffronWorld),dFdy(vSaffronWorld)));
      vec3 mineralWeights=pow(abs(mineralNormal),vec3(4.));
      mineralWeights/=max(.0001,mineralWeights.x+mineralWeights.y+mineralWeights.z);
      vec3 mineralPoint=vSaffronWorld*${mineralScale.toFixed(8)};
      vec3 mineralColor=texture2D(saffronMineralSurface,mineralPoint.yz).rgb*mineralWeights.x
        +texture2D(saffronMineralSurface,mineralPoint.xz).rgb*mineralWeights.y
        +texture2D(saffronMineralSurface,mineralPoint.xy).rgb*mineralWeights.z;
      float mineralLuminance=dot(mineralColor,vec3(.2126,.7152,.0722));
      float mineralFade=1.-smoothstep(900.,2800.,length(vViewPosition));
      diffuseColor.rgb*=mix(vec3(1.),${bone ? 'vec3(clamp(mineralLuminance*2.25,.56,1.18))' : 'clamp(mineralColor*1.7,vec3(.45),vec3(1.18))'},${mineralStrength.toFixed(3)}*mineralFade);
      ${
        bone && !marrow
          ? `float leached=sNoise(vSaffronWorld*vec3(.012,.020,.009));
      diffuseColor.rgb*=mix(vec3(.91,.89,.83),vec3(1.08,1.06,1.0),smoothstep(.23,.77,leached));`
          : ''
      }
      mineralHeight=(mineralLuminance-.5)*${mineralRelief.toFixed(3)}*mineralFade;
      `
          : ''
      }`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+pores*.14+relief*.12-broad*.09,.45,1.);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float micro=sNoise(vSaffronWorld*${bone ? '.43' : '.32'})*${bone ? '.075' : '.14'}+mineralHeight;
      vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
      vec3 r0=cross(q1,normal),r1=cross(normal,q0);
      float det=dot(q0,r0);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(micro)*r0+dFdy(micro)*r1));`,
    );
  };
  material.customProgramCacheKey = () =>
    `saffron-baked-weathered-${kind}-v3-${marrow ? 'marrow' : chalk ? 'chalk' : 'shell'}-${Boolean(mineralSurface?.texture)}`;
  return material;
}

export function createSaffronMaterials(
  resources,
  shape = false,
  { loadNoise, loadSurface } = {},
) {
  const noise = createBakedNoise(resources, shape, loadNoise);
  const mineralSurface = createMineralSurface(resources, shape, loadSurface);
  const standard = (name, options) =>
    resources.material(
      new T.MeshStandardMaterial({ name, roughness: 0.88, ...options }),
    );
  return {
    weatheringTexture: noise.texture,
    mineralSurface,
    ready: Promise.all([noise.ready, mineralSurface.ready]).then((loaded) =>
      loaded.some(Boolean),
    ),
    bedrock: weathered(
      standard('Saffron / layered exposed sandstone', {
        color: shape ? '#aaa6a0' : '#ffffff',
        vertexColors: !shape,
        roughness: 0.95,
        flatShading: false,
      }),
      'bedrock',
      noise.texture,
      mineralSurface,
    ),
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
      mineralSurface,
    ),
    boneDark: weathered(
      standard('Saffron / old exposed marrow', { color: '#887353' }),
      'bone',
      noise.texture,
      mineralSurface,
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

export function applyFossilWeathering(material, texture, mineralSurface) {
  material.roughness = Math.max(material.roughness ?? 0.8, 0.8);
  return weathered(material, 'bone', texture, mineralSurface);
}

export function applyGeologicalWeathering(material, texture) {
  return weathered(material, 'sand', texture);
}

export function applyCreatureWeathering(material, texture) {
  return weathered(material, 'armor', texture);
}
