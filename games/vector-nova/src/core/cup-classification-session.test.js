import test from 'node:test';
import assert from 'node:assert/strict';
import createShatterline from '../levels/shatterline/index.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createVehicleState } from '../physics/index.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createRacers } from '../race/racers.js';
import { createRace } from '../race/index.js';
import { classifyCupRace } from '../race/cup.js';
import { advanceSession, createMagneticRuntime } from './session-runtime.js';
import { Quaternion, Vector3 } from 'three';
import { createCupClassificationSession } from './cup-classification-session.js';

const STEP = 1 / 120;
const brake = {
  throttle: 0,
  brake: 1,
  boost: false,
  steer: 0,
  airbrake: false,
};
const raceData = (race) =>
  Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(race))
      .filter(
        ([, descriptor]) =>
          Object.hasOwn(descriptor, 'value') &&
          typeof descriptor.value !== 'function',
      )
      .map(([key, descriptor]) => [key, structuredClone(descriptor.value)]),
  );

async function liveFinishFixture() {
  const definition = createShatterline();
  const settings = { steeringAssist: 0.3 };
  const track = definition.createTrack();
  const collisionWorld = definition.createCollisionWorld({ track });
  const dynamics = await definition.createDynamics({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const motion = definition.createRuntime({
    track,
    collisionWorld,
    dynamics,
    settings,
    equipment: true,
  });
  const devices = definition.racing.createDevices(track);
  const combat = createCombatSimulation({ track, collisionWorld, dynamics });
  const runtime = createDeviceRuntime({ track, motion, devices, combat });
  const racers = createRacers({
    track,
    devices,
    dynamics,
    createRuntime: (specification) =>
      createDeviceRuntime({
        track,
        devices,
        combat,
        combatId: specification.id,
        motion: definition.racing.createMotion({
          track,
          collisionWorld,
          dynamics,
          settings,
          presentation: false,
        }),
      }),
  });
  const gridOrder = [
    'rook',
    'latch',
    'mule',
    'pike',
    'tern',
    'manta',
    'vise',
    'kite',
    'gannet',
    'player',
  ];
  racers.reset({ enabled: true, difficulty: 'hard', gridOrder });
  const state = {
    ...createVehicleState('bastion'),
    distance: track.finishDistance - 0.1,
    lateral: 10,
    speed: 100,
  };
  const race = createRace(track, {
    rulesId: `${runtime.rulesId}:ship-bastion-v1:difficulty-hard`,
    laps: Infinity,
  });
  race.placeScenario(state.distance);
  race.valid = true;
  runtime.reset({ state });
  racers.opponents.forEach((opponent, index) => {
    Object.assign(opponent.state, {
      distance: track.finishDistance - 18 - index * 5,
      lateral: index % 2 ? -6 : 4,
      speed: 85 + index,
    });
    opponent.race.placeScenario(opponent.state.distance);
    opponent.race.valid = index !== 8;
    opponent.runtime.reset({ state: opponent.state });
  });
  const step = () =>
    advanceSession({
      state,
      input: brake,
      dt: STEP,
      runtime,
      race,
      dynamics,
      racers,
      emit() {},
      presentation: false,
    });
  for (let tick = 0; tick < 120; tick++) {
    if (
      racers.snapshot({
        playerState: state,
        playerRace: race,
        playerPose: runtime.pose(1),
      }).playerFinished
    )
      break;
    step();
  }
  assert.ok(
    race.complete,
    JSON.stringify({
      state,
      checkpoint: race.checkpoint,
      grounded: runtime.pose(1).grounded,
    }),
  );
  return {
    settings,
    step,
    racers,
    checkpoint: {
      state: structuredClone(state),
      race: raceData(race),
      runtime: runtime.snapshot(),
      racers: racers.serialize(),
      dynamics: dynamics.snapshot(),
    },
    results: () =>
      racers.snapshot({
        playerState: state,
        playerRace: race,
        playerPose: runtime.pose(1),
      }).results,
    dispose() {
      racers.dispose();
      runtime.dispose();
      dynamics.dispose();
      collisionWorld.dispose();
    },
  };
}

async function referenceClassification() {
  const live = await liveFinishFixture();
  try {
    const checkpoint = structuredClone(live.checkpoint),
      settings = structuredClone(live.settings);
    for (
      let tick = 0;
      tick < 3600 && live.racers.opponents.some((opponent) => !opponent.finish);
      tick++
    )
      live.step();
    return { checkpoint, settings, expected: structuredClone(live.results()) };
  } finally {
    live.dispose();
  }
}

test('selected CPU session restores a real Bastion Shatterline finish and matches ordinary native classification', async () => {
  const { checkpoint, settings, expected } = await referenceClassification();
  const loaded = [];
  const session = await createCupClassificationSession({
    levelId: 'shatterline',
    settings: { ...settings, steeringAssist: 0.9 },
    loadLevel: async (id) => {
      loaded.push(id);
      const definition = createShatterline();
      for (const key of ['createRoad', 'createEnvironment', 'createBackdrop'])
        definition[key] = () => {
          throw new Error('Classification must never create presentation');
        };
      return { definition, shape: false };
    },
  });
  try {
    checkpoint.settings = settings;
    const original = structuredClone(checkpoint);
    const result = await session.resolve(checkpoint);
    assert.deepEqual(result, expected);
    assert.deepEqual(classifyCupRace(result), classifyCupRace(expected));
    assert.equal(
      result.standings.filter((row) => row.finished && !row.valid).length,
      1,
    );
    assert.deepEqual(loaded, ['shatterline']);
    assert.deepEqual(
      checkpoint,
      original,
      'the finish checkpoint remains owned and immutable to forecasting',
    );
    assert.deepEqual(
      await session.resolve(checkpoint),
      result,
      'reusing a warm CPU world restores the same native outcome',
    );
    await assert.rejects(
      session.resolve(checkpoint, { signal: AbortSignal.abort() }),
      { name: 'AbortError' },
    );
  } finally {
    session.dispose();
  }
});

function unfinishedFieldFixture() {
  const track = {
    id: 'classification-grace',
    name: 'Classification grace',
    length: 1_000_000,
    width: 52,
    sections: [{ label: 'Straight', start: 0, end: 1_000_000 }],
    checkpoints: [{ distance: 0 }, { distance: 500_000 }],
    scenarios: {},
    sample: (distance) => ({
      position: new Vector3(0, 0, distance),
      tangent: new Vector3(0, 0, 1),
      right: new Vector3(1, 0, 0),
      up: new Vector3(0, 1, 0),
      quaternion: new Quaternion(),
      curvature: 0,
      bank: 0,
    }),
  };
  const motion = () => createMagneticRuntime({ track });
  const definition = {
    createTrack: () => track,
    createRuntime: motion,
    createDynamics: async () => ({ restore() {}, dispose() {} }),
    racing: { createDevices: () => [], createMotion: motion },
  };
  const runtime = createDeviceRuntime({ track, devices: [], motion: motion() });
  const racers = createRacers({
    track,
    createRuntime: () =>
      createDeviceRuntime({ track, devices: [], motion: motion() }),
  });
  racers.reset({ enabled: true });
  const state = createVehicleState('bastion'),
    race = createRace(track, { rulesId: runtime.rulesId });
  race.history = [60, 60].map((duration) => ({
    duration,
    valid: true,
    rulesId: race.rulesId,
  }));
  const checkpoint = {
    state,
    race: raceData(race),
    runtime: runtime.snapshot(),
    racers: racers.serialize(),
    dynamics: {},
  };
  runtime.dispose();
  racers.dispose();
  return { definition, checkpoint };
}

test('CPU classification applies the existing thirty-second grace and keeps unfinished rivals as DNF', async () => {
  const { definition, checkpoint } = unfinishedFieldFixture();
  const session = await createCupClassificationSession({
    levelId: 'classification-grace',
    loadLevel: async () => ({ definition }),
    now: () => 0,
  });
  try {
    const result = await session.resolve(checkpoint);
    assert.equal(result.playerTotalTime, 120);
    const rivals = result.standings.filter((row) => row.id !== 'player');
    assert.equal(rivals.length, 9);
    assert.ok(rivals.every((row) => !row.finished && row.totalTime === null));
    assert.ok(
      rivals.every((row) => Math.abs(row.currentLapTime - 30) < 1e-8),
      'the grace is simulation time, independent of rendering',
    );
    assert.equal(
      classifyCupRace(result).filter((row) => row.status === 'dnf').length,
      9,
    );
    await assert.rejects(
      session.resolve({ ...checkpoint, settings: [] }),
      /settings must be an object/,
    );
  } finally {
    session.dispose();
  }
});

test('CPU classification cancellation stops at a cooperative yield without publishing a partial result', async () => {
  const { definition, checkpoint } = unfinishedFieldFixture();
  const controller = new AbortController();
  let time = 0,
    yields = 0;
  const session = await createCupClassificationSession({
    levelId: 'classification-grace',
    loadLevel: async () => ({ definition }),
    now: () => (time += 13),
    yieldWork: async () => {
      yields++;
      controller.abort();
    },
  });
  try {
    const original = structuredClone(checkpoint);
    await assert.rejects(
      session.resolve(checkpoint, { signal: controller.signal }),
      { name: 'AbortError' },
    );
    assert.equal(yields, 1);
    assert.deepEqual(checkpoint, original);
  } finally {
    session.dispose();
  }
});
