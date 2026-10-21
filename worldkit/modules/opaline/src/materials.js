import * as T from 'three';

const VERTEX_PARS = /* glsl */ `
varying vec3 vOpalinePosition;
varying vec3 vOpalineNormal;
`;
const VERTEX_POSITION = /* glsl */ `
vec4 opalineWorldPosition = vec4(transformed, 1.0);
#ifdef USE_BATCHING
  opalineWorldPosition = batchingMatrix * opalineWorldPosition;
#endif
#ifdef USE_INSTANCING
  opalineWorldPosition = instanceMatrix * opalineWorldPosition;
#endif
vOpalinePosition = (modelMatrix * opalineWorldPosition).xyz;
vOpalineNormal = inverseTransformDirection(transformedNormal, viewMatrix);
`;
const FRAGMENT_PARS = /* glsl */ `
varying vec3 vOpalinePosition;
varying vec3 vOpalineNormal;
uniform float opalineTextureScale;
float opalineHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float opalineNoise(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(opalineHash(cell),opalineHash(cell+vec2(1.,0.)),f.x),mix(opalineHash(cell+vec2(0.,1.)),opalineHash(cell+vec2(1.,1.)),f.x),f.y);
}

vec3 opalinePerturb(vec3 surfPosition, vec3 surfNormal, vec2 heightDerivative, float faceSign) {
  vec3 dx=normalize(dFdx(surfPosition)), dy=normalize(dFdy(surfPosition));
  vec3 r1=cross(dy,surfNormal),r2=cross(surfNormal,dx);
  float determinant=dot(dx,r1)*faceSign;
  vec3 gradient=sign(determinant)*(heightDerivative.x*r1+heightDerivative.y*r2);
  return normalize(abs(determinant)*surfNormal-gradient);
}
vec4 opalineTriplanar(sampler2D tex, vec3 p, vec3 weights) {
  return texture2D(tex, p.zy) * weights.x + texture2D(tex, p.xz) * weights.y + texture2D(tex, p.xy) * weights.z;
}
`;
const SURFACE = /* glsl */ `
vec3 opalineWorldNormal=normalize(vOpalineNormal);
vec3 opalineWeights=pow(abs(opalineWorldNormal),vec3(4.));
opalineWeights/=max(dot(opalineWeights,vec3(1.)),.001);
vec3 opalineP=vOpalinePosition*opalineTextureScale;
float opalinePore=0.;
#ifdef USE_MAP
  vec4 opalineColor=opalineTriplanar(map,opalineP,opalineWeights);
  opalinePore=1.-smoothstep(.43,.72,dot(opalineColor.rgb,vec3(.2126,.7152,.0722)));
  diffuseColor*=opalineColor;
#endif
// All field coordinates are world metres, including instanced/scaled geology.
// Quiet glazed upper surfaces and rough fracture faces share the same substrate.
float opalineFace=1.-smoothstep(.12,.72,opalineWorldNormal.y);
float opalineDeposit=opalineNoise(vOpalinePosition.xz*.023+vec2(11.,3.));
float opalineWeather=opalineNoise(vec2(vOpalinePosition.x*.047+vOpalinePosition.z*.021,vOpalinePosition.y*.061)+vec2(7.,17.));
float opalineLayer=vOpalinePosition.y*.105+opalineDeposit*1.8+opalineWeather*.4;
float opalinePeriod=fract(opalineLayer);
float opalineVein=1.-smoothstep(.018,.065+fwidth(opalineLayer),abs(opalinePeriod-.46));
float opalineLamina=smoothstep(.2,.62,opalinePeriod)*(1.-smoothstep(.70,.95,opalinePeriod));
float opalineRecess=smoothstep(.47,.76,opalineWeather)*opalineFace;
vec3 opalineDepositTint=mix(vec3(.72,.64,.81),vec3(.92,.79,.58),smoothstep(.25,.75,opalineDeposit));
float opalineTintStrength=.12+opalineLamina*.20+opalineFace*.12+opalineVein*.20*opalineFace;
diffuseColor.rgb*=mix(vec3(1.),opalineDepositTint,opalineTintStrength);
diffuseColor.rgb*=mix(vec3(1.),vec3(.70,.65,.76),opalineRecess*.38+opalinePore*(.10+.1*opalineFace));
`;

function applyMineralSurface(material, { detail, textureScale }) {
  material.userData.opaline = { textureScale: { value: textureScale } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.opalineTextureScale =
      material.userData.opaline.textureScale;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n${VERTEX_POSITION}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <map_fragment>', SURFACE)
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  roughnessFactor *= opalineTriplanar(roughnessMap, opalineP, opalineWeights).g;
#else
  roughnessFactor = clamp(roughnessFactor*(.79+opalineFace*.29+opalineWeather*.12+opalinePore*.20+opalineVein*.10),.2,.98);
#endif
`,
      );
    if (detail === 'high')
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
#ifdef USE_NORMALMAP
  #include <normal_fragment_maps>
#else
  float opalineHeight = -opalinePore*(.025+.035*opalineFace)-opalineVein*.035*opalineFace-opalineRecess*.055;
  #ifdef USE_BUMPMAP
    opalineHeight += opalineTriplanar(bumpMap,opalineP,opalineWeights).r*bumpScale;
  #endif
  normal = opalinePerturb(-vViewPosition,normal,vec2(dFdx(opalineHeight),dFdy(opalineHeight)),faceDirection);
#endif
`,
      );
  };
  // Programs are shared by every prototype and placement of the same detail.
  material.customProgramCacheKey = () => `opaline-mineral-v3-${detail}`;
  return material;
}

/**
 * Borrowed texture maps are never changed or disposed. Consumers own loading,
 * RepeatWrapping and sRGB on the color image. No renderer or transmission pass
 * is allocated. Make another palette for surface variants: Material.clone()
 * does not preserve Three's onBeforeCompile callback.
 */
export function createOpalineMaterials({
  textures = {},
  detail = 'high',
  textureScale = 0.07,
} = {}) {
  if (!['high', 'low'].includes(detail))
    throw new RangeError('Opaline detail must be high or low');
  if (!Number.isFinite(textureScale) || textureScale <= 0)
    throw new RangeError('Opaline textureScale must be finite and positive');
  const maps = textures.stone ?? {};
  const shared = {
    map: maps.map ?? null,
    bumpMap: detail === 'high' ? (maps.bumpMap ?? null) : null,
    bumpScale: 0.24,
    normalMap: maps.normalMap ?? null,
    normalScale: new T.Vector2(0.45, 0.45),
    roughnessMap: maps.roughnessMap ?? null,
  };
  const stone = applyMineralSurface(
    new T.MeshStandardMaterial({
      ...shared,
      name: 'Opaline / pearl ceramic strata',
      color: '#f1eee6',
      roughness: 0.55,
      metalness: 0.025,
    }),
    { detail, textureScale },
  );
  const shadow = applyMineralSurface(
    new T.MeshStandardMaterial({
      ...shared,
      name: 'Opaline / violet mineral fracture',
      color: '#b9adb8',
      roughness: 0.78,
      metalness: 0.015,
    }),
    { detail, textureScale },
  );
  const translucent = new T.MeshPhysicalMaterial({
    name: 'Opaline / thin emerald mineral membrane',
    color: '#abd8bc',
    roughness: 0.28,
    metalness: 0.06,
    opacity: 0.68,
    transparent: true,
    depthWrite: false,
    emissive: '#247b62',
    emissiveIntensity: 0.28,
    iridescence: 0.18,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 340],
    side: T.DoubleSide,
  });
  const vein = new T.MeshStandardMaterial({
    name: 'Opaline / wet jade mineral seam',
    color: '#7daf9d',
    roughness: 0.36,
    metalness: 0.05,
    emissive: '#246951',
    emissiveIntensity: 0.2,
  });
  const materials = { stone, shadow, translucent, vein };
  let disposed = false;
  return {
    ...materials,
    materials,
    materialList: Object.values(materials),
    dispose() {
      if (disposed) return;
      disposed = true;
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}
