import * as T from 'three';

export function createGlasswakeBackdrop({ shape = false } = {}) {
  const group = new T.Group();
  group.name = 'Glasswake / quiet auroral sky';
  group.userData.spaceBackdrop = true;
  group.userData.aoExclude = true;
  const geometry = new T.SphereGeometry(7200, 48, 28);
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { clock: { value: 0 }, neutral: { value: shape ? 1 : 0 } },
    vertexShader: `varying vec3 direction;
      void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 direction; uniform float clock; uniform float neutral;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec3 d=normalize(direction); float az=atan(d.z,d.x); float el=asin(d.y);
        vec3 col=mix(vec3(.025,.055,.115),vec3(.002,.006,.023),smoothstep(-.12,.8,d.y));
        float horizon=exp(-abs(d.y+.07)*9.); col+=vec3(.015,.025,.048)*horizon;
        for(int i=0;i<3;i++){
          float n=float(i); float bend=.43+.09*n+.085*sin(az*2.5+n+clock*.012)+.04*sin(az*5.-n*.8);
          float curtain=exp(-abs(el-bend)*18.)*smoothstep(.07,.2,d.y);
          float ribs=.78+.14*sin(az*26.+sin(az*7.)*2.+clock*.016)+.08*sin(az*61.);
          col+=mix(vec3(.015,.115,.082),vec3(.09,.025,.14),n*.43)*curtain*ribs*.4;
        }
        vec2 st=vec2(az,el)*vec2(420.,280.); vec2 id=floor(st); vec2 uv=fract(st)-.5;
        float stars=step(.997,hash(id))*exp(-dot(uv,uv)*55.)*smoothstep(-.05,.3,d.y);
        col+=vec3(.54,.65,.82)*stars;
        col=mix(col,vec3(.065,.09,.12),neutral);
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const sky = new T.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    far: 11000,
    sunDirection: new T.Vector3(-0.58, 0.38, 0.72).normalize(),
    sunColor: '#e7f2ff',
    sunIntensity: shape ? 2.4 : 2.05,
    ambientSky: '#759dd8',
    ambientGround: '#0b1940',
    ambientIntensity: shape ? 1.6 : 0.7,
    fillColor: '#b7cfea',
    fillIntensity: 0.5,
    environmentIntensity: 0.55,
    ownedTextures: [],
    update({ camera, time = 0, settings = {} }) {
      if (disposed) return;
      if (camera) group.position.copy(camera.position);
      material.uniforms.clock.value = settings.reducedMotion ? 0 : time;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
