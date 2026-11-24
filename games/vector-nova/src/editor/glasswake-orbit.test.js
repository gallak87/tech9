import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { glasswakeOrbitClearance } from './glasswake-orbit.js';

const prop = (asset, min, max) => ({ asset, bounds: { min, max } });

test('the authoring orbit stays ahead of the nearest glacier wall and restores its zoom when the ray clears', () => {
  const target = new Vector3();
  const camera = new Vector3(0, 0, 200);
  const clearance = glasswakeOrbitClearance([
    prop('glacier-terrace', [-30, -20, 150], [30, 80, 180]),
    prop('glacier-seracs', [-30, -20, 70], [30, 80, 100]),
    prop('dock-mast', [-5, -5, 35], [5, 10, 40]),
  ]);
  assert.equal(clearance(target, camera, 200), 62);
  assert.deepEqual(camera.toArray(), [0, 0, 200]);
  assert.equal(clearance(target, new Vector3(200, 0, 0), 200), 200);
  assert.equal(clearance(target, new Vector3(0, 0, 50), 50), 50);
});

test('a target inside scenery does not get squeezed by the enclosing wall', () => {
  const clearance = glasswakeOrbitClearance([
    prop('glacier-terrace', [-15, -50, -20], [15, 50, 50]),
  ]);
  assert.equal(clearance(new Vector3(), new Vector3(0, 0, 200), 200), 200);
});
