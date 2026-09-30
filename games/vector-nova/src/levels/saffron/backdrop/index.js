import * as T from 'three';

/** Dry atmospheric layers remain celestial; all dunes/fossils are real geometry. */
export function createSaffronBackdrop({ shape = false } = {}) {
  const group = new T.Group();
  group.name = 'Saffron / immense dry atmosphere and pale high sun';
  group.userData.aoExclude = true;
  const sunDirection = new T.Vector3(-0.72, 0.48, 0.49).normalize();
  const material = new T.ShaderMaterial({
    name: 'Saffron / lavender aerosol layers, cirrus, and distant moon',
    side: T.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: sunDirection },
      neutral: { value: shape ? 1 : 0 },
    },
    vertexShader: `varying vec3 skyRay; void main(){skyRay=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
    fragmentShader: `
      varying vec3 skyRay; uniform vec3 sunDirection; uniform float neutral;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){
        vec3 ray=normalize(skyRay);
        float h=smoothstep(-.09,.83,ray.y);
        vec3 sky=mix(vec3(.69,.49,.34),vec3(.235,.235,.33),h);
        float nearHorizon=exp(-pow((ray.y-.015)/.16,2.));
        sky=mix(sky,vec3(.79,.61,.43),nearHorizon*.57);
        float aerosol=exp(-pow((ray.y-.15-.025*sin(atan(ray.z,ray.x)*2.))/ .095,2.));
        sky=mix(sky,vec3(.48,.38,.48),aerosol*.2);
        float wisps=noise(vec3(ray.x*3.,ray.y*51.,ray.z*8.))*.7+noise(ray*21.)*.3;
        float highCloud=smoothstep(.54,.75,wisps)*smoothstep(.2,.38,ray.y)*(1.-smoothstep(.69,.88,ray.y));
        sky+=vec3(.13,.105,.08)*highCloud*.55;
        float sun=max(dot(ray,sunDirection),0.);
        sky+=vec3(.42,.31,.15)*pow(sun,28.);
        sky+=vec3(3.4,2.75,1.7)*smoothstep(.99931,.99945,sun);
        vec3 moonDir=normalize(vec3(.57,.46,-.52));
        float lunar=dot(ray,moonDir);
        float disk=smoothstep(.9937,.9942,lunar);
        float shadow=smoothstep(.0,.12,dot(ray-moonDir,normalize(vec3(-.5,.2,.6))));
        sky=mix(sky,vec3(.64,.52,.50),disk*.30*(.24+shadow));
        sky=mix(sky,vec3(dot(sky,vec3(.2126,.7152,.0722))),neutral*.65);
        gl_FragColor=vec4(sky,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(new T.SphereGeometry(12000, 48, 24), material);
  sky.name = 'Saffron / dry alien celestial dome';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  group.add(sky);
  let disposed = false;
  return {
    group,
    sunDirection,
    sunColor: '#fff0d0',
    sunIntensity: 2.75,
    ambientSky: '#d5c4bf',
    ambientGround: '#927044',
    ambientIntensity: 1.08,
    fillColor: '#b4a3c9',
    fillIntensity: 0.42,
    environmentIntensity: 0.62,
    far: 15000,
    ownedTextures: [],
    update({ camera } = {}) {
      if (!disposed && camera) sky.position.copy(camera.position);
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
