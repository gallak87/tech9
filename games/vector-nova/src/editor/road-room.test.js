import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocument,
  analyzeDocument,
  generateDocument,
} from './document.js';
import { spreadRoad, canSpreadRoad } from './road-room.js';

const drawn = () => ({
  ...createDocument({ blank: true }),
  points: [
    { id: 'point-a', x: -420, y: 52, z: -90, bank: 0, roll: 0 },
    { id: 'point-b', x: 20, y: 52, z: -20, bank: 0, roll: 0 },
    { id: 'point-c', x: 420, y: 52, z: 90, bank: 0, roll: 0 },
    { id: 'point-d', x: 0, y: 52, z: 260, bank: 0, roll: 0 },
  ],
});
test('spreading a pinched drawn loop gives it physical room without changing its shape, heights or point identities', () => {
  const source = drawn(),
    before = JSON.stringify(source);
  assert.equal(analyzeDocument(source).valid, false);
  const widened = spreadRoad(source);
  assert(analyzeDocument(widened).valid);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(
    widened.points.map((p) => [p.id, p.y, p.bank, p.roll]),
    source.points.map((p) => [p.id, p.y, p.bank, p.roll]),
  );
  const ratio =
    Math.hypot(
      widened.points[1].x - widened.points[0].x,
      widened.points[1].z - widened.points[0].z,
    ) /
    Math.hypot(
      source.points[1].x - source.points[0].x,
      source.points[1].z - source.points[0].z,
    );
  assert(ratio > 1);
  for (let i = 0; i < source.points.length; i++)
    for (let j = i + 1; j < source.points.length; j++) {
      const a = Math.hypot(
        source.points[i].x - source.points[j].x,
        source.points[i].z - source.points[j].z,
      );
      const b = Math.hypot(
        widened.points[i].x - widened.points[j].x,
        widened.points[i].z - widened.points[j].z,
      );
      assert(
        Math.abs(b / a - ratio) < 1e-9,
        'every road segment keeps the same relative shape',
      );
    }
});
test('spreading refuses feature-bearing or overlapping drafts and leaves already-valid roads alone', () => {
  const seeded = generateDocument({ seed: 7 });
  assert.equal(canSpreadRoad(seeded), false);
  assert.throws(() => spreadRoad(seeded), /without jumps or twists/);
  const twisted = drawn();
  twisted.points[1].roll = Math.PI / 2;
  assert.equal(canSpreadRoad(twisted), false);
  const duplicate = drawn();
  duplicate.points[1] = {
    ...duplicate.points[1],
    x: duplicate.points[0].x,
    z: duplicate.points[0].z,
  };
  assert.throws(() => spreadRoad(duplicate), /overlapping points/);
  const valid = generateDocument({ seed: 7, seedJumps: false });
  assert.deepEqual(spreadRoad(valid), valid);
});
