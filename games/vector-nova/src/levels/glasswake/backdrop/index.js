import * as T from 'three';
import { sampleGlasswakeWeather } from '../weather/state.js';

export async function createGlasswakeBackdrop({ shape = false, track } = {}) {
  const texture = shape
    ? null
    : await new T.TextureLoader()
        .loadAsync('/assets/levels/glasswake/aurora-sky-v1.png')
        .catch((reason) => {
          const detail =
            reason instanceof Error ? reason.message : 'image request failed';
          throw new Error(`Glasswake aurora sky failed to load: ${detail}`, {
            cause: reason,
          });
        });
  if (texture) {
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = T.RepeatWrapping;
    texture.anisotropy = 4;
  }
  const group = new T.Group();
  group.name = 'Glasswake / generated auroral sky';
  group.userData.spaceBackdrop = true;
  group.userData.aoExclude = true;
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      skyMap: { value: texture },
      clock: { value: 0 },
      neutral: { value: shape ? 1 : 0 },
      storm: { value: 0 },
    },
    vertexShader: `varying vec3 ray; void main(){ ray=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `varying vec3 ray; uniform sampler2D skyMap; uniform float clock; uniform float neutral; uniform float storm;
      const float PI=3.141592653589793;
      void main(){
        vec3 direction=normalize(ray);
        float u=fract(atan(direction.z,direction.x)/(2.*PI)+.34+sin(clock*.004)*.004);
        float v=asin(clamp(direction.y,-1.,1.))/PI+.5;
        float overlap=.04;
        float panoramaU=u*(1.-overlap);
        vec3 dx=dFdx(direction),dy=dFdy(direction);
        float longitudeScale=(1.-overlap)/(2.*PI*max(dot(direction.xz,direction.xz),.000001));
        float latitudeScale=1./(PI*sqrt(max(1.-direction.y*direction.y,.000001)));
        vec2 uvDx=vec2((direction.x*dx.z-direction.z*dx.x)*longitudeScale,dx.y*latitudeScale);
        vec2 uvDy=vec2((direction.x*dy.z-direction.z*dy.x)*longitudeScale,dy.y*latitudeScale);
        vec3 col=textureGrad(skyMap,vec2(panoramaU,v),uvDx,uvDy).rgb;
        if(panoramaU<overlap){
          vec3 opposite=textureGrad(skyMap,vec2(panoramaU+1.-overlap,v),uvDx,uvDy).rgb;
          col=mix(opposite,col,smoothstep(0.,overlap,panoramaU));
        }
        col*=.65;
        col=mix(col,vec3(.008,.017,.033),(1.-smoothstep(-.6,0.,direction.y))*.8);
        float cloud=.5+.25*sin(direction.x*7.+direction.z*4.+clock*.012)*sin(direction.z*9.-direction.y*5.);
        float veil=storm*(.42+.45*cloud)*(1.-smoothstep(.25,.95,direction.y)*.25);
        col=mix(col,vec3(.12,.20,.27)*(1.+cloud*.26),veil);
        col=mix(col,vec3(.065,.09,.12),neutral);
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(7200, 48, 28), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    far: 11000,
    sunDirection: new T.Vector3(-0.58, 0.38, 0.72).normalize(),
    sunColor: '#e7f2ff',
    sunIntensity: shape ? 2.4 : 2.8,
    ambientSky: '#b4cedf',
    ambientGround: '#345168',
    ambientIntensity: shape ? 1.6 : 0.8,
    fillColor: '#b7cfea',
    fillIntensity: 0.48,
    environmentIntensity: 0.5,
    ownedTextures: texture ? [texture] : [],
    update({ camera, state, reviewing = false, time = 0, settings = {} }) {
      if (disposed) return;
      if (camera) group.position.copy(camera.position);
      material.uniforms.storm.value =
        shape || reviewing || !track || !state
          ? 0
          : sampleGlasswakeWeather(track, state, settings).storm;
      material.uniforms.clock.value = settings.reducedMotion ? 0 : time;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture?.dispose();
      sky.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
