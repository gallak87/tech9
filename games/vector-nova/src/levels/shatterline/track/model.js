import * as T from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const HORIZONTAL_LENGTH = 11050;
const WIDTH = 50;
// The whole installation follows a steep mountain face. Applying the same
// descent to launch and receiving geometry preserves their relative pitch,
// while the ordinary raceway keeps falling instead of becoming a staircase
// of level decks separated by three large drops.
const DESCENT_GRADE = 0.18;
// Authored source coordinates keep every established jump and district anchor.
// Only supported connectors stretch into the three new continuous descents.
const DESCENTS = [
  {
    id: 'summit-chute',
    name: 'Summit Chute',
    start: 80,
    end: 270,
    length: 600,
    drop: 480,
    kind: 'sweep',
  },
  {
    id: 'service-corkscrew',
    name: 'Service Corkscrew',
    start: 2810,
    end: 2940,
    length: 1500,
    drop: 950,
    kind: 'corkscrew',
    turns: 2,
  },
  {
    id: 'overturn-descent',
    name: 'Overturn Descent',
    start: 5480,
    end: 5630,
    length: 1500,
    drop: 1100,
    kind: 'inversion',
  },
];
const VARIATION_DROPS = [
  { start: 6160, end: 6280, drop: 110 },
  { start: 6790, end: 6910, drop: 110 },
  { start: 7420, end: 7540, drop: 230 },
  { start: 8050, end: 8170, drop: 200 },
  { start: 8750, end: 8850, drop: 250 },
];
const VARIATION_START = 6160;
const VARIATION_END = 8850;
const RECEIVING_EXTENSION = 280;
const SUMMIT_LIFT =
  1900 +
  DESCENTS.reduce((total, section) => total + section.drop, 0) +
  VARIATION_DROPS.reduce((total, section) => total + section.drop, 0) +
  48 +
  RECEIVING_EXTENSION * DESCENT_GRADE;
const clamp = T.MathUtils.clamp;
const smooth = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const progress = (section, source) =>
  smooth((source - section.start) / (section.end - section.start));
// Smooth angular acceleration at each end, constant rotation in the middle.
const rotationProgress = (value) => {
  const u = clamp(value, 0, 1),
    ramp = 0.15;
  const enter = (t) => (ramp * (t ** 3 - 0.5 * t ** 4)) / (1 - ramp);
  return u < ramp
    ? enter(u / ramp)
    : u > 1 - ramp
      ? 1 - enter((1 - u) / ramp)
      : (u - ramp / 2) / (1 - ramp);
};
const SOURCE_JUMPS = [
  ['first-break', 'First Break', 450, 0],
  ['ridge-skip', 'Ridge Skip', 1050, 60],
  ['severance', 'The Severance', 1750, -40, true],
  ['service-transfer', 'Service Transfer', 3100, -130],
  ['cut-crossing', 'Cut Crossing', 3750, -30],
  ['crown-shot', 'The Crown Shot', 4400, -30, true],
  ['coil-break', 'Coil Break', 5780, 180],
  ['offset-one', 'Avalanche Break', 6410, 90],
  ['offset-two', 'Avalanche Cut', 7040, -10],
  ['fracture-leap', 'Fracture Leap', 7670, -120],
  ['last-relay', 'Scissor Transfer', 8300, -30],
  ['horizon-transfer', 'Horizon Transfer', 9050, 80, true],
];

function hermite(keys, value) {
  const s = clamp(value, keys[0][0], keys.at(-1)[0]);
  let lo = 0,
    hi = keys.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid][0] <= s) lo = mid;
    else hi = mid;
  }
  const [a, ya, ma = 0] = keys[lo],
    [b, yb, mb = 0] = keys[hi];
  const t = (s - a) / (b - a);
  return (
    (2 * t ** 3 - 3 * t * t + 1) * ya +
    (t ** 3 - 2 * t * t + t) * (b - a) * ma +
    (-2 * t ** 3 + 3 * t * t) * yb +
    (t ** 3 - t * t) * (b - a) * mb
  );
}

/** Open arc-length route. Gaps have a guide curve, never a driving surface. */
export function createShatterlineTrack() {
  const heights = [[0, 1300, 0]],
    lateral = [[0, 0, 0]];
  let drop = 0;
  const sourceJumps = SOURCE_JUMPS.map(([id, label, h, x, hero = false], i) => {
    const y = 1292 - i * 16 - drop;
    const descent = hero ? 250 : id === 'last-relay' ? 60 : 12;
    const gap = hero ? 470 : id === 'last-relay' ? 170 : 90;
    const receivingEnd = hero ? 1050 : id === 'last-relay' ? 450 : 380;
    heights.push(
      [h - 150, y - 8, 0],
      [h, y, Math.tan((7 * Math.PI) / 180)],
      [h + gap, y - descent, 0],
      [h + receivingEnd, y - descent, 0],
    );
    lateral.push([h - (hero ? 200 : 130), x, 0], [h + receivingEnd, x, 0]);
    drop += descent;
    return { id, label, h, x, hero, gap, receivingEnd };
  });
  heights.push([HORIZONTAL_LENGTH, heights.at(-1)[1] - 12, 0]);
  lateral.push([HORIZONTAL_LENGTH, 80, 0]);
  for (const section of DESCENTS.filter((entry) => entry.kind !== 'sweep')) {
    const before = lateral.findLast((key) => key[0] < section.start);
    const after = lateral.find((key) => key[0] > section.end);
    lateral.push([section.start, before[1], 0], [section.end, after[1], 0]);
    lateral.sort((a, b) => a[0] - b[0]);
  }
  const acceleratorZAt = (source) => {
    const h = clamp(source, 0, HORIZONTAL_LENGTH);
    return (
      h +
      DESCENTS.reduce(
        (z, section) => z + section.length * progress(section, h),
        0,
      )
    );
  };
  const sourceAtAcceleratorZ = (z) => {
    let low = 0,
      high = HORIZONTAL_LENGTH;
    const target = clamp(z, 0, acceleratorZAt(HORIZONTAL_LENGTH));
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (acceleratorZAt(mid) < target) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  };
  const legacyHeight = (h) =>
    hermite(heights, h) + SUMMIT_LIFT - DESCENT_GRADE * h;
  const baseHeight = (h) =>
    legacyHeight(h) -
    RECEIVING_EXTENSION * DESCENT_GRADE * rotationProgress((h - 8470) / 280) -
    [...DESCENTS, ...VARIATION_DROPS].reduce(
      (drop, section) => drop + section.drop * progress(section, h),
      0,
    );
  const profiles = DESCENTS.map((section) => {
    const zStart = acceleratorZAt(section.start),
      zEnd = acceleratorZAt(section.end);
    return {
      ...section,
      zStart,
      zLength: zEnd - zStart,
      xStart: hermite(lateral, section.start),
      xEnd: hermite(lateral, section.end),
      yStart: baseHeight(section.start),
      yEnd: baseHeight(section.end),
      startSlope:
        (legacyHeight(section.start + 0.01) -
          legacyHeight(section.start - 0.01)) /
        0.02,
      endSlope:
        (legacyHeight(section.end + 0.01) - legacyHeight(section.end - 0.01)) /
        0.02,
    };
  });
  const physicalProgress = (section, h) =>
    clamp((acceleratorZAt(h) - section.zStart) / section.zLength, 0, 1);
  // The late descent folds across itself in plan. Ballistic corridors are
  // rigid straight pieces; wide tangent-matched bends connect those pieces.
  // Source metres remain stable authoring addresses, not world coordinates.
  const variationPieces = [];
  let cursor = new T.Vector3(180, 0, acceleratorZAt(VARIATION_START));
  let yaw = 0;
  const direction = (angle) =>
    new T.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const appendTurn = (
    start,
    end,
    degrees,
    radius,
    straight = 0,
    continuation = [],
  ) => {
    const curve = new T.CurvePath();
    for (const command of [{ degrees, radius, straight }, ...continuation]) {
      const nextYaw = T.MathUtils.degToRad(command.degrees),
        turn = nextYaw - yaw,
        next = cursor
          .clone()
          .add(
            new T.Vector3(
              command.radius * (Math.cos(yaw) - Math.cos(nextYaw)),
              0,
              command.radius * (Math.sin(nextYaw) - Math.sin(yaw)),
            ),
          ),
        control = (4 / 3) * command.radius * Math.tan(turn / 4);
      curve.add(
        new T.CubicBezierCurve3(
          cursor.clone(),
          cursor.clone().addScaledVector(direction(yaw), control),
          next.clone().addScaledVector(direction(nextYaw), -control),
          next.clone(),
        ),
      );
      if (command.straight) {
        const exit = next
          .clone()
          .addScaledVector(direction(nextYaw), command.straight);
        curve.add(new T.LineCurve3(next.clone(), exit));
        next.copy(exit);
      }
      cursor.copy(next);
      yaw = nextYaw;
    }
    curve.arcLengthDivisions = 2048;
    curve.updateArcLengths();
    variationPieces.push({
      start,
      end,
      kind: 'turn',
      curve,
      length: curve.getLength(),
      yStart: baseHeight(start),
      yEnd: baseHeight(end),
      startSlope:
        (legacyHeight(start + 0.01) - legacyHeight(start - 0.01)) / 0.02,
      endSlope: (legacyHeight(end + 0.01) - legacyHeight(end - 0.01)) / 0.02,
    });
  };
  const appendRunway = (start, end, extension = 0) => {
    variationPieces.push({
      start,
      end,
      kind: 'runway',
      extension,
      origin: cursor.clone(),
      direction: direction(yaw),
    });
    cursor.addScaledVector(direction(yaw), end - start + extension);
  };
  appendTurn(6160, 6280, 55, 500);
  appendRunway(6280, 6790);
  appendTurn(6790, 6910, 125, 400);
  appendRunway(6910, 7420);
  appendTurn(7420, 7540, 270, 300);
  appendRunway(7540, 8050);
  appendTurn(8050, 8170, 450, 280, 150, [
    { degrees: 600, radius: 250, straight: 350 },
  ]);
  const transferRight = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  appendRunway(8170, 8750, RECEIVING_EXTENSION);
  cursor.addScaledVector(transferRight, 8);
  appendTurn(8750, 8850, 720, 180);
  const exitPosition = cursor.clone(),
    exitZOffset = exitPosition.z - acceleratorZAt(VARIATION_END);
  // This monotonic reference axis is solely for the mountainside/accelerator
  // spine. The physical road reverses Z in Scissor Dive, so scenery nearest
  // the road must use pointAtSource/nearestSourceAt rather than invert this.
  const spineZAt = acceleratorZAt;
  const sourceAtSpineZ = (z) => {
    let low = 0,
      high = HORIZONTAL_LENGTH;
    const target = clamp(z, 0, spineZAt(HORIZONTAL_LENGTH));
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (spineZAt(mid) < target) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  };
  const rawPoint = (h) => {
    const point = new T.Vector3(
      hermite(lateral, h),
      baseHeight(h),
      acceleratorZAt(h),
    );
    for (const section of profiles) {
      if (h < section.start || h > section.end) continue;
      const u = physicalProgress(section, h);
      point.y = hermite(
        [
          [0, section.yStart, section.startSlope * section.zLength],
          [1, section.yEnd, section.endSlope * section.zLength],
        ],
        u,
      );
      point.x = T.MathUtils.lerp(section.xStart, section.xEnd, smooth(u));
      if (section.kind === 'sweep')
        point.x += 60 * Math.sin(Math.PI * smooth(u)) ** 2;
      if (section.kind === 'corkscrew') {
        // Unequal physical helices bend in opposite lateral directions. The
        // changing radius and a steeper waist make two distinct plunges.
        const first = u <= 0.56,
          phase =
            2 *
            Math.PI *
            rotationProgress(first ? u / 0.56 : (u - 0.56) / 0.44);
        point.x += (first ? 110 : -75) * Math.sin(phase);
        point.y += (first ? 35 : 20) * (1 - Math.cos(phase));
        point.y += 65 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u) ** 2;
      }
    }
    if (h >= VARIATION_START && h <= VARIATION_END) {
      const piece = variationPieces.find((candidate) => h <= candidate.end),
        u = clamp((h - piece.start) / (piece.end - piece.start), 0, 1),
        horizontal =
          piece.kind === 'turn'
            ? piece.curve.getPoint(u)
            : piece.origin
                .clone()
                .addScaledVector(
                  piece.direction,
                  h -
                    piece.start +
                    piece.extension * rotationProgress((h - 8470) / 280),
                );
      point.x = horizontal.x;
      point.z = horizontal.z;
      if (piece.kind === 'turn')
        point.y = hermite(
          [
            [0, piece.yStart, piece.startSlope * piece.length],
            [1, piece.yEnd, piece.endSlope * piece.length],
          ],
          u,
        );
      // This is a real offset shelf. The free-flight solver supplies no
      // attraction; its 50 m width catches the unchanged launch tangent.
      if (h >= 8300 && h <= 8750)
        point.addScaledVector(transferRight, 8 * smooth((h - 8300) / 170));
    } else if (h > VARIATION_END) {
      point.x = exitPosition.x;
      point.z += exitZOffset;
    }
    return point;
  };
  const sourceStep = 0.025,
    count = HORIZONTAL_LENGTH / sourceStep;
  const arcs = new Float64Array(count + 1);
  let previous = rawPoint(0);
  for (let i = 1; i <= count; i++) {
    const p = rawPoint(i * sourceStep);
    arcs[i] = arcs[i - 1] + p.distanceTo(previous);
    previous = p;
  }
  const length = arcs[count];
  const distanceAt = (h) => {
    const f = clamp(h, 0, HORIZONTAL_LENGTH) / sourceStep,
      i = Math.min(count - 1, Math.floor(f));
    return T.MathUtils.lerp(arcs[i], arcs[i + 1], f - i);
  };
  const sourceAt = (s) => {
    const d = clamp(s, 0, length);
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arcs[mid] <= d) lo = mid;
      else hi = mid;
    }
    return (lo + (d - arcs[lo]) / (arcs[hi] - arcs[lo])) * sourceStep;
  };
  const positionAt = (s) => rawPoint(sourceAt(s));
  const tangentAt = (s) =>
    positionAt(Math.min(length, s + 0.2))
      .sub(positionAt(Math.max(0, s - 0.2)))
      .normalize();
  const frameCount = Math.ceil(length / 2),
    frameStep = length / frameCount;
  const references = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, i) => tangentAt(i * frameStep)),
    frameStep,
    false,
  );
  const rollAt = (h) => {
    let angle = 0;
    for (let i = 0; i < sourceJumps.length - 1; i++) {
      const a = sourceJumps[i],
        b = sourceJumps[i + 1];
      const start = a.h + a.receivingEnd + 8,
        end = b.h - 155;
      if (h > start && h < end && h < VARIATION_START)
        angle =
          Math.sign(b.x - a.x) *
          0.18 *
          Math.sin((Math.PI * (h - start)) / (end - start)) ** 2;
    }
    for (const section of profiles) {
      const u = physicalProgress(section, h);
      if (section.kind === 'sweep')
        angle -= 0.7 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
      if (section.kind === 'corkscrew')
        angle +=
          2 *
          Math.PI *
          (rotationProgress(u / 0.56) + rotationProgress((u - 0.56) / 0.44));
      if (section.kind === 'inversion') {
        angle +=
          u < 0.35
            ? Math.PI * smooth(u / 0.35)
            : u <= 0.65
              ? Math.PI
              : Math.PI + Math.PI * smooth((u - 0.65) / 0.35);
      }
    }
    for (const piece of variationPieces) {
      if (piece.kind !== 'turn' || h <= piece.start || h >= piece.end) continue;
      const u = (h - piece.start) / (piece.end - piece.start);
      angle -=
        piece.start === 8050
          ? (Math.PI / 2) * smooth(u / 0.18) * (1 - smooth((u - 0.75) / 0.25))
          : (piece.start < 7420 ? 0.85 : 1) * Math.sin(Math.PI * u) ** 2;
    }
    return angle;
  };
  function sample(s) {
    const d = clamp(s, 0, length),
      f = d / frameStep,
      i = Math.min(frameCount - 1, Math.floor(f));
    const reference = references[i].clone().slerp(references[i + 1], f - i);
    const tangent = tangentAt(d),
      roll = rollAt(sourceAt(d)),
      bank = Math.atan2(Math.sin(roll), Math.cos(roll));
    const right = new T.Vector3(1, 0, 0).applyQuaternion(reference);
    right
      .addScaledVector(tangent, -right.dot(tangent))
      .normalize()
      .applyAxisAngle(tangent, roll);
    const up = tangent.clone().cross(right).normalize();
    const position = positionAt(d);
    // The 2x2 grid is physically staged behind the timed start, never at the finish.
    if (s < 0) position.addScaledVector(tangent, Math.max(-80, s));
    return {
      position,
      tangent,
      right,
      up,
      bank,
      roll,
      quaternion: new T.Quaternion().setFromRotationMatrix(
        new T.Matrix4().makeBasis(right, up, tangent),
      ),
      curvature: tangentAt(Math.min(length, d + 1))
        .sub(tangentAt(Math.max(0, d - 1)))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const jumps = sourceJumps.map((j) => ({
    id: j.id,
    label: j.label,
    hero: j.hero,
    takeoff: distanceAt(j.h),
    landingStart: distanceAt(j.h + j.gap),
    landingEnd: distanceAt(j.h + j.receivingEnd),
    recovery: distanceAt(j.h + j.receivingEnd - 65),
    halfWidth: WIDTH / 2,
    targetSpeed: j.hero ? 130 : 112,
    sourceTakeoff: j.h,
    sourceLanding: j.h + j.gap,
    ...(j.hero || j.id === 'last-relay' ? { launchAlignment: 120 } : {}),
  }));
  const finishDistance = distanceAt(10420);
  const descents = profiles.map((section) => ({
    id: section.id,
    name: section.name,
    kind: section.kind,
    sourceStart: section.start,
    sourceEnd: section.end,
    start: distanceAt(section.start),
    end: distanceAt(section.end),
    addedDrop: section.drop,
    turns: section.turns ?? (section.kind === 'inversion' ? 1 : 0),
    ...(section.kind === 'inversion'
      ? {
          rollInEnd: distanceAt(
            sourceAtAcceleratorZ(section.zStart + section.zLength * 0.35),
          ),
          holdEnd: distanceAt(
            sourceAtAcceleratorZ(section.zStart + section.zLength * 0.65),
          ),
        }
      : {}),
  }));
  const inversions = descents.filter((section) => section.kind !== 'sweep');
  const variations = [
    {
      id: 'avalanche-sweep',
      name: 'Avalanche Sweep',
      sourceStart: 6160,
      sourceEnd: 7420,
      kind: 'banked-sweep',
      addedDrop: 220,
    },
    {
      id: 'scissor-dive',
      name: 'Scissor Dive',
      sourceStart: 7420,
      sourceEnd: 8850,
      kind: 'underpass',
      addedDrop: 680,
    },
  ].map((section) => {
    const start = distanceAt(section.sourceStart),
      end = distanceAt(section.sourceEnd),
      bounds = new T.Box3();
    for (let distance = start; distance <= end; distance += 8)
      bounds.expandByPoint(positionAt(distance));
    bounds.expandByPoint(positionAt(end));
    bounds.expandByScalar(WIDTH / 2 + 45);
    return { ...section, start, end, bounds };
  });
  const crossings = [];
  const firstBend = variationPieces[5],
    lowerBend = variationPieces[6];
  const cross2 = (a, b) => a.x * b.z - a.z * b.x;
  for (let upper = firstBend.start; upper < firstBend.end; upper += 0.5) {
    const a = rawPoint(upper),
      b = rawPoint(upper + 0.5),
      ab = b.clone().sub(a);
    for (let lower = lowerBend.start; lower < lowerBend.end; lower += 0.5) {
      const c = rawPoint(lower),
        d = rawPoint(lower + 0.5),
        cd = d.clone().sub(c),
        determinant = cross2(ab, cd);
      if (Math.abs(determinant) < 1e-8) continue;
      const ac = c.clone().sub(a),
        upperT = cross2(ac, cd) / determinant,
        lowerT = cross2(ac, ab) / determinant;
      if (upperT < 0 || upperT >= 1 || lowerT < 0 || lowerT >= 1) continue;
      const upperSource = upper + 0.5 * upperT,
        lowerSource = lower + 0.5 * lowerT,
        upperPoint = rawPoint(upperSource),
        lowerPoint = rawPoint(lowerSource);
      crossings.push({
        id: 'scissor-underpass',
        upperSource,
        lowerSource,
        upperDistance: distanceAt(upperSource),
        lowerDistance: distanceAt(lowerSource),
        upperPoint,
        lowerPoint,
        verticalClearance: upperPoint.y - lowerPoint.y,
        // Conservative road, 12 m lamps and chase/craft envelopes on both decks.
        envelopeClearance: upperPoint.y - lowerPoint.y - WIDTH - 32,
      });
    }
  }
  const definitions = [
    ['summit', 'Summit Array', 0, 40],
    ['summit-chute', 'Summit Chute', 80, 180],
    ['summit-run', 'Summit Array', 270, 800],
    ['severance', 'Severance Reach', 1450, 1600],
    ['service-corkscrew', 'Service Corkscrew', 2810, 2875],
    ['service', 'Service Cut', 2940, 3470],
    ['crown', 'Crown Valley', 4130, 4230],
    ['overturn-descent', 'Overturn Descent', 5480, 5555],
    ['fracture', 'Fracture Run', 5630, 6000],
    ['avalanche-sweep', 'Avalanche Sweep', 6160, 6850],
    ['scissor-dive', 'Scissor Dive', 7420, 8110],
    ['horizon', 'Horizon Array', 8850, 8920],
  ];
  const sections = definitions.map(([id, name, start, showcase], i) => ({
    id,
    name,
    start: distanceAt(start),
    end:
      i + 1 < definitions.length ? distanceAt(definitions[i + 1][2]) : length,
    showcase: distanceAt(showcase),
    representative: true,
  }));
  const scenarios = {
    staging: { distance: 0, speed: 0 },
    inspection: { distance: 40, speed: 0 },
    'finish-approach': { distance: finishDistance - 120, speed: 112 },
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = {
      distance: section.showcase,
      speed: 0,
    };
  for (const section of descents) {
    scenarios[`${section.id}-approach`] = {
      distance: section.start - 65,
      speed: 112,
    };
    scenarios[`${section.id}-showcase`] = {
      distance: (section.start + section.end) / 2,
      speed: 0,
    };
  }
  for (const section of variations)
    scenarios[`${section.id}-approach`] = {
      distance: section.start - 65,
      speed: 112,
    };
  if (crossings.length)
    scenarios['scissor-underpass-approach'] = {
      distance: crossings[0].lowerDistance - 180,
      speed: 112,
    };
  for (const jump of jumps) {
    scenarios[`${jump.id}-approach`] = {
      distance: jump.takeoff - 180,
      speed: 90,
      lateral: 0,
      heading: 0,
    };
    scenarios[`${jump.id}-launch`] = {
      distance: jump.takeoff - 0.8,
      speed: 130,
      lateral: 0,
      heading: 0,
    };
    scenarios[`${jump.id}-short`] = {
      distance: jump.takeoff - 0.8,
      speed: 55,
      lateral: 0,
      heading: 0,
    };
    scenarios[`${jump.id}-landing`] = {
      distance: jump.landingEnd - 90,
      speed: 0,
      lateral: 0,
      heading: 0,
    };
  }
  const checkpointDistances = [
    0,
    ...jumps.map((j) => j.landingStart),
    finishDistance,
  ];
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new T.Box3();
  for (let s = 0; s <= length; s += 8) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(WIDTH / 2 + 4);
  const isGap = (s) => jumps.some((j) => s > j.takeoff && s < j.landingStart);
  const nearestSourceAt = (position, { sourceHint } = {}) => {
    const score = (source) => {
      const p = rawPoint(source);
      return (
        (p.x - position.x) ** 2 +
        (p.z - position.z) ** 2 +
        (Number.isFinite(position.y) ? (p.y - position.y) ** 2 : 0)
      );
    };
    let bestSource = 0,
      bestScore = Infinity;
    for (let source = 0; source <= HORIZONTAL_LENGTH; source += 5) {
      const value = score(source);
      if (
        value < bestScore - 1e-6 ||
        (Math.abs(value - bestScore) <= 1e-6 &&
          Number.isFinite(sourceHint) &&
          Math.abs(source - sourceHint) < Math.abs(bestSource - sourceHint))
      ) {
        bestSource = source;
        bestScore = value;
      }
    }
    let lo = Math.max(0, bestSource - 5),
      hi = Math.min(HORIZONTAL_LENGTH, bestSource + 5);
    for (let i = 0; i < 30; i++) {
      const a = lo + (hi - lo) / 3,
        b = hi - (hi - lo) / 3;
      if (score(a) < score(b)) hi = b;
      else lo = a;
    }
    return (lo + hi) / 2;
  };
  return {
    id: 'shatterline-mass-driver',
    name: 'Shatterline',
    closed: false,
    geometryVersion: 'shatterline-fold-v5',
    descentGrade: DESCENT_GRADE,
    length,
    width: WIDTH,
    finishDistance,
    groundY: -120,
    sample,
    jumps,
    descents,
    inversions,
    variations,
    crossings,
    sections,
    checkpoints,
    scenarios,
    bounds,
    isGap,
    sourceAt,
    distanceAt,
    spineZAt,
    sourceAtSpineZ,
    // Compatibility aliases: these are spine coordinates, not physical road Z.
    worldZAt: spineZAt,
    sourceAtWorldZ: sourceAtSpineZ,
    pointAtSource: (source) => rawPoint(clamp(source, 0, HORIZONTAL_LENGTH)),
    nearestSourceAt,
    sourceLength: HORIZONTAL_LENGTH,
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'bare-track',
      description:
        'A mountain-scale downhill sprint: asymmetric double corkscrew, inverted descent, banked Avalanche Sweep and crossing Scissor Dive, twelve physical gaps and three five-second flights.',
    },
  };
}
