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
    ['harbor', 'waterfront', 'forest', 'canyon'],
  );
  for (const { id, options, pickups } of PLAYABLE_STARTERS) {
    const doc = generateDocument(options);
    const track = createEditorTrack(doc);
    const analysis = analyzeDocument(doc, { strict: true });
    assert.equal(analysis.valid, true, id);
    if (id === 'harbor') {
      assert.ok(
        Math.max(...doc.points.map((p) => Math.abs(p.roll))) > 0.6,
        'high-speed bank',
      );
      const heights = doc.points.map((p) => p.y);
      assert.ok(
        Math.max(...heights) - Math.min(...heights) >= 150,
        'separate racing decks',
      );
      let longestWall = 0,
        currentWall = 0;
      for (let station = 0; station < track.length; station += 5) {
        currentWall =
          Math.abs(track.sample(station).roll) > (80 * Math.PI) / 180
            ? currentWall + 5
            : 0;
        longestWall = Math.max(longestWall, currentWall);
      }
      assert.ok(
        longestWall >= 350,
        'flagship holds a wall ride for several seconds at cruise',
      );
      // Count 50 m intervals with meaningful climbing / descending to reject a single isolated hill.
      let climbs = 0,
        dives = 0;
      for (let station = 50; station < track.length; station += 50) {
        const rise =
          track.sample(station).position.y -
          track.sample(station - 50).position.y;
        if (rise > 5) climbs++;
        if (rise < -5) dives++;
      }
      assert.ok(
        climbs >= 20 && dives >= 20,
        'sustained changes of grade around the course',
      );
    }
    assert.ok(
      Math.max(...doc.points.map((p) => Math.abs(p.roll))) > Math.PI / 4,
      id,
    );
    assert.equal(doc.settings.sceneryPreset, options.sceneryPreset, id);
    assert.ok(Math.abs(track.length - options.length) < 0.01, id);
    assert.ok(generatePickupLayout(doc, pickups).devices.length > 0, id);
    assert.equal(resolveEditorTestStart(doc).distance, 0, id);
    if (id === 'forest') {
      assert.equal(track.closed, false);
      assert.ok(doc.points[0].y - doc.points.at(-1).y > 500);
    }
    assert.equal(track.jumps.length, id === 'waterfront' ? 1 : 2, id);
    for (const jump of track.jumps) {
      assert.equal(track.isGap(jump.takeoff + track.length), false);
      assert.equal(track.isGap(jump.landingStart + track.length), false);
      assert.equal(track.isGap((jump.takeoff + jump.landingStart) / 2), true);
      const start = resolveEditorTestStart(doc, {
        kind: 'jump',
        jumpId: jump.id,
      });
      assert.ok(start.approachMetres >= 239, id);
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
