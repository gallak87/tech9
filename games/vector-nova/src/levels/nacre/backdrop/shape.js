import * as T from 'three';
import { sampleNacreWater } from '../environment/atmosphere.js';

/** Source-native neutral storm massing for early route review. */
export function createNacreBackdrop({ waterY = 0 } = {}) {
  const group = new T.Group();
  group.name = 'Nacre / early storm-sky massing';
  group.userData.aoExclude = true;
  const sunDirection = new T.Vector3(-0.55, 0.72, 0.42).normalize();
  const material = new T.ShaderMaterial({
    name: 'Nacre / source-native shape-review sky',
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: sunDirection },
      wetness: { value: 0 },
    },
    vertexShader: `
      varying vec3 skyRay;
      void main() {
        skyRay=position;
        vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
        gl_Position=p.xyww;
      }
    `,
    fragmentShader: `
      varying vec3 skyRay;
      uniform vec3 sunDirection;
      uniform float wetness;
      float hash(vec3 p) {return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p) {
        vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
      void main() {
        vec3 ray=normalize(skyRay);
        float height=smoothstep(-.18,.9,ray.y);
        vec3 sky=mix(vec3(.32,.40,.42),vec3(.105,.16,.19),height);
        float shape=noise(ray*4.8+2.2)*.7+noise(ray*13.4)*.3;
        float tower=smoothstep(.43,.69,shape)*smoothstep(-.06,.2,ray.y);
        sky=mix(sky,vec3(.14,.19,.21),tower*.62);
        float opening=pow(max(dot(ray,sunDirection),0.),16.);
        sky+=vec3(.24,.24,.20)*opening;
        vec3 underwater=mix(vec3(.016,.066,.080),vec3(.10,.22,.25),smoothstep(-.5,1.,ray.y));
        gl_FragColor=vec4(mix(sky,underwater,wetness),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new T.Mesh(new T.SphereGeometry(7000, 32, 16), material);
  sky.name = 'Nacre / neutral sea horizon and storm silhouettes';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let overview = false;
  let disposed = false;
  return {
    group,
    sunDirection,
    sunColor: '#e7e9de',
    sunIntensity: 2.25,
    ambientSky: '#c2dadc',
    ambientGround: '#578088',
    ambientIntensity: 1.8,
    fillColor: '#99c8d3',
    fillIntensity: 0.65,
    environmentIntensity: 0.78,
    far: 14000,
    ownedTextures: [],
    setOverview(active) {
      overview = Boolean(active);
    },
    update(cameraPosition) {
      sky.position.copy(cameraPosition);
      material.uniforms.wetness.value = overview
        ? 0
        : sampleNacreWater(cameraPosition.y, waterY).submerged;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sky.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
