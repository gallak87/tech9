import * as T from 'three';
import { cacheClosedCatmullRom } from '../../../track/cached-curve.js';
import { createVesperSurfaceSampler } from './surface.js';

export const VESPER_REVISION = 'vesper-route-9-river-run';
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
  [600, 450],
  [850, 450],
  [1100, 450],
  [1270, 315],
  [1210, 80],
  [1040, -10],
  [800, 20],
  [580, 55],
  [360, 20],
  [250, -100],
  [340, -260],
  [480, -360],
  [430, -600],
  [160, -600],
  [-120, -600],
  [-390, -600],
  [-380, -430],
];
// Heights are sparse grade anchors, not a hump at every plan control point.
const ELEVATIONS = [
  [0, 25],
  [1, 35],
  [2, 31],
  [3, 48],
  [4, 65],
  [7, 109],
  [10, 156],
  [13, 207],
  [14, 220],
  // Long catch runways and their launch ramps are inserted below in metres.
  [19, 180],
  [20, 119],
  [21, 100],
  [22, 105],
  [23, 116],
  [24, 145],
  [25, 145],
  [26, 112],
  [27, 64],
  [28, 45],
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
  const scale = 0.8672943791072507;
  const planMetres = planLength * scale;
  const transferPlans = [
    {
      id: 'crown-leap',
      node: 15,
      gap: 72,
      ramp: 135,
      height: 193.52,
      pitch: 0.1,
      drop: 12,
      catchGrade: -0.055,
      catchNode: 18,
    },
    {
      id: 'river-skip',
      node: 29,
      gap: 64,
      ramp: 140,
      height: 55.76,
      pitch: 0.08,
      drop: 8,
      catchGrade: -0.025,
      catchNode: 31,
    },
  ];
  const grades = ELEVATIONS.map(([node, height]) => ({
    u: nodeU(node),
    y: height * 0.82,
  }));
  for (const jump of transferPlans) {
    const takeoff = nodeU(jump.node) * planMetres;
    const landing = takeoff + jump.gap;
    const catchEnd = nodeU(jump.catchNode) * planMetres;
    for (const [metres, y, derivative] of [
      [takeoff - jump.ramp, jump.height - jump.ramp * jump.pitch, jump.pitch],
      [takeoff, jump.height, jump.pitch],
      [landing, jump.height - jump.drop, jump.catchGrade],
      [
        catchEnd,
        jump.height - jump.drop + (catchEnd - landing) * jump.catchGrade,
        jump.catchGrade,
      ],
    ])
      grades.push({
        u: metres / planMetres,
        y,
        slope: derivative * planMetres,
      });
    jump.takeoffU = takeoff / planMetres;
    jump.landingU = landing / planMetres;
    jump.catchU = catchEnd / planMetres;
  }
  grades.push({ u: 1, y: grades[0].y });
  grades.sort((a, b) => a.u - b.u);
  const secants = grades
    .slice(0, -1)
    .map((a, i) => (grades[i + 1].y - a.y) / (grades[i + 1].u - a.u));
  const slopes = grades.map((_, i) => {
    if (grades[i].slope !== undefined) return grades[i].slope;
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
  // Keep the fitted hollow and its portals at their original world scale.
  // The open eastern and return spans supply the extra transfer room.
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
  const arcAt = (u) => {
    const f = u * 48000;
    const i = Math.floor(f);
    return T.MathUtils.lerp(arcs[i], arcs[Math.min(i + 1, 48000)], f - i);
  };
  const nodeS = (node) => arcAt(nodeU(node));
  const positionAt = (s) => curve.getPointAt(wrap(s, length) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.25)
      .sub(positionAt(s - 0.25))
      .normalize();
  // Bloomspan rolls past inversion, then unwinds into the opposite bank.
  // Its shallow rising wave preserves cruising pace through the whole feature.
  const inversion = {
    id: 'bloom-corkscrew',
    name: 'Bloomspan Corkscrew',
    start: nodeS(21) + 20,
    end: nodeS(24) - 20,
  };
  const rollKeys = [
    [0, 0],
    [0.07, -0.14],
    [0.5, Math.PI * 1.04],
    [0.93, -0.14],
    [1, 0],
  ];
  const rollAt = (s) => {
    if (s < inversion.start || s > inversion.end) {
      // Small banks support the open bends. Keep hollow shelves and transfer
      // corridors upright, with a gradual blend at every protected boundary.
      const fade = (start, end) =>
        T.MathUtils.smoothstep(s, start - 35, start) *
        (1 - T.MathUtils.smoothstep(s, end, end + 35));
      let weight = 1 - fade(nodeS(4) - 20, nodeS(14) + 20);
      for (const jump of transferPlans)
        weight *=
          1 -
          fade(arcAt(jump.takeoffU) - jump.ramp - 35, arcAt(jump.catchU) + 35);
      weight *=
        T.MathUtils.clamp(Math.abs(s - inversion.start) / 35, 0, 1) *
        T.MathUtils.clamp(Math.abs(s - inversion.end) / 35, 0, 1);
      const before = tangentAt(s - 3),
        after = tangentAt(s + 3);
      const turn = (before.x * after.z - before.z * after.x) / 6;
      return T.MathUtils.clamp(turn * 12, -0.1, 0.1) * weight;
    }
    const t = T.MathUtils.clamp(
      (s - inversion.start) / (inversion.end - inversion.start),
      0,
      1,
    );
    const next = rollKeys.findIndex(([u]) => u > t);
    const index = next < 0 ? rollKeys.length - 2 : Math.max(0, next - 1);
    const [u0, r0] = rollKeys[index],
      [u1, r1] = rollKeys[index + 1];
    const f = T.MathUtils.clamp((t - u0) / (u1 - u0), 0, 1);
    const eased = f * f * f * (10 + f * (-15 + f * 6));
    return T.MathUtils.lerp(r0, r1, eased);
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
  const jumps = transferPlans.map((jump) => ({
    id: jump.id,
    name: jump.id === 'crown-leap' ? 'Lantern crown leap' : 'River skip',
    takeoff: arcAt(jump.takeoffU),
    landingStart: arcAt(jump.landingU),
    landingEnd: arcAt(jump.catchU) - 24,
    recovery: arcAt(jump.catchU) - 12,
    halfWidth: 14,
    launchAlignment: jump.ramp,
  }));
  const crownTakeoff = jumps[0].takeoff;
  const definitions = [
    ['saplight', 'Saplight Landing', 0, nodeS(4), nodeS(1)],
    ['pillar', 'Pillar Grove', nodeS(4), nodeS(13), nodeS(6)],
    ['crown', 'Lantern Crown', nodeS(13), nodeS(19), nodeS(14) - 40],
    ['bloom', 'Bloomspan', nodeS(19), nodeS(25), nodeS(22) - 50],
    ['rootfall', 'Rootfall', nodeS(25), nodeS(28), nodeS(26)],
    ['vault', 'Mycelium Vault', nodeS(28), nodeS(31), nodeS(28) + 90],
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
    jumps[1].landingStart,
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
      start: nodeS(20) - 50,
      end: nodeS(21) - 50,
      resinCenter: 0,
      resinHalfWidth: 5,
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
    'sap-compare': { distance: sapZones[1].start + 5, speed: 85, lateral: 8.5 },
    'resin-compare': { distance: sapZones[1].start + 5, speed: 85, lateral: 0 },
    'river-runup': { distance: jumps[1].takeoff - 160, speed: 80 },
    'river-fast': { distance: jumps[1].takeoff - 35, speed: 160 },
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
    sampleSurface: createVesperSurfaceSampler(sample, { ...inversion, length }),
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
    review: { kind: 'vesper-forest' },
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
