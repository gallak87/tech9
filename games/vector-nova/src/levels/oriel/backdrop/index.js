import * as T from 'three';

export function createOrielBackdrop() {
  const group = new T.Group();
  group.name = 'Oriel / diffuse artificial daylight';
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    vertexShader:
      'varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `varying vec3 ray;void main(){vec3 d=normalize(ray);
      vec3 color=mix(vec3(.34,.47,.51),vec3(.85,.88,.78),pow(1.-abs(d.y),2.));
      color+=vec3(.18,.13,.055)*pow(max(0.,dot(d,normalize(vec3(-.4,.6,.3)))),16.);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const geometry = new T.SphereGeometry(15000, 24, 12);
  const sky = new T.Mesh(geometry, material);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection: new T.Vector3(-0.48, 0.71, -0.33).normalize(),
    sunColor: '#fff9ef',
    sunIntensity: 2.8,
    ambientSky: '#cbd6d5',
    ambientGround: '#c5c2b4',
    ambientIntensity: 0.28,
    fillColor: '#b5d9d5',
    fillIntensity: 0.18,
    environmentIntensity: 0.4,
    far: 12000,
    update({ camera } = {}) {
      if (camera) group.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
