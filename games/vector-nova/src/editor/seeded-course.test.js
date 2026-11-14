import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDocument as generate,
  validateDocument,
  analyzeDocument,
  DOCUMENT_LIMITS,
  createDocument,
  applySectionShape,
  pointRouteFraction,
} from './document.js';
import { createEditorTrack } from './track.js';
import { createRouteSampler } from './route.js';
import {
  predictEditorJumpTrajectory,
  createEditorFlightRuntime,
} from './jumps.js';
import { getShip, SHIPS } from '../ships/catalog.js';
import { assertTrackContract } from '../../tools/level-checks/track-contract.mjs';

// Keep the saved v2 jump districts and fixed rotation spans as compatibility fixtures.
const generateDocument = (options = {}) =>
  generate({
    generatorVersion: options.seedJumps === false ? 1 : 2,
    ...options,
  });

const cases = [
  ['circuit', 1800, 1],
  ['circuit', 3000, 1],
  ['circuit', 3200, 2],
  ['circuit', 6000, 2],
  ['downhill', 3000, 3],
  ['downhill', 5000, 3],
  ['downhill', 10000, 4],
  ['downhill', 15000, 4],
  ['downhill', 20000, 4],
];

test('seeded courses persist deterministic real jump districts at the requested physical sizes', () => {
  for (const seed of [0, 42, 42017, 4294967295]) {
    for (const [courseType, length, count] of cases) {
      const options = {
        seed,
        courseType,
        length,
        bendiness: 1,
        elevation: 1,
        width: 64,
      };
      const doc = generateDocument(options),
        analysis = analyzeDocument(doc);
      assert.deepEqual(doc, generateDocument(options));
      assert.equal(doc.generator.version, 2);
      assert.equal(doc.jumps.length, count);
      assert.equal(
        analysis.valid,
        true,
        `${seed}/${courseType}/${length}: ${analysis.errors.join(' ')}`,
      );
      assert.ok(Math.abs(analysis.length - length) < 0.01);
      assert.ok(doc.points.length <= DOCUMENT_LIMITS.points);
      for (const jump of doc.jumps) {
        assert.ok(doc.points.some((point) => point.id === jump.launchPointId));
        assert.ok(doc.points.some((point) => point.id === jump.landingPointId));
        assert.ok(jump.receiving >= 150);
      }
    }
  }
});

test('stock cruise and boost trajectories land every generated jump, including long descents', () => {
  for (const seed of [7, 42017]) {
    for (const [courseType, length] of [
      ['circuit', 3000],
      ['circuit', 6000],
      ['downhill', 3000],
      ['downhill', 20000],
    ]) {
      const track = createEditorTrack(
        generateDocument({ seed, courseType, length }),
      );
      const runtime = createEditorFlightRuntime({ track });
      runtime.dispose();
      for (const shipId of ['shrike', 'kestrel']) {
        const handling = getShip(shipId).handling;
        for (const jump of track.jumps) {
          for (const boost of [false, true]) {
            const prediction = predictEditorJumpTrajectory(track, jump, {
              shipId,
              speed: boost ? handling.boostSpeed : handling.cruiseSpeed,
              boost,
            });
            assert.equal(
              prediction.landed,
              true,
              `${seed}/${courseType}/${length}/${shipId}/${jump.label}/${boost ? 'boost' : 'cruise'}: ${prediction.summary}`,
            );
          }
        }
      }
    }
  }
});

test('every stock hull can clear long seeded jumps at cruise and boost without a hidden launch impulse', () => {
  const track = createEditorTrack(
    generateDocument({ length: 20000, courseType: 'downhill' }),
  );
  for (const ship of SHIPS)
    for (const jump of track.jumps)
      for (const boost of [false, true]) {
        const prediction = predictEditorJumpTrajectory(track, jump, {
          shipId: ship.id,
          speed: boost ? ship.handling.boostSpeed : ship.handling.cruiseSpeed,
          boost,
        });
        assert.equal(
          prediction.landed,
          true,
          `${ship.id}/${jump.label}/${boost ? 'boost' : 'cruise'}: ${prediction.summary}`,
        );
      }
  assertTrackContract(track, { step: 2 });
  assert.ok(
    track.sample(0).position.y - track.sample(track.finishDistance).position.y >
      1000,
    'long descents retain a meaningful vertical journey',
  );
  assert.ok(Math.abs(track.length - track.finishDistance - 600) < 0.001);
});

test('route-only legacy generation and empty drafts remain available without seeded jump anchors', () => {
  const plain = generateDocument({ seedJumps: false });
  assert.equal(plain.points.length, 16);
  assert.equal(plain.jumps.length, 0);
  assert.equal(plain.generator.version, 1);
  const blank = createDocument({ blank: true, courseType: 'downhill' });
  assert.deepEqual(validateDocument(blank).points, []);
  assert.deepEqual(blank.jumps, []);
});

test('world presets resolve complete defaults while explicit legacy settings remain intact', () => {
  const industrial = generateDocument({ sceneryPreset: 'industrial' });
  assert.equal(industrial.settings.sceneryPreset, 'industrial');
  assert.equal(industrial.settings.density, 0.88);
  assert.equal(industrial.settings.waterLevel, -36);
  const legacy = generateDocument({
    seedJumps: false,
    density: 0.2,
    waterLevel: -44,
  });
  delete legacy.settings.sceneryPreset;
  const canonical = validateDocument(legacy);
  assert.equal(canonical.settings.sceneryPreset, 'waterfront');
  assert.equal(canonical.settings.density, 0.2);
  assert.equal(canonical.settings.waterLevel, -44);
});

test('cached long-route frames retain immutable snapshots when authoring drafts change', () => {
  const doc = generateDocument({ length: 20000, courseType: 'downhill' });
  const before = createRouteSampler(doc),
    snapshot = before.sample(100).position.clone();
  const unchanged = createRouteSampler(structuredClone(doc));
  assert.ok(unchanged.sample(100).position.distanceTo(snapshot) < 1e-8);
  doc.points[0].x += 200;
  const edited = createRouteSampler(doc);
  assert.ok(before.sample(100).position.distanceTo(snapshot) < 1e-8);
  assert.ok(edited.sample(100).position.distanceTo(snapshot) > 10);
  const result = unchanged.sample(100);
  result.position.x += 1000;
  assert.ok(unchanged.sample(100).position.distanceTo(snapshot) < 1e-8);
});

test('seeded circuits accept ordinary rotation chunks with a smooth automatic connection to the start', () => {
  const original = generateDocument({
    seed: 42017,
    length: 3000,
    courseType: 'circuit',
  });
  for (const [startIndex, endIndex] of [
    [19, 30],
    [15, 25],
    [12, 22],
    [10, 20],
    [20, 27],
  ]) {
    const doc = applySectionShape(original, {
      startIndex,
      endIndex,
      angle: Math.PI / 2,
    });
    const analysis = analyzeDocument(doc),
      track = createEditorTrack(doc);
    assert.equal(doc.autoCloseRoll, true);
    assert.equal(analysis.valid, true, analysis.errors.join(' '));
    assert.ok(track.rollClosure?.valid);
    assert.ok(
      track.rollClosure.start >=
        pointRouteFraction(
          doc,
          doc.points.findIndex((p) => p.id === original.points[endIndex].id),
        ) *
          track.length -
          0.01,
    );
    assert.ok(
      track.sample(-0.01).quaternion.angleTo(track.sample(0.01).quaternion) <
        0.005,
    );
    assertTrackContract(track, { step: 2 });
  }
});

test('successive seeded 90, 180 and 90 degree chunks retain cumulative angles and finish a continuous full turn', () => {
  let doc = generateDocument({
    seed: 42017,
    length: 3000,
    courseType: 'circuit',
  });
  const ids = [10, 17, 25, 30].map((i) => doc.points[i].id);
  for (let i = 0; i < 3; i++)
    doc = applySectionShape(doc, {
      startPointId: ids[i],
      endPointId: ids[i + 1],
      angle: [Math.PI / 2, Math.PI, Math.PI / 2][i],
    });
  const analysis = analyzeDocument(doc),
    track = createEditorTrack(doc);
  assert.equal(analysis.valid, true, analysis.errors.join(' '));
  assert.equal(track.rollClosure, null);
  assert.ok(Math.abs(doc.points.at(-1).roll - Math.PI * 2) < 1e-8);
  assert.ok(track.sample(track.length - 0.01).authoredRoll > Math.PI * 1.999);
  assert.ok(
    track.sample(-0.01).quaternion.angleTo(track.sample(0.01).quaternion) <
      0.005,
  );
});

test('automatic circuit return protects jump receiving corridors and reports genuinely short tails precisely', () => {
  const doc = generateDocument({
    seed: 42017,
    length: 3000,
    courseType: 'circuit',
  });
  assert.throws(
    () =>
      applySectionShape(doc, { startIndex: 19, endIndex: 30, angle: Math.PI }),
    /circuit return needs at least 268 m/,
  );
  doc.jumps.push({ id: 'tail-jump', start: 0.78, end: 0.84, receiving: 340 });
  assert.throws(
    () =>
      applySectionShape(doc, {
        startIndex: 12,
        endIndex: 22,
        angle: Math.PI / 2,
      }),
    /clear road after the final jump/,
  );
  const original = generateDocument({ seedJumps: false });
  delete original.autoCloseRoll;
  assert.equal(validateDocument(original).autoCloseRoll, false);
  const invalid = { ...original, autoCloseRoll: 'yes' };
  assert.throws(() => validateDocument(invalid), /enabled or disabled/);
});

test('automatic circuit return participates in the immutable sampler cache key', () => {
  const doc = applySectionShape(
    generateDocument({ seed: 42017, length: 3000 }),
    { startIndex: 15, endIndex: 25, angle: Math.PI / 2 },
  );
  const automatic = createRouteSampler(doc),
    legacy = createRouteSampler({ ...doc, autoCloseRoll: false });
  assert.ok(automatic.rollClosure?.valid);
  assert.equal(legacy.rollClosure, null);
  const station = automatic.length - 50;
  assert.ok(
    automatic
      .sample(station)
      .quaternion.angleTo(legacy.sample(station).quaternion) > 0.1,
  );
});
