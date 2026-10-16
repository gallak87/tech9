const mineralNoise = `
float mineralHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float mineralNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(mineralHash(i),mineralHash(i+vec3(1,0,0)),f.x),mix(mineralHash(i+vec3(0,1,0)),mineralHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(mineralHash(i+vec3(0,0,1)),mineralHash(i+vec3(1,0,1)),f.x),mix(mineralHash(i+vec3(0,1,1)),mineralHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

// Silhouette fractures belong to Blender. Separate geological exposure and
// six-metre grain retain a useful material scale from both flight and close road.
export function finishWorldspireMineral(material, texture, exposureTexture) {
  material.map = texture;
  material.bumpMap = null;
  // Pigment and physical finish share continuous world-space fields across
  // authored face boundaries; upward ledges retain a rough weathered rind.
  material.color.set('#a6a6a8');
  material.roughness = 0.5;
  material.metalness = 0.045;
  material.envMapIntensity = 0.9;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.mineralExposure = { value: exposureTexture };
    shader.vertexShader =
      'varying vec3 mineralWorld;varying vec3 mineralWorldNormal;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vec4 mineralPosition=vec4(position,1.);
      vec3 mineralNormal=normal;
      #ifdef USE_INSTANCING
        mineralPosition=instanceMatrix*mineralPosition;
        mineralNormal=mat3(instanceMatrix)*mineralNormal;
      #endif
      mineralWorld=(modelMatrix*mineralPosition).xyz;
      mineralWorldNormal=normalize(mat3(modelMatrix)*mineralNormal);
    `,
      );
    shader.fragmentShader =
      'varying vec3 mineralWorld;varying vec3 mineralWorldNormal;uniform sampler2D mineralExposure;\n' +
      mineralNoise +
      shader.fragmentShader
        // COLOR_0 is Blender's baked contact occlusion, not mineral pigment.
        .replace('#include <color_fragment>', '')
        .replace(
          '#include <aomap_fragment>',
          `#include <aomap_fragment>
        #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
        float mineralOcclusion=clamp(vColor.r,.45,1.);
        reflectedLight.indirectDiffuse*=mineralOcclusion;
        #if defined(USE_ENVMAP) && defined(STANDARD)
        reflectedLight.indirectSpecular*=computeSpecularOcclusion(saturate(dot(geometryNormal,geometryViewDir)),mineralOcclusion,material.roughness);
        #endif
        #endif`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
        vec3 axis=pow(abs(mineralWorldNormal),vec3(4.));axis/=max(.0001,axis.x+axis.y+axis.z);
        vec3 p=mineralWorld/6.;
        vec3 grain=texture2D(map,p.zy).rgb*axis.x+texture2D(map,p.xz).rgb*axis.y+texture2D(map,p.xy).rgb*axis.z;
        float face=mineralNoise(mineralWorld*vec3(.007,.0025,.007));
        float strain=mineralNoise(mineralWorld*vec3(.013,.004,.013)+face*2.);
        vec3 q=mineralWorld/vec3(72.,240.,72.)+vec3(face*.17,strain*.11,face*.21);
        vec3 exposure=texture2D(mineralExposure,q.zy).rgb*axis.x+texture2D(mineralExposure,q.xz).rgb*axis.y+texture2D(mineralExposure,q.xy).rgb*axis.z;
        float mineralMass=dot(exposure,vec3(.2126,.7152,.0722));
        float mineralGrain=dot(grain,vec3(.2126,.7152,.0722));
        float fine=clamp(mineralGrain/.045,.55,1.6);
        float ledgeExposure=smoothstep(-.12,.65,mineralWorldNormal.y);
        float exposed=smoothstep(.3,.7,strain)*ledgeExposure;
        // A continuous weather front crosses neighboring fracture faces.
        // Upward ledges retain more worn rind than sheltered fresh cheeks.
        float rindCoverage=smoothstep(.28,.76,face*.65+strain*.35+ledgeExposure*.18)*(.35+.65*ledgeExposure);
        vec3 silica=mix(vec3(.91,.96,1.09),vec3(1.15,1.08,1.01),exposed*.65);
        // Quiet charcoal glass and warmer exposed seams share one physical grain.
        // Desaturate the large substrate so every face is not purple marble.
        vec3 quietStone=vec3(.028+face*.04);
        float substrateExposure=.595+rindCoverage*.12;
        vec3 bodyColor=mix(quietStone,mix(vec3(mineralMass),exposure,.22),substrateExposure);
        diffuseColor.rgb*=bodyColor*3.6*mix(1.,fine,.16)*(.74+strain*.44)*silica;
        // Height uses a filtered geological signal, never the sharp albedo grain.
        // Treating every bright fleck as metres of relief creates specular glitter.
        vec3 reliefExposure=texture2D(mineralExposure,q.zy,2.).rgb*axis.x+texture2D(mineralExposure,q.xz,2.).rgb*axis.y+texture2D(mineralExposure,q.xy,2.).rgb*axis.z;
        float mineralRelief=(face-.5)*(1.1+rindCoverage*.65)+dot(reliefExposure,vec3(.2126,.7152,.0722))*substrateExposure*2.+mineralGrain*.008*(1.-smoothstep(.3,2.2,length(fwidth(mineralWorld))));
        #endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
        #ifdef USE_MAP
        // A continuous exposure field varies the dielectric finish. Upward
        // ledges stay matte so the pale road is not mirrored into the mineral.
        float wear=(face-.5)*.3+smoothstep(.025,.08,mineralMass)*.2-exposed*.04;
        roughnessFactor=clamp(mix(.42,.82,rindCoverage)+wear*.35,.4,.9);
        roughnessFactor=max(roughnessFactor,mix(.4,.85,ledgeExposure));
        #endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
        #ifdef USE_MAP
        vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition),rx=cross(sy,normal),ry=cross(normal,sx);
        float det=dot(sx,rx);
        normal=normalize(normal-sign(det)*(dFdx(mineralRelief)*rx+dFdy(mineralRelief)*ry)/max(abs(det),.00001));
        #endif`,
        );
  };
  // All mineral surfaces share this program and the same physical field.
  material.customProgramCacheKey = () => 'worldspire-mineral-v11';
  material.needsUpdate = true;
}
