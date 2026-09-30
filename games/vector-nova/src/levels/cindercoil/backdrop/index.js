import * as T from 'three';

export function createCindercoilBackdrop({ shape = false } = {}) {
  const group = new T.Group();
  group.name = 'Cindercoil / cold ash atmosphere';
  const sunDirection = new T.Vector3(-0.48, 0.57, -0.66).normalize();
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      time: { value: 0 },
      shape: { value: shape ? 1 : 0 },
      sunDirection: { value: sunDirection },
    },
    vertexShader: `varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 direction;uniform float time;uniform float shape;uniform vec3 sunDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
      float fbm(vec2 p){return noise(p)*.56+noise(p*2.13)*.27+noise(p*4.37)*.12+noise(p*8.71)*.05;}
      void main(){
        vec3 d=normalize(direction);float altitude=max(0.,d.y);
        vec3 sky=mix(vec3(.18,.215,.265),vec3(.043,.073,.125),pow(altitude,.55));
        vec2 uv=vec2(atan(d.z,d.x)*2.6,d.y*5.8)+vec2(time*.0013,0.);
        float warp=fbm(uv*.47);
        float cloud=fbm(uv+vec2(warp*1.8,warp*.6));
        float lower=fbm((uv+vec2(.04,-.10))+vec2(warp*1.8,warp*.6));
        float streak=fbm(vec2(uv.x*1.1,uv.y*3.6));
        float density=cloud*.8+streak*.2;
        float cover=smoothstep(.29,.64,density);
        float rim=pow(max(0.,dot(d,sunDirection)),9.);
        float edge=max(0.,cloud-lower)*4.;
        vec3 cloudTint=mix(vec3(.025,.040,.060),vec3(.135,.158,.181),cloud*.8+edge*.6);
        cloudTint+=vec3(.055,.039,.022)*(rim+edge*.6);
        sky=mix(sky,cloudTint,cover*.95);
        float opening=pow(max(0.,dot(normalize(vec3(d.x,0.,d.z)),normalize(vec3(-.8,0.,-.3)))),10.);
        sky+=vec3(.20,.091,.023)*exp(-pow((d.y-.035)/.055,2.))*opening*(1.-cover*.75);
        sky=mix(sky,vec3(.17,.21,.26),shape*.65);
        gl_FragColor=vec4(sky,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sphere = new T.Mesh(new T.SphereGeometry(4500, 48, 28), material);
  sphere.name = 'Cindercoil / stratified ash cloud ceiling';
  sphere.renderOrder = -1000;
  sphere.frustumCulled = false;
  group.add(sphere);
  let disposed = false;
  return {
    group,
    sunDirection,
    sunColor: '#e4e0d5',
    sunIntensity: 1.85,
    ambientSky: '#a9c5df',
    ambientGround: '#493f43',
    ambientIntensity: 1.05,
    fillColor: '#b0d1e4',
    fillIntensity: 0.36,
    environmentIntensity: 0.38,
    far: 6500,
    ownedTextures: [],
    update({ camera, time = 0, settings = {} } = {}) {
      if (disposed) return;
      if (camera?.position) sphere.position.copy(camera.position);
      material.uniforms.time.value = settings.reducedMotion ? 0 : time;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sphere.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
