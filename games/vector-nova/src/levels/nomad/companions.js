import { Vector3 } from 'three';

// Two parallel machines expose the procession's complete ground-going mass
// from cargo apertures and the overtaking approach. They borrow the retained
// Blender kit; these placements never become race surfaces or route owners.
const COMPANIONS = [
  {
    id: 'port-tender',
    name: 'Port Tender / Salt Logistics',
    reference: 'nomad-tailforge',
    lateral: -420,
    ahead: 570,
    size: 1.1,
    motion: {
      period: 42,
      lateralAmplitude: 3,
      longitudinalAmplitude: 14,
      phase: 1.2,
    },
  },
  {
    id: 'starboard-heavy',
    name: 'Starboard Heavy / Overtaking Procession',
    reference: 'nomad-passing-deck',
    lateral: 440,
    ahead: -190,
    size: 1.14,
    motion: {
      period: 40,
      lateralAmplitude: 4,
      longitudinalAmplitude: 18,
      phase: -0.4,
    },
  },
];

/** Grounded visual convoy members, compatible with the shared fleet batcher.
 * Keep these outside track.carriers: only the eleven authored route owners
 * participate in moving support, collision groups, checkpoints and AI.
 */
export function createNomadCompanions(track) {
  return COMPANIONS.map((placement, index) => {
    const reference = track.carriers.find(
      (carrier) => carrier.id === placement.reference,
    );
    if (!reference) throw new Error('Nomad companion reference is missing.');
    const origin = new Vector3(
      reference.origin.x + placement.lateral,
      0,
      reference.origin.z + placement.ahead,
    );
    origin.y = track.saltPlane.height - track.saltPlane.grade * origin.z;
    return {
      id: `nomad-companion-${placement.id}`,
      name: placement.name,
      index: track.carriers.length + index,
      mode: 'companion',
      visualOnly: true,
      referenceCarrierId: reference.id,
      sourcePrototype: 'nomad_carrier',
      origin,
      groundY: origin.y,
      quaternion: reference.quaternion.clone(),
      scale: reference.scale.clone().multiplyScalar(placement.size),
      motion: { ...placement.motion },
    };
  });
}
