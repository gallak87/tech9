import * as T from 'three';
// Large soft gust layers put fine snow in a depth context. Opaque terrain still
// occludes them; low alpha reserves the driving corridor and the selected sky.
export function createSnowDriftLayer() {
  const base = new T.PlaneGeometry(1, 1),
    geometry = new T.InstancedBufferGeometry();
  geometry.index = base.index.clone();
  geometry.setAttribute('position', base.attributes.position.clone());
  geometry.setAttribute('uv', base.attributes.uv.clone());
  base.dispose();
  const seeds = new Float32Array(64 * 4);
  for (let i = 0; i < seeds.length; i++)
    seeds[i] = (((Math.sin(i * 53.71 + 9.3) * 41327.31) % 1) + 1) % 1;
  geometry.setAttribute('driftSeed', new T.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = 64;
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      eye: { value: new T.Vector3() },
      clock: { value: 0 },
      wind: { value: new T.Vector2() },
      strength: { value: 0 },
      stretch: { value: 0 },
    },
    vertexShader: `
  attribute vec4 driftSeed;uniform vec3 eye;uniform float clock;uniform vec2 wind;varying vec2 driftUv;varying float driftFade;
  void main(){vec3 p=vec3(driftSeed.x*300.,driftSeed.y*36.,driftSeed.z*300.);
    p.xz=mod(p.xz+wind*clock*.8-eye.xz+150.,300.)-150.+eye.xz;
    p.y=eye.y-17.+p.y+sin(clock*.37+driftSeed.w*12.)*2.;
    float edge=1.-smoothstep(95.,150.,length(p.xz-eye.xz));
    vec4 mv=viewMatrix*vec4(p,1.);driftFade=edge*smoothstep(8.,22.,-mv.z);
    mv.xy+=position.xy*vec2(36.+driftSeed.w*24.,7.+driftSeed.y*6.);gl_Position=projectionMatrix*mv;driftUv=uv;
  }`,
    fragmentShader: `uniform float strength;varying vec2 driftUv;varying float driftFade;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){vec2 q=driftUv-.5;float cloud=1.-smoothstep(.08,.5,length(q));
      float grain=n(driftUv*vec2(6.,3.))*.65+n(driftUv*vec2(13.,7.))*.35;
      gl_FragColor=vec4(.64,.78,.88,cloud*cloud*grain*driftFade*strength*.12);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const mesh = new T.Mesh(geometry, material);
  mesh.name = 'Glasswake / layered snow gust';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, geometry, material, capacity: 64 };
}
