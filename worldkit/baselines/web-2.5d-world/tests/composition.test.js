import assert from 'node:assert/strict';
import test from 'node:test';
import { coastScene, coastNotes, regionAt } from '../src/coast.js';
import { COASTAL_FRAMES } from '../src/modules/sprite-world/src/coastal.js';

test('authored destinations have retained art, unique identity and meaningful interactions', () => {
  const ids = new Set();
  for (const prop of coastScene.props) {
    assert.ok(!ids.has(prop.id));
    ids.add(prop.id);
    assert.ok(COASTAL_FRAMES[prop.frame], prop.frame);
    assert.ok(
      prop.x >= 0 &&
        prop.x <= coastScene.width &&
        prop.y >= 0 &&
        prop.y <= coastScene.height,
    );
    if (prop.interact) {
      assert.ok(coastNotes[prop.id]);
      assert.ok(prop.interact.radius > 0);
    }
  }
  assert.equal(ids.size, coastScene.props.length);
  assert.equal(regionAt(coastScene.spawn), 'Cypress approach');
});

test('gate footprints leave a walkable central passage and assets do not define scene size', () => {
  const gate = coastScene.props.find((prop) => prop.id === 'gate');
  assert.equal(gate.footprints.length, 2);
  assert.ok(gate.footprints[0].x + gate.footprints[0].w < -12);
  assert.ok(gate.footprints[1].x > 12);
  assert.ok(coastScene.width > 960 && coastScene.height > 600);
});
