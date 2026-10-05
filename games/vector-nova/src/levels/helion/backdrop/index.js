import * as T from 'three';
import { assetURL } from '../../../assets/url.js';
import { sampleHelionProminences } from '../thermal.js';

export const HELION_SUN_DIRECTION = new T.Vector3(
  -0.69,
  0.54,
  -0.49,
).normalize();
const STAR_POSITION = new T.Vector3(-14200, -2100, -10000);
const vertex = `varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal;
void main(){ vLocal=position; vec4 p=modelMatrix*vec4(position,1.); vWorld=p.xyz; vNormal=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*p; }`;
const noise = `
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){return noise3(p)*.55+noise3(p*2.07+8.3)*.27+noise3(p*4.15-3.1)*.13+noise3(p*8.9)*.05;}
`;

/** A scene-fixed photosphere has visible granulation, sunspot basins and filaments.
 * The bright surface and broad additive corona retain visible magnetic structure. */
export async function createHelionBackdrop({
  settings = {},
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
} = {}) {
  let texture;
  try {
    texture = await loadTexture(
      assetURL('assets/levels/helion/helion-sky-v2.png'),
    );
  } catch (cause) {
    throw new Error(
      'The Helion stellar sky could not load. Reload to try again.',
      { cause },
    );
  }
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const group = new T.Group();
  group.name = 'Helion / immense structured stellar limb';
  group.userData.spaceBackdrop = true;
  group.userData.aoExclude = true;
  const uniforms = { time: { value: 0 }, activity: { value: 0.4 } };
  const photosphere = new T.ShaderMaterial({
    name: 'Helion / cellular photosphere and dark magnetic filaments',
    uniforms,
    vertexShader: vertex,
    fragmentShader: `varying vec3 vLocal; varying vec3 vWorld; varying vec3 vNormal; uniform float time; uniform float activity; ${noise}
    void main(){
      vec3 n=normalize(vLocal); vec3 p=n*13.; p.x+=time*.0007;
      float convection=fbm(p*3.2+fbm(p)*2.5);
      float granules=noise3(p*25.+convection*3.7);
      float cells=smoothstep(.3,.74,granules);
      float basin=pow(smoothstep(.39,.67,fbm(p*1.6)),2.);
      float filament=pow(1.-abs(sin(p.x*2.1+p.z*1.7+fbm(p*2.8)*9.)),15.);
      float heat=.16+convection*.62+cells*.16-basin*.57-filament*.13;
      vec3 dark=vec3(.14,.004,.003); vec3 orange=vec3(1.28,.14,.009); vec3 bright=vec3(1.65,.59,.085);
      vec3 radiance=mix(dark,orange,smoothstep(.07,.55,heat)); radiance=mix(radiance,bright,smoothstep(.48,.78,heat));
      float facing=max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.);
      radiance*=.51+.49*pow(facing,.32);radiance*=1.5+activity*.24;
      gl_FragColor=vec4(radiance,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const star = new T.Mesh(new T.SphereGeometry(12200, 112, 72), photosphere);
  star.name = 'Helion / 24 km visible photospheric shell';
  star.position.copy(STAR_POSITION);
  star.renderOrder = -950;
  group.add(star);
  // Independent HDR shells make the star visibly luminous even on low quality,
  // while depth testing keeps the corona behind the road and ship.
  const coronas = [
    { scale: 1.045, color: [3.4, 0.82, 0.075], opacity: 0.68 },
    { scale: 1.19, color: [1.5, 0.32, 0.028], opacity: 0.52 },
  ].map(({ scale, color, opacity }, index) => {
    const material = new T.ShaderMaterial({
      name: `Helion / ${index ? 'broad amber corona' : 'hot stellar limb'}`,
      transparent: true,
      depthWrite: false,
      side: T.BackSide,
      blending: T.AdditiveBlending,
      uniforms: { ...uniforms, haloColor: { value: new T.Vector3(...color) } },
      vertexShader: vertex,
      fragmentShader: `varying vec3 vWorld;varying vec3 vNormal;uniform float activity;uniform vec3 haloColor;
      void main(){float facing=abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld)));
      float radius=sqrt(max(0.,1.-facing*facing))*${scale};
      float falloff=exp(-max(0.,radius-1.)*${index ? 13 : 27}.);
      float outer=1.-smoothstep(${index ? 1.06 : 1.008},${scale},radius);
      gl_FragColor=vec4(haloColor,falloff*outer*${opacity}*(.9+activity*.18));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>}`,
    });
    const corona = new T.Mesh(
      new T.SphereGeometry(12200 * scale, 80, 48),
      material,
    );
    corona.position.copy(STAR_POSITION);
    corona.renderOrder = -949 + index;
    group.add(corona);
    return corona;
  });
  const skyMaterial = new T.ShaderMaterial({
    name: 'Helion / selected burgundy stellar space',
    side: T.BackSide,
    depthWrite: false,
    uniforms: { stellarSky: { value: texture } },
    vertexShader: `varying vec3 ray; void main(){ ray=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
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
        radiance*=.48;

        gl_FragColor=vec4(radiance,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(34000, 32, 20), skyMaterial);
  sky.renderOrder = -1000;
  group.add(sky);
  const starPoints = [];
  for (let i = 0; i < 240; i++) {
    const y = 1 - (i / 239) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996323;
    starPoints.push(
      Math.cos(a) * r * 31000,
      y * 31000,
      Math.sin(a) * r * 31000,
    );
  }
  const starGeometry = new T.BufferGeometry();
  starGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(starPoints, 3),
  );
  const distantStars = new T.Points(
    starGeometry,
    new T.PointsMaterial({
      color: '#8d9fae',
      size: 11,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.52,
    }),
  );
  distantStars.renderOrder = -980;
  group.add(distantStars);
  let disposed = false;
  return {
    group,
    sunDirection: HELION_SUN_DIRECTION.clone(),
    sunColor: '#ffdbac',
    sunIntensity: 3.0,
    ambientSky: '#bac5d6',
    ambientGround: '#40201c',
    ambientIntensity: 0.78,
    fillColor: '#b2c3df',
    fillIntensity: 0.48,
    environmentIntensity: 0.64,
    far: 45000,
    ownedTextures: [texture],
    update({ time = 0, settings: current = settings, camera } = {}) {
      uniforms.time.value = current.reducedMotion ? 0 : time;
      uniforms.activity.value =
        sampleHelionProminences(time).reduce(
          (total, flare) => total + flare.strength,
          0,
        ) / 2;
      if (camera) sky.position.copy(camera.position);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      for (const object of [star, ...coronas, sky, distantStars]) {
        object.geometry.dispose();
        object.material.dispose();
      }
      group.clear();
    },
  };
}
