import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleSurge,
  sampleCindercoilEvent,
  surgeAt,
} from '../src/levels/cindercoil/mechanics.js';

test('Cindercoil warns before rising boundary; protected craft envelope stays clear', () => {
  const zone = { id: 'bowl', start: 100, end: 300, side: 1, phaseOffset: 0 };
  const track = { length: 4500, surgeZones: [zone] };
  for (let time = 0; time < 26; time += 1 / 120) {
    const cue = sampleSurge(time, zone);
    assert.equal(
      surgeAt(track, { distance: 200, lateral: -8, time }).contact,
      false,
    );
    assert.equal(surgeAt(track, { distance: 50, lateral: 8, time }), null);
    if (!cue.active) assert.equal(cue.coverage, 0);
    if (cue.warning) assert.equal(cue.active, false);
    assert.ok(cue.boundary >= -3 && cue.boundary <= 15);
  }
  assert.equal(sampleSurge(2).warning, true);
  assert.equal(
    surgeAt(track, { distance: 200, lateral: 8, time: 4 }).contact,
    true,
  );
  assert.equal(
    surgeAt(track, { distance: 200, lateral: 8, time: 8 }).contact,
    false,
  );
});

test('simulation-clock spectacle is periodic, finite and unchanged at paused times', () => {
  for (let time = -40; time < 80; time += 0.1) {
    const a = sampleCindercoilEvent(time);
    assert.deepEqual(a, sampleCindercoilEvent(time));
    assert.ok(a.rupture >= 0 && a.rupture <= 1 && a.vent >= 0 && a.vent <= 1);
    assert.ok(Math.abs(a.vent - sampleCindercoilEvent(time + 11).vent) < 1e-10);
    assert.ok(
      Math.abs(a.rupture - sampleCindercoilEvent(time + 29).rupture) < 1e-10,
    );
  }
});
