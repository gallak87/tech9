import * as THREE from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 35;
const TARGET_LENGTH = 5400;
const wrap = (value, length) => ((value % length) + length) % length;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t ** 3 * (10 + t * (-15 + t * 6));
};
const ramp = (distance, a, b) => smooth((distance - a) / (b - a));
const SOURCE = [
  [0, 40, 0],
  [-10, 45, 180],
  [-140, 64, 290],
  [-295, 105, 210],
  [-260, 150, -20],
  [-30, 185, -110],
  [170, 210, 70],
  [350, 215, 230],
  [540, 180, 110],
  [610, 180, -100],
  [440, 190, -300],
  [160, 235, -360],
  [-100, 310, -250],
  [-340, 355, -390],
  [-550, 335, -230],
  [-520, 315, 70],
  [-300, 295, 340],
  [-100, 310, 340],
  [80, 310, 230],
  [150, 275, 20],
  [130, 275, -210],
  [-50, 105, -230],
  [-170, 100, -50],
  [0, 100, 75],
  [170, 80, -10],
  [310, 35, -240],
  [100, 35, -420],
  [-100, 38, -340],
  [-90, 40, -150],
];

function buildGuide(scale) {
  const curve = new THREE.CatmullRomCurve3(
    SOURCE.map(([x, , z]) => new THREE.Vector3(x * scale, 0, z * scale)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 48000;
  const arc = curve.getLengths();
  const horizontalLength = arc.at(-1);
  const node = (index) => {
    const f = (index / SOURCE.length) * curve.arcLengthDivisions;
    const i = Math.floor(f);
    return THREE.MathUtils.lerp(
      arc[i],
      arc[Math.min(i + 1, arc.length - 1)],
      f - i,
    );
  };
  const leaps = [
    {
      id: 'lensward-leap',
      label: 'Lensward curved crossing',
      h: node(7) + 85,
      gap: 115,
      catch: 205,
      y: 215,
      drop: 35,
      pitch: 4,
      targetSpeed: 102,
      turn: 1,
    },
    {
      id: 'knot-leap',
      label: 'Tidal knot curved crossing',
      h: node(18) + 12,
      gap: 130,
      catch: 215,
      y: 310,
      drop: 35,
      pitch: 4,
      targetSpeed: 108,
      turn: 1,
    },
  ];
  const keys = SOURCE.map(([, y], index) => [node(index), y, 0]);
  keys.push([horizontalLength, SOURCE[0][1], 0]);
  for (const jump of leaps) {
    const from = jump.h - 110;
    const to = jump.h + jump.gap + jump.catch + 80;
    for (let i = keys.length - 1; i >= 0; i -= 1)
      if (keys[i][0] > from && keys[i][0] < to) keys.splice(i, 1);
    keys.push(
      [from, jump.y - 7, 0],
      [jump.h, jump.y, Math.tan(THREE.MathUtils.degToRad(jump.pitch))],
      [jump.h + jump.gap, jump.y - jump.drop, 0],
      [jump.h + jump.gap + jump.catch, jump.y - jump.drop, 0],
    );
  }
  keys.sort((a, b) => a[0] - b[0]);
  const rawPoint = (distance) => {
    const h = wrap(distance, horizontalLength);
    const p = curve.getPointAt(h / horizontalLength);
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] < h) i += 1;
    const [a, ya, ma] = keys[i];
    const [b, yb, mb] = keys[i + 1];
    const t = (h - a) / (b - a);
    p.y =
      (1 - 10 * t ** 3 + 15 * t ** 4 - 6 * t ** 5) * ya +
      (t - 6 * t ** 3 + 8 * t ** 4 - 3 * t ** 5) * (b - a) * ma +
      (10 * t ** 3 - 15 * t ** 4 + 6 * t ** 5) * yb +
      (-4 * t ** 3 + 7 * t ** 4 - 3 * t ** 5) * (b - a) * mb;
    return p;
  };
  const count = Math.ceil(horizontalLength * 2);
  const step = horizontalLength / count;
  const lengths = [0];
  let previous = rawPoint(0);
  for (let i = 1; i <= count; i += 1) {
    const next = rawPoint(i * step);
    lengths.push(lengths.at(-1) + next.distanceTo(previous));
    previous = next;
  }
  return {
    curve,
    horizontalLength,
    node,
    leaps,
    rawPoint,
    count,
    step,
    lengths,
    length: lengths.at(-1),
  };
}

// One physical route supplies the road, ordered race distance, magnetic frames,
// inspection and flight reference. Gap intervals deliberately have no deck mesh.
export function createUmbraTrack() {
  let scale = 1;
  let guide;
  for (let pass = 0; pass < 8; pass += 1) {
    guide = buildGuide(scale);
    scale *= TARGET_LENGTH / guide.length;
  }
  const {
    curve,
    horizontalLength,
    node,
    leaps,
    rawPoint,
    count,
    step,
    lengths,
    length,
  } = guide;
  const routeDistance = (h) => {
    const f = THREE.MathUtils.clamp(h / step, 0, count);
    const i = Math.min(count - 1, Math.floor(f));
    return THREE.MathUtils.lerp(lengths[i], lengths[i + 1], f - i);
  };
  const horizontalDistance = (s) => {
    const distance = wrap(s, length);
    let lo = 0;
    let hi = count;
    while (lo + 1 < hi) {
      const middle = (lo + hi) >> 1;
      if (lengths[middle] <= distance) lo = middle;
      else hi = middle;
    }
    return (
      (lo + (distance - lengths[lo]) / (lengths[lo + 1] - lengths[lo])) * step
    );
  };
  const positionAt = (s) => rawPoint(horizontalDistance(s));
  const tangentAt = (s) =>
    positionAt(s + 0.2)
      .sub(positionAt(s - 0.2))
      .normalize();
  const horizontalTangent = (h) =>
    curve
      .getPointAt(wrap(h + 12, horizontalLength) / horizontalLength)
      .sub(curve.getPointAt(wrap(h - 12, horizontalLength) / horizontalLength))
      .normalize();
  const rollAt = (h) => {
    const a = horizontalTangent(h - 12);
    const b = horizontalTangent(h + 12);
    const curvature = Math.atan2(a.z * b.x - a.x * b.z, a.dot(b)) / 24;
    let corner = THREE.MathUtils.clamp(-curvature * 85, -0.57, 0.57);
    corner *=
      ramp(h, 15, 100) *
      (1 - ramp(h, horizontalLength - 110, horizontalLength - 15));
    for (const jump of leaps) {
      corner *=
        1 -
        ramp(h, jump.h - 190, jump.h - 100) *
          (1 -
            ramp(
              h,
              jump.h + jump.gap + 140,
              jump.h + jump.gap + jump.catch + 70,
            ));
    }
    const inverted =
      Math.PI * ramp(h, node(11) + 70, node(13) - 30) +
      Math.PI * ramp(h, node(15) - 30, node(16) + 90);
    const rollWeight =
      ramp(h, node(11), node(12)) * (1 - ramp(h, node(16), node(17)));
    return corner * (1 - rollWeight) + inverted;
  };
  const frameCount = Math.ceil(length);
  const frameStep = length / frameCount;
  const reference = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, index) =>
      tangentAt(index * frameStep),
    ),
    frameStep,
  );
  const rotations = reference.map((q, index) =>
    q
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          rollAt(horizontalDistance(index * frameStep)),
        ),
      ),
  );
  function sample(s) {
    const distance = wrap(s, length);
    const tangent = tangentAt(distance);
    const f = distance / frameStep;
    const i = Math.floor(f);
    const rotation = rotations[i].clone().slerp(rotations[i + 1], f - i);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const roll = rollAt(horizontalDistance(distance));
    return {
      position: positionAt(distance),
      tangent,
      right,
      up,
      quaternion: new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, tangent),
      ),
      roll,
      bank: Math.atan2(Math.sin(roll), Math.cos(roll)),
      curvature: tangentAt(distance + 1)
        .sub(tangentAt(distance - 1))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const jumps = leaps.map((jump) => ({
    id: jump.id,
    label: jump.label,
    takeoff: routeDistance(jump.h),
    landingStart: routeDistance(jump.h + jump.gap),
    landingEnd: routeDistance(jump.h + jump.gap + jump.catch),
    recovery: routeDistance(jump.h + jump.gap + jump.catch + 22),
    halfWidth: WIDTH / 2,
    targetSpeed: jump.targetSpeed,
    recoveryDelay: 1.3,
    pitch: jump.pitch,
    drop: jump.drop,
    curved: true,
    airAcceleration:
      jump.id === 'lensward-leap' ? [-29.662, 0, -11.209] : [-35.9, 0, -3.188],
    turn: jump.turn,
  }));
  const definitions = [
    [
      'broken-meridian',
      'Broken Meridian',
      0,
      node(2),
      'Offset rising S and pale repaired observatory decks.',
    ],
    [
      'parallax-stacks',
      'Parallax Stacks',
      node(3),
      node(5),
      'The first high crossing reveals its paired tension spines above the grid.',
    ],
    [
      'lensward-arc',
      'Lensward Arc',
      node(6),
      leaps[0].h - 95,
      'A curved broken span crosses the tilted lens toward a visible lower landing.',
    ],
    [
      'inversion-vault',
      'Inversion Vault',
      node(11),
      node(14),
      'Continuous half-roll, long inverted vault hold, then a full return to upright.',
    ],
    [
      'tidal-knots',
      'Tidal Knots',
      node(17),
      leaps[1].h - 95,
      'Amber gravity warnings precede the second curved crossing and lower catch.',
    ],
    [
      'event-fold',
      'Event Fold',
      leaps[1].h + leaps[1].gap + leaps[1].catch,
      leaps[1].h + leaps[1].gap + leaps[1].catch + 45,
      'A grounded descending ribbon folds over the original start grid.',
    ],
    [
      'quiet-meridian',
      'Quiet Meridian',
      node(25),
      node(27),
      'Low return shelves and abandoned instrument ribs release the final turn.',
    ],
  ];
  const sections = definitions.map(
    ([id, name, start, showcase, description], index) => ({
      id,
      name,
      start: routeDistance(start),
      end:
        index + 1 < definitions.length
          ? routeDistance(definitions[index + 1][2])
          : length,
      showcase: routeDistance(showcase),
      description,
      representative: true,
      banked: true,
      tunnel: id === 'inversion-vault',
    }),
  );
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(28),
    bank: parked(routeDistance(node(3) + 60)),
    'bank-rest': parked(routeDistance(node(3) + 60)),
    'slope-rest': parked(jumps[1].landingEnd + 55),
    impact: { ...parked(80), lateral: 11, speed: 85, heading: 0.12 },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  scenarios['inverted-hold'] = parked(routeDistance(node(14)));
  scenarios['fold-descent'] = parked(jumps[1].landingEnd + 15);
  let hardest = 0;
  let maximumCurvature = 0;
  for (let distance = 0; distance < length; distance += 2) {
    const curvature = Math.abs(sample(distance).curvature);
    if (curvature > maximumCurvature) {
      hardest = distance;
      maximumCurvature = curvature;
    }
  }
  scenarios['hardest-turn'] = parked(wrap(hardest - 80, length));
  scenarios['fast-corner'] = { ...scenarios['hardest-turn'], speed: 78 };
  for (const [index, jump] of jumps.entries()) {
    scenarios[`jump${index + 1}-approach`] = parked(jump.takeoff - 150);
    for (const [name, speed, heading, lateral] of [
      ['success', jump.targetSpeed, 0, 0],
      ['cruise', 78, 0, 0],
      ['imperfect', jump.targetSpeed, 0.04, 2.2],
      ['short', 48, 0, 0],
      ['lateral', 108, 0.24, 7],
    ])
      scenarios[`jump${index + 1}-${name}`] = {
        ...parked(jump.takeoff - 0.8),
        speed,
        heading,
        lateral,
      };
  }
  const tidalZones = [
    {
      id: 'lens-tide',
      label: 'Lensward tide',
      start: jumps[0].takeoff - 345,
      end: jumps[0].takeoff - 95,
      strength: 4.5,
    },
    {
      id: 'knot-tide',
      label: 'Tidal knot',
      start: jumps[1].takeoff - 305,
      end: jumps[1].takeoff - 90,
      strength: 8,
    },
    {
      id: 'return-tide',
      label: 'Return tide',
      start: routeDistance(node(26)),
      end: routeDistance(node(27)) + 40,
      strength: 3,
    },
  ];
  const checkpointDistances = [
    0,
    routeDistance(node(3)),
    jumps[0].landingStart,
    routeDistance(node(11)),
    routeDistance(node(16)),
    jumps[1].landingStart,
    routeDistance(node(23)),
    routeDistance(node(26)),
  ].sort((a, b) => a - b);
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new THREE.Box3();
  for (let distance = 0; distance < length; distance += 4)
    bounds.expandByPoint(sample(distance).position);
  bounds.expandByScalar(WIDTH / 2 + 3);
  const isGap = (s) =>
    jumps.some(
      (jump) =>
        wrap(s, length) > jump.takeoff && wrap(s, length) < jump.landingStart,
    );
  const solidRuns = [];
  let start = 0;
  for (const jump of jumps) {
    solidRuns.push([start, jump.takeoff]);
    start = jump.landingStart;
  }
  solidRuns.push([start, length]);
  return {
    id: 'umbra-fold-v1',
    name: 'Umbra Fold',
    geometryVersion: 'umbra-fold-route-v1-width35',
    length,
    width: WIDTH,
    groundY: -400,
    sample,
    sections,
    scenarios,
    checkpoints,
    jumps,
    tidalZones,
    bounds,
    isGap,
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    solidRuns,
    supportFootprints: [],
    structuralZones: [],
    accretionCenter: new THREE.Vector3(-1300, 420, -1200),
    inversion: {
      start: routeDistance(node(11) + 70),
      holdStart: routeDistance(node(13) - 30),
      holdEnd: routeDistance(node(15) - 30),
      end: routeDistance(node(16) + 90),
    },
    fold: {
      start: jumps[1].landingEnd,
      end: routeDistance(node(25)),
      overGrid: routeDistance(node(23)),
    },
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'bare-track',
      phase: 'production-review',
      summary:
        '5.4 km · 35 m · two curved leaps · extended inversion · descending grounded fold',
    },
  };
}
