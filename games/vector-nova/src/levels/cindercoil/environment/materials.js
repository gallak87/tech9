import * as T from 'three';

export function createCindercoilMaterials() {
  const basalt = new T.MeshStandardMaterial({
    color: '#66727f',
    roughness: 0.96,
    vertexColors: true,
  });
  basalt.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 terrainWorld;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nterrainWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 terrainWorld;
      float strataHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      float strata=sin(terrainWorld.y*.23+sin(terrainWorld.x*.014)*1.3+sin(terrainWorld.z*.016)*2.);
      float grain=strataHash(floor(terrainWorld*1.4));
      float layers=smoothstep(.52,.9,strata);
      diffuseColor.rgb*=mix(.69,1.17,layers)*(.88+grain*.21);
    `,
      );
  };
  basalt.customProgramCacheKey = () => 'cindercoil-strata-v1';
  const lava = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, pulse: { value: 0 } },
    vertexShader: `varying vec3 world; varying vec3 local;
      void main(){local=position;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader: `
      uniform float time;uniform float pulse;varying vec3 world;varying vec3 local;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec2 p=world.xz*.032;
        float fold=noise(p*1.4+vec2(time*.009,-time*.007));
        float veins=abs(sin(p.x*2.1+sin(p.y*1.6)+fold*5.2));
        float cracks=pow(1.-smoothstep(.03,.18,veins),.7);
        float ropy=sin(p.x*11.+sin(p.y*9.)+fold*18.)*.5+.5;
        vec3 crust=mix(vec3(.024,.025,.030),vec3(.125,.065,.04),fold)*(.8+ropy*.27);
        vec3 molten=mix(vec3(.95,.085,.007),vec3(1.8,.48,.022),noise(p*.7)+pulse*.12);
        vec3 color=mix(crust,molten,clamp(cracks*.87+.16*fold,0.,1.));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const scoria = new T.MeshStandardMaterial({
    color: '#424653',
    roughness: 0.94,
  });
  const ash = new T.MeshStandardMaterial({ color: '#81909b', roughness: 1 });
  const blackglass = new T.MeshStandardMaterial({
    color: '#202c37',
    metalness: 0.15,
    roughness: 0.39,
  });
  return { basalt, lava, scoria, ash, blackglass };
}
