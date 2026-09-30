import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

export const VESPER_REVISION = 'vesper-route-2';
const wrap = (s, length) => ((s % length) + length) % length;
const SOURCE = [
  [-280, 25, -300],
  [-280, 32, -140],
  [-190, 50, -20],
  [-300, 60, 100],
  [-200, 68, 225],
  [-60, 70, 245],
  [-50, 85, 320],
  [0, 105, 425],
  [125, 125, 420],
  [170, 145, 315],
  [105, 165, 235],
  [0, 185, 250],
  [-50, 200, 335],
  [10, 207, 420],
  [150, 214, 450],
  [340, 232, 450],
  [550, 205, 450],
  [720, 205, 450],
  [890, 190, 470],
  [1070, 180, 330],
  [1100, 170, 120],
  [930, 158, 30],
  [760, 180, 20],
  [590, 125, 20],
  [380, 118, 20],
  [270, 65, -70],
  [330, 25, -220],
  [430, 4, -310],
  [360, 0, -450],
  [175, 10, -475],
  [30, 20, -350],
  [-120, 35, -490],
  [-280, 32, -450],
];

/** Independent authored forest route. Physical arc metres are the only runtime parameter. */
export function createVesperTrack() {
  let scale = 1;
  let curve;
  for (let pass = 0; pass < 7; pass++) {
    curve = new T.CatmullRomCurve3(
      SOURCE.map(([x, y, z]) => new T.Vector3(x * scale, y * 0.82, z * scale)),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 48000;
    curve.updateArcLengths();
    if (pass < 6) scale *= 4600 / curve.getLength();
  }
  const length = curve.getLength();
  const arcs = curve.getLengths(48000);
  const nodeS = (node) => {
    const f = (node / SOURCE.length) * 48000;
    const i = Math.floor(f);
    return T.MathUtils.lerp(arcs[i], arcs[i + 1], f - i);
  };
  const positionAt = (s) => curve.getPointAt(wrap(s, length) / length);
  const tangentAt = (s) =>
    positionAt(s + 0.25)
      .sub(positionAt(s - 0.25))
      .normalize();
  const n = Math.ceil(length * 2);
  const step = length / n;
  const tangents = Array.from({ length: n + 1 }, (_, i) => tangentAt(i * step));
  const frames = createReferenceFrames(tangents, step);
  const bankAt = (s) => {
    const tangent = tangentAt(s);
    const horizontalRight = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
    const curvature =
      tangentAt(s + 12)
        .sub(tangentAt(s - 12))
        .dot(horizontalRight) / 24;
    return -T.MathUtils.clamp(curvature * 36, -0.38, 0.38);
  };
  function sample(s) {
    const distance = wrap(s, length);
    const f = distance / step;
    const i = Math.floor(f);
    const tangent = tangentAt(distance);
    const bank = bankAt(distance);
    const rotation = frames[i]
      .clone()
      .slerp(frames[i + 1], f - i)
      .multiply(
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), bank),
      );
    const right = new T.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
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
      bank,
      roll: bank,
    };
  }
  const crownTakeoff = nodeS(15) - 8;
  const branchTakeoff = nodeS(22) - 8;
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
    {
      id: 'branch-bypass',
      name: 'Bloomspan branch bypass',
      takeoff: branchTakeoff,
      landingStart: branchTakeoff + 44,
      landingEnd: branchTakeoff + 300,
      recovery: branchTakeoff + 310,
      halfWidth: 14,
      optional: true,
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
    jumps[1].landingStart,
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
    'branch-runup': { distance: branchTakeoff - 40, speed: 95, lateral: 8.5 },
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
    'support-branch-setup': {
      distance: branchTakeoff - 60,
      lateral: 8.5,
      speed: 0,
    },
    'support-rootfall-recovery': {
      distance: sapZones[2].end + 25,
      lateral: 4.5,
      speed: 0,
    },
    'creature-event': { distance: nodeS(20) - 60, speed: 58 },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = {
      distance: section.showcase,
      speed: 0,
    };
  return {
    id: 'vesper-canopy-1',
    name: 'Vesper Canopy',
    length,
    width: 28,
    groundY: -100,
    sample,
    sections,
    checkpoints,
    scenarios,
    jumps,
    sapZones,
    revision: VESPER_REVISION,
    sourceScale: scale,
    review: { kind: 'vesper-production', phase: 'expansion' },
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
    isGap(s, lateral = 0) {
      const d = wrap(s, length);
      return jumps.some(
        (j) =>
          d > j.takeoff && d < j.landingStart && (!j.optional || lateral > 5.5),
      );
    },
  };
}
