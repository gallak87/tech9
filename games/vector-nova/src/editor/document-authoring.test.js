import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_LIMITS,
  generateDocument,
  validateDocument,
  analyzeDocument,
  addJump,
} from './document.js';
import { createEditorTrack } from './track.js';
import { predictEditorJumpTrajectory } from './jumps.js';
import { getShip } from '../ships/catalog.js';

test('20 km generated courses retain room for ordinary outward authoring edits', () => {
  assert.equal(DOCUMENT_LIMITS.length, 25000);
  assert.equal(DOCUMENT_LIMITS.generatorLength, 20000);
  for (const courseType of ['circuit', 'downhill']) {
    const doc = generateDocument({ seed: 42017, courseType, length: 20000 });
    doc.points[1].x += 30;
    const analysis = analyzeDocument(doc);
    assert.ok(
      analysis.length > 20001,
      'exercise the former exact-seed authoring boundary',
    );
    assert.equal(analysis.valid, true, analysis.errors.join(' '));
    assert.equal(analysis.primaryIssue, null);
    assert.equal(doc.generator.length, 20000);
  }
  assert.throws(
    () => generateDocument({ length: 25000, courseType: 'downhill' }),
    /Generator length/,
  );
  assert.throws(
    () => generateDocument({ length: 25000, seedJumps: false }),
    /Generator length/,
  );
});

test('high-altitude assisted jumps stay local to the road and retain truthful cruise and boost advice', () => {
  const source = generateDocument({
    seed: 42017,
    length: 20000,
    courseType: 'downhill',
  });
  const original = structuredClone(source),
    height = source.points[2].y;
  assert.ok(height > 1500);
  const doc = addJump(source, { startIndex: 2, endIndex: 5, receiving: 300 });
  assert.deepEqual(source, original);
  const added = doc.jumps.find((jump) => !jump.id.startsWith('seed-'));
  const launch = doc.points.find((point) => point.id === added.launchPointId);
  const landing = doc.points.find((point) => point.id === added.landingPointId);
  assert.ok(Math.abs(launch.y - height - 35) < 1e-8);
  assert.ok(Math.abs(landing.y - launch.y + 75) < 1e-8);
  const originalIds = new Set(source.points.map((point) => point.id));
  for (const point of doc.points.filter(
    (point) => !originalIds.has(point.id),
  )) {
    assert.ok(
      point.y > height - 200 && point.y < height + 100,
      'the assist is a local ramp, not a vertical diversion',
    );
  }
  const analysis = analyzeDocument(doc);
  assert.equal(analysis.valid, true, analysis.errors.join(' '));
  assert.ok(analysis.length > 20000 && analysis.length < 25000);
  const track = createEditorTrack(doc),
    jump = track.jumps.find((jump) => jump.id === added.id);
  const handling = getShip('kestrel').handling;
  const cruise = predictEditorJumpTrajectory(track, jump, {
    speed: handling.cruiseSpeed,
  });
  const boost = predictEditorJumpTrajectory(track, jump, {
    speed: handling.boostSpeed,
    boost: true,
  });
  assert.equal(cruise.status, 'short');
  assert.match(cruise.summary, /short/);
  assert.equal(boost.landed, true, boost.summary);
});

test('assisted ramps reserve guide-point headroom near the authored height ceiling', () => {
  const source = generateDocument({
    length: 4800,
    courseType: 'downhill',
    seedJumps: false,
  });
  source.points.forEach((point) => {
    point.y = 2970;
  });
  const doc = addJump(source, { startIndex: 2, endIndex: 4, receiving: 300 });
  const jump = doc.jumps[0],
    launch = doc.points.find((point) => point.id === jump.launchPointId);
  assert.ok(launch.y >= 2940 && launch.y <= DOCUMENT_LIMITS.height);
  assert.ok(doc.points.every((point) => point.y <= DOCUMENT_LIMITS.height));
  assert.equal(
    analyzeDocument(doc).valid,
    true,
    analyzeDocument(doc).errors.join(' '),
  );
});

test('authored courses beyond 25 km remain physically gated with a clear length diagnostic', () => {
  const doc = generateDocument({ length: 20000, courseType: 'circuit' });
  doc.points.forEach((point) => {
    point.x *= 1.26;
    point.z *= 1.26;
  });
  assert.doesNotThrow(() => validateDocument(doc));
  const analysis = analyzeDocument(doc);
  assert.ok(analysis.length > 25000);
  assert.equal(analysis.valid, false);
  assert.match(analysis.errors.join(' '), /25,000 m/);
  assert.equal(analysis.primaryIssue.kind, 'length');
});
