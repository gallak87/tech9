import assert from 'node:assert/strict';
import test from 'node:test';
import { createCindercoilTrack } from '../src/levels/cindercoil/track/model.js';
import { createCindercoilRuntime } from '../src/levels/cindercoil/runtime.js';
import { createCindercoilCollisionWorld } from '../src/levels/cindercoil/collision.js';
import { createHelionTrack } from '../src/levels/helion/track/model.js';
import { createHelionRuntime } from '../src/levels/helion/runtime.js';
import { createHelionCollisionWorld } from '../src/levels/helion/collision.js';
import { sampleHelionThermal } from '../src/levels/helion/thermal.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';

const DT = 1 / 120;
const ranks = Object.freeze({
  speed: 3,
  acceleration: 3,
  handling: 3,
  braking: 3,
  boost: 3,
  toughness: 3,
});
const hulls = [
  ['kestrel', 'rook'],
  ['shrike', 'vise'],
  ['bastion', 'manta'],
  ['needle', 'pike'],
];
const worlds = {};
test.before(async () => {
  for (const [id, makeTrack, makeRuntime, makeCollision] of [
    [
      'cindercoil',
      createCindercoilTrack,
      createCindercoilRuntime,
      createCindercoilCollisionWorld,
    ],
    [
      'helion',
      createHelionTrack,
      createHelionRuntime,
      createHelionCollisionWorld,
    ],
  ]) {
    const track = makeTrack();
    const collisionWorld = makeCollision({ track });
    const dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
    worlds[id] = { track, collisionWorld, dynamics, makeRuntime };
  }
});
test.after(() => {
  for (const world of Object.values(worlds)) {
    world.dynamics.dispose();
    world.collisionWorld.dispose();
  }
});

// A matched control run disables only the new driver hint, retaining the same
// production native body, authored hazards, clock, steering assistance and build.
function approach(
  world,
  shipId,
  chassisId,
  upgraded,
  zone,
  enabled,
  options = {},
) {
  const { track, dynamics, collisionWorld, makeRuntime } = world;
  dynamics.reset();
  const runtime = makeRuntime({
    track,
    dynamics,
    collisionWorld,
    presentation: false,
  });
  const lane =
    options.lane ?? (zone.kind === 'spill' || zone.kind === 'flare' ? 4 : -7);
  const state = {
    ...createVehicleState(shipId),
    chassisId,
    distance: options.start ?? zone.start - 300,
    lateral: lane,
    speed: 110,
    energy: 100,
    time:
      options.time ??
      (world === worlds.cindercoil
        ? (4 - (zone.phaseOffset ?? 0) - 300 / 110 + 13) % 13
        : (5 - (zone.phase ?? 0) - 300 / 110 + 14) % 14),
    ...(upgraded ? { enhancements: { ...ranks }, enhancementScale: 1 } : {}),
  };
  const driver = enabled ? runtime : { ...runtime, aiHazardPlan: undefined };
  const result = {
    ticks: 0,
    contactSeconds: 0,
    furnaceSeconds: 0,
    impacts: 0,
    airborne: 0,
    minimumSpeed: Infinity,
    transfers: [],
  };
  const end = options.end ?? zone.end + 45;
  runtime.reset({ state });
  try {
    for (; result.ticks < 2400 && state.distance < end; result.ticks++) {
      const controls = getRacerControl(state, track, {
        runtime: driver,
        lane,
        pace: 1,
        difficulty: 'hard',
        nearby: options.nearby ?? [],
      });
      const events = runtime.advance(state, controls, DT);
      for (const event of events) {
        if (event.type === 'impact') result.impacts++;
        if (event.type === 'jump-transfer')
          result.transfers.push(event.payload);
      }
      const airborne = runtime.pose(1)?.grounded === false;
      if (airborne) result.airborne++;
      if (world === worlds.helion) {
        const sample = sampleHelionThermal(
          track,
          state.distance,
          state.lateral,
          state.time,
          { airborne },
        );
        if (sample.contactStrength > 0) {
          if (sample.zone === zone.id) result.contactSeconds += DT;
          else if (
            track.thermalZones.find((entry) => entry.id === sample.zone)
              ?.kind === 'furnace'
          )
            result.furnaceSeconds += DT;
        }
      }
      if (state.distance >= zone.start && state.distance <= zone.end)
        result.minimumSpeed = Math.min(result.minimumSpeed, state.speed);
    }
    const saved = runtime.snapshot();
    if (world === worlds.cindercoil)
      result.contactSeconds = saved.contactSeconds;
    result.heat = saved.heat ?? 0;
    result.state = { ...state };
    assert.ok(state.distance >= end, JSON.stringify(result));
    assert.equal(state.resetCount, 0, 'AI cannot recover past a hazard');
    return result;
  } finally {
    runtime.dispose();
  }
}

for (const [shipId, chassisId] of hulls) {
  for (const upgraded of [false, true]) {
    const name = `${shipId}/${chassisId} ${upgraded ? 'max upgrades' : 'stock'}`;
    test(`${name}: actual surges are avoided and the diagonal spill still has an honest consequence`, () => {
      for (const zone of worlds.cindercoil.track.surgeZones) {
        const before = approach(
          worlds.cindercoil,
          shipId,
          chassisId,
          upgraded,
          zone,
          false,
        );
        const after = approach(
          worlds.cindercoil,
          shipId,
          chassisId,
          upgraded,
          zone,
          true,
        );
        const detail = JSON.stringify({ zone: zone.id, before, after });
        assert.equal(after.airborne, 0, detail);
        assert.equal(after.impacts, 0, detail);
        assert.ok(after.minimumSpeed > before.minimumSpeed, detail);
        if (zone.kind === 'spill') {
          assert.ok(
            after.contactSeconds > 0,
            'no immunity through the unavoidable lava crossing',
          );
          assert.ok(after.contactSeconds < before.contactSeconds * 0.9, detail);
          assert.ok(after.ticks <= before.ticks + 8, detail);
        } else {
          assert.equal(after.contactSeconds, 0, detail);
          assert.ok(before.contactSeconds > 0.5, detail);
          assert.ok(after.ticks <= before.ticks + 30, detail);
        }
      }
    });

    test(`${name}: each avoidable Helion sweep uses the supported sheltered line`, () => {
      for (const zone of worlds.helion.track.thermalZones.filter(
        (entry) => entry.kind === 'flare' && !entry.id.includes('detour'),
      )) {
        const before = approach(
          worlds.helion,
          shipId,
          chassisId,
          upgraded,
          zone,
          false,
        );
        const after = approach(
          worlds.helion,
          shipId,
          chassisId,
          upgraded,
          zone,
          true,
        );
        const detail = JSON.stringify({ zone: zone.id, before, after });
        assert.equal(after.airborne, 0, detail);
        assert.equal(after.impacts, 0, detail);
        assert.equal(after.contactSeconds, 0, detail);
        assert.equal(after.heat, 0, detail);
        assert.ok(before.contactSeconds > 0.5 && before.heat > 10, detail);
        assert.ok(after.minimumSpeed > before.minimumSpeed * 2, detail);
        assert.ok(after.ticks < before.ticks * 0.85, detail);
        if (zone.id === 'afterglow-sweep')
          assert.ok(
            after.furnaceSeconds > 0.3,
            'the preceding full-width furnace remains physically unavoidable',
          );
      }
    });

    test(`${name}: ordinary mandatory vent and both optional vaults keep real native landings`, () => {
      for (const world of Object.values(worlds)) {
        for (const jump of world.track.jumps) {
          const zone = {
            start: jump.takeoff,
            end: jump.landingStart,
            phase: 0,
          };
          const options = {
            lane: world === worlds.helion ? 8 : 0,
            start: jump.takeoff - 200,
            end: jump.landingStart + 30,
            time: 7,
          };
          const before = approach(
            world,
            shipId,
            chassisId,
            upgraded,
            zone,
            false,
            options,
          );
          const after = approach(
            world,
            shipId,
            chassisId,
            upgraded,
            zone,
            true,
            options,
          );
          const detail = JSON.stringify({ jump: jump.id, before, after });
          assert.ok(after.airborne > 0, detail);
          assert.ok(
            after.transfers.some(
              (entry) => entry.id === jump.id && entry.outcome === 'landed',
            ),
            detail,
          );
          assert.deepEqual(after.transfers, before.transfers, detail);
          assert.equal(after.impacts, before.impacts, detail);
        }
      }
    });
  }
}

test('hazard intent and native continuation restore without a second planning clock', () => {
  for (const world of Object.values(worlds)) {
    const zone = (world.track.surgeZones ?? world.track.thermalZones).find(
      (entry) => entry.id === 'ember-surge' || entry.id === 'radiator-sweep',
    );
    const state = {
      ...createVehicleState(),
      distance: zone.start - 200,
      lateral: 4,
      speed: 110,
      time: 2,
    };
    world.dynamics.reset();
    const runtime = world.makeRuntime({ ...world, presentation: false });
    runtime.reset({ state });
    const tick = () => {
      const input = getRacerControl(state, world.track, {
        runtime,
        lane: 4,
        pace: 1,
        difficulty: 'hard',
      });
      return {
        input,
        events: runtime.advance(state, input, DT),
        state: { ...state },
      };
    };
    try {
      for (let i = 0; i < 50; i++) tick();
      const saved = structuredClone({
        state,
        runtime: runtime.snapshot(),
        dynamics: world.dynamics.snapshot(),
      });
      const expected = Array.from({ length: 160 }, tick);
      Object.assign(state, saved.state);
      runtime.restore(saved.runtime);
      world.dynamics.restore(saved.dynamics);
      assert.deepEqual(Array.from({ length: 160 }, tick), expected);
    } finally {
      runtime.dispose();
    }
  }
});
