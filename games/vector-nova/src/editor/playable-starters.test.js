import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeDocument,
  generateDocument,
  validateDocument,
} from './document.js';
import { predictEditorJumpTrajectory } from './jumps.js';
import { generatePickupLayout } from './pickups.js';
import { PLAYABLE_STARTERS } from './playable-starters.js';
import { roadPresetOptions } from './road-presets.js';
import { resolveEditorTestStart } from './test-drive.js';
import { createEditorTrack } from './track.js';

// Measuring the deck axes against the horizon includes the automatic corner bank.
function bankDegrees(track, station) {
  const { right, up } = track.sample(station);
  return Math.abs(Math.atan2(right.y, up.y)) * (180 / Math.PI);
}

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
    for (let station = 0; station <= 120; station += 5) {
      assert.ok(
        bankDegrees(track, station) < 12,
        `${id} starts banked at ${station} m`,
      );
    }
    let longestWall = 0;
    let currentWall = 0;
    let steepDistance = 0;
    let peakBank = 0;
    const distance = track.finishDistance ?? track.length;
    for (let station = 0; station < distance; station += 5) {
      const bank = bankDegrees(track, station);
      currentWall = bank >= 80 ? currentWall + 5 : 0;
      longestWall = Math.max(longestWall, currentWall);
      if (bank >= 60) steepDistance += 5;
      peakBank = Math.max(peakBank, bank);
    }
    assert.ok(
      steepDistance < distance * 0.15,
      `${id} spends ${steepDistance} m above 60°`,
    );
    assert.ok(peakBank > 30, `${id} still has a banked carve`);
    if (id === 'harbor') {
      const heights = doc.points.map((p) => p.y);
      assert.ok(
        Math.max(...heights) - Math.min(...heights) >= 150,
        'separate racing decks',
      );
      assert.ok(
        longestWall >= 100 && longestWall <= 300,
        `Harbor wall lasts ${longestWall} m`,
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
      for (
        let station = jump.takeoff - 80;
        station <= jump.landingEnd;
        station += 5
      ) {
        assert.ok(
          bankDegrees(track, station) < 12,
          `${id} jump ${jump.id} banks at ${station} m`,
        );
      }
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

test('a long high-bank Woven circuit completes its corkscrew and keeps jumps upright', () => {
  const options = { ...roadPresetOptions('woven'), seed: 42, biome: 'nacre' };
  const doc = generateDocument(options);
  const saved = validateDocument(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(saved.rolls, doc.rolls);
  assert.equal(saved.rolls.length, 1);
  const [feature] = saved.rolls;
  const track = createEditorTrack(saved);
  const entry = feature.start * track.length;
  const exit = feature.end * track.length;
  assert.equal(Math.abs(feature.turns), 1);
  assert.ok(bankDegrees(track, entry) < 15);
  assert.ok(
    track.sample((entry + exit) / 2).up.y < -0.85,
    'the deck actually inverts',
  );
  assert.ok(bankDegrees(track, exit) < 15);
  const rotation = track.sample(exit).roll - track.sample(entry).roll;
  assert.ok(Math.abs(rotation - feature.turns * Math.PI * 2) < 0.2);
  for (const jump of track.jumps) {
    assert.ok(exit < jump.takeoff - 80 || entry > jump.landingEnd);
    assert.ok(bankDegrees(track, jump.takeoff) < 12);
    assert.ok(bankDegrees(track, jump.landingStart) < 12);
  }
  const mild = generateDocument({ ...options, banking: 0.25 });
  assert.deepEqual(mild.rolls, []);
});
