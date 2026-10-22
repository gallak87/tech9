import * as T from 'three';
export function createColossusBackdrop() {
  const group = new T.Group();
  const geometry = new T.SphereGeometry(16000, 32, 16);
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    vertexShader:
      'varying vec3 ray; void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader:
      'varying vec3 ray; void main(){vec3 d=normalize(ray);float h=smoothstep(-.1,.65,d.y);vec3 sky=mix(vec3(.65,.62,.54),vec3(.17,.3,.42),h);float haze=pow(max(dot(d,normalize(vec3(-.5,.8,-.3))),0.),18.);sky+=vec3(.35,.29,.19)*haze;gl_FragColor=vec4(sky,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const sky = new T.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection: new T.Vector3(-0.5, 0.8, -0.3).normalize(),
    sunColor: '#fff0d5',
    sunIntensity: 3.2,
    ambientSky: '#c1d7e1',
    ambientGround: '#706858',
    ambientIntensity: 0.8,
    fillColor: '#b0cee1',
    fillIntensity: 0.35,
    environmentIntensity: 0.8,
    far: 22000,
    update({ camera }) {
      if (camera) group.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      geometry.dispose();
      material.dispose();
    },
  };
}
