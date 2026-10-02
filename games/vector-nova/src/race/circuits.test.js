import test from 'node:test';
import assert from 'node:assert/strict';
import { createRacers } from './racers.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createVehicleState } from '../physics/index.js';
import {
  glasswakeFlightState,
  createGlasswakeRuntime,
} from '../levels/glasswake/runtime.js';
import { createGlasswakeTrack } from '../levels/glasswake/track/model.js';

const circuits = [
  ['nacre', 'createLevel3Track', 'createNacreRuntime'],
  ['orbital', 'createLevel2Track', null],
  ['vesper', 'createVesperTrack', 'createVesperRuntime'],
  ['glasswake', 'createGlasswakeTrack', 'createGlasswakeRuntime'],
  ['cindercoil', 'createCindercoilTrack', 'createCindercoilRuntime'],
];
for (const [slug, trackName, motionName] of circuits) {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    test(`${slug} ${difficulty}: shared rivals earn device contacts and complete two valid laps through local rules`, async () => {
      const track = (await import(`../levels/${slug}/track/model.js`))[
        trackName
      ]();
      const devices = (
        await import(`../levels/${slug}/devices.js`)
      ).createDevices(track);
      const createMotion = motionName
        ? (
            await import(
              `../levels/${slug}/${slug === 'nacre' ? 'track/' : ''}runtime.js`
            )
          )[motionName]
        : createMagneticRuntime;
      const records = [];
      const createRuntime = () => {
        const runtime = createDeviceRuntime({
          track,
          devices,
          motion: createMotion({ track, presentation: false }),
        });
        const record = {
          vectors: 0,
          launches: 0,
          landings: 0,
          landingsByJump: {},
        };
        records.push(record);
        const advance = runtime.advance;
        runtime.advance = (...args) => {
          const events = advance(...args);
          for (const event of events) {
            if (
              event.type === 'pickup-activate' &&
              event.payload.kind === 'vector'
            )
              record.vectors++;
            if (event.type === 'jump-launch') record.launches++;
            if (
              event.type === 'jump-transfer' &&
              event.payload.outcome === 'landed'
            ) {
              record.landings++;
              record.landingsByJump[event.payload.id] =
                (record.landingsByJump[event.payload.id] ?? 0) + 1;
            }
          }
          return events;
        };
        return runtime;
      };
      const field = createRacers({ track, devices, createRuntime });
      try {
        field.reset({ enabled: true, difficulty });
        for (let tick = 0; tick < 120 * 200; tick++) {
          field.advance(1 / 120, {
            playerInput: { boost: difficulty === 'hard' && tick % 600 < 120 },
          });
          if (field.opponents.every((opponent) => opponent.finish)) break;
        }
        field.opponents.forEach((opponent, index) => {
          assert.equal(
            opponent.finish?.valid,
            true,
            `${opponent.specification.id} finish`,
          );
          assert.equal(opponent.finish.lapTimes.length, 2);
          assert.ok(
            records[index].vectors >= 2,
            'actual shared catapult contacts',
          );
          if (track.jumps?.some((jump) => !jump.optional)) {
            assert.ok(
              records[index].launches >= 2,
              'actual airborne simulation',
            );
            assert.ok(
              records[index].landings >= 2,
              'AI earns physical landings',
            );
            for (const jump of track.jumps.filter((jump) => !jump.optional))
              assert.ok(
                records[index].landingsByJump[jump.id] >= 2,
                `${opponent.specification.id} physically lands ${jump.id} each lap`,
              );
          }
        });
        const saved = field.serialize();
        for (let tick = 0; tick < 100; tick++) field.advance(1 / 120);
        const advanced = field.serialize();
        field.restore(saved);
        for (let tick = 0; tick < 100; tick++) field.advance(1 / 120);
        assert.deepEqual(
          field.serialize(),
          advanced,
          'all local/device/field state survives rollback',
        );
      } finally {
        field.dispose();
      }
    });
  }
}

test('CPU Glasswake factories never replace the player presentation ledger', () => {
  const track = createGlasswakeTrack();
  const player = createGlasswakeRuntime({ track });
  const cpu = createGlasswakeRuntime({ track, presentation: false });
  const state = { ...createVehicleState(), distance: 600, speed: 60 };
  try {
    const original = glasswakeFlightState(track);
    cpu.advance(state, { throttle: 1 }, 0.1);
    assert.deepEqual(glasswakeFlightState(track), original);
    cpu.dispose();
    assert.deepEqual(glasswakeFlightState(track), player.snapshot());
  } finally {
    cpu.dispose();
    player.dispose();
  }
});

test('shared Aegis absorbs a local airborne edge impact without changing its physical bounce', async () => {
  const { createCindercoilTrack } =
    await import('../levels/cindercoil/track/model.js');
  const { createCindercoilRuntime } =
    await import('../levels/cindercoil/runtime.js');
  const { createDevices } = await import('../levels/cindercoil/devices.js');
  const track = createCindercoilTrack();
  const devices = createDevices(track);
  for (const side of ['left', 'right']) {
    const run = (shield) => {
      const motion = createCindercoilRuntime({ track, presentation: false });
      const runtime = createDeviceRuntime({ track, devices, motion });
      const state = {
        ...createVehicleState(),
        ...motion.scenarios[`vent-edge-${side}`].state,
      };
      try {
        runtime.reset({ reason: 'scenario', state });
        if (shield)
          runtime.restore({
            ...runtime.snapshot(),
            aegisRemaining: 6,
            aegisDevice: devices.find((device) => device.type === 'aegis').id,
          });
        for (let tick = 0; tick < 1200; tick++) {
          const events = runtime.advance(state, {}, 1 / 120);
          const impact = events.find((event) => event.type === 'impact');
          if (impact)
            return { state, impact, events, snapshot: runtime.snapshot() };
        }
        assert.fail(
          'authored imperfect landing must contact the receiving rail',
        );
      } finally {
        runtime.dispose();
      }
    };
    const ordinary = run(false),
      protectedHit = run(true);
    assert.equal(ordinary.impact.payload.energyCost, 2);
    assert.equal(protectedHit.impact.payload.energyCost, 0);
    assert.equal(protectedHit.impact.payload.shielded, true);
    assert.equal(protectedHit.state.energy, ordinary.state.energy + 2);
    const { energy: ordinaryReserve, ...ordinaryMotion } = ordinary.state;
    const { energy: protectedReserve, ...protectedMotion } = protectedHit.state;
    assert.ok(protectedReserve > ordinaryReserve);
    assert.deepEqual(protectedMotion, ordinaryMotion);
    assert.deepEqual(protectedHit.snapshot.motion, ordinary.snapshot.motion);
    assert.ok(protectedHit.events.some((event) => event.type === 'shield-hit'));
    assert.equal(protectedHit.snapshot.aegisRemaining, 0);
  }
});
