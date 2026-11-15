import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  generateDocument as generate,
  analyzeDocument as analyze,
  validateDocument,
  pointRouteFractions,
} from './document.js';
import {
  canSmoothCorner,
  smoothCorner,
  MAX_CORNER_REPAIR_CANDIDATES,
} from './corner-repair.js';
import { analyzeCornerSegments } from './corner-metrics.js';
import { prepareJumpEdit } from './jump-authoring.js';

// These regressions intentionally retain the original warning indices/corridors.
const analyzeDocument = (value) => analyze(value, { strict: true });
const generateDocument = (options = {}) =>
  generate({
    generatorVersion: options.seedJumps === false ? 1 : 2,
    ...options,
  });

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
const pair = (segment) => `${segment.startPointId}/${segment.endPointId}`;
function assertSafePartial(before, after) {
  const baseline = analyzeCornerSegments(before),
    previous = new Map(baseline.map((segment) => [pair(segment), segment])),
    signatures = new Set(baseline.map((segment) => segment.signature)),
    changed = analyzeCornerSegments(after).filter(
      (segment) => !signatures.has(segment.signature),
    );
  assert(changed.length > 0);
  for (const segment of changed) {
    const old = previous.get(pair(segment));
    assert(segment.minRadius >= 55, `new or changed bend ${pair(segment)}`);
    assert(
      segment.maxGrade <= (old ? Math.max(0.45, old.maxGrade) + 1e-6 : 0.45),
      `new or worsened climb ${pair(segment)}`,
    );
  }
}
function g1() {
  const doc = createDocument({ seed: 42017, blank: true });
  doc.points = [
    [-1075, 393, 30],
    [-1150, 592, 240],
    [-265, 393, 685],
    [-590, 52, -790],
    [-325, 52, -845],
    [-250, 52, -320],
    [-340, 52, 135],
    [-240, 52, 235],
    [125, 199, 30],
    [-250, 202, -230],
  ].map(([x, y, z], i) => ({ id: `g1-point-${i}`, x, y, z, bank: 0, roll: 0 }));
  return doc;
}

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

test('incomplete and invalid-index drafts fail atomically', async () => {
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
});

test('a local corner repairs while an unrelated steep section remains byte-identical', async () => {
  const doc = point14();
  const before = doc.points[3],
    after = doc.points[5];
  doc.points[4].x = before.x + (after.x - before.x) * 0.9;
  doc.points[4].z = before.z + (after.z - before.z) * 0.9;
  doc.points[4].y = 1500; // A remote steep section cannot be fixed by local X/Z edits at Point14.
  const original = structuredClone(doc),
    report = analyzeDocument(doc);
  assert.equal(report.primaryIssue.kind, 'bend');
  let checks = 0;
  const fixed = await smoothCorner(doc, {
    pointIndex: 13,
    analysis: report,
    yieldControl: async () => {
      checks++;
    },
  });
  assertSafePartial(doc, fixed);
  assert.match(analyzeDocument(fixed).errors.join(' '), /climb is too steep/);
  for (let i = 0; i < 10; i++) assert.deepEqual(fixed.points[i], doc.points[i]);
  assert(checks > 0 && checks <= MAX_CORNER_REPAIR_CANDIDATES);
  assert.deepEqual(doc, original);
});

test('G1 widens the selected corner without hiding or worsening its separate climb', async () => {
  const doc = g1();
  doc.biomeSpans = [
    {
      id: 'retained-finish',
      startPointId: doc.points[2].id,
      endPointId: doc.points[4].id,
      biome: 'vesper-forest',
    },
  ];
  const original = structuredClone(doc),
    analysis = analyzeDocument(doc),
    remote = analyzeCornerSegments(doc).find(
      (segment) => segment.startPointId === doc.points[0].id,
    );
  assert.equal(analysis.primaryIssue.kind, 'bend');
  assert.equal(analysis.primaryIssue.pointIndex, 8);
  let checks = 0;
  const fixed = await smoothCorner(doc, {
    analysis,
    yieldControl: async () => {
      checks++;
    },
  });
  const report = analyzeDocument(fixed);
  assert.deepEqual(report.errors, [
    'A climb is too steep. Spread the height change over more road.',
  ]);
  assert.equal(report.primaryIssue.kind, 'grade');
  assert.equal(report.primaryIssue.pointIndex, 1);
  assertSafePartial(doc, fixed);
  assert.deepEqual(
    analyzeCornerSegments(fixed).find(
      (segment) => segment.startPointId === doc.points[0].id,
    ),
    remote,
  );
  assert.deepEqual(withoutPoints(fixed), withoutPoints(doc));
  for (const point of original.points)
    assert.deepEqual(
      withoutXZ(fixed.points.find((p) => p.id === point.id)),
      withoutXZ(point),
    );
  for (const i of [0, 1, 2, 3, 4, 5, 9])
    assert.deepEqual(fixed.points[i], doc.points[i]);
  assert(checks <= MAX_CORNER_REPAIR_CANDIDATES);
  assert.deepEqual(doc, original);
});

test('a playable wild-track corner warning remains optionally repairable to the strict recommendation', async () => {
  const doc = g1(),
    original = structuredClone(doc),
    advisory = analyze(doc);
  assert.equal(advisory.valid, true);
  assert.equal(advisory.primaryIssue, null);
  assert(advisory.advisories.some((issue) => issue.kind === 'bend'));
  assert(advisory.advisories.some((issue) => issue.kind === 'grade'));
  assert.equal(canSmoothCorner(doc, advisory), true);
  const fixed = await smoothCorner(doc, { analysis: advisory }),
    result = analyze(fixed);
  assertSafePartial(doc, fixed);
  assert.equal(result.valid, true);
  assert(!result.advisories.some((issue) => issue.kind === 'bend'));
  assert(result.advisories.some((issue) => issue.kind === 'grade'));
  assert.deepEqual(doc, original);
});

test('local repair does not trade the bend for a newly steep adjoining segment', async () => {
  const doc = g1(),
    baseline = analyzeCornerSegments(doc),
    unsafe = structuredClone(doc),
    point = unsafe.points[8],
    a = unsafe.points[7],
    b = unsafe.points[9];
  point.x += ((a.x + b.x) / 2 - point.x) * 0.55;
  point.z += ((a.z + b.z) / 2 - point.z) * 0.55;
  const unsafeSegments = analyzeCornerSegments(unsafe);
  assert(baseline[7].maxGrade < 0.45);
  assert(unsafeSegments[7].maxGrade > 0.55);
  // Global error classes already include a remote climb, so checking only
  // those strings would fail to distinguish the newly steep local segment.
  assert.deepEqual(
    analyzeDocument(unsafe).errors.slice().sort(),
    analyzeDocument(doc).errors.slice().sort(),
  );
  const fixed = await smoothCorner(doc);
  assertSafePartial(doc, fixed);
  assert(
    analyzeCornerSegments(fixed).find(
      (segment) => pair(segment) === pair(baseline[7]),
    ).maxGrade <= 0.45,
  );
});

test('two separate tight corners can be repaired independently instead of requiring both at once', async () => {
  const doc = createDocument({ blank: true });
  doc.points = Array.from({ length: 16 }, (_, i) => ({
    id: `ring-${i}`,
    x: Math.cos((i * Math.PI) / 8) * 500,
    y: 52,
    z: Math.sin((i * Math.PI) / 8) * 500,
    bank: 0,
    roll: 0,
  }));
  for (const index of [4, 12]) {
    const a = doc.points[index - 1],
      b = doc.points[index + 1];
    Object.assign(doc.points[index], {
      x: a.x + (b.x - a.x) * 0.9,
      z: a.z + (b.z - a.z) * 0.9,
    });
  }
  const first = await smoothCorner(doc);
  assertSafePartial(doc, first);
  assert.equal(analyzeDocument(first).valid, false);
  assert.equal(analyzeDocument(first).primaryIssue.kind, 'bend');
  const second = await smoothCorner(first);
  assert.equal(analyzeDocument(second).valid, true);
  assert.deepEqual(
    second.points.map((point) => point.id),
    doc.points.map((point) => point.id),
  );
});

test('support-point fallback keeps every existing ID and height and leaves remote defects intact', async () => {
  const doc = createDocument({ blank: true });
  const coordinates = [
    [335, 8],
    [181, 95],
    [174, 275],
    [2, 113],
    [-177, 268],
    [-183, 95],
    [-329, 15],
    [-230, -135],
    [-48, -93],
    [-2, -287],
    [96, -185],
    [260, -130],
  ];
  doc.points = coordinates.map(([x, z], i) => ({
    id: `fallback-${i}`,
    x,
    y: 52 + Math.sin((i * Math.PI) / 6) * 4,
    z,
    bank: 0,
    roll: 0,
  }));
  const original = structuredClone(doc),
    analysis = analyzeDocument(doc);
  assert.equal(analysis.primaryIssue.kind, 'bend');
  let checks = 0;
  const fixed = await smoothCorner(doc, {
    analysis,
    yieldControl: async () => {
      checks++;
    },
  });
  assert.equal(fixed.points.length, doc.points.length + 2);
  assertSafePartial(doc, fixed);
  assert.deepEqual(
    fixed.points
      .filter((point) => original.points.some((p) => p.id === point.id))
      .map((point) => point.id),
    original.points.map((point) => point.id),
  );
  for (const point of original.points) {
    const updated = fixed.points.find((p) => p.id === point.id);
    assert.deepEqual(withoutXZ(updated), withoutXZ(point));
    assert(Math.hypot(updated.x - point.x, updated.z - point.z) <= 600);
  }
  const ids = new Set(original.points.map((point) => point.id));
  fixed.points.forEach((point, index) => {
    if (ids.has(point.id)) return;
    let before = index - 1,
      after = index + 1;
    while (
      !ids.has(
        fixed.points[(before + fixed.points.length) % fixed.points.length].id,
      )
    )
      before--;
    while (!ids.has(fixed.points[after % fixed.points.length].id)) after++;
    const a =
        fixed.points[(before + fixed.points.length) % fixed.points.length],
      b = fixed.points[after % fixed.points.length];
    assert(point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y));
  });
  assert(checks <= MAX_CORNER_REPAIR_CANDIDATES);
  assert.deepEqual(doc, original);
});

test('unsupported remote scenery errors still prevent partial repair and preserve the complete source', async () => {
  const doc = point14();
  doc.props.push({
    id: 'blocked-pump',
    type: 'pump',
    distance: 0.1,
    lateral: 0,
    scale: 1,
    rotation: 0,
  });
  const original = structuredClone(doc),
    analysis = analyzeDocument(doc);
  assert.equal(analysis.primaryIssue.kind, 'bend');
  let checks = 0;
  await assert.rejects(
    smoothCorner(doc, {
      analysis,
      yieldControl: async () => {
        checks++;
      },
    }),
    /manual adjustment or Spread road out/,
  );
  assert(checks > 0 && checks <= MAX_CORNER_REPAIR_CANDIDATES);
  assert.deepEqual(doc, original);
});

test('the whole assisted-ramp snapshot stays protected, including its approach and rejoin', async () => {
  const source = createDocument({ blank: true });
  source.points = Array.from({ length: 16 }, (_, i) => ({
    id: `jump-ring-${i}`,
    x: Math.cos((i * Math.PI) / 8) * 1000,
    y: 52,
    z: Math.sin((i * Math.PI) / 8) * 1000,
    bank: 0,
    roll: 0,
  }));
  const prepared = await prepareJumpEdit(source, {
      atDistance: 1000,
      size: 'small',
    }),
    doc = prepared.document,
    owned = doc.jumps[0].authoring.generatedPointIds,
    index = doc.points.findIndex((point) => point.id === owned[1]),
    original = structuredClone(doc),
    report = {
      ...analyzeDocument(doc),
      valid: false,
      primaryIssue: { kind: 'bend', pointIndex: index },
    };
  assert.equal(canSmoothCorner(doc, report), false);
  await assert.rejects(
    smoothCorner(doc, { analysis: report }),
    /protected start, jump or receiving/,
  );
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
