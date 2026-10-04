import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { createNacreRuntime } from '../src/levels/nacre/track/runtime.js';
import { createDevices } from '../src/levels/nacre/devices.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { SHIPS } from '../src/ships/catalog.js';
const track = createLevel3Track();
const devices = createDevices(track);
const adapter = () =>
  createDeviceRuntime({
    track,
    devices,
    motion: createNacreRuntime({ track, presentation: false }),
  });

test('Nacre retains physical landings at catapult speed for every ship with ordinary alignment margin', () => {
  for (const ship of SHIPS)
    for (const jump of [1, 2])
      for (const [heading, lateral] of [
        [0, 0],
        [-0.01, -3],
        [0.01, 3],
      ]) {
        const runtime = adapter();
        const state = {
          ...createVehicleState(ship.id),
          ...track.scenarios[`jump${jump}-long`],
          speed: 600 / 3.6,
          heading,
          lateral,
        };
        try {
          runtime.reset({ state });
          let transfer;
          for (let tick = 0; tick < 1200 && !transfer; tick++)
            transfer = runtime
              .advance(state, {}, 1 / 120)
              .find((event) => event.type === 'jump-transfer');
          assert.equal(
            transfer?.payload.outcome,
            'landed',
            `${ship.id} jump ${jump} heading ${heading}`,
          );
        } finally {
          runtime.dispose();
        }
      }
});

test('Nacre shared shields protect real receiving-rail contact, retaining the approved bounce and consuming one shield', () => {
  for (const jump of [1, 2])
    for (const side of ['left', 'right']) {
      const run = (shield) => {
        const runtime = adapter();
        const state = {
          ...createVehicleState(),
          ...runtime.scenarios[`jump${jump}-edge-${side}`].state,
        };
        try {
          runtime.reset({ state });
          if (shield)
            runtime.restore({
              ...runtime.snapshot(),
              aegisRemaining: 6,
              aegisDevice: 'trench-aegis',
            });
          for (let tick = 0; tick < 1200; tick++) {
            const events = runtime.advance(state, {}, 1 / 120);
            const impact = events.find((event) => event.type === 'impact');
            if (impact)
              return { state, events, impact, snapshot: runtime.snapshot() };
          }
          assert.fail('authored edge scenario must contact the receiving rail');
        } finally {
          runtime.dispose();
        }
      };
      const ordinary = run(false),
        protectedHit = run(true);
      assert.equal(protectedHit.impact.payload.shielded, true);
      assert.equal(protectedHit.impact.payload.energyCost, 0);
      assert.equal(protectedHit.state.energy, ordinary.state.energy + 2);
      assert.equal(protectedHit.state.speed, ordinary.state.speed);
      assert.deepEqual(protectedHit.snapshot.motion, ordinary.snapshot.motion);
      assert.ok(
        protectedHit.events.some((event) => event.type === 'shield-hit'),
      );
      assert.equal(protectedHit.snapshot.aegisRemaining, 0);
    }
});

test('Nacre motion/device replay restores through actual airborne state and rejects an incompatible device layout', () => {
  const runtime = adapter();
  const state = {
    ...createVehicleState(),
    ...track.scenarios['jump2-success'],
  };
  try {
    runtime.reset({ state });
    for (let tick = 0; tick < 80; tick++) runtime.advance(state, {}, 1 / 120);
    assert.equal(runtime.snapshot().mode, 'flight');
    const savedState = { ...state },
      saved = runtime.snapshot();
    const continuation = () => {
      for (let tick = 0; tick < 100; tick++)
        runtime.advance(state, {}, 1 / 120);
      return JSON.parse(
        JSON.stringify({ state: { ...state }, runtime: runtime.snapshot() }),
      );
    };
    const first = continuation();
    Object.assign(state, savedState);
    runtime.restore(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(continuation(), first);
    const retained = runtime.snapshot();
    assert.throws(
      () => runtime.restore({ ...saved, layoutKey: 'different-layout' }),
      /mismatch/,
    );
    assert.deepEqual(runtime.snapshot(), retained);
  } finally {
    runtime.dispose();
  }
});
