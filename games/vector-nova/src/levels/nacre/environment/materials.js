import * as T from 'three';

const mineralShader = `uniform sampler2D nacreMineralColor;
uniform sampler2D nacreMineralNormal;
// A derivative frame reorients each projected OpenGL normal to the actual
// world-space face, including mirrored UV axes. A flat input returns that face.
vec3 nacreMineralFrame(vec3 face,vec3 dx,vec3 dy,vec2 uvDx,vec2 uvDy,vec3 mapped) {
  vec3 acrossY=cross(dy,face),acrossX=cross(face,dx);
  vec3 tangent=acrossY*uvDx.x+acrossX*uvDy.x;
  vec3 bitangent=acrossY*uvDx.y+acrossX*uvDy.y;
  float normalization=inversesqrt(max(.0000000001,max(dot(tangent,tangent),dot(bitangent,bitangent))));
  return normalize((tangent*mapped.x+bitangent*mapped.y)*normalization+face*mapped.z);
}
`;
const mineralColor = `        vec3 mineralDx=dFdx(nacreWorld),mineralDy=dFdy(nacreWorld);
        vec3 mineralFace=normalize(cross(mineralDx,mineralDy));
        vec3 mineralWeights=pow(abs(mineralFace),vec3(4.));
        mineralWeights/=max(.0001,mineralWeights.x+mineralWeights.y+mineralWeights.z);
        // One tile every16m: photographed fracture and fine grain stay below
        // the authored joints. Luminance keeps the rain-wet slate identity.
        vec2 mineralUVX=nacreWorld.zy/16.;
        vec2 mineralUVY=nacreWorld.xz/16.;
        vec2 mineralUVZ=nacreWorld.xy/16.;
        vec2 mineralUx=dFdx(mineralUVX),mineralVx=dFdy(mineralUVX);
        vec2 mineralUy=dFdx(mineralUVY),mineralVy=dFdy(mineralUVY);
        vec2 mineralUz=dFdx(mineralUVZ),mineralVz=dFdy(mineralUVZ);
        vec3 mineralColor=textureGrad(nacreMineralColor,mineralUVX,mineralUx,mineralVx).rgb*mineralWeights.x
          +textureGrad(nacreMineralColor,mineralUVY,mineralUy,mineralVy).rgb*mineralWeights.y
          +textureGrad(nacreMineralColor,mineralUVZ,mineralUz,mineralVz).rgb*mineralWeights.z;
        float mineralLuma=dot(mineralColor,vec3(.2126,.7152,.0722));
        float mineralVisibility=1.-smoothstep(.035,.18,footprint/16.);
        float mineralTone=clamp(.43+mineralLuma*2.8,.70,1.30);
        diffuseColor.rgb*=mix(1.,mineralTone,.75*mineralVisibility);
        vec3 mineralNX=mix(vec3(0.,0.,1.),textureGrad(nacreMineralNormal,mineralUVX,mineralUx,mineralVx).rgb*2.-1.,.28*mineralVisibility);
        vec3 mineralNY=mix(vec3(0.,0.,1.),textureGrad(nacreMineralNormal,mineralUVY,mineralUy,mineralVy).rgb*2.-1.,.28*mineralVisibility);
        vec3 mineralNZ=mix(vec3(0.,0.,1.),textureGrad(nacreMineralNormal,mineralUVZ,mineralUz,mineralVz).rgb*2.-1.,.28*mineralVisibility);
`;
const mineralNormal = `        mineralFace*=faceDirection;
        vec3 mineralWorldNormal=nacreMineralFrame(mineralFace,mineralDx,mineralDy,mineralUx,mineralVx,mineralNX)*mineralWeights.x
          +nacreMineralFrame(mineralFace,mineralDx,mineralDy,mineralUy,mineralVy,mineralNY)*mineralWeights.y
          +nacreMineralFrame(mineralFace,mineralDx,mineralDy,mineralUz,mineralVz,mineralNZ)*mineralWeights.z;
        normal=normalize(mat3(viewMatrix)*normalize(mineralWorldNormal));
`;

const organicNoise = `
  float nacreHash(vec3 p) {
    p=fract(p*.1031);p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float nacreNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(nacreHash(i),nacreHash(i+vec3(1,0,0)),f.x),mix(nacreHash(i+vec3(0,1,0)),nacreHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(nacreHash(i+vec3(0,0,1)),nacreHash(i+vec3(1,0,1)),f.x),mix(nacreHash(i+vec3(0,1,1)),nacreHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  vec3 nacreReliefNormal(vec3 surfaceNormal, vec3 surfacePosition, float height, float faceSign) {
    vec3 dx=dFdx(surfacePosition),dy=dFdy(surfacePosition);
    vec3 rx=cross(dy,surfaceNormal),ry=cross(surfaceNormal,dx);
    float det=dot(dx,rx)*faceSign;
    return normalize(max(abs(det),.0000001)*surfaceNormal
      -sign(det)*(dFdx(height)*rx+dFdy(height)*ry));
  }
`;

export function createNacreMaterials(
  timeUniform,
  waterY,
  { mineralSurface = null } = {},
) {
  function surface(name, options) {
    const rock = name === 'stratified basalt';
    const calcareous = name === 'folded porous reef coral';
    const marineShell =
      name === 'observatory nacre shell' || name === 'marine titanium';
    const material = new T.MeshStandardMaterial({
      roughness: 0.8,
      ...options,
      name: 'Nacre / ' + name,
    });
    if (calcareous)
      material.defines = { ...material.defines, NACRE_CALCAREOUS_SKIN: 1 };
    if (rock) mineralSurface?.register(material);
    material.onBeforeCompile = (shader) => {
      const mineral = Boolean(
        rock && mineralSurface?.color && mineralSurface?.normal,
      );
      if (mineral) {
        shader.uniforms.nacreMineralColor = { value: mineralSurface.color };
        shader.uniforms.nacreMineralNormal = { value: mineralSurface.normal };
      }
      shader.uniforms.nacreTime = timeUniform;
      shader.uniforms.nacreWaterY = { value: waterY };
      shader.vertexShader = 'varying vec3 nacreWorld;\n' + shader.vertexShader;
      if (calcareous) {
        shader.vertexShader =
          'varying float nacreTissueTone;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          nacreTissueTone=1.;
          #ifdef USE_COLOR
            nacreTissueTone=color.g;
          #endif`,
        );
      }
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `
        #include <worldpos_vertex>
        vec4 nacrePosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          nacrePosition=instanceMatrix*nacrePosition;
        #endif
        nacreWorld=(modelMatrix*nacrePosition).xyz;
      `,
      );
      shader.fragmentShader =
        'varying vec3 nacreWorld; uniform float nacreTime; uniform float nacreWaterY;\n' +
        organicNoise +
        (mineral ? mineralShader : '') +
        (calcareous ? 'varying float nacreTissueTone;\n' : '') +
        shader.fragmentShader;
      if (rock) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `
        #include <color_fragment>
        float broad=nacreNoise(nacreWorld*vec3(.055,.10,.055));
        float mineral=nacreNoise(nacreWorld*.19+vec3(broad*2.,0.,broad));
        float footprint=length(fwidth(nacreWorld));
        float mineralFade=1.-smoothstep(1.5,7.,footprint);
        // A broad, broken splash zone gives the rock an actual ocean contact.
        // It stays at the mean sea level rather than flickering with each swell.
        float shoreVariation=nacreNoise(vec3(nacreWorld.x*.027,0.,nacreWorld.z*.027));
        float shoreHeight=nacreWorld.y-nacreWaterY+(shoreVariation-.5)*12.;
        float splashWet=1.-smoothstep(-2.,15.,shoreHeight);
        float deepWater=1.-smoothstep(-32.,-6.,shoreHeight);
        float saltDeposit=smoothstep(7.,13.,shoreHeight)
          *(1.-smoothstep(20.,29.,shoreHeight))*smoothstep(.58,.8,mineral);
        diffuseColor.rgb*=.66+broad*.34;
        diffuseColor.rgb+=vec3(.012,.018,.016)*smoothstep(.48,.78,mineral)*mineralFade;
        diffuseColor.rgb*=mix(1.,.53,splashWet);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.28,.25),saltDeposit*.13);
        float rockRelief=(mineral-.5)*.19*mineralFade;
        ${mineral ? mineralColor : ''}
      `,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        // Rain gives exposed stone a satin response; fresh splash is smoother.
        // Deep reef stone retains a broad response under the underwater light.
        roughnessFactor=mix(.72+.14*mineral,.31+.11*mineral,splashWet);
        roughnessFactor=mix(roughnessFactor,.54,deepWater);
        roughnessFactor=mix(roughnessFactor,.87,saltDeposit*.35);`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        ${mineral ? mineralNormal : 'normal=nacreReliefNormal(normal,-vViewPosition,rockRelief,faceDirection);'}`,
        );
      }
      if (calcareous) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        // The un-tinted geometry channel follows actual deep pores and thick
        // mouth rims; pigment noise never decides where those structures are.
        float reefCavity=1.-smoothstep(.56,.76,nacreTissueTone);
        float reefRim=smoothstep(.86,.98,nacreTissueTone);
        float reefDamp=smoothstep(.68,.84,nacreTissueTone)*(1.-reefRim);
        float reefFootprint=length(fwidth(nacreWorld));
        float reefDetail=1.-smoothstep(.45,1.6,reefFootprint*.92);
        float reefPatch=nacreNoise(nacreWorld*.055);
        float reefGrain=nacreNoise(nacreWorld*.92+vec3(reefPatch*1.7,2.,reefPatch));
        vec3 reefPigment=mix(vec3(.93,1.02,.96),vec3(1.04,.96,.88),reefPatch);
        diffuseColor.rgb*=reefPigment*(1.-reefCavity*.16);
        diffuseColor.rgb*=mix(vec3(1.),vec3(1.12,1.10,.98),reefRim*.7);
        float reefPores=smoothstep(.66,.81,reefGrain)*reefDetail*(1.-reefRim*.8);
        diffuseColor.rgb*=1.-reefPores*.055;
        float reefRelief=(reefGrain-.5)*mix(.035,.014,reefCavity)*reefDetail*(1.-reefRim*.78);
`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        // Porous recesses scatter broadly, raised calcareous mouths stay
        // chalky, and the exposed living skin holds a restrained damp response.
        roughnessFactor=mix(.86,.69,reefDamp);
        roughnessFactor=mix(roughnessFactor,.96,reefCavity);
        roughnessFactor=mix(roughnessFactor,.88,reefRim);
        roughnessFactor=clamp(roughnessFactor+(reefGrain-.5)*.06*reefDetail,.64,.98);
`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          normal=nacreReliefNormal(normal,-vViewPosition,reefRelief,faceDirection);`,
        );
      }
      if (marineShell) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
        // Thin rain/spray film preserves the clean pearl and titanium finishes.
        float shellVariation=nacreNoise(nacreWorld*vec3(.065,.12,.065));
        float shellSplash=1.-smoothstep(2.,17.,nacreWorld.y-nacreWaterY+(shellVariation-.5)*6.);
        diffuseColor.rgb*=mix(.97,.89,shellSplash);`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+(shellVariation-.5)*.045-shellSplash*.055,.2,.42);`,
        );
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        float submerged=1.-smoothstep(nacreWaterY-8.,nacreWaterY+1.,nacreWorld.y);
        vec3 drift=nacreWorld*.095+vec3(nacreTime*.045,0.,-nacreTime*.029);
        float mineralVariation=nacreNoise(drift);
        float detail=nacreNoise(drift*1.73+vec3(mineralVariation*.8,2.,mineralVariation));
        float caustic=smoothstep(.53,.76,mineralVariation*.6+detail*.4);
        float causticFade=1.-smoothstep(2.,12.,length(fwidth(nacreWorld)));
        outgoingLight+=vec3(.004,.017,.019)*caustic*submerged*causticFade;
        #include <opaque_fragment>
      `,
      );
    };
    material.customProgramCacheKey = () =>
      'nacre-organic-wet-v5-' +
      name +
      '-' +
      Boolean(rock && mineralSurface?.color && mineralSurface?.normal);
    return material;
  }
  return {
    basalt: surface('stratified basalt', {
      color: '#879396',
      roughness: 0.96,
      flatShading: true,
      vertexColors: true,
    }),
    sediment: surface('pale deepwater silt', {
      color: '#6c8b87',
      roughness: 1,
    }),
    coral: surface('ivory branching coral', {
      color: '#9cad9c',
      roughness: 0.9,
      emissive: '#274a42',
      emissiveIntensity: 0.08,
    }),
    reefCoral: surface('folded porous reef coral', {
      color: '#b8c5a7',
      vertexColors: true,
      roughness: 0.88,
      emissive: '#20372f',
      emissiveIntensity: 0.045,
    }),
    fanEdge: surface('cyan living membrane margins', {
      color: '#8acfbf',
      emissive: '#27b79f',
      emissiveIntensity: 1.25,
      roughness: 0.45,
      side: T.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    ribbon: surface('violet photosynthetic ribbons', {
      color: '#7d6592',
      emissive: '#432260',
      emissiveIntensity: 0.38,
      roughness: 0.52,
      side: T.DoubleSide,
    }),
    warmCoral: surface('amber organ coral', {
      color: '#b39767',
      emissive: '#b35e2d',
      emissiveIntensity: 0.4,
      roughness: 0.65,
    }),
    fan: surface('thin living sea fans', {
      color: '#82b6ac',
      roughness: 0.88,
      side: T.DoubleSide,
      vertexColors: true,
      emissive: '#1a5543',
      emissiveIntensity: 0.2,
    }),
    kelp: surface('blue-green reef fronds', {
      color: '#43645d',
      roughness: 0.87,
      side: T.DoubleSide,
    }),
    pearl: surface('observatory nacre shell', {
      color: '#d6dad3',
      roughness: 0.34,
      metalness: 0.06,
    }),
    alloy: surface('marine titanium', {
      color: '#587e87',
      metalness: 0.68,
      roughness: 0.34,
    }),
    glass: surface('deep glazed pressure lens', {
      color: '#15444d',
      metalness: 0.48,
      roughness: 0.16,
    }),
    glow: surface('reef bioluminescence', {
      color: '#b4d8c4',
      emissive: '#369c8d',
      emissiveIntensity: 0.65,
      roughness: 0.55,
    }),
    amber: surface('tidal instrument light', {
      color: '#e6c59b',
      emissive: '#bd7335',
      emissiveIntensity: 0.55,
      roughness: 0.4,
    }),
  };
}
