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
uniform float opalineWetness;
uniform float opalinePolish;
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
// Right-handed projection frames. Color, height and tangent normals use exactly
// the same signed UVs, including back faces and instanced/nonuniformly scaled parts.
vec4 opalineTriplanar(sampler2D tex, vec3 p, vec3 weights, vec3 signs) {
  return texture2D(tex, vec2(-signs.x*p.z,p.y))*weights.x
       + texture2D(tex, vec2(p.x,-signs.y*p.z))*weights.y
       + texture2D(tex, vec2(signs.z*p.x,p.y))*weights.z;
}
vec3 opalineNormalSlope(vec3 tangentNormal, vec2 strength) {
  return vec3(tangentNormal.xy*strength/max(tangentNormal.z,.2),0.);
}
vec3 opalineTriplanarNormal(sampler2D tex, vec3 p, vec3 weights, vec3 signs, vec3 baseNormal, vec2 strength) {
  vec3 nx=opalineNormalSlope(texture2D(tex,vec2(-signs.x*p.z,p.y)).xyz*2.-1.,strength);
  vec3 ny=opalineNormalSlope(texture2D(tex,vec2(p.x,-signs.y*p.z)).xyz*2.-1.,strength);
  vec3 nz=opalineNormalSlope(texture2D(tex,vec2(signs.z*p.x,p.y)).xyz*2.-1.,strength);
  vec3 slope=vec3(0.,nx.y,-signs.x*nx.x)*weights.x
            +vec3(ny.x,0.,-signs.y*ny.y)*weights.y
            +vec3(signs.z*nz.x,nz.y,0.)*weights.z;
  // Project the surface gradient onto the actual geometric tangent plane. A
  // neutral normal therefore preserves any slope, instead of biasing to axes.
  slope-=baseNormal*dot(baseNormal,slope);
  return normalize(baseNormal+slope);
}
`;
const SURFACE = /* glsl */ `
vec3 opalineWorldNormal=normalize(vOpalineNormal);
vec3 opalineWeights=pow(abs(opalineWorldNormal),vec3(4.));
opalineWeights/=max(dot(opalineWeights,vec3(1.)),.001);
vec3 opalineSigns=step(vec3(0.),opalineWorldNormal)*2.-1.;
vec3 opalineP=vOpalinePosition*opalineTextureScale;
float opalineFace=1.-smoothstep(.12,.72,opalineWorldNormal.y);
float opalineWeather=opalineNoise(vOpalinePosition.xz*.018+vec2(vOpalinePosition.y*.011,7.));
float opalineWet=clamp(opalineWetness*(.7+.3*opalineWeather),0.,1.);
float opalineCavity=0.;
#ifdef USE_MAP
  vec3 opalineColor=opalineTriplanar(map,opalineP,opalineWeights,opalineSigns).rgb;
  float opalineLuma=dot(opalineColor,vec3(.2126,.7152,.0722));
  // Preserve the scan's fractures and mineral grain, neutralize its earth-brown
  // pigment, and raise plate albedo into the authored ivory mineral palette.
  float opalineValue=clamp(pow(max(opalineLuma,.001),.58)*1.28,.035,1.06);
  vec3 opalinePigment=mix(vec3(opalineValue),opalineColor*(opalineValue/max(opalineLuma,.015)),.12);
  opalinePigment=mix(opalinePigment,vec3(.94),opalinePolish*.80);
  diffuseColor.rgb*=opalinePigment;
#endif
#ifdef USE_BUMPMAP
  float opalineHeight=opalineTriplanar(bumpMap,opalineP,opalineWeights,opalineSigns).r;
  opalineCavity=1.-smoothstep(.17,.47,opalineHeight);
#endif
vec3 opalineMineralTint=mix(vec3(.82,.77,.94),vec3(1.,.94,.82),opalineWeather);
diffuseColor.rgb*=mix(vec3(1.),opalineMineralTint,.22+opalineFace*.12);
diffuseColor.rgb*=1.-opalineWet*.16;
`;

function applyMineralSurface(
  material,
  { detail, textureScale, surface, wetness },
) {
  material.userData.opaline = {
    textureScale: { value: textureScale },
    wetness: { value: wetness },
    polish: { value: surface === 'shelf' ? 1 : 0 },
  };
  material.onBeforeCompile = (shader) => {
    const controls = material.userData.opaline;
    shader.uniforms.opalineTextureScale = controls.textureScale;
    shader.uniforms.opalineWetness = controls.wetness;
    shader.uniforms.opalinePolish = controls.polish;
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
float opalineAuthoredRoughness=.72;
#ifdef USE_ROUGHNESSMAP
  opalineAuthoredRoughness=opalineTriplanar(roughnessMap,opalineP,opalineWeights,opalineSigns).g;
#endif
float opalineDry=clamp(roughness*(.48+.64*opalineAuthoredRoughness)+opalineCavity*.10,.2,.98);
float opalineWetRoughness=mix(.23,.12,opalinePolish)+opalineAuthoredRoughness*.10;
float roughnessFactor=mix(opalineDry,opalineWetRoughness,opalineWet);
`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
#ifdef USE_NORMALMAP
  vec3 opalineBaseNormal=inverseTransformDirection(normal,viewMatrix);
  float opalineRelief=mix(1.,.045,opalinePolish)*(1.-opalineWet*.22);
  vec3 opalineBumpedNormal=opalineTriplanarNormal(normalMap,opalineP,opalineWeights,opalineSigns,opalineBaseNormal,normalScale*opalineRelief);
  normal=normalize(mat3(viewMatrix)*opalineBumpedNormal);
#elif defined(USE_BUMPMAP)
  // Height-only consumers use the physical displacement channel, never albedo.
  float opalineRelief=opalineHeight*bumpScale*mix(1.,.045,opalinePolish);
  normal=opalinePerturb(-vViewPosition,normal,vec2(dFdx(opalineRelief),dFdy(opalineRelief)),faceDirection);
#endif
`,
      );
  };
  // Surface variants use uniforms; no program per prototype, polish or wetness.
  material.customProgramCacheKey = () => `opaline-mineral-v4-${detail}`;
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
  textureScale = 1 / 16,
  surface = 'wall',
  wetness = surface === 'shelf' ? 0.65 : 0,
} = {}) {
  if (!['high', 'low'].includes(detail))
    throw new RangeError('Opaline detail must be high or low');
  if (!Number.isFinite(textureScale) || textureScale <= 0)
    throw new RangeError('Opaline textureScale must be finite and positive');
  if (!['wall', 'shelf'].includes(surface))
    throw new RangeError('Opaline surface must be wall or shelf');
  if (!Number.isFinite(wetness) || wetness < 0 || wetness > 1)
    throw new RangeError('Opaline wetness must be between 0 and 1');
  const maps = textures.stone ?? {};
  const shared = {
    map: maps.map ?? null,
    bumpMap:
      detail === 'high' ? (maps.heightMap ?? maps.bumpMap ?? null) : null,
    bumpScale: 0.65,
    normalMap: maps.normalMap ?? null,
    normalScale: new T.Vector2(
      detail === 'high' ? 0.85 : 0.6,
      detail === 'high' ? 0.85 : 0.6,
    ),
    roughnessMap: maps.roughnessMap ?? null,
  };
  const stone = applyMineralSurface(
    new T.MeshStandardMaterial({
      ...shared,
      name: 'Opaline / pearl ceramic strata',
      color: '#f1eee6',
      roughness: surface === 'shelf' ? 0.46 : 0.9,
      metalness: 0,
    }),
    { detail, textureScale, surface, wetness },
  );
  const shadow = applyMineralSurface(
    new T.MeshStandardMaterial({
      ...shared,
      name: 'Opaline / violet mineral fracture',
      color: '#b9adb8',
      roughness: surface === 'shelf' ? 0.54 : 0.96,
      metalness: 0,
    }),
    { detail, textureScale, surface, wetness },
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
