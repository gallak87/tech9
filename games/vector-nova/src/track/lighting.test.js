import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrack } from './model.js';
import {
  createPracticalFixtures,
  selectPracticalFixtures,
} from './lighting.js';

const track = createTrack();
const fixtures = createPracticalFixtures(track);
const wrap = (value, length) => ((value % length) + length) % length;
const weightsAt = (distance) =>
  new Map(
    selectPracticalFixtures(fixtures, track.length, distance).map(
      ({ index, weight }) => [index, weight],
    ),
  );

test('real mixed-spacing fixture handoffs enter and leave at zero brightness', () => {
  const gaps = new Set();
  for (let index = 0; index < fixtures.length; index += 1) {
    const current = fixtures[index];
    const next = fixtures[(index + 1) % fixtures.length];
    const gap = wrap(next.distance - current.distance, track.length);
    gaps.add(Math.round(gap));
    const boundary = current.distance + gap * 0.5 - 20;
    const before = weightsAt(boundary - 0.001);
    const at = weightsAt(boundary);
    const after = weightsAt(boundary + 0.001);
    const affected = new Set([...before.keys(), ...after.keys()]);
    assert.equal(before.size, 3);
    assert.equal(after.size, 3);
    assert.equal(affected.size, 4, `No bounded handoff at fixture ${index}`);
    for (const fixtureIndex of affected) {
      assert.ok(
        Math.abs(
          (before.get(fixtureIndex) ?? 0) - (after.get(fixtureIndex) ?? 0),
        ) < 1e-9,
        `Light jumped at fixture ${index}, affecting ${fixtureIndex}`,
      );
      if (!before.has(fixtureIndex) || !after.has(fixtureIndex))
        assert.ok((at.get(fixtureIndex) ?? 0) < 1e-12);
    }
  }
  assert.ok(gaps.has(72), 'Exercise outdoor lamp spacing');
  assert.ok(gaps.has(24), 'Exercise tunnel lamp spacing');
  assert.ok(gaps.size > 2, 'Exercise tunnel mouths and the circuit seam');
});

test('practical pools are stable at rest and continuous forward, reverse and over the seam', () => {
  const samples = [];
  for (let distance = -90; distance < track.length + 90; distance += 0.5) {
    const current = weightsAt(distance);
    const previous = weightsAt(distance - 0.5);
    const periodic = weightsAt(distance + track.length);
    assert.equal(current.size, 3);
    for (const index of new Set([...current.keys(), ...previous.keys()])) {
      const weight = current.get(index) ?? 0;
      assert.ok(weight >= 0 && weight <= 1);
      assert.ok(
        Math.abs(weight - (previous.get(index) ?? 0)) < 0.05,
        `Visible half-metre light step at ${distance}`,
      );
      assert.ok(Math.abs(weight - (periodic.get(index) ?? 0)) < 1e-10);
    }
    samples.push({ distance, current });
  }
  for (const { distance, current } of samples.reverse()) {
    assert.deepEqual(weightsAt(distance), current);
    assert.deepEqual(weightsAt(distance), current);
  }
});
