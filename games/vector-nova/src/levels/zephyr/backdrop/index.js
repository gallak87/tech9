import * as T from 'three';
export function createZephyrBackdrop({ shape = false } = {}) {
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
