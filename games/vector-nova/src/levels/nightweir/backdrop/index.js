import * as T from 'three';
import { assetURL } from '../../../assets/url.js';
export async function createNightweirBackdrop({
  shape = false,
  loadTexture = (u) => new T.TextureLoader().loadAsync(u),
} = {}) {
  const texture = shape
    ? new T.DataTexture(new Uint8Array([160, 180, 198, 255]), 1, 1)
    : await loadTexture(assetURL('assets/levels/nightweir/sky-v1.png'));
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const group = new T.Group();
  group.name = 'Nightweir / storm dusk above the harbor';
  group.userData.aoExclude = true;
  const material = new T.ShaderMaterial({
    name: 'Nightweir / distant sky radiance',
    side: T.BackSide,
    depthWrite: false,
    uniforms: { panorama: { value: texture } },
    vertexShader:
      'varying vec3 ray; void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `varying vec3 ray;uniform sampler2D panorama;
      void main(){vec3 d=normalize(ray);float u=fract(atan(d.z,d.x)/6.2831853+.15);float v=asin(clamp(d.y,-1.,1.))/3.14159265+.5;
      vec3 color=texture2D(panorama,vec2(u*.96,v)).rgb;
      if(u<.042)color=mix(texture2D(panorama,vec2(.96+u*.96,v)).rgb,color,smoothstep(0.,.042,u));
      vec3 pole=vec3(.015,.025,.045);if(d.y<0.)pole=vec3(.025,.045,.065);
      color=mix(color,pole,smoothstep(.95,1.,abs(d.y)));
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const geometry = new T.SphereGeometry(20000, 48, 32),
    sky = new T.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    ownedTextures: [texture],
    sunDirection: new T.Vector3(-0.65, 0.5, 0.6).normalize(),
    sunColor: '#a6c7dc',
    sunIntensity: 1.35,
    ambientSky: '#93acc1',
    ambientGround: '#263b47',
    ambientIntensity: 0.8,
    fillColor: '#89acbd',
    fillIntensity: 0.35,
    environmentIntensity: 0.8,
    far: 26000,
    update({ camera } = {}) {
      if (camera) group.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
