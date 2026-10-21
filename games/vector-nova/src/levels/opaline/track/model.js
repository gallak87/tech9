import * as T from 'three';
import { cacheClosedCatmullRom } from '../../../track/cached-curve.js';
import { createOpalineSurfBanks, sampleOpalineSurfSurface } from './surf.js';
import { createClosedPointLookup } from './point-lookup.js';

export const OPALINE_REVISION = 'opaline-route-2-surf';
const WIDTH = 32;
const HORIZONTAL_LENGTH = 5960;
const wrap = (s, length) => ((s % length) + length) % length;
const smooth = (t) => {
  const x = T.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const PLAN = [
  [0, -850],
  [250, -850],
  [500, -850],
  [760, -850],
  [1000, -850],
  [1180, -700],
  [1230, -440],
  [1100, -230],
  [850, -140],
  [650, -50],
  [600, 170],
  [750, 370],
  [1040, 470],
  [1200, 680],
  [1120, 920],
  [850, 1030],
  [590, 1010],
  [360, 900],
  [120, 820],
  [-160, 820],
  [-440, 820],
  [-720, 820],
  [-950, 820],
  [-1150, 620],
  [-1130, 350],
  [-920, 170],
  [-710, 200],
  [-520, 70],
  [-650, -170],
  [-900, -340],
  [-980, -600],
  [-780, -820],
  [-500, -850],
  [-250, -850],
];

/** The mineral shelf itself is the route: all road and collision tops use these frames. */
export function createOpalineTrack() {
  const plan = new T.CatmullRomCurve3(
    PLAN.map(([x, z]) => new T.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  plan.arcLengthDivisions = 48000;
  const sourceArcs = plan.getLengths(48000);
  const sourceLength = sourceArcs.at(-1);
  const scale = HORIZONTAL_LENGTH / sourceLength;
  const at = cacheClosedCatmullRom(plan);
  const node = (index) => {
    const f = (index / PLAN.length) * 48000,
      i = Math.floor(f);
    return (
      T.MathUtils.lerp(
        sourceArcs[i],
        sourceArcs[Math.min(i + 1, 48000)],
        f - i,
      ) * scale
    );
  };
  const launchA = node(1) + 30;
  const launchB = node(19) + 130;
  const launches = [
    {
      id: 'porcelain-fracture',
      name: 'Porcelain Fracture',
      takeoff: launchA,
      gap: 88,
      end: launchA + 330,
    },
    {
      id: 'opal-crown-leap',
      name: 'Opal Crown Leap',
      takeoff: launchB,
      gap: 100,
      end: launchB + 350,
    },
  ];
  const heightKeys = [
    [0, 100, 0],
    [launchA - 100, 112, 0.12],
    [launchA, 124, Math.tan((7 * Math.PI) / 180)],
    [launchA + 88, 106, 0],
    [launchA + 330, 106, 0],
    [node(6), 72, -0.12],
    [node(8), 35, 0],
    [node(10), 28, 0],
    [node(12), 63, 0.16],
    [node(14), 112, 0.1],
    [node(16), 138, 0],
    [node(18), 142, 0],
    [launchB - 70, 145, 0.12],
    [launchB, 154, Math.tan((8 * Math.PI) / 180)],
    [launchB + 100, 132, 0],
    [launchB + 350, 132, 0],
    [node(24), 96, -0.1],
    [node(26), 62, 0],
    [node(28), 48, 0],
    [node(30), 75, 0.12],
    [node(32), 100, 0],
    [HORIZONTAL_LENGTH, 100, 0],
  ].sort((a, b) => a[0] - b[0]);
  function heightAt(h) {
    let i = 0;
    while (i < heightKeys.length - 2 && heightKeys[i + 1][0] < h) i++;
    const [a, ya, ma] = heightKeys[i],
      [b, yb, mb] = heightKeys[i + 1],
      t = (h - a) / (b - a);
    return (
      (2 * t ** 3 - 3 * t * t + 1) * ya +
      (t ** 3 - 2 * t * t + t) * (b - a) * ma +
      (-2 * t ** 3 + 3 * t * t) * yb +
      (t ** 3 - t * t) * (b - a) * mb
    );
  }
  function rawPoint(h) {
    const distance = wrap(h, HORIZONTAL_LENGTH);
    const point = new T.Vector3();
    for (let offset = -2; offset <= 2; offset++)
      point.addScaledVector(
        at(wrap(distance + offset * 20, HORIZONTAL_LENGTH) / HORIZONTAL_LENGTH),
        (3 - Math.abs(offset)) / 9,
      );
    point.multiplyScalar(scale);
    point.y = heightAt(distance);
    return point;
  }
  // Remap the independent plan/grade design to actual travelled metres.
  const count = Math.ceil(HORIZONTAL_LENGTH * 2),
    step = HORIZONTAL_LENGTH / count,
    arcs = [0],
    points = new Float64Array(count * 3);
  let previous = rawPoint(0);
  previous.toArray(points, 0);
  for (let i = 1; i <= count; i++) {
    const point = rawPoint(i * step);
    arcs.push(arcs.at(-1) + point.distanceTo(previous));
    if (i < count) point.toArray(points, i * 3);
    previous = point;
  }
  const length = arcs.at(-1);
  const routeDistance = (h) => {
    if (h >= HORIZONTAL_LENGTH) return length;
    const f = h / step,
      i = Math.floor(f);
    return T.MathUtils.lerp(arcs[i], arcs[i + 1], f - i);
  };
  const horizontalDistance = (s) => {
    const distance = wrap(s, length);
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arcs[mid] <= distance) lo = mid;
      else hi = mid;
    }
    return (lo + (distance - arcs[lo]) / (arcs[lo + 1] - arcs[lo])) * step;
  };
  // Keep exact authored arc lengths, but never repeat Catmull arc searches in
  // per-frame contact sampling. Cubic lookup retains the half-metre bake's shape.
  const pointAt = createClosedPointLookup(points, HORIZONTAL_LENGTH);
  const positionAt = (s) => pointAt(horizontalDistance(s));
  const tangentAt = (s) =>
    positionAt(s + 0.25)
      .sub(positionAt(s - 0.25))
      .normalize();
  function sample(s) {
    const distance = wrap(s, length),
      h = horizontalDistance(distance),
      tangent = tangentAt(distance);
    const right = new T.Vector3(tangent.z, 0, -tangent.x).normalize();
    const curvature = tangentAt(distance + 1)
      .sub(tangentAt(distance - 1))
      .multiplyScalar(0.5)
      .dot(right);
    const broadCurve = tangentAt(distance + 20)
      .sub(tangentAt(distance - 20))
      .multiplyScalar(1 / 40)
      .dot(right);
    let bank = T.MathUtils.clamp(-broadCurve * 24, -0.32, 0.32);
    for (const jump of launches)
      bank *=
        1 -
        smooth((h - (jump.takeoff - 100)) / 40) *
          (1 - smooth((h - jump.end) / 65));
    right.applyAxisAngle(tangent, bank);
    const up = new T.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(right, up, tangent),
    );
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
  const jumps = launches.map((j) => ({
    id: j.id,
    name: j.name,
    takeoff: routeDistance(j.takeoff),
    landingStart: routeDistance(j.takeoff + j.gap),
    landingEnd: routeDistance(j.end),
    recovery: routeDistance(j.end + 8),
    halfWidth: WIDTH / 2,
    launchAlignment: 100,
  }));
  const definitions = [
    ['causeway', 'Porcelain Fracture', 0, node(5), 70],
    ['spillway', 'Iridescent Spillways', node(5), node(10), node(7) + 30],
    ['basin', 'The Low Basin', node(10), node(13), node(11)],
    ['veil', 'The Translucent Veil', node(13), node(18), node(15)],
    ['crown', 'Opal Crown', node(18), node(23), launchB - 95],
    ['folds', 'Folded Galleries', node(23), node(28), node(25)],
    ['return', 'Daybreak Terraces', node(28), HORIZONTAL_LENGTH, node(31)],
  ];
  const sections = definitions.map(([id, name, start, end, showcase]) => ({
    id,
    name,
    start: routeDistance(start),
    end: routeDistance(end),
    showcase: routeDistance(showcase),
  }));
  const constructedIntervals = [
    { id: 'arrival-causeway', start: 0, end: routeDistance(launchA - 90) },
    {
      id: 'basin-bridge',
      start: routeDistance(node(9) + 25),
      end: routeDistance(node(10) + 55),
    },
    {
      id: 'veil-access',
      start: routeDistance(node(13) - 55),
      end: routeDistance(node(13) + 45),
    },
    {
      id: 'return-bridge',
      start: routeDistance(node(28) + 35),
      end: routeDistance(node(29) + 25),
    },
    { id: 'finish-causeway', start: routeDistance(node(33)), end: length },
  ];
  const surgeZones = [
    {
      id: 'spillway-crosscurrent',
      kind: 'cross',
      start: routeDistance(node(7) - 40),
      end: routeDistance(node(8) + 40),
      side: -1,
      phaseOffset: 0,
    },
    {
      id: 'basin-tailcurrent',
      kind: 'along',
      start: routeDistance(node(11) - 55),
      end: routeDistance(node(12) + 35),
      side: -1,
      phaseOffset: 4.5,
    },
    {
      id: 'veil-crosscurrent',
      kind: 'cross',
      start: routeDistance(node(15) - 55),
      end: routeDistance(node(16) + 40),
      side: -1,
      phaseOffset: 8,
    },
    {
      id: 'terrace-tailcurrent',
      kind: 'along',
      start: routeDistance(node(30) - 45),
      end: routeDistance(node(31) + 20),
      side: 1,
      phaseOffset: 2,
    },
  ];
  const checkpointDistances = [
    0,
    ...sections.slice(1).map((s) => s.start),
  ].filter((s) => !jumps.some((j) => s > j.takeoff && s <= j.recovery));
  checkpointDistances.push(...jumps.map((j) => j.landingStart));
  checkpointDistances.sort((a, b) => a - b);
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(35),
    impact: { distance: 75, speed: 80, lateral: 12, heading: 0.08 },
    'bank-rest': parked(routeDistance(node(7))),
    'surf-approach': {
      distance: jumps[0].landingStart + 100,
      lateral: 8,
      speed: 65,
      heading: 0,
    },
    'surf-return': { distance: 720, lateral: 28, speed: 65, heading: 0 },
    'slope-rest': parked(routeDistance(node(12))),
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  for (const [i, jump] of jumps.entries()) {
    scenarios[`jump-${i + 1}-approach`] = {
      ...parked(jump.takeoff - 140),
      speed: 90,
    };
    scenarios[`jump-${i + 1}-clean`] = {
      ...parked(jump.takeoff - 2),
      speed: 102,
    };
    scenarios[`jump-${i + 1}-short`] = {
      ...parked(jump.takeoff - 2),
      speed: 40,
    };
    scenarios[`jump-${i + 1}-landing`] = parked(jump.landingStart + 100);
  }
  const bounds = new T.Box3();
  for (let s = 0; s < length; s += 5) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(WIDTH / 2);
  const track = {
    id: 'opaline-divide-1',
    name: 'Opaline Divide',
    geometryVersion: OPALINE_REVISION,
    revision: OPALINE_REVISION,
    length,
    width: WIDTH,
    closed: true,
    groundY: -85,
    sample,
    sections,
    checkpoints,
    scenarios,
    jumps,
    surgeZones,
    constructedIntervals,
    surfBanks: createOpalineSurfBanks({ jumps, constructedIntervals }),
    bounds,
    boundaryIntervals: [],
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    landmarks: {
      veil: {
        start: routeDistance(node(14)),
        end: routeDistance(node(17)),
        distance: routeDistance(node(15)),
        side: 1,
      },
      basin: {
        distance: routeDistance(node(11)),
        center: sample(routeDistance(node(11))).position.toArray(),
        waterY: -18,
      },
      crown: {
        distance: jumps[1].takeoff,
        start: jumps[1].takeoff - 140,
        end: jumps[1].landingEnd,
      },
      station: { distance: 0 },
    },
    review: {
      kind: 'bare-track',
      phase: 'production',
      summary:
        '6 km · mineral spillways · translucent river wall · two fractured terraces',
    },
    isGap(s) {
      const d = wrap(s, length);
      return jumps.some((j) => d > j.takeoff && d < j.landingStart);
    },
  };
  track.sampleSurface = (distance, lateral = 0) =>
    sampleOpalineSurfSurface(track, distance, lateral);
  return track;
}
