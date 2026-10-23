import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/colossus/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { inspectJump, COAST } from './shatterline-inspect.mjs';

const level = createLevel({ shape: true });
const track = level.createTrack();
const world = level.createCollisionWorld({ track });
const ships = ['kestrel', 'shrike', 'bastion', 'needle'];

test.after(() => world.dispose());

test('all three jump neighbourhoods contain only bounded authored structure contacts', () => {
  for (const jump of track.jumps)
    assert.ok(
      world.targets.some((t) => t.jumps.includes(jump.id)),
      jump.id,
    );
  assert.ok(
    world.targets.some((t) => t.name === 'District / receiving plinth'),
  );
  assert.ok(
    world.targets.some((t) => t.name.includes('open transfer receiver')),
  );
  assert.ok(world.targets.some((t) => t.name.includes('forging receiver')));
  assert.ok(world.targets.some((t) => t.name === 'Formed outer casing'));
  assert.ok(
    world.targets.length < 600,
    'keep static machinery selection bounded',
  );
  assert.ok(world.targets.reduce((sum, t) => sum + t.triangles, 0) < 60000);
  assert.ok(world.targets.every((t) => t.kind === 'structure'));
  assert.ok(
    !world.targets.some((t) =>
      /moving|travelling counterweight|press shoe|physical sliding head|tread|stencil/.test(
        t.name,
      ),
    ),
  );
  const targetById = new Map(
    world.targets.map((target) => [target.id, target]),
  );
  for (const triangle of world.triangles) {
    const target = targetById.get(triangle.id);
    if (!target) continue;
    for (const point of triangle.points)
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          point[axis] >= target.min[axis] - 1e-4 &&
            point[axis] <= target.max[axis] + 1e-4,
          'structure contacts stay inside the visible authored bounds',
        );
  }
});

test('off-line flights rebound from both visible receiving plinths at every jump', async () => {
  const dynamics = await level.createDynamics({ track, collisionWorld: world });
  try {
    for (const jump of track.jumps) {
      const frame = track.sample(jump.landingStart + (jump.hero ? 320 : 180)),
        forward = frame.tangent.clone().setY(0).normalize(),
        right = new T.Vector3(forward.z, 0, -forward.x);
      for (const shipId of ships)
        for (const side of [-1, 1]) {
          dynamics.reset();
          const runtime = level.createRuntime({
            track,
            collisionWorld: world,
            dynamics,
            presentation: false,
            playtest: { automaticRecovery: false },
          });
          const state = {
            ...createVehicleState(shipId),
            distance: jump.takeoff - 0.1,
          };
          const outgoing = right.clone().multiplyScalar(side);
          try {
            runtime.launch(state, {
              jump: jump.id,
              position: frame.position
                .clone()
                .addScaledVector(outgoing, 60)
                .add(new T.Vector3(0, -50, 0))
                .toArray(),
              quaternion: frame.quaternion.toArray(),
              velocity: outgoing
                .clone()
                .multiplyScalar(65)
                .addScaledVector(forward, 18)
                .toArray(),
            });
            const events = [];
            let rebound = false,
              maximumSpeed = 0;
            for (let tick = 0; tick < 90; tick++) {
              events.push(...runtime.advance(state, COAST, 1 / 120));
              const saved = runtime.snapshot();
              if (saved.flight) {
                const velocity = new T.Vector3().fromArray(
                  saved.flight.velocity,
                );
                maximumSpeed = Math.max(maximumSpeed, velocity.length());
                if (
                  events.some((e) => e.type === 'impact') &&
                  velocity.dot(outgoing) < -1
                )
                  rebound = true;
              }
            }
            const impact = events.find((e) => e.type === 'impact');
            assert.ok(
              impact,
              `${jump.id}/${shipId}/${side} hits the visible side structure`,
            );
            assert.ok(
              rebound,
              `${jump.id}/${shipId}/${side} reverses its outward velocity`,
            );
            assert.ok(
              maximumSpeed < 90,
              `${jump.id}/${shipId}/${side} bounded rebound ${maximumSpeed}`,
            );
            assert.ok(
              impact.payload.severity > 0,
              'shared impact feedback accompanies structure contact',
            );
          } finally {
            runtime.dispose();
          }
        }
    }
  } finally {
    dynamics.dispose();
  }
});

test('every hull retains cruise and boosted landings with physical jump-side scenery', async () => {
  const dynamics = await level.createDynamics({ track, collisionWorld: world });
  try {
    for (const shipId of ships) {
      const pace = getVehiclePace(shipId, track.pace);
      for (const jump of track.jumps)
        for (const speed of [pace.cruiseSpeed, pace.boostSpeed]) {
          dynamics.reset();
          const result = inspectJump({
            track,
            jump,
            shipId,
            speed,
            runtime: level.createRuntime({
              track,
              collisionWorld: world,
              dynamics,
              presentation: false,
            }),
          });
          assert.equal(result.outcome, 'landed', JSON.stringify(result));
          assert.ok(result.landingRemainder > 100);
          assert.equal(
            result.events.filter(
              (event) =>
                event.type === 'impact' &&
                event.payload.contactKind === 'structure',
            ).length,
            0,
            `${jump.id}/${shipId}/${speed} remains clear of structures`,
          );
        }
    }
  } finally {
    dynamics.dispose();
  }
});
