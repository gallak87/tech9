import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

export const smooth = (v) => {
  const t = T.MathUtils.clamp(v, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
const windowAt = (h, start, end, fade = 80) =>
  smooth((h - start) / fade) * (1 - smooth((h - end) / fade));
const SOURCE_LENGTH = 6100;
export const COLOSSUS_PACE = Object.freeze({
  cruiseScale: 1.12,
  boostScale: 1.08,
  aerodynamicDragScale: 0.75,
  overspeedDeceleration: 0.7,
});

/** Authored horizontal stations, reparameterized to physical 3D metres. */
export function createColossusTrack() {
  const definitions = [
    {
      id: 'die-transfer',
      label: 'Broken Die Transfer',
      h: 1720,
      gap: 140,
      drop: 65,
      receiving: 400,
    },
    {
      id: 'gantry-flight',
      label: 'Gantry Flight',
      h: 4150,
      gap: 240,
      drop: 160,
      receiving: 610,
      hero: true,
    },
    {
      id: 'dispatch-cut',
      label: 'Dispatch Cut',
      h: 5530,
      gap: 110,
      drop: 45,
      receiving: 340,
    },
  ];
  const rolls = [
    { id: 'screw-feed', start: 280, end: 1000, peak: 1.8, reverse: -0.65 },
    { id: 'reverse-auger', start: 3290, end: 3970, peak: -1.8, reverse: 0.65 },
  ];
  const turns = [
    [0, 250, -0.5],
    [250, 1000, 2.05],
    [2260, 2500, 1.8],
    [2540, 2790, -1.1],
    [2800, 3010, 1.45],
    [3040, 3290, -0.8],
    [3350, 3950, 2.5],
    [5000, 5220, -0.9],
    [5220, 5410, 1.2],
  ];
  const headingAt = (h) =>
    turns.reduce(
      (angle, [a, b, turn]) => angle + turn * smooth((h - a) / (b - a)),
      0,
    );
  const alignment = (h, j) =>
    windowAt(h, j.h - 160, j.h + j.gap + j.receiving - 80, 80);
  // Wider transitions retain each grade window's integral, preserving the
  // approved world positions and pitches of all transfer approaches/landings.
  const gradeAt = (h) => {
    let grade =
      0.04 +
      0.76 * windowAt(h, 2280, 2510, 160) -
      0.46 * windowAt(h, 3310, 3720, 200);
    for (const j of definitions)
      grade = T.MathUtils.lerp(grade, 0.18, alignment(h, j));
    return grade * (1 - smooth((h - 5980) / 120));
  };
  const step = 0.5,
    descentCount = SOURCE_LENGTH / step;
  const positions = [new T.Vector3()];
  let y = 0;
  for (let i = 1; i <= descentCount; i++) {
    const h = (i - 0.5) * step,
      heading = headingAt(h);
    y -= gradeAt(h) * step;
    const p = positions[i - 1].clone();
    p.x += Math.sin(heading) * step;
    p.z += Math.cos(heading) * step;
    p.y =
      y -
      definitions.reduce(
        (sum, j) => sum + j.drop * smooth((i * step - j.h) / j.gap),
        0,
      );
    positions.push(p);
  }
  const lift = 160 - positions.at(-1).y;
  positions.forEach((p) => {
    p.y += lift;
  });
  // The compact upper works hug the intake rather than making a second long
  // outward journey. Tangent joins preserve a physically continuous lap seam.
  const v = (...xyz) => new T.Vector3(...xyz);
  const nodes = [
    {
      p: positions.at(-1).clone(),
      d: v(
        Math.sin(headingAt(SOURCE_LENGTH)),
        0,
        Math.cos(headingAt(SOURCE_LENGTH)),
      ),
      handle: 160,
    },
    {
      p: v(-500, 260, 1280),
      d: v(-1, 0.3, -0.1),
      handle: 150,
      id: 'counterweight',
    },
    { p: v(-780, 510, 700), d: v(-0.1, 0.5, -1), handle: 260, id: 'cooling' },
    {
      p: v(-450, positions[0].y + 70, 100),
      d: v(0.2, 0.35, -1),
      handle: 220,
      id: 'crown',
    },
    {
      p: v(-300, positions[0].y + 100, -280),
      d: v(0.6, -0.1, -0.8),
      handle: 130,
      id: 'headstock',
    },
    { p: v(-70, positions[0].y + 17, -310), d: v(0.8, -0.08, 0.7), handle: 80 },
    { p: positions[0].clone(), d: v(0, -0.04, 1), handle: 120 },
  ];
  const returnStations = { rise: SOURCE_LENGTH };
  for (let segment = 0; segment < nodes.length - 1; segment++) {
    const a = nodes[segment],
      b = nodes[segment + 1];
    const curve = new T.CubicBezierCurve3(
      a.p,
      a.p.clone().addScaledVector(a.d.clone().normalize(), a.handle),
      b.p.clone().addScaledVector(b.d.clone().normalize(), -b.handle),
      b.p,
    );
    curve.arcLengthDivisions = 1200;
    const rows = Math.ceil(curve.getLength() / step);
    for (let i = 1; i <= rows; i++) positions.push(curve.getPointAt(i / rows));
    if (b.id) returnStations[b.id] = (positions.length - 1) * step;
  }
  // Give the upper works one sustained climb and one broad crest. Author its
  // elevation by planar distance so short Bezier handles cannot insert extra
  // pitch waves at the counterweight, cooling and headstock bends. The quintic
  // joins have zero vertical curvature; the final slope matches the intake.
  const returnStart = SOURCE_LENGTH / step;
  const planar = new Float64Array(positions.length);
  for (let i = returnStart + 1; i < positions.length; i++)
    planar[i] =
      planar[i - 1] +
      Math.hypot(
        positions[i].x - positions[i - 1].x,
        positions[i].z - positions[i - 1].z,
      );
  const crestIndex = Math.round(
    (returnStations.crown +
      0.58 * (returnStations.headstock - returnStations.crown)) /
      step,
  );
  const crestAt = planar[crestIndex],
    crestY = positions[0].y + 115,
    endAt = planar.at(-1),
    startY = positions[returnStart].y,
    endY = positions[0].y;
  for (let i = returnStart; i < positions.length; i++) {
    const s = planar[i];
    if (s <= crestAt)
      positions[i].y = T.MathUtils.lerp(startY, crestY, smooth(s / crestAt));
    else {
      const t = (s - crestAt) / (endAt - crestAt);
      const endSlopeBasis = t * t * t * (-4 + t * (7 - 3 * t));
      positions[i].y =
        T.MathUtils.lerp(crestY, endY, smooth(t)) -
        0.04 * (endAt - crestAt) * endSlopeBasis;
    }
  }
  const count = positions.length - 1;
  const arcs = new Float64Array(count + 1);
  for (let i = 1; i <= count; i++)
    arcs[i] = arcs[i - 1] + positions[i].distanceTo(positions[i - 1]);
  const length = arcs[count];
  const wrap = (s) => T.MathUtils.euclideanModulo(s, length);
  const distanceAt = (h) => {
    const f = T.MathUtils.clamp(h / step, 0, count),
      i = Math.min(count - 1, Math.floor(f));
    return T.MathUtils.lerp(arcs[i], arcs[i + 1], f - i);
  };
  const sourceAt = (distance) => {
    const d = wrap(distance);
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arcs[mid] <= d) lo = mid;
      else hi = mid;
    }
    return step * (lo + (d - arcs[lo]) / (arcs[hi] - arcs[lo]));
  };
  const positionAt = (s) => {
    const f = sourceAt(s) / step,
      i = Math.min(count - 1, Math.floor(f));
    return positions[i].clone().lerp(positions[i + 1], f - i);
  };
  const tangentAt = (s) =>
    positionAt(s + 0.6)
      .sub(positionAt(s - 0.6))
      .normalize();
  const fc = Math.ceil(length / 2),
    fs = length / fc;
  const refs = createReferenceFrames(
    Array.from({ length: fc + 1 }, (_, i) => tangentAt(i * fs)),
    fs,
    true,
  );
  const rollAt = (h) => {
    // A finite look-ahead blends banking across authored curve joins and the
    // lap seam, even where their second derivatives differ.
    const s = distanceAt(h),
      a = tangentAt(s - 12),
      b = tangentAt(s + 12);
    let bank = -T.MathUtils.clamp(
      (Math.atan2(b.x * a.z - b.z * a.x, b.x * a.x + b.z * a.z) * 55) / 12,
      -0.9,
      0.9,
    );
    for (const j of definitions) bank *= 1 - alignment(h, j);
    const r = rolls.find((entry) => h >= entry.start && h <= entry.end);
    if (!r) return bank;
    const t = (h - r.start) / (r.end - r.start);
    const twist =
      r.peak * smooth(t / 0.4) +
      (r.reverse - r.peak) * smooth((t - 0.4) / 0.4) -
      r.reverse * smooth((t - 0.8) / 0.2);
    // Wall ride, unwind, counter-bank: no full rotation or abrupt roll entry.
    return T.MathUtils.lerp(
      bank,
      twist,
      smooth(t / 0.15) * smooth((1 - t) / 0.15),
    );
  };
  function sample(s) {
    const d = wrap(s),
      f = d / fs,
      i = Math.min(fc - 1, Math.floor(f));
    const tangent = tangentAt(d),
      roll = rollAt(sourceAt(d));
    const right = new T.Vector3(1, 0, 0).applyQuaternion(
      refs[i].clone().slerp(refs[i + 1], f - i),
    );
    right
      .addScaledVector(tangent, -right.dot(tangent))
      .normalize()
      .applyAxisAngle(tangent, roll);
    const up = tangent.clone().cross(right).normalize(),
      position = positionAt(d);
    return {
      position,
      tangent,
      right,
      up,
      roll,
      bank: Math.atan2(Math.sin(roll), Math.cos(roll)),
      curvature: tangentAt(d + 1)
        .sub(tangentAt(d - 1))
        .multiplyScalar(0.5)
        .dot(right),
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
    };
  }
  // The rigid crosshead needs a clear transverse sweep. Keep the first station
  // past the changing bank at the bottom hook, on the steady upper climb.
  const ejectorStations = [
    returnStations.rise + 1000,
    returnStations.crown + 80,
  ];
  // Flat work beds; banking and the selected reversing rolls belong to the route frame.
  const profileAt = () => ({ halfWidth: 36, depth: 0 });
  const surfacePoint = (s, lateral) => {
    const f = sample(s),
      { halfWidth, depth } = profileAt(s);
    return f.position
      .addScaledVector(f.right, lateral)
      .addScaledVector(f.up, depth * (lateral / halfWidth) ** 2);
  };
  function surfaceGeometry(s, lateral = 0) {
    const f = sample(s),
      p = profileAt(s);
    const rightDerivative = f.right
      .clone()
      .addScaledVector(f.up, (2 * p.depth * lateral) / p.halfWidth ** 2);
    const lateralMetric = rightDerivative.length(),
      right = rightDerivative.normalize();
    const ds = 0.25;
    const along = surfacePoint(s + ds, lateral)
      .sub(surfacePoint(s - ds, lateral))
      .divideScalar(ds * 2);
    // Clamp-end queries retain a usable forward frame.
    if (along.lengthSq() < 0.1) along.copy(f.tangent);
    const longitudinalShear = along.dot(right);
    const tangent = along.addScaledVector(right, -longitudinalShear);
    const longitudinalMetric = tangent.length();
    tangent.normalize();
    const up = tangent.clone().cross(right).normalize();
    return {
      ...f,
      position: surfacePoint(s, lateral),
      right,
      tangent,
      up,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      longitudinalMetric,
      lateralMetric,
      longitudinalShear,
      transverseCurvature:
        (2 * p.depth) / p.halfWidth ** 2 / lateralMetric ** 3,
      bounds: {
        min: -p.halfWidth,
        max: p.halfWidth,
        minDerivative: 0,
        maxDerivative: 0,
      },
      period: 0,
      viewBlend: 0,
      hullInsetScale: 1,
    };
  }
  function sampleSurface(s, lateral = 0) {
    const geometry = surfaceGeometry(s, lateral);
    const delta = 1;
    const before = surfaceGeometry(s - delta, lateral),
      after = surfaceGeometry(s + delta, lateral);
    // The inside of a twisting chute follows a different curve from its
    // centreline. Use that actual lane for steering and lateral-force guidance.
    const curvature = after.tangent
      .sub(before.tangent)
      .multiplyScalar(1 / (2 * delta * geometry.longitudinalMetric))
      .dot(geometry.right);
    return { ...geometry, curvature };
  }
  const jumps = definitions.map((j) => ({
    id: j.id,
    label: j.label,
    hero: Boolean(j.hero),
    takeoff: distanceAt(j.h),
    landingStart: distanceAt(j.h + j.gap),
    landingEnd: distanceAt(j.h + j.gap + j.receiving),
    recovery: distanceAt(j.h + j.gap + j.receiving - 40),
    halfWidth: 36,
    targetSpeed: j.hero ? 155 : 140,
    launchAlignment: 140,
  }));
  const sectionDefs = [
    ['intake', 'Intake Bend', 0],
    ['screw', 'Screw Feed Wall Roll', 250],
    ['press', 'The Forge Cycle', 1020],
    ['die', 'Broken Die Transfer', 1590],
    ['dive', 'Discharge Dive', 2260],
    ['crossfeed', 'Crossfeed Belts', 2700],
    ['auger', 'Reverse Auger', 3330],
    ['gantry', 'Gantry Flight', 3980],
    ['return', 'Counterweight Reversals', 5000],
    ['dispatch', 'Dispatch Cut', 5410],
    ['dispatch-rise', 'Dispatch Reversal', 5980],
    ['rise', 'Counterweight Ascent', returnStations.rise],
    ['counterweight', 'Outer Works Climb', returnStations.counterweight],
    ['cooling', 'Cooling Drum Reversals', returnStations.cooling],
    ['crown', 'Crown Feed', returnStations.crown],
    ['headstock', 'Headstock Hairpin', returnStations.headstock],
  ];
  const sections = sectionDefs.map(([id, name, h], i) => ({
    id,
    name,
    start: distanceAt(h),
    end:
      i + 1 < sectionDefs.length ? distanceAt(sectionDefs[i + 1][2]) : length,
    showcase: distanceAt(h + 100),
    representative: true,
  }));
  const presses = [1180, 1340, 1500].map((h, i) => ({
    id: 'press-' + (i + 1),
    distance: distanceAt(h),
    lateral: i % 2 ? -12 : 12,
    width: 45,
    depth: 28,
    height: 10,
    phaseOffset: i * 1.43,
  }));
  const belts = [
    [2800, 2950, 1],
    [3110, 3260, -1],
    [
      returnStations.counterweight + 180,
      returnStations.counterweight + 340,
      -1,
    ],
    [returnStations.cooling + 180, returnStations.cooling + 340, 1],
  ].map(([a, b, side], i) => ({
    id: 'crossfeed-' + (i + 1),
    start: distanceAt(a),
    end: distanceAt(b),
    side,
  }));
  const ejectors = ejectorStations.map((h, i) => ({
    id: 'ejector-' + (i + 1),
    distance: distanceAt(h),
    side: i ? -1 : 1,
    width: 12,
    height: 18,
    depth: 30,
    phaseOffset: i * 3.4,
    openingStart: distanceAt(h - 48),
    openingEnd: distanceAt(h + 72),
  }));
  const scenarios = {
    staging: { distance: 0, speed: 0 },
    inspection: { distance: 25, speed: 0 },
    'ejector-approach': {
      distance: ejectors[0].distance - 220,
      speed: 100,
      time: 0.5,
    },
    'ejector-showcase': {
      distance: ejectors[0].distance - 90,
      speed: 0,
      time: 3.05,
    },
    'ejector-two-approach': {
      distance: ejectors[1].distance - 240,
      speed: 100,
      time: 6,
    },
    'press-impact': {
      distance: presses[0].distance - 42,
      lateral: presses[0].lateral,
      speed: 105,
      time: 1.45,
    },
    'ejector-impact': {
      distance: ejectors[0].distance - 55,
      lateral: 0,
      speed: 105,
      time: 0.84,
    },
    'press-approach': { distance: distanceAt(1030), speed: 95, time: 0 },
    'crossfeed-approach': { distance: distanceAt(2700), speed: 110 },
    'screw-approach': { distance: distanceAt(250), speed: 115 },
    'auger-approach': { distance: distanceAt(3310), speed: 115 },
    'dive-approach': { distance: distanceAt(2260), speed: 120 },
    'finish-approach': { distance: length - 250, speed: 130 },
    'rise-approach': { distance: distanceAt(returnStations.rise), speed: 115 },
    'cooling-approach': {
      distance: distanceAt(returnStations.cooling),
      speed: 110,
    },
    'headstock-approach': {
      distance: distanceAt(returnStations.headstock) - 100,
      speed: 110,
    },
  };
  for (const j of jumps) {
    scenarios[j.id + '-approach'] = {
      distance: j.takeoff - 190,
      speed: 115,
      lateral: 0,
      heading: 0,
    };
    scenarios[j.id + '-launch'] = {
      distance: j.takeoff - 0.1,
      speed: j.targetSpeed,
      lateral: 0,
      heading: 0,
    };
  }
  for (const section of sections)
    scenarios[section.id + '-showcase'] = {
      distance: section.showcase,
      speed: 0,
    };
  const checkpoints = [
    0,
    ...jumps.map((j) => j.landingStart),
    ...['counterweight', 'cooling', 'crown', 'headstock'].map((id) =>
      distanceAt(returnStations[id]),
    ),
  ].map((distance, index) => ({
    distance,
    s: distance,
    index,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new T.Box3();
  for (let s = 0; s <= length; s += 8) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(60);
  const isGap = (s) =>
    jumps.some((j) => wrap(s) > j.takeoff && wrap(s) < j.landingStart);
  const runs = [];
  let start = 0;
  for (const jump of jumps) {
    runs.push({ start, end: jump.takeoff });
    start = jump.landingStart;
  }
  runs.push({ start, end: length });
  return {
    id: 'colossus-circuit',
    name: 'Colossus Works',
    geometryVersion: 'colossus-flat-circuit-v7',
    closed: true,
    width: 72,
    length,
    groundY: 0,
    pace: COLOSSUS_PACE,
    sample,
    sampleSurface,
    surfacePoint,
    profileAt,
    sourceAt,
    distanceAt,
    jumps,
    sections,
    scenarios,
    checkpoints,
    bounds,
    isGap,
    runs,
    presses,
    belts,
    ejectors,
    deviceProjection: 'rendered-surface',
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    // Physical rim geometry is authored with the sheet; no invisible upright fences.
    boundaryIntervals: [],
    rolls: rolls.map((r) => ({
      ...r,
      start: distanceAt(r.start),
      end: distanceAt(r.end),
    })),
    showcases: sections.map((s) => ({
      id: s.id,
      name: s.name,
      distance: s.showcase,
    })),
    review: {
      kind: 'bare-track',
      description:
        'A compact factory circuit: two reversing wall rolls, three transfers, presses, crossfeed belts and a climbing return through the upper works.',
    },
  };
}
