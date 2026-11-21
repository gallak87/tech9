import test from 'node:test';
import { PLAYABLE_STARTERS } from './playable-starters.js';
import { mockBundledEditorAssets } from './test-assets.js';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  generateDocument,
  analyzeDocument,
  validateDocument,
  DOCUMENT_LIMITS,
} from './document.js';
import { createEditorTrack } from './track.js';
import { resolveEditorTestStart } from './test-drive.js';
import {
  createEditorRoad,
  createEditorEnvironment,
  createEditorCollisionWorld,
} from './nightweir.js';
import {
  predictEditorJumpTrajectory,
  createEditorFlightRuntime,
  EDITOR_JUMP_SPEEDS,
} from './jumps.js';
import { SHIPS } from '../ships/catalog.js';
import { createVehicleState } from '../physics/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { assertTrackContract } from '../../tools/level-checks/track-contract.mjs';

const lengths = [3000, 5000, 10000, 15000, 20000];
const types = ['circuit', 'downhill'];
const label = (options) => JSON.stringify(options);
const make = (options = {}) => {
  try {
    return generateDocument({ generatorVersion: 3, ...options });
  } catch (error) {
    throw new Error(`${label(options)}: ${error.message}`, { cause: error });
  }
};

// Measure the road players actually drive, independently of station count or
// which construction primitives the generator chooses.
function shapeMetrics(document) {
  const track = createEditorTrack(document);
  const end = track.finishDistance ?? track.length;
  const count = Math.ceil(end / 40);
  const step = end / count;
  let positive = 0,
    negative = 0,
    straight = 0,
    longestStraight = 0;
  const turns = [],
    heights = [];
  let previous;
  for (let i = 0; i <= count; i++) {
    const frame = track.sample(i * step);
    heights.push(frame.position.y);
    const tangent = frame.tangent.clone().setY(0).normalize();
    if (previous) {
      const angle = Math.atan2(
        previous.z * tangent.x - previous.x * tangent.z,
        previous.dot(tangent),
      );
      turns.push(angle);
      if (angle > 0) positive += angle;
      else negative -= angle;
      const reserved = track.jumps.some(
        (jump) => i * step >= jump.takeoff - 160 && i * step <= jump.recovery,
      );
      // Flight needs rigid aligned approaches and receivers. Grade winding on
      // ordinary connectors, not the straight road deliberately reserved for it.
      if (!reserved && Math.abs(angle) < Math.PI / 360) straight += step;
      else straight = 0;
      longestStraight = Math.max(longestStraight, straight);
    }
    previous = tangent;
  }
  // Signed heading changes are invariant to translating or rotating a route.
  const signature = Array.from({ length: 24 }, (_, bin) => {
    const a = Math.floor((bin * turns.length) / 24);
    const b = Math.floor(((bin + 1) * turns.length) / 24);
    return (
      Math.round(turns.slice(a, b).reduce((sum, v) => sum + v, 0) * 100) / 100
    );
  });
  return {
    positive,
    negative,
    longestStraight,
    signature,
    turning: positive + negative,
    heightRange: Math.max(...heights) - Math.min(...heights),
  };
}

function outlineMetrics(document) {
  const track = createEditorTrack(document);
  const points = Array.from({ length: 720 }, (_, i) => {
    const point = track.sample((i / 720) * track.length).position;
    return { x: point.x, z: point.z };
  });
  const area = (polygon) =>
    Math.abs(
      polygon.reduce((sum, point, i) => {
        const next = polygon[(i + 1) % polygon.length];
        return sum + point.x * next.z - next.x * point.z;
      }, 0),
    ) / 2;
  const cross = (a, b, c) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const halfHull = (values) => {
    const hull = [];
    for (const point of values) {
      while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0)
        hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  const hull = [...halfHull(sorted), ...halfHull([...sorted].reverse())];
  const center = points.reduce(
    (sum, p) => ({
      x: sum.x + p.x / points.length,
      z: sum.z + p.z / points.length,
    }),
    { x: 0, z: 0 },
  );
  let xx = 0,
    zz = 0,
    xz = 0,
    perimeter = 0;
  for (const [i, point] of points.entries()) {
    const x = point.x - center.x,
      z = point.z - center.z;
    xx += x * x;
    zz += z * z;
    xz += x * z;
    const next = points[(i + 1) % points.length];
    perimeter += Math.hypot(next.x - point.x, next.z - point.z);
  }
  const middle = (xx + zz) / 2;
  const spread = Math.hypot((xx - zz) / 2, xz);
  return {
    axisRatio: Math.sqrt((middle + spread) / (middle - spread)),
    compactness: (4 * Math.PI * area(points)) / perimeter ** 2,
    solidity: area(points) / area(hull),
  };
}

function roadCrossings(track) {
  const count = Math.ceil(track.length / 12),
    step = track.length / count,
    points = Array.from(
      { length: count + 1 },
      (_, i) => track.sample(i * step).position,
    ),
    cells = new Map(),
    crossings = [];
  const cross = (x, z, u, v) => x * v - z * u;
  const refine = (a, b) => {
    for (let i = 0; i < 8; i++) {
      const first = track.sample(a),
        second = track.sample(b),
        dx = first.position.x - second.position.x,
        dz = first.position.z - second.position.z,
        determinant = cross(
          first.tangent.x,
          first.tangent.z,
          -second.tangent.x,
          -second.tangent.z,
        );
      if (Math.hypot(dx, dz) < 1e-6 || Math.abs(determinant) < 1e-8) break;
      a += Math.max(
        -step,
        Math.min(
          step,
          (dx * second.tangent.z - second.tangent.x * dz) / determinant,
        ),
      );
      b += Math.max(
        -step,
        Math.min(
          step,
          (first.tangent.z * dx - first.tangent.x * dz) / determinant,
        ),
      );
    }
    const wrap = (distance) =>
      ((distance % track.length) + track.length) % track.length;
    return [wrap(a), wrap(b)].sort((x, y) => x - y);
  };
  for (let i = 0; i < count; i++) {
    const a = points[i],
      b = points[i + 1],
      candidates = new Set(),
      keys = [];
    for (
      let x = Math.floor(Math.min(a.x, b.x) / 128);
      x <= Math.floor(Math.max(a.x, b.x) / 128);
      x++
    )
      for (
        let z = Math.floor(Math.min(a.z, b.z) / 128);
        z <= Math.floor(Math.max(a.z, b.z) / 128);
        z++
      ) {
        const key = `${x}:${z}`;
        keys.push(key);
        for (const j of cells.get(key) ?? []) candidates.add(j);
      }
    for (const j of candidates) {
      if (i - j <= 1 || count - i + j <= 1) continue;
      const c = points[j],
        d = points[j + 1],
        ax = b.x - a.x,
        az = b.z - a.z,
        bx = d.x - c.x,
        bz = d.z - c.z,
        determinant = cross(ax, az, bx, bz);
      if (Math.abs(determinant) < 1e-8) continue;
      const x = c.x - a.x,
        z = c.z - a.z,
        u = cross(x, z, bx, bz) / determinant,
        v = cross(x, z, ax, az) / determinant;
      if (u < -1e-8 || u > 1 + 1e-8 || v < -1e-8 || v > 1 + 1e-8) continue;
      const [first, second] = refine((i + u) * step, (j + v) * step);
      if (
        !crossings.some(
          (p) =>
            Math.abs(p.first - first) < step &&
            Math.abs(p.second - second) < step,
        )
      )
        crossings.push({ first, second });
    }
    for (const key of keys) {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    }
  }
  return crossings;
}

function assertWovenCourse(document, options) {
  const diagnostic = label(options),
    analysis = analyzeDocument(document),
    track = createEditorTrack(document);
  assert(analysis.valid, `${diagnostic}: ${analysis.errors.join(' ')}`);
  assert(
    Math.abs(analysis.length - options.length) < 0.01,
    `physical metres ${diagnostic}`,
  );
  assert(document.points.length <= DOCUMENT_LIMITS.points, diagnostic);
  const crossings = roadCrossings(track);
  assert(
    crossings.length > 0,
    `Intertwined must create actual planar crossings: ${diagnostic}`,
  );
  for (const crossing of crossings) {
    const a = track.sample(crossing.first),
      b = track.sample(crossing.second),
      apart = Math.min(
        crossing.second - crossing.first,
        track.length - crossing.second + crossing.first,
      ),
      envelope = (frame) =>
        Math.abs(frame.right.y) * (document.width / 2 + 6) +
        Math.abs(frame.up.y) * 24,
      clearance = Math.max(30, envelope(a) + envelope(b));
    assert(
      Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) <
        0.01,
      `refined crossing lies on both actual road curves: ${diagnostic}`,
    );
    assert(
      apart > document.width * 2 + 40,
      `crossing branches need longitudinal separation: ${diagnostic}`,
    );
    assert(
      Math.abs(a.position.y - b.position.y) >= clearance,
      `overpass needs the existing rotated driving-corridor clearance (${clearance}m): ${diagnostic}`,
    );
    assert(
      !track.isJumpProtected(crossing.first) &&
        !track.isJumpProtected(crossing.second),
      `crossings must stay outside jump approaches, gaps and receiving roads: ${diagnostic}`,
    );
  }
  return { track, crossings };
}

function minimumPlanarRadius(track) {
  const count = Math.ceil(track.length / 6),
    step = track.length / count,
    points = Array.from(
      { length: count },
      (_, i) => track.sample(i * step).position,
    );
  let minimum = Infinity;
  for (const [i, point] of points.entries()) {
    const previous = points[(i + count - 1) % count],
      next = points[(i + 1) % count],
      ax = point.x - previous.x,
      az = point.z - previous.z,
      bx = next.x - point.x,
      bz = next.z - point.z,
      angle = Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz));
    if (angle > 1e-6)
      minimum = Math.min(
        minimum,
        (Math.hypot(ax, az) + Math.hypot(bx, bz)) / (2 * angle),
      );
  }
  return minimum;
}

test('zero crossovers retain the existing v3 geometry and explicit zero matches the default', () => {
  const fixtures = [
    [
      { seed: 0, length: 20000, courseType: 'circuit', bendiness: 0.75 },
      '37c9efda43059957516754f2723f80fda6eaf03eab0729a051d06731370eb371',
    ],
    [
      { seed: 42, length: 20000, courseType: 'circuit', bendiness: 0.75 },
      'a04ddb5ea6eaa7e5c343839bb31c73b1f92cd827c56b83174785311c6c7d5a14',
    ],
    [
      { seed: 42017, length: 20000, courseType: 'circuit', bendiness: 0.75 },
      'f3ba7b1bfa0c837779f634994539f42fc0f03213dc8793a340d4e32e6c10fec9',
    ],
    [
      {
        seed: 4294967295,
        length: 20000,
        courseType: 'circuit',
        bendiness: 0.75,
      },
      'e414339020f9cf17402b487550c357679e2b42f110141f1c6a350a4c5946f168',
    ],
    [
      { seed: 42, length: 3000, courseType: 'circuit' },
      '7458c661726516930e559ef0cf4fe61c36bb509c9ed42c44fb9c74b58e80ceab',
    ],
    [
      {
        seed: 7,
        length: 5000,
        courseType: 'circuit',
        jumpFrequency: 'many',
        jumpSize: 'large',
      },
      'd3f0d386be98cfb99d1e505fae209584acba2a8f45512dc0836ee4cb78afb610',
    ],
  ];
  for (const [options, expected] of fixtures) {
    const document = make(options),
      explicit = make({ ...options, crossovers: 0 });
    assert.deepEqual(explicit, document, label(options));
    // Capture pre-crossover road geometry at micrometre precision, independently
    // of the optional schema field and insignificant platform trig rounding.
    const geometry = JSON.stringify(
      { points: document.points, jumps: document.jumps },
      (_, value) =>
        typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
    );
    assert.equal(
      createHash('sha256').update(geometry).digest('hex'),
      expected,
      `zero preserves the approved road: ${label(options)}`,
    );
  }
});

test('the Harbor braid starter stacks two separated crossings and a variation changes the racing line', () => {
  const options = PLAYABLE_STARTERS.find(
    (starter) => starter.id === 'harbor',
  ).options;
  for (const [seed, expectedCrossings] of [
    [options.seed, 2],
    [6103, 1],
  ]) {
    const doc = generateDocument({ ...options, seed });
    const { crossings } = assertWovenCourse(doc, { ...options, seed });
    assert.equal(crossings.length, expectedCrossings);
  }
});

test('intertwined circuits have cleared real crossings at every UI length and control edge', () => {
  const profiles = [
      {
        width: 32,
        bendiness: 0,
        elevation: 0,
        jumpFrequency: 'none',
        jumpSize: 'small',
      },
      {
        width: 64,
        bendiness: 1,
        elevation: 1,
        jumpFrequency: 'none',
        jumpSize: 'large',
      },
      {
        width: 32,
        bendiness: 0,
        elevation: 1,
        jumpFrequency: 'normal',
        jumpSize: 'small',
      },
      {
        width: 64,
        bendiness: 1,
        elevation: 0,
        jumpFrequency: 'normal',
        jumpSize: 'large',
      },
      {
        width: 32,
        bendiness: 1,
        elevation: 0,
        jumpFrequency: 'many',
        jumpSize: 'small',
      },
      {
        width: 64,
        bendiness: 0,
        elevation: 1,
        jumpFrequency: 'many',
        jumpSize: 'large',
      },
    ],
    seeds = [0, 42, 42017, 4294967295],
    failures = [];
  for (const [i, length] of lengths.entries())
    for (const [j, profile] of profiles.entries()) {
      const options = {
        seed: seeds[(i + j) % seeds.length],
        length,
        courseType: 'circuit',
        crossovers: 1,
        ...profile,
      };
      try {
        const document = make(options);
        assert.deepEqual(
          document,
          make(options),
          `deterministic woven route ${label(options)}`,
        );
        assert.deepEqual(validateDocument(document), document);
        const { track } = assertWovenCourse(document, options);
        if (profile.jumpFrequency === 'none')
          assert.equal(document.jumps.length, 0);
        if (j === 0) assertTrackContract(track, { step: 10 });
      } catch (error) {
        failures.push(
          error.message.startsWith(label(options))
            ? error.message
            : `${label(options)}: ${error.message}`,
        );
      }
    }
  assert.deepEqual(
    failures,
    [],
    'all 30 bounded crossover profiles must remain valid',
  );
});

test('crossover density creates more actual weaves on long circuits and Downhill ignores it', () => {
  const options = {
    seed: 42017,
    length: 20000,
    courseType: 'circuit',
    jumpFrequency: 'none',
    width: 64,
    bendiness: 0.75,
    elevation: 0,
  };
  const counts = [0, 0.25, 0.5, 1].map((crossovers) => {
    const document = make({ ...options, crossovers });
    if (!crossovers) return roadCrossings(createEditorTrack(document)).length;
    return assertWovenCourse(document, options).crossings.length;
  });
  assert.equal(counts[0], 0);
  assert(
    counts[1] > 0 && counts[2] >= counts[1] && counts[3] > counts[1],
    `density must affect real crossing count: ${counts}`,
  );
  const short = assertWovenCourse(
    make({ ...options, length: 3000, crossovers: 1 }),
    { ...options, length: 3000 },
  ).crossings.length;
  assert(
    short < counts[3],
    `short circuits need a bounded weave count (${short} vs ${counts[3]})`,
  );
  const downhill = {
      seed: 42,
      length: 5000,
      courseType: 'downhill',
      jumpFrequency: 'normal',
    },
    zero = make({ ...downhill, crossovers: 0 }),
    high = make({ ...downhill, crossovers: 1 });
  assert.deepEqual(
    high.points,
    zero.points,
    'Downhill retains its original start-to-finish geometry',
  );
  assert.deepEqual(
    high.jumps,
    zero.jumps,
    'Downhill jump geometry ignores crossover preferences',
  );
});

test('woven Curviness changes actual horizontal bend radii while preserving safe crossings', () => {
  for (const [length, seed, width] of [
    [5000, 42, 32],
    [5000, 42017, 64],
    [20000, 42, 32],
    [20000, 42017, 64],
  ]) {
    const options = {
        seed,
        length,
        width,
        courseType: 'circuit',
        crossovers: 1,
        elevation: 0,
        jumpFrequency: 'none',
      },
      broad = make({ ...options, bendiness: 0 }),
      tight = make({ ...options, bendiness: 1 }),
      broadTrack = assertWovenCourse(broad, options).track,
      tightTrack = assertWovenCourse(tight, options).track,
      broadRadius = minimumPlanarRadius(broadTrack),
      tightRadius = minimumPlanarRadius(tightTrack);
    assert.notDeepEqual(
      broad.points,
      tight.points,
      `Curviness must change the authored woven road: ${label(options)}`,
    );
    // Measure horizontal turns independently of the grade transitions required
    // by overpasses; the slider must give a meaningful broader/tighter bend.
    assert(
      broadRadius > tightRadius * 1.1,
      `${label(options)}: Curviness0 needs broader actual bends than1 (${broadRadius.toFixed(2)}m vs ${tightRadius.toFixed(2)}m)`,
    );
  }
});

test('all stock hulls land selected intertwined-course jumps at cruise and boost', () => {
  for (const options of [
    {
      seed: 42017,
      length: 5000,
      courseType: 'circuit',
      crossovers: 0.5,
      jumpFrequency: 'normal',
      jumpSize: 'small',
      width: 32,
      elevation: 0,
    },
    {
      seed: 42,
      length: 20000,
      courseType: 'circuit',
      crossovers: 1,
      jumpFrequency: 'many',
      jumpSize: 'large',
      width: 64,
      elevation: 1,
    },
  ]) {
    const { track } = assertWovenCourse(make(options), options);
    assert(
      track.jumps.length > 0,
      `exercise actual woven jumps ${label(options)}`,
    );
    for (const ship of SHIPS)
      for (const jump of track.jumps)
        for (const boost of [false, true]) {
          const prediction = predictEditorJumpTrajectory(track, jump, {
            shipId: ship.id,
            speed: boost ? ship.handling.boostSpeed : ship.handling.cruiseSpeed,
            boost,
          });
          assert(
            prediction.landed,
            `${label(options)}/${ship.id}/${jump.label}/${boost ? 'boost' : 'cruise'}: ${prediction.summary}`,
          );
        }
  }
});

test('v3 defaults and control extremes produce deterministic valid physical courses at every UI length', () => {
  const profiles = [
    {},
    {
      bendiness: 0,
      elevation: 0,
      jumpFrequency: 'none',
      jumpSize: 'small',
      width: 32,
    },
    {
      bendiness: 1,
      elevation: 1,
      jumpFrequency: 'many',
      jumpSize: 'large',
      width: 64,
    },
  ];
  for (const seed of [0, 42, 42017, 4294967295])
    for (const courseType of types)
      for (const length of lengths)
        for (const profile of profiles) {
          const options = { seed, courseType, length, ...profile };
          const document = make(options);
          const analysis = analyzeDocument(document);
          assert.equal(document.generator.version, 3, label(options));
          assert.deepEqual(
            document,
            make(options),
            `deterministic ${label(options)}`,
          );
          assert.deepEqual(validateDocument(document), document);
          assert(
            analysis.valid,
            `${label(options)}: ${analysis.errors.join(' ')}`,
          );
          assert(
            Math.abs(analysis.length - length) < 0.01,
            `physical metres ${label(options)}: ${analysis.length}`,
          );
          assert(document.points.length <= DOCUMENT_LIMITS.points);
          const track = createEditorTrack(document);
          assert.equal(track.closed, courseType === 'circuit');
          if (courseType === 'downhill') {
            assert(Math.abs(track.length - track.finishDistance - 600) < 0.001);
            assert(
              track.sample(0).position.y >
                track.sample(track.finishDistance).position.y,
              `a downhill remains a descent even at zero elevation variation: ${label(options)}`,
            );
          }
          if (profile.jumpFrequency === 'none')
            assert.equal(document.jumps.length, 0);
          if (
            courseType === 'circuit' &&
            profile.elevation === 0 &&
            profile.jumpFrequency === 'none'
          )
            assert(
              document.points.every(
                (point) => Math.abs(point.y - document.points[0].y) < 1e-6,
              ),
              'zero-variation circuits without jumps stay flat',
            );
          for (const jump of document.jumps) {
            assert(
              document.points.some((point) => point.id === jump.launchPointId),
            );
            assert(
              document.points.some((point) => point.id === jump.landingPointId),
            );
          }
          if (seed === 0) assertTrackContract(track, { step: 10 });
        }
});

test('seeds change route topology rather than merely rotating the same long oval', () => {
  for (const courseType of types) {
    const signatures = [];
    for (const seed of [0, 42, 42017, 4294967295]) {
      const metrics = shapeMetrics(make({ seed, courseType, length: 20000 }));
      assert(
        metrics.positive > 0.35 && metrics.negative > 0.35,
        `${courseType}/${seed}: the route needs meaningful turns in both directions (${metrics.positive.toFixed(3)}/${metrics.negative.toFixed(3)} radians)`,
      );
      assert(
        metrics.longestStraight < 1800,
        `${courseType}/${seed}: ${metrics.longestStraight.toFixed(0)} m near-straight ordinary connector`,
      );
      signatures.push(JSON.stringify(metrics.signature));
    }
    assert.equal(
      new Set(signatures).size,
      signatures.length,
      `${courseType}: seeds must change the turn sequence`,
    );
  }
});

test('seed families change the normalized overall outline beyond local road wiggles', () => {
  const metrics = [0, 42, 42017, 4294967295].map((seed) => ({
    seed,
    ...outlineMetrics(
      make({ seed, courseType: 'circuit', length: 20000, bendiness: 0.75 }),
    ),
  }));
  // These measures ignore translation, rotation and uniform scale. Together
  // they distinguish elongated, broad and deeply waisted/lobed silhouettes
  // without specifying any exact station coordinates or seed-specific shape.
  const range = (key) =>
    Math.max(...metrics.map((m) => m[key])) -
    Math.min(...metrics.map((m) => m[key]));
  const diagnostic = JSON.stringify(metrics);
  assert(
    Math.max(...metrics.map((m) => m.axisRatio)) /
      Math.min(...metrics.map((m) => m.axisRatio)) >=
      1.45,
    `seed families need meaningfully different eccentricity: ${diagnostic}`,
  );
  assert(
    range('compactness') >= 0.15,
    `seed families need different area/perimeter structure: ${diagnostic}`,
  );
  // A hull-area deficit distinguishes waisted/lobed outlines, without prescribing
  // a particular neck depth. Pair separation prevents three near-identical
  // round routes plus one outlier from satisfying only the aggregate spreads.
  assert(
    Math.min(...metrics.map((m) => m.solidity)) <= 0.9 &&
      range('solidity') >= 0.07,
    `seed families need a waist/lobes as well as a broad outline: ${diagnostic}`,
  );
  for (let i = 0; i < metrics.length; i++)
    for (let j = i + 1; j < metrics.length; j++) {
      const a = metrics[i],
        b = metrics[j];
      const distance = Math.hypot(
        Math.log(a.axisRatio / b.axisRatio),
        a.compactness - b.compactness,
        a.solidity - b.solidity,
      );
      assert(
        distance >= 0.12,
        `seeds ${a.seed}/${b.seed} need distinct overall outlines (${distance.toFixed(3)}): ${diagnostic}`,
      );
    }
});

test('bendiness and elevation controls change measured road geometry without relying on jumps', () => {
  for (const courseType of types)
    for (const seed of [7, 42017]) {
      const options = {
        seed,
        courseType,
        length: 10000,
        jumpFrequency: 'none',
      };
      const gentle = shapeMetrics(
        make({ ...options, bendiness: 0, elevation: 0 }),
      );
      const bending = shapeMetrics(
        make({ ...options, bendiness: 1, elevation: 0 }),
      );
      const elevated = shapeMetrics(
        make({ ...options, bendiness: 0, elevation: 1 }),
      );
      assert(
        bending.turning > gentle.turning + 0.4,
        `${courseType}/${seed}: bendiness must add real heading change (${gentle.turning} → ${bending.turning})`,
      );
      assert(
        elevated.heightRange > gentle.heightRange + 30,
        `${courseType}/${seed}: elevation must change the road heights (${gentle.heightRange} → ${elevated.heightRange})`,
      );
    }
});

test('jump frequency and size change actual gap counts and physical spans', () => {
  for (const courseType of types) {
    const options = { seed: 42017, courseType, length: 20000 };
    const counts = ['none', 'few', 'normal', 'many'].map(
      (jumpFrequency) => make({ ...options, jumpFrequency }).jumps.length,
    );
    assert.equal(counts[0], 0);
    assert(
      counts[1] > 0 && counts[1] < counts[2] && counts[2] < counts[3],
      `${courseType}: frequency must change real jump count: ${counts}`,
    );
    const spans = ['small', 'mixed', 'large'].map((jumpSize) => {
      const track = createEditorTrack(
        make({ ...options, jumpFrequency: 'normal', jumpSize }),
      );
      const gaps = track.jumps
        .map((jump) => jump.landingStart - jump.takeoff)
        .sort((a, b) => a - b);
      assert(gaps.length > 0);
      return gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
    });
    assert(
      spans[0] < spans[1] && spans[1] < spans[2],
      `${courseType}: size must change physical gap spans: ${spans}`,
    );
  }
});

test('every stock hull lands each default and extreme-size generated gap at cruise and boost', () => {
  const cases = types.flatMap((courseType) => [
    ...lengths.map((length) => ({ seed: 42017, courseType, length })),
    {
      seed: 7,
      courseType,
      length: 20000,
      jumpFrequency: 'many',
      jumpSize: 'small',
      bendiness: 1,
      elevation: 1,
    },
    {
      seed: 42,
      courseType,
      length: 20000,
      jumpFrequency: 'many',
      jumpSize: 'large',
      bendiness: 1,
      elevation: 1,
    },
  ]);
  for (const options of cases) {
    const track = createEditorTrack(make(options));
    assert(track.jumps.length > 0, `exercise actual jumps: ${label(options)}`);
    for (const ship of SHIPS)
      for (const jump of track.jumps)
        for (const boost of [false, true]) {
          const prediction = predictEditorJumpTrajectory(track, jump, {
            shipId: ship.id,
            speed: boost ? ship.handling.boostSpeed : ship.handling.cruiseSpeed,
            boost,
          });
          assert(
            prediction.landed,
            `${label(options)}/${ship.id}/${jump.label}/${boost ? 'boost' : 'cruise'}: ${prediction.summary}`,
          );
        }
  }
});

test('varied generated roads remain consumable by the existing road and world builders', async (t) => {
  mockBundledEditorAssets(t);
  for (const courseType of types) {
    const document = make({
      seed: 42,
      courseType,
      length: 3000,
      bendiness: 1,
      elevation: 1,
      width: 64,
    });
    const track = createEditorTrack(document);
    const road = createEditorRoad(track, { preview: true });
    const environment = createEditorEnvironment(document, track);
    try {
      await environment.ready;
      assert(road.group.children.some((mesh) => mesh.userData.roadSurface));
      assert(environment.group.userData.region.assemblies > 0);
      assert(track.supportFootprints.length > 0);
    } finally {
      road.dispose();
      environment.dispose();
    }
  }
});

test('v3 circuit and downhill jumps launch from the rendered road and land through real Rapier contacts', async () => {
  for (const courseType of types) {
    const document = make({
      seed: 42017,
      courseType,
      length: 3000,
      density: 0,
    });
    const track = createEditorTrack(document);
    const jump = track.jumps[0];
    const collision = createEditorCollisionWorld(document, track);
    const dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collision),
    });
    const runtime = createEditorFlightRuntime({
      track,
      collisionWorld: collision,
      dynamics,
      settings: { steeringAssist: 0.3 },
    });
    try {
      const vehicle = {
        ...createVehicleState(),
        distance: jump.takeoff - 20,
        speed: EDITOR_JUMP_SPEEDS.cruise,
      };
      runtime.reset({ state: vehicle });
      const events = [];
      for (
        let tick = 0;
        tick < 2400 && !events.some((event) => event.type === 'jump-transfer');
        tick++
      )
        events.push(
          ...runtime.advance(
            vehicle,
            { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false },
            1 / 120,
          ),
        );
      assert(
        events.some((event) => event.type === 'jump-launch'),
        `${courseType}: actual deck lip launches the ship`,
      );
      assert.equal(
        events.find((event) => event.type === 'jump-transfer')?.payload.outcome,
        'landed',
        `${courseType}: ${JSON.stringify(events)}`,
      );
      assert.equal(runtime.status().mode, 'magnetic');
      assert(vehicle.distance >= jump.landingStart);
    } finally {
      runtime.dispose();
      dynamics.dispose();
      collision.dispose();
    }
  }
});

test('v5 woven seeds change real overpass topology, carve relief and jump spacing', () => {
  const options = {
    generatorVersion: 5,
    courseType: 'circuit',
    length: 7500,
    width: 40,
    bendiness: 0.86,
    elevation: 0.9,
    crossovers: 1,
    jumpFrequency: 'few',
    jumpSize: 'mixed',
  };
  const sampled = [7, 42].map((seed) => {
    const document = generateDocument({ ...options, seed });
    const resolved = assertWovenCourse(document, { ...options, seed });
    const strict = analyzeDocument(document, { strict: true });
    assert(strict.valid, strict.errors.join(' '));
    assert.equal(resolved.track.jumps.length, 1);
    const jump = resolved.track.jumps[0];
    assert.equal(resolved.track.isGap(jump.takeoff), false);
    assert.equal(resolved.track.isGap(jump.landingStart), false);
    const start = resolveEditorTestStart(
      document,
      { kind: 'jump', jumpId: jump.id },
      { track: resolved.track, shipId: 'shrike' },
    );
    assert.equal(start.approachMetres, 240);
    assert.deepEqual(start.warnings, []);
    assert(
      Math.max(...document.points.map(({ roll }) => Math.abs(roll))) >
        Math.PI / 4,
    );
    assert(strict.bounds.max[1] - strict.bounds.min[1] > 190);
    assert.deepEqual(
      validateDocument(JSON.parse(JSON.stringify(document))),
      document,
    );
    return resolved;
  });
  assert.deepEqual(
    sampled.map(({ crossings }) => crossings.length),
    [1, 2],
  );
  const [different, braid] = sampled.map(({ track }) => track.jumps[0]);
  assert(Math.abs(braid.takeoff - different.takeoff) > 150);
  assert(
    Math.abs(
      braid.landingStart -
        braid.takeoff -
        (different.landingStart - different.takeoff),
    ) > 15,
  );

  const { track } = sampled[1];
  for (const ship of SHIPS)
    for (const boost of [false, true]) {
      const result = predictEditorJumpTrajectory(track, braid, {
        shipId: ship.id,
        boost,
        speed: boost ? ship.handling.boostSpeed : ship.handling.cruiseSpeed,
      });
      assert(result.landed, `${ship.id}/${boost}: ${result.summary}`);
    }
});

test('v5 fitting holds geometry limits at short, steep and long road budgets', () => {
  for (const [seed, courseType, length] of [
    [0, 'circuit', 3000],
    [4294967295, 'circuit', 5000],
    [42, 'circuit', 20000],
    [42, 'downhill', 5000],
    [42, 'downhill', 20000],
  ]) {
    const options = {
      seed,
      courseType,
      length,
      width: 64,
      bendiness: 1,
      elevation: 1,
      crossovers: 1,
      jumpFrequency: 'many',
      jumpSize: 'large',
    };
    const document = generateDocument(options);
    const analysis = analyzeDocument(document, { strict: true });
    assert(analysis.valid, analysis.errors.join(' '));
    assert(Math.abs(analysis.length - length) < 0.01);
    assert(document.jumps.length > 0);
    assert(document.points.some(({ roll }) => Math.abs(roll) > 0.35));
    assert(document.points.length <= DOCUMENT_LIMITS.points);
    if (courseType === 'downhill') {
      assert(Math.abs(analysis.length - analysis.finishDistance - 600) < 0.01);
      assert.equal(document.points.at(-1).roll, 0);
    }
  }
});
