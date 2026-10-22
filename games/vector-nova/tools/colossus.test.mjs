import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/colossus/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';
import { inspectJump, COAST } from './shatterline-inspect.mjs';
import {
  samplePress,
  pressPose,
  sampleCrossfeed,
} from '../src/levels/colossus/mechanics.js';
import { trackChallenge } from '../src/frontend/track-challenge.js';
import { createSurfaceProjector } from '../src/pickups/surface-projector.js';
import { collectRoadSurfaces } from '../src/pickups/device-mount.js';
import { createDevices } from '../src/levels/colossus/devices.js';
import { createFinishMarker } from '../src/race/finish-marker.js';
import * as T from 'three';
import { createColossusPaint } from '../src/levels/colossus/track/presentation.js';
import { createIndustrialKit } from '@worldkit/environment/industrial';
const level = createLevel(),
  track = level.createTrack();

test('9–10 km hard circuit closes its surface frame and includes reversing rolls, climbs and steep dives', () => {
  assert.equal(trackChallenge('colossus'), 'Hard');
  assert.equal(track.closed, true);
  assert.ok(
    track.length >= 9000 && track.length <= 10000,
    'keep the whole lap within the agreed 9–10 km limit',
  );
  assert.ok(
    track.sections.every((section) => section.end - section.start < 1200),
    'no multi-kilometre connecting sections',
  );
  for (const lateral of [-30, 0, 30]) {
    const a = track.sampleSurface(0, lateral),
      b = track.sampleSurface(track.length, lateral);
    assert.ok(a.position.distanceTo(b.position) < 1e-6);
    assert.ok(a.quaternion.angleTo(b.quaternion) < 1e-6);
    const before = track.sampleSurface(track.length - 0.1, lateral);
    assert.ok(before.position.distanceTo(a.position) < 0.11);
    assert.ok(before.quaternion.angleTo(a.quaternion) < 0.001);
  }
  let steep = 0,
    climbing = 0;
  for (let s = 0; s < track.length; s += 10) {
    if (track.isGap(s)) continue;
    const f = track.sample(s);
    if (f.tangent.y < -0.5) steep += 10;
    if (f.tangent.y > 0.1) climbing += 10;
  }
  assert.ok(steep > 150, 'retain the steep discharge dive');
  assert.ok(climbing > 1000, 'retain climbing variety within the compact loop');
  for (const roll of track.rolls) {
    const angles = Array.from(
      { length: 31 },
      (_, i) =>
        track.sample(roll.start + ((roll.end - roll.start) * i) / 30).roll *
        Math.sign(roll.peak),
    );
    assert.ok(
      Math.max(...angles) > 1.7 && Math.max(...angles) < 1.9,
      'partial wall roll, not a full rotation',
    );
    assert.ok(
      Math.min(...angles) < -0.5,
      'the roll unwinds into the opposite bank',
    );
  }
  assert.equal(track.jumps.length, 3);
});

test('all hulls cross every transfer at cruise and boost without scripted flight', () => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const pace = getVehiclePace(shipId, track.pace);
    for (const jump of track.jumps)
      for (const speed of [pace.cruiseSpeed, pace.boostSpeed]) {
        const result = inspectJump({
          track,
          jump,
          shipId,
          speed,
          runtime: level.createRuntime({ track, presentation: false }),
        });
        assert.equal(result.outcome, 'landed', JSON.stringify(result));
        assert.ok(result.landingRemainder > 100);
        if (jump.hero) assert.ok(result.airtime > 3.3);
      }
  }
});

test('crossfeed force agrees with tread coverage and leaves a quiet strip', () => {
  for (const belt of track.belts) {
    const distance = (belt.start + belt.end) / 2;
    assert.equal(sampleCrossfeed(track, distance, -belt.side * 20, 2), null);
    const sample = sampleCrossfeed(track, distance, belt.side * 12, 2);
    assert.ok(sample.lateralAcceleration * belt.side > 15);
    assert.equal(sample.grip, 0.58);
    assert.deepEqual(
      sampleCrossfeed(track, distance + track.length, belt.side * 12, 2),
      sample,
    );
  }
});

test('actual raised shoulders support the hull through both reversing rolls', async () => {
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  try {
    for (const roll of track.rolls)
      for (const lateral of [-23, 23]) {
        dynamics.reset();
        const runtime = level.createRuntime({
          track,
          collisionWorld,
          dynamics,
          presentation: false,
        });
        const state = {
          ...createVehicleState('kestrel'),
          distance: roll.start - 20,
          speed: 115,
          lateral,
        };
        runtime.reset({ state });
        let airTicks = 0;
        for (
          let tick = 0;
          tick < 120 * 25 && state.distance < roll.end + 40;
          tick++
        ) {
          const input = getRacerControl(state, track, {
            runtime,
            devices: [],
            difficulty: 'medium',
            pace: 1,
          });
          runtime.advance(state, input, 1 / 120);
          if (runtime.pose(1)?.grounded === false) airTicks++;
        }
        assert.ok(
          state.distance >= roll.end + 40,
          roll.id + ' traversal: ' + JSON.stringify(state),
        );
        assert.ok(
          airTicks < 4,
          roll.id +
            ' shoulder ' +
            lateral +
            ' must stay supported; airborne ticks: ' +
            airTicks,
        );
        runtime.dispose();
      }
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
});

test('press shoe physically blocks its die while the other half is traversable; clock replays', async () => {
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  try {
    const press = track.presses[0];
    assert.ok(samplePress(4, press).bottom < 1);
    const results = [];
    for (const lateral of [press.lateral, -press.lateral]) {
      dynamics.reset();
      const runtime = level.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
      });
      const state = {
        ...createVehicleState(),
        distance: press.distance - 55,
        speed: 90,
        lateral,
        time: 3.5,
      };
      runtime.reset({ state });
      let contacts = 0;
      for (let i = 0; i < 120; i++) {
        const events = runtime.advance(
          state,
          { ...COAST, throttle: 1 },
          1 / 120,
        );
        contacts += events.filter((e) => e.type === 'impact').length;
      }
      results.push({ distance: state.distance, contacts });
      const saved = {
        world: dynamics.snapshot(),
        motion: runtime.snapshot(),
        state: { ...state },
      };
      for (let i = 0; i < 20; i++) runtime.advance(state, COAST, 1 / 120);
      const expected = { ...state };
      runtime.restore(saved.motion);
      dynamics.restore(saved.world);
      Object.assign(state, saved.state);
      for (let i = 0; i < 20; i++) runtime.advance(state, COAST, 1 / 120);
      assert.deepEqual(
        state,
        expected,
        'machine and ship restore to the same trajectory',
      );
      runtime.dispose();
    }
    assert.ok(results[0].contacts > 0, JSON.stringify(results));
    assert.ok(
      results[1].distance > results[0].distance + 20,
      JSON.stringify(results),
    );
    const pose = pressPose(track, press, 4);
    assert.ok(
      pose.position.distanceTo(track.sample(press.distance).position) < 30,
    );
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
});

test('boosted roll entries keep every hull supported near both shoulders', async () => {
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  try {
    for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
      const speed = getVehiclePace(shipId, track.pace).boostSpeed;
      for (const roll of track.rolls)
        for (const lateral of [-29, 29]) {
          dynamics.reset();
          const runtime = level.createRuntime({
            track,
            collisionWorld,
            dynamics,
            presentation: false,
          });
          const state = {
            ...createVehicleState(shipId),
            distance: roll.start - 60,
            speed,
            lateral,
          };
          runtime.reset({ state });
          for (
            let tick = 0;
            tick < 600 && state.distance < roll.start + 160;
            tick++
          ) {
            const input = getRacerControl(state, track, {
              lane: lateral,
              runtime,
              devices: [],
              difficulty: 'hard',
            });
            runtime.advance(
              state,
              { ...input, throttle: 1, brake: 0, boost: true },
              1 / 120,
            );
            assert.notEqual(
              runtime.pose(1)?.grounded,
              false,
              shipId + ' ' + roll.id + ' shoulder ' + lateral,
            );
            assert.ok(
              state.speed < speed * 1.4,
              'edge contact must not create a speed spike',
            );
          }
          assert.ok(state.distance >= roll.start + 160);
          runtime.dispose();
        }
    }
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
});

test('production contact carries the ship across the lap seam without a snap or recovery', async () => {
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  try {
    for (const lateral of [-23, 0, 23]) {
      dynamics.reset();
      const runtime = level.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
      });
      const state = {
        ...createVehicleState(),
        distance: track.length - 80,
        speed: 130,
        lateral,
      };
      runtime.reset({ state });
      for (let i = 0; i < 240 && state.distance < track.length + 40; i++) {
        runtime.advance(state, { ...COAST, throttle: 1 }, 1 / 120);
        assert.notEqual(runtime.pose(1)?.grounded, false);
        assert.notEqual(runtime.pose(1)?.recovering, true);
      }
      assert.ok(state.distance >= track.length + 40);
      runtime.dispose();
    }
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
});

test('industrial assemblies share owned resources and dispose once', () => {
  const kit = createIndustrialKit();
  const a = kit.createAssembly('pressFrame'),
    b = kit.createAssembly('pressFrame');
  assert.equal(a.children[0].geometry, b.children[0].geometry);
  let releases = 0;
  a.children[0].geometry.addEventListener('dispose', () => releases++);
  assert.equal(a.children[0].geometry.isBufferGeometry, true);
  kit.dispose();
  kit.dispose();
  assert.equal(releases, 1);
});

test('curved pickup footprints sit on actual rendered facets and finish paint clears the full bowl', () => {
  const road = level.createRoad({ track });
  const projector = createSurfaceProjector(
    track,
    collectRoadSurfaces(road.group),
  );
  const paint = createFinishMarker(track);
  try {
    for (const device of createDevices(track)) {
      const { distance: s, lateral: x, width: w, length: l } = device;
      const footprint = [
        [x - w / 2, s - l / 2],
        [x + w / 2, s - l / 2],
        [x + w / 2, s + l / 2],
        [x - w / 2, s + l / 2],
      ];
      const g = projector.geometry([footprint], 0.1),
        p = g.attributes.position,
        c = g.attributes.roadCoord;
      assert.ok(p.count > 0, device.id);
      for (let i = 0; i < p.count; i++) {
        const at = new T.Vector3().fromBufferAttribute(p, i);
        const base = projector.sample(c.getY(i), c.getX(i));
        assert.ok(
          at.distanceTo(base) < 0.105,
          device.id +
            ' must follow the steel rather than floating above its rim',
        );
      }
      g.dispose();
    }
    const positions = paint.group.children[0].geometry.attributes.position;
    assert.ok(
      Math.max(
        ...Array.from({ length: positions.count }, (_, i) => positions.getY(i)),
      ) >
        track.sample(0).position.y + 6,
      'checkerboard climbs both curved shoulders',
    );
  } finally {
    paint.dispose();
    projector.dispose();
    road.dispose();
  }
});

test('ejectors physically throw every hull through the discharge edge, then lift for a safe return', async () => {
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  try {
    for (const e of track.ejectors)
      for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
        dynamics.reset();
        const runtime = level.createRuntime({
          track,
          collisionWorld,
          dynamics,
          presentation: false,
        });
        const state = {
          ...createVehicleState(shipId),
          distance: e.distance,
          time: 13.4 - e.phaseOffset,
        };
        runtime.reset({ state });
        const events = [];
        for (let i = 0; i < 120 * 6; i++)
          events.push(...runtime.advance(state, { throttle: 0 }, 1 / 120));
        assert.equal(
          events.filter((e) => e.type === 'road-departure').length,
          1,
          shipId + ' ' + e.id + ' only the outgoing stroke ejects',
        );
        assert.equal(
          events.filter((e) => e.type === 'road-recovery').length,
          1,
        );
        assert.ok(events.some((e) => e.type === 'impact'));
        runtime.dispose();
        dynamics.reset();
        const pass = level.createRuntime({
          track,
          collisionWorld,
          dynamics,
          presentation: false,
        });
        const safe = {
          ...createVehicleState(shipId),
          distance: e.distance - 70,
          speed: 120,
          time: 7 - e.phaseOffset,
        };
        pass.reset({ state: safe });
        for (let i = 0; i < 120 && safe.distance < e.distance + 60; i++) {
          const events = pass.advance(safe, { throttle: 1 }, 1 / 120);
          assert.ok(
            !events.some(
              (e) => e.type === 'road-departure' || e.type === 'impact',
            ),
            shipId + ' quiet window',
          );
        }
        assert.ok(safe.distance > e.distance + 40);
        pass.dispose();
      }
  } finally {
    dynamics.dispose();
    collisionWorld.dispose();
  }
});

test('belt and hazard paint conforms to the exact rendered triangles across banks and curved shoulders', () => {
  const road = level.createRoad({ track });
  road.group.updateMatrixWorld(true);
  const projector = createSurfaceProjector(
    track,
    collectRoadSurfaces(road.group),
  );
  const paint = createColossusPaint(track);
  try {
    for (const belt of track.belts) {
      const g = paint.rectangle(belt.start, belt.end, {
        min: -35,
        max: 35,
        lift: 0.05,
      });
      const p = g.attributes.position,
        c = g.attributes.roadCoord;
      assert.ok(p.count > 0);
      for (let i = 0; i < p.count; i++) {
        const position = new T.Vector3().fromBufferAttribute(p, i);
        assert.ok(
          position.distanceTo(projector.sample(c.getX(i), c.getY(i))) < 0.055,
          'paint must not cross or float above steel',
        );
      }
      g.dispose();
    }
  } finally {
    paint.dispose();
    projector.dispose();
    road.dispose();
  }
});
