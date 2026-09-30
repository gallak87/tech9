import * as T from 'three';

const organicNoise = `
  float nacreHash(vec3 p) {
    p=fract(p*.1031);p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float nacreNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(nacreHash(i),nacreHash(i+vec3(1,0,0)),f.x),mix(nacreHash(i+vec3(0,1,0)),nacreHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(nacreHash(i+vec3(0,0,1)),nacreHash(i+vec3(1,0,1)),f.x),mix(nacreHash(i+vec3(0,1,1)),nacreHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
`;

export function createNacreMaterials(timeUniform, waterY) {
  function surface(name, options) {
    const material = new T.MeshStandardMaterial({
      roughness: 0.8,
      ...options,
      name: 'Nacre / ' + name,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.nacreTime = timeUniform;
      shader.uniforms.nacreWaterY = { value: waterY };
      shader.vertexShader = 'varying vec3 nacreWorld;\n' + shader.vertexShader;
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
        shader.fragmentShader;
      if (name === 'stratified basalt')
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `
        #include <color_fragment>
        float broad=nacreNoise(nacreWorld*vec3(.055,.10,.055));
        float mineral=nacreNoise(nacreWorld*.19+vec3(broad*2.,0.,broad));
        float footprint=length(fwidth(nacreWorld));
        float mineralFade=1.-smoothstep(1.5,7.,footprint);
        diffuseColor.rgb*=.66+broad*.34;
        diffuseColor.rgb+=vec3(.012,.018,.016)*smoothstep(.48,.78,mineral)*mineralFade;
      `,
        );
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
    material.customProgramCacheKey = () => 'nacre-organic-v3-' + name;
    return material;
  }
  return {
    basalt: surface('stratified basalt', {
      color: '#a4b2ae',
      roughness: 0.96,
      flatShading: true,
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
      color: '#d0d9ce',
      roughness: 0.34,
      metalness: 0.18,
    }),
    alloy: surface('marine titanium', {
      color: '#587e87',
      metalness: 0.68,
      roughness: 0.35,
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
