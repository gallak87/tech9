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
vec3 opalineWeights = pow(abs(normalize(vOpalineNormal)), vec3(4.0));
opalineWeights /= max(dot(opalineWeights, vec3(1.0)), 0.001);
vec3 opalineP = vOpalinePosition * opalineTextureScale;
float opalinePore = 0.0;
#ifdef USE_MAP
  vec4 opalineColor = opalineTriplanar(map, opalineP, opalineWeights);
  opalinePore = 1.0-smoothstep(.46,.73,dot(opalineColor.rgb,vec3(.2126,.7152,.0722)));
  diffuseColor *= opalineColor;
#endif
// Depositional colors are material layers, never painted directional shading.
// Their broad wavelength survives distant silhouettes; pore detail is the
// original substrate image, sampled consistently across assembled pieces.
float opalineBend = sin(vOpalinePosition.x*.018+sin(vOpalinePosition.z*.013))*3.5;
float opalineLayer = vOpalinePosition.y*.32+opalineBend;
float opalineVein = pow(.5+.5*sin(opalineLayer*1.63),12.0);
float opalineCloud = .5+.5*sin(vOpalinePosition.x*.027+vOpalinePosition.z*.019+sin(vOpalinePosition.y*.061));
float opalineLamina = smoothstep(.28,.82,.5+.5*sin(opalineLayer+sin(vOpalinePosition.x*.045)*.65));
vec3 opalineTint = mix(vec3(.68,.59,.75),vec3(.82,.69,.49),opalineCloud);
diffuseColor.rgb *= mix(vec3(1.0),opalineTint,.09+opalineLamina*.18+opalineVein*.29);
diffuseColor.rgb *= mix(vec3(1.0),vec3(.63,.57,.59),opalinePore*.3);
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
  roughnessFactor = clamp(roughnessFactor*(.77+opalineLamina*.25+opalinePore*.46+opalineVein*.15),.18,.98);
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
  float opalineHeight = -opalinePore*.075-opalineVein*.025;
  #ifdef USE_BUMPMAP
    opalineHeight += opalineTriplanar(bumpMap,opalineP,opalineWeights).r*bumpScale;
  #endif
  normal = opalinePerturb(-vViewPosition,normal,vec2(dFdx(opalineHeight),dFdy(opalineHeight)),faceDirection);
#endif
`,
      );
  };
  // Programs are shared by every prototype and placement of the same detail.
  material.customProgramCacheKey = () => `opaline-mineral-v2-${detail}`;
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
