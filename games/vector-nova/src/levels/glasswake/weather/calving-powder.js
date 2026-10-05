import * as T from 'three';
/** Absolute, bounded powder released by the authored shelf separation. Its
 * resources belong to the parent environment's single disposal traversal.
 */
export function createCalvingPowder({
  count = 160,
  lowCount = 70,
  opening = false,
} = {}) {
  const base = new T.PlaneGeometry(1, 1),
    geometry = new T.InstancedBufferGeometry();
  geometry.index = base.index.clone();
  geometry.setAttribute('position', base.attributes.position.clone());
  geometry.setAttribute('uv', base.attributes.uv.clone());
  base.dispose();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++)
    seeds[i] = (((Math.sin(i * 42.31 + 7.7) * 43758.5453) % 1) + 1) % 1;
  geometry.setAttribute('powderSeed', new T.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  const origin = opening
    ? 'vec3(94.-powderSeed.w*150.-t*20.,74.-t*t*(180.+powderSeed.y*65.),(powderSeed.z-.5)*158.-t*(40.+powderSeed.x*10.))'
    : 'vec3(-72.-t*(27.+powderSeed.x*65.),140.-t*t*(200.+powderSeed.y*90.),(powderSeed.z-.5)*415.)';
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { separation: { value: 0 }, opacity: { value: 0 } },
    vertexShader: `
    attribute vec4 powderSeed;uniform float separation;varying vec2 powderUv;varying float released;
    void main(){float t=max(0.,separation-powderSeed.w*${opening ? '.28' : '.13'});released=smoothstep(0.,.025,t);
      vec3 p=${origin};
      vec4 mv=modelViewMatrix*vec4(p,1.);mv.xy+=position.xy*(5.+powderSeed.y*11.)*(.6+t);
      gl_Position=projectionMatrix*mv;powderUv=uv;
    }`,
    fragmentShader: `uniform float opacity;varying vec2 powderUv;varying float released;void main(){float cloud=1.-smoothstep(.05,.5,length(powderUv-.5));gl_FragColor=vec4(.69,.83,.92,cloud*cloud*opacity*released);
#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Glasswake / calving ice powder';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.aoExclude = true;
  return {
    mesh,
    update(event, settings = {}) {
      material.uniforms.separation.value = event.separation;
      material.uniforms.opacity.value =
        Math.sin(event.separation * Math.PI) * 0.24;
      geometry.instanceCount = settings.quality === 'low' ? lowCount : count;
      mesh.visible = event.separation > 0.015 && event.separation < 0.995;
    },
  };
}
