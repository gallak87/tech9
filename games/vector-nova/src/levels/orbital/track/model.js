import * as THREE from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 28;
const TARGET_LENGTH = 4500;
const wrap = (value, length) => ((value % length) + length) % length;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const bankEnvelope = (distance, start, crest, release, end, degrees) =>
  THREE.MathUtils.degToRad(degrees) *
  smooth((distance - start) / (crest - start)) *
  (1 - smooth((distance - release) / (end - release)));

// A compact orbital course with two unequal lobes: a low wall-ride arc, a
// rising transfer above the return, and a high apogee feeding the steep dive.
export function createLevel2Track() {
  const source = [
    [0, 0, 0],
    [0, 18, 140],
    [-100, 50, 270],
    [-330, 95, 325],
    [-510, 82, 175],
    [-560, 38, -80],
    [-415, 25, -300],
    [-170, 50, -400],
    [90, 85, -285],
    [215, 140, -30],
    [140, 225, 220],
    [0, 280, 360],
    [-20, 305, 545],
    [180, 310, 705],
    [430, 290, 630],
    [550, 220, 400],
    [550, 20, 300],
    [470, -20, 70],
    [330, -10, -95],
    [210, 12, -220],
    [90, 5, -210],
    [0, 0, -100],
  ];
  let horizontalScale = 1;
  let curve;
  for (let pass = 0; pass < 16; pass += 1) {
    curve = new THREE.CatmullRomCurve3(
      source.map(
        ([x, y, z]) =>
          new THREE.Vector3(x * horizontalScale, y, z * horizontalScale),
      ),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 64000;
    curve.updateArcLengths();
    horizontalScale *= TARGET_LENGTH / curve.getLength();
  }
  const length = curve.getLength();
  const positionAt = (s) => curve.getPointAt(wrap(s, length) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.5)
      .sub(positionAt(s - 0.5))
      .normalize();
  const bankAt = (s) =>
    bankEnvelope(s, 45, 230, 370, 555, 36) +
    bankEnvelope(s, 620, 825, 955, 1180, 98) +
    bankEnvelope(s, 1240, 1430, 1540, 1740, 30) +
    bankEnvelope(s, 1780, 1970, 2140, 2350, 28) +
    bankEnvelope(s, 2360, 2560, 2690, 2860, -38) +
    bankEnvelope(s, 2880, 3010, 3150, 3320, -28) +
    bankEnvelope(s, 3700, 3850, 3970, 4100, -35) +
    bankEnvelope(s, 4110, 4240, 4350, 4490, -32);
  const frameCount = Math.ceil(length);
  const frameStep = length / frameCount;
  const referenceFrames = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, i) => tangentAt(i * frameStep)),
    frameStep,
  );
  const rotations = referenceFrames.map((reference, index) =>
    reference
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          bankAt(index * frameStep),
        ),
      ),
  );
  function sample(s) {
    const distance = wrap(s, length);
    const tangent = tangentAt(distance);
    const frameIndex = distance / frameStep;
    const lowerIndex = Math.floor(frameIndex);
    const rotation = rotations[lowerIndex]
      .clone()
      .slerp(rotations[lowerIndex + 1], frameIndex - lowerIndex);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
    const bank = bankAt(distance);
    return {
      position: positionAt(distance),
      tangent,
      right,
      up,
      quaternion,
      bank,
      roll: bank,
      curvature: tangentAt(distance + 1)
        .sub(tangentAt(distance - 1))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const definitions = [
    [
      'launch',
      'Departure rise',
      0,
      560,
      300,
      'Early rising 36° arc establishes the turn before the wall ride.',
    ],
    [
      'wallride',
      'Limb wall ride',
      560,
      1180,
      885,
      'A broad 98° wall ride wraps the outer lobe with the planet alongside.',
    ],
    [
      'lower-arc',
      'Periapsis arc',
      1180,
      1740,
      1470,
      'Brief release from the wall, then a low banked sweep into the climb.',
    ],
    [
      'transfer',
      'Rising transfer',
      1740,
      2350,
      2120,
      'A sustained climb crosses above the low return with open approach sightlines.',
    ],
    [
      'crown',
      'Apogee reversal',
      2350,
      2860,
      2640,
      'The route reverses its bank over the high crown.',
    ],
    [
      'high-arc',
      'Orbital overlook',
      2860,
      3320,
      3060,
      'A descending banked arc opens the view toward the dive.',
    ],
    [
      'dive',
      'Horizon dive',
      3320,
      3690,
      3480,
      'A steep unbanked dive releases into a broad low catch.',
    ],
    [
      'catch',
      'Low catch',
      3690,
      4110,
      3890,
      'A short recovery followed by a banked bend under the transfer.',
    ],
    [
      'return',
      'Docking turn',
      4110,
      length,
      4290,
      'A tighter final turn returns to the departure line.',
    ],
  ];
  const sections = definitions.map(
    ([id, name, start, end, showcase, description]) => ({
      id,
      name,
      start,
      end,
      showcase,
      description,
      representative: true,
      banked: id !== 'dive',
      tunnel: false,
    }),
  );
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(32),
    bank: parked(885),
    'bank-rest': parked(885),
    'slope-rest': parked(2120),
    'fast-corner': { ...parked(4240), speed: 75 },
    impact: { ...parked(85), lateral: 11, speed: 86, heading: 0.12 },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  const checkpoints = Array.from({ length: 8 }, (_, index) => {
    const distance = (index * length) / 8;
    const { position, quaternion } = sample(distance);
    return { index, distance, s: distance, position, quaternion };
  });
  const bounds = new THREE.Box3();
  for (let distance = 0; distance < length; distance += 5)
    bounds.expandByPoint(sample(distance).position);
  bounds.expandByScalar(WIDTH / 2 + 2);
  return {
    id: 'asterion-orbital-1-blockout',
    name: 'Asterion Orbital',
    length,
    width: WIDTH,
    groundY: -150,
    sample,
    sections,
    scenarios,
    checkpoints,
    bounds,
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    featureZones: sections.map(({ id, start, end, showcase }) => ({
      id,
      start,
      end,
      peak: showcase,
      type:
        {
          launch: 'rise',
          wallride: 'wallride',
          transfer: 'climb',
          crown: 'crest',
          dive: 'plunge',
          catch: 'recovery',
        }[id] ?? 'bank',
    })),
    structuralZones: [],
    supportFootprints: [],
    review: {
      kind: 'bare-track',
      phase: 'human-shape-review',
      summary: '4.5 km · 98° wall ride · raised crossover · steep horizon dive',
      planet: { radius: 3600, center: [0, -3750, 100] },
      featureEntry: 560,
    },
  };
}
