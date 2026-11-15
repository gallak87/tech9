import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDocument,
  validateDocument,
  documentIdentity,
  pointRouteFractions,
} from './document.js';
import {
  applyBiomeSpan,
  clearBiomeSpan,
  resolvedBiomeSpans,
} from './biome-spans.js';
import { createEditorTrack } from './track.js';
import { prepareJumpEdit } from './jump-authoring.js';

const starter = () =>
  generateDocument({ seed: 42017, length: 5000, seedJumps: false });

test('road finishes replace overlapping ranges, merge neighbours and clear only the chosen interval', () => {
  const source = starter(),
    before = JSON.stringify(source);
  const vesper = applyBiomeSpan(source, {
    startIndex: 2,
    endIndex: 8,
    biome: 'vesper-forest',
  });
  const cut = applyBiomeSpan(vesper, {
    startIndex: 4,
    endIndex: 6,
    biome: 'nightweir',
  });
  assert.deepEqual(
    cut.biomeSpans.map((s) => s.biome),
    ['vesper-forest', 'nightweir', 'vesper-forest'],
  );
  const merged = applyBiomeSpan(cut, {
    startIndex: 4,
    endIndex: 6,
    biome: 'vesper-forest',
  });
  assert.deepEqual(merged.biomeSpans, vesper.biomeSpans);
  const cleared = clearBiomeSpan(merged, { startIndex: 4, endIndex: 6 });
  assert.equal(cleared.biomeSpans.length, 2);
  const empty = clearBiomeSpan(cleared, { startIndex: 2, endIndex: 8 });
  assert.deepEqual(empty.biomeSpans, []);
  assert.equal(JSON.stringify(source), before);
  for (const doc of [vesper, cut, merged, cleared, empty]) {
    assert.deepEqual(doc.environment, source.environment);
    assert.deepEqual(doc.settings, source.settings);
    assert.deepEqual(doc.points, source.points);
  }
});

test('saved finish endpoints follow edited road nodes and compile to physical metres', () => {
  const source = applyBiomeSpan(starter(), {
    startIndex: 2,
    endIndex: 8,
    biome: 'vesper-forest',
  });
  const loaded = validateDocument(JSON.parse(JSON.stringify(source)));
  loaded.points[4].x += 20;
  const track = createEditorTrack(loaded),
    spans = resolvedBiomeSpans(loaded, track.length),
    fractions = pointRouteFractions(loaded);
  assert.equal(spans[0].start, fractions[2] * track.length);
  assert.equal(spans[0].end, fractions[8] * track.length);
  assert.deepEqual(track.editorBiomeSpans, spans);
  assert.equal(track.editorBiome, source.biome);
  assert.deepEqual(track.editorEnvironment.environment, source.environment);
  const plain = structuredClone(loaded);
  plain.biomeSpans = [];
  const plainTrack = createEditorTrack(plain);
  for (const at of [0, spans[0].start, spans[0].end, track.length * 0.8]) {
    assert.deepEqual(track.sample(at), plainTrack.sample(at));
    assert.equal(track.isGap(at), plainTrack.isGap(at));
  }
});

test('empty sections preserve historical identity, physical sections change it and jump baseline metadata does not', async () => {
  const plain = starter(),
    originalId = documentIdentity(plain);
  const absent = structuredClone(plain);
  delete absent.biomeSpans;
  assert.equal(documentIdentity(absent), originalId);
  const painted = applyBiomeSpan(plain, {
    startIndex: 2,
    endIndex: 8,
    biome: 'vesper-forest',
  });
  assert.notEqual(documentIdentity(painted), originalId);
  const restored = clearBiomeSpan(painted, {
    spanId: painted.biomeSpans[0].id,
  });
  assert.equal(documentIdentity(restored), originalId);
  const candidate = await prepareJumpEdit(plain, { atDistance: 600 });
  const physicalId = documentIdentity(candidate.document);
  delete candidate.document.jumps[0].authoring;
  assert.equal(documentIdentity(candidate.document), physicalId);
});

test('pilot rejects arbitrary assets, inverted selections, missing anchors and overlapping imported sections', () => {
  const plain = starter();
  assert.throws(
    () =>
      applyBiomeSpan(plain, {
        startIndex: 2,
        endIndex: 4,
        biome: 'https://example.com/road.png',
      }),
    /supports Nightweir and Vesper/,
  );
  assert.throws(
    () =>
      applyBiomeSpan(plain, { startIndex: 4, endIndex: 2, biome: 'nightweir' }),
    /later end point/,
  );
  const painted = applyBiomeSpan(plain, {
    startIndex: 2,
    endIndex: 8,
    biome: 'vesper-forest',
  });
  const missing = structuredClone(painted);
  missing.points.splice(2, 1);
  assert.throws(
    () => validateDocument(missing),
    /Clear the road-finish section/,
  );
  painted.biomeSpans.push({
    id: 'overlapping-span',
    startPointId: plain.points[4].id,
    endPointId: plain.points[10].id,
    biome: 'nightweir',
  });
  assert.throws(() => validateDocument(painted), /must not overlap/);
});

test('pilot keeps jump approaches and rotated road protected', async () => {
  const plain = starter();
  plain.points[3].roll = 0.1;
  assert.throws(
    () =>
      applyBiomeSpan(plain, {
        startIndex: 2,
        endIndex: 4,
        biome: 'vesper-forest',
      }),
    /away from jump ramps/,
  );
  plain.points[3].roll = 0;
  const candidate = await prepareJumpEdit(plain, { atDistance: 600 });
  const jump = candidate.document.jumps[0],
    launch = candidate.document.points.findIndex(
      (p) => p.id === jump.launchPointId,
    ),
    landing = candidate.document.points.findIndex(
      (p) => p.id === jump.landingPointId,
    );
  assert.throws(
    () =>
      applyBiomeSpan(candidate.document, {
        startIndex: launch,
        endIndex: landing,
        biome: 'vesper-forest',
      }),
    /away from jump ramps/,
  );
});
