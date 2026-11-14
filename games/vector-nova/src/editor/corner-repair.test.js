import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  generateDocument,
  analyzeDocument,
  validateDocument,
  pointRouteFractions,
} from './document.js';
import { canSmoothCorner, smoothCorner } from './corner-repair.js';

function point14() {
  const doc = generateDocument({
    seed: 42017,
    length: 5000,
    courseType: 'circuit',
    seedJumps: false,
  });
  const before = doc.points[11],
    after = doc.points[13];
  doc.points[12].x = before.x + (after.x - before.x) * 0.9;
  doc.points[12].z = before.z + (after.z - before.z) * 0.9;
  return doc;
}
const changedIndices = (before, after) =>
  after.points.flatMap((p, i) =>
    p.x !== before.points[i].x || p.z !== before.points[i].z ? [i] : [],
  );
const withoutPoints = (doc) =>
  Object.fromEntries(Object.entries(doc).filter(([key]) => key !== 'points'));
const withoutXZ = (point) =>
  Object.fromEntries(
    Object.entries(point).filter(([key]) => key !== 'x' && key !== 'z'),
  );

test('Point14 repair is local, fully valid and preserves point attributes, world settings and source', async () => {
  const doc = point14();
  doc.name = 'My waterfront circuit';
  doc.settings.sceneryPreset = 'industrial';
  doc.settings.density = 0.42;
  doc.points[3].bank = 0.02;
  const before = structuredClone(doc),
    analysis = analyzeDocument(doc);
  assert.equal(analysis.primaryIssue.kind, 'bend');
  assert.equal(analysis.primaryIssue.pointIndex, 13);
  assert.equal(canSmoothCorner(doc, analysis), true);
  let yields = 0;
  const repaired = await smoothCorner(doc, {
    analysis,
    yieldControl: async () => {
      yields++;
    },
  });
  assert.equal(analyzeDocument(repaired).valid, true);
  assert.deepEqual(doc, before);
  assert.deepEqual(withoutPoints(repaired), withoutPoints(doc));
  assert.deepEqual(changedIndices(doc, repaired), [13]);
  for (let i = 0; i < doc.points.length; i++) {
    assert.deepEqual(withoutXZ(repaired.points[i]), withoutXZ(doc.points[i]));
    if (i < 11 || i > 15) assert.deepEqual(repaired.points[i], doc.points[i]);
  }
  assert(yields > 0 && yields <= 20);
});

test('a tight four-node corner opens without moving the start, finish controls or heights', async () => {
  const doc = createDocument({ blank: true });
  doc.points = [
    [0, 0],
    [400, 0],
    [700, 10],
    [0, 400],
  ].map(([x, z], i) => ({ id: `point-${i}`, x, y: 52, z, bank: 0, roll: 0 }));
  const before = structuredClone(doc);
  assert.equal(analyzeDocument(doc).primaryIssue.kind, 'bend');
  const repaired = await smoothCorner(doc);
  assert(analyzeDocument(repaired).valid);
  assert.deepEqual(changedIndices(doc, repaired), [2]);
  assert.deepEqual(repaired.points[0], before.points[0]);
  assert.deepEqual(repaired.points[1], before.points[1]);
  assert.deepEqual(repaired.points[3], before.points[3]);
  assert.deepEqual(doc, before);
});

test('an ordinary corner after a generated jump repairs without moving its corridor or anchors', async () => {
  const doc = generateDocument({ seed: 42017, length: 3000 });
  doc.points[13].z += 40;
  const before = structuredClone(doc),
    analysis = analyzeDocument(doc);
  assert.equal(analysis.primaryIssue.kind, 'bend');
  assert.equal(analysis.primaryIssue.pointIndex, 13);
  assert.equal(canSmoothCorner(doc, analysis), true);
  const repaired = await smoothCorner(doc, { analysis });
  assert(analyzeDocument(repaired).valid);
  assert.deepEqual(changedIndices(doc, repaired), [13]);
  const canonical = validateDocument(doc),
    fractions = pointRouteFractions(canonical),
    protectedNodes = new Set();
  for (const gap of canonical.jumps) {
    for (let i = 0; i < canonical.points.length; i++) {
      const at = fractions[i] * analysis.length;
      if (
        at >= gap.start * analysis.length - 160 &&
        at <= gap.end * analysis.length + gap.receiving
      )
        for (let d = -2; d <= 2; d++)
          protectedNodes.add(
            (i + d + canonical.points.length) % canonical.points.length,
          );
    }
    const updated = repaired.jumps.find((j) => j.id === gap.id);
    assert.equal(updated.launchPointId, gap.launchPointId);
    assert.equal(updated.landingPointId, gap.landingPointId);
    assert.equal(updated.receiving, gap.receiving);
    for (const id of [gap.launchPointId, gap.landingPointId])
      assert.deepEqual(
        repaired.points.find((p) => p.id === id),
        doc.points.find((p) => p.id === id),
      );
  }
  for (const i of protectedNodes)
    assert.deepEqual(repaired.points[i], doc.points[i]);
  assert.deepEqual(doc, before);
});

test('jump, twist and downhill runout boundaries decline without changing the source', async () => {
  const jump = generateDocument({ seed: 42017, length: 3000 });
  jump.points[1].z += 80;
  const jumpReport = analyzeDocument(jump);
  const protectedReport = {
    ...jumpReport,
    valid: false,
    primaryIssue: { kind: 'bend', pointIndex: 2 },
  };
  const jumpBefore = structuredClone(jump);
  assert.equal(canSmoothCorner(jump, protectedReport), false);
  await assert.rejects(
    smoothCorner(jump, { analysis: protectedReport }),
    /protected start, jump or receiving/,
  );
  assert.deepEqual(jump, jumpBefore);
  const twisted = point14();
  twisted.points[3].roll = Math.PI / 2;
  const twistBefore = structuredClone(twisted),
    twistReport = analyzeDocument(twisted);
  assert.equal(canSmoothCorner(twisted, twistReport), false);
  await assert.rejects(
    smoothCorner(twisted, { analysis: twistReport }),
    /twists/,
  );
  assert.deepEqual(twisted, twistBefore);
  const downhill = generateDocument({
    seed: 42017,
    length: 5000,
    courseType: 'downhill',
    seedJumps: false,
  });
  const downBefore = structuredClone(downhill),
    downReport = {
      ...analyzeDocument(downhill),
      valid: false,
      primaryIssue: { kind: 'bend', pointIndex: downhill.points.length - 2 },
    };
  assert.equal(canSmoothCorner(downhill, downReport), false);
  await assert.rejects(
    smoothCorner(downhill, { analysis: downReport }),
    /protected start, jump or receiving/,
  );
  assert.deepEqual(downhill, downBefore);
});

test('incomplete, invalid-index and unfixable multi-corner drafts fail atomically with bounded work', async () => {
  const blank = createDocument({ blank: true });
  assert.equal(canSmoothCorner(blank, analyzeDocument(blank)), false);
  await assert.rejects(
    smoothCorner(blank),
    /Choose a highlighted tight corner/,
  );
  const doc = point14();
  await assert.rejects(
    smoothCorner(doc, { pointIndex: doc.points.length }),
    /Choose a highlighted tight corner/,
  );
  const before = doc.points[3],
    after = doc.points[5];
  doc.points[4].x = before.x + (after.x - before.x) * 0.9;
  doc.points[4].z = before.z + (after.z - before.z) * 0.9;
  doc.points[4].y = 1500; // A remote steep section cannot be fixed by local X/Z edits at Point14.
  const original = structuredClone(doc),
    report = analyzeDocument(doc);
  assert.equal(report.primaryIssue.kind, 'bend');
  let checks = 0;
  await assert.rejects(
    smoothCorner(doc, {
      pointIndex: 13,
      analysis: report,
      yieldControl: async () => {
        checks++;
      },
    }),
    /manual adjustment or Spread road out/,
  );
  assert(checks > 0 && checks <= 20);
  assert.deepEqual(doc, original);
});

test('already-valid roads are returned as detached canonical data without a shape change', async () => {
  const doc = generateDocument({ seed: 42017, length: 3000 });
  assert.equal(canSmoothCorner(doc, analyzeDocument(doc)), false);
  const result = await smoothCorner(doc);
  assert.deepEqual(result, doc);
  result.points[0].x += 100;
  assert.notEqual(result.points[0].x, doc.points[0].x);
});
