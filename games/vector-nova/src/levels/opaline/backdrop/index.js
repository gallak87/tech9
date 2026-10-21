import * as T from 'three';
export const OPALINE_SUN = new T.Vector3(0.8, 0.5, 0.31).normalize();

/** A quiet pearl sky leaves the mineral wall, river and road as the focal hierarchy. */
export function createOpalineBackdrop() {
  const group = new T.Group();
  const geometry = new T.SphereGeometry(7000, 32, 16);
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      sun: { value: OPALINE_SUN },
      horizonColor: { value: new T.Color('#9faab8') },
      middleColor: { value: new T.Color('#416d9d') },
      zenithColor: { value: new T.Color('#203e69') },
      cloudShade: { value: new T.Color('#6c7e9c') },
      cloudLight: { value: new T.Color('#e4d8cf') },
    },
    vertexShader:
      'varying vec3 ray;void main(){ray=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p;}',
    fragmentShader: `
      varying vec3 ray;uniform vec3 sun,horizonColor,middleColor,zenithColor,cloudShade,cloudLight;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<4;i++){n+=noise(p)*a;p=p*2.03+13.7;a*=.5;}return n;}
      void main(){
        vec3 d=normalize(ray);
        // Colors enter in linear space; the HDR output pass tone maps once.
        // Put the chromatic transition inside the driver's visible sky rather
        // than compressing a bright linear horizon into near-white under ACES.
        float lower=smoothstep(-.035,.43,d.y);
        float upper=smoothstep(.35,1.,d.y);
        vec3 color=mix(horizonColor,middleColor,lower);
        color=mix(color,zenithColor,upper);
        float facing=max(dot(d,sun),0.);
        float light=pow(facing,18.);
        color+=vec3(.13,.085,.035)*light;
        vec2 p=d.xz/(max(d.y,.025)+.22);
        float bank=fbm(p*1.25+vec2(8.,4.));
        float strands=fbm(p*vec2(.6,2.8)+vec2(2.,9.));
        float cloud=smoothstep(.4,.66,bank*.65+strands*.35);
        cloud*=smoothstep(.015,.16,d.y)*(1.-smoothstep(.72,.98,d.y));
        vec3 cloudColor=mix(cloudShade,cloudLight,.27+light*.55+strands*.18);
        color=mix(color,cloudColor,cloud*.74);
        color+=vec3(1.9,1.6,1.2)*smoothstep(.9994,.9998,dot(d,sun));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(geometry, material);
  sky.name = 'Opaline mineral sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection: OPALINE_SUN,
    sunColor: '#ffe9ce',
    sunIntensity: 2.45,
    ambientSky: '#bfcbdc',
    ambientGround: '#343b4e',
    ambientIntensity: 0.28,
    fillColor: '#a6b7d5',
    fillIntensity: 0.12,
    environmentIntensity: 0.48,
    far: 7500,
    update({ camera } = {}) {
      if (camera) group.position.copy(camera.position);
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
