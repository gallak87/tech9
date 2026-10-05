import * as THREE from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 30;
const HORIZONTAL_LENGTH = 4920;
const wrap = (value, length) => ((value % length) + length) % length;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const bankEnvelope = (s, a, b, c, d, degrees) =>
  THREE.MathUtils.degToRad(degrees) *
  smooth((s - a) / (b - a)) *
  (1 - smooth((s - c) / (d - c)));

// Geometric +X is driver-left. Each optional vault removes that half of the
// road; the other half remains a physically present, grounded hot detour.
export function createHelionTrack() {
  const source = [
    [0, 0],
    [0, 210],
    [-110, 420],
    [-330, 460],
    [-600, 460],
    [-860, 460],
    [-1060, 320],
    [-1080, 60],
    [-910, -170],
    [-660, -180],
    [-530, -380],
    [-620, -600],
    [-450, -810],
    [-160, -850],
    [130, -850],
    [430, -850],
    [630, -700],
    [670, -450],
    [670, -180],
    [670, 80],
    [590, 250],
    [420, 210],
    [340, 20],
    [280, -180],
    [90, -220],
    [0, -110],
  ];
  const makeCurve = (scale) => {
    const result = new THREE.CatmullRomCurve3(
      source.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)),
      true,
      'centripetal',
    );
    result.arcLengthDivisions = 50000;
    result.updateArcLengths();
    return result;
  };
  const curve = makeCurve(HORIZONTAL_LENGTH / makeCurve(1).getLength());
  const arc = curve.getLengths(50000);
  const sourceDistance = (index) => {
    const f = (index / source.length) * 50000;
    const i = Math.floor(f);
    return THREE.MathUtils.lerp(arc[i], arc[i + 1], f - i);
  };
  const first = sourceDistance(3) + 46;
  const second = sourceDistance(13) + 40;
  const jumpDefinitions = [
    { id: 'radiator-vault', takeoff: first, gap: 76, landingLength: 245 },
    { id: 'prominence-vault', takeoff: second, gap: 88, landingLength: 265 },
  ];
  const pointOnCurve = (s) =>
    curve.getPointAt(wrap(s, HORIZONTAL_LENGTH) / HORIZONTAL_LENGTH);
  const runouts = jumpDefinitions.map((jump, i) => ({
    ...jump,
    anchor: pointOnCurve(jump.takeoff),
    direction: i === 0 ? -1 : 1,
  }));
  const horizontalPoint = (s) => {
    const d = wrap(s, HORIZONTAL_LENGTH);
    const p = pointOnCurve(d);
    for (const runout of runouts) {
      const offset = d - runout.takeoff;
      const end = runout.gap + runout.landingLength + 35;
      if (offset <= -135 || offset >= end + 95) continue;
      const weight =
        smooth((offset + 135) / 70) * (1 - smooth((offset - end) / 95));
      const straight = runout.anchor.clone();
      straight.x += offset * runout.direction;
      p.lerp(straight, weight);
    }
    return p;
  };
  const slope8 = Math.tan(THREE.MathUtils.degToRad(8));
  const heights = [
    [0, 22, 0],
    [230, 48, 0.08],
    [first - 135, 76, 0],
    [first - 55, 78, 0.055],
    [first, 84, slope8],
    [first + 76, 74, 0],
    [first + 356, 74, 0],
    [1230, 106, 0.16],
    [1490, 162, 0.19],
    [1740, 214, 0.08],
    [1890, 218, 0],
    [2130, 183, -0.13],
    [2390, 151, -0.1],
    [second - 135, 125, 0],
    [second - 55, 126, 0.055],
    [second, 132, slope8],
    [second + 88, 120, 0],
    [second + 388, 120, 0],
    [3580, 94, -0.13],
    [3900, 61, -0.05],
    [4230, 43, -0.08],
    [4500, 18, -0.05],
    [4770, 12, 0],
    [HORIZONTAL_LENGTH, 22, 0],
  ];
  const heightAt = (s) => {
    const d = wrap(s, HORIZONTAL_LENGTH);
    let i = 0;
    while (i < heights.length - 2 && heights[i + 1][0] < d) i += 1;
    const [a, ya, ma] = heights[i];
    const [b, yb, mb] = heights[i + 1];
    const t = (d - a) / (b - a);
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * ya +
      (t ** 3 - 2 * t ** 2 + t) * (b - a) * ma +
      (-2 * t ** 3 + 3 * t ** 2) * yb +
      (t ** 3 - t ** 2) * (b - a) * mb
    );
  };
  const rawPoint = (s) => {
    const p = horizontalPoint(s);
    p.y = heightAt(s);
    return p;
  };
  const count = Math.ceil(HORIZONTAL_LENGTH * 3);
  const step = HORIZONTAL_LENGTH / count;
  const distances = [0];
  let previous = rawPoint(0);
  for (let i = 1; i <= count; i += 1) {
    const next = rawPoint(i * step);
    distances.push(distances.at(-1) + next.distanceTo(previous));
    previous = next;
  }
  const length = distances.at(-1);
  const routeDistance = (horizontal) => {
    if (horizontal === HORIZONTAL_LENGTH) return length;
    const f = horizontal / step;
    const i = Math.floor(f);
    return THREE.MathUtils.lerp(distances[i], distances[i + 1], f - i);
  };
  const horizontalDistance = (s) => {
    const d = wrap(s, length);
    let lo = 0;
    let hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] <= d) lo = mid;
      else hi = mid;
    }
    return (
      (lo + (d - distances[lo]) / (distances[lo + 1] - distances[lo])) * step
    );
  };
  const positionAt = (s) => rawPoint(horizontalDistance(s));
  const tangentAt = (s) =>
    positionAt(s + 0.2)
      .sub(positionAt(s - 0.2))
      .normalize();
  const bankAt = (h) =>
    bankEnvelope(h, 80, 260, 350, 480, -22) +
    bankEnvelope(h, 1080, 1150, 1210, 1290, -24) +
    bankEnvelope(h, 1260, 1410, 1670, 1840, -103) +
    bankEnvelope(h, 1930, 2020, 2110, 2240, 28) +
    bankEnvelope(h, 2280, 2380, 2520, 2640, -29) +
    bankEnvelope(h, 3370, 3470, 3620, 3740, -28) +
    bankEnvelope(h, 4220, 4310, 4400, 4520, -24) +
    bankEnvelope(h, 4550, 4650, 4750, 4880, 20);
  const frameCount = Math.ceil(length);
  const frameStep = length / frameCount;
  const references = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, i) => tangentAt(i * frameStep)),
    frameStep,
  );
  const rotations = references.map((rotation, i) =>
    rotation
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          bankAt(horizontalDistance(i * frameStep)),
        ),
      ),
  );
  const sample = (s) => {
    const d = wrap(s, length);
    const tangent = tangentAt(d);
    const f = d / frameStep;
    const i = Math.floor(f);
    const rotation = rotations[i].clone().slerp(rotations[i + 1], f - i);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
    const bank = bankAt(horizontalDistance(d));
    return {
      position: positionAt(d),
      tangent,
      right,
      up,
      quaternion,
      bank,
      roll: bank,
      curvature: tangentAt(d + 1)
        .sub(tangentAt(d - 1))
        .multiplyScalar(0.5)
        .dot(right),
    };
  };
  const jumps = jumpDefinitions.map((jump) => ({
    ...jump,
    optional: true,
    takeoff: routeDistance(jump.takeoff),
    landingStart: routeDistance(jump.takeoff + jump.gap),
    landingEnd: routeDistance(jump.takeoff + jump.gap + jump.landingLength),
    recovery: routeDistance(jump.takeoff + jump.gap + jump.landingLength + 25),
    halfWidth: WIDTH / 2,
    branchThreshold: 2.4,
    gapLateralStart: 0,
    recoveryDelay: 1.35,
    targetSpeed: 112,
  }));
  const definitions = [
    [
      'dawnshield',
      'Dawnshield Dock',
      0,
      220,
      'Shaded service berth and shallow departure climb.',
    ],
    [
      'radiator',
      'Radiator Reach',
      460,
      first - 90,
      'Fast exposed reach with a sheltered optional vault and grounded detour.',
    ],
    [
      'heliopause',
      'Heliopause Wall',
      1180,
      1520,
      'Continuous 103 degree shield-wall ride, gradual entry and exit braking shelf.',
    ],
    [
      'umbrae',
      'Umbrae Exchange',
      1870,
      2150,
      'Two deliberate braking turns in deep sunshield shade.',
    ],
    [
      'prominence',
      'Prominence Run',
      2550,
      second - 85,
      'Second sheltered vault under the larger stellar prominence.',
    ],
    [
      'coronal',
      'Coronal Shelf',
      3370,
      3920,
      'Cooling preparation, furnace crossing and exposed evasion straight.',
    ],
    [
      'afterglow',
      'Afterglow Return',
      4220,
      4630,
      'A dropping S returns through warm service light.',
    ],
  ];
  const sections = definitions.map(
    ([id, name, start, showcase, description], i) => ({
      id,
      name,
      start: routeDistance(start),
      end:
        i + 1 === definitions.length
          ? length
          : routeDistance(definitions[i + 1][2]),
      showcase: routeDistance(showcase),
      description,
      representative: true,
      banked: !['radiator', 'prominence', 'coronal'].includes(id),
      tunnel: false,
    }),
  );
  const zoneDefinitions = [
    ['cooling-dawn', 'Dock cooling', 'cooling', 290, 370],
    ['furnace-dawn', 'Dawn furnace', 'furnace', 390, 450],
    ['cooling-radiator', 'Radiator cooling', 'cooling', 465, 545],
    [
      'radiator-hot-detour',
      'Vault hot detour',
      'flare',
      first - 25,
      first + 160,
    ],
    ['radiator-sweep', 'Radiator flare sweep', 'flare', 1040, 1170],
    ['wall-shade', 'Sunshield wall shade', 'shelter', 1220, 1830],
    ['cooling-wall-exit', 'Wall exit cooling', 'cooling', 1840, 1930],
    ['umbrae-shade', 'Umbrae shield shade', 'shelter', 1950, 2360],
    ['cooling-umbrae', 'Exchange cooling', 'cooling', 2380, 2460],
    ['furnace-umbrae', 'Exchange furnace', 'furnace', 2475, 2535],
    ['cooling-prominence', 'Prominence cooling', 'cooling', 2550, 2640],
    [
      'prominence-hot-detour',
      'Prominence hot detour',
      'flare',
      second - 25,
      second + 185,
    ],
    ['prominence-sweep', 'Prominence flare sweep', 'flare', 3310, 3490],
    ['cooling-coronal', 'Coronal cooling', 'cooling', 3710, 3810],
    ['furnace-coronal', 'Coronal furnace', 'furnace', 3830, 3890],
    ['cooling-return', 'Return cooling', 'cooling', 3905, 4010],
    ['afterglow-sweep', 'Afterglow flare sweep', 'flare', 4050, 4210],
    ['dock-shade', 'Service berth shade', 'shelter', 4500, 4830],
  ];
  const thermalZones = zoneDefinitions.map(
    ([id, label, kind, start, end], i) => ({
      id,
      label,
      kind,
      start: routeDistance(start),
      end: routeDistance(end),
      phase: i * 0.71,
    }),
  );
  let hardestApex = 0;
  let maxCurvature = 0;
  for (let s = 0; s < length; s += 1) {
    const curvature = Math.abs(sample(s).curvature);
    if (curvature > maxCurvature) {
      maxCurvature = curvature;
      hardestApex = s;
    }
  }
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(30),
    bank: parked(routeDistance(1520)),
    'bank-rest': parked(routeDistance(1520)),
    'slope-rest': parked(routeDistance(1390)),
    'hardest-turn': parked(wrap(hardestApex - 80, length)),
    'wall-entry': parked(routeDistance(1210)),
    'wall-exit': parked(routeDistance(1800)),
    'fast-corner': { ...parked(wrap(hardestApex - 65, length)), speed: 82 },
    impact: { ...parked(80), lateral: 12, speed: 85, heading: 0.12 },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  for (const [i, jump] of jumps.entries()) {
    scenarios[`jump${i + 1}-approach`] = {
      ...parked(jump.takeoff - 135),
      lateral: 8,
    };
    scenarios[`jump${i + 1}-detour`] = {
      ...parked(jump.takeoff - 75),
      lateral: -8,
    };
    for (const [name, speed] of [
      ['success', 112],
      ['cruise70', 78.4],
      ['boost70', 109.9],
      ['short', 52],
      ['long', 157],
    ])
      scenarios[`jump${i + 1}-${name}`] = {
        ...parked(jump.takeoff - 0.8),
        lateral: 8,
        speed,
      };
  }
  for (const zone of thermalZones)
    scenarios[`${zone.id}-approach`] = parked(Math.max(0, zone.start - 65));
  const checkpointDistances = [
    0,
    routeDistance(350),
    jumps[0].landingStart,
    routeDistance(1190),
    routeDistance(1850),
    routeDistance(2440),
    jumps[1].landingStart,
    routeDistance(3600),
    routeDistance(4160),
    routeDistance(4700),
  ];
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new THREE.Box3();
  for (let s = 0; s < length; s += 4) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(WIDTH / 2 + 4);
  const gapAt = (s) =>
    jumps.find(
      (j) => wrap(s, length) > j.takeoff && wrap(s, length) < j.landingStart,
    );
  return {
    id: 'helion-flare-v1',
    name: 'Helion Flare',
    geometryVersion: 'helion-route-v1',
    width: WIDTH,
    length,
    groundY: -155,
    sample,
    sections,
    scenarios,
    checkpoints,
    bounds,
    jumps,
    thermalZones,
    gapAt,
    isGap: (s, lateral = 8) => Boolean(gapAt(s)) && lateral > 0,
    surfaceCoverage: (s, lateral = 0) => (gapAt(s) && lateral > 0 ? 0 : 1),
    wallRide: {
      start: routeDistance(1260),
      holdStart: routeDistance(1410),
      holdEnd: routeDistance(1670),
      end: routeDistance(1840),
      bankDegrees: -103,
    },
    brakingShelves: [
      routeDistance(1120),
      routeDistance(1880),
      routeDistance(2130),
      routeDistance(3440),
      routeDistance(4330),
    ],
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
      type: id === 'heliopause' ? 'wallride' : 'district',
    })),
    structuralZones: [],
    supportFootprints: [],
    review: {
      kind: 'bare-track',
      phase: 'production',
      summary:
        '5 km thermal observatory, 103 degree shield wall, two optional sheltered vaults',
      featureEntry: routeDistance(1180),
    },
  };
}
