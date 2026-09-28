import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TARGET_LENGTH = 7200;
const WIDTH = 28;
const GROUND_Y = -78;
const wrap = (value, length) => ((value % length) + length) % length;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

function rollEnvelope(fraction, start, riseEnd, fallStart, end, degrees) {
  return (
    THREE.MathUtils.degToRad(degrees) *
    smooth((fraction - start) / (riseEnd - start)) *
    (1 - smooth((fraction - fallStart) / (end - fallStart)))
  );
}

function bankAt(fraction) {
  return (
    rollEnvelope(fraction, 0.095, 0.158, 0.214, 0.289, -62) +
    rollEnvelope(fraction, 0.322, 0.336, 0.344, 0.36, 16) +
    rollEnvelope(fraction, 0.36, 0.378, 0.39, 0.409, -24) +
    rollEnvelope(fraction, 0.596, 0.631, 0.671, 0.709, -29) +
    rollEnvelope(fraction, 0.784, 0.812, 0.86, 0.903, -24) +
    rollEnvelope(fraction, 0.924, 0.944, 0.958, 0.989, -18)
  );
}

// Authored route: an outer district circuit, then an elevated crossing and
// tightening inner return. The two centreline crossings are vertically separated.
export function createTrack() {
  const source = [
    [0, 0, 0],
    [0, 3, 270],
    [110, 22, 530],
    [380, 70, 720],
    [720, 116, 710],
    [960, 102, 490],
    [1040, 50, 200],
    [950, -2, -80],
    [790, -9, -255],
    [800, -5, -430],
    [530, 0, -620],
    [190, 18, -760],
    [-180, 15, -730],
    [-490, 24, -510],
    [-600, 54, -170],
    [-460, 86, 120],
    [-130, 102, 230],
    [180, 105, 230],
    [425, 89, 70],
    [450, 62, -180],
    [250, 24, -400],
    [0, -6, -400],
    [-170, -14, -260],
    [-115, -8, -100],
  ];
  let horizontalScale = 1;
  let curve;
  for (let pass = 0; pass < 5; pass += 1) {
    curve = new THREE.CatmullRomCurve3(
      source.map(
        ([x, y, z]) =>
          new THREE.Vector3(x * horizontalScale, y, z * horizontalScale),
      ),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 18000;
    curve.updateArcLengths();
    horizontalScale *= TARGET_LENGTH / curve.getLength();
  }
  const length = curve.getLength();
  const positionAt = (s) => curve.getPointAt(wrap(s, length) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.5)
      .sub(positionAt(s - 0.5))
      .normalize();

  function sample(s) {
    const distance = wrap(s, length);
    const position = positionAt(distance);
    const tangent = tangentAt(distance);
    const right = new THREE.Vector3()
      .crossVectors(WORLD_UP, tangent)
      .normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const bank = bankAt(distance / length);
    const roll = new THREE.Quaternion().setFromAxisAngle(tangent, bank);
    right.applyQuaternion(roll);
    up.applyQuaternion(roll);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
    const curvature = tangentAt(distance + 1)
      .sub(tangentAt(distance - 1))
      .multiplyScalar(0.5)
      .dot(right);
    return { position, tangent, right, up, quaternion, curvature, bank };
  }

  const definitions = [
    [
      'start',
      'Meridian interchange',
      0,
      0.06,
      'Start gantry and crossing viaduct',
      0.017,
    ],
    ['climb', 'Crown approach', 0.06, 0.095, 'Landmark-facing climb', 0.082],
    [
      'bank',
      'Sixty-two degree crown',
      0.095,
      0.289,
      'Suspended outer crown and city panorama',
      0.193,
    ],
    [
      'drop',
      'East cascade',
      0.289,
      0.383,
      'Descent into a reversing S bend',
      0.35,
    ],
    [
      'tunnel',
      'Transit vault',
      0.383,
      0.426,
      'Faceted daylight tunnel with service bays',
      0.399,
    ],
    [
      'south',
      'Foundry waterfront',
      0.426,
      0.56,
      'Long low sweep over the southern district',
      0.478,
    ],
    [
      'gallery',
      'West ventilation gallery',
      0.56,
      0.621,
      'Angled acoustic fins and ribbed roof',
      0.588,
    ],
    [
      'ascent',
      'Helix rise',
      0.621,
      0.715,
      'Banked climb into the high city',
      0.665,
    ],
    [
      'crossing',
      'Meridian skybridge',
      0.715,
      0.779,
      'Open steel bowstring crossing above the grid',
      0.743,
    ],
    [
      'switchbacks',
      'Inner cascade',
      0.779,
      0.924,
      'Linked descending turns with wide alternate lines',
      0.851,
    ],
    [
      'return',
      'Foundations return',
      0.924,
      1,
      'Tightening banked return to Meridian',
      0.95,
    ],
  ];
  const sections = definitions.map(
    ([id, name, start, end, description, showcase]) => ({
      id,
      name,
      start: start * length,
      end: end * length,
      representative: true,
      banked: ['bank', 'drop', 'ascent', 'switchbacks', 'return'].includes(id),
      tunnel: id === 'tunnel',
      description,
      showcase: showcase * length,
    }),
  );
  const checkpoints = Array.from({ length: 8 }, (_, index) => {
    const distance = (index * length) / 8;
    const frame = sample(distance);
    return {
      index,
      distance,
      s: distance,
      position: frame.position,
      quaternion: frame.quaternion,
    };
  });
  const scenarios = {
    staging: { distance: 0, lateral: 0, speed: 0, heading: 0 },
    'fast-corner': {
      distance: length * 0.938,
      lateral: 0,
      speed: 108,
      heading: 0,
    },
    bank: { distance: length * 0.185, lateral: 0, speed: 88, heading: 0 },
    impact: { distance: 85, lateral: 11, speed: 86, heading: 0.12 },
    inspection: { distance: 32, lateral: 0, speed: 0, heading: 0 },
    'bank-rest': { distance: length * 0.185, lateral: 0, speed: 0, heading: 0 },
    'slope-rest': {
      distance: length * 0.117,
      lateral: 0,
      speed: 0,
      heading: 0,
    },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = {
      distance: section.showcase,
      lateral: 0,
      speed: 0,
      heading: 0,
    };
  return {
    id: 'halcyon-viaduct-2',
    name: 'Halcyon Viaduct',
    length,
    width: WIDTH,
    groundY: GROUND_Y,
    sample,
    checkpoints,
    sections,
    scenarios,
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
  };
}

export function framePoint(frame, right, up, forward = 0) {
  return frame.position
    .clone()
    .addScaledVector(frame.right, right)
    .addScaledVector(frame.up, up)
    .addScaledVector(frame.tangent, forward);
}
