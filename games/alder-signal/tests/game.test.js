import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Mission,
  MISSION_SECONDS,
  REPAIR_SECONDS,
  INTERACT_RANGE,
  RELAYS,
  BASE,
  SPAWN,
  PLAYER_RADIUS,
} from '../src/game/mission.js';
import { moveGrounded } from '../src/game/WalkingController.js';
import { getForestColliders } from '../src/world/ForestWorld.js';
import { pathCenter, terrainHeight } from '../src/world/terrain.js';

const bounds = { minX: -76, maxX: 76, minZ: -76, maxZ: 76 };

test('complete mission requires three ordered repairs and a separate return upload', () => {
  const mission = new Mission();
  assert.equal(mission.state, 'menu');
  mission.tick(400, RELAYS[0].position, true);
  assert.equal(mission.remainingSeconds, MISSION_SECONDS);
  mission.reset('playing', 10);
  let now = 10;
  for (const relay of RELAYS) {
    assert.equal(mission.target.id, relay.id);
    now += REPAIR_SECONDS;
    assert.equal(mission.tick(now, relay.position, true), 'restored');
  }
  assert.deepEqual(
    mission.restored,
    RELAYS.map((r) => r.id),
  );
  assert.equal(mission.state, 'playing');
  assert.equal(mission.target.id, 'base');
  now += 1;
  assert.equal(mission.tick(now, RELAYS[2].position, true), null);
  assert.equal(mission.interactionProgress, 0);
  now += REPAIR_SECONDS;
  assert.equal(mission.tick(now, BASE.position, true), 'won');
  const remaining = mission.remainingSeconds;
  mission.tick(now + 200, BASE.position, true);
  assert.equal(mission.remainingSeconds, remaining);
  mission.reset('playing', 999);
  assert.equal(mission.remainingSeconds, MISSION_SECONDS);
  assert.deepEqual(mission.restored, []);
  assert.equal(mission.interactionProgress, 0);
});

test('only the current nearby relay progresses, and release or departure resets its hold', () => {
  const mission = new Mission();
  mission.reset('playing', 0);
  mission.tick(1, RELAYS[1].position, true);
  assert.equal(mission.interactionProgress, 0);
  mission.tick(2, RELAYS[0].position, true);
  assert.equal(mission.interactionProgress, 0.5);
  mission.tick(2.2, RELAYS[0].position, false);
  assert.equal(mission.interactionProgress, 0);
  mission.tick(3, RELAYS[0].position, true);
  assert.ok(mission.interactionProgress > 0);
  mission.tick(
    3.1,
    [RELAYS[0].position[0] + INTERACT_RANGE + 0.1, 0, RELAYS[0].position[2]],
    true,
  );
  assert.equal(mission.interactionProgress, 0);
  assert.equal(mission.restored.length, 0);
});

test('clock uses real active elapsed seconds, freezes during pause, and loss wins over late completion', () => {
  const mission = new Mission();
  mission.reset('playing', 100);
  mission.tick(107, SPAWN, false);
  assert.equal(mission.remainingSeconds, 143);
  mission.pause(108, 'Focus changed');
  assert.equal(mission.remainingSeconds, 142);
  mission.tick(700, SPAWN, false);
  assert.equal(mission.remainingSeconds, 142);
  assert.equal(mission.state, 'paused');
  mission.resume(700);
  mission.tick(701, SPAWN, false);
  assert.equal(mission.remainingSeconds, 141);
  mission.remainingSeconds = 0.5;
  assert.equal(mission.tick(702, RELAYS[0].position, true), 'lost');
  assert.equal(mission.interactionProgress, 0);
  assert.equal(mission.remainingSeconds, 0);
  assert.equal(mission.restored.length, 0);
  mission.resume(800);
  assert.equal(mission.state, 'lost');
});

test('walking sweeps cannot tunnel through a solid circle and can slide around its side', () => {
  const circles = [{ x: 0, z: 0, radius: 1 }];
  const headOn = moveGrounded({ x: -4, z: 0 }, 8, 0, circles, bounds);
  assert.ok(headOn.x <= -1 - PLAYER_RADIUS + 1e-8);
  assert.ok(Math.hypot(headOn.x, headOn.z) >= 1 + PLAYER_RADIUS - 1e-8);
  const slide = moveGrounded({ x: -2, z: 0 }, 2, 2, circles, bounds);
  assert.ok(slide.z > 1.5);
  assert.ok(Math.hypot(slide.x, slide.z) >= 1 + PLAYER_RADIUS - 1e-8);
  const corner = moveGrounded({ x: 75, z: 75 }, 5, 5, [], bounds);
  assert.equal(corner.x, 76 - PLAYER_RADIUS);
  assert.equal(corner.z, 76 - PLAYER_RADIUS);
});

test('every relay and its trail approach is clear of authored forest proxies', () => {
  const circles = getForestColliders();
  for (const point of [...RELAYS, BASE]) {
    const [x, y, z] = point.position;
    assert.equal(y, terrainHeight(x, z));
    for (let fraction = 0; fraction <= 1; fraction += 0.1) {
      const px = pathCenter(z) + (x - pathCenter(z)) * fraction;
      const clearance = Math.min(
        ...circles.map((c) => Math.hypot(px - c.x, z - c.z) - c.radius),
      );
      assert.ok(
        clearance > PLAYER_RADIUS + 1,
        `${point.id} approach clearance ${clearance}`,
      );
    }
  }
  const mission = new Mission();
  const snapshot = mission.snapshot(SPAWN);
  assert.equal(snapshot.route.length, 3);
  snapshot.route[0].position[0] = 999;
  assert.notEqual(RELAYS[0].position[0], 999);
});
