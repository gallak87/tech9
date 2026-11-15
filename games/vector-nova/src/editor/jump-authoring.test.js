import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  generateDocument,
  analyzeDocument,
  validateDocument,
  pointRouteFractions,
} from './document.js';
import { prepareJumpEdit } from './jump-authoring.js';
import { createEditorTrack } from './track.js';
import { predictEditorJumpTrajectory } from './jumps.js';

function sparseCourse() {
  const doc = createDocument({ blank: true });
  doc.points = Array.from({ length: 8 }, (_, i) => ({
    id: `point-${i}`,
    x: 650 * Math.cos((i * Math.PI) / 4),
    y: 100,
    z: 650 * Math.sin((i * Math.PI) / 4),
    bank: 0,
    roll: 0,
  }));
  return doc;
}
const geometry = (doc) =>
  doc.points.map(({ x, y, z, bank, roll }) => [x, y, z, bank, roll]);

test('sparse hand-drawn road previews real sized ramps before one explicit apply', async () => {
  const source = sparseCourse(),
    before = JSON.stringify(source);
  assert.equal(analyzeDocument(source).valid, true);
  for (const [size, expected] of [
    ['small', 180],
    ['medium', 300],
    ['large', 500],
  ]) {
    const candidate = await prepareJumpEdit(source, { pointIndex: 2, size });
    assert.equal(JSON.stringify(source), before);
    assert(analyzeDocument(candidate.document).valid);
    assert(Math.abs(candidate.resolved.horizontalGap - expected) < 35);
    assert(candidate.resolved.gapLength >= candidate.resolved.horizontalGap);
    assert(candidate.resolved.footprint > candidate.resolved.gapLength + 300);
    assert.deepEqual(
      candidate.ghost.sections.map((s) => s.kind),
      ['approach', 'gap', 'receiver'],
    );
    assert(
      candidate.ghost.sections.every(
        (s) =>
          s.points.length > 2 &&
          s.points.every((p) => p.length === 3 && p.every(Number.isFinite)),
      ),
    );
    const track = createEditorTrack(candidate.document),
      jump = track.jumps[0];
    assert.equal(
      predictEditorJumpTrajectory(
        track,
        jump,
        size === 'large' ? { speed: 157, boost: true } : { speed: 112 },
      ).status,
      'landed',
    );
  }
});

test('resize after save/load restores original corridor and never compounds ramps', async () => {
  const source = sparseCourse();
  const first = await prepareJumpEdit(source, { pointIndex: 2, size: 'small' });
  const serialized = validateDocument(
    JSON.parse(JSON.stringify(first.document)),
  );
  const large = await prepareJumpEdit(serialized, {
    jumpId: first.jumpId,
    size: 'large',
  });
  const small = await prepareJumpEdit(large.document, {
    jumpId: first.jumpId,
    size: 'small',
  });
  assert.equal(large.jumpId, first.jumpId);
  assert.equal(small.jumpId, first.jumpId);
  assert.deepEqual(geometry(small.document), geometry(first.document));
  assert.equal(small.document.points.length, first.document.points.length);
  assert.equal(small.document.jumps.length, 1);
  assert.equal(analyzeDocument(small.document).valid, true);
  const metadata = first.document.jumps[0].authoring;
  for (const original of source.points) {
    if (metadata.beforePoints.some((p) => p.id === original.id)) continue;
    assert.deepEqual(
      small.document.points.find((p) => p.id === original.id),
      original,
    );
  }
});

test('edited ramp ownership rejects an unsafe resize without touching the draft', async () => {
  const prepared = await prepareJumpEdit(sparseCourse(), { pointIndex: 2 });
  const changed = structuredClone(prepared.document);
  const id = changed.jumps[0].authoring.generatedPointIds[2];
  changed.points.find((p) => p.id === id).y += 1;
  const before = JSON.stringify(changed);
  await assert.rejects(
    prepareJumpEdit(changed, { jumpId: prepared.jumpId }),
    /ramp has been edited/,
  );
  assert.equal(JSON.stringify(changed), before);
});

test('unrelated jump IDs, lips and pickup placement survive a local insert', async () => {
  const source = generateDocument({
    seed: 42017,
    length: 10000,
    courseType: 'circuit',
  });
  const fractions = pointRouteFractions(source),
    report = analyzeDocument(source);
  // A pickup exactly at an unaffected control point remains at that same node.
  source.pickups.devices = [
    { id: 'pickup-audit', type: 'aegis', at: fractions.at(-2), lane: 0.2 },
  ];
  let prepared;
  for (let at = 800; at < report.length - 1400 && !prepared; at += 500) {
    try {
      prepared = await prepareJumpEdit(source, { atDistance: at });
    } catch {
      /* protected sections are expected */
    }
  }
  assert(prepared, 'the course offers an unprotected jump corridor');
  for (const jump of source.jumps) {
    const saved = prepared.document.jumps.find((j) => j.id === jump.id);
    assert(saved);
    for (const key of ['launchPointId', 'landingPointId']) {
      assert.equal(saved[key], jump[key]);
      assert.deepEqual(
        prepared.document.points.find((p) => p.id === jump[key]),
        source.points.find((p) => p.id === jump[key]),
      );
    }
  }
  const outside = source.points.at(-2),
    index = prepared.document.points.findIndex((p) => p.id === outside.id);
  assert(index >= 0);
  assert(
    Math.abs(
      prepared.document.pickups.devices[0].at -
        pointRouteFractions(prepared.document)[index],
    ) < 1e-10,
  );
});

test('failure reasons identify approach, finish and rotation constraints', async () => {
  const source = sparseCourse(),
    before = JSON.stringify(source);
  await assert.rejects(
    prepareJumpEdit(source, { pointIndex: 0 }),
    /200 m after the start/,
  );
  await assert.rejects(
    prepareJumpEdit(source, { pointIndex: 7, size: 'large' }),
    /not enough road after/,
  );
  source.points.forEach((p) => {
    p.roll = Math.PI / 2;
  });
  // A safe wall-riding course may be valid, but assisted upright ramps cannot
  // silently replace it even if its physical analysis is otherwise accepted.
  await assert.rejects(
    prepareJumpEdit(source, { pointIndex: 2 }),
    /bank or twist|valid road/,
  );
  source.points.forEach((p) => {
    p.roll = 0;
  });
  assert.equal(JSON.stringify(source), before);
});

test('older jumps require explicit rebuild and repeated rebuild resize is stable', async () => {
  const first = await prepareJumpEdit(sparseCourse(), { pointIndex: 2 });
  delete first.document.jumps[0].authoring;
  await assert.rejects(
    prepareJumpEdit(first.document, { jumpId: first.jumpId }),
    /Rebuild jump/,
  );
  const rebuilt = await prepareJumpEdit(first.document, {
    jumpId: first.jumpId,
    legacyRebuild: true,
  });
  assert.match(rebuilt.warnings[0], /original pre-jump road was not saved/);
  const resized = await prepareJumpEdit(rebuilt.document, {
    jumpId: first.jumpId,
    size: 'medium',
  });
  const returned = await prepareJumpEdit(resized.document, {
    jumpId: first.jumpId,
    size: 'small',
  });
  assert.deepEqual(geometry(returned.document), geometry(rebuilt.document));
});

test('saved authoring data is bounded and signature data is canonical', async () => {
  const prepared = await prepareJumpEdit(sparseCourse(), { pointIndex: 2 });
  const invalid = structuredClone(prepared.document);
  invalid.jumps[0].authoring.beforePoints = Array(257).fill(invalid.points[0]);
  assert.throws(
    () => validateDocument(invalid),
    /Unsupported saved jump authoring/,
  );
  invalid.jumps[0].authoring = {
    ...prepared.document.jumps[0].authoring,
    signature: '[]',
  };
  assert.throws(
    () => validateDocument(invalid),
    /Invalid saved jump signature/,
  );
});

test('small and large inserts retain supported runouts at the 3 km and 20 km generator limits', async () => {
  for (const courseType of ['circuit', 'downhill']) {
    for (const length of [3000, 20000]) {
      const source = generateDocument({
        seed: 42017,
        length,
        courseType,
        seedJumps: false,
      });
      for (const size of ['small', 'large']) {
        const prepared = await prepareJumpEdit(source, {
          atDistance: 600,
          size,
        });
        const report = analyzeDocument(prepared.document);
        assert(report.valid, `${courseType} ${length} m ${size}`);
        assert(prepared.document.points.length <= 256);
        assert(prepared.resolved.receiverEnd < report.finishDistance - 40);
      }
    }
  }
});
