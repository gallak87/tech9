import * as THREE from 'three';

const WIDTH = 30;
const HORIZONTAL_LENGTH = 4750;
const wrap = (s, length) => ((s % length) + length) % length;
const smooth = (v) => {
  const t = THREE.MathUtils.clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
const bankEnvelope = (s, a, b, c, d, degrees) =>
  THREE.MathUtils.degToRad(degrees) *
  smooth((s - a) / (b - a)) *
  (1 - smooth((s - c) / (d - c)));

// The long horizontal straights contain the two authored takeoff/landing pairs.
// Elevation is independent of footprint so the submerged half truly crosses Y=0.
export function createLevel3Track() {
  const source = [
    [0, 0],
    [0, 220],
    [130, 400],
    [400, 450],
    [650, 450],
    [900, 450],
    [1100, 450],
    [1280, 250],
    [1150, 0],
    [1250, -250],
    [1120, -510],
    [850, -600],
    [650, -600],
    [400, -600],
    [180, -600],
    [-100, -600],
    [-240, -360],
    [-80, -140],
  ];
  let curve = new THREE.CatmullRomCurve3(
    source.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 48000;
  curve.updateArcLengths();
  const scale = HORIZONTAL_LENGTH / curve.getLength();
  curve = new THREE.CatmullRomCurve3(
    source.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)),
    true,
    'centripetal',
  );
  curve.arcLengthDivisions = 48000;
  curve.updateArcLengths();
  const horizontalLength = curve.getLength();
  const curvePoint = (s) =>
    curve.getPointAt(wrap(s, horizontalLength) / horizontalLength);
  const sourceDistance = (index) => {
    const parameter = index / source.length;
    const arc = curve.getLengths(48000);
    const x = parameter * 48000;
    const i = Math.floor(x);
    return THREE.MathUtils.lerp(
      arc[i],
      arc[Math.min(i + 1, arc.length - 1)],
      x - i,
    );
  };
  const first = sourceDistance(4) + 28;
  const second = sourceDistance(12) + 14;
  const jumpDefinitions = [
    {
      id: 'storm-leap',
      takeoff: first,
      gap: 100,
      landingLength: 370,
      takeoffY: 68,
      landingY: 56,
      pitch: 10,
      targetSpeed: 112,
    },
    {
      id: 'abyss-crossing',
      takeoff: second,
      gap: 180,
      landingLength: 420,
      takeoffY: -82,
      landingY: -134,
      pitch: 10,
      targetSpeed: 112,
    },
  ];
  // A real straight catch corridor contains the full ballistic speed envelope.
  // Blend back into the existing district footprint only beyond the recovery
  // apron; no trajectory steering, added impulse or launch-speed clamp is used.
  const straightRunouts = [
    { takeoff: first, flatEnd: 520, blendEnd: 700, direction: 1 },
    { takeoff: second, flatEnd: 650, blendEnd: 795, direction: -1 },
  ].map((runout) => ({ ...runout, anchor: curvePoint(runout.takeoff) }));
  const horizontalPoint = (s) => {
    const distance = wrap(s, horizontalLength);
    const p = curvePoint(distance);
    for (const runout of straightRunouts) {
      const offset = distance - runout.takeoff;
      if (offset <= -250 || offset >= runout.blendEnd) continue;
      const weight =
        smooth((offset + 250) / 70) *
        (1 -
          smooth(
            (offset - runout.flatEnd) / (runout.blendEnd - runout.flatEnd),
          ));
      const straight = runout.anchor.clone();
      straight.x += offset * runout.direction;
      p.lerp(straight, weight);
    }
    return p;
  };
  // Lower, longer receiving decks catch aligned cruise and boost trajectories.
  // Hermite heights preserve exact launch gradients and flat recovery aprons.
  const heightKeys = [
    [0, 40, 0],
    [250, 76, 0],
    [first - 140, 54, 0],
    [first - 60, 58.5, Math.tan(THREE.MathUtils.degToRad(8))],
    [first, 68, Math.tan(THREE.MathUtils.degToRad(10))],
    [first + 100, 56, 0],
    [first + 520, 56, 0],
    [first + 760, -55, -0.1],
    [second - 470, -104, 0],
    [second - 140, -96, 0],
    [second - 60, -91.5, Math.tan(THREE.MathUtils.degToRad(8))],
    [second, -82, Math.tan(THREE.MathUtils.degToRad(10))],
    [second + 180, -134, 0],
    [second + 650, -134, 0],
    [horizontalLength - 460, 70, 0],
    [horizontalLength - 190, 56, -0.06],
    [horizontalLength, 40, 0],
  ].sort((a, b) => a[0] - b[0]);
  const height = (s) => {
    const d = wrap(s, horizontalLength);
    let i = 0;
    while (i < heightKeys.length - 2 && heightKeys[i + 1][0] < d) i += 1;
    const [a, ya, ma] = heightKeys[i];
    const [b, yb, mb] = heightKeys[i + 1];
    const t = (d - a) / (b - a);
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * ya +
      (t ** 3 - 2 * t ** 2 + t) * (b - a) * ma +
      (-2 * t ** 3 + 3 * t ** 2) * yb +
      (t ** 3 - t ** 2) * (b - a) * mb
    );
  };
  const rawPoint = (s) => {
    const p = horizontalPoint(s);
    p.y = height(s);
    return p;
  };
  const count = Math.ceil(horizontalLength * 2);
  const step = horizontalLength / count;
  const lengths = [0];
  let previous = rawPoint(0);
  for (let i = 1; i <= count; i += 1) {
    const next = rawPoint(i * step);
    lengths.push(lengths.at(-1) + next.distanceTo(previous));
    previous = next;
  }
  const length = lengths.at(-1);
  const routeDistance = (horizontal) => {
    const f = horizontal / step;
    const i = Math.floor(f);
    return THREE.MathUtils.lerp(
      lengths[i],
      lengths[Math.min(count, i + 1)],
      f - i,
    );
  };
  const horizontalDistance = (s) => {
    const d = wrap(s, length);
    let lo = 0;
    let hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] <= d) lo = mid;
      else hi = mid;
    }
    return (lo + (d - lengths[lo]) / (lengths[lo + 1] - lengths[lo])) * step;
  };
  const positionAt = (s) => rawPoint(horizontalDistance(s));
  const tangentAt = (s) =>
    positionAt(s + 0.15)
      .sub(positionAt(s - 0.15))
      .normalize();
  const bankAt = (h) =>
    bankEnvelope(h, 35, 185, 290, 420, 31) +
    bankEnvelope(h, 440, 520, 600, first - 150, -26) +
    bankEnvelope(h, first + 530, first + 610, first + 650, first + 790, 35) +
    bankEnvelope(h, first + 800, first + 880, first + 1000, first + 1110, -42) +
    bankEnvelope(
      h,
      first + 1120,
      first + 1260,
      second - 400,
      second - 200,
      52,
    ) +
    bankEnvelope(
      h,
      second + 660,
      second + 750,
      horizontalLength - 620,
      horizontalLength - 450,
      38,
    ) +
    bankEnvelope(
      h,
      horizontalLength - 410,
      horizontalLength - 320,
      horizontalLength - 180,
      horizontalLength - 35,
      -44,
    );
  function sample(s) {
    const tangent = tangentAt(s);
    const right = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
    const bank = bankAt(horizontalDistance(s));
    right.applyAxisAngle(tangent, bank);
    const up = tangent.clone().cross(right).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
    return {
      position: positionAt(s),
      tangent,
      right,
      up,
      quaternion,
      bank,
      roll: bank,
      curvature: tangentAt(s + 1)
        .sub(tangentAt(s - 1))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const jumps = jumpDefinitions.map((jump) => ({
    ...jump,
    takeoff: routeDistance(jump.takeoff),
    landingStart: routeDistance(jump.takeoff + jump.gap),
    landingEnd: routeDistance(jump.takeoff + jump.gap + jump.landingLength),
    recovery: routeDistance(jump.takeoff + jump.gap + jump.landingLength + 22),
    halfWidth: WIDTH / 2,
    recoveryDelay: 1.5,
  }));
  const definitions = [
    [
      'grid',
      'Tide observatory grid',
      0,
      260,
      'Rising pearl causeway under the storm.',
    ],
    [
      'breaker',
      'Breaker causeway',
      440,
      600,
      'Bank reversals prepare the exposed straight.',
    ],
    [
      'storm',
      'Storm leap',
      first - 165,
      first - 65,
      '100 m open-water jump; align the craft before the ramp.',
    ],
    [
      'breach',
      'Surface breach',
      first + 525,
      first + 690,
      'Descent through the actual ocean surface.',
    ],
    [
      'trench',
      'Luminous trench',
      first + 780,
      first + 1170,
      'Sustained submerged banks and tighter line choices.',
    ],
    [
      'abyss',
      'Abyss crossing',
      second - 200,
      second - 65,
      '180 m submerged jump above the seabed.',
    ],
    [
      'ascent',
      'Eye ascent',
      second + 655,
      horizontalLength - 600,
      'Climb out of the ocean into the storm eye.',
    ],
    [
      'return',
      'Crown return',
      horizontalLength - 435,
      horizontalLength - 250,
      'A braking turn returns to the observatory grid.',
    ],
  ];
  const sections = definitions.map(
    ([id, name, start, showcase, description], i) => ({
      id,
      name,
      start: routeDistance(start),
      end:
        i + 1 === definitions.length
          ? length
          : routeDistance(definitions[i + 1][2]),
      showcase: routeDistance(showcase),
      description,
      representative: true,
      banked: !['storm', 'abyss'].includes(id),
      tunnel: false,
    }),
  );
  let hardestApex = 0;
  let maximumCurvature = 0;
  for (let distance = 0; distance < length; distance += 1) {
    const curvature = Math.abs(sample(distance).curvature);
    if (curvature > maximumCurvature) {
      maximumCurvature = curvature;
      hardestApex = distance;
    }
  }
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(32),
    bank: parked(routeDistance(first + 1170)),
    'bank-rest': parked(routeDistance(first + 1170)),
    'hardest-turn': parked(wrap(hardestApex - 80, length)),
    'slope-rest': parked(routeDistance(horizontalLength - 570)),
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  for (let i = 0; i < jumps.length; i += 1) {
    const jump = jumps[i];
    scenarios[`jump${i + 1}-approach`] = parked(jump.takeoff - 135);
    for (const [name, speed, heading] of [
      ['success', 112, 0],
      ['cruise70', 78.4, 0],
      ['boost70', 109.9, 0],
      ['short', 52, 0],
      ['lateral', 110, 0.27],
      ['long', 157, 0],
    ])
      scenarios[`jump${i + 1}-${name}`] = {
        ...parked(jump.takeoff - 0.8),
        speed,
        heading,
      };
  }
  const crossings = [];
  for (let d = 1; d < length; d += 1)
    if (sample(d - 1).position.y * sample(d).position.y < 0) crossings.push(d);
  scenarios['surface-entry'] = parked(crossings[0] - 35);
  scenarios['surface-entry-fast'] = {
    ...parked(crossings[0] - 60),
    speed: 110,
  };
  scenarios['surface-exit'] = parked(crossings[1] - 35);
  scenarios['fast-corner'] = { ...scenarios['hardest-turn'], speed: 80 };
  scenarios.impact = { ...parked(85), lateral: 12, speed: 85, heading: 0.12 };
  const checkpointDistances = [
    0,
    routeDistance(590),
    jumps[0].landingStart,
    routeDistance(first + 650),
    routeDistance(first + 1190),
    jumps[1].landingStart,
    routeDistance(horizontalLength - 500),
    routeDistance(horizontalLength - 160),
  ];
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new THREE.Box3();
  for (let d = 0; d < length; d += 4) bounds.expandByPoint(sample(d).position);
  bounds.expandByScalar(WIDTH / 2 + 3);
  const isGap = (s) =>
    jumps.some(
      (j) => wrap(s, length) > j.takeoff && wrap(s, length) < j.landingStart,
    );
  return {
    id: 'nacre-tempest-1-shape',
    name: 'Nacre Tempest',
    geometryVersion: 'nacre-jump-ramps-v3',
    length,
    width: WIDTH,
    waterY: 0,
    groundY: -175,
    sample,
    jumps,
    sections,
    checkpoints,
    scenarios,
    bounds,
    surfaceCrossings: crossings,
    isGap,
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'bare-track',
      waterY: 0,
      description:
        'Shape, true submersion, two real jumps and representative ceramic/fin sample.',
    },
  };
}
