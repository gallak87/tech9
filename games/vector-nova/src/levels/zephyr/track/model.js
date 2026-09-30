import * as THREE from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 32;
const TARGET_LENGTH = 4900;
const wrap = (s, length) => ((s % length) + length) % length;
const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const envelope = (s, a, b, c, d, degrees) =>
  THREE.MathUtils.degToRad(degrees) *
  smooth((s - a) / (b - a)) *
  (1 - smooth((s - c) / (d - c)));

// Two open bridge transfers are deliberately straight. The full turn of the
// cloud spiral crosses its own footprint at different, widely separated heights.
export function createZephyrTrack() {
  const source = [
    [0, 0],
    [0, 130],
    [-90, 240],
    [-240, 270],
    [-390, 180],
    [-420, 10],
    [-340, -160],
    [-180, -190],
    [0, -190],
    [180, -190],
    [330, -160],
    [420, -30],
    [440, 120],
    [440, 260],
    [440, 440],
    [440, 650],
    [396, 756],
    [290, 800],
    [184, 756],
    [140, 650],
    [184, 544],
    [290, 500],
    [396, 544],
    [440, 650],
    [440, 800],
    [320, 970],
    [80, 1050],
    [-180, 970],
    [-400, 810],
    [-540, 570],
    [-560, 250],
    [-470, -120],
    [-250, -340],
    [-60, -280],
    [0, -130],
  ];
  let scale = 1;
  let curve;
  for (let pass = 0; pass < 8; pass += 1) {
    curve = new THREE.CatmullRomCurve3(
      source.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)),
      true,
      'centripetal',
    );
    curve.arcLengthDivisions = 48000;
    curve.updateArcLengths();
    scale *= (TARGET_LENGTH - 90) / curve.getLength();
  }
  const horizontalLength = curve.getLength();
  const arc = curve.getLengths(48000);
  const sourceDistance = (index) => {
    const value = (index / source.length) * 48000;
    const lower = Math.floor(value);
    return THREE.MathUtils.lerp(arc[lower], arc[lower + 1], value - lower);
  };
  const curvePoint = (s) =>
    curve.getPointAt(wrap(s, horizontalLength) / horizontalLength);
  const first = sourceDistance(7) + 35;
  const second = sourceDistance(12) + 5;
  const spiralStart = sourceDistance(15);
  const spiralEnd = sourceDistance(23);
  const haloStart = sourceDistance(24);
  const returnStart = sourceDistance(28);
  const jumpDefinitions = [
    {
      id: 'falls-between',
      takeoff: first,
      gap: 82,
      landingLength: 220,
      takeoffY: 86,
      landingY: 78,
      pitch: 6,
      targetSpeed: 112,
    },
    {
      id: 'chapel-crossing',
      takeoff: second,
      gap: 96,
      landingLength: 250,
      takeoffY: 126,
      landingY: 114,
      pitch: 7,
      targetSpeed: 112,
    },
  ];
  const straightRuns = jumpDefinitions.map((jump, index) => ({
    ...jump,
    direction: new THREE.Vector3(index === 0 ? 1 : 0, 0, index === 1 ? 1 : 0),
    anchor: curvePoint(jump.takeoff),
    flatEnd: jump.gap + jump.landingLength + 24,
    blendEnd: jump.gap + jump.landingLength + 195,
  }));
  const horizontalPoint = (s) => {
    const distance = wrap(s, horizontalLength);
    const point = curvePoint(distance);
    for (const run of straightRuns) {
      const offset = distance - run.takeoff;
      if (offset < -185 || offset > run.blendEnd) continue;
      const weight =
        smooth((offset + 185) / 85) *
        (1 - smooth((offset - run.flatEnd) / (run.blendEnd - run.flatEnd)));
      const straight = run.anchor
        .clone()
        .addScaledVector(run.direction, offset);
      point.lerp(straight, weight);
    }
    return point;
  };
  const heightKeys = [
    [0, 32, 0],
    [sourceDistance(2), 56, 0.055],
    [sourceDistance(4), 76, 0],
    [first - 150, 76, 0],
    [first - 70, 80, Math.tan(THREE.MathUtils.degToRad(4))],
    [first, 86, Math.tan(THREE.MathUtils.degToRad(6))],
    [first + 82, 78, 0],
    [first + 330, 78, 0],
    [first + 420, 104, 0.09],
    [second - 100, 115, 0],
    [second - 60, 119, Math.tan(THREE.MathUtils.degToRad(6))],
    [second, 126, Math.tan(THREE.MathUtils.degToRad(7))],
    [second + 96, 114, 0],
    [second + 374, 114, 0],
    [spiralStart + 115, 131, 0.16],
    [spiralEnd, 284, 0.12],
    [haloStart + 100, 323, 0],
    [sourceDistance(26), 326, 0],
    [returnStart, 290, -0.14],
    [sourceDistance(30), 170, -0.2],
    [sourceDistance(31), 93, -0.15],
    [sourceDistance(32), 49, 0],
    [horizontalLength - 160, 32, 0],
    [horizontalLength, 32, 0],
  ].sort((a, b) => a[0] - b[0]);
  const heightAt = (s) => {
    const distance = wrap(s, horizontalLength);
    let i = 0;
    while (i < heightKeys.length - 2 && heightKeys[i + 1][0] < distance) i += 1;
    const [a, ya, ma] = heightKeys[i];
    const [b, yb, mb] = heightKeys[i + 1];
    const t = (distance - a) / (b - a);
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * ya +
      (t ** 3 - 2 * t ** 2 + t) * (b - a) * ma +
      (-2 * t ** 3 + 3 * t ** 2) * yb +
      (t ** 3 - t ** 2) * (b - a) * mb
    );
  };
  const rawPoint = (s) => {
    const point = horizontalPoint(s);
    point.y = heightAt(s);
    return point;
  };
  const count = Math.ceil(horizontalLength * 2);
  const step = horizontalLength / count;
  const distances = [0];
  let previous = rawPoint(0);
  for (let i = 1; i <= count; i += 1) {
    const point = rawPoint(i * step);
    distances.push(distances.at(-1) + point.distanceTo(previous));
    previous = point;
  }
  const length = distances.at(-1);
  const routeDistance = (horizontal) => {
    if (horizontal === horizontalLength) return length;
    const value = horizontal / step;
    const lower = Math.floor(value);
    return THREE.MathUtils.lerp(
      distances[lower],
      distances[lower + 1],
      value - lower,
    );
  };
  const horizontalDistance = (s) => {
    const distance = wrap(s, length);
    let lower = 0;
    let upper = count;
    while (lower + 1 < upper) {
      const mid = (lower + upper) >> 1;
      if (distances[mid] <= distance) lower = mid;
      else upper = mid;
    }
    return (
      (lower +
        (distance - distances[lower]) /
          (distances[lower + 1] - distances[lower])) *
      step
    );
  };
  const positionAt = (s) => rawPoint(horizontalDistance(s));
  const tangentAt = (s) =>
    positionAt(s + 0.2)
      .sub(positionAt(s - 0.2))
      .normalize();
  const bankAt = (h) =>
    envelope(h, 50, 160, sourceDistance(2), sourceDistance(3), 21) +
    envelope(
      h,
      sourceDistance(3),
      sourceDistance(4),
      sourceDistance(5),
      first - 175,
      32,
    ) +
    envelope(h, first + 325, first + 425, second - 175, second - 75, 78) +
    envelope(
      h,
      spiralStart + 90,
      spiralStart + 215,
      spiralEnd - 90,
      spiralEnd + 70,
      -31,
    ) +
    envelope(
      h,
      haloStart + 35,
      sourceDistance(25),
      sourceDistance(27),
      returnStart,
      -27,
    ) +
    envelope(
      h,
      returnStart + 40,
      sourceDistance(29),
      sourceDistance(30),
      sourceDistance(31),
      -25,
    ) +
    envelope(
      h,
      sourceDistance(31) + 30,
      sourceDistance(32),
      sourceDistance(33),
      horizontalLength - 45,
      -30,
    );
  const frameCount = Math.ceil(length);
  const frameStep = length / frameCount;
  const references = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, i) => tangentAt(i * frameStep)),
    frameStep,
  );
  const rotations = references.map((rotation, i) =>
    rotation
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          bankAt(horizontalDistance(i * frameStep)),
        ),
      ),
  );
  function sample(s) {
    const distance = wrap(s, length);
    const tangent = tangentAt(distance);
    const value = distance / frameStep;
    const lower = Math.floor(value);
    const rotation = rotations[lower]
      .clone()
      .slerp(rotations[lower + 1], value - lower);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
    right.addScaledVector(tangent, -right.dot(tangent)).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, tangent),
    );
    const bank = bankAt(horizontalDistance(distance));
    return {
      position: positionAt(distance),
      tangent,
      right,
      up,
      quaternion,
      bank,
      roll: bank,
      curvature: tangentAt(distance + 1)
        .sub(tangentAt(distance - 1))
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
      'narthex',
      'Narthex Mooring',
      0,
      sourceDistance(1),
      'A sheltered climbing S opens onto the bronze-supported archipelago.',
    ],
    [
      'sailcourt',
      'Sailcourt Arc',
      sourceDistance(3),
      sourceDistance(4),
      'Broad banked sails frame the open cloud depth.',
    ],
    [
      'falls',
      'Falls Between',
      first - 175,
      first - 100,
      'Commit through the waterfall curtain to the visible landing shelf.',
    ],
    [
      'choir',
      'Choir Archipelago',
      first + 375,
      first + 430,
      'Pierce the shattered rose window, ride the nave wall and leap to the chapel.',
    ],
    [
      'cloudspire',
      'Cloudspire Ascent',
      spiralStart + 75,
      spiralStart + (spiralEnd - spiralStart) * 0.55,
      'A full climbing spiral surrounds the central stone needle.',
    ],
    [
      'halo',
      'Halo Terrace',
      haloStart,
      sourceDistance(26),
      'Pale tension panels and a broken halo open over the earlier bridges.',
    ],
    [
      'bronzewake',
      'Bronzewake Return',
      returnStart,
      sourceDistance(30),
      'A stepped bronze descent returns to the original mooring.',
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
      banked: id !== 'falls',
      tunnel: id === 'choir',
    }),
  );
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const scenarios = {
    staging: parked(0),
    inspection: parked(25),
    bank: parked(routeDistance(first + 430)),
    'bank-rest': parked(routeDistance(first + 430)),
    'slope-rest': parked(routeDistance(spiralStart + 380)),
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  for (const [index, jump] of jumps.entries()) {
    scenarios[`jump${index + 1}-approach`] = parked(jump.takeoff - 150);
    for (const [name, speed, heading] of [
      ['success', 112, 0],
      ['cruise70', 78.4, 0],
      ['boost70', 109.9, 0],
      ['short', 52, 0],
      ['lateral', 110, 0.27],
      ['long', 157, 0],
    ]) {
      scenarios[`jump${index + 1}-${name}`] = {
        ...parked(jump.takeoff - 0.8),
        speed,
        heading,
      };
    }
  }
  let hardest = 0;
  for (let s = 1; s < length; s += 2)
    if (Math.abs(sample(s).curvature) > Math.abs(sample(hardest).curvature))
      hardest = s;
  scenarios['hardest-turn'] = parked(wrap(hardest - 75, length));
  scenarios['fast-corner'] = { ...scenarios['hardest-turn'], speed: 80 };
  scenarios.impact = { ...parked(90), lateral: 13, speed: 85, heading: 0.12 };
  const checkpointDistances = [
    0,
    sections[1].start,
    jumps[0].landingStart,
    sections[3].start,
    jumps[1].landingStart,
    sections[4].start,
    sections[5].start,
    sections[6].start,
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
      (jump) =>
        wrap(s, length) > jump.takeoff && wrap(s, length) < jump.landingStart,
    );
  const landmark = (horizontal, details = {}) => {
    const s = routeDistance(horizontal);
    return { s, position: sample(s).position.toArray(), ...details };
  };
  return {
    id: 'zephyr-basilica-v1',
    name: 'Zephyr Basilica',
    geometryVersion: 'zephyr-route-v1',
    length,
    width: WIDTH,
    groundY: -320,
    sample,
    sections,
    scenarios,
    checkpoints,
    jumps,
    bounds,
    isGap,
    surfaceCoverage: (s) => (isGap(s) ? 0 : 1),
    landmarks: {
      mooring: landmark(30),
      sailcourt: landmark(sourceDistance(4)),
      fallsCurtain: landmark(first - 24),
      fallsLanding: landmark(first + 82),
      roseWindow: landmark(first + 390),
      nave: landmark(first + 430),
      chapelCurtain: landmark(second - 18),
      chapelLanding: landmark(second + 96),
      cloudspire: {
        s: routeDistance(spiralStart + 400),
        position: [290 * scale, 160, 650 * scale],
        start: routeDistance(spiralStart),
        end: routeDistance(spiralEnd),
      },
      halo: landmark(sourceDistance(26)),
      fallingTower: landmark(first + 440),
      return: landmark(sourceDistance(30)),
    },
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    review: {
      kind: 'bare-track',
      summary:
        '4.9 km · waterfall and chapel jumps · nave wall ride · full cloud spiral',
    },
  };
}
