import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDocument, generateDocument } from './document.js';
import { predictEditorJumpTrajectory } from './jumps.js';
import { generatePickupLayout } from './pickups.js';
import { PLAYABLE_STARTERS } from './playable-starters.js';
import { resolveEditorTestStart } from './test-drive.js';
import { createEditorTrack } from './track.js';

test('playable starter recipes make complete courses with pickups and suitable starts', () => {
  assert.deepEqual(
    PLAYABLE_STARTERS.map((starter) => starter.id),
    ['waterfront', 'forest', 'canyon'],
  );
  for (const { id, options, pickups } of PLAYABLE_STARTERS) {
    const doc = generateDocument(options);
    const track = createEditorTrack(doc);
    const analysis = analyzeDocument(doc, { strict: true });
    assert.equal(analysis.valid, true, id);
    assert.deepEqual(analysis.warnings, [], id);
    assert.equal(doc.settings.sceneryPreset, options.sceneryPreset, id);
    assert.ok(Math.abs(track.length - options.length) < 0.01, id);
    assert.ok(generatePickupLayout(doc, pickups).devices.length > 0, id);
    assert.equal(resolveEditorTestStart(doc).distance, 0, id);
    if (id === 'forest') {
      assert.equal(track.closed, false);
      assert.ok(doc.points[0].y - doc.points.at(-1).y > 500);
    }
    assert.equal(track.jumps.length, id === 'canyon' ? 1 : 0, id);
    for (const jump of track.jumps) {
      const start = resolveEditorTestStart(doc, {
        kind: 'jump',
        jumpId: jump.id,
      });
      assert.ok(start.approachMetres >= 160);
      for (const [speed, boost] of [
        [112, false],
        [157, true],
      ])
        assert.equal(
          predictEditorJumpTrajectory(track, jump, { speed, boost }).status,
          'landed',
        );
    }
  }
});
