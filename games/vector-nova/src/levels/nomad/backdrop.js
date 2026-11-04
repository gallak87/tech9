import * as T from 'three';
import { assetURL } from '../../assets/url.js';

const SUN = new T.Vector3(-0.62, 0.39, -0.67).normalize();
const OVERLAP = 0.04;

// Longitude follows the generated image's warm quarter. The physical sun and
// reflections therefore illuminate the same side of the carrier construction.
export function nomadPanoramaYaw(sourceSunU = 0.74) {
  const longitude = Math.atan2(SUN.z, SUN.x) / (Math.PI * 2);
  const raw = sourceSunU / (1 - OVERLAP) - longitude;
  return raw - Math.floor(raw);
}

/** Cloud radiance only: every nearby carrier and the salt basin remain geometry. */
export async function createNomadBackdrop({
  shape = false,
  sourceSunU = 0.74,
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
} = {}) {
  let texture;
  try {
    texture = shape
      ? new T.DataTexture(new Uint8Array([132, 156, 178, 255]), 1, 1)
      : await loadTexture(assetURL('assets/levels/nomad/nomad-sky-v1.png'));
    texture.needsUpdate = true;
  } catch (cause) {
    throw new Error(
      'The Nomad daylight sky could not load. Reload to try again.',
      { cause },
    );
  }
  texture.name = 'Nomad / generated salt-basin cloud radiance';
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const group = new T.Group();
  group.name = 'Nomad / low salt-basin daylight';
  group.userData.aoExclude = true;
  let geometry, material;
  try {
    geometry = new T.SphereGeometry(24000, 48, 24);
    material = new T.ShaderMaterial({
      name: 'Nomad / wrapped daylight panorama',
      side: T.BackSide,
      depthWrite: false,
      uniforms: {
        cloudSky: { value: texture },
        neutral: { value: shape ? 1 : 0 },
        panoramaYaw: { value: nomadPanoramaYaw(sourceSunU) },
        radianceScale: { value: 0.86 },
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
            radiance=mix(vec3(.56,.58,.56),vec3(.22,.34,.48),smoothstep(-.08,.85,direction.y));
          }else{
            float overlap=.04;
            float u=fract(atan(direction.z,direction.x)/(2.*PI)+panoramaYaw);
            float v=asin(clamp(direction.y,-1.,1.))/PI+.5;
            float panoramaU=u*(1.-overlap);
            // Differentiate the unwrapped direction, not fract(longitude), so
            // the seam keeps the same mip level as its neighboring sky pixels.
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
    const sky = new T.Mesh(geometry, material);
    sky.name = 'Nomad / cloud-only sky sphere';
    sky.frustumCulled = false;
    sky.renderOrder = 1000;
    group.add(sky);
  } catch (error) {
    geometry?.dispose();
    material?.dispose();
    texture.dispose();
    throw error;
  }
  let disposed = false;
  return {
    group,
    sunDirection: SUN.clone(),
    sunColor: '#ffddb2',
    sunIntensity: 2.5,
    ambientSky: '#bfd4ed',
    ambientGround: '#8f9697',
    ambientIntensity: 0.45,
    fillColor: '#b8d0ee',
    fillIntensity: 0.25,
    environmentIntensity: 0.75,
    far: 30000,
    ownedTextures: [texture],
    update({ camera } = {}) {
      if (!disposed && camera) group.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
