import * as T from 'three';
import { carrierMotionRules, sampleCarrierMotion } from './motion.js';
import { sampleNomadGroundMotion } from './ground-motion.js';
import { nomadGroundNormalAt } from './ground-profile.js';
import kit from '../../../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const WHEELS = kit.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');

const hash = (value) => {
  const result = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return result - Math.floor(result);
};

function shape(particle, age, scale) {
  const spray = particle.kind === 'spray';
  // Faster ground travel shortens the history, not the mature billow. The
  // contact sheet integrates its complete short interval continuously.
  const fraction = spray ? 1 : age / particle.life;
  const radius = particle.radius * scale;
  return {
    width:
      radius *
      (spray ? 0.2833333333333333 : 0.4583333333333333 + fraction * 1.44),
    height: radius * (spray ? 1 / 3 : 0.20833333333333334 + fraction * 1.84),
    outward:
      radius *
      (spray
        ? 0.46041666666666664
        : fraction * 1.52 + fraction * fraction * 0.6912),
  };
}

/** The first layer retains every wheel at every LOD. Two overlapping wake
 * cohorts surround a short spray layer; all sources are actual Blender tires.
 */
export function createNomadDustField(track, carrier) {
  const normal = nomadGroundNormalAt(track, carrier.origin.x, carrier.origin.z);
  const groundVelocity = sampleNomadGroundMotion(track, 0).velocity;
  const speed = Math.max(1, Math.abs(groundVelocity.z));
  const particles = [];
  for (const layer of ['wake', 'spray', 'wake']) {
    const layerIndex = particles.length / WHEELS.length;
    for (const [wheel, anchor] of WHEELS.entries()) {
      const seed = hash(carrier.index * 103 + wheel * 7 + layerIndex * 19);
      const contact = new T.Vector3()
        .fromArray(anchor.position)
        .multiply(carrier.scale)
        .applyQuaternion(carrier.quaternion);
      const contactNormal = nomadGroundNormalAt(
        track,
        carrier.origin.x + contact.x,
        carrier.origin.z + contact.z,
      );
      contact.addScaledVector(
        contactNormal,
        -anchor.rollingRadius * carrier.scale.x + 0.06,
      );
      particles.push({
        wheel,
        contact,
        seed,
        side: Math.sign(anchor.position[0]),
        radius: anchor.rollingRadius,
        kind: layer,
        phase: (hash(carrier.index * 37 + wheel * 11) + layerIndex * 0.37) % 1,
        life:
          layer === 'spray'
            ? Math.min(0.22, 75 / speed)
            : Math.min(2.8, 750 / speed),
      });
    }
  }
  const bounds = new T.Box3();
  const rules = carrierMotionRules(carrier);
  for (const particle of particles) {
    const maximum = shape(particle, particle.life, carrier.scale.x);
    if (particle.kind === 'spray') {
      // A streaming sheet spans the current contact and the advected tail.
      // History displacement is covered by the common motion margin below.
      const tail = particle.contact
        .clone()
        .addScaledVector(groundVelocity, particle.life)
        .addScaledVector(normal, maximum.height);
      tail.x += particle.side * maximum.outward;
      for (const end of [particle.contact, tail]) {
        bounds.expandByPoint(end.clone().addScalar(-maximum.width - 0.2));
        bounds.expandByPoint(end.clone().addScalar(maximum.width + 0.2));
      }
      continue;
    }
    for (const age of [0, particle.life]) {
      const size = shape(particle, age, carrier.scale.x);
      const point = particle.contact
        .clone()
        .addScaledVector(groundVelocity, age)
        .addScaledVector(normal, size.height * 0.72);
      point.x += particle.side * size.outward;
      // Any camera azimuth may turn the billboard's entire width toward X/Z.
      const radius = Math.hypot(maximum.width, maximum.height) + 0.01;
      bounds.expandByPoint(point.clone().addScalar(-radius));
      bounds.expandByPoint(point.clone().addScalar(radius));
    }
  }
  bounds.expandByVector(
    new T.Vector3(
      2 * Math.abs(rules.lateralAmplitude),
      2 * track.saltPlane.grade * Math.abs(rules.longitudinalAmplitude),
      2 * Math.abs(rules.longitudinalAmplitude),
    ),
  );
  return { particles, normal, bounds };
}

/** A particle is emitted at a historical rigid wheel pose, then transported by
 * the same graded ground motion as the salt landmarks. No integration/history
 * buffer means pause, arbitrary seek and replay restoration are identical.
 * Reduced motion holds the local field, while its real carrier still moves.
 */
export function sampleNomadDustParticle(
  track,
  carrier,
  particle,
  time,
  reducedMotion = false,
  target = {},
) {
  const clock = reducedMotion ? 0 : time;
  const fraction = (((clock / particle.life + particle.phase) % 1) + 1) % 1;
  const age =
    particle.kind === 'spray' ? particle.life : fraction * particle.life;
  const emittedAt = clock - age;
  const size = shape(particle, age, carrier.scale.x);
  const normal = (target.normal ??= new T.Vector3());
  const position = (target.position ??= new T.Vector3());
  const history = sampleCarrierMotion(carrier, emittedAt).translation;
  const current = sampleCarrierMotion(carrier, clock).translation;
  const ground = sampleNomadGroundMotion(track, age).translation;
  const emissionX = carrier.origin.x + particle.contact.x + history.x;
  const shelf = track.saltBenches?.find(
    (bench) => emissionX >= bench.minX && emissionX <= bench.maxX,
  );
  if (shelf) {
    // The massive risers deflect lateral spray. Keep the lobe's core on its
    // emitting shelf instead of moving its centre into the neighbouring wall;
    // the exact profile shader still clips any remaining expanded fringe.
    const room =
      particle.side < 0 ? emissionX - shelf.minX : shelf.maxX - emissionX;
    const fromRoad =
      particle.side * (particle.contact.x + history.x - current.x);
    const corridor = carrier.scale.x * 65 + 0.25;
    // Fit the core and its inward fringe together: a wall-constrained lobe
    // becomes narrower rather than pushing salt into the racing corridor.
    size.width = Math.min(
      size.width,
      Math.max(0.01, (fromRoad + room - corridor) / 1.5),
      Math.max(0.01, fromRoad + size.outward - corridor),
    );
    size.outward = Math.min(size.outward, Math.max(0, room - size.width * 0.5));
  }
  nomadGroundNormalAt(
    track,
    carrier.origin.x + particle.contact.x + history.x,
    carrier.origin.z + particle.contact.z + history.z,
    normal,
  );
  const axis = (target.axis ??= new T.Vector3());
  position.copy(particle.contact).add(history).sub(current).add(ground);
  position.x += particle.side * size.outward;
  if (particle.kind === 'spray') {
    const head = (target.head ??= new T.Vector3());
    const tail = (target.tail ??= new T.Vector3());
    head.copy(particle.contact).addScaledVector(normal, 0.12);
    tail.copy(position).addScaledVector(normal, size.height);
    axis.subVectors(tail, head);
    const height = axis.length() * 0.5;
    axis.normalize();
    position.addVectors(head, tail).multiplyScalar(0.5);
    return Object.assign(target, size, {
      height,
      tailLift: size.height,
      age,
      fraction,
      emittedAt,
    });
  }
  axis.copy(normal);
  position.addScaledVector(normal, size.height * 0.72);
  return Object.assign(target, size, { age, fraction, emittedAt });
}
