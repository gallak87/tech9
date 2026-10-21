import { assetURL } from '../../../assets/url.js';
import * as T from 'three';

/** Authored far sky and forest horizon; the nearby forest remains world geometry. */
export async function createVesperBackdrop() {
  let texture;
  try {
    texture = await new T.TextureLoader().loadAsync(
      assetURL('assets/levels/vesper/vesper-night-sky-v1.png'),
    );
  } catch (cause) {
    throw new Error(
      'The Vesper forest sky could not load. Reload to try again.',
      { cause },
    );
  }
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const group = new T.Group();
  group.name = 'Vesper / moonlit clouds and distant forest';
  const sunDirection = new T.Vector3(-0.55, 0.46, 0.68).normalize();
  const material = new T.ShaderMaterial({
    name: 'Vesper / forest sky radiance',
    side: T.BackSide,
    depthWrite: false,
    uniforms: { forestSky: { value: texture } },
    vertexShader: `varying vec3 ray; void main(){ ray=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `varying vec3 ray; uniform sampler2D forestSky;
      const float PI=3.141592653589793;
      void main(){
        vec3 direction=normalize(ray);
        float u=fract(atan(direction.z,direction.x)/(2.*PI)+.34);
        float v=asin(clamp(direction.y,-1.,1.))/PI+.5;
        // Overlap the panorama ends so imperfect authored edge matches cannot
        // create a visible meridian. Source pixels remain unchanged.
        float overlap=.04;
        float panoramaU=u*(1.-overlap);
        // Analytic UV derivatives stay continuous across the longitude wrap;
        // implicit derivatives there select a visibly wrong, tiny mip level.
        vec3 dx=dFdx(direction),dy=dFdy(direction);
        float longitudeScale=(1.-overlap)/(2.*PI*max(dot(direction.xz,direction.xz),.000001));
        float latitudeScale=1./(PI*sqrt(max(1.-direction.y*direction.y,.000001)));
        vec2 uvDx=vec2((direction.x*dx.z-direction.z*dx.x)*longitudeScale,dx.y*latitudeScale);
        vec2 uvDy=vec2((direction.x*dy.z-direction.z*dy.x)*longitudeScale,dy.y*latitudeScale);
        vec3 radiance=textureGrad(forestSky,vec2(panoramaU,v),uvDx,uvDy).rgb;
        if(panoramaU<overlap){
          vec3 opposite=textureGrad(forestSky,vec2(panoramaU+1.-overlap,v),uvDx,uvDy).rgb;
          radiance=mix(opposite,radiance,smoothstep(0.,overlap,panoramaU));
        }
        radiance=mix(radiance,vec3(dot(radiance,vec3(.2126,.7152,.0722))),.18)*.43;
        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(5000, 32, 16), material);
  sky.name = 'Vesper / moonlit forest panorama';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection,
    sunColor: '#e1edff',
    // Moon key and opposing cool fill separate crown masses from the quieter sky.
    sunIntensity: 2.6,
    ambientSky: '#93b4ce',
    ambientGround: '#68796c',
    ambientIntensity: 1.15,
    fillColor: '#a5c6d4',
    fillIntensity: 0.75,
    environmentIntensity: 0.52,
    far: 6500,
    ownedTextures: [texture],
    update({ camera } = {}) {
      if (camera) group.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      sky.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
