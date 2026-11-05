import * as T from 'three';
import { carrierMotionRules, sampleCarrierMotion } from './motion.js';
import { nomadGroundNormalAt } from './ground-profile.js';
import kit from '../../../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const WHEELS = kit.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');
const WIDTH =
  kit.prototypes.find((part) => part.name === 'nomad_wheel').dimensions[0] *
  0.5;
const LENGTH_RADIUS = 0.75;
const LIFT = 0.06;

/** Small ambient contact beneath the real rolling tires. The graded salt and
 * native directional shadows remain authoritative; these ellipses only keep
 * the tire/ground junction seated outside the local shadow-map coverage.
 */
export function createNomadWheelContacts({ track, carriers = track.carriers }) {
  const group = new T.Group();
  group.name = 'Nomad / seated wheel contacts';
  group.userData.aoExclude = true;
  group.userData.reflectionExclude = true;
  const face = new T.Vector3(0, 0, 1);
  const geometry = new T.PlaneGeometry(1, 1);
  const material = new T.ShaderMaterial({
    name: 'Nomad / soft tire ambient contact',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    fog: true,
    uniforms: {
      ...T.UniformsUtils.clone(T.UniformsLib.fog),
      contactOpacity: { value: 0.26 },
    },
    vertexShader: `
      varying vec2 contactUV;
      #include <fog_pars_vertex>
      void main(){
        contactUV=uv*2.-1.;
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec2 contactUV;
      uniform float contactOpacity;
      #include <fog_pars_fragment>
      void main(){
        float radius=dot(contactUV,contactUV);
        float edge=1.-smoothstep(.55,1.,radius);
        float alpha=contactOpacity*exp(-radius*2.6)*edge;
        if(alpha<.001)discard;
        gl_FragColor=vec4(.009,.016,.024,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new T.InstancedMesh(
    geometry,
    material,
    carriers.length * WHEELS.length,
  );
  mesh.name = 'Nomad / all actual tire contact ellipses';
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
  mesh.userData.aoExclude = true;
  mesh.userData.reflectionExclude = true;
  group.add(mesh);

  const records = [];
  const bounds = new T.Box3();
  const corner = new T.Vector3(),
    contactMatrix = new T.Matrix4();
  for (const carrier of carriers) {
    const contacts = WHEELS.map((anchor) => {
      const position = new T.Vector3()
        .fromArray(anchor.position)
        .multiply(carrier.scale)
        .applyQuaternion(carrier.quaternion)
        .add(carrier.origin);
      const normal = nomadGroundNormalAt(track, position.x, position.z);
      position.addScaledVector(
        normal,
        -anchor.rollingRadius * carrier.scale.x + LIFT,
      );
      return {
        position,
        orientation: new T.Quaternion().setFromUnitVectors(face, normal),
        scale: new T.Vector3(
          WIDTH * carrier.scale.x,
          LENGTH_RADIUS * anchor.rollingRadius * carrier.scale.x,
          1,
        ),
      };
    });
    records.push({ carrier, contacts });
    const carrierBounds = new T.Box3();
    for (const contact of contacts) {
      contactMatrix.compose(
        contact.position,
        contact.orientation,
        contact.scale,
      );
      for (const x of [-0.5, 0.5])
        for (const y of [-0.5, 0.5])
          carrierBounds.expandByPoint(
            corner.set(x, y, 0).applyMatrix4(contactMatrix),
          );
    }
    const motion = carrierMotionRules(carrier);
    carrierBounds.expandByVector(
      new T.Vector3(
        2 * Math.abs(motion.lateralAmplitude),
        2 * track.saltPlane.grade * Math.abs(motion.longitudinalAmplitude),
        2 * Math.abs(motion.longitudinalAmplitude),
      ),
    );
    bounds.union(carrierBounds);
  }
  // Float32 instance translation can round by a fraction of a millimetre at
  // the far end of the 12 km basin. Include that in the all-phase culling bound.
  bounds.expandByScalar(0.002);
  mesh.boundingBox = bounds;
  mesh.boundingSphere = bounds.getBoundingSphere(new T.Sphere());
  let disposed = false;
  let previousTime = null;
  const matrix = new T.Matrix4();
  const position = new T.Vector3();
  function update() {
    if (disposed) return;
    const time = Number.isFinite(track.presentationTime)
      ? track.presentationTime
      : 0;
    if (time === previousTime) return;
    previousTime = time;
    let index = 0;
    for (const { carrier, contacts } of records) {
      const displacement = sampleCarrierMotion(carrier, time).translation;
      for (const contact of contacts) {
        position.copy(contact.position).add(displacement);
        matrix.compose(position, contact.orientation, contact.scale);
        mesh.setMatrixAt(index++, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update();
  return {
    group,
    mesh,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
