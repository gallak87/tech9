import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  generateDocument,
  editorRoadLimits,
  analyzeDocument as analyze,
  analyzePracticeDocument,
  pointRouteFraction,
  pointRouteFractions,
} from './document.js';
import { loadEditorCourse } from './course.js';
import { resolveEditorTestStart } from './test-drive.js';

const analyzeDocument = (doc) => analyze(doc, { strict: true });

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

test('wild manually authored bends and climbs are playable advisories; strict generation retains its recommendations', () => {
  const doc = loop([
    [-1075, 30],
    [-1150, 240],
    [-265, 685],
    [-590, -790],
    [-325, -845],
    [-250, -320],
    [-340, 135],
    [-240, 235],
    [125, 30],
    [-250, -230],
  ]);
  [393, 592, 393, 52, 52, 52, 52, 52, 199, 202].forEach((height, i) => {
    doc.points[i].y = height;
  });
  doc.settings.waterLevel = -50;
  const report = analyze(doc);
  assert.equal(report.valid, true);
  assert.equal(report.primaryIssue, null);
  assert.deepEqual(
    report.advisories.map((issue) => issue.kind),
    ['bend', 'grade'],
  );
  assert(report.advisories.every((issue) => issue.severity === 'warning'));
  assert.equal(report.advisories[0].requiredRadius, 35);
  assert.equal(report.advisories[0].recommendedRadius, 55);
  assert.equal(report.advisories[1].allowedGrade, 1.25);
  assert.equal(analyze(doc, { strict: true }).valid, false);
  assert.equal(
    editorRoadLimits(64).radius,
    36,
    'wide road retains inside-edge space',
  );
  doc.points[1].y = 1000;
  const broken = analyze(doc);
  assert.equal(broken.valid, false);
  assert.equal(broken.primaryIssue.kind, 'grade');
  assert.equal(broken.primaryIssue.severity, 'error');
});

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
  assert.equal(issue.requiredRadius, 55);
  assert.equal(issue.radius, analysis.minRadius);
  assert(issue.position.every(Number.isFinite));
  assert(doc.points.some((point) => point.id === issue.segmentStartId));
  assert(doc.points.some((point) => point.id === issue.segmentEndId));
  const corner = pointRouteFraction(doc, 2);
  assert.ok(corner >= issue.start && corner <= issue.end);
  doc.points[2].x = 400;
  doc.points[2].z = 400;
  const fixed = analyzeDocument(doc);
  assert.equal(fixed.valid, true);
  assert.equal(fixed.primaryIssue, null);
});

test('a tight corner does not hide an independent steep climb in the diagnostics', () => {
  const doc = loop([
    [-1075, 30],
    [-1150, 240],
    [-265, 685],
    [-590, -790],
    [-325, -845],
    [-250, -320],
    [-340, 135],
    [-240, 235],
    [125, 30],
    [-250, -230],
  ]);
  [393, 592, 393, 52, 52, 52, 52, 52, 199, 202].forEach((height, i) => {
    doc.points[i].y = height;
  });
  doc.settings.waterLevel = -50;
  const analysis = analyzeDocument(doc);
  assert.equal(analysis.primaryIssue.pointIndex, 8);
  assert(Math.abs(analysis.primaryIssue.radius - 42.56) < 0.1);
  assert.match(
    analysis.primaryIssue.message,
    /42\.6 m radius \(minimum 55 m\)/,
  );
  const grade = analysis.issues.find((issue) => issue.kind === 'grade');
  assert.equal(grade.pointIndex, 1);
  assert(grade.grade > 1 && grade.allowedGrade === 0.45);
  assert.match(grade.message, /102% grade/);
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
  assert(rotation.rollRateSections.length > 0);
  const measuredRoll = rotation.primaryIssue.distance / rotation.length;
  assert(
    rotation.rollRateSections.some(
      ({ start, end }) => start <= measuredRoll && measuredRoll <= end,
    ),
  );
  rotation.rollRateSections.forEach(({ start, end }, index, ranges) => {
    assert(start >= 0 && end <= 1 && end > start);
    if (index)
      assert(
        ranges[index - 1].end < start,
        'consecutive measured samples are merged',
      );
  });
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
  assert.equal(crossing.primaryIssue.label, 'Nearby road decks');
  assert.notEqual(
    crossing.primaryIssue.otherPointIndex,
    crossing.primaryIssue.pointIndex,
  );
  assert.equal(crossing.primaryIssue.otherPosition.length, 3);
  assert.match(
    crossing.primaryIssue.message,
    /centerlines.*sideways.*vertically/,
  );
  assertSpan(crossing.primaryIssue, crossing.length);

  for (const [course, kind] of [
    [grade, 'grade'],
    [wet, 'clearance'],
    [scenery, 'clearance'],
    [rolled, 'rotation'],
    [crossed, 'crossing'],
  ]) {
    const practice = analyzePracticeDocument(course);
    assert(practice.valid, practice.errors.join(' '));
    const advisory = practice.advisories.find((issue) => issue.kind === kind);
    assert(advisory, `${kind} should be an advisory`);
    assertSpan(advisory, practice.length);
  }
});

test('Practice, the course compiler and native start agree on supported geometry', () => {
  const doc = loop();
  assert.equal(analyzeDocument(doc).valid, false);
  assert.equal(analyzePracticeDocument(doc).valid, true);
  assert.doesNotThrow(() => loadEditorCourse(doc).definition.createTrack());
  assert.equal(resolveEditorTestStart(doc).distance, 0);

  const attached = structuredClone(doc);
  attached.jumps = [
    { id: 'first-gap', start: 0.2, end: 0.4, receiving: 300 },
    { id: 'second-gap', start: 0.45, end: 0.65, receiving: 300 },
  ];
  assert.equal(analyzePracticeDocument(attached).primaryIssue.kind, 'jump');
  assert.throws(() => loadEditorCourse(attached), /separate launch/);
  assert.throws(() => resolveEditorTestStart(attached), /separate launch/);

  const overlapping = structuredClone(doc);
  Object.assign(overlapping.points[1], { x: 0, y: 52, z: 0 });
  assert.equal(
    analyzePracticeDocument(overlapping).primaryIssue.kind,
    'spacing',
  );
  assert.throws(() => loadEditorCourse(overlapping), /distinct positions/);
  assert.throws(
    () => resolveEditorTestStart(overlapping),
    /distinct positions/,
  );
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
