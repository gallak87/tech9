import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  generateDocument,
  analyzeDocument,
  pointRouteFraction,
  pointRouteFractions,
} from './document.js';

function loop(
  coordinates = [
    [0, 0],
    [400, 0],
    [700, 10],
    [0, 400],
  ],
) {
  const doc = createDocument({ blank: true });
  doc.points = coordinates.map(([x, z], index) => ({
    id: `point-${index + 1}`,
    x,
    y: 52,
    z,
    bank: 0,
    roll: 0,
  }));
  return doc;
}
function assertSpan(issue, length) {
  assert.ok(Number.isInteger(issue.pointIndex));
  assert.ok(issue.start >= 0 && issue.end <= 1 && issue.start < issue.end);
  assert.ok(Math.abs((issue.end - issue.start) * length - 120) < 0.01);
}

test('a pinched four-point road identifies its actual corner before a duplicate twist error', () => {
  const doc = loop(),
    analysis = analyzeDocument(doc),
    issue = analysis.primaryIssue;
  assert.equal(analysis.valid, false);
  assert.match(analysis.errors.join(' '), /bend is too tight/);
  assert.match(
    analysis.errors.join(' '),
    /connection twists or bends too sharply/,
  );
  assert.equal(issue.kind, 'bend');
  assert.equal(issue.pointIndex, 2);
  assert.equal(issue.label, 'Widen this corner');
  assert.match(issue.message, /Point 3/);
  assertSpan(issue, analysis.length);
  const corner = pointRouteFraction(doc, 2);
  assert.ok(corner >= issue.start && corner <= issue.end);
  doc.points[2].x = 400;
  doc.points[2].z = 400;
  const fixed = analyzeDocument(doc);
  assert.equal(fixed.valid, true);
  assert.equal(fixed.primaryIssue, null);
});

test('diagnostic output is detached and incomplete or crowded drafts do not invent a physical span', () => {
  const doc = loop(),
    first = analyzeDocument(doc);
  first.primaryIssue.label = 'mutated';
  first.primaryIssue.pointIndex = 0;
  first.errors.length = 0;
  const next = analyzeDocument(doc);
  assert.equal(next.primaryIssue.label, 'Widen this corner');
  assert.equal(next.primaryIssue.pointIndex, 2);
  assert.ok(next.errors.length >= 2);
  const blank = createDocument({ blank: true }),
    empty = analyzeDocument(blank);
  assert.equal(empty.primaryIssue.kind, 'incomplete');
  assert.equal(empty.primaryIssue.pointIndex, null);
  assert.equal(Object.hasOwn(empty.primaryIssue, 'start'), false);
  blank.points = loop().points.slice(0, 3);
  const incomplete = analyzeDocument(blank);
  assert.equal(incomplete.primaryIssue.pointIndex, 2);
  assert.equal(Object.hasOwn(incomplete.primaryIssue, 'end'), false);
  const crowded = loop();
  crowded.points[1].x = 1;
  const spacing = analyzeDocument(crowded);
  assert.equal(spacing.primaryIssue.kind, 'spacing');
  assert.equal(spacing.primaryIssue.pointIndex, 1);
  assert.equal(Object.hasOwn(spacing.primaryIssue, 'start'), false);
  assert.equal(Object.hasOwn(spacing.primaryIssue, 'end'), false);
});

test('grade, rotated-deck clearance, rotation and crossing errors each identify an authored road location', () => {
  const grade = loop();
  grade.courseType = 'downhill';
  grade.points.forEach((point, index) => {
    point.x = 0;
    point.y = index * 1000;
    point.z = index * 500;
  });
  const slope = analyzeDocument(grade);
  assert.equal(slope.primaryIssue.kind, 'grade');
  assert.equal(slope.primaryIssue.label, 'Ease this climb');
  assertSpan(slope.primaryIssue, slope.length);
  const wet = loop([
    [0, 0],
    [400, 0],
    [400, 400],
    [0, 400],
  ]);
  wet.width = 64;
  wet.settings.waterLevel = -8;
  wet.points.forEach((point) => {
    point.y = 0;
  });
  const clearance = analyzeDocument(wet);
  assert.equal(clearance.primaryIssue.kind, 'clearance');
  assert.equal(clearance.primaryIssue.label, 'Raise this road');
  assertSpan(clearance.primaryIssue, clearance.length);
  const scenery = loop([
    [0, 0],
    [400, 0],
    [400, 400],
    [0, 400],
  ]);
  scenery.props = [
    {
      id: 'blocking-building',
      type: 'building',
      distance: 0.3,
      lateral: 0,
      scale: 1,
      rotation: 0,
    },
  ];
  const blocked = analyzeDocument(scenery);
  assert.equal(blocked.primaryIssue.kind, 'clearance');
  assert.equal(blocked.primaryIssue.label, 'Move this road away');
  assertSpan(blocked.primaryIssue, blocked.length);
  const rolled = loop([
    [0, 0],
    [400, 0],
    [400, 400],
    [0, 400],
  ]);
  rolled.points[0].roll = Math.PI * 4;
  const rotation = analyzeDocument(rolled);
  assert.equal(rotation.primaryIssue.kind, 'rotation');
  assertSpan(rotation.primaryIssue, rotation.length);
  const crossed = loop();
  crossed.points = Array.from({ length: 16 }, (_, index) => {
    const t = (index / 16) * Math.PI * 2;
    return {
      id: `point-${index + 1}`,
      x: 600 * Math.sin(t),
      y: 52,
      z: 300 * Math.sin(t * 2),
      bank: 0,
      roll: 0,
    };
  });
  const crossing = analyzeDocument(crossed);
  assert.equal(crossing.primaryIssue.kind, 'crossing');
  assert.equal(crossing.primaryIssue.label, 'Separate these road sections');
  assertSpan(crossing.primaryIssue, crossing.length);
});

test('bulk point fractions exactly match individual queries for loops and long descents with anchored gaps', () => {
  for (const options of [
    { seedJumps: false },
    { seed: 42017, length: 3000, courseType: 'circuit' },
    { seed: 7, length: 20000, courseType: 'downhill' },
  ]) {
    const doc = generateDocument(options),
      original = structuredClone(doc),
      fractions = pointRouteFractions(doc);
    assert.equal(fractions.length, doc.points.length);
    assert.deepEqual(
      fractions,
      doc.points.map((_, index) => pointRouteFraction(doc, index)),
    );
    assert.deepEqual(doc, original);
    for (const jump of doc.jumps) {
      assert.equal(
        fractions[
          doc.points.findIndex((point) => point.id === jump.launchPointId)
        ],
        jump.start,
      );
      assert.equal(
        fractions[
          doc.points.findIndex((point) => point.id === jump.landingPointId)
        ],
        jump.end,
      );
    }
    const expected = fractions.slice();
    fractions[0] = 99;
    fractions.push(99);
    assert.deepEqual(pointRouteFractions(doc), expected);
  }
  const blank = createDocument({ blank: true });
  assert.deepEqual(pointRouteFractions(blank), []);
  blank.points = loop().points.slice(0, 3);
  assert.deepEqual(pointRouteFractions(blank), []);
});
