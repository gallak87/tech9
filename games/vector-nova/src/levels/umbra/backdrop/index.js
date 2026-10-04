import * as T from 'three';
import { assetURL } from '../../../assets/url.js';
import { RING_CENTER } from '../environment/constants.js';

const vertex = `varying vec2 vUv; varying vec3 vDirection;
void main(){vUv=uv;vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const diskFragment = `varying vec2 vUv; uniform float time; uniform float outerRadius; uniform float innerRadius; uniform float radiance;
void main(){
  vec2 p=vUv*2.-1.;float r=length(p);float a=atan(p.y,p.x);
  float inner=innerRadius/outerRadius;
  float mask=smoothstep(inner,inner+.018,r)*(1.-smoothstep(.76,1.,r));
  float bands=.58+.22*sin(r*170.+sin(a*5.-time*.11)*1.8)+.12*sin(r*393.+a*2.-time*.08);
  float streak=.6+.4*pow(.5+.5*sin(a*13.+r*28.-time*.12),3.);
  float asymmetry=.62+.38*sin(a+.5);
  vec3 hot=mix(vec3(1.,.22,.025),vec3(1.,.82,.43),pow(max(0.,1.-r),1.6));
  gl_FragColor=vec4(hot*(bands+streak*.3)*radiance*asymmetry,mask*.94);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Localized composed lensing: never samples/distorts the rendered road or HUD. */
export async function createUmbraBackdrop({
  settings = {},
  loadTexture = (url) => new T.TextureLoader().loadAsync(url),
} = {}) {
  const texture = await loadTexture(
    assetURL('assets/levels/umbra/umbra-sky-v2.png'),
  );
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  texture.wrapT = T.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  const group = new T.Group();
  group.name = 'umbra-accretion-sky';
  group.userData.spaceBackdrop = true;
  group.userData.aoExclude = true;
  const sky = new T.Group();
  group.add(sky);
  const nebula = new T.Mesh(
    new T.SphereGeometry(14000, 48, 24),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: { stellarSky: { value: texture } },
      vertexShader: vertex,
      fragmentShader: `varying vec3 vDirection; uniform sampler2D stellarSky;
      const float PI=3.141592653589793;
      void main(){
        vec3 n=normalize(vDirection);
        float u=fract(atan(n.z,n.x)/(2.*PI)+.29);
        float v=asin(clamp(n.y,-1.,1.))/PI+.5;
        float overlap=.035;
        float mapped=u*(1.-overlap);
        vec3 dx=dFdx(n),dy=dFdy(n);
        float ls=(1.-overlap)/(2.*PI*max(dot(n.xz,n.xz),.000001));
        float vs=1./(PI*sqrt(max(1.-n.y*n.y,.000001)));
        vec2 gx=vec2((n.x*dx.z-n.z*dx.x)*ls,dx.y*vs);
        vec2 gy=vec2((n.x*dy.z-n.z*dy.x)*ls,dy.y*vs);
        vec3 color=textureGrad(stellarSky,vec2(mapped,v),gx,gy).rgb;
        if(mapped<overlap) color=mix(textureGrad(stellarSky,vec2(mapped+1.-overlap,v),gx,gy).rgb,color,smoothstep(0.,overlap,mapped));
        float pv=n.y>0. ?.99:.01;
        vec3 pole=(textureLod(stellarSky,vec2(.125,pv),3.).rgb+textureLod(stellarSky,vec2(.375,pv),3.).rgb+textureLod(stellarSky,vec2(.625,pv),3.).rgb+textureLod(stellarSky,vec2(.875,pv),3.).rgb)*.25;
        color=mix(color,pole,smoothstep(.965,.998,abs(n.y)));
        gl_FragColor=vec4(color*.08,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  nebula.renderOrder = -1000;
  sky.add(nebula);
  const starVertices = [],
    starColors = [];
  let seed = 1029;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 1800; i++) {
    const z = random() * 2 - 1,
      a = random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z),
      d = 12000;
    starVertices.push(r * Math.cos(a) * d, z * d, r * Math.sin(a) * d);
    const intensity = 0.34 + random() * 0.7;
    starColors.push(
      intensity * (0.65 + random() * 0.35),
      intensity * 0.85,
      intensity,
    );
  }
  const starGeometry = new T.BufferGeometry();
  starGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(starVertices, 3),
  );
  starGeometry.setAttribute(
    'color',
    new T.Float32BufferAttribute(starColors, 3),
  );
  const stars = new T.Points(
    starGeometry,
    new T.PointsMaterial({
      vertexColors: true,
      size: 1.55,
      sizeAttenuation: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    }),
  );
  stars.renderOrder = -990;
  sky.add(stars);
  const hole = new T.Group();
  hole.name = 'Umbra / localized black hole and accretion disk';
  hole.position.set(...RING_CENTER);
  hole.lookAt(0, 130, 0);
  group.add(hole);
  const voidMesh = new T.Mesh(
    new T.SphereGeometry(262, 64, 40),
    new T.MeshBasicMaterial({ color: '#010103' }),
  );
  hole.add(voidMesh);
  const photon = new T.Mesh(
    new T.TorusGeometry(267, 2.7, 8, 160),
    new T.MeshBasicMaterial({ color: '#ffcb79', toneMapped: false }),
  );
  photon.position.z = 3;
  hole.add(photon);
  const diskMaterial = new T.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      outerRadius: { value: 810 },
      innerRadius: { value: 245 },
      radiance: { value: 1.5 },
    },
    vertexShader: vertex,
    fragmentShader: diskFragment,
    transparent: true,
    side: T.DoubleSide,
    depthWrite: false,
  });
  const disk = new T.Mesh(new T.PlaneGeometry(1620, 1620), diskMaterial);
  disk.rotation.set(1.32, 0.05, -0.22);
  disk.name = 'Layered incandescent orbital accretion';
  hole.add(disk);
  // A thin lensed circular halo remains visible above/below the inclined disk.
  const lensMaterial = new T.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: vertex,
    fragmentShader: `varying vec2 vUv;void main(){vec2 p=vUv*2.-1.;float r=length(p);float delta=r-.69;float rim=exp(-(delta/.022)*(delta/.022));float halo=exp(-(delta/.09)*(delta/.09))*.17;float arc=.56+.44*abs(p.y);gl_FragColor=vec4(vec3(1.,.56,.19)*(rim*1.8+halo)*arc,(rim+halo)*.7);}`,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const lensHalo = new T.Mesh(new T.PlaneGeometry(780, 780), lensMaterial);
  lensHalo.position.z = 13;
  hole.add(lensHalo);
  let simulationTime = 0;
  let disposed = false;
  return {
    group,
    sunDirection: new T.Vector3(-0.66, 0.31, -0.68).normalize(),
    sunColor: '#ffd9b4',
    sunIntensity: 2.7,
    ambientSky: '#a2c2e4',
    ambientGround: '#202735',
    ambientIntensity: 0.92,
    fillColor: '#91c8f1',
    fillIntensity: 0.78,
    environmentIntensity: 0.3,
    far: 22000,
    ownedTextures: [texture],
    assets: { ringCenter: RING_CENTER },
    update({
      camera,
      settings: current = settings,
      dt = 0,
      time = 0,
      reset = false,
    }) {
      if (camera) sky.position.copy(camera.position);
      if (reset || dt > 0) simulationTime = Math.max(0, time);
      diskMaterial.uniforms.time.value = current.reducedMotion
        ? 0
        : simulationTime;
      starGeometry.setDrawRange(0, current.quality === 'low' ? 850 : 1800);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      group.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
      });
      group.clear();
    },
  };
}
