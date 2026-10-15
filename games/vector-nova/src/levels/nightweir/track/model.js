import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 44;
const clamp = T.MathUtils.clamp;
const smooth = (v) => {
  const t = clamp(v, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
export const NIGHTWEIR_PACE = Object.freeze({
  cruiseScale: 1.2,
  boostScale: 1.12,
  aerodynamicDragScale: 0.65,
  overspeedDeceleration: 0.6,
});

// Occupied stormwater terraces drop toward a working harbor. Reversing banks
// stay continuous between short launch and recovery windows.
export function createNightweirTrack() {
  const points = [
    [-450, -450],
    [0, -650],
    [360, -400],
    [220, -80],
    [-120, 160],
    [-430, 400],
    [-250, 700],
    [150, 620],
    [470, 900],
    [320, 1210],
    [-50, 1340],
    [-400, 1180],
    [-660, 1480],
    [-460, 1780],
    [-180, 1880],
    [130, 1660],
    [440, 1900],
    [590, 2240],
    [330, 2490],
    [10, 2360],
    [-280, 2590],
    [-540, 2890],
    [-290, 3180],
    [80, 3010],
    [450, 3240],
    [670, 3560],
    [390, 3840],
    [150, 3620],
    [-180, 3900],
    [-460, 4080],
    [-280, 4410],
    [40, 4630],
    [410, 4450],
    [730, 4680],
    [500, 5010],
    [180, 5180],
    [-120, 5020],
    [-360, 5380],
    [-110, 5730],
    [200, 5550],
    [570, 5880],
    [780, 6200],
    [480, 6540],
    [150, 6420],
    [-160, 6750],
    [-360, 7020],
    [-80, 7340],
    [250, 7560],
    [600, 7400],
    [930, 7710],
    [710, 8050],
    [430, 8260],
    [40, 8410],
  ].map(([x, z]) => new T.Vector3(x * 0.6, 0, z * 0.6));
  const curve = new T.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = 64000;
  curve.updateArcLengths();
  const sourceLength = curve.getLength();
  const at = (fraction) => sourceLength * fraction;
  const curveTangent = (h) =>
    curve.getTangentAt(clamp(h / sourceLength, 0, 1)).normalize();
  const definitions = [
    {
      id: 'upper-lock',
      label: 'Upper Lock',
      h: at(0.055),
      gap: 42,
      drop: 10,
      receiving: 190,
    },
    {
      id: 'terrace-cut',
      label: 'Terrace Cut',
      h: at(0.197),
      gap: 60,
      drop: 16,
      receiving: 230,
    },
    {
      id: 'spillway-leap',
      label: 'Great Spillway',
      h: at(0.309),
      gap: 110,
      drop: 50,
      receiving: 410,
      hero: true,
    },
    {
      id: 'market-cut',
      label: 'Market Cut',
      h: at(0.434),
      gap: 45,
      drop: 12,
      receiving: 210,
    },
    {
      id: 'turbine-leap',
      label: 'Turbine Leap',
      h: at(0.565),
      gap: 90,
      drop: 38,
      receiving: 350,
      hero: true,
    },
    {
      id: 'canal-shear',
      label: 'Canal Shear',
      h: at(0.666),
      gap: 65,
      drop: 20,
      receiving: 260,
    },
    {
      id: 'low-weir',
      label: 'Low Weir',
      h: at(0.778),
      gap: 50,
      drop: 16,
      receiving: 230,
    },
    {
      id: 'harbor-leap',
      label: 'Harbor Leap',
      h: at(0.881),
      gap: 105,
      drop: 45,
      receiving: 400,
      hero: true,
    },
  ];
  const alignment = (h, j) => {
    const q = h - j.h;
    return (
      smooth((q + 135) / 100) *
      (1 - smooth((q - j.gap - j.receiving + 35) / 135))
    );
  };
  // Integrate heading at unit distance instead of snapping positions back to
  // the old curve after each receiver. That avoids a hidden hairpin at its end.
  const routeStep = 0.5;
  const horizontal = [points[0].clone()];
  let heading = Math.atan2(curveTangent(0).z, curveTangent(0).x);
  let heldHeading = heading,
    heldJump = null;
  for (let i = 1; i <= Math.ceil(sourceLength / routeStep); i++) {
    const h = (i - 0.5) * routeStep;
    const jump = definitions.find(
      (j) => h >= j.h - 35 && h <= j.h + j.gap + j.receiving - 30,
    );
    if (jump && jump !== heldJump) heldHeading = heading;
    const tangent = curveTangent(h);
    // Follow the authored lobe after each receiver without position snapping.
    const guide = curve.getPointAt(clamp((h + 75) / sourceLength, 0, 1));
    const toward = guide.sub(horizontal[i - 1]).normalize();
    tangent.lerp(toward, 0.9).normalize();
    const target = jump ? heldHeading : Math.atan2(tangent.z, tangent.x);
    const difference = Math.atan2(
      Math.sin(target - heading),
      Math.cos(target - heading),
    );
    // Ease the final receiving quay into a tangent braking runout.
    const receivingQuay = 1 - smooth((h - sourceLength + 950) / 300);
    heading +=
      clamp(difference * 0.018, -0.008, 0.008) * routeStep * receivingQuay;
    horizontal.push(
      horizontal[i - 1]
        .clone()
        .add(
          new T.Vector3(
            Math.cos(heading) * routeStep,
            0,
            Math.sin(heading) * routeStep,
          ),
        ),
    );
    heldJump = jump;
  }
  const horizontalPoint = (h) => {
    const f = clamp(h, 0, sourceLength) / routeStep,
      i = Math.floor(f);
    return horizontal[i]
      .clone()
      .lerp(horizontal[Math.min(horizontal.length - 1, i + 1)], f - i);
  };
  const chutes = [
    [0.074, 0.102],
    [0.166, 0.188],
    [0.227, 0.25],
    [0.375, 0.402],
    [0.49, 0.516],
    [0.56, 0.593],
    [0.653, 0.675],
    [0.812, 0.837],
    [0.941, 0.966],
  ].map(([a, b]) => [at(a), at(b)]);
  const gradeAt = (h) => {
    let grade = 0.19 + 0.085 * Math.sin(h / 175 + 0.7);
    for (const [a, b] of chutes)
      grade += 0.26 * smooth((h - a) / 65) * (1 - smooth((h - b) / 65));
    for (const j of definitions)
      grade = T.MathUtils.lerp(grade, 0.18, alignment(h, j));
    return grade;
  };
  const heightStep = 0.5,
    heights = [0];
  for (let i = 1; i <= Math.ceil(sourceLength / heightStep); i++)
    heights.push(heights[i - 1] - gradeAt((i - 0.5) * heightStep) * heightStep);
  const verticalOffset =
    -heights.at(-1) + definitions.reduce((v, j) => v + j.drop, 0) + 90;
  for (let i = 0; i < heights.length; i++) heights[i] += verticalOffset;
  const heightAt = (h) => {
    const f = clamp(h, 0, sourceLength) / heightStep,
      i = Math.floor(f);
    return (
      T.MathUtils.lerp(
        heights[i],
        heights[Math.min(heights.length - 1, i + 1)],
        f - i,
      ) -
      definitions.reduce(
        (sum, j) => sum + j.drop * smooth((h - j.h) / j.gap),
        0,
      )
    );
  };
  const rawPoint = (h) => {
    const p = horizontalPoint(h);
    p.y = heightAt(h);
    return p;
  };
  const n = Math.ceil(sourceLength * 2),
    step = sourceLength / n,
    arcs = new Float64Array(n + 1);
  let last = rawPoint(0);
  for (let i = 1; i <= n; i++) {
    const p = rawPoint(i * step);
    arcs[i] = arcs[i - 1] + p.distanceTo(last);
    last = p;
  }
  const length = arcs[n];
  const distanceAt = (h) => {
    const f = clamp(h, 0, sourceLength) / step,
      i = Math.min(n - 1, Math.floor(f));
    return T.MathUtils.lerp(arcs[i], arcs[i + 1], f - i);
  };
  const sourceAt = (s) => {
    const d = clamp(s, 0, length);
    let lo = 0,
      hi = n;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (arcs[m] <= d) lo = m;
      else hi = m;
    }
    return (lo + (d - arcs[lo]) / (arcs[hi] - arcs[lo])) * step;
  };
  const positionAt = (s) => rawPoint(sourceAt(s));
  const tangentAt = (s) =>
    positionAt(Math.min(length, s + 0.15))
      .sub(positionAt(Math.max(0, s - 0.15)))
      .normalize();
  const rollStart = at(0.103),
    rollEnd = at(0.17);
  const rollDefs = [
    { id: 'aqueduct', start: rollStart, end: rollEnd, turns: 1 },
    { id: 'turbine', start: at(0.479), end: at(0.538), turns: -1 },
    { id: 'harbor', start: at(0.809), end: at(0.85), turns: 1 },
  ];
  const rollAt = (h) => {
    const before = horizontalPoint(Math.max(0, h - 40));
    const center = horizontalPoint(h);
    const after = horizontalPoint(Math.min(sourceLength, h + 40));
    const incoming = center.clone().sub(before).normalize();
    const outgoing = after.clone().sub(center).normalize();
    const turn = Math.atan2(
      incoming.x * outgoing.z - incoming.z * outgoing.x,
      incoming.dot(outgoing),
    );
    // Bank follows each tightening/reversing bend; leave a readable level lip.
    let bank = clamp(turn * 1.65, -0.88, 0.88);
    for (const j of definitions) bank *= 1 - alignment(h, j);
    const corkscrew = rollDefs.reduce(
      (sum, r) =>
        sum + r.turns * 2 * Math.PI * smooth((h - r.start) / (r.end - r.start)),
      0,
    );
    return bank + corkscrew;
  };
  const fc = Math.ceil(length / 2),
    fs = length / fc;
  const refs = createReferenceFrames(
    Array.from({ length: fc + 1 }, (_, i) => tangentAt(i * fs)),
    fs,
    false,
  );
  function sample(s) {
    const d = clamp(s, 0, length),
      f = d / fs,
      i = Math.min(fc - 1, Math.floor(f));
    const ref = refs[i].clone().slerp(refs[i + 1], f - i),
      tangent = tangentAt(d),
      roll = rollAt(sourceAt(d));
    const right = new T.Vector3(1, 0, 0).applyQuaternion(ref);
    right
      .addScaledVector(tangent, -right.dot(tangent))
      .normalize()
      .applyAxisAngle(tangent, roll);
    const up = tangent.clone().cross(right).normalize(),
      position = positionAt(d);
    if (s < 0) position.addScaledVector(tangent, Math.max(-100, s));
    return {
      position,
      tangent,
      right,
      up,
      roll,
      bank: Math.atan2(Math.sin(roll), Math.cos(roll)),
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      curvature: tangentAt(Math.min(length, d + 1))
        .sub(tangentAt(Math.max(0, d - 1)))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const jumps = definitions.map((j) => ({
    id: j.id,
    label: j.label,
    hero: !!j.hero,
    takeoff: distanceAt(j.h),
    landingStart: distanceAt(j.h + j.gap),
    landingEnd: distanceAt(j.h + j.gap + j.receiving),
    recovery: distanceAt(j.h + j.gap + j.receiving - 45),
    halfWidth: WIDTH / 2,
    targetSpeed: j.hero ? 160 : 145,
    launchAlignment: 110,
  }));
  const finishDistance = length - 650;
  const sectionDefs = [
    ['reservoir', 'Reservoir Crown', 0],
    ['aqueduct', 'Aqueduct Corkscrew', at(0.1)],
    ['terraces', 'The Inhabited Terraces', at(0.175)],
    ['spillway', 'Great Spillway', at(0.27)],
    ['market', 'Sluice Market', at(0.36)],
    ['turbine', 'Turbine Corkscrew', at(0.478)],
    ['pumphouse', 'The Pump House', at(0.55)],
    ['canals', 'Canal Switchbacks', at(0.623)],
    ['low-weir', 'The Lower Weirs', at(0.73)],
    ['harbor-coil', 'Harbor Corkscrew', at(0.81)],
    ['harbor', 'Harbor Leap', at(0.86)],
    ['quay', 'The Receiving Quay', at(0.935)],
  ];
  const sections = sectionDefs.map(([id, name, h], i) => ({
    id,
    name,
    start: distanceAt(h),
    end:
      i < sectionDefs.length - 1 ? distanceAt(sectionDefs[i + 1][2]) : length,
    showcase: distanceAt(h + 100),
    representative: true,
  }));
  const scenarios = {
    staging: { distance: 0, speed: 0 },
    inspection: { distance: 25, speed: 0 },
    'coil-approach': { distance: distanceAt(rollStart - 100), speed: 135 },
    'turbine-coil-approach': { distance: distanceAt(at(0.467)), speed: 135 },
    'harbor-coil-approach': { distance: distanceAt(at(0.799)), speed: 135 },
    'finish-approach': { distance: finishDistance - 180, speed: 150 },
  };
  for (const j of jumps) {
    scenarios[j.id + '-approach'] = {
      distance: j.takeoff - 180,
      speed: 125,
      lateral: 0,
      heading: 0,
    };
    scenarios[j.id + '-launch'] = {
      distance: j.takeoff - 0.5,
      speed: j.targetSpeed,
      lateral: 0,
      heading: 0,
    };
  }
  for (const sec of sections)
    scenarios[sec.id + '-showcase'] = { distance: sec.showcase, speed: 0 };
  const checkpoints = [
    0,
    ...jumps.map((j) => j.landingStart),
    finishDistance,
  ].map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new T.Box3();
  for (let s = 0; s <= length; s += 5) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(WIDTH / 2 + 4);
  const isGap = (s) => jumps.some((j) => s > j.takeoff && s < j.landingStart);
  return {
    id: 'nightweir-sprint',
    name: 'Nightweir',
    geometryVersion: 'nightweir-sprint-v2',
    closed: false,
    width: WIDTH,
    length,
    finishDistance,
    groundY: 0,
    pace: NIGHTWEIR_PACE,
    sample,
    jumps,
    sections,
    scenarios,
    checkpoints,
    bounds,
    isGap,
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    sourceLength,
    sourceAt,
    distanceAt,
    pointAtSource: rawPoint,
    interiors: [],
    curtains: [0.027, 0.242, 0.394, 0.616, 0.719, 0.913].map((v, i) => ({
      id: 'curtain-' + i,
      s: distanceAt(at(v)),
    })),
    inversion: { start: distanceAt(rollStart), end: distanceAt(rollEnd) },
    inversions: rollDefs.map((r) => ({
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
        'Stormwater descent: eight jumps, three corkscrews, wet spillway crossings and the receiving harbor quay.',
    },
  };
}
