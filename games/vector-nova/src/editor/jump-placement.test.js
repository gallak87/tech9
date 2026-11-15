import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDocument,
  analyzeDocument,
  pointRouteFractions,
  createDocument,
} from './document.js';
import { findNextSuitableJump } from './jump-placement.js';
import { createEditorTrack } from './track.js';
import { predictEditorJumpTrajectory } from './jumps.js';

test('automatic jump suggestions sample sparse hand-drawn roads between controls', async () => {
  const source = createDocument({ blank: true });
  source.points = Array.from({ length: 8 }, (_, i) => ({
    id: `point-${i}`,
    x: 650 * Math.cos((i * Math.PI) / 4),
    y: 100,
    z: 650 * Math.sin((i * Math.PI) / 4),
    bank: 0,
    roll: 0,
  }));
  assert(analyzeDocument(source).valid);
  const before = JSON.stringify(source),
    prepared = await findNextSuitableJump(source, { fromIndex: 6 });
  assert.equal(JSON.stringify(source), before);
  assert(analyzeDocument(prepared.document).valid);
  assert(prepared.ghost);
  assert(
    prepared.resolved.horizontalGap > 140 &&
      prepared.resolved.horizontalGap < 220,
  );
  assert(prepared.document.jumps[0].authoring);
  for (const [size, target] of [
    ['medium', 300],
    ['large', 500],
  ]) {
    const sized = await findNextSuitableJump(source, { size });
    assert.equal(sized.requestedSize, size);
    assert(Math.abs(sized.resolved.horizontalGap - target) < 35);
    assert(analyzeDocument(sized.document).valid);
  }
});

test('automatic jump suggestions avoid the start and leave the source untouched until explicitly added', async () => {
  for (const courseType of ['circuit', 'downhill']) {
    const source = generateDocument({
      seed: 42017,
      length: 5000,
      courseType,
      seedJumps: false,
    });
    const before = JSON.stringify(source);
    let yields = 0;
    const progress = [];
    const suggestion = await findNextSuitableJump(source, {
      fromIndex: 0,
      yieldControl: async () => {
        yields++;
      },
      onProgress: (step) => progress.push(step),
    });
    assert.equal(JSON.stringify(source), before);
    assert(analyzeDocument(suggestion.document).valid);
    assert.equal(suggestion.document.jumps.length, 1);
    const station =
      pointRouteFractions(source)[suggestion.startIndex] *
      analyzeDocument(source).length;
    assert(
      station >= 160,
      'the first suggested launch has a supported approach',
    );
    assert(suggestion.endIndex > suggestion.startIndex);
    assert(
      yields > 0 && yields <= 8,
      'finding a section yields between bounded attempts',
    );
    assert.equal(progress.length, yields);
    const track = createEditorTrack(suggestion.document);
    const jump = track.jumps.at(-1);
    const cruise = predictEditorJumpTrajectory(track, jump, { speed: 112 });
    assert.equal(
      cruise.status,
      'landed',
      'the default automatic suggestion is reachable at stock cruise',
    );
  }
});

test('automatic jump suggestions preserve existing gaps and their anchored lips', async () => {
  const source = generateDocument({
    seed: 42017,
    length: 10000,
    courseType: 'circuit',
  });
  const before = JSON.stringify(source);
  const suggestion = await findNextSuitableJump(source, { fromIndex: 0 });
  assert.equal(JSON.stringify(source), before);
  assert.equal(suggestion.document.jumps.length, source.jumps.length + 1);
  assert(analyzeDocument(suggestion.document).valid);
  for (const gap of source.jumps) {
    const saved = suggestion.document.jumps.find((jump) => jump.id === gap.id);
    assert.equal(saved.launchPointId, gap.launchPointId);
    assert.equal(saved.landingPointId, gap.landingPointId);
    for (const id of [gap.launchPointId, gap.landingPointId]) {
      assert.deepEqual(
        suggestion.document.points.find((p) => p.id === id),
        source.points.find((p) => p.id === id),
      );
    }
  }
});

test('invalid or wholly protected roads report a useful failure without changing the draft', async () => {
  const source = generateDocument({
    generatorVersion: 2,
    seed: 42017,
    length: 3000,
    courseType: 'downhill',
  });
  const before = JSON.stringify(source);
  await assert.rejects(
    findNextSuitableJump(source),
    /No clear automatic section/,
  );
  assert.equal(JSON.stringify(source), before);
  const invalid = { ...source, points: source.points.slice(0, 2), jumps: [] };
  await assert.rejects(findNextSuitableJump(invalid), /Finish a valid road/);
});

test('20 km starters retain editing headroom and can add an automatic jump at their real altitude', async () => {
  for (const courseType of ['circuit', 'downhill']) {
    const source = generateDocument({ seed: 42017, length: 20000, courseType });
    const before = JSON.stringify(source);
    const suggestion = await findNextSuitableJump(source);
    assert.equal(JSON.stringify(source), before);
    const report = analyzeDocument(suggestion.document);
    assert(report.valid);
    assert(report.length > 20000 && report.length < 25000);
    const track = createEditorTrack(suggestion.document),
      jump = track.jumps.at(-1);
    const cruise = predictEditorJumpTrajectory(track, jump, { speed: 112 });
    const boost = predictEditorJumpTrajectory(track, jump, {
      speed: 157,
      boost: true,
    });
    assert(
      cruise.status === 'landed' || boost.status === 'landed',
      'the new jump has a truthful reachable stock-ship flight path',
    );
    const oldLaunch = source.points[suggestion.startIndex];
    const actualLaunch = suggestion.document.points.find(
      (p) => p.id === oldLaunch.id,
    );
    assert(
      actualLaunch.y >= oldLaunch.y,
      'assistance does not pull a high road down to a legacy altitude cap',
    );
  }
});

test('search wraps from a late selection, reuses supplied analysis, and preserves unassisted route geometry', async () => {
  const source = generateDocument({
    seed: 42017,
    length: 5000,
    courseType: 'circuit',
    seedJumps: false,
  });
  const before = JSON.stringify(source),
    analysis = analyzeDocument(source),
    fractions = pointRouteFractions(source);
  let yields = 0;
  const progress = [];
  const suggestion = await findNextSuitableJump(source, {
    fromIndex: source.points.length - 1,
    rampAssist: false,
    analysis,
    fractions,
    yieldControl: async () => {
      yields++;
    },
    onProgress: (step) => progress.push(step),
  });
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(
    suggestion.document.points,
    source.points,
    'unassisted suggestions never reshape the road',
  );
  assert.equal(suggestion.document.jumps.length, 1);
  assert.equal(analyzeDocument(suggestion.document).valid, true);
  assert.ok(yields >= 1 && yields <= 8);
  assert.equal(progress.length, yields);
  assert.ok(progress.every((step) => step.total <= 8));
  assert.deepEqual(
    progress.map((step) => step.attempt),
    Array.from({ length: yields }, (_, i) => i + 1),
  );
});
