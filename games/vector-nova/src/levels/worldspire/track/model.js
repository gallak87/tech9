import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 50;
const clamp = T.MathUtils.clamp;
const smooth = (v) => {
  const t = clamp(v, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
export const WORLDSPIRE_PACE = Object.freeze({
  cruiseScale: 1.2,
  boostScale: 1.12,
  aerodynamicDragScale: 0.65,
  overspeedDeceleration: 0.6,
});

// Concentrated crown-to-root sprint: two exterior lobes, two true crossings,
// and short, deliberately tangent-aligned jump windows between falling turns.
export function createWorldspireTrack() {
  const points = [
    [0, -650],
    [240, -740],
    [420, -620],
    [670, -730],
    [850, -480],
    [760, -180],
    [1020, 70],
    [850, 400],
    [570, 580],
    [240, 470],
    [-80, 650],
    [-380, 540],
    [-680, 270],
    [-610, 0],
    [-460, -180],
    [-180, -150],
    [50, 100],
    [320, 80],
    [470, -180],
    [700, -280],
    [980, -420],
    [1190, -160],
    [1040, 80],
    [1240, 350],
    [1140, 700],
    [840, 900],
    [580, 760],
    [330, 1050],
    [-60, 1010],
    [-380, 850],
    [-720, 1130],
    [-1060, 910],
    [-1120, 500],
    [-930, 260],
    [-720, 140],
    [-470, 340],
    [-150, 200],
    [30, -100],
    [350, -170],
    [590, -440],
    [850, -350],
    [1090, -570],
    [1380, -450],
    [1510, -50],
    [1340, 290],
    [1600, 540],
    [1390, 880],
    [1150, 1120],
    [1300, 1460],
    [1000, 1600],
    [740, 1460],
    [410, 1610],
    [140, 1510],
  ].map(([x, z]) => new T.Vector3(x * 0.7, 0, z * 0.7));
  const curve = new T.CatmullRomCurve3(points, false, 'centripetal');
  curve.arcLengthDivisions = 64000;
  curve.updateArcLengths();
  const sourceLength = curve.getLength();
  const at = (fraction) => sourceLength * fraction;
  const curveTangent = (h) =>
    curve.getTangentAt(clamp(h / sourceLength, 0, 1)).normalize();
  const definitions = [
    {
      id: 'crown-break',
      label: 'Crown Break',
      h: at(0.045),
      gap: 40,
      drop: 8,
      receiving: 180,
    },
    {
      id: 'buttress-cut',
      label: 'Buttress Cut',
      h: at(0.192),
      gap: 55,
      drop: 14,
      receiving: 220,
    },
    {
      id: 'heart-chasm',
      label: 'Heart Chasm',
      h: at(0.283),
      gap: 110,
      drop: 50,
      receiving: 410,
      hero: true,
    },
    {
      id: 'daylight-leap',
      label: 'Daylight Leap',
      h: at(0.346),
      gap: 60,
      drop: 16,
      receiving: 240,
    },
    {
      id: 'mantle-shear',
      label: 'Mantle Shear',
      h: at(0.52),
      gap: 65,
      drop: 18,
      receiving: 250,
    },
    {
      id: 'vault-entry',
      label: 'Vault Threshold',
      h: at(0.625),
      gap: 45,
      drop: 12,
      receiving: 210,
    },
    {
      id: 'echo-chasm',
      label: 'Echo Chasm',
      h: at(0.686),
      gap: 135,
      drop: 65,
      receiving: 470,
      hero: true,
    },
    {
      id: 'vault-exit',
      label: 'Vault Breakout',
      h: at(0.774),
      gap: 60,
      drop: 18,
      receiving: 250,
    },
    {
      id: 'root-gate',
      label: 'Root Gate',
      h: at(0.887),
      gap: 100,
      drop: 35,
      receiving: 350,
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
    heading += clamp(difference * 0.018, -0.008, 0.008) * routeStep;
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
    let grade = 0.4 + 0.12 * Math.sin(h / 190 + 0.4);
    for (const [a, b] of chutes)
      grade += 0.42 * smooth((h - a) / 65) * (1 - smooth((h - b) / 65));
    for (const j of definitions)
      grade = T.MathUtils.lerp(grade, 0.28, alignment(h, j));
    return grade;
  };
  const heightStep = 0.5,
    heights = [0];
  for (let i = 1; i <= Math.ceil(sourceLength / heightStep); i++)
    heights.push(heights[i - 1] - gradeAt((i - 0.5) * heightStep) * heightStep);
  const verticalOffset =
    -heights.at(-1) + definitions.reduce((v, j) => v + j.drop, 0) + 320;
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
  const rollStart = at(0.09),
    rollEnd = at(0.16);
  const rollDefs = [
    { id: 'sunward', start: rollStart, end: rollEnd, turns: 1 },
    { id: 'mantle', start: at(0.42), end: at(0.486), turns: -1 },
    { id: 'root', start: at(0.808), end: at(0.856), turns: 1 },
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
    ['crown', 'Crown Slalom', 0],
    ['coil', 'Sunward Corkscrew', at(0.09)],
    ['buttress', 'Mineral Buttress Slalom', at(0.166)],
    ['heart', 'Twisting Mineral Heart', at(0.253)],
    ['daybreak', 'Daylight Leap', at(0.336)],
    ['mantle', 'Broken Mantle', at(0.378)],
    ['reverse-coil', 'Reverse Mantle Corkscrew', at(0.42)],
    ['copper', 'Copper Falls', at(0.49)],
    ['shards', 'The Shard Stair', at(0.56)],
    ['vault', 'The Split Vault', at(0.636)],
    ['echo', 'Echo Chasm', at(0.675)],
    ['breakout', 'The Low Breakout', at(0.758)],
    ['root-coil', 'Root Corkscrew', at(0.808)],
    ['root-slalom', 'The Woven Roots', at(0.86)],
    ['gate', 'The Root Gate', at(0.881)],
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
    'heart-approach': { distance: distanceAt(at(0.235)), speed: 130 },
    'vault-approach': { distance: distanceAt(at(0.626)), speed: 130 },
    'mantle-coil-approach': { distance: distanceAt(at(0.411)), speed: 135 },
    'root-coil-approach': { distance: distanceAt(at(0.798)), speed: 135 },
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
    id: 'worldspire-sprint',
    name: 'Worldspire',
    geometryVersion: 'worldspire-sprint-v4',
    closed: false,
    width: WIDTH,
    length,
    finishDistance,
    groundY: 0,
    pace: WORLDSPIRE_PACE,
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
    interior: {
      start: distanceAt(at(0.235)),
      end: distanceAt(at(0.362)),
    },
    interiors: [
      { id: 'heart', start: distanceAt(at(0.235)), end: distanceAt(at(0.362)) },
      { id: 'vault', start: distanceAt(at(0.626)), end: distanceAt(at(0.785)) },
    ],
    inversion: { start: distanceAt(rollStart), end: distanceAt(rollEnd) },
    inversions: rollDefs.map((r) => ({
      ...r,
      start: distanceAt(r.start),
      end: distanceAt(r.end),
    })),
    spireHeight: heights[0] + 900,
    spireRadius: (y) =>
      90 + 1000 * Math.max(0, 1 - (y + 300) / (heights[0] + 1200)) ** 1.25,
    showcases: sections.map((s) => ({
      id: s.id,
      name: s.name,
      distance: s.showcase,
    })),
    review: {
      kind: 'bare-track',
      description:
        'Concentrated descent: nine jumps, three corkscrews, two through-spire passages and the Root Gate finish.',
    },
  };
}
