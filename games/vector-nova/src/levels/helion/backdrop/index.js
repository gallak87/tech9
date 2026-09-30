import * as T from 'three';
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
 * Radiance remains below white clipping; no panorama substitutes for geometry. */
export function createHelionBackdrop({ settings = {} } = {}) {
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
      float granules=noise3(p*53.+convection*3.7);
      float cells=smoothstep(.3,.74,granules);
      float basin=pow(smoothstep(.58,.83,fbm(p*1.6)),2.);
      float filament=pow(1.-abs(sin(p.x*2.1+p.z*1.7+fbm(p*2.8)*9.)),15.);
      float heat=.21+convection*.55+cells*.21-basin*.42-filament*.14;
      vec3 dark=vec3(.24,.015,.007); vec3 orange=vec3(1.10,.18,.017); vec3 bright=vec3(1.65,.59,.085);
      vec3 radiance=mix(dark,orange,smoothstep(.07,.55,heat)); radiance=mix(radiance,bright,smoothstep(.55,.88,heat));
      float facing=max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.);
      radiance*=.51+.49*pow(facing,.32);radiance*=.96+activity*.11;
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
  const coronaMaterial = new T.ShaderMaterial({
    name: 'Helion / restrained stellar limb radiance',
    transparent: true,
    depthWrite: false,
    side: T.BackSide,
    blending: T.AdditiveBlending,
    uniforms,
    vertexShader: vertex,
    fragmentShader: `varying vec3 vWorld; varying vec3 vNormal; uniform float activity;
    void main(){float edge=pow(1.-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),6.);gl_FragColor=vec4(vec3(.72,.115,.012),edge*(.12+activity*.03));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  const corona = new T.Mesh(
    new T.SphereGeometry(12470, 80, 48),
    coronaMaterial,
  );
  corona.position.copy(STAR_POSITION);
  corona.renderOrder = -949;
  group.add(corona);
  const skyMaterial = new T.ShaderMaterial({
    name: 'Helion / deep plum space and weak stellar haze',
    side: T.BackSide,
    depthWrite: false,
    vertexShader: vertex,
    fragmentShader: `varying vec3 vLocal;void main(){vec3 n=normalize(vLocal);float glow=pow(max(dot(n,normalize(vec3(-.69,-.11,-.58))),0.),4.);gl_FragColor=vec4(mix(vec3(.003,.004,.011),vec3(.038,.009,.008),glow),1.);
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
    ownedTextures: [],
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
      for (const object of [star, corona, sky, distantStars]) {
        object.geometry.dispose();
        object.material.dispose();
      }
      group.clear();
    },
  };
}
