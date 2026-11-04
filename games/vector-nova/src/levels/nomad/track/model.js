import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

export const NOMAD_PACE = Object.freeze({
  cruiseScale: 1.25,
  boostScale: 1.15,
  aerodynamicDragScale: 0.55,
  overspeedDeceleration: 0.4,
});

const LENGTH = 12800;
const FINISH = 12200;
const RAW_HULL_Z = 1.4;
const HULL_LENGTH = 760;
const ROAD_HALF_WIDTH = 25;
const SOURCE_STEP = 0.5;
const SALT_GRADE = 0.025;
const clamp = T.MathUtils.clamp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
const v = (x, y, z) => new T.Vector3(x, y, z);

const CARRIERS = [
  ['tailforge', 'Tailforge / Loading Wake', 'cargo', 0],
  ['shoulder-ascent', 'Shoulder Ascent', 'climb', 32],
  ['high-balcony', 'High Balcony', 'roof', -14],
  ['portside-dive', 'Portside Dive', 'descent', 24],
  ['freight-cathedral', 'Freight Cathedral', 'cargo', -26],
  ['overtaking-wall', 'Overtaking Wall', 'overtake', -18],
  ['passing-deck', 'Passing Deck', 'roof', 242],
  ['lower-hold', 'Lower Hold', 'descent', 272],
  ['crane-alley', 'Crane Alley', 'cargo', 226],
  ['saltwind', 'Saltwind Galleries', 'cargo', 264],
  ['terminus', 'Nomad Terminus', 'cargo', 236],
];

// These points are in the retained Blender hull's local metre coordinates.
// The running skins are supplied by the game, never by the carrier model.
// Side climbs cross the large lateral portals at local Z=-220; descents return
// through Z=+220. Roof-height transitions stay outside the 180 m hull beam.
function authoredKeys(mode, index) {
  const a = index % 2 ? -24 : 24;
  if (mode === 'climb')
    return [
      [0, 54, -380, 0],
      [0, 54, -315, 0],
      [20, 62, -260, 0.05],
      [80, 64, -220, 0.2],
      [110, 95, -170, 0.85],
      [110, 142, -80, 1.12],
      [110, 160, -20, 0.9],
      [70, 163, 65, 0.25],
      [25, 154, 140, 0.08],
      [-20, 148, 220, -0.08],
      [0, 150, 300, 0],
      [0, 162, 380, 0],
    ];
  if (mode === 'descent')
    return [
      [0, 142, -380, 0],
      [0, 142, -300, 0],
      [-20, 156, -180, -0.06],
      [-70, 160, -80, -0.2],
      [-115, 150, 20, -0.7],
      [-125, 118, 100, -1.05],
      [-125, 83, 180, -0.6],
      [-80, 65, 220, 0],
      [-20, 56, 265, 0],
      [0, 58, 300, 0],
      [0, 64, 340, 0],
      [0, 70, 380, 0],
    ];
  if (mode === 'overtake')
    return [
      [0, 54, -380, 0],
      [0, 54, -315, 0],
      [22, 62, -260, 0.05],
      [80, 68, -220, 0.22],
      [110, 100, -180, 0.95],
      [110, 143, -115, 1.15],
      [116, 150, -80, 0.7],
      [142, 157, -45, 0.2],
      [170, 164, 0, 0],
    ];
  const roof = mode === 'roof';
  const y = roof ? 142 : 54;
  const start = index === 0 ? -300 : -380;
  return [
    [0, y, start, 0],
    [0, y, start + 80, 0],
    [a, y + 10, -140, roof ? 0.12 : 0.055],
    [-a, y + 7, 30, roof ? -0.12 : -0.055],
    [a * 0.7, y + 3, 190, roof ? 0.1 : 0.04],
    [0, y + 8, 300, 0],
    [0, y + (index === CARRIERS.length - 1 ? 8 : 20), 380, 0],
  ];
}

function bankAt(keys, fraction) {
  const at = clamp(fraction, 0, 1) * (keys.length - 1);
  const index = Math.min(keys.length - 2, Math.floor(at));
  return T.MathUtils.lerp(
    keys[index][3],
    keys[index + 1][3],
    smooth(at - index),
  );
}

/** Pure rest geometry. The motion adapter translates each named carrier. */
export function createNomadTrack() {
  let forward = 600;
  const carriers = CARRIERS.map(([id, name, mode, x], index) => {
    if (index) forward += index === 6 ? 620 : 1160;
    return {
      id: `nomad-${id}`,
      name,
      mode,
      index,
      origin: v(x, 700 - forward * SALT_GRADE, forward),
      scale: v(1, 1, RAW_HULL_Z),
      quaternion: new T.Quaternion().setFromAxisAngle(
        v(1, 0, 0),
        Math.atan(SALT_GRADE),
      ),
      sourceLength: HULL_LENGTH,
      sourceFloor: 54,
      sourceRoof: 130,
      sourceLaneRoof: 142,
    };
  });
  const pieces = [];
  for (const carrier of carriers) {
    const keys = authoredKeys(carrier.mode, carrier.index);
    const curve = new T.CatmullRomCurve3(
      keys.map(([x, y, z]) =>
        carrier.origin
          .clone()
          .add(v(x, y, z * RAW_HULL_Z).applyQuaternion(carrier.quaternion)),
      ),
      false,
      'centripetal',
    );
    carrier.curve = curve;
    carrier.keys = keys;
    if (pieces.length) {
      const previous = pieces.at(-1);
      const from = previous.curve.getPoint(1),
        to = curve.getPoint(0),
        span = from.distanceTo(to);
      const gap = new T.CubicBezierCurve3(
        from,
        from.clone().addScaledVector(previous.curve.getTangent(1), span / 3),
        to.clone().addScaledVector(curve.getTangent(0), -span / 3),
        to,
      );
      pieces.push({
        kind: 'gap',
        curve: gap,
        from: previous.carrier,
        to: carrier,
      });
    }
    pieces.push({ kind: 'road', curve, carrier, keys });
  }

  // Retain exact piece boundaries while refining the shape to sub-metre chords.
  const positions = [],
    bankValues = [],
    arcs = [];
  let total = 0;
  for (const piece of pieces) {
    piece.startIndex = Math.max(0, positions.length - 1);
    piece.rawStart = total;
    const estimate = piece.curve.getLength();
    const count = Math.max(4, Math.ceil(estimate / SOURCE_STEP));
    for (let index = positions.length ? 1 : 0; index <= count; index++) {
      const fraction = index / count;
      const point = piece.curve.getPoint(fraction);
      if (positions.length) total += point.distanceTo(positions.at(-1));
      positions.push(point);
      arcs.push(total);
      bankValues.push(piece.kind === 'road' ? bankAt(piece.keys, fraction) : 0);
    }
    piece.endIndex = positions.length - 1;
    piece.rawEnd = total;
  }
  const scale = LENGTH / total;
  for (const point of positions) point.multiplyScalar(scale);
  const distances = Float64Array.from(arcs, (distance) => distance * scale);
  for (const carrier of carriers) {
    carrier.origin.multiplyScalar(scale);
    carrier.scale.multiplyScalar(scale);
    carrier.lengthScaleZ = carrier.scale.z;
    carrier.groundY = carrier.origin.y;
    carrier.length = HULL_LENGTH * carrier.scale.z;
    carrier.width = 180 * carrier.scale.x;
    carrier.tireWidth = 220 * carrier.scale.x;
    delete carrier.curve;
    delete carrier.keys;
  }
  const atIndex = (index) => distances[index];
  const roadRuns = pieces
    .filter((piece) => piece.kind === 'road')
    .map((piece) => {
      const start = atIndex(piece.startIndex),
        end = piece === pieces.at(-1) ? LENGTH : atIndex(piece.endIndex),
        carrier = piece.carrier;
      Object.assign(carrier, { start, end, roadStart: start, roadEnd: end });
      return {
        id: `${carrier.id}-road`,
        carrierId: carrier.id,
        mode: carrier.mode,
        start,
        end,
        min: -ROAD_HALF_WIDTH,
        max: ROAD_HALF_WIDTH,
      };
    });
  // The grid occupies the retained stern floor behind the official start.
  roadRuns[0].start = -80;
  const gaps = pieces.filter((piece) => piece.kind === 'gap');
  const jumps = gaps.map((piece, index) => {
    const takeoff = atIndex(piece.startIndex),
      landingStart = atIndex(piece.endIndex),
      receiver = roadRuns[index + 1];
    const hero = piece.from.mode === 'overtake';
    return {
      id: hero ? 'nomad-overtake-transfer' : `nomad-transfer-${index + 1}`,
      label: hero ? 'The Passing Window' : `${piece.to.name} Transfer`,
      takeoff,
      landingStart,
      landingEnd: Math.min(
        receiver.end - 140,
        landingStart + (hero ? 540 : 450),
      ),
      recovery: Math.min(receiver.end - 120, landingStart + (hero ? 570 : 480)),
      halfWidth: 40,
      targetSpeed: hero ? 155 : 150,
      departureCarrierId: piece.from.id,
      receivingCarrierId: piece.to.id,
      hero,
    };
  });
  const isGap = (distance) =>
    jumps.some(
      (jump) => distance > jump.takeoff && distance < jump.landingStart,
    );
  const carrierAt = (distance) => {
    const s = clamp(distance, 0, LENGTH);
    const gap = jumps.find((jump) => s > jump.takeoff && s < jump.landingStart);
    if (gap)
      return carriers.find((carrier) => carrier.id === gap.departureCarrierId);
    return (
      carriers.find((carrier) => s <= carrier.end + 1e-6) ?? carriers.at(-1)
    );
  };
  const runAt = (distance) =>
    roadRuns.find(
      (run) => distance >= run.start - 1e-6 && distance <= run.end + 1e-6,
    ) ?? null;
  const halfWidthAt = (distance) => {
    const run = runAt(distance);
    if (!run || run === roadRuns[0]) return ROAD_HALF_WIDTH;
    const approach = distance - Math.max(0, run.start);
    return ROAD_HALF_WIDTH + 15 * (1 - smooth((approach - 80) / 160));
  };
  for (const run of roadRuns) {
    run.min = (distance) => -halfWidthAt(distance);
    run.max = (distance) => halfWidthAt(distance);
  }
  const tangentValues = positions.map((point, index) => {
    const before = positions[Math.max(0, index - 1)],
      after = positions[Math.min(positions.length - 1, index + 1)];
    return after.clone().sub(before).normalize();
  });
  const references = createReferenceFrames(
    tangentValues,
    SOURCE_STEP * scale,
    false,
  );
  const quaternions = references.map((quaternion, index) =>
    quaternion
      .clone()
      .multiply(
        new T.Quaternion().setFromAxisAngle(v(0, 0, 1), bankValues[index]),
      ),
  );
  function locate(distance) {
    const s = clamp(distance, 0, LENGTH);
    let lo = 0,
      hi = distances.length - 1;
    while (lo + 1 < hi) {
      const middle = (lo + hi) >> 1;
      if (distances[middle] <= s) lo = middle;
      else hi = middle;
    }
    const span = distances[hi] - distances[lo];
    return { lo, hi, fraction: span ? (s - distances[lo]) / span : 0 };
  }
  function positionAt(distance) {
    if (distance < 0)
      return positions[0].clone().addScaledVector(tangentValues[0], distance);
    const { lo, hi, fraction } = locate(distance);
    return positions[lo].clone().lerp(positions[hi], fraction);
  }
  function sample(distance) {
    const { lo, hi, fraction } = locate(distance);
    const quaternion = quaternions[lo].clone().slerp(quaternions[hi], fraction);
    const right = v(1, 0, 0).applyQuaternion(quaternion),
      up = v(0, 1, 0).applyQuaternion(quaternion),
      tangent = v(0, 0, 1).applyQuaternion(quaternion);
    const a = tangentValues[lo],
      b = tangentValues[hi];
    const span = distances[hi] - distances[lo];
    const curvature = span > 1e-8 ? b.clone().sub(a).dot(right) / span : 0;
    const bank = T.MathUtils.lerp(bankValues[lo], bankValues[hi], fraction);
    return {
      position: positionAt(distance),
      right,
      up,
      tangent,
      quaternion,
      curvature,
      bank,
      roll: bank,
    };
  }
  const pointAt = (distance, lateral = 0) => {
    const frame = sample(distance);
    return frame.position.addScaledVector(frame.right, lateral);
  };
  function sampleSurface(distance, lateral = 0) {
    const at = Math.min(distance, LENGTH),
      frame = sample(at),
      low = at - 0.25,
      high = Math.min(LENGTH, at + 0.25);
    const position = frame.position
      .clone()
      .addScaledVector(frame.right, lateral);
    const along = pointAt(high, lateral)
      .sub(pointAt(low, lateral))
      .multiplyScalar(1 / (high - low));
    const shear = along.dot(frame.right);
    const tangent = along.clone().addScaledVector(frame.right, -shear);
    const metric = tangent.length();
    tangent.normalize();
    const up = tangent.clone().cross(frame.right).normalize();
    const width = halfWidthAt(at),
      derivative = (halfWidthAt(high) - halfWidthAt(low)) / (high - low);
    return {
      ...frame,
      position,
      tangent,
      up,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(frame.right, up, tangent),
      ),
      longitudinalMetric: metric,
      lateralMetric: 1,
      longitudinalShear: shear,
      transverseCurvature: 0,
      bounds: {
        min: -width,
        max: width,
        minDerivative: -derivative,
        maxDerivative: derivative,
      },
      period: 0,
      viewBlend: 0,
      kind: 'nomad-carrier-deck',
      carrierId: carrierAt(distance).id,
    };
  }
  const sections = carriers.map((carrier, index) => ({
    id: carrier.id,
    name: carrier.name,
    start: index ? carrier.start : 0,
    end: index === carriers.length - 1 ? LENGTH : carriers[index + 1].start,
    ...(['climb', 'descent', 'overtake'].includes(carrier.mode)
      ? { showcase: (carrier.start + carrier.end) / 2 }
      : {}),
  }));
  const checkpoints = [
    0,
    ...jumps.map((jump) => jump.landingStart),
    FINISH,
  ].map((distance, index) => ({ distance, s: distance, index }));
  const scenarios = {
    staging: { distance: 0, lateral: 0, speed: 0, time: 0 },
    'cargo-entry': {
      distance: carriers[4].start + 30,
      lateral: 0,
      speed: 145,
      time: 0,
    },
    'hull-ascent': {
      distance: carriers[1].start + 200,
      lateral: 0,
      speed: 135,
      time: 0,
    },
    'hull-descent': {
      distance: carriers[3].start + 200,
      lateral: 0,
      speed: 140,
      time: 0,
    },
    'overtake-approach': {
      distance: jumps.find((jump) => jump.hero).takeoff - 220,
      lateral: 0,
      speed: 150,
      time: 0,
    },
    'terminus-approach': {
      distance: FINISH - 300,
      lateral: 0,
      speed: 155,
      time: 0,
    },
  };
  for (const jump of jumps)
    scenarios[`${jump.id}-approach`] = {
      distance: jump.takeoff - 140,
      lateral: 0,
      speed: jump.targetSpeed,
      time: 0,
    };
  const bounds = new T.Box3().setFromPoints(positions);
  bounds.expandByScalar(70);
  return {
    id: 'nomad-procession',
    name: 'Nomad Procession',
    version: 1,
    geometryVersion: 'nomad-convoy-rest-v1',
    closed: false,
    length: LENGTH,
    finishDistance: FINISH,
    width: ROAD_HALF_WIDTH * 2,
    mainWidth: ROAD_HALF_WIDTH * 2,
    roadHalfWidth: ROAD_HALF_WIDTH,
    pace: NOMAD_PACE,
    carriers,
    roadRuns,
    jumps,
    mandatoryJumps: jumps,
    sections,
    checkpoints,
    scenarios,
    bounds,
    restScale: scale,
    saltPlane: { height: 700 * scale, grade: SALT_GRADE },
    sample,
    sampleBase: sample,
    sampleSurface,
    sampleBranchSurface: sampleSurface,
    pointAt,
    positionAt,
    tangentAt: (distance) => sample(distance).tangent,
    carrierAt,
    runAt,
    halfWidthAt,
    isGap,
    surfaceCoverage: (distance, lateral = 0) =>
      !isGap(distance) &&
      distance >= -80 &&
      distance <= LENGTH &&
      Math.abs(lateral) <= halfWidthAt(distance) + 1e-7
        ? 1
        : 0,
    boundaryIntervals: [],
    aiSurfacePreview: true,
    aiLaneSpeedLimit: 24,
  };
}
