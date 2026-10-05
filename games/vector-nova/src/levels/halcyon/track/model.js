import * as THREE from 'three';
import { createReferenceFrames } from '../../../track/frames.js';
import { createSupportLayout } from './supports.js';

const TARGET_LENGTH = 5000;
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

function signatureRoll(fraction) {
  return (
    Math.PI * smooth((fraction - 0.352) / (0.438 - 0.352)) +
    Math.PI * smooth((fraction - 0.467) / (0.576 - 0.467))
  );
}

function bankAt(fraction) {
  return (
    rollEnvelope(fraction, 0.022, 0.092, 0.129, 0.175, -44) +
    rollEnvelope(fraction, 0.177, 0.205, 0.239, 0.267, -24) +
    rollEnvelope(fraction, 0.272, 0.297, 0.32, 0.345, -18) +
    signatureRoll(fraction) +
    rollEnvelope(fraction, 0.581, 0.609, 0.642, 0.677, -24) +
    rollEnvelope(fraction, 0.843, 0.877, 0.917, 0.967, -22)
  );
}

// Compact authored route with terrain events distributed throughout the lap.
// All distances remain actual arc metres; long inactive perimeter sweeps are gone.
export function createTrack() {
  const source = [
    [0, 0, 0],
    [0, 18, 180],
    [100, 55, 350],
    [300, 95, 410],
    [510, 45, 325],
    [620, 8, 110],
    [550, 70, -120],
    [360, 230, -280],
    [100, 440, -220],
    [-50, 505, 10],
    [20, 525, 250],
    [240, 520, 410],
    [470, 515, 330],
    [665, 500, 120],
    [710, 455, -40],
    [710, 265, -150],
    [685, 60, -280],
    [530, -10, -435],
    [275, 18, -455],
    [75, 28, -325],
    [0, 4, -165],
  ];
  let horizontalScale = 1;
  let curve;
  for (let pass = 0; pass < 12; pass += 1) {
    curve = new THREE.CatmullRomCurve3(
      source.map(
        ([x, y, z]) =>
          new THREE.Vector3(x * horizontalScale, y, z * horizontalScale),
      ),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 96000;
    curve.updateArcLengths();
    horizontalScale *= TARGET_LENGTH / curve.getLength();
  }
  const length = curve.getLength();
  const positionAt = (s) => curve.getPointAt(wrap(s, length) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.5)
      .sub(positionAt(s - 0.5))
      .normalize();

  const frameCount = Math.ceil(length);
  const frameStep = length / frameCount;
  const tangents = Array.from({ length: frameCount + 1 }, (_, i) =>
    tangentAt(i * frameStep),
  );
  const referenceFrames = createReferenceFrames(tangents, frameStep);
  const rotations = referenceFrames.map((reference, index) => {
    const roll = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      bankAt(index / frameCount),
    );
    return reference.clone().multiply(roll);
  });

  function sample(s) {
    const distance = wrap(s, length);
    const position = positionAt(distance);
    const tangent = tangentAt(distance);
    const frameIndex = distance / frameStep;
    const lowerIndex = Math.floor(frameIndex);
    const interpolation = frameIndex - lowerIndex;
    const rotation = rotations[lowerIndex]
      .clone()
      .slerp(rotations[lowerIndex + 1], interpolation);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
    const roll = bankAt(distance / length);
    const bank = Math.atan2(Math.sin(roll), Math.cos(roll));
    const curvature = tangentAt(distance + 1)
      .sub(tangentAt(distance - 1))
      .multiplyScalar(0.5)
      .dot(right);
    return { position, tangent, right, up, quaternion, curvature, bank, roll };
  }

  const definitions = [
    [
      'start',
      'Meridian launch',
      0,
      0.036,
      'A visible rising approach from the grid',
      0.02,
    ],
    [
      'climb',
      'Crown approach',
      0.036,
      0.084,
      'Approachable climb and progressive bank',
      0.066,
    ],
    [
      'bank',
      'Forty-four degree crown',
      0.084,
      0.156,
      'Broad banked crown and medium descent',
      0.111,
    ],
    [
      'drop',
      'East cascade',
      0.156,
      0.223,
      'Early descent before the skyline ascent',
      0.198,
    ],
    [
      'tunnel',
      'Transit vault',
      0.223,
      0.278,
      'Short ascending daylight tunnel',
      0.249,
    ],
    [
      'gallery',
      'West ventilation gallery',
      0.278,
      0.318,
      'Open ribs approaching the higher city',
      0.298,
    ],
    [
      'ascent',
      'Skyline ascent',
      0.318,
      0.352,
      'Steep climb clear of the surrounding towers',
      0.338,
    ],
    [
      'crossing',
      'Meridian corkscrew',
      0.352,
      0.576,
      'Full rotation and sustained inverted crossing in the middle of the lap',
      0.452,
    ],
    [
      'south',
      'Foundry sky sweep',
      0.576,
      0.68,
      'Banked skyline connector leading directly to the plunge',
      0.632,
    ],
    [
      'switchbacks',
      'Cascade plunge',
      0.68,
      0.845,
      'A 66 degree plunge between the towers',
      0.723,
    ],
    [
      'return',
      'Canal rises',
      0.845,
      1,
      'Banked canal recovery with a gentle rise and final dip',
      0.913,
    ],
  ];
  const sections = definitions.map(
    ([id, name, start, end, description, showcase]) => ({
      id,
      name,
      start: start * length,
      end: end * length,
      representative: true,
      banked: ['climb', 'bank', 'drop', 'crossing', 'south', 'return'].includes(
        id,
      ),
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
    bank: { distance: length * 0.111, lateral: 0, speed: 88, heading: 0 },
    impact: { distance: 85, lateral: 11, speed: 86, heading: 0.12 },
    inspection: { distance: 32, lateral: 0, speed: 0, heading: 0 },
    'bank-rest': { distance: length * 0.111, lateral: 0, speed: 0, heading: 0 },
    'signature-entry': {
      distance: length * 0.341,
      lateral: 0,
      speed: 0,
      heading: 0,
    },
    'inverted-rest': {
      distance: length * 0.452,
      lateral: 0,
      speed: 0,
      heading: 0,
    },
    'signature-inverted': {
      distance: length * 0.452,
      lateral: 0,
      speed: 90,
      heading: 0,
    },
    'signature-drop': {
      distance: length * 0.723,
      lateral: 0,
      speed: 90,
      heading: 0,
    },
    'signature-exit': {
      distance: length * 0.843,
      lateral: 0,
      speed: 90,
      heading: 0,
    },
    'slope-rest': {
      distance: length * 0.067,
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
  const track = {
    id: 'halcyon-viaduct-4-compact',
    name: 'Halcyon Speedway',
    length,
    width: WIDTH,
    groundY: GROUND_Y,
    sample,
    checkpoints,
    sections,
    scenarios,
    signature: {
      start: length * 0.318,
      rollStart: length * 0.352,
      invertedStart: length * 0.438,
      invertedEnd: length * 0.467,
      rollEnd: length * 0.576,
      plungeStart: length * 0.68,
      plungeEnd: length * 0.836,
      end: length * 0.97,
    },
    featureZones: [
      {
        id: 'launch-rise',
        type: 'rise',
        start: 0,
        end: length * 0.132,
        peak: length * 0.118,
      },
      {
        id: 'intro-bank',
        type: 'bank',
        start: length * 0.022,
        end: length * 0.175,
        peak: length * 0.111,
      },
      {
        id: 'early-descent',
        type: 'descent',
        start: length * 0.132,
        end: length * 0.223,
        peak: length * 0.18,
      },
      {
        id: 'skyline-ascent',
        type: 'climb',
        start: length * 0.223,
        end: length * 0.438,
        peak: length * 0.352,
      },
      {
        id: 'corkscrew',
        type: 'roll',
        start: length * 0.352,
        end: length * 0.576,
        peak: length * 0.452,
      },
      {
        id: 'sky-bank',
        type: 'bank',
        start: length * 0.581,
        end: length * 0.677,
        peak: length * 0.632,
      },
      {
        id: 'major-plunge',
        type: 'plunge',
        start: length * 0.68,
        end: length * 0.836,
        peak: length * 0.723,
      },
      {
        id: 'canal-rise-dip',
        type: 'recovery',
        start: length * 0.836,
        end: length,
        peak: length * 0.932,
      },
    ],
    structuralZones: [
      { id: 'corkscrew-supports', start: length * 0.323, end: length * 0.595 },
      { id: 'plunge-supports', start: length * 0.674, end: length * 0.845 },
    ],
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
  };
  track.supportLayout = createSupportLayout(track);
  track.supportFootprints = track.supportLayout.segments
    .filter(({ kind }) => kind === 'pier' || kind === 'portal-leg')
    .map(({ kind, from, to }) => ({
      x: from.x,
      z: from.z,
      halfX: kind === 'pier' ? 4.1 : 4.9,
      halfZ: kind === 'pier' ? 4.7 : 5.7,
      minY: track.groundY,
      maxY: to.y + 3,
    }));
  scenarios['intro-rise'] = {
    distance: length * 0.058,
    lateral: 0,
    speed: 0,
    heading: 0,
  };
  scenarios['early-descent'] = {
    distance: length * 0.18,
    lateral: 0,
    speed: 90,
    heading: 0,
  };
  scenarios['sky-bank'] = {
    distance: length * 0.632,
    lateral: 0,
    speed: 90,
    heading: 0,
  };
  return track;
}
