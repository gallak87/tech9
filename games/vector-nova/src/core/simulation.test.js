import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createSimulationWorld, createSimulationActors } from './simulation.js';
import { advanceSession, createMagneticRuntime } from './session-runtime.js';
import { createVehicleState } from '../physics/index.js';
import { createCollisionWorld } from '../physics/collision-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createRacers } from '../race/racers.js';
import { createRace } from '../race/index.js';
import { createRaceGrid } from '../race/roster.js';

function track() {
  return {
    id: 'simulation-factory',
    name: 'Simulation factory',
    length: 1000,
    width: 40,
    sections: [{ id: 'straight', start: 0, end: 1000 }],
    scenarios: {},
    jumps: [],
    checkpoints: [
      { distance: 0 },
      { distance: 250 },
      { distance: 500 },
      { distance: 750 },
    ],
    sample(distance) {
      return {
        position: new Vector3(0, 0, distance),
        quaternion: new Quaternion(),
        tangent: new Vector3(0, 0, 1),
        right: new Vector3(1, 0, 0),
        up: new Vector3(0, 1, 0),
        curvature: 0,
        bank: 0,
      };
    },
  };
}
const collision = (releases) => ({
  id: 'factory-collision',
  version: 1,
  rulesId: 'factory-collision',
  sweepHull: () => null,
  dispose: () => releases.push('collision'),
});

test('world phases preserve shape/custom dynamics, selected-only construction and borrowed track ownership', async () => {
  for (const shape of [true, false]) {
    const releases = [],
      stages = [];
    const supplied = { ...track(), dispose: () => releases.push('track') };
    const raw = collision(releases);
    let physical;
    const definition = {
      createTrack() {
        throw new Error('The supplied track is borrowed.');
      },
      createCollisionWorld: () => raw,
      createDynamics({ track: received, collisionWorld }) {
        assert.equal(received, supplied);
        physical = collisionWorld;
        return { dispose: () => releases.push('dynamics') };
      },
      racing: {},
      createRoad() {
        throw new Error('No presentation factory may run.');
      },
      createEnvironment() {
        throw new Error('No other world may load.');
      },
    };
    const world = await createSimulationWorld(definition, {
      track: supplied,
      shape,
      onStage: (stage) => stages.push(stage),
    });
    assert.equal(world.track, supplied);
    assert.equal(world.collisionWorld, raw);
    assert.equal(world.racingEnabled, !shape);
    assert.equal(physical === raw, shape);
    assert.deepEqual(
      stages,
      shape
        ? ['collision', 'dynamics']
        : ['collision', 'boundaries', 'dynamics'],
    );
    world.dispose();
    world.dispose();
    assert.deepEqual(releases, ['dynamics', 'collision']);
  }
  const world = await createSimulationWorld({ createTrack: track });
  assert.equal(
    world.dynamics,
    null,
    'non-racing definitions acquire no default native world',
  );
  world.dispose();
});

test('world acquisition releases owned resources on validation, dynamics and cancellation failures', async () => {
  for (const failure of ['track', 'collision', 'dynamics', 'abort']) {
    const releases = [];
    const controller = new AbortController();
    const ownedTrack = { ...track(), dispose: () => releases.push('track') };
    const raw = collision(releases);
    if (failure === 'track') delete ownedTrack.name;
    if (failure === 'collision') delete raw.rulesId;
    const definition = {
      createTrack: () => ownedTrack,
      createCollisionWorld: () => raw,
      createDynamics() {
        throw new Error('dynamics failure');
      },
      racing: {},
    };
    await assert.rejects(
      createSimulationWorld(definition, {
        signal: controller.signal,
        yieldWork(stage) {
          if (failure === 'abort' && stage === 'boundaries') controller.abort();
        },
      }),
    );
    assert.deepEqual(
      releases,
      failure === 'track' ? ['track'] : ['collision', 'track'],
    );
  }
});

function policyFixture({ failDevices = false, failRival = false } = {}) {
  const calls = [],
    contexts = [],
    releases = [];
  let rivals = 0;
  const motion = (kind, context) => {
    calls.push(kind);
    contexts.push({ kind, context });
    return {
      id: kind,
      version: 1,
      rulesId: kind,
      scenarios: {},
      snapshot: () => null,
      restore() {},
      reset() {},
      pose: () => null,
      update() {},
      advance: () => [],
      dispose: () => releases.push(kind),
    };
  };
  const definition = {
    createRuntime: (context) => motion('player', context),
    racing: {
      identity: { id: 'level-player', version: 1, rulesId: 'level-player' },
      scenarios: { 'level-player': { state: {} } },
      createDevices() {
        calls.push('devices');
        if (failDevices) throw new Error('devices failure');
        return [];
      },
      createMotion(context) {
        if (failRival && ++rivals === 3) throw new Error('rival failure');
        return motion('rival', context);
      },
    },
  };
  return {
    calls,
    contexts,
    releases,
    definition,
    world: {
      definition,
      track: track(),
      collisionWorld: null,
      dynamics: null,
      racingEnabled: true,
    },
  };
}

test('live/worker players precede devices and nine rivals borrow the same mutable settings', async () => {
  const fixture = policyFixture();
  const settings = { steeringAssist: 0.3 },
    scene = {};
  const actors = createSimulationActors(fixture.world, { settings });
  try {
    const { runtime } = await actors.createPlayer({ equipment: true, scene });
    await actors.createField();
    assert.deepEqual(fixture.calls, [
      'player',
      'devices',
      ...Array(9).fill('rival'),
    ]);
    assert.equal(runtime.id, 'level-player');
    assert.equal(fixture.contexts[0].context.equipment, true);
    assert.equal(fixture.contexts[0].context.scene, scene);
    assert.equal(
      'presentation' in fixture.contexts[0].context,
      false,
      'a CPU player still owns moving-world clocks',
    );
    for (const { context } of fixture.contexts.slice(1)) {
      assert.equal(context.presentation, false);
      assert.equal('equipment' in context, false);
    }
    settings.steeringAssist = 0.2;
    assert.ok(
      fixture.contexts.every(
        ({ context }) =>
          context.settings === settings &&
          context.settings.steeringAssist === 0.2,
      ),
    );
  } finally {
    actors.dispose();
  }
  assert.deepEqual(fixture.releases, [...Array(9).fill('rival'), 'player']);
});

test('explicit capture actors retain devices-first ordering, player factories and unmodified role flags', async () => {
  const fixture = policyFixture();
  const actors = createSimulationActors(fixture.world);
  try {
    actors.prepareRacing();
    for (const combatId of ['player', 'rook', 'manta']) {
      const settings = { steeringAssist: 0.3 };
      const { runtime } = await actors.createActor({
        combatId,
        context: { settings },
        motionFactory: fixture.definition.createRuntime,
      });
      assert.equal(
        runtime.id,
        'player-devices',
        'capture keeps default motion identity, not the level player wrapper identity',
      );
      const context = fixture.contexts.at(-1).context;
      assert.equal(context.settings, settings);
      assert.equal('equipment' in context, false);
      assert.equal('presentation' in context, false);
    }
    assert.deepEqual(fixture.calls, ['devices', 'player', 'player', 'player']);
  } finally {
    actors.dispose();
  }
  assert.equal(fixture.releases.length, 3);
});

test('actor failures release a player and partially constructed rivals exactly once', async () => {
  for (const failure of ['devices', 'rival', 'wrapper']) {
    const fixture = policyFixture({
      failDevices: failure === 'devices',
      failRival: failure === 'rival',
    });
    const actors = createSimulationActors(fixture.world);
    if (failure === 'wrapper') {
      await assert.rejects(
        actors.createPlayer(
          {},
          {
            wrap(_context, { motion }) {
              motion.dispose();
              throw new Error('wrapper failure');
            },
          },
        ),
      );
    } else if (failure === 'devices')
      await assert.rejects(actors.createPlayer());
    else {
      await actors.createPlayer();
      await assert.rejects(actors.createField());
    }
    actors.dispose();
    assert.deepEqual(
      fixture.releases,
      failure === 'rival' ? ['rival', 'rival', 'player'] : ['player'],
    );
  }
});

test('a late player wrapper is released when its actor scope was disposed while awaiting it', async () => {
  const fixture = policyFixture();
  const actors = createSimulationActors(fixture.world);
  let finish, entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const pending = actors.createPlayer(
    {},
    {
      wrap(context, options) {
        entered();
        return new Promise((resolve) => {
          finish = () =>
            resolve(createDeviceRuntime({ ...context, ...options }));
        });
      },
    },
  );
  await ready;
  actors.dispose();
  finish();
  await assert.rejects(pending, /disposed/);
  assert.deepEqual(fixture.releases, ['player']);
});

function nativeDefinition() {
  return {
    createTrack: track,
    createCollisionWorld: () =>
      createCollisionWorld({
        id: 'simulation-factory',
        version: 1,
        geometryId: 'factory-v1',
        triangles: [],
      }),
    createDynamics: ({ collisionWorld }) =>
      createRapierWorld({ collisionWorld }),
    createRuntime: createMagneticRuntime,
    racing: {
      createDevices: () => [
        {
          id: 'factory-ion',
          type: 'ion',
          distance: 600,
          lateral: 0,
          width: 12,
          length: 20,
        },
      ],
      createMotion: createMagneticRuntime,
    },
  };
}
async function nativeFixture(shared) {
  const definition = nativeDefinition(),
    settings = { steeringAssist: 0.3 };
  let world, actors, runtime, racers, combat;
  if (shared) {
    world = await createSimulationWorld(definition);
    actors = createSimulationActors(world, { settings });
    ({ runtime } = await actors.createPlayer({ equipment: true }));
    ({ combat } = actors.prepareRacing());
    racers = await actors.createField();
  } else {
    const track = definition.createTrack();
    const collisionWorld = definition.createCollisionWorld({ track });
    const dynamics = await definition.createDynamics({
      track,
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
    world = {
      track,
      collisionWorld,
      dynamics,
      dispose() {
        dynamics.dispose();
        collisionWorld.dispose();
      },
    };
    const motion = definition.createRuntime({
      track,
      collisionWorld,
      dynamics,
      settings,
      equipment: true,
    });
    const devices = definition.racing.createDevices(track);
    combat = createCombatSimulation({ track, collisionWorld, dynamics });
    runtime = createDeviceRuntime({ track, devices, combat, motion });
    racers = createRacers({
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
  }
  const state = { ...createVehicleState(), ...createRaceGrid().player };
  const race = createRace(world.track, { rulesId: runtime.rulesId });
  world.dynamics.reset();
  racers.reset({ enabled: true, difficulty: 'hard' });
  runtime.reset({ state });
  const step = () =>
    advanceSession({
      state,
      race,
      runtime,
      racers,
      dynamics: world.dynamics,
      dt: 1 / 120,
      input: { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false },
      emit() {},
      presentation: false,
    });
  return {
    world,
    runtime,
    racers,
    combat,
    state,
    step,
    dispose() {
      if (actors) actors.dispose();
      else {
        racers.dispose();
        runtime.dispose();
      }
      world.dispose();
    },
  };
}

test('shared native assembly reproduces the original manual ten-actor fixed-step state and identities', async () => {
  const run = async (shared) => {
    const fixture = await nativeFixture(shared);
    try {
      for (let tick = 0; tick < 60; tick++) fixture.step();
      return {
        state: fixture.state,
        runtime: fixture.runtime.snapshot(),
        racers: fixture.racers.serialize(),
        dynamics: fixture.world.dynamics.snapshot(),
      };
    } finally {
      fixture.dispose();
    }
  };
  assert.deepEqual(await run(true), await run(false));
});

test('strict real-factory field restoration preserves live combat and actor bindings', async () => {
  const fixture = await nativeFixture(true);
  try {
    fixture.step();
    fixture.combat.request('rook', {
      type: 'pickup-activate',
      payload: { kind: 'ion', deviceId: 'factory-ion' },
    });
    fixture.step();
    const saved = fixture.racers.serialize(),
      combat = fixture.combat.snapshot();
    assert.ok(combat.emitters.rook);
    const states = fixture.racers.opponents.map((opponent) => opponent.state);
    const pose = fixture.combat.pose('rook');
    fixture.racers.restore(saved);
    assert.deepEqual(fixture.racers.serialize(), saved);
    assert.deepEqual(
      fixture.combat.snapshot(),
      combat,
      'temporary validation cannot clear live emitters, wakes or targets',
    );
    assert.deepEqual(fixture.combat.pose('rook'), pose);
    assert.ok(
      fixture.racers.opponents.every(
        (opponent, index) => opponent.state === states[index],
      ),
    );
    fixture.step();
    assert.ok(
      fixture.combat.snapshot().emitters.rook,
      'the original registered actor continues its active program',
    );
  } finally {
    fixture.dispose();
  }
});
