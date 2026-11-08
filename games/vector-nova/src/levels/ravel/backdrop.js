import * as T from 'three';

const SUN = new T.Vector3(-0.55, 0.38, -0.46).normalize();

/** Scene radiance is shared by the sky and the renderer's PMREM reflection.
 * The fine stars are excluded from reflection capture, avoiding foil glitter. */
export function createRavelBackdrop() {
  const group = new T.Group();
  group.name = 'Ravel / the heliopause loom';
  group.userData.spaceBackdrop = true;
  group.userData.aoExclude = true;
  const geometry = new T.SphereGeometry(19000, 48, 32);
  const material = new T.ShaderMaterial({
    name: 'Ravel / amber stellar radiance',
    side: T.BackSide,
    depthWrite: false,
    uniforms: { sunDirection: { value: SUN } },
    vertexShader: `varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 direction; uniform vec3 sunDirection;
      float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){
        vec3 d=normalize(direction);float sun=max(0.,dot(d,sunDirection));
        float dust=exp(-pow(dot(d,normalize(vec3(.34,.8,-.28)))*10.,2.));
        float clouds=noise(d*7.+4.)*.6+noise(d*23.)*.3+noise(d*75.)*.1;
        vec3 color=mix(vec3(.0025,.0045,.009),vec3(.018,.032,.054),smoothstep(-.8,.5,d.y));
        color+=dust*pow(clouds,2.)*vec3(.058,.038,.031);
        color+=pow(sun,3.)*vec3(.6,.29,.09)+pow(sun,75.)*vec3(.65,.3,.08);
        color+=smoothstep(.99955,.9998,sun)*vec3(15.,10.5,6.);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new T.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = 1000;
  group.add(sky);
  let seed = 918217;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const positions = [],
    colors = [];
  for (let i = 0; i < 6500; i++) {
    const y = random() * 2 - 1,
      angle = random() * Math.PI * 2;
    const radius = Math.sqrt(1 - y * y);
    positions.push(
      Math.cos(angle) * radius * 18500,
      y * 18500,
      Math.sin(angle) * radius * 18500,
    );
    const bright = 0.24 + random() ** 7 * 1.5,
      warm = random();
    colors.push(
      bright,
      bright * (0.8 + warm * 0.15),
      bright * (1.1 - warm * 0.3),
    );
  }
  const starGeometry = new T.BufferGeometry();
  starGeometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(positions, 3),
  );
  starGeometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const starMaterial = new T.PointsMaterial({
    size: 1.25,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const stars = new T.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = -990;
  stars.userData.reflectionExclude = true;
  group.add(stars);
  return {
    group,
    sunDirection: SUN,
    sunColor: '#ffd2a0',
    sunIntensity: 2.7,
    ambientSky: '#a9bad5',
    ambientGround: '#2c2532',
    ambientIntensity: 0.75,
    fillColor: '#a7c7ff',
    fillIntensity: 0.8,
    environmentIntensity: 1.5,
    far: 24000,
    update({ camera }) {
      group.position.copy(camera.position);
    },
    dispose() {
      group.clear();
      geometry.dispose();
      material.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
    },
  };
}
