import * as THREE from 'three';
import { createReferenceFrames } from '../../../track/frames.js';

const WIDTH = 30;
const HORIZONTAL_LENGTH = 4470;
const wrap = (s, length) => ((s % length) + length) % length;
const smooth = (v) => {
  const t = THREE.MathUtils.clamp(v, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const envelope = (s, start, crest, release, end, degrees) =>
  THREE.MathUtils.degToRad(degrees) *
  smooth((s - start) / (crest - start)) *
  (1 - smooth((s - release) / (end - release)));

// The footprint has two unequal descending bowls, separate braking shelves,
// a full helical climb and a straight ballistic receiving deck. Heights are
// authored in horizontal metres, then remapped to true travelled distance.
export function createCindercoilTrack() {
  const source = [
    [160, -550],
    [160, -360],
    [70, -160],
    [-120, -80],
    [-330, -170],
    [-440, -370],
    [-325, -555],
    [-165, -635],
    [-200, -785],
    [-360, -850],
    [-590, -780],
    [-720, -540],
    [-720, -260],
    [-650, -20],
    [-510, 260],
    [-360, 260],
  ];
  const coilFirst = source.length - 1;
  for (let index = 1; index <= 16; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 8;
    source.push([-360 + 140 * Math.cos(angle), 400 + 140 * Math.sin(angle)]);
  }
  const coilLast = source.length - 1;
  source.push(
    [-260, 260],
    [0, 260],
    [220, 260],
    [460, 260],
    [620, 260],
    [670, 50],
    [560, -200],
    [360, -290],
    [400, -540],
    [400, -680],
    [365, -765],
    [280, -800],
    [195, -765],
    [160, -680],
  );
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
  const arcs = curve.getLengths(48000);
  const sourceDistance = (index) => {
    const value = (index / source.length) * 48000;
    const lower = Math.floor(value);
    return THREE.MathUtils.lerp(
      arcs[lower],
      arcs[Math.min(lower + 1, 48000)],
      value - lower,
    );
  };
  const coilStart = sourceDistance(coilFirst);
  const coilEnd = sourceDistance(coilLast);
  const takeoff = sourceDistance(coilLast + 2);
  const landingStart = takeoff + 86;
  const landingEnd = takeoff + 322;
  const recovery = takeoff + 344;
  const pitch = Math.tan(THREE.MathUtils.degToRad(10));
  const heightKeys = [
    [0, 224, 0],
    [sourceDistance(1), 230, 0],
    [sourceDistance(2), 190, -0.4],
    [sourceDistance(3), 130, -0.36],
    [sourceDistance(4), 70, -0.3],
    [sourceDistance(5), 38, 0],
    [sourceDistance(6), 42, 0],
    [sourceDistance(7), 47, 0],
    [sourceDistance(8), 52, 0],
    [sourceDistance(9), 35, 0],
    [sourceDistance(10), 35, 0],
    [sourceDistance(11), 45, 0.1],
    [sourceDistance(12), 59, 0.12],
    [sourceDistance(13), 75, 0.14],
    [sourceDistance(14), 85, 0.08],
    [coilStart, 92, 0.12],
    [coilStart + (coilEnd - coilStart) * 0.25, 126, 0.26],
    [coilStart + (coilEnd - coilStart) * 0.75, 201, 0.26],
    [coilEnd, 240, 0.12],
    [takeoff - 70, 251, 0.12],
    [takeoff, 263, pitch],
    [landingStart, 243, 0],
    [recovery, 243, 0],
    [sourceDistance(coilLast + 6), 295, 0],
    [sourceDistance(coilLast + 7), 266, -0.2],
    [sourceDistance(coilLast + 8), 233, 0],
    [sourceDistance(coilLast + 9), 218, 0],
    [sourceDistance(coilLast + 10), 220, 0],
    [horizontalLength, 224, 0],
  ].sort((a, b) => a[0] - b[0]);
  const heightAt = (h) => {
    const distance = wrap(h, horizontalLength);
    let index = 0;
    while (index < heightKeys.length - 2 && heightKeys[index + 1][0] < distance)
      index += 1;
    const [a, ya, ma] = heightKeys[index];
    const [b, yb, mb] = heightKeys[index + 1];
    const t = (distance - a) / (b - a);
    return (
      (2 * t ** 3 - 3 * t ** 2 + 1) * ya +
      (t ** 3 - 2 * t ** 2 + t) * (b - a) * ma +
      (-2 * t ** 3 + 3 * t ** 2) * yb +
      (t ** 3 - t ** 2) * (b - a) * mb
    );
  };
  const horizontalPoint = (h) => {
    const result = new THREE.Vector3();
    // A short, symmetric filter rounds isolated spline knots into real braking
    // arcs instead of letting a control-point join collapse the inner deck edge.
    for (let offset = -4; offset <= 4; offset += 1) {
      const weight = 5 - Math.abs(offset);
      result.addScaledVector(
        curve.getPointAt(
          wrap(h + offset * 10, horizontalLength) / horizontalLength,
        ),
        weight / 25,
      );
    }
    return result;
  };
  const launchAnchor = horizontalPoint(takeoff);
  const rawPoint = (h) => {
    const distance = wrap(h, horizontalLength);
    const point = horizontalPoint(distance);
    const offset = distance - takeoff;
    // A flat heading through takeoff and the full catch removes spline bulges
    // that otherwise make aligned ballistic trajectories miss the receiving road.
    if (offset > -105 && offset < 484) {
      const weight =
        smooth((offset + 105) / 35) * (1 - smooth((offset - 344) / 140));
      point.lerp(
        new THREE.Vector3(launchAnchor.x + offset, 0, launchAnchor.z),
        weight,
      );
    }
    point.y = heightAt(distance);
    return point;
  };
  const count = Math.ceil(horizontalLength * 2);
  const step = horizontalLength / count;
  const lengths = [0];
  let previous = rawPoint(0);
  for (let index = 1; index <= count; index += 1) {
    const next = rawPoint(index * step);
    lengths.push(lengths.at(-1) + next.distanceTo(previous));
    previous = next;
  }
  const length = lengths.at(-1);
  const routeDistance = (h) => {
    if (h >= horizontalLength) return length;
    const value = h / step;
    const index = Math.floor(value);
    return THREE.MathUtils.lerp(
      lengths[index],
      lengths[index + 1],
      value - index,
    );
  };
  const horizontalDistance = (s) => {
    const distance = wrap(s, length);
    let lo = 0;
    let hi = count;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] <= distance) lo = mid;
      else hi = mid;
    }
    return (
      (lo + (distance - lengths[lo]) / (lengths[lo + 1] - lengths[lo])) * step
    );
  };
  const positionAt = (s) => rawPoint(horizontalDistance(s));
  const tangentAt = (s) =>
    positionAt(s + 0.15)
      .sub(positionAt(s - 0.15))
      .normalize();
  const bankAt = (h) =>
    envelope(
      h,
      sourceDistance(1) - 60,
      sourceDistance(2),
      sourceDistance(4),
      sourceDistance(5) + 20,
      -32,
    ) +
    envelope(
      h,
      sourceDistance(5) + 40,
      sourceDistance(6),
      sourceDistance(6) + 40,
      sourceDistance(7),
      -18,
    ) +
    envelope(
      h,
      sourceDistance(7),
      sourceDistance(7) + 55,
      sourceDistance(8),
      sourceDistance(8) + 45,
      26,
    ) +
    envelope(
      h,
      sourceDistance(8) + 70,
      sourceDistance(9),
      sourceDistance(10),
      sourceDistance(11),
      -27,
    ) +
    envelope(
      h,
      sourceDistance(12),
      sourceDistance(13),
      sourceDistance(13) + 50,
      coilStart - 20,
      -18,
    ) +
    Math.PI * 2 * smooth((h - coilStart) / (coilEnd - coilStart)) +
    envelope(
      h,
      recovery + 30,
      sourceDistance(coilLast + 6),
      sourceDistance(coilLast + 7),
      sourceDistance(coilLast + 8),
      32,
    ) +
    envelope(
      h,
      sourceDistance(coilLast + 8),
      sourceDistance(coilLast + 8) + 30,
      sourceDistance(coilLast + 9),
      horizontalLength - 30,
      -24,
    );
  const frameCount = Math.ceil(length);
  const frameStep = length / frameCount;
  const referenceFrames = createReferenceFrames(
    Array.from({ length: frameCount + 1 }, (_, index) =>
      tangentAt(index * frameStep),
    ),
    frameStep,
  );
  const rotations = referenceFrames.map((frame, index) =>
    frame
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          bankAt(horizontalDistance(index * frameStep)),
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
    const roll = bankAt(horizontalDistance(s));
    return {
      position: positionAt(s),
      tangent,
      right,
      up,
      quaternion,
      bank: Math.atan2(Math.sin(roll), Math.cos(roll)),
      roll,
      curvature: tangentAt(s + 1)
        .sub(tangentAt(s - 1))
        .multiplyScalar(0.5)
        .dot(right),
    };
  }
  const definitions = [
    ['ashgate', 'Ashgate Shelf', 0, sourceDistance(1) + 40, 45],
    [
      'ember',
      'Ember Bowl',
      sourceDistance(1) + 40,
      sourceDistance(5) + 45,
      sourceDistance(3),
    ],
    [
      'teeth',
      'Basalt Teeth',
      sourceDistance(5) + 45,
      sourceDistance(9) + 45,
      sourceDistance(7),
    ],
    [
      'curtain',
      'Curtain Reach',
      sourceDistance(9) + 45,
      coilStart,
      sourceDistance(12),
    ],
    [
      'coil',
      'Furnace Coil',
      coilStart,
      takeoff - 80,
      coilStart + (coilEnd - coilStart) * 0.4,
    ],
    ['vent', 'Vent Launch', takeoff - 80, recovery + 15, takeoff - 55],
    [
      'crown',
      'Blackglass Crown',
      recovery + 15,
      sourceDistance(coilLast + 8),
      sourceDistance(coilLast + 6),
    ],
    [
      'return',
      'Cinder Return',
      sourceDistance(coilLast + 8),
      horizontalLength,
      sourceDistance(coilLast + 9),
    ],
  ];
  const sections = definitions.map(([id, name, start, end, showcase]) => ({
    id,
    name,
    start: routeDistance(start),
    end: routeDistance(end),
    showcase: routeDistance(showcase),
  }));
  const parked = (distance) => ({ distance, lateral: 0, speed: 0, heading: 0 });
  const jump = {
    id: 'vent-launch',
    takeoff: routeDistance(takeoff),
    landingStart: routeDistance(landingStart),
    landingEnd: routeDistance(landingEnd),
    recovery: routeDistance(recovery),
    halfWidth: WIDTH / 2,
    recoveryDelay: 1.5,
  };
  const scenarios = {
    staging: parked(0),
    inspection: parked(28),
    'bank-rest': parked(routeDistance(sourceDistance(3))),
    'slope-rest': parked(routeDistance(coilStart + 80)),
    'fast-corner': { ...parked(routeDistance(sourceDistance(7))), speed: 75 },
    impact: { ...parked(80), lateral: 11, speed: 86, heading: 0.12 },
    'vent-approach': { ...parked(jump.takeoff - 95), speed: 90 },
    'vent-landing': parked(jump.landingStart + 60),
    'coil-inverted': parked(routeDistance((coilStart + coilEnd) / 2)),
  };
  for (const section of sections)
    scenarios[`${section.id}-showcase`] = parked(section.showcase);
  const checkpointDistances = [
    0,
    ...sections.slice(1).map(({ start }) => start),
  ].filter((s) => s < jump.takeoff || s > jump.recovery);
  checkpointDistances.push(jump.landingStart);
  checkpointDistances.sort((a, b) => a - b);
  const checkpoints = checkpointDistances.map((distance, index) => ({
    index,
    distance,
    s: distance,
    position: sample(distance).position,
    quaternion: sample(distance).quaternion,
  }));
  const bounds = new THREE.Box3();
  for (let s = 0; s < length; s += 4) bounds.expandByPoint(sample(s).position);
  bounds.expandByScalar(18);
  const surgeZones = [
    {
      id: 'ember-surge',
      start: routeDistance(sourceDistance(3) - 80),
      end: routeDistance(sourceDistance(3) + 90),
      side: -1,
      phaseOffset: 0,
    },
    {
      id: 'curtain-spill',
      kind: 'spill',
      halfWidth: 8.8,
      start: routeDistance(sourceDistance(11) - 30),
      end: routeDistance(sourceDistance(11) + 105),
      side: 1,
      phaseOffset: 4.8,
    },
    {
      id: 'return-surge',
      start: routeDistance(sourceDistance(coilLast + 8) + 20),
      end: routeDistance(sourceDistance(coilLast + 8) + 88),
      side: -1,
      phaseOffset: 8.1,
    },
  ];
  return {
    id: 'cindercoil-ceramic-1',
    geometryVersion: 'cindercoil-route-v1',
    name: 'Cindercoil',
    length,
    width: WIDTH,
    groundY: -24,
    sample,
    sections,
    scenarios,
    checkpoints,
    bounds,
    jumps: [jump],
    surgeZones,
    showcases: sections.map(({ id, name, showcase }) => ({
      id,
      name,
      distance: showcase,
    })),
    featureZones: sections.map(({ id, start, end, showcase }) => ({
      id,
      start,
      end,
      peak: showcase,
      type: id,
    })),
    structuralZones: [
      {
        id: 'coil',
        start: routeDistance(coilStart),
        end: routeDistance(coilEnd),
      },
    ],
    supportFootprints: [],
    landmarks: {
      basin: {
        center: [-200 * scale, -19, -235 * scale],
        radius: 225 * scale,
        lakeY: -19,
      },
      coil: {
        center: [-360 * scale, 145, 400 * scale],
        radius: 140 * scale,
        towerRadius: 38,
        baseY: -24,
        topY: 310,
        start: routeDistance(coilStart),
        end: routeDistance(coilEnd),
      },
      rupture: {
        position: [-560, 195, 400],
        direction: [0.3, 0, -0.954],
      },
      launch: {
        takeoff: sample(jump.takeoff).position.toArray(),
        landing: sample(jump.landingStart).position.toArray(),
      },
    },
    review: {
      kind: 'bare-track',
      phase: 'production',
      summary:
        '4.5 km · descending bowls · 360° furnace corkscrew · vent flight',
      featureEntry: routeDistance(coilStart),
    },
  };
}
