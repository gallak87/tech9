import * as THREE from 'three';
import { CALVING_RULES } from '../environment/event.js';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 30;
const HORIZONTAL_LENGTH = 4700;
const wrap = (value, length) => ((value % length) + length) % length;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const interpolateHeight = (keys, distance) => {
  let index = 0;
  while (index < keys.length - 2 && keys[index + 1][0] < distance) index += 1;
  const [start, a, gradientA] = keys[index];
  const [end, b, gradientB] = keys[index + 1];
  const t = (distance - start) / (end - start);
  return (
    (2 * t ** 3 - 3 * t ** 2 + 1) * a +
    (t ** 3 - 2 * t ** 2 + t) * (end - start) * gradientA +
    (-2 * t ** 3 + 3 * t ** 2) * b +
    (t ** 3 - t ** 2) * (end - start) * gradientB
  );
};

export function createGlasswakeTrack() {
  // Broad outer arcs alternate with two inland reversals. The crossing is an
  // authored 600 m arc, with real lower catch decks inside its two open gaps.
  const knots = [
    [-600, -300],
    [-660, -60],
    [-560, 160],
    [-380, 240],
    [-210, 180],
    [-45, 275],
    [-30, 460],
    [90, 610],
    [240, 660],
    [520, 660],
    [800, 630],
    [1030, 440],
    [1010, 150],
    [820, -80],
    [870, -340],
    [650, -550],
    [340, -550],
    [70, -350],
    [-200, -440],
    [-460, -470],
  ];
  let curve = new THREE.CatmullRomCurve3(
    knots.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 40000;
  curve.updateArcLengths();
  const scale = HORIZONTAL_LENGTH / curve.getLength();
  curve = new THREE.CatmullRomCurve3(
    knots.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 40000;
  curve.updateArcLengths();
  const horizontalLength = curve.getLength();
  const basePoint = (distance) =>
    curve.getPointAt(wrap(distance, horizontalLength) / horizontalLength);
  const bridgeStart = curve.getLengths(40000)[16000] - 25;
  const bridgeEnd = bridgeStart + 600;
  const first = bridgeStart + 65;
  const second = bridgeStart + 355;
  const bridgeAnchor = basePoint(bridgeStart);
  const bridgeTangent = new THREE.Vector3(1, 0, 0);
  const bridgeRight = new THREE.Vector3(0, 1, 0).cross(bridgeTangent);
  const horizontalPoint = (distance) => {
    const d = wrap(distance, horizontalLength);
    const result = basePoint(d);
    if (d < bridgeStart - 150 || d > bridgeEnd + 300) return result;
    const offset = d - bridgeStart;
    const angle = offset / 8000;
    const crossing = bridgeAnchor
      .clone()
      .addScaledVector(bridgeTangent, 8000 * Math.sin(angle))
      .addScaledVector(bridgeRight, 8000 * (1 - Math.cos(angle)));
    const weight =
      smooth((d - bridgeStart + 150) / 150) *
      (1 - smooth((d - bridgeEnd) / 300));
    return result.lerp(crossing, weight);
  };
  const launchGradient = Math.tan(THREE.MathUtils.degToRad(5));
  const heights = [
    [0, 100, 0],
    [320, 135, 0],
    [700, 72, -0.15],
    [970, 58, 0],
    [1250, 148, 0.35],
    [first - 95, 231, 0],
    [first - 40, 236.5, launchGradient],
    [first, 240, launchGradient],
    [first + 60, 235, 0],
    [first + 235, 235, 0],
    [second - 40, 235, 0],
    [second, 238, launchGradient],
    [second + 70, 231, 0],
    [second + 235, 231, 0],
    [2580, 240, 0],
    [2920, 232, 0],
    [3170, 236, -0.1],
    [3390, 131, -0.7],
    [3620, -4, -0.2],
    [3820, -12, 0],
    [4020, 26, 0.42],
    [4260, 119, 0.2],
    [4440, 110, -0.06],
    [horizontalLength, 100, 0],
  ];
  const rawPoint = (distance) => {
    const d = wrap(distance, horizontalLength);
    const result = horizontalPoint(d);
    result.y = interpolateHeight(heights, d);
    return result;
  };
  const count = Math.ceil(horizontalLength * 4);
  const horizontalStep = horizontalLength / count;
  const lengths = [0];
  let previous = rawPoint(0);
  for (let i = 1; i <= count; i += 1) {
    const point = rawPoint(i * horizontalStep);
    lengths.push(lengths.at(-1) + point.distanceTo(previous));
    previous = point;
  }
  const length = lengths.at(-1);
  const routeDistance = (distance) => {
    const f = distance / horizontalStep;
    const i = Math.min(count - 1, Math.floor(f));
    return THREE.MathUtils.lerp(lengths[i], lengths[i + 1], f - i);
  };
  const horizontalDistance = (distance) => {
    const d = wrap(distance, length);
    let low = 0;
    let high = count;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (lengths[mid] <= d) low = mid;
      else high = mid;
    }
    return (
      (low + (d - lengths[low]) / (lengths[low + 1] - lengths[low])) *
      horizontalStep
    );
  };
  const positionAt = (distance) => rawPoint(horizontalDistance(distance));
  const tangentAt = (distance) =>
    positionAt(distance + 0.2)
      .sub(positionAt(distance - 0.2))
      .normalize();
  const frameCount = Math.ceil(length / 2);
  const frameStep = length / frameCount;
  const tangents = Array.from({ length: frameCount + 1 }, (_, i) =>
    tangentAt(i * frameStep),
  );
  const referenceFrames = createReferenceFrames(tangents, frameStep);
  const bankAt = (distance) => {
    const tangent = tangentAt(distance);
    const right = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
    const curvature =
      tangentAt(distance + 35)
        .sub(tangentAt(distance - 35))
        .dot(right) / 70;
    const h = horizontalDistance(distance);
    const bridgeSuppression =
      1 -
      smooth((h - bridgeStart + 100) / 80) *
        (1 - smooth((h - bridgeEnd - 35) / 90));
    const gridSuppression = smooth(Math.min(h, horizontalLength - h) / 90);
    // One complete barrel corkscrew accompanies the plunge. The quintic roll
    // has zero derivative at both joins; the frame, fins and clear deck rotate
    // together, while geology and snowfall remain in the world's gravity frame.
    const corkscrew =
      h >= 3260 && h <= 3790 ? Math.PI * 2 * smooth((h - 3260) / 530) : 0;
    return (
      -THREE.MathUtils.clamp(Math.atan(curvature * 74), -0.55, 0.55) *
        bridgeSuppression *
        gridSuppression +
      corkscrew
    );
  };
  function sample(distance) {
    const d = wrap(distance, length);
    const index = d / frameStep;
    const low = Math.floor(index);
    const tangent = tangentAt(d);
    const bank = bankAt(d);
    const orientation = referenceFrames[low]
      .clone()
      .slerp(referenceFrames[low + 1], index - low);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(orientation);
    right
      .addScaledVector(tangent, -right.dot(tangent))
      .normalize()
      .applyAxisAngle(tangent, bank);
    const up = tangent.clone().cross(right).normalize();
    return {
      position: positionAt(d),
      tangent,
      right,
      up,
      quaternion: new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, tangent),
      ),
      bank,
      roll: bank,
      curvature: tangentAt(d + 1)
        .sub(tangentAt(d - 1))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const jumps = [
    { id: 'prism-fracture', takeoff: first, gap: 60, landingLength: 160 },
    { id: 'canyon-fracture', takeoff: second, gap: 70, landingLength: 165 },
  ].map(({ takeoff, gap, landingLength, ...jump }) => ({
    ...jump,
    takeoff: routeDistance(takeoff),
    landingStart: routeDistance(takeoff + gap),
    landingEnd: routeDistance(takeoff + gap + landingLength),
    recovery: routeDistance(takeoff + gap + landingLength + 8),
    halfWidth: WIDTH / 2,
    targetSpeed: 112,
    recoveryDelay: 1.5,
  }));
  const sectionDefinitions = [
    [
      'berth',
      'Aurora Berth',
      0,
      95,
      'Pale dock panes reveal the supporting crystal ribs beneath the grid.',
    ],
    [
      'mouth',
      'Cobalt Mouth',
      420,
      595,
      'Linked braking bends fold into the torn cobalt entrance.',
    ],
    [
      'gallery',
      'Prism Gallery',
      980,
      1195,
      'Climb through alternating frost banks and clear gripping crystal.',
    ],
    [
      'fracture',
      'Fracture Reach',
      bridgeStart,
      bridgeStart + 18,
      'A supported 600 m panorama is interrupted by two authored fracture jumps.',
    ],
    [
      'rim',
      'Auroral Rim',
      bridgeEnd,
      2650,
      'Broad banks expose the outer surface, aurora and calving shelf.',
    ],
    [
      'chasm',
      'Bluebell Chasm',
      3210,
      3560,
      'A descending S alternates frosted travel bands with clear crystal.',
    ],
    [
      'return',
      'Thawlight Return',
      4100,
      4380,
      'A rising linked bend returns to warm fittings beneath the dock mast.',
    ],
  ];
  const sections = sectionDefinitions.map(
    ([id, name, start, showcase, description], index) => ({
      id,
      name,
      start: routeDistance(start),
      end:
        index === sectionDefinitions.length - 1
          ? length
          : routeDistance(sectionDefinitions[index + 1][2]),
      showcase: routeDistance(showcase),
      description,
      representative: true,
      tunnel: ['mouth', 'gallery', 'chasm'].includes(id),
      banked: id !== 'fracture',
    }),
  );
  const frostDefinitions = [
    ['gallery-port-1', 1030, 1110, -15, -2],
    ['gallery-port-2', 1126, 1190, -15, -2],
    ['gallery-starboard-1', 1240, 1320, 2, 15],
    ['gallery-starboard-2', 1336, 1400, 2, 15],
    ['rim-frost', 2890, 3030, -15, -3],
    ['chasm-port-1', 3310, 3430, -15, 1],
    ['chasm-port-2', 3446, 3530, -15, 1],
    ['chasm-starboard-1', 3650, 3740, -1, 15],
    ['chasm-starboard-2', 3756, 3850, -1, 15],
  ];
  const gripZones = frostDefinitions.map(
    ([id, start, end, lateralMin, lateralMax]) => ({
      id,
      kind: 'frost',
      start: routeDistance(start),
      end: routeDistance(end),
      lateralMin,
      lateralMax,
      grip: 0.25,
      surface: { grip: 0.25 },
    }),
  );
  const surfaceAt = (distance, lateral = 0) => {
    const d = wrap(distance, length);
    return (
      gripZones.find(
        (zone) =>
          d >= zone.start &&
          d < zone.end &&
          lateral >= zone.lateralMin &&
          lateral <= zone.lateralMax,
      ) ?? {
        id: 'clear-crystal',
        kind: 'crystal',
        grip: 1,
        surface: { grip: 1 },
      }
    );
  };
  let hardestApex = 0;
  let maximumCurvature = 0;
  const bounds = new THREE.Box3();
  for (let distance = 0; distance < length; distance += 2) {
    const frame = sample(distance);
    bounds.expandByPoint(frame.position);
    if (Math.abs(frame.curvature) > maximumCurvature) {
      hardestApex = distance;
      maximumCurvature = Math.abs(frame.curvature);
    }
  }
  bounds.expandByScalar(WIDTH / 2 + 3);
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(32),
    bank: parked(routeDistance(2770)),
    'bank-rest': parked(routeDistance(2770)),
    'hardest-turn': parked(hardestApex - 80),
    'fast-corner': { ...parked(hardestApex - 80), speed: 80 },
    'slope-rest': parked(routeDistance(1195)),
    'crevice-dive': parked(routeDistance(3190)),
    'corkscrew-entry': parked(routeDistance(3320)),
    'corkscrew-inverted': parked(routeDistance(3525)),
    'crevice-floor': parked(routeDistance(3820)),
    'crevice-ascent': parked(routeDistance(4160)),
    'blizzard-rim': parked(routeDistance(2810)),
    'first-shelf-approach': parked(245),
    'first-shelf-crack': parked(350),
    'first-shelf-fall': parked(390),
    'first-shelf-gone': parked(390),
    'calving-approach': parked(routeDistance(bridgeStart) - 100),
    'calving-departure': parked(routeDistance(bridgeEnd) + 150),
    'calving-cracks': parked(jumps[1].takeoff - 45),
    'calving-open': parked(jumps[1].takeoff + CALVING_RULES.separationSpan),
    'frost-approach': parked(gripZones[0].start - 55),
    'frost-matched': {
      ...parked(gripZones[0].start + 10),
      lateral: -8,
      speed: 75,
    },
    'crystal-matched': {
      ...parked(gripZones[0].start + 10),
      lateral: 8,
      speed: 75,
    },
    impact: { ...parked(160), lateral: 12, speed: 85, heading: 0.12 },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  for (const [index, jump] of jumps.entries()) {
    scenarios[`jump${index + 1}-approach`] = parked(
      jump.takeoff - (index === 0 ? 75 : 120),
    );
    scenarios[`jump${index + 1}-straight-setup`] = {
      ...scenarios[`jump${index + 1}-approach`],
    };
    if (index === 0)
      scenarios['jump1-bend-approach'] = parked(jump.takeoff - 120);
    for (const [name, speed, heading] of [
      ['success', 112, 0],
      ['cruise70', 78.4, 0],
      ['boost70', 109.9, 0],
      ['short', 52, 0],
      ['lateral', 112, 0.27],
      ['long', 157, 0],
    ])
      scenarios[`jump${index + 1}-${name}`] = {
        ...parked(jump.takeoff - 0.8),
        speed,
        heading,
      };
  }
  const checkpointDistances = [
    0,
    routeDistance(620),
    routeDistance(1200),
    jumps[0].landingStart,
    jumps[1].landingStart,
    routeDistance(2780),
    routeDistance(3530),
    routeDistance(4360),
  ];
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const isGap = (distance) =>
    jumps.some(
      (jump) =>
        wrap(distance, length) > jump.takeoff &&
        wrap(distance, length) < jump.landingStart,
    );
  const supportedRuns = [
    [0, jumps[0].takeoff],
    [jumps[0].landingStart, jumps[1].takeoff],
    [jumps[1].landingStart, length],
  ];
  return {
    id: 'glasswake-comet-v2',
    name: 'Glasswake Comet',
    geometryVersion: 'glasswake-crevice-corkscrew-v2',
    length,
    width: WIDTH,
    groundY: -150,
    crevice: {
      entry: routeDistance(3170),
      corkscrewStart: routeDistance(3260),
      corkscrewEnd: routeDistance(3790),
      floor: routeDistance(3820),
      exit: routeDistance(4260),
    },
    sample,
    sections,
    jumps,
    gripZones,
    surfaceAt,
    checkpoints,
    scenarios,
    bounds,
    isGap,
    supportedRuns,
    bridge: {
      start: routeDistance(bridgeStart),
      end: routeDistance(bridgeEnd),
      length: routeDistance(bridgeEnd) - routeDistance(bridgeStart),
    },
    surfaceCoverage: (distance) => (isGap(distance) ? 0 : 1),
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'bare-track',
      description:
        'Linked comet rim/cavern bends, transparent support spans, two true fractures and visibly bounded frost choices.',
    },
  };
}
