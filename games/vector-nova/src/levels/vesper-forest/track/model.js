import * as T from 'three';
import { cacheClosedCatmullRom } from '../../../track/cached-curve.js';

export const VESPER_REVISION = 'vesper-route-6-crown-receiver';
const wrap = (s, length) => ((s % length) + length) % length;
const PLAN = [
  [-280, -300],
  [-280, -140],
  [-190, -20],
  [-300, 100],
  [-200, 225],
  [-60, 245],
  [-50, 320],
  [0, 425],
  [125, 420],
  [170, 315],
  [105, 235],
  [0, 250],
  [-50, 335],
  [10, 420],
  [150, 450],
  [340, 450],
  [550, 450],
  [720, 450],
  [890, 470],
  [1070, 330],
  [1100, 120],
  [930, 30],
  [760, 20],
  [590, 20],
  [380, 20],
  [270, -70],
  [330, -220],
  [430, -310],
  [360, -450],
  [175, -475],
  [30, -350],
  [-120, -490],
  [-280, -450],
];
// Heights are sparse grade anchors, not a hump at every plan control point.
const ELEVATIONS = [
  [0, 25],
  [4, 65],
  [13, 207],
  [14, 220],
  [15, 232],
  // Lower the receiving span smoothly: its front lip is 2.25 m lower,
  // giving ordinary cruise launches margin without altering the takeoff.
  [16, 193],
  [17, 188],
  [19, 180],
  [21, -25],
  [24, 270],
  [25, 270],
  [28, 12],
  [31, 25],
  [32, 25],
];

/** Independent authored forest route. Physical arc metres are the only runtime parameter. */
export function createVesperTrack() {
  // Plan curvature and vertical grade are authored independently. Interpolating
  // all three coordinates through the tight tree knots compressed the climbs
  // into short pitches precisely where the racer was already turning hardest.
  const plan = new T.CatmullRomCurve3(
    PLAN.map(([x, z]) => new T.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  plan.arcLengthDivisions = 48000;
  const planArcs = plan.getLengths(48000);
  const planLength = planArcs.at(-1);
  const planAt = cacheClosedCatmullRom(plan);
  const nodeU = (node) => {
    const f = (node / PLAN.length) * 48000;
    const i = Math.floor(f);
    return (
      T.MathUtils.lerp(planArcs[i], planArcs[Math.min(i + 1, 48000)], f - i) /
      planLength
    );
  };
  // Beyond the lowered crown receiver, three sustained grades drop into the
  // canopy, climb through Bloomspan, then dive into Rootfall.
  const grades = ELEVATIONS.map(([node, height]) => ({
    u: nodeU(node),
    y: height * 0.82,
  }));
  grades.push({ u: 1, y: grades[0].y });
  const secants = grades
    .slice(0, -1)
    .map((a, i) => (grades[i + 1].y - a.y) / (grades[i + 1].u - a.u));
  const slopes = grades.map((_, i) => {
    if (i === 0 || i === grades.length - 1) return 0;
    const a = secants[i - 1],
      b = secants[i];
    if (a * b <= 0) return 0;
    const before = grades[i].u - grades[i - 1].u,
      after = grades[i + 1].u - grades[i].u;
    const w1 = 2 * after + before,
      w2 = after + 2 * before;
    return (w1 + w2) / (w1 / a + w2 / b);
  });
  const elevationAt = (u) => {
    const i = Math.min(
      grades.length - 2,
      grades.findIndex((grade) => grade.u > u) - 1,
    );
    const index = i < 0 ? grades.length - 2 : i;
    const a = grades[index],
      b = grades[index + 1],
      span = b.u - a.u;
    const t = (u - a.u) / span;
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * a.y +
      (t ** 3 - 2 * t ** 2 + t) * span * slopes[index] +
      (-2 * t ** 3 + 3 * t ** 2) * b.y +
      (t ** 3 - t ** 2) * span * slopes[index + 1]
    );
  };
  // Fixed forest footprint: changing altitude must not move the fitted hollow
  // portals or rescale every tree and crossing in the world.
  const scale = 0.8672943791072507;
  const curve = new T.Curve();
  curve.getPoint = (u) => {
    const point = planAt(u).multiplyScalar(scale);
    point.y = elevationAt(u);
    return point;
  };
  curve.arcLengthDivisions = 48000;
  curve.updateArcLengths();
  const length = curve.getLength();
  const arcs = curve.getLengths(48000);
  const nodeS = (node) => {
    const f = nodeU(node) * 48000;
    const i = Math.floor(f);
    return T.MathUtils.lerp(arcs[i], arcs[Math.min(i + 1, 48000)], f - i);
  };
  const positionAt = (s) => curve.getPointAt(wrap(s, length) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.25)
      .sub(positionAt(s - 0.25))
      .normalize();
  // One deliberate, broad 360-degree roll on the open climbing span. Keep
  // the tightly winding hollow and ordinary road level across their width.
  const inversion = {
    id: 'bloom-corkscrew',
    name: 'Bloomspan Corkscrew',
    start: nodeS(21) + 20,
    end: nodeS(24) - 20,
  };
  const rollAt = (s) => {
    const t = T.MathUtils.clamp(
      (s - inversion.start) / (inversion.end - inversion.start),
      0,
      1,
    );
    // Cosine velocity eases both ends to zero without a pitch/roll shoulder.
    return Math.PI * 2 * (t - Math.sin(Math.PI * 2 * t) / (Math.PI * 2));
  };
  function sample(s) {
    const distance = wrap(s, length);
    const tangent = tangentAt(distance);
    const roll = rollAt(distance);
    const right = new T.Vector3(tangent.z, 0, -tangent.x)
      .normalize()
      .applyAxisAngle(tangent, roll);
    const up = new T.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, tangent),
    );
    const curvature = tangentAt(distance + 0.5)
      .sub(tangentAt(distance - 0.5))
      .dot(right);
    return {
      position: positionAt(distance),
      tangent,
      right,
      up,
      quaternion,
      curvature,
      bank: Math.atan2(Math.sin(roll), Math.cos(roll)),
      roll,
    };
  }
  const verticals = [
    {
      id: 'canopy-plunge',
      name: 'Canopy Plunge',
      start: nodeS(19),
      end: nodeS(21),
    },
    {
      id: 'bloom-ascent',
      name: 'Bloomspan Ascent',
      start: nodeS(21),
      end: nodeS(24),
    },
    {
      id: 'rootfall-dive',
      name: 'Rootfall Dive',
      start: nodeS(25),
      end: nodeS(28),
    },
  ];
  const crownTakeoff = nodeS(15) - 8;
  const jumps = [
    {
      id: 'crown-leap',
      name: 'Lantern crown leap',
      takeoff: crownTakeoff,
      landingStart: crownTakeoff + 66,
      landingEnd: nodeS(17) - 12,
      recovery: nodeS(17) - 8,
      halfWidth: 14,
    },
  ];
  const definitions = [
    ['saplight', 'Saplight Landing', 0, nodeS(4), nodeS(1)],
    ['pillar', 'Pillar Grove', nodeS(4), nodeS(13), nodeS(6)],
    ['crown', 'Lantern Crown', nodeS(13), nodeS(19), nodeS(14) - 40],
    ['bloom', 'Bloomspan', nodeS(19), nodeS(25), nodeS(22) - 50],
    ['rootfall', 'Rootfall', nodeS(25), nodeS(28), nodeS(26)],
    ['vault', 'Mycelium Vault', nodeS(28), nodeS(31), nodeS(29)],
    ['dawnscar', 'Dawnscar Return', nodeS(31), length, nodeS(32)],
  ];
  const sections = definitions.map(([id, name, start, end, showcase]) => ({
    id,
    name,
    start,
    end,
    showcase,
  }));
  const checkpoints = [
    0,
    nodeS(4),
    nodeS(10),
    jumps[0].landingStart,
    nodeS(19),
    nodeS(22),
    nodeS(25),
    nodeS(28),
    nodeS(31),
  ]
    .sort((a, b) => a - b)
    .map((distance, index) => ({
      index,
      s: distance,
      distance,
      position: sample(distance).position,
      quaternion: sample(distance).quaternion,
    }));
  const sapZones = [
    {
      id: 'saplight-flow',
      start: nodeS(2) - 30,
      end: nodeS(2) + 85,
      resinCenter: -5,
      resinHalfWidth: 3.6,
      drag: 4.2,
    },
    {
      id: 'bloom-flow',
      start: nodeS(22) - 70,
      end: nodeS(24) - 30,
      resinCenter: -5,
      resinHalfWidth: 3.6,
      drag: 5.5,
    },
    {
      id: 'rootfall-flow',
      start: nodeS(26) - 45,
      end: nodeS(27) + 45,
      resinCenter: 4.5,
      resinHalfWidth: 3.6,
      drag: 4.8,
    },
  ];
  const scenarios = {
    staging: { distance: 0 },
    impact: { distance: 180, speed: 85, lateral: -11.7, heading: -0.12 },
    inspection: { distance: 32 },
    'trunk-entry': { distance: nodeS(5) - 65, speed: 42 },
    'spiral-climb': { distance: nodeS(8), speed: 46 },
    'crown-runup': { distance: crownTakeoff - 160, speed: 80 },
    'crown-fast': { distance: crownTakeoff - 35, speed: 112 },
    'crown-imperfect': {
      distance: crownTakeoff - 35,
      speed: 72,
      heading: 0.09,
    },
    'sap-compare': { distance: nodeS(22) - 75, speed: 85, lateral: 2 },
    'resin-compare': { distance: nodeS(22) - 75, speed: 85, lateral: -5 },
    'bloom-runup': { distance: nodeS(22) - 48, speed: 95, lateral: 8.5 },
    'bloom-corkscrew': { distance: inversion.start - 70, speed: 112 },
    'root-descent': { distance: nodeS(25) - 40, speed: 70 },
    'slope-rest': { distance: nodeS(26), speed: 0 },
    'support-crown-setup': {
      distance: crownTakeoff - 130,
      lateral: 0,
      speed: 0,
    },
    'support-trunk-shelf': { distance: nodeS(5) - 70, lateral: 0, speed: 0 },
    'support-bloom-recovery': {
      distance: sapZones[1].end + 20,
      lateral: -5,
      speed: 0,
    },
    'support-bloom-setup': {
      distance: nodeS(22) - 68,
      lateral: 8.5,
      speed: 0,
    },
    'support-rootfall-recovery': {
      distance: sapZones[2].end + 25,
      lateral: 4.5,
      speed: 0,
    },
    'creature-event': {
      label: 'Bloomspan crossing',
      distance: nodeS(20) - 60,
      speed: 58,
    },
  };
  for (const vertical of verticals)
    scenarios[vertical.id] = { distance: vertical.start - 30, speed: 90 };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = {
      distance: section.showcase,
      speed: 0,
    };
  return {
    id: 'vesper-forest-1',
    name: 'Vesper Forest',
    length,
    width: 28,
    groundY: -100,
    sample,
    sections,
    checkpoints,
    scenarios,
    jumps,
    inversions: [inversion],
    verticals,
    sapZones,
    revision: VESPER_REVISION,
    geometryVersion: VESPER_REVISION,
    sourceScale: scale,
    review: { kind: 'vesper-forest', phase: 'pilot' },
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    landmarks: {
      hollow: {
        center: [60 * scale, 0, 330 * scale],
        radius: 166 * scale,
        base: -55,
        top: 190,
        entry: nodeS(5),
        exit: nodeS(14),
        spiralStart: nodeS(6),
        spiralEnd: nodeS(13),
      },
      flower: { s: nodeS(23) - 35 },
      creature: { s: nodeS(20) },
      station: { s: 0 },
    },
    isGap(s) {
      const d = wrap(s, length);
      return jumps.some((j) => d > j.takeoff && d < j.landingStart);
    },
  };
}
