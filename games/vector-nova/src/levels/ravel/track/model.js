import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

export const RAVEL_PACE = Object.freeze({
  cruiseScale: 1.25,
  boostScale: 1.15,
  aerodynamicDragScale: 0.55,
  overspeedDeceleration: 0.4,
});
const TARGET_LENGTH = 13500;
const SOURCE_STEP = 0.5;
const ROAD_HALF_WIDTH = 50;
export const smooth = (value) => {
  const t = T.MathUtils.clamp(value, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
};
const v = (x, y, z) => new T.Vector3(x, y, z);

/** A closed, metre-parameterized reference axis. Moving sheets are installed separately. */
export function createRavelTrack() {
  // A real broad rounded perimeter replaces the earlier compressed Bezier
  // sketch. Each exterior quarter has a 573 m source radius, so scaling to
  // the circuit target cannot produce an eight-metre hairpin in a 100 m sheet.
  const side = 4200,
    quarter = 1100,
    middle = 2400;
  const radius = quarter / (Math.PI / 2);
  const sourceLength = 2 * side + 4 * quarter + 2 * middle;
  const firstArc = side;
  const firstMid = firstArc + quarter;
  const secondArc = firstMid + middle;
  const braidSource = secondArc + quarter;
  const thirdArc = braidSource + side;
  const secondMid = thirdArc + quarter;
  const fourthArc = secondMid + middle;
  const planarAt = (h) => {
    const s = T.MathUtils.clamp(h, 0, sourceLength);
    if (s <= firstArc) return v(0, 0, s);
    if (s <= firstMid) {
      const angle = (s - firstArc) / radius;
      return v(
        radius * (1 - Math.cos(angle)),
        0,
        side + radius * Math.sin(angle),
      );
    }
    if (s <= secondArc) return v(radius + s - firstMid, 0, side + radius);
    if (s <= braidSource) {
      const angle = Math.PI / 2 + (s - secondArc) / radius;
      return v(
        radius + middle - radius * Math.cos(angle),
        0,
        side + radius * Math.sin(angle),
      );
    }
    if (s <= thirdArc) return v(2 * radius + middle, 0, side - s + braidSource);
    if (s <= secondMid) {
      const angle = Math.PI + (s - thirdArc) / radius;
      return v(
        radius + middle - radius * Math.cos(angle),
        0,
        radius * Math.sin(angle),
      );
    }
    if (s <= fourthArc) return v(radius + middle - s + secondMid, 0, -radius);
    const angle = Math.PI * 1.5 + (s - fourthArc) / radius;
    return v(radius - radius * Math.cos(angle), 0, radius * Math.sin(angle));
  };
  const heroLip = firstMid + 400,
    heroLanding = heroLip + 600;
  const heroLipY = 1250 - 0.18 * (heroLip - 5250);
  const heroLandingY = heroLipY - 600 * 0.18 - 440;
  const heroEndY = heroLandingY - (secondArc - heroLanding) * 0.18;
  const returnLip = secondMid + 600,
    crownLip = secondMid + 1600;
  const heightKeys = [
    [0, 1000, 0],
    [160, 1008, -0.12],
    [280, 1000, -0.12],
    [340, 972.8, -0.12],
    [580, 944, -0.12],
    [1600, 950, 0],
    [2100, 950, -0.12],
    [2190, 914.2, -0.12],
    [2540, 872.2, -0.12],
    [2900, 900, -0.12],
    [3000, 858, -0.12],
    [3350, 816, 0],
    [4300, 2200, 0],
    [5250, 1250, -0.18],
    [heroLip, heroLipY, -0.18],
    [heroLanding, heroLandingY, -0.18],
    [secondArc, heroEndY, -0.18],
    [braidSource, 1100, -0.02],
    [thirdArc, 1016, -0.02],
    [secondMid, 1200, 0],
    [returnLip, 1200, -0.12],
    [returnLip + 120, 1145.6, -0.12],
    [returnLip + 520, 1097.6, -0.12],
    [crownLip, 1200, -0.12],
    [crownLip + 150, 1132, -0.12],
    [crownLip + 600, 1078, -0.12],
    [fourthArc, 1100, 0],
    [sourceLength, 1000, 0],
  ];
  const heightAt = (h) => {
    const s = T.MathUtils.clamp(h, 0, sourceLength);
    let lo = 0,
      hi = heightKeys.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (heightKeys[mid][0] <= s) lo = mid;
      else hi = mid;
    }
    const [a, ya, ma] = heightKeys[lo],
      [b, yb, mb] = heightKeys[hi];
    const span = b - a,
      t = (s - a) / span;
    const startSlope = t - 6 * t ** 3 + 8 * t ** 4 - 3 * t ** 5;
    const endSlope = -4 * t ** 3 + 7 * t ** 4 - 3 * t ** 5;
    return (
      ya + (yb - ya) * smooth(t) + span * (ma * startSlope + mb * endSlope)
    );
  };
  const positions = Array.from(
    { length: Math.round(sourceLength / SOURCE_STEP) + 1 },
    (_, i) => {
      const h = i * SOURCE_STEP,
        point = planarAt(h);
      point.y = heightAt(h);
      return point;
    },
  );
  positions[positions.length - 1].copy(positions[0]);
  const marker = (source) => Math.round(source / SOURCE_STEP);
  const markers = {
    staging: 0,
    'first-roll-start': marker(firstArc),
    'first-roll-end': marker(firstMid),
    'shuttle-turn': marker(580),
    'reverse-roll-start': marker(secondArc),
    'reverse-roll-end': marker(braidSource),
    'braid-start': marker(braidSource),
    'braid-end': marker(thirdArc),
    'merge-apron-end': marker(thirdArc),
    'anchor-climb': marker(3350),
    'anchor-dive': marker(4300),
    'hero-approach-end': marker(heroLip),
    'lower-fold': marker(secondArc),
    'return-roll-start': marker(thirdArc),
    'return-roll-end': marker(secondMid),
    'crown-roll-start': marker(fourthArc),
    'crown-roll-end': marker(sourceLength),
    'home-fold': marker(fourthArc),
  };
  const authoredJumps = [
    ['tension-break', 'First Tension Break', 280, 340, 800],
    ['shuttle-crossing', 'Shuttle Crossing', 2100, 2190, 2640],
    ['lower-seam', 'Upper Sail Cut', 2900, 3000, 3400],
    ['sundiver', 'Sundiver Transfer', heroLip, heroLanding, secondArc, true],
    ['return-cut', 'Return Cut', returnLip, returnLip + 120, returnLip + 620],
    ['crown-gap', 'Crown Gap', crownLip, crownLip + 150, crownLip + 600],
  ].map(([id, label, takeoff, landing, end, hero = false]) => ({
    id,
    label,
    hero,
    takeoffIndex: marker(takeoff),
    landingIndex: marker(landing),
    endIndex: marker(end),
  }));
  const count = positions.length - 1;
  const unscaled = new Float64Array(count + 1);
  for (let i = 1; i <= count; i++)
    unscaled[i] = unscaled[i - 1] + positions[i].distanceTo(positions[i - 1]);
  const scale = TARGET_LENGTH / unscaled[count];
  positions.forEach((p) => p.multiplyScalar(scale));
  const arcs = Float64Array.from(unscaled, (distance) => distance * scale);
  const length = TARGET_LENGTH;
  const wrap = (distance) => T.MathUtils.euclideanModulo(distance, length);
  const atIndex = (index) => arcs[index];
  const station = (id) => atIndex(markers[id]);
  const locate = (distance) => {
    const d = wrap(distance);
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const middle = (lo + hi) >> 1;
      if (arcs[middle] <= d) lo = middle;
      else hi = middle;
    }
    return lo + (d - arcs[lo]) / (arcs[hi] - arcs[lo]);
  };
  const positionAt = (distance) => {
    const f = locate(distance),
      i = Math.min(count - 1, Math.floor(f));
    return positions[i].clone().lerp(positions[i + 1], f - i);
  };
  const tangentAt = (distance) =>
    positionAt(distance + 0.35)
      .sub(positionAt(distance - 0.35))
      .normalize();
  const distanceAt = (source) => {
    const f = T.MathUtils.clamp(source / SOURCE_STEP, 0, count);
    const i = Math.min(count - 1, Math.floor(f));
    return T.MathUtils.lerp(arcs[i], arcs[i + 1], f - i);
  };
  const sourceAt = (distance) => locate(distance) * SOURCE_STEP;
  const frameCount = Math.ceil(length / 2),
    frameStep = length / frameCount;
  const references = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, i) => tangentAt(i * frameStep)),
    frameStep,
    true,
  );
  const mandatoryJumps = authoredJumps.map((entry) => ({
    id: entry.id,
    label: entry.label,
    hero: entry.hero,
    takeoff: atIndex(entry.takeoffIndex),
    landingStart: atIndex(entry.landingIndex),
    landingEnd: atIndex(entry.endIndex),
    recovery: atIndex(entry.endIndex) - 45,
    halfWidth: ROAD_HALF_WIDTH,
    targetSpeed: entry.hero ? 160 : 145,
    launchAlignment: entry.hero ? 160 : 100,
  }));
  const braidStart = station('braid-start') + 45;
  const braid = {
    start: braidStart,
    end: braidStart + 2800,
    splitEnd: braidStart + 750,
    mergeStart: braidStart + 2300,
    receivingEnd: braidStart + 3050,
  };
  const crest = {
    id: 'crest-skip',
    label: 'Crest Skip',
    optional: true,
    lane: 'crest',
    lateralMin: 3,
    lateralMax: ROAD_HALF_WIDTH,
    takeoff: 950,
    landingStart: 1015,
    landingEnd: 1230,
    recovery: 1160,
    halfWidth: ROAD_HALF_WIDTH,
    targetSpeed: 145,
    launchAlignment: 90,
  };
  const outer = {
    id: 'outer-transfer',
    label: 'Outer Sail Transfer',
    optional: true,
    branch: 'outer',
    lane: 'outer',
    lateralMin: 60,
    lateralMax: 140,
    takeoff: braid.end - 200,
    landingStart: braid.end,
    landingEnd: braid.receivingEnd,
    recovery: braid.receivingEnd - 40,
    halfWidth: ROAD_HALF_WIDTH,
    targetSpeed: 160,
    launchAlignment: 130,
  };
  const jumps = [crest, outer, ...mandatoryJumps].sort(
    (a, b) => a.takeoff - b.takeoff,
  );
  const rolls = [
    [
      'first-screw',
      'First Tension Corkscrew',
      'first-roll-start',
      'first-roll-end',
      1,
    ],
    [
      'reverse-screw',
      'Reverse Shuttle Corkscrew',
      'reverse-roll-start',
      'reverse-roll-end',
      -1,
    ],
    [
      'return-screw',
      'Return Sail Corkscrew',
      'return-roll-start',
      'return-roll-end',
      1,
    ],
    [
      'crown-screw',
      'Crown Reverse Corkscrew',
      'crown-roll-start',
      'crown-roll-end',
      -1,
    ],
  ].map(([id, name, start, end, turns]) => {
    let middle = (station(start) + station(end)) / 2;
    if (id === 'return-screw')
      middle = Math.max(middle, braid.receivingEnd + 400);
    return { id, name, start: middle - 350, end: middle + 350, turns };
  });
  // Automatic corner banking is smoothed across joins, then explicit rolls and
  // straight launch/receiving windows take precedence.
  const rawBanks = Float64Array.from({ length: frameCount }, (_, i) => {
    const a = tangentAt(i * frameStep - 14),
      b = tangentAt(i * frameStep + 14);
    return T.MathUtils.clamp(
      Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z) * 3.5,
      -0.9,
      0.9,
    );
  });
  const banks = Float64Array.from({ length: frameCount }, (_, i) => {
    let sum = 0,
      weight = 0;
    for (let j = -30; j <= 30; j++) {
      const w = (1 - (j / 31) ** 2) ** 3;
      sum += rawBanks[(i + j + frameCount) % frameCount] * w;
      weight += w;
    }
    return sum / weight;
  });
  const bankAt = (distance) => {
    const d = wrap(distance),
      f = d / frameStep,
      i = Math.floor(f);
    let bank = T.MathUtils.lerp(banks[i], banks[(i + 1) % frameCount], f - i);
    bank *=
      1 -
      smooth((d - braid.start + 200) / 100) *
        (1 - smooth((d - braid.receivingEnd) / 100));
    for (const entry of jumps) {
      const enter = smooth((d - entry.takeoff + 160) / 90);
      const leave = 1 - smooth((d - entry.landingEnd) / 100);
      bank *= 1 - enter * leave;
    }
    return bank;
  };
  const rollAt = (distance) =>
    bankAt(distance) +
    rolls.reduce(
      (sum, roll) =>
        sum +
        roll.turns *
          2 *
          Math.PI *
          smooth((wrap(distance) - roll.start) / (roll.end - roll.start)),
      0,
    );
  function sampleBase(distance) {
    const d = wrap(distance),
      f = d / frameStep,
      i = Math.min(frameCount - 1, Math.floor(f));
    const tangent = tangentAt(d),
      roll = rollAt(d);
    const reference = references[i].clone().slerp(references[i + 1], f - i);
    const right = v(1, 0, 0).applyQuaternion(reference);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    // Keep launch shelves, receivers and the common branch axis level even
    // after the transported horizon crosses a very steep exterior fold.
    let alignment =
      smooth((d - braid.start + 200) / 100) *
      (1 - smooth((d - braid.receivingEnd) / 100));
    for (const entry of jumps)
      alignment = Math.max(
        alignment,
        smooth((d - entry.takeoff + 160) / 90) *
          (1 - smooth((d - entry.landingEnd) / 100)),
      );
    if (alignment > 0) {
      const levelRight = v(0, 1, 0).cross(tangent).normalize();
      const correction = Math.atan2(
        tangent.dot(right.clone().cross(levelRight)),
        right.dot(levelRight),
      );
      right.applyAxisAngle(tangent, correction * alignment);
    }
    right.applyAxisAngle(tangent, roll);
    const up = tangent.clone().cross(right).normalize();
    return {
      position: positionAt(d),
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
  const jumpById = (id) => mandatoryJumps.find((jump) => jump.id === id);
  const definitions = [
    ['berth', 'Sail Berth', 0],
    ['first-wave', 'First Wave', 600],
    ['shuttle', 'Shuttle Crossing', jumpById('shuttle-crossing').takeoff - 140],
    ['upper-cut', 'Upper Sail Cut', jumpById('lower-seam').takeoff - 130],
    ['anchor', 'Anchor Wall Ascent', station('anchor-climb')],
    ['first-screw', 'First Tension Corkscrew', rolls[0].start - 80],
    ['anchor-dive', 'Anchor Sail Plunge', station('anchor-dive')],
    ['sundiver', 'Sundiver Transfer', jumpById('sundiver').takeoff - 180],
    ['reverse-screw', 'Reverse Shuttle Corkscrew', rolls[1].start - 60],
    ['braid', 'The Braided Sails', braid.start],
    ['merge', 'Outer Sail Transfer', outer.takeoff - 100],
    ['return-screw', 'Return Sail Corkscrew', rolls[2].start - 60],
    ['return-cut', 'Return Cut', jumpById('return-cut').takeoff - 130],
    ['crown-gap', 'Crown Gap', jumpById('crown-gap').takeoff - 130],
    ['crown', 'Crown Reverse Corkscrew', rolls[3].start - 60],
  ].sort((a, b) => a[2] - b[2]);
  const sections = definitions.map(([id, name, start], i) => ({
    id,
    name,
    start,
    end: definitions[i + 1]?.[2] ?? length,
    showcase: Math.min((definitions[i + 1]?.[2] ?? length) - 10, start + 100),
    representative: true,
  }));
  const checkpoints = [0, ...jumps.map((entry) => entry.landingStart)]
    .sort((a, b) => a - b)
    .map((distance, index) => ({
      index,
      distance,
      s: distance,
      position: sampleBase(distance).position,
      quaternion: sampleBase(distance).quaternion,
    }));
  const scenarios = {
    staging: { distance: 0, speed: 0 },
    inspection: { distance: 25, speed: 0 },
    'wave-approach': { distance: 650, speed: 125, lateral: 10, time: 0 },
    'wave-safe-seam': { distance: 650, speed: 125, lateral: -13, time: 0 },
    'crest-skip-approach': { distance: 760, speed: 125, lateral: 12, time: 0 },
    'braid-approach': { distance: braid.start - 200, speed: 135 },
    'braid-inner': { distance: braid.splitEnd + 50, speed: 135, lateral: -100 },
    'braid-middle': { distance: braid.splitEnd + 50, speed: 135, lateral: 0 },
    'braid-outer': { distance: braid.splitEnd + 50, speed: 135, lateral: 100 },
    'outer-transfer-approach': {
      distance: outer.takeoff - 200,
      speed: 150,
      lateral: 100,
    },
    'finish-approach': { distance: length - 200, speed: 140 },
  };
  for (const entry of jumps) {
    const lateral =
      entry.lane === 'crest' ? 12 : entry.lane === 'outer' ? 100 : 0;
    scenarios[entry.id + '-approach'] ??= {
      distance: entry.takeoff - 180,
      speed: 125,
      lateral,
    };
    scenarios[entry.id + '-launch'] = {
      distance: entry.takeoff - 0.1,
      speed: entry.targetSpeed,
      lateral,
    };
  }
  for (const roll of rolls)
    scenarios[roll.id + '-approach'] = {
      distance: roll.start - 70,
      speed: 130,
    };
  for (const section of sections)
    scenarios[section.id + '-showcase'] = {
      distance: section.showcase,
      speed: 0,
    };
  const isGap = (distance) =>
    mandatoryJumps.some(
      (entry) =>
        wrap(distance) > entry.takeoff && wrap(distance) < entry.landingStart,
    );
  const runs = [];
  let runStart = 0;
  for (const entry of mandatoryJumps) {
    runs.push({ start: runStart, end: entry.takeoff });
    runStart = entry.landingStart;
  }
  runs.push({ start: runStart, end: length });
  const bounds = new T.Box3();
  for (let distance = 0; distance <= length; distance += 8)
    bounds.expandByPoint(sampleBase(distance).position);
  bounds.expandByScalar(110);
  return {
    id: 'ravel-circuit',
    name: 'Ravel',
    geometryVersion: 'ravel-greybox-wide-axis-v2',
    closed: true,
    length,
    width: 320,
    mainWidth: 100,
    roadHalfWidth: ROAD_HALF_WIDTH,
    groundY: bounds.min.y - 400,
    pace: RAVEL_PACE,
    sample: sampleBase,
    sampleBase,
    positionAt,
    tangentAt,
    sourceAt,
    distanceAt,
    sourceLength,
    pointAtSource: (source) => positionAt(distanceAt(source)),
    jumps,
    mandatoryJumps,
    rolls,
    inversions: rolls,
    braid,
    crest: {
      start: 650,
      takeoff: crest.takeoff,
      end: crest.landingStart,
      receivingEnd: crest.landingEnd,
    },
    sections,
    checkpoints,
    scenarios,
    bounds,
    runs,
    isGap,
    surfaceCoverage: (distance) => (isGap(distance) ? 0 : 1),
    boundaryIntervals: [],
    deviceProjection: 'rendered-surface',
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'bare-track',
      description:
        'A 13.5 km broad sail circuit: four corkscrews, six mandatory flights, a giant Sundiver transfer, three braided ribbons and optional wave/outer cuts.',
    },
  };
}
