import * as T from 'three';
import { assetURL } from '../../../assets/url.js';

// Cloud-only generated radiance supplies the sky and the scene reflection.
// Align its warm cloud region with the physical key without adding a sun disk.
export function panoramaYawForSun(sourceSunU, sunDirection, overlap = 0.04) {
  const longitude = Math.atan2(sunDirection.z, sunDirection.x) / (Math.PI * 2);
  const raw = sourceSunU / (1 - overlap) - longitude;
  return raw - Math.floor(raw);
}

export async function createColossusBackdrop({
  shape = false,
  sourceSunU = 0.74,
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
} = {}) {
  let texture;
  try {
    texture = shape
      ? new T.DataTexture(new Uint8Array([120, 130, 137, 255]), 1, 1)
      : await loadTexture(
          assetURL('assets/levels/colossus/colossus-sky-v1.png'),
        );
    texture.needsUpdate = true;
  } catch (cause) {
    throw new Error(
      'The Colossus cloud sky could not load. Reload to try again.',
      { cause },
    );
  }
  texture.name = 'Colossus / generated cloud panorama';
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const group = new T.Group();
  group.name = 'Colossus / warm-lit alpine cloud sky';
  const sunDirection = new T.Vector3(-0.62, 0.78, -0.36).normalize();
  const overlap = 0.04;
  const material = new T.ShaderMaterial({
    name: 'Colossus / bounded panorama radiance',
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      cloudSky: { value: texture },
      neutral: { value: shape ? 1 : 0 },
      panoramaYaw: {
        value: panoramaYawForSun(sourceSunU, sunDirection, overlap),
      },
      radianceScale: { value: 0.85 },
    },
    vertexShader: `varying vec3 ray;
      void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: `varying vec3 ray;
      uniform sampler2D cloudSky;
      uniform float neutral,panoramaYaw,radianceScale;
      const float PI=3.141592653589793;
      void main(){
        vec3 direction=normalize(ray);
        vec3 radiance;
        if(neutral>.5){
          radiance=mix(vec3(.24,.26,.27),vec3(.12,.15,.19),smoothstep(-.1,.85,direction.y));
        }else{
          float overlap=.04;
          float u=fract(atan(direction.z,direction.x)/(2.*PI)+panoramaYaw);
          float v=asin(clamp(direction.y,-1.,1.))/PI+.5;
          float panoramaU=u*(1.-overlap);
          // Derivatives are continuous across longitude wrap: implicit texture
          // derivatives choose a tiny mip there and make a visible dark seam.
          vec3 dx=dFdx(direction),dy=dFdy(direction);
          float longitudeScale=(1.-overlap)/(2.*PI*max(dot(direction.xz,direction.xz),.000001));
          float latitudeScale=1./(PI*sqrt(max(1.-direction.y*direction.y,.000001)));
          vec2 uvDx=vec2((direction.x*dx.z-direction.z*dx.x)*longitudeScale,dx.y*latitudeScale);
          vec2 uvDy=vec2((direction.x*dy.z-direction.z*dy.x)*longitudeScale,dy.y*latitudeScale);
          radiance=textureGrad(cloudSky,vec2(panoramaU,v),uvDx,uvDy).rgb;
          if(panoramaU<overlap){
            vec3 opposite=textureGrad(cloudSky,vec2(panoramaU+1.-overlap,v),uvDx,uvDy).rgb;
            radiance=mix(opposite,radiance,smoothstep(0.,overlap,panoramaU));
          }
          // Average the source's polar row before the longitude singularity;
          // cloud detail cannot pinch into a star at zenith/nadir.
          float poleV=direction.y>0.?.99:.01;
          vec3 pole=(textureLod(cloudSky,vec2(.125,poleV),3.).rgb+
            textureLod(cloudSky,vec2(.375,poleV),3.).rgb+
            textureLod(cloudSky,vec2(.625,poleV),3.).rgb+
            textureLod(cloudSky,vec2(.875,poleV),3.).rgb)*.25;
          radiance=mix(radiance,pole,smoothstep(.93,.995,abs(direction.y)));
          radiance*=radianceScale;
        }
        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new T.SphereGeometry(16000, 32, 16);
  const sky = new T.Mesh(geometry, material);
  sky.name = 'Colossus / cloud-only sky sphere';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection,
    sunColor: '#ffe3bc',
    sunIntensity: 3.1,
    ambientSky: '#a9c2d4',
    ambientGround: '#67716c',
    ambientIntensity: 0.85,
    fillColor: '#c1d4e0',
    fillIntensity: 0.78,
    environmentIntensity: 0.65,
    far: 22000,
    ownedTextures: [texture],
    update({ camera } = {}) {
      if (!disposed && camera) group.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.clear();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
