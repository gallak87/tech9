import * as T from 'three';
function createShapeBackdrop({ shape = false } = {}) {
  const group = new T.Group();
  group.name = 'Zephyr / apricot bands and violet cloud sea';
  const sunDirection = new T.Vector3(-0.65, 0.45, -0.35).normalize();
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      clock: { value: 0 },
      sun: { value: sunDirection },
      neutral: { value: shape ? 1 : 0 },
    },
    vertexShader:
      'varying vec3 ray; void main(){ray=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww;}',
    fragmentShader: `
      varying vec3 ray; uniform float clock; uniform float neutral; uniform vec3 sun;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){vec3 d=normalize(ray); float n=noise(d*9.+vec3(clock*.003,1.,0.)); float n2=noise(d*24.+n*2.); float up=smoothstep(-.2,.9,d.y);vec3 col=mix(vec3(.69,.49,.48),vec3(.14,.24,.37),up); float bands=sin(d.y*24.+n*.8)*.5+.5;col=mix(col,vec3(.73,.63,.70),bands*.28*(1.-up)); float clouds=smoothstep(.38,.67,n*.7+n2*.3)* (1.-smoothstep(.02,.48,d.y));col=mix(col,vec3(.76,.71,.72),clouds*.62);float light=pow(max(dot(d,sun),0.),24.);col+=vec3(.42,.27,.11)*light;float disk=smoothstep(.999,.9995,dot(d,sun));col+=vec3(1.4,1.,.6)*disk;col=mix(col,vec3(.24,.29,.34),neutral*.65);gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const geometry = new T.SphereGeometry(8000, 40, 24);
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  group.add(mesh);
  group.userData.aoExclude = true;
  return {
    group,
    sunDirection,
    sunColor: '#ffe5c3',
    sunIntensity: 3.0,
    ambientSky: '#b6c5e5',
    ambientGround: '#514658',
    ambientIntensity: 1.15,
    fillColor: '#b8c5e5',
    fillIntensity: 0.45,
    environmentIntensity: 0.75,
    far: 12000,
    update({ camera, time = 0, settings = {} }) {
      mesh.position.copy(camera.position);
      material.uniforms.clock.value = settings.reducedMotion ? 0 : time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}

import { assetURL } from '../../../assets/url.js';
export async function createZephyrBackdrop({
  shape = false,
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
} = {}) {
  if (shape) return createShapeBackdrop({ shape: true });
  const texture = await loadTexture(
    assetURL('assets/levels/zephyr/zephyr-sky-v2.png'),
  );
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const group = new T.Group();
  group.name = 'Zephyr / luminous ivory and violet cloud shelves';
  group.userData.aoExclude = true;
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { stellarSky: { value: texture } },
    vertexShader:
      'varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `varying vec3 ray; uniform sampler2D stellarSky;
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
        vec3 radiance=textureGrad(stellarSky,vec2(panoramaU,v),uvDx,uvDy).rgb;
        if(panoramaU<overlap){
          vec3 opposite=textureGrad(stellarSky,vec2(panoramaU+1.-overlap,v),uvDx,uvDy).rgb;
          radiance=mix(opposite,radiance,smoothstep(0.,overlap,panoramaU));
        }
        // The source pole rows carry longitude detail; blend their mean at the
        // last few degrees rather than pinching those clouds into a bright star.
        float poleV=direction.y>0. ? .99 : .01;
        vec3 poleColor=(textureLod(stellarSky,vec2(.125,poleV),3.).rgb+textureLod(stellarSky,vec2(.375,poleV),3.).rgb+textureLod(stellarSky,vec2(.625,poleV),3.).rgb+textureLod(stellarSky,vec2(.875,poleV),3.).rgb)*.25;
        radiance=mix(radiance,poleColor,smoothstep(.965,.998,abs(direction.y)));
        radiance=mix(radiance,vec3(dot(radiance,vec3(.2126,.7152,.0722))),.19)*.82;

        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new T.SphereGeometry(8000, 48, 32);
  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  group.add(mesh);
  let disposed = false;
  return {
    group,
    ownedTextures: [texture],
    sunDirection: new T.Vector3(-0.65, 0.32, -0.35).normalize(),
    sunColor: '#ffe1bc',
    sunIntensity: 3.1,
    ambientSky: '#9eafd1',
    ambientGround: '#3a3547',
    ambientIntensity: 0.42,
    fillColor: '#b9c9e9',
    fillIntensity: 0.22,
    environmentIntensity: 0.48,
    far: 12000,
    update({ camera }) {
      mesh.position.copy(camera.position);
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
