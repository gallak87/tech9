import * as T from 'three';

/** New procedural dusk atmosphere; no panorama or legacy environment dependency. */
export function createVesperBackdrop() {
  const group = new T.Group();
  group.name = 'Living Forest / cloud sea at dusk';
  const sunDirection = new T.Vector3(-0.62, 0.55, -0.48).normalize();
  const geometry = new T.SphereGeometry(5000, 32, 16);
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { sun: { value: sunDirection } },
    vertexShader:
      'varying vec3 ray; void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `
 varying vec3 ray;uniform vec3 sun;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.03+13.7;a*=.5;}return n;}
 void main(){vec3 d=normalize(ray);float h=smoothstep(-.12,.7,d.y);
 vec3 sky=mix(vec3(.34,.49,.49),vec3(.024,.067,.11),h);
 float glow=pow(max(dot(d,sun),0.),12.);sky+=vec3(.48,.31,.14)*glow;
 vec2 p=d.xz/(max(d.y,.04)+.18)*1.6;
 float cloud=smoothstep(.43,.73,fbm(p+vec2(3,8)))*smoothstep(-.04,.3,d.y);
 sky=mix(sky,vec3(.3,.4,.41)+glow*vec3(.35,.23,.11),cloud*.65);
 sky+=vec3(.85,.65,.34)*smoothstep(.999,.9997,dot(d,sun))*.8;
 gl_FragColor=vec4(sky,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
  });
  const sky = new T.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  return {
    group,
    sunDirection,
    sunColor: '#ffe1ae',
    sunIntensity: 3.3,
    ambientSky: '#b5d9df',
    ambientGround: '#22383a',
    ambientIntensity: 0.65,
    fillColor: '#91b8cf',
    fillIntensity: 0.3,
    environmentIntensity: 0.6,
    far: 6500,
    update({ camera }) {
      if (camera) group.position.copy(camera.position);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
