import * as T from 'three';
import { NOMAD_MOTION_RULES, sampleCarrierMotion } from './motion.js';

const AXLES = 9;
const LAYERS = 3;
const LOW_COUNT = AXLES * 2;
const HIGH_COUNT = LOW_COUNT * LAYERS;
const hash = (value) => {
  const result = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return result - Math.floor(result);
};

function puffGeometry(seeds) {
  const geometry = new T.PlaneGeometry(2, 2);
  geometry.setAttribute(
    'dustSeed',
    new T.InstancedBufferAttribute(Float32Array.from(seeds), 1),
  );
  geometry.setAttribute(
    'dustAge',
    new T.InstancedBufferAttribute(new Float32Array(HIGH_COUNT), 1).setUsage(
      T.DynamicDrawUsage,
    ),
  );
  return geometry;
}

function dustMaterial() {
  return new T.ShaderMaterial({
    name: 'Nomad / low rolling salt wakes',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.fog),
      dustColor: { value: new T.Color('#d5d2c5') },
      dustOpacity: { value: 0.23 },
      sunDirection: { value: new T.Vector3(-0.62, 0.39, -0.67).normalize() },
    },
    vertexShader: `
      attribute float dustSeed,dustAge;
      varying vec2 dustUV;
      varying float age,seed;
      #include <fog_pars_vertex>
      void main(){
        dustUV=uv;age=dustAge;seed=dustSeed;
        vec3 centre=(modelMatrix*vec4(instanceMatrix[3].xyz,1.)).xyz;
        // Keep the card's vertical axis in the world. A banked racing camera
        // must not turn a low wheel wake into an upright curtain over the road.
        vec3 side=vec3(viewMatrix[0][0],0.,viewMatrix[2][0]);
        side=dot(side,side)>.00001?normalize(side):vec3(1.,0.,0.);
        vec2 size=vec2(instanceMatrix[0][0],instanceMatrix[1][1]);
        vec3 point=centre+side*position.x*size.x+vec3(0.,position.y*size.y,0.);
        vec4 mvPosition=viewMatrix*vec4(point,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 dustColor,sunDirection;
      uniform float dustOpacity;
      varying vec2 dustUV;
      varying float age,seed;
      #include <fog_pars_fragment>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),
          mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      void main(){
        vec2 q=dustUV*2.-1.;
        float grain=noise(q*3.4+seed*31.+vec2(age*.9,age*.4));
        grain=grain*.72+noise(q*8.1+seed*57.)*.28;
        float radius=dot(q,q)+(.5-grain)*.24;
        float edge=1.-smoothstep(.18,1.,radius);
        float life=smoothstep(0.,.12,age)*(1.-smoothstep(.58,1.,age));
        float alpha=dustOpacity*edge*life*(.56+.44*grain);
        if(alpha<.003)discard;
        vec3 normal=normalize(vec3(q*.55,sqrt(max(0.,1.-dot(q,q)))));
        vec3 light=normalize(mat3(viewMatrix)*sunDirection);
        float shade=.78+.22*max(0.,dot(normal,light));
        gl_FragColor=vec4(dustColor*shade,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

/** Small native salt puffs begin at tire contact and remain beneath the raceway.
 * The convoy clock alone selects phase; this component owns no animation loop.
 */
export function createNomadDust({ track, settings = {} }) {
  const group = new T.Group();
  group.name = 'Nomad / rolling ground salt';
  group.userData.aoExclude = true;
  group.userData.reflectionExclude = true;
  const material = dustMaterial();
  const records = [];
  for (const carrier of track.carriers) {
    const particles = [];
    // Layer zero contains every wheel, so Low retains the whole running-gear
    // footprint rather than accidentally keeping only one side of each truck.
    for (let layer = 0; layer < LAYERS; layer++)
      for (const side of [-1, 1])
        for (let axle = 0; axle < AXLES; axle++) {
          const seed = hash(
            carrier.index * 103 + axle * 7 + layer * 19 + (side > 0 ? 5 : 0),
          );
          const contact = new T.Vector3(side * 103, 0, -312 + axle * 78)
            .multiply(carrier.scale)
            .applyQuaternion(carrier.quaternion);
          particles.push({
            contact,
            seed,
            side,
            layer,
            life: 3.8 + seed * 0.6,
          });
        }
    const geometry = puffGeometry(particles.map((particle) => particle.seed));
    const mesh = new T.InstancedMesh(geometry, material, HIGH_COUNT);
    mesh.name = `${carrier.id} / wheel-contact salt wake`;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.aoExclude = true;
    mesh.userData.reflectionExclude = true;
    mesh.userData.nomadDust = true;
    // Every card stays vertical and within these all-phase limits, including
    // rearward convection, carrier-relative velocity and maximum puff size.
    const bounds = new T.Box3().setFromPoints(
      particles.map((particle) => particle.contact),
    );
    bounds.min.add(new T.Vector3(-36, -4, -122));
    bounds.max.add(new T.Vector3(36, 18, 16));
    mesh.boundingBox = bounds;
    mesh.boundingSphere = bounds.getBoundingSphere(new T.Sphere());
    group.add(mesh);
    records.push({ carrier, mesh, geometry, particles });
  }
  let disposed = false;
  const matrix = new T.Matrix4(),
    position = new T.Vector3();
  function update(frame = {}) {
    if (disposed) return;
    const current = { ...settings, ...frame.settings };
    const low = current.quality === 'low';
    const reducedMotion = current.reducedMotion === true;
    const time = Number.isFinite(track.presentationTime)
      ? track.presentationTime
      : 0;
    const decorationTime = reducedMotion ? 0 : time;
    material.uniforms.dustOpacity.value = low ? 0.21 : 0.23;
    for (const { carrier, mesh, geometry, particles } of records) {
      const motion = sampleCarrierMotion(carrier, time);
      mesh.position.copy(carrier.origin).add(motion.translation);
      mesh.count = low ? LOW_COUNT : HIGH_COUNT;
      for (let index = 0; index < mesh.count; index++) {
        const particle = particles[index];
        const fraction =
          (((decorationTime / particle.life +
            particle.seed +
            particle.layer / LAYERS) %
            1) +
            1) %
          1;
        const age = fraction * particle.life;
        const drift = (particle.seed - 0.5) * 1.8;
        const rearward =
          (NOMAD_MOTION_RULES.convoySpeed * 0.86 + 1 + particle.seed * 1.7) *
          age;
        position.copy(particle.contact);
        position.x +=
          particle.side * (age * 1.8 + age * age * 0.12) + drift * age;
        position.z -= rearward;
        position.y +=
          NOMAD_MOTION_RULES.groundGrade * rearward + 0.4 + age * 1.35;
        if (!reducedMotion) position.addScaledVector(motion.velocity, -age);
        const width = 3.5 + age * 1.8;
        const height = 1.6 + age * 0.65;
        matrix.makeScale(width, height, 1);
        matrix.setPosition(position);
        mesh.setMatrixAt(index, matrix);
        geometry.attributes.dustAge.setX(index, fraction);
      }
      mesh.instanceMatrix.needsUpdate = true;
      geometry.attributes.dustAge.needsUpdate = true;
    }
  }
  update();
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const { mesh, geometry } of records) {
        mesh.dispose();
        geometry.dispose();
      }
      material.dispose();
    },
  };
}
