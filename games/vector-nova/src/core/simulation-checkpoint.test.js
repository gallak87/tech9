import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createSimulationWorld, createSimulationActors } from './simulation.js';
import {
  captureSimulationCheckpoint,
  restoreSimulationCheckpoint,
} from './simulation-checkpoint.js';
import {
  advanceSession,
  captureInitial,
  restoreReplayInitial,
  createMagneticRuntime,
} from './session-runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createCollisionWorld } from '../physics/collision-world.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { createRace } from '../race/index.js';
import { createRaceGrid } from '../race/roster.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createRivalFieldBuild } from '../race/rival-build.js';

function track() {
  const sample = (distance) => ({
    position: new Vector3(0, 0, distance),
    quaternion: new Quaternion(),
    tangent: new Vector3(0, 0, 1),
    right: new Vector3(1, 0, 0),
    up: new Vector3(0, 1, 0),
    curvature: 0,
    bank: 0,
  });
  return {
    id: 'checkpoint-native',
    name: 'Checkpoint native',
    length: 1000,
    width: 40,
    closed: false,
    finishDistance: 900,
    sections: [{ id: 'straight', start: 0, end: 1000 }],
    scenarios: {},
    jumps: [],
    checkpoints: [{ distance: 0 }, { distance: 500 }, { distance: 900 }],
    sample,
    frameAtTime: sample,
  };
}
function boundMotion(context) {
  const motion = createMagneticRuntime(context);
  let currentState;
  return {
    ...motion,
    boundState: () => currentState,
    reset(options) {
      currentState = options.state;
      motion.reset(options);
    },
  };
}
async function fixture(shipId = 'bastion', { fieldBuild = null } = {}) {
  const settings = { steeringAssist: 0.3 };
  const world = await createSimulationWorld({
    createTrack: track,
    createCollisionWorld: () =>
      createCollisionWorld({
        id: 'checkpoint-native',
        version: 1,
        geometryId: 'checkpoint-v1',
        triangles: [],
      }),
    createDynamics: ({ collisionWorld }) =>
      createRapierWorld({ collisionWorld }),
    createRuntime: boundMotion,
    racing: {
      createMotion: boundMotion,
      createDevices: () => [
        {
          id: 'ion',
          type: 'ion',
          distance: 600,
          lateral: 0,
          width: 12,
          length: 20,
        },
      ],
    },
  });
  const actors = createSimulationActors(world, { settings });
  const { motion, runtime } = await actors.createPlayer({ equipment: true });
  const racers = await actors.createField();
  const { combat } = actors.prepareRacing();
  const state = {
    ...createVehicleState(shipId),
    ...createRaceGrid().player,
    speed: 80,
  };
  const race = createRace(world.track, {
    rulesId: `${runtime.rulesId}:custom-run`,
    laps: Infinity,
  });
  const simulation = {
    settings,
    state,
    race,
    runtime,
    racers,
    dynamics: world.dynamics,
  };
  racers.reset({
    enabled: true,
    difficulty: 'hard',
    fieldBuild,
    gridOrder: [
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
    ],
  });
  runtime.reset({ state });
  return {
    ...simulation,
    motion,
    combat,
    capture: () => captureSimulationCheckpoint(simulation),
    step: () =>
      advanceSession({
        ...simulation,
        dt: 1 / 120,
        input: {
          throttle: 1,
          brake: 0,
          steer: 0,
          boost: false,
          airbrake: false,
        },
        emit() {},
        presentation: false,
      }),
    dispose() {
      actors.dispose();
      world.dispose();
    },
  };
}

test('owned native checkpoint restores cold actor hulls, grid, complete identity and future simulation', async () => {
  const live = await fixture(),
    cold = await fixture('kestrel');
  try {
    for (let tick = 0; tick < 40; tick++) live.step();
    const saved = live.capture();
    restoreSimulationCheckpoint(saved, cold, { presentation: false });
    assert.deepEqual(cold.capture(), saved);
    assert.equal(cold.motion.boundState(), cold.state);
    assert.equal(cold.race.rulesId, live.race.rulesId);
    assert.deepEqual(cold.combat.pose('player'), cold.runtime.pose(1));
    cold.racers.opponents.forEach((opponent) =>
      assert.deepEqual(
        cold.combat.pose(opponent.specification.id),
        opponent.runtime.pose(1),
      ),
    );
    for (let tick = 0; tick < 20; tick++) {
      live.step();
      cold.step();
    }
    assert.deepEqual(cold.capture(), live.capture());
  } finally {
    cold.dispose();
    live.dispose();
  }
});

test('fresh worker checkpoint restore adopts recorded rival upgrades, seeded loadouts and exact native future ticks', async () => {
  const fieldBuild = createRivalFieldBuild({
    enhancements: {
      speed: 3,
      acceleration: 2,
      handling: 1,
      boost: 3,
      toughness: 2,
    },
    equipmentPool: ['jump', 'injector', 'deflector'],
    slots: 2,
    seed: 317,
    difficulty: 'hard',
  });
  const live = await fixture('bastion', { fieldBuild });
  const worker = await fixture('kestrel');
  try {
    live.racers.opponents.forEach((opponent, index) => {
      Object.assign(opponent.state, {
        distance: 100 + index * 30,
        lateral: index % 2 ? -5 : 5,
        speed: 80,
        energy: 20,
      });
      opponent.runtime.reset({
        reason: 'restart',
        state: opponent.state,
        presentation: false,
      });
    });
    for (let tick = 0; tick < 80; tick++) live.step();
    const saved = live.capture();
    assert.ok(
      saved.racers.opponents.some((opponent) =>
        opponent.runtime.equipment?.slots.some(
          (slot) => slot?.id === 'injector' && slot.remaining > 0,
        ),
      ),
      'the checkpoint carries a real active rival cooldown',
    );
    assert.equal(worker.racers.serialize().field.rivalBuild, undefined);
    restoreSimulationCheckpoint(saved, worker, { presentation: false });
    assert.deepEqual(worker.capture(), saved);
    assert.deepEqual(worker.racers.identity.rivalBuild, fieldBuild);
    worker.racers.opponents.forEach((opponent, index) => {
      assert.deepEqual(
        opponent.state.equipment,
        fieldBuild.opponents[index].equipment,
      );
      assert.deepEqual(opponent.state.enhancements, fieldBuild.enhancements);
      assert.equal(opponent.state.enhancementScale, fieldBuild.bonusScale);
      assert.deepEqual(
        worker.combat.pose(opponent.specification.id),
        opponent.runtime.pose(1),
      );
    });
    for (let tick = 0; tick < 160; tick++) {
      live.step();
      worker.step();
    }
    assert.deepEqual(worker.capture(), live.capture());

    const stock = await fixture('kestrel');
    try {
      const stockCheckpoint = stock.capture();
      restoreSimulationCheckpoint(stockCheckpoint, worker, {
        presentation: false,
      });
      assert.deepEqual(worker.capture(), stockCheckpoint);
      assert.equal(
        worker.racers.identity.rivalBuild,
        undefined,
        'an old stock checkpoint clears a previous recorded build',
      );
    } finally {
      stock.dispose();
    }
  } finally {
    worker.dispose();
    live.dispose();
  }
});

test('rejected replay rollback restores the retained state owner, combat bindings and the next ordinary ticks', async () => {
  const simulation = await fixture();
  try {
    for (let tick = 0; tick < 30; tick++) simulation.step();
    const saved = simulation.capture(),
      retained = simulation.state;
    for (let tick = 0; tick < 10; tick++) simulation.step();
    const expected = simulation.capture();
    const replaced = {
      ...createVehicleState('kestrel'),
      distance: 500,
      time: 99,
    };
    simulation.runtime.reset({ state: replaced });
    simulation.racers.reset({ enabled: false });
    assert.equal(simulation.motion.boundState(), replaced);
    assert.throws(
      () =>
        restoreReplayInitial(
          { invalid: true },
          {},
          replaced,
          simulation.runtime,
          simulation.dynamics,
        ),
      /initial state mismatch/,
    );
    restoreSimulationCheckpoint(saved, simulation, { presentation: false });
    assert.equal(simulation.state, retained);
    assert.equal(simulation.motion.boundState(), retained);
    assert.deepEqual(simulation.capture(), saved);
    assert.deepEqual(
      simulation.combat.pose('player'),
      simulation.runtime.pose(1),
    );
    assert.equal(
      simulation.combat.fireLance('player'),
      false,
      'rebinding does not mark an unadvanced actor eligible',
    );
    for (let tick = 0; tick < 10; tick++) simulation.step();
    assert.deepEqual(simulation.capture(), expected);
  } finally {
    simulation.dispose();
  }
});

test('published ReplayInitial format and accepted exact-start validation remain unchanged', async () => {
  const simulation = await fixture();
  try {
    const initial = captureInitial(
      simulation.state,
      simulation.runtime,
      simulation.dynamics,
    );
    assert.deepEqual(Object.keys(initial), ['vehicle', 'runtime', 'dynamics']);
    assert.doesNotThrow(() =>
      restoreReplayInitial(
        structuredClone(initial),
        initial,
        simulation.state,
        simulation.runtime,
        simulation.dynamics,
      ),
    );
    const before = simulation.capture();
    for (const mutate of [
      (copy) => {
        copy.vehicle.distance++;
      },
      (copy) => {
        copy.vehicle.speed = Infinity;
      },
    ]) {
      const copy = structuredClone(initial);
      mutate(copy);
      assert.throws(
        () =>
          restoreReplayInitial(
            copy,
            initial,
            simulation.state,
            simulation.runtime,
            simulation.dynamics,
          ),
        /initial state mismatch/,
      );
      assert.deepEqual(simulation.capture(), before);
    }
  } finally {
    simulation.dispose();
  }
});

test('public field restore validates real runtimes while ignoring extra race keys and retaining legacy defaults', async () => {
  const simulation = await fixture();
  try {
    simulation.step();
    const saved = simulation.racers.serialize();
    const expected = structuredClone(saved);
    delete saved.opponents[0].race.splits;
    delete saved.opponents[0].race.completedTime;
    saved.opponents[0].race.step = 'extra';
    saved.opponents[0].race.course = 'extra';
    saved.opponents[0].race.rulesId = 'extra';
    simulation.racers.restore(saved);
    assert.deepEqual(simulation.racers.serialize(), expected);
    assert.equal(typeof simulation.racers.opponents[0].race.step, 'function');
    assert.equal(simulation.racers.opponents[0].race.course.format, 'sprint');
  } finally {
    simulation.dispose();
  }
});

test('touch-free combat rebind preserves frame time and eligibility while default bind still touches', () => {
  const combat = createCombatSimulation({ track: track() });
  const actor = {
    state: { distance: 0, lateral: 0, time: 99 },
    pose: () => ({
      position: new Vector3(),
      quaternion: new Quaternion(),
      grounded: true,
    }),
    notify() {},
    hit() {},
  };
  const saved = combat.snapshot();
  combat.bind('player', actor, { touch: false });
  assert.deepEqual(combat.snapshot(), saved);
  assert.deepEqual(combat.pose('player'), actor.pose());
  assert.equal(combat.fireLance('player'), false);
  combat.step(1 / 120);
  assert.equal(combat.snapshot().frameTime, 1 / 120);
  combat.bind('player', actor);
  assert.equal(combat.snapshot().frameTime, 99);
  assert.equal(combat.fireLance('player'), true);
});
