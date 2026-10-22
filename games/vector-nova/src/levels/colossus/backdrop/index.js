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
      'varying vec3 ray; void main(){vec3 d=normalize(ray);float h=smoothstep(-.1,.65,d.y);vec3 sky=mix(vec3(.59,.65,.67),vec3(.18,.34,.50),h);float haze=pow(max(dot(d,normalize(vec3(-.62,.46,-.36))),0.),18.);sky+=vec3(.22,.19,.13)*haze;gl_FragColor=vec4(sky,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  const sky = new T.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection: new T.Vector3(-0.62, 0.46, -0.36).normalize(),
    sunColor: '#ffe3bc',
    sunIntensity: 3.6,
    ambientSky: '#b2c6d5',
    ambientGround: '#777b73',
    ambientIntensity: 0.92,
    fillColor: '#b0cee1',
    fillIntensity: 0.45,
    environmentIntensity: 0.65,
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
