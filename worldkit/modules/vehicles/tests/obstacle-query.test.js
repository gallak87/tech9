import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleMotion, VEHICLE_PRESETS } from '../src/VehicleMotion.js';
const flat = (extra = {}) => ({
  height: () => 0,
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
  ...extra,
});
const overlaps = (circle, area) =>
  circle.x + circle.radius >= area.minX &&
  circle.x - circle.radius <= area.maxX &&
  circle.z + circle.radius >= area.minZ &&
  circle.z - circle.radius <= area.maxZ;

for (const [type, config] of Object.entries(VEHICLE_PRESETS)) {
  test(`${type} injected obstacle queries match static collision and preserve their receiver`, () => {
    const circles = [
      { x: 0, z: -14, radius: 0.2 },
      { x: 4, z: -20, radius: 2 },
    ];
    const staticMotion = new VehicleMotion({
      config,
      world: flat({ colliders: circles }),
    });
    let calls = 0;
    const world = flat({
      circles,
      queryObstacles(area) {
        assert.equal(this, world);
        assert.ok(
          Object.isFrozen(area) && Object.values(area).every(Number.isFinite),
        );
        assert.ok(area.minX <= area.maxX && area.minZ <= area.maxZ);
        calls++;
        return this.circles.filter((circle) => overlaps(circle, area));
      },
    });
    const queriedMotion = new VehicleMotion({ config, world });
    let hit = false;
    for (let i = 0; i < 240; i++) {
      const controls = { throttle: 1 };
      const expected = staticMotion.update(1 / 60, controls);
      const actual = queriedMotion.update(1 / 60, controls);
      assert.deepEqual(actual, expected);
      hit ||= actual.collision;
    }
    assert.ok(calls > 0 && hit);
  });
}

test('queries combine with copied static circles and see world changes between steps', () => {
  let obstacles = [];
  const motion = new VehicleMotion({
    world: flat({
      colliders: [{ x: 20, z: 0, radius: 1 }],
      queryObstacles: () => obstacles,
    }),
  });
  const origin = { x: 0, z: 0, heading: 0 };
  assert.equal(
    motion.collisionBetween(origin, { x: 25, z: 0, heading: 0 }),
    true,
  );
  assert.equal(
    motion.collisionBetween(origin, { x: 0, z: -20, heading: 0 }),
    false,
  );
  obstacles = [{ x: 0, z: -10, radius: 1 }];
  assert.equal(
    motion.collisionBetween(origin, { x: 0, z: -20, heading: 0 }),
    true,
  );
  obstacles = [];
  assert.equal(
    motion.collisionBetween(origin, { x: 0, z: -20, heading: 0 }),
    false,
  );
});

test('bad obstacle callbacks and results fail explicitly, including async queries', () => {
  assert.throws(
    () => new VehicleMotion({ world: flat({ queryObstacles: [] }) }),
    /queryObstacles/,
  );
  for (const result of [
    null,
    {},
    Promise.resolve([]),
    [{ x: 0, z: 0, radius: 0 }],
    [{ x: NaN, z: 0, radius: 1 }],
    new Array(10001),
  ])
    assert.throws(
      () =>
        new VehicleMotion({ world: flat({ queryObstacles: () => result }) }),
      /Obstacles|Colliders/,
    );
});
