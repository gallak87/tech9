import * as T from 'three';

/** Shared, softly edged ash volume; callers own both returned resources. */
export function createCindercoilPlumeResources({
  time = { value: 0 },
  pulse = { value: 1 },
  heated = false,
} = {}) {
  const plumeGeometry = new T.SphereGeometry(1, 16, 12);
  const pp = plumeGeometry.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(pp, i);
    const lobes =
      1 +
      0.13 * Math.sin(p.x * 11 + p.y * 8) * Math.cos(p.z * 9) +
      0.08 * Math.sin(p.y * 17 + p.z * 5);
    pp.setXYZ(i, p.x * lobes, p.y * lobes, p.z * lobes);
  }
  plumeGeometry.computeVertexNormals();
  const plumeMaterial = new T.MeshStandardMaterial({
    name: 'Cindercoil / billowing local ash volume',
    color: heated ? '#879094' : '#77808c',
    roughness: 1,
    transparent: true,
    opacity: heated ? 0.42 : 0.16,
    depthWrite: false,
  });
  plumeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.plumeTime = time;
    if (heated) shader.uniforms.plumePulse = pulse;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 plumeLocal; ${heated ? 'attribute float plumeAge; varying float vPlumeAge;' : ''}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nplumeLocal=position; ${heated ? 'vPlumeAge=plumeAge;' : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      varying vec3 plumeLocal;uniform float plumeTime; ${heated ? 'varying float vPlumeAge; uniform float plumePulse;' : ''}
      float paHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float paNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(paHash(i),paHash(i+vec3(1,0,0)),f.x),mix(paHash(i+vec3(0,1,0)),paHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(paHash(i+vec3(0,0,1)),paHash(i+vec3(1,0,1)),f.x),mix(paHash(i+vec3(0,1,1)),paHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 ashP=plumeLocal*5.+vec3(plumeTime*.013,-plumeTime*.021,0.);
        float ashDensity=paNoise(ashP)*.7+paNoise(ashP*2.13)*.3;
        diffuseColor.rgb*=mix(.65,1.22,ashDensity);
        ${heated ? 'float warm=1.-smoothstep(.05,.5,vPlumeAge); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.48,.18,.06),warm*.45);' : ''}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        ${heated ? 'totalEmissiveRadiance=vec3(.38,.075,.009)*warm*plumePulse;' : ''}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `diffuseColor.a*=pow(abs(dot(normal,normalize(vViewPosition))),1.6)*smoothstep(.18,.68,ashDensity);
        ${heated ? 'diffuseColor.a*=smoothstep(0.,.12,vPlumeAge)*(1.-smoothstep(.65,1.,vPlumeAge));' : ''}
        if(diffuseColor.a<.003)discard;
        #include <opaque_fragment>`,
      );
  };
  plumeMaterial.customProgramCacheKey = () =>
    `cindercoil-ash-volume-v2-${heated}`;
  return { geometry: plumeGeometry, material: plumeMaterial };
}
