import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newHunt,
  stepHunt,
  shoot,
  retrieve,
  resolveMovement,
} from '../src/game/rules.js';
import { clearSight } from '../src/game/encounter.js';
test('a full aimed shot requires actual hit, range and retrieval before success', () => {
  const s = newHunt();
  assert.equal(retrieve(s, 1), false);
  shoot(s, { draw: 1, aiming: true, hit: true, range: 18 });
  assert.equal(s.phase, 'retrieve');
  assert.equal(s.arrows, 2);
  assert.equal(retrieve(s, 4), false);
  assert.equal(retrieve(s, 2), true);
  assert.equal(s.phase, 'won');
  assert.equal(
    shoot(s, { draw: 1, aiming: true, hit: true, range: 18 }),
    false,
  );
});
test('misses, short draws and out-of-range shots cannot award a hit', () => {
  const s = newHunt();
  assert.equal(
    shoot(s, { draw: 0.1, aiming: true, hit: true, range: 10 }),
    false,
  );
  for (const options of [
    { draw: 1, hit: false, range: 10 },
    { draw: 0.5, hit: true, range: 10 },
    { draw: 1, hit: true, range: 28 },
  ])
    shoot(s, { aiming: true, ...options });
  assert.equal(s.phase, 'lost');
  assert.equal(s.shots, 3);
  assert.equal(s.arrows, 0);
});
test('quiet approach is safer; stopping lets alertness recover, a noisy rush causes escape', () => {
  const quiet = newHunt(),
    loud = newHunt();
  for (let i = 0; i < 100; i++) {
    stepHunt(quiet, 0.05, {
      distance: 14,
      moving: true,
      quiet: true,
      visible: true,
    });
    stepHunt(loud, 0.05, {
      distance: 14,
      moving: true,
      quiet: false,
      visible: true,
    });
  }
  assert.equal(quiet.alert, 0);
  assert.equal(loud.animal, 'fleeing');
  for (let i = 0; i < 100; i++)
    stepHunt(loud, 0.05, {
      distance: 30,
      moving: false,
      quiet: true,
      visible: true,
    });
  assert.equal(loud.phase, 'lost');
  quiet.alert = 0.8;
  stepHunt(quiet, 3, {
    distance: 14,
    moving: false,
    quiet: true,
    visible: true,
  });
  assert.ok(quiet.alert < 0.8);
});
test('fresh hunts cannot inherit arrows, alert or outcome', () => {
  const a = newHunt();
  a.phase = 'won';
  a.arrows = 0;
  a.alert = 1;
  const b = newHunt();
  assert.equal(b.phase, 'stalk');
  assert.equal(b.arrows, 3);
  assert.equal(b.alert, 0);
});
test('walking cannot cross solid trunk or boundary; diagonal slide remains finite', () => {
  const c = [{ x: 0, z: 0, radius: 1 }],
    bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  let p = { x: 0, z: 3 };
  for (let i = 0; i < 100; i++) {
    p = resolveMovement(p, 0, -0.1, c, bounds);
    assert.ok(Math.hypot(p.x, p.z) >= 1.32 - 1e-9);
  }
  assert.ok(p.z >= 1.32 - 1e-9);
  p = resolveMovement({ x: 4.6, z: 4.6 }, 1, 1, c, bounds);
  assert.ok(p.x <= 4.68 && p.z <= 4.68);
});
test('large blockers interrupt line of sight but off-axis trunks do not', () => {
  assert.equal(
    clearSight({ x: 0, z: 0 }, { x: 0, z: -10 }, [{ x: 0, z: -5, radius: 1 }]),
    false,
  );
  assert.equal(
    clearSight({ x: 0, z: 0 }, { x: 0, z: -10 }, [{ x: 3, z: -5, radius: 1 }]),
    true,
  );
});

test('alpha-cutout vegetation is excluded from solid arrow blockers', async () => {
  const THREE = await import('three');
  const { collectShotBlockers } = await import('../src/game/encounter.js');
  const scene = new THREE.Scene(),
    geometry = new THREE.BoxGeometry();
  const solid = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  const foliage = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ alphaTest: 0.4 }),
  );
  scene.add(solid, foliage);
  assert.deepEqual(collectShotBlockers(scene), [solid]);
  geometry.dispose();
  solid.material.dispose();
  foliage.material.dispose();
});
