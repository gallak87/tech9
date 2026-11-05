import * as THREE from 'three';
import {
  createOrielChallenges,
  ORIEL_CHALLENGE_ID,
  orielRoadBounds,
} from '../hazards.js';

export const ORIEL_HABITAT = Object.freeze({
  radius: 1000,
  center: Object.freeze([0, 1000, 0]),
  length: 4800,
  zMin: -2400,
  zMax: 2400,
});
export const ORIEL_WIDTH = 40;
const TAU = Math.PI * 2;
const wrap = (value, period) => ((value % period) + period) % period;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t ** 3 * (10 + t * (-15 + 6 * t));
};
const pulse = (u, a, b, c, d) =>
  smooth((u - a) / (b - a)) * (1 - smooth((u - c) / (d - c)));
const center = new THREE.Vector3(...ORIEL_HABITAT.center);

// The cylinder's inhabitants stand toward its axis. The race follows that
// orientation all the way around, rather than rolling a flat road in space.
export function orielInward(position) {
  return new THREE.Vector3(-position.x, center.y - position.y, 0).normalize();
}

function arcTable(pointAt, period, count = 24000) {
  const distances = new Float64Array(count + 1);
  let previous = pointAt(0);
  for (let i = 1; i <= count; i++) {
    const point = pointAt((i / count) * period);
    distances[i] = distances[i - 1] + point.distanceTo(previous);
    previous = point;
  }
  const length = distances[count];
  return {
    length,
    distanceAt(parameter) {
      if (parameter === period) return length;
      const value = (wrap(parameter, period) / period) * count;
      const i = Math.floor(value);
      return THREE.MathUtils.lerp(distances[i], distances[i + 1], value - i);
    },
    parameterAt(distance) {
      const s = wrap(distance, length);
      let low = 0;
      let high = count;
      while (low + 1 < high) {
        const middle = (low + high) >> 1;
        if (distances[middle] <= s) low = middle;
        else high = middle;
      }
      return (
        ((low + (s - distances[low]) / (distances[low + 1] - distances[low])) /
          count) *
        period
      );
    },
  };
}

export function createOrielTrack() {
  const shellPoint = (u) => {
    const t = wrap(u, 1);
    const theta = TAU * t;
    // A long sunward bow leaves the inhabited shell and threads the civic hub.
    // Shell shoulders are usually forty metres behind the road; the bow is a
    // substantial independent bridge with its own lower supports.
    const radius =
      960 -
      510 * pulse(t, 0.58, 0.65, 0.76, 0.84) -
      35 * Math.sin(TAU * t) ** 2;
    return new THREE.Vector3(
      Math.sin(theta) * radius,
      center.y - Math.cos(theta) * radius,
      -1500 * Math.cos(theta) + 270 * Math.sin(theta * 2),
    );
  };
  const base = arcTable(shellPoint, 1);
  const basePoint = (s) => shellPoint(base.parameterAt(s));
  const baseTangent = (s) =>
    basePoint(s + 0.2)
      .sub(basePoint(s - 0.2))
      .normalize();
  const definitions = [
    { id: 'terrace-flight', u: 0.17, gap: 130, landingLength: 330 },
    { id: 'sunline-transfer', u: 0.695, gap: 130, landingLength: 620 },
  ];
  const runs = definitions.map((jump) => {
    const takeoff = base.distanceAt(jump.u);
    const anchor = basePoint(takeoff);
    const tangent = baseTangent(takeoff);
    const up = orielInward(anchor);
    up.addScaledVector(tangent, -up.dot(tangent)).normalize();
    // Tangential receiving straights would otherwise approach the shell.
    // Seat each complete bridge sixty metres inward before blending it back.
    anchor.addScaledVector(up, 60);
    return {
      ...jump,
      takeoff,
      anchor,
      tangent,
      up,
      flatEnd: jump.gap + jump.landingLength + 35,
      blendEnd: jump.gap + jump.landingLength + 235,
    };
  });
  const rampSlope = Math.tan(THREE.MathUtils.degToRad(8));
  const hermite = (t, a, b, ma, mb, span) =>
    (2 * t ** 3 - 3 * t ** 2 + 1) * a +
    (t ** 3 - 2 * t ** 2 + t) * ma * span +
    (-2 * t ** 3 + 3 * t ** 2) * b +
    (t ** 3 - t ** 2) * mb * span;
  const riseAt = (offset, run) => {
    if (offset < -145) return -12;
    if (offset <= 0)
      return hermite((offset + 145) / 145, -12, 0, 0, rampSlope, 145);
    if (offset < run.gap)
      return hermite(offset / run.gap, 0, -10, rampSlope, 0, run.gap);
    return -10;
  };
  const corkscrew = { start: 0.29, end: 0.385, radius: 55 };
  const weaveDefinitions = [
    { id: 'promenade-weave', start: 0.02, end: 0.115, amplitude: 66 },
    { id: 'orchard-weave', start: 0.865, end: 0.985, amplitude: 76 },
  ];
  const corkscrewPhase = (u) =>
    TAU * smooth((u - corkscrew.start) / (corkscrew.end - corkscrew.start));
  const districtOffset = (distance, point) => {
    const u = base.parameterAt(distance);
    const tangent = baseTangent(distance);
    const up = orielInward(point);
    up.addScaledVector(tangent, -up.dot(tangent)).normalize();
    const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
    for (const weave of weaveDefinitions) {
      if (u <= weave.start || u >= weave.end) continue;
      const t = (u - weave.start) / (weave.end - weave.start);
      // Zero first and second derivatives at the joins; the two unequal
      // lobes make an actual left-right S rather than a painted racing line.
      point.addScaledVector(
        right,
        weave.amplitude * Math.sin(TAU * t) * Math.sin(Math.PI * t) ** 2,
      );
    }
    if (u > corkscrew.start && u < corkscrew.end) {
      const phase = corkscrewPhase(u);
      point.addScaledVector(right, corkscrew.radius * Math.sin(phase));
      point.addScaledVector(up, corkscrew.radius * (1 - Math.cos(phase)));
    }
    return point;
  };
  const rawPoint = (s) => {
    const distance = wrap(s, base.length);
    const point = districtOffset(distance, basePoint(distance));
    for (const run of runs) {
      const offset = distance - run.takeoff;
      if (offset < -340 || offset > run.blendEnd) continue;
      const weight =
        smooth((offset + 340) / 155) *
        (1 - smooth((offset - run.flatEnd) / (run.blendEnd - run.flatEnd)));
      const straight = run.anchor
        .clone()
        .addScaledVector(run.tangent, offset)
        .addScaledVector(run.up, riseAt(offset, run));
      point.lerp(straight, weight);
    }
    return point;
  };
  const physical = arcTable(rawPoint, base.length);
  const length = physical.length;
  const routeDistance = (u) => physical.distanceAt(base.distanceAt(u));
  const positionAt = (s) => rawPoint(physical.parameterAt(s));
  const tangentAt = (s) =>
    positionAt(s + 0.25)
      .sub(positionAt(s - 0.25))
      .normalize();
  const roadUpAt = (s, tangent) => {
    const b = physical.parameterAt(s);
    const up = orielInward(positionAt(s));
    for (const run of runs) {
      const offset = b - run.takeoff;
      const weight =
        smooth((offset + 300) / 125) *
        (1 - smooth((offset - run.flatEnd) / 200));
      if (weight > 0) up.lerp(run.up, weight).normalize();
    }
    up.addScaledVector(tangent, -up.dot(tangent)).normalize();
    return up.applyAxisAngle(tangent, corkscrewPhase(base.parameterAt(b)));
  };
  const sample = (s) => {
    const distance = wrap(s, length);
    const position = positionAt(distance);
    const tangent = tangentAt(distance);
    const up = roadUpAt(distance, tangent);
    const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
    up.crossVectors(tangent, right).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
    const u = base.parameterAt(physical.parameterAt(distance));
    const theta = TAU * u + corkscrewPhase(u);
    return {
      position,
      tangent,
      right,
      up,
      quaternion,
      curvature: tangentAt(distance + 1)
        .sub(tangentAt(distance - 1))
        .multiplyScalar(0.5)
        .dot(right),
      bank: theta,
      roll: theta,
    };
  };
  const jumps = runs.map((run) => ({
    id: run.id,
    takeoff: physical.distanceAt(run.takeoff),
    landingStart: physical.distanceAt(run.takeoff + run.gap),
    landingEnd: physical.distanceAt(run.takeoff + run.gap + run.landingLength),
    recovery: physical.distanceAt(
      run.takeoff + run.gap + run.landingLength + 20,
    ),
    halfWidth: ORIEL_WIDTH / 2,
    recoveryDelay: 1.5,
  }));
  const sectionDefinitions = [
    [
      'lakeside',
      'Lakeside Promenade',
      0,
      0.045,
      'Thread the promenade S-bends beside the lake, with the city curving overhead.',
    ],
    [
      'terraces',
      'Terrace Ascent',
      0.09,
      0.14,
      'Climb the inhabited inner wall and launch across the terrace break.',
    ],
    [
      'wall-gardens',
      'Hanging Gardens',
      0.23,
      0.32,
      'Climb the inner wall and spiral through the garden corkscrew.',
    ],
    [
      'ceiling',
      'Inverted Borough',
      0.39,
      0.49,
      'Race upside down above the lakeside district.',
    ],
    [
      'sunline',
      'Sunline Bow',
      0.58,
      0.665,
      'Leave the shell on a sweeping civic bow and cross its real transfer gap.',
    ],
    [
      'orchards',
      'Orchard Descent',
      0.79,
      0.85,
      'Dive back toward the inner landscape through open cultivated terraces.',
    ],
    [
      'waterside',
      'Waterside Return',
      0.91,
      0.96,
      'Reverse through the waterside S-bends and return to the starting promenade.',
    ],
  ];
  const sections = sectionDefinitions.map(
    ([id, name, u, showcase, description], i) => ({
      id,
      name,
      start: routeDistance(u),
      end:
        i === sectionDefinitions.length - 1
          ? length
          : routeDistance(sectionDefinitions[i + 1][2]),
      showcase: routeDistance(showcase),
      description,
      representative: true,
      banked: true,
      tunnel: false,
    }),
  );
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(30),
    bank: parked(routeDistance(0.29)),
    'bank-rest': parked(routeDistance(0.29)),
    'slope-rest': parked(routeDistance(0.12)),
    inverted: parked(routeDistance(0.49)),
    'corkscrew-entry': parked(routeDistance(0.285)),
    'corkscrew-quarter': parked(routeDistance(0.324)),
    'corkscrew-inverted': parked(routeDistance(0.3375)),
    'corkscrew-exit': parked(routeDistance(0.39)),
    'promenade-weave': parked(routeDistance(0.055)),
    'orchard-weave': parked(routeDistance(0.92)),
    'fast-corner': { ...parked(routeDistance(0.81)), speed: 85 },
    impact: { ...parked(90), lateral: 17, speed: 80, heading: 0.12 },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  for (const [i, jump] of jumps.entries()) {
    scenarios[`jump${i + 1}-approach`] = parked(jump.takeoff - 280);
    for (const [name, speed, heading] of [
      ['success', 112, 0],
      ['cruise70', 80, 0],
      ['boost70', 110, 0],
      ['short', 45, 0],
      ['lateral', 112, 0.27],
      ['long', 157, 0],
    ])
      scenarios[`jump${i + 1}-${name}`] = {
        ...parked(jump.takeoff - 0.7),
        speed,
        heading,
      };
  }
  const checkpoints = [
    0,
    ...sections.slice(1).map((s) => s.start),
    ...jumps.map((j) => j.landingStart),
  ]
    .sort((a, b) => a - b)
    .map((distance, index) => ({
      index,
      distance,
      s: distance,
      position: sample(distance).position,
      quaternion: sample(distance).quaternion,
    }));
  const bounds = new THREE.Box3();
  for (let s = 0; s < length; s += 5) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(ORIEL_WIDTH / 2 + 4);
  const isGap = (s) =>
    jumps.some(
      (jump) =>
        wrap(s, length) > jump.takeoff && wrap(s, length) < jump.landingStart,
    );
  const supportedRanges = [];
  let start = 0;
  for (const jump of jumps) {
    supportedRanges.push({ start, end: jump.takeoff });
    start = jump.landingStart;
  }
  supportedRanges.push({ start, end: length });
  const landmark = (u) => {
    const s = routeDistance(u);
    return { s, position: sample(s).position.toArray() };
  };
  const track = {
    id: 'oriel-inward-world-v1',
    name: 'Oriel',
    geometryVersion: 'oriel-cylindrical-circuit-v3-weaves-garden-corkscrew',
    challengeVersion: ORIEL_CHALLENGE_ID,
    aiLaneSpeedLimit: 16,
    length,
    width: ORIEL_WIDTH,
    habitat: ORIEL_HABITAT,
    groundY: -30,
    sample,
    sections,
    scenarios,
    checkpoints,
    jumps,
    bounds,
    isGap,
    supportedRanges,
    civicExclusions: [
      {
        id: 'garden-corkscrew',
        start: routeDistance(0.275),
        end: routeDistance(0.405),
      },
    ],
    windings: weaveDefinitions.map(({ id, start, end }) => ({
      id,
      start: routeDistance(start),
      end: routeDistance(end),
    })),
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    landmarks: {
      promenade: landmark(0.03),
      terraces: landmark(0.14),
      wallGardens: landmark(0.32),
      corkscrew: {
        ...landmark(0.3375),
        start: routeDistance(corkscrew.start),
        end: routeDistance(corkscrew.end),
        radius: corkscrew.radius,
      },
      ceiling: landmark(0.49),
      hub: landmark(0.665),
      orchards: landmark(0.85),
      return: landmark(0.96),
    },
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'oriel-production',
      summary:
        'Inhabited cylindrical world · winding promenade and orchard S-bends · full garden corkscrew · ceiling inversion · two real transfers',
    },
  };
  track.challenges = createOrielChallenges(track);
  track.sampleSurface = (distance, lateral) => {
    const bounds = orielRoadBounds(track, distance);
    if (!bounds) return null;
    const frame = sample(distance);
    return {
      ...frame,
      position: frame.position.clone().addScaledVector(frame.right, lateral),
      longitudinalMetric: Math.max(0.5, 1 - frame.curvature * lateral),
      lateralMetric: 1,
      longitudinalShear: 0,
      transverseCurvature: 0,
      bounds,
    };
  };
  for (const challenge of track.challenges.filter((c) => c.side > 0))
    scenarios[`${challenge.id}-approach`] = parked(challenge.start - 90);
  for (const state of Object.values(scenarios)) {
    if (state.speed !== 0) continue;
    const lane = orielRoadBounds(track, state.distance);
    if (lane) state.lateral = (lane.min + lane.max) / 2;
  }
  return track;
}
