import * as T from 'three';

// Reuse Nacre's Tech9-derived normal texture for the falling surface. Falling
// water needs its own flow coordinates: travel time, rather than metres, keeps
// features connected at the lip and stretches them as gravity accelerates them.
export function createFallingWaterMaterial(clock, opening, rippleTexture) {
  const material = new T.MeshPhysicalMaterial({
    name: 'Nightweir / reflective aerated falling water',
    color: '#ffffff',
    roughness: 0.19,
    metalness: 0,
    ior: 1.333,
    specularIntensity: 1,
    envMapIntensity: 0.9,
    transparent: true,
    opacity: 1,
    side: T.DoubleSide,
    forceSinglePass: true,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      waterTime: clock,
      flood: opening,
      rippleTexture: { value: rippleTexture },
    });
    shader.vertexShader =
      `
      attribute float sourcePhase;
      attribute float crossed;
      attribute float releaseAt;
      attribute float sheetWidth;
      attribute float sheetHeight;
      attribute vec3 flowRight;
      varying vec2 vFlow;
      varying vec4 vSource;
      varying vec2 vSize;
      varying vec3 vFlowRight;
    ` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
      #include <begin_vertex>
      vFlow=uv;
      vSource=vec4(sourcePhase,crossed,releaseAt,0.);
      vSize=vec2(sheetWidth,sheetHeight);
      vFlowRight=normalMatrix*flowRight;
    `,
      );
    shader.fragmentShader =
      `
      uniform float waterTime;
      uniform float flood;
      uniform sampler2D rippleTexture;
      varying vec2 vFlow;
      varying vec4 vSource;
      varying vec2 vSize;
      varying vec3 vFlowRight;
      float fallHash(vec2 p) {
        vec3 q=fract(vec3(p.xyx)*.1031);
        q+=dot(q,q.yzx+33.33);
        return fract((q.x+q.y)*q.z);
      }
      float fallNoise(vec2 p) {
        vec2 i=floor(p),f=fract(p);
        f=f*f*f*(f*(f*6.-15.)+10.);
        return mix(mix(fallHash(i),fallHash(i+vec2(1,0)),f.x),
          mix(fallHash(i+vec2(0,1)),fallHash(i+vec2(1,1)),f.x),f.y);
      }
    ` +
      shader.fragmentShader
        .replace(
          '#include <map_fragment>',
          `
        #include <map_fragment>
        float down=max(0.,vFlow.y);
        float travel=(sqrt(144.+19.62*down)-12.)/9.81;
        float falling=travel-waterTime;
        vec2 flowUV=vec2(vFlow.x*.065+vSource.x*3.7,falling*.85);
        float footprint=max(length(dFdx(flowUV)),length(dFdy(flowUV)));
        float fineVisibility=1.-smoothstep(.18,.75,footprint);
        float coarse=mix(.5,fallNoise(flowUV*.6),1.-smoothstep(.8,2.,footprint));
        float ropes=mix(.5,fallNoise(flowUV*vec2(2.3,1.8)+vec2(coarse*.8,17.)),fineVisibility);
        float lace=mix(.5,fallNoise(flowUV*vec2(6.7,4.2)),fineVisibility);
        float supply=fallNoise(vec2(vFlow.x*.043+vSource.x*13.,vSource.x+5.));
        float aeration=smoothstep(3.,110.,down);
        float turbulence=smoothstep(.18,.86,coarse*.48+ropes*.44+lace*.22);
        float foam=mix(.07,.32+turbulence*.68,aeration)*mix(.75,1.,supply);
        float impact=smoothstep(.72,1.,down/max(1.,vSize.y));
        foam=clamp(foam+impact*smoothstep(.38,.78,coarse+lace*.18)*.24,0.,.9);
        float edge=smoothstep(0.,1.5,vFlow.x)*(1.-smoothstep(vSize.x-1.5,vSize.x,vFlow.x));
        float released=mix(smoothstep(fract(vSource.x*.618)*.65,fract(vSource.x*.618)*.65+.35,flood),
          smoothstep(vSource.z-.0242,vSource.z-.00646,flood),vSource.y);
        float flow=mix(.76+.24*released,.25+.75*released,vSource.y);
        // Aerated ropes separate clear, reflective channels. Crossings remain
        // deliberately porous so the receiving deck survives the water curtain.
        diffuseColor.rgb=mix(vec3(.018,.066,.079),vec3(.73,.79,.80),foam);
        diffuseColor.a=edge*mix(.88,.23,vSource.y)*mix(.82,1.,supply)*flow;
        diffuseColor.a+=edge*foam*mix(.12,.07,vSource.y);
        vec2 rippleA=texture2D(rippleTexture,vec2(vFlow.x/32.,falling*.045)+vSource.x).rg*2.-1.;
        vec2 rippleB=texture2D(rippleTexture,vec2(vFlow.x/13.,falling*.093)+vec2(17.,31.)).rg*2.-1.;
        vec2 fallRipple=(rippleA*.32+rippleB*.13)*fineVisibility;
      `,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `
        #include <emissivemap_fragment>
        totalEmissiveRadiance+=vec3(.024,.037,.040)*foam;
      `,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `
        #include <roughnessmap_fragment>
        roughnessFactor=mix(.13,.58,foam);
      `,
        )
        .replace(
          '#include <normal_fragment_begin>',
          `
        #include <normal_fragment_begin>
        vec3 across=normalize(vFlowRight-normal*dot(vFlowRight,normal));
        vec3 along=normalize(cross(normal,across));
        normal=normalize(normal+across*fallRipple.x+along*fallRipple.y*.4);
      `,
        );
  };
  material.customProgramCacheKey = () => 'nightweir-falling-water-v2';
  return material;
}
