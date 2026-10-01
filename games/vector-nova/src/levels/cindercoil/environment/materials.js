import * as T from 'three';

const GEOLOGY_NOISE = `
float ccHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float ccNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(ccHash(i),ccHash(i+vec3(1,0,0)),f.x),mix(ccHash(i+vec3(0,1,0)),ccHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(ccHash(i+vec3(0,0,1)),ccHash(i+vec3(1,0,1)),f.x),mix(ccHash(i+vec3(0,1,1)),ccHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float ccFbm(vec3 p){return ccNoise(p)*.58+ccNoise(p*2.17)*.28+ccNoise(p*4.71)*.14;}
vec3 ccBump(vec3 n,float height){vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);vec3 cx=cross(dy,n),cy=cross(n,dx);float det=dot(dx,cx);return normalize(n-sign(det)*(dFdx(height)*cx+dFdy(height)*cy)/max(abs(det),.00001));}
`;

function geologyMaterial(
  material,
  { molten = false, time = { value: 0 }, terrain = false, rockTexture } = {},
) {
  if (rockTexture && !molten) material.map = rockTexture.value;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ccTime = time;
    if (rockTexture) shader.uniforms.ccRock = rockTexture;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 ccWorld;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
      vec4 ccPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
      ccPosition=instanceMatrix*ccPosition;
      #endif
      ccWorld=(modelMatrix*ccPosition).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 ccWorld;uniform float ccTime;${GEOLOGY_NOISE}\n${rockTexture && !molten ? 'uniform sampler2D ccRock;' : ''}`,
      )
      .replace(
        '#include <map_fragment>',
        rockTexture && !molten
          ? `
        vec3 ccWeights=pow(abs(normalize(cross(dFdx(ccWorld),dFdy(ccWorld)))),vec3(4.));ccWeights/=max(.0001,ccWeights.x+ccWeights.y+ccWeights.z);
        vec3 ccDetail=texture2D(ccRock,ccWorld.yz*.065).rgb*ccWeights.x+texture2D(ccRock,ccWorld.xz*.065).rgb*ccWeights.y+texture2D(ccRock,ccWorld.xy*.065).rgb*ccWeights.z;
        float ccDetailHeight=dot(ccDetail,vec3(.21,.72,.07));
        diffuseColor.rgb*=clamp(ccDetail/.17,vec3(.28),vec3(1.75));
        `
          : '#include <map_fragment>',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 cp=ccWorld*${molten ? '.18' : terrain ? '.047' : '.12'};
        ${molten ? 'cp.y+=ccTime*1.4;' : ''}
        float macro=ccFbm(cp*.41);
        float grit=ccNoise(cp*5.7);
        float grain=ccNoise(cp*19.7);
        float strata=sin(ccWorld.y*.28+ccNoise(ccWorld*.022)*3.)*.5+.5;
        float fracture=ccFbm(cp*vec3(1.7,.23,1.7)+vec3(macro*2.));
        float veins=smoothstep(.40,.47,fracture)*(1.-smoothstep(.49,.58,fracture));
        float relief=ccNoise(cp*vec3(.9,4.1,.9)+vec3(macro*2.));
        diffuseColor.rgb*=mix(.70,1.24,macro)*mix(.82,1.08,grit)*mix(.87,1.12,strata)*(1.-veins*${molten ? '.26' : '.19'});
        ${molten ? '' : 'diffuseColor.rgb+=vec3(.018,.022,.026)*smoothstep(.64,.82,relief)*.22;'}
      `,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        float stoneHeight=(relief*.45+grit*.18+fracture*.25+grain*.12)*${molten ? '.32' : terrain ? '.8' : '.32'};
        normal=ccBump(normal,stoneHeight${rockTexture && !molten ? '+ccDetailHeight*.18' : ''});
      `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${
          molten
            ? `float rippled=ccFbm(cp*vec3(1.8,.45,1.8));
        float crustMask=smoothstep(.24,.63,rippled);
        float fold=sin(cp.y*2.3+ccNoise(cp*.7)*9.)*.5+.5;
        totalEmissiveRadiance*=mix(.09,1.15,crustMask)*(.72+fold*.28);`
            : ''
        }
      `,
      );
  };
  material.customProgramCacheKey = () =>
    `cindercoil-geology-5-${molten}-${terrain}`;
  return material;
}

export function applyCindercoilAssetMaterials(scene, time, rockTexture) {
  const materials = new Set();
  scene.traverse((node) => {
    for (const material of [node.material].flat().filter(Boolean))
      materials.add(material);
  });
  for (const material of materials) {
    if (/Basalt|Blackglass|Scoria|Ash/.test(material.name))
      geologyMaterial(material, { rockTexture });
    else if (/Lava/.test(material.name))
      geologyMaterial(material, { molten: true, time });
  }
}

export function createCindercoilMaterials({ rockTexture } = {}) {
  const basalt = geologyMaterial(
    new T.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.97,
      vertexColors: true,
    }),
    { terrain: true, rockTexture },
  );
  const lava = new T.ShaderMaterial({
    fog: true,
    uniforms: { ...T.UniformsLib.fog, time: { value: 0 }, pulse: { value: 0 } },
    vertexShader: `varying vec3 world;
      #include <fog_pars_vertex>
      void main(){world=(modelMatrix*vec4(position,1.)).xyz;vec4 mvPosition=viewMatrix*vec4(world,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time;uniform float pulse;varying vec3 world;
      #include <fog_pars_fragment>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      vec2 cell(vec2 p){vec2 g=floor(p),f=fract(p);float one=10.,two=10.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 o=vec2(float(x),float(y));vec2 r=o+vec2(hash(g+o),hash(g+o+31.2))*.7+.15-f;float d=dot(r,r);if(d<one){two=one;one=d;}else if(d<two)two=d;}return vec2(sqrt(one),sqrt(two));}
      void main(){
        vec2 p=world.xz*.047;float fold=noise(p*.8+vec2(time*.008,-time*.005));
        vec2 warped=p+vec2(noise(p*.7),noise(p*.73+17.))*1.7;
        vec2 c=cell(warped);float fissure=1.-smoothstep(.025,.095,c.y-c.x);
        float small=noise(warped*9.);float ropy=noise(warped*vec2(2.8,8.));
        vec3 crust=mix(vec3(.010,.012,.014),vec3(.044,.037,.031),fold)*(.65+ropy*.5);
        vec3 molten=mix(vec3(.67,.032,.003),vec3(1.25,.22,.006),small*.7+fold*.3+clamp(pulse*.1,0.,.1));
        vec3 color=mix(crust,molten,fissure*(.55+.45*small));
        gl_FragColor=vec4(color,1.);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { basalt, lava };
}
