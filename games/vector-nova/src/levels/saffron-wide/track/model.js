import * as THREE from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 32;
const HORIZONTAL_LENGTH = 5120;
const wrap = (s, length) => ((s % length) + length) % length;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const envelope = (s, a, b, c, d, degrees) =>
  THREE.MathUtils.degToRad(degrees) *
  smooth((s - a) / (b - a)) *
  (1 - smooth((s - c) / (d - c)));

// Fossil-facing outer panorama, an inward skull descent, then the broken spine.
// The receiving vertebrae are genuinely straight; no flight attraction is used.
export function createSaffronTrack() {
  const nodes = [
    [0, 0],
    [0, 250],
    [100, 430],
    [330, 470],
    [580, 380],
    [740, 530],
    [1030, 550],
    [1270, 525],
    [1460, 455],
    [1600, 270],
    [1530, 35],
    [1380, -190],
    [1200, -250],
    [980, -250],
    [720, -250],
    [460, -250],
    [200, -250],
    [0, -350],
    [-170, -250],
    [-130, -40],
  ];
  const makeCurve = (scale) => {
    const curve = new THREE.CatmullRomCurve3(
      nodes.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 32000;
    curve.updateArcLengths();
    return curve;
  };
  const scale = HORIZONTAL_LENGTH / makeCurve(1).getLength();
  const curve = makeCurve(scale);
  const arc = curve.getLengths(32000);
  const station = (index) => arc[Math.round((index / nodes.length) * 32000)];
  const first = station(12) + 80;
  const second = first + 520;
  const dune = station(3) + 42;
  const pitch = Math.tan(THREE.MathUtils.degToRad(8));
  const heights = [
    [0, 60, 0],
    [station(1), 94, 0],
    [station(2), 120, 0],
    [dune - 70, 112, 0.06],
    [dune, 120, pitch],
    [dune + 95, 106, 0],
    [dune + 300, 106, 0],
    [station(5), 132, 0],
    [station(6), 150, 0],
    [station(8), 132, -0.07],
    [station(9), 104, -0.12],
    [station(10), 61, -0.18],
    [station(11), 35, 0],
    [first - 75, 38, 0],
    [first, 47, pitch],
    [first + 85, 33, 0],
    [first + 390, 33, 0],
    [second - 70, 33, 0],
    [second, 42, pitch],
    [second + 105, 20, 0],
    [second + 420, 20, 0],
    [station(17), 62, 0.18],
    [station(18), 96, 0],
    [station(19), 73, -0.1],
    [HORIZONTAL_LENGTH, 60, 0],
  ].sort((a, b) => a[0] - b[0]);
  const heightAt = (s) => {
    const d = wrap(s, HORIZONTAL_LENGTH);
    let i = 0;
    while (i < heights.length - 2 && heights[i + 1][0] < d) i++;
    const [a, ya, ma] = heights[i],
      [b, yb, mb] = heights[i + 1];
    const t = (d - a) / (b - a);
    return (
      (2 * t ** 3 - 3 * t * t + 1) * ya +
      (t ** 3 - 2 * t * t + t) * (b - a) * ma +
      (-2 * t ** 3 + 3 * t * t) * yb +
      (t ** 3 - t * t) * (b - a) * mb
    );
  };
  const rawPoint = (s) => {
    const p = curve.getPointAt(wrap(s, HORIZONTAL_LENGTH) / HORIZONTAL_LENGTH);
    p.y = heightAt(s);
    return p;
  };
  const count = 16000,
    sourceStep = HORIZONTAL_LENGTH / count;
  const cumulative = [0];
  let previous = rawPoint(0);
  for (let i = 1; i <= count; i++) {
    const p = rawPoint(i * sourceStep);
    cumulative.push(cumulative.at(-1) + p.distanceTo(previous));
    previous = p;
  }
  const length = cumulative.at(-1);
  const distanceAt = (s) => {
    if (s === HORIZONTAL_LENGTH) return length;
    const f = s / sourceStep,
      i = Math.floor(f);
    return THREE.MathUtils.lerp(cumulative[i], cumulative[i + 1], f - i);
  };
  const sourceAt = (s) => {
    const d = wrap(s, length);
    let lo = 0,
      hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= d) lo = mid;
      else hi = mid;
    }
    return (
      (lo + (d - cumulative[lo]) / (cumulative[lo + 1] - cumulative[lo])) *
      sourceStep
    );
  };
  const positionAt = (s) => rawPoint(sourceAt(s));
  const tangentAt = (s) =>
    positionAt(s + 0.12)
      .sub(positionAt(s - 0.12))
      .normalize();
  const frameCount = Math.ceil(length / 2),
    frameStep = length / frameCount;
  const references = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, i) => tangentAt(i * frameStep)),
    frameStep,
  );
  const bankAt = (h) =>
    envelope(h, 70, 180, station(2) - 60, station(2) + 75, 25) +
    envelope(h, dune + 320, dune + 400, station(5) - 75, station(5) + 25, -30) +
    envelope(h, station(5) + 40, station(6), station(7), station(8) + 15, 9) +
    envelope(
      h,
      station(8) + 20,
      station(9) - 20,
      station(10) + 35,
      station(11) - 45,
      31,
    ) +
    envelope(
      h,
      second + 430,
      second + 495,
      station(17) - 30,
      station(18) - 20,
      -34,
    ) +
    envelope(
      h,
      station(18) + 10,
      station(18) + 90,
      station(19) - 10,
      HORIZONTAL_LENGTH - 25,
      28,
    );
  function sample(s) {
    const d = wrap(s, length),
      f = d / frameStep,
      i = Math.floor(f);
    const reference = references[i].clone().slerp(references[i + 1], f - i);
    const tangent = tangentAt(d),
      bank = bankAt(sourceAt(d));
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(reference)
      .addScaledVector(
        tangent,
        -new THREE.Vector3(1, 0, 0).applyQuaternion(reference).dot(tangent),
      )
      .normalize()
      .applyAxisAngle(tangent, bank);
    const up = tangent.clone().cross(right).normalize();
    return {
      position: positionAt(d),
      tangent,
      right,
      up,
      bank,
      roll: bank,
      quaternion: new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(right, up, tangent),
      ),
      curvature: tangentAt(d + 1)
        .sub(tangentAt(d - 1))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const jumps = [
    {
      id: 'dune-skip',
      takeoff: dune,
      landingStart: dune + 65,
      landingEnd: dune + 255,
      recovery: dune + 280,
      optional: true,
      lateralMin: 4.5,
    },
    {
      id: 'first-vertebra',
      takeoff: first,
      landingStart: first + 85,
      landingEnd: first + 400,
      recovery: first + 425,
    },
    {
      id: 'second-vertebra',
      takeoff: second,
      landingStart: second + 105,
      landingEnd: second + 435,
      recovery: second + 460,
    },
  ].map((j) => ({
    ...j,
    takeoff: distanceAt(j.takeoff),
    landingStart: distanceAt(j.landingStart),
    landingEnd: distanceAt(j.landingEnd),
    recovery: distanceAt(j.recovery),
    halfWidth: WIDTH / 2,
  }));
  const definitions = [
    [
      'anchorage',
      'Ochre Anchorage',
      0,
      160,
      'Survey station, open crest and a first view of the fossil.',
    ],
    [
      'ribshadow',
      'Ribshadow Reach',
      station(2) - 60,
      dune - 80,
      'Varied rib shadows and the optional dune-crest jump.',
    ],
    [
      'sandfall',
      'Sandfall Gallery',
      dune + 295,
      station(5) - 90,
      'An offset braking sequence beside sheltered sand cascades.',
    ],
    [
      'vista',
      'Leviathan Vista',
      station(5) + 100,
      station(7),
      'A shallow evolving panoramic arc reveals the skull.',
    ],
    [
      'marrow',
      'Marrow Switch',
      station(8) + 20,
      station(10),
      'Descend into the skull and bank toward the first broken vertebra.',
    ],
    [
      'vertebrae',
      'Broken Spine',
      first - 85,
      second - 75,
      'Two open vertebral gaps with visible receiving shelves.',
    ],
    [
      'amber',
      'Amber Crest',
      second + 430,
      station(17),
      'Rise from the bone trough to a wind-carved ridge.',
    ],
    [
      'return',
      'Siltwake Return',
      station(18),
      station(19),
      'Offset descent and buried rib tips lead back to the station.',
    ],
  ];
  const sections = definitions.map(
    ([id, name, start, showcase, description], i) => ({
      id,
      name,
      start: distanceAt(start),
      end:
        i + 1 < definitions.length ? distanceAt(definitions[i + 1][2]) : length,
      showcase: distanceAt(showcase),
      description,
      representative: true,
      banked: id !== 'vertebrae',
      tunnel: id === 'marrow',
    }),
  );
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(35),
    'bank-rest': parked(distanceAt(station(10))),
    'slope-rest': parked(distanceAt(station(9))),
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  let hardestApex = 0,
    maxCurvature = 0;
  for (let s = 0; s < length; s += 2) {
    const k = Math.abs(sample(s).curvature);
    if (k > maxCurvature) {
      maxCurvature = k;
      hardestApex = s;
    }
  }
  scenarios['hardest-turn'] = parked(wrap(hardestApex - 70, length));
  scenarios['fast-corner'] = { ...scenarios['hardest-turn'], speed: 75 };
  scenarios.impact = { ...parked(120), speed: 90, lateral: 13, heading: 0.12 };
  for (const [i, jump] of jumps.entries()) {
    scenarios[`jump${i + 1}-approach`] = parked(jump.takeoff - 135);
    for (const [name, speed, heading] of [
      ['success', 112, 0],
      ['short', 52, 0],
      ['long', 157, 0],
      ['lateral', 110, 0.27],
      ['cruise70', 78.4, 0],
      ['boost70', 109.9, 0],
    ])
      scenarios[`jump${i + 1}-${name}`] = {
        ...parked(jump.takeoff - 0.8),
        speed,
        heading,
        lateral: jump.optional ? 8 : 0,
      };
  }
  // The second gap has a straight, supported approach on the first receiving
  // shelf. From rest this leaves 320 m for ordinary throttle, boost and misses.
  scenarios['jump-playtest'] = parked(jumps[2].takeoff - 320);
  scenarios['skull-descent'] = {
    ...parked(distanceAt(station(8) + 45)),
    speed: 65,
  };
  scenarios['sand-glass'] = {
    ...parked(jumps[0].takeoff + 100),
    speed: 85,
    lateral: -9,
  };
  scenarios['sand-deep'] = { ...scenarios['sand-glass'], lateral: 9 };
  const checkpointDistances = [
    0,
    distanceAt(station(2) - 50),
    jumps[0].landingStart,
    distanceAt(station(5) + 50),
    distanceAt(station(9)),
    jumps[1].landingStart,
    jumps[2].landingStart,
    distanceAt(station(18)),
  ];
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new THREE.Box3();
  for (let s = 0; s < length; s += 4) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(WIDTH / 2 + 3);
  const isGap = (s) =>
    jumps.some(
      (j) =>
        !j.optional &&
        wrap(s, length) > j.takeoff &&
        wrap(s, length) < j.landingStart,
    );
  const landmarks = Object.fromEntries(
    Object.entries({
      vistaStart: station(5) + 100,
      vistaEnd: station(8) + 20,
      skullStart: station(9) + 25,
      skullCenter: station(9) + 165,
      skullEnd: station(10) + 65,
      firstSpine: first,
      secondSpine: second,
      sandfall: station(5) - 90,
      station: 0,
    }).map(([key, s]) => [key, distanceAt(s)]),
  );
  scenarios['skull-interior'] = { ...parked(landmarks.skullCenter), time: 32 };
  scenarios['burrower-ridge'] = {
    ...parked(landmarks.vistaStart + 120),
    time: 18,
  };
  scenarios['burrower-breach'] = {
    ...parked(landmarks.vistaEnd - 120),
    time: 32,
  };
  scenarios.sandfalls = { ...parked(landmarks.sandfall), time: 32 };
  return {
    id: 'saffron-wide-leviathan',
    name: 'Saffron Wide',
    geometryVersion: 'saffron-wide-fossil-route-v1',
    length,
    width: WIDTH,
    groundY: -52,
    sample,
    jumps,
    sections,
    checkpoints,
    scenarios,
    bounds,
    landmarks,
    isGap,
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'bare-track',
      description:
        'Fossil descent, two open vertebral gaps, optional dune skip and continuous grounded banks.',
    },
  };
}
