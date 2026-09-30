import * as T from 'three';

/** Analytical night atmosphere: sky only; all forest mass belongs to world geometry. */
export function createVesperBackdrop() {
  const group = new T.Group();
  group.name = 'Vesper / ink night, lunar haze and distant dawnscar';
  const sunDirection = new T.Vector3(-0.4, 0.63, -0.48).normalize();
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { moon: { value: sunDirection } },
    vertexShader: `varying vec3 ray; void main(){ ray=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `varying vec3 ray; uniform vec3 moon;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      void main(){ vec3 d=normalize(ray); float h=clamp(d.y,0.,1.);
        vec3 c=mix(vec3(.024,.061,.074),vec3(.005,.013,.036),pow(h,.54));
        float az=atan(d.x,d.z); float strata=sin(az*5.+d.y*19.)*.5+sin(az*11.-d.y*31.)*.2;
        float cloud=smoothstep(.12,.68,strata)*exp(-pow((d.y-.27)/.20,2.)); c+=vec3(.014,.022,.026)*cloud;
        float m=dot(d,moon); c+=vec3(.26,.37,.40)*pow(max(m,0.),110.)*.32;
        c+=vec3(.55,.72,.72)*smoothstep(.99972,.99981,m);
        float star=step(.9989,hash(floor(d*1700.)))*smoothstep(.12,.7,h); c+=star*vec3(.32,.42,.46);
        vec3 dawn=normalize(vec3(-.095,.065,.995)); float slit=pow(max(dot(d,dawn),0.),18.)*exp(-pow((d.y-.065)/.065,2.)); c+=slit*vec3(.46,.42,.27);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(5000, 32, 16), material);
  sky.name = 'Vesper / moon and stratified night sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection,
    sunColor: '#bddeed',
    sunIntensity: 1.35,
    ambientSky: '#70959e',
    ambientGround: '#1c252b',
    ambientIntensity: 0.58,
    fillColor: '#82aaa9',
    fillIntensity: 0.25,
    environmentIntensity: 0.68,
    far: 6500,
    ownedTextures: [],
    update({ camera } = {}) {
      if (camera) group.position.copy(camera.position);
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
