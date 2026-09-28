import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack } from './model.js';

const track = createTrack();

test('all nonadjacent crossing decks provide a full vehicle and camera clearance', () => {
  const samples = Array.from({ length: 900 }, (_, i) =>
    track.sample((i * track.length) / 900),
  );
  let crossings = 0;
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      if (
        (Math.min(j - i, samples.length - (j - i)) * track.length) /
          samples.length <
        160
      )
        continue;
      const a = samples[i].position;
      const b = samples[j].position;
      if (Math.hypot(a.x - b.x, a.z - b.z) > 36) continue;
      crossings += 1;
      assert.ok(
        Math.abs(a.y - b.y) > 42,
        `Track deck clearance at ${i}/${j} is ${Math.abs(a.y - b.y)}m`,
      );
    }
  }
  assert.ok(crossings > 0, 'Authored overpass crossing must be present');
});

test('road width fits every corner and roll transitions remain driveable without frame jumps', () => {
  let maxBank = 0;
  let minGrade = 0;
  let maxGrade = 0;
  for (let s = 0; s < track.length; s += 1) {
    const a = track.sample(s);
    const b = track.sample(s + 1);
    assert.ok(a.quaternion.angleTo(b.quaternion) < 0.023, `Frame jump at ${s}`);
    assert.ok(
      Math.abs(a.curvature) < 0.018,
      `Road too wide for curve radius at ${s}`,
    );
    assert.ok(a.position.y > track.groundY + 40);
    assert.ok(Math.abs(a.tangent.y) < 0.23, 'No unsupported vertical tangent');
    maxBank = Math.max(maxBank, Math.abs(a.bank));
    minGrade = Math.min(minGrade, a.tangent.y);
    maxGrade = Math.max(maxGrade, a.tangent.y);
  }
  assert.ok(
    maxBank > 1.08 && maxBank < 1.1,
    'Signature crown bank reaches 62 degrees',
  );
  assert.ok(
    minGrade < -0.17 && maxGrade > 0.13,
    'Circuit includes authored climbs and descents',
  );
});

test('bank and slope rest scenarios exercise distinct meaningful surface forces', () => {
  const bank = track.scenarios['bank-rest'];
  const slope = track.scenarios['slope-rest'];
  assert.equal(bank.speed, 0);
  assert.equal(slope.speed, 0);
  assert.ok(Math.abs(track.sample(bank.distance).right.y) > 0.8);
  assert.ok(track.sample(slope.distance).tangent.y > 0.13);
});

test('the whole circuit is sectioned continuously and each district has a named showcase', () => {
  assert.equal(track.sections[0].start, 0);
  assert.equal(track.sections.at(-1).end, track.length);
  for (let i = 0; i < track.sections.length; i += 1) {
    const section = track.sections[i];
    if (i) assert.equal(track.sections[i - 1].end, section.start);
    assert.ok(
      section.showcase > section.start && section.showcase < section.end,
    );
    assert.ok(track.scenarios[`${section.id}-showcase`]);
  }
});
