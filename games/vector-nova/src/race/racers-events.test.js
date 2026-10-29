import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createTrack } from '../levels/halcyon/track/model.js';
import { createHalcyonSimulationRuntime } from '../levels/halcyon/device-runtime.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createRace } from './index.js';
import { createRacers } from './racers.js';

const DT = 1 / 120;

test('continuous event fields keep racing past ordinary two-lap finishes and isolate their identity', () => {
  const track = createTrack();
  const createRuntime = () => createHalcyonSimulationRuntime({ track });
  const racers = createRacers({ track, createRuntime, continuous: true });
  const standard = createRacers({ track, createRuntime });
  try {
    racers.reset();
    assert.equal(racers.identity.continuous, true);
    assert.equal('continuous' in standard.identity, false);
    const playerState = createVehicleState();
    const playerRace = createRace(track);
    for (const race of [
      playerRace,
      ...racers.opponents.map((entry) => entry.race),
    ]) {
      race.step(0, track.length, 45);
      race.step(track.length, track.length * 2, 44);
      assert.equal(race.history.length, 2);
    }
    const context = { playerState, playerRace };
    const events = racers.advance(DT, context);
    const view = racers.snapshot(context);
    assert.equal(view.playerFinished, false);
    assert.equal(view.results, null);
    assert.equal(view.laps, null);
    assert.ok(
      view.standings.every((row) => row.completedLaps === 2 && !row.finished),
    );
    assert.ok(
      events.every(
        (event) =>
          !['racer-complete', 'player-race-complete'].includes(event.type),
      ),
    );
    assert.throws(() => standard.setEliminated('rook'), /continuous/);
    assert.throws(() => racers.setEliminated('player'), /Unknown rival/);
    const malformed = racers.serialize();
    delete malformed.opponents[0].eliminated;
    assert.throws(() => racers.restore(malformed), /mismatch/);
  } finally {
    racers.dispose();
    standard.dispose();
  }
});

test('eliminated rivals leave real shared contacts and combat, survive rollback, and return on restart', async () => {
  const track = {
    id: 'event-contact-road',
    length: 5000,
    width: 36,
    closed: true,
    checkpoints: [0, 1250, 2500, 3750].map((distance) => ({ distance })),
    sample: (distance) => ({
      position: new Vector3(0, 10, distance),
      tangent: new Vector3(0, 0, 1),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      quaternion: new Quaternion(),
      curvature: 0,
      bank: 0,
    }),
  };
  const dynamics = await createRapierWorld();
  const combatActors = new Map();
  const combat = {
    bind: (id, actor) => combatActors.set(id, actor),
    resetActor: (id) => combatActors.delete(id),
    disruption: () => null,
    avoidance: () => null,
  };
  const racers = createRacers({
    track,
    dynamics,
    continuous: true,
    createRuntime: (specification) =>
      createDeviceRuntime({
        track,
        devices: [],
        combat,
        combatId: specification?.id ?? 'validation',
        motion: createMagneticRuntime({ track, dynamics }),
      }),
  });
  try {
    racers.reset();
    racers.advance(DT);
    assert.equal(
      dynamics.snapshot().actors.filter((actor) => actor.active).length,
      9,
    );
    assert.equal(combatActors.size, 9);
    const rook = racers.opponents[0];
    assert.equal(racers.setEliminated('rook'), true);
    assert.equal(racers.setEliminated('rook'), false);
    assert.equal(combatActors.has('rook'), false);
    assert.equal(dynamics.snapshot().actors[0].active, false);
    const stopped = JSON.stringify(rook.state);
    for (let i = 0; i < 60; i++) racers.advance(DT);
    assert.equal(
      JSON.stringify(rook.state),
      stopped,
      'elimination freezes that driver rather than leaving a parked moving collider',
    );
    assert.equal(
      dynamics.snapshot().actors.filter((actor) => actor.active).length,
      8,
    );
    const saved = racers.serialize(),
      engine = dynamics.snapshot();
    racers.reset();
    racers.advance(DT);
    assert.equal(dynamics.snapshot().actors[0].active, true);
    racers.restore(saved);
    assert.equal(
      dynamics.snapshot().actors[0].active,
      false,
      'restoring an eliminated snapshot also deactivates a live physical actor',
    );
    dynamics.restore(engine);
    assert.deepEqual(racers.serialize(), saved);
    for (let i = 0; i < 10; i++) racers.advance(DT);
    assert.equal(JSON.stringify(rook.state), stopped);
    racers.reset();
    assert.ok(racers.opponents.every((opponent) => !opponent.eliminated));
    racers.advance(DT);
    assert.equal(
      dynamics.snapshot().actors.filter((actor) => actor.active).length,
      9,
    );
    assert.equal(combatActors.size, 9);
    racers.reset({ enabled: false });
    racers.advance(DT);
    assert.equal(
      dynamics.snapshot().actors.filter((actor) => actor.active).length,
      0,
    );
  } finally {
    racers.dispose();
    dynamics.dispose();
  }
});
