import test from 'node:test';
import assert from 'node:assert/strict';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createRace } from '../src/race/index.js';
import { createRacers, RACE_GRID } from '../src/race/racers.js';
import { advanceSession } from '../src/core/session-runtime.js';
import { FIRST_SHELF_RULES } from '../src/levels/glasswake/environment/first-shelf.js';

const DT = 1 / 120;
const controls = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const cases = [
  {
    level: 'vesper',
    start(track) {
      const zone = track.sapZones[0];
      return {
        distance: zone.start - 0.01,
        lateral: zone.resinCenter > 0 ? -8 : 8,
        speed: 30,
      };
    },
    local: (snapshot) => snapshot.surface,
    assert(snapshot, events) {
      assert.equal(snapshot.surface.id, 'sap');
      assert.equal(
        events.filter((event) => event.type === 'surface-change').length,
        1,
      );
    },
  },
  {
    level: 'helion',
    start(track) {
      return {
        distance:
          track.thermalZones.find((zone) => zone.kind === 'furnace').start + 12,
        speed: 30,
      };
    },
    setup(runtime) {
      runtime.restore({
        ...runtime.snapshot(),
        heat: 61.9,
        contactAge: 0,
        contactHeat: 61.9,
      });
    },
    local: ({ heat, contactAge, contactHeat }) => ({
      heat,
      contactAge,
      contactHeat,
    }),
    assert(snapshot, events) {
      assert.ok(Math.abs(snapshot.heat - (61.9 + 25 * DT)) < 1e-10);
      assert.equal(snapshot.contactAge, 0);
      assert.equal(
        events.filter((event) => event.type === 'helion-power').length,
        0,
        'ongoing fire already limits thrust; crossing the overload threshold is not a second onset',
      );
    },
  },
  {
    level: 'helion',
    name: 'helion cold fire entry',
    start(track) {
      return {
        distance:
          track.thermalZones.find((zone) => zone.kind === 'furnace').start -
          0.01,
        speed: 30,
      };
    },
    local: ({ heat, contactAge, contactHeat }) => ({
      heat,
      contactAge,
      contactHeat,
    }),
    assert(snapshot, events) {
      // The staged sample was outside the fire; first heating belongs to the
      // next tick, while power changes at the actual solved entry position.
      assert.equal(snapshot.heat, 0);
      const changes = events.filter((event) => event.type === 'helion-power');
      assert.equal(changes.length, 1);
      assert.equal(changes[0].payload.limited, true);
      assert.ok(changes[0].payload.thrustScale <= 0.45);
    },
    assertNext(snapshot, events) {
      assert.ok(Math.abs(snapshot.heat - 25 * DT) < 1e-10);
      assert.equal(snapshot.contactAge, 0);
      assert.equal(
        events.filter((event) => event.type === 'helion-power').length,
        0,
      );
    },
  },
  {
    level: 'glasswake',
    start: () => ({
      distance: FIRST_SHELF_RULES.triggerDistance - 0.01,
      speed: 30,
    }),
    local: ({ openingShelf, calvingSoundLap }) => ({
      openingShelf,
      calvingSoundLap,
    }),
    assert(snapshot, events) {
      assert.equal(snapshot.openingShelf, 0);
      assert.equal(
        events.filter((event) => event.type === 'glasswake-shelf').length,
        1,
      );
    },
  },
  {
    level: 'zephyr',
    start: (track) => ({
      distance:
        track.sections.find((section) => section.id === 'falls').start + 1,
      speed: 0,
    }),
    local: (snapshot) => snapshot.zephyr,
    assert(snapshot) {
      assert.equal(snapshot.zephyr.towerStart, DT);
    },
  },
];

for (const scenario of cases) {
  test(`${scenario.name ?? scenario.level} local effects run after the shared body solve exactly once`, async () => {
    const definition = (
      await import(`../src/levels/${scenario.level}/index.js`)
    ).default();
    const track = definition.createTrack();
    // Empty static geometry isolates adapter ownership, not road collision shape.
    const stagedWorld = await createRapierWorld();
    const directWorld = await createRapierWorld();
    const staged = definition.racing.createMotion({
      track,
      dynamics: stagedWorld,
      presentation: false,
    });
    const direct = definition.racing.createMotion({
      track,
      dynamics: directWorld,
      presentation: false,
    });
    try {
      const state = { ...createVehicleState(), ...scenario.start(track) };
      const other = { ...state };
      staged.reset({ state, reason: 'fresh-lap' });
      direct.reset({ state: other, reason: 'fresh-lap' });
      scenario.setup?.(staged);
      scenario.setup?.(direct);
      assert.equal(typeof staged.beginAdvance, 'function');
      assert.equal(typeof staged.finishAdvance, 'function');
      const before = scenario.local(staged.snapshot());
      staged.beginAdvance(state, controls, DT);
      assert.deepEqual(
        scenario.local(staged.snapshot()),
        before,
        'effects must wait for the solved pose',
      );
      assert.equal(state.time, DT);
      stagedWorld.step(DT);
      const events = staged.finishAdvance(state);
      scenario.assert(staged.snapshot(), events);
      assert.deepEqual(events, direct.advance(other, controls, DT));
      assert.deepEqual(state, other);
      assert.deepEqual(
        scenario.local(staged.snapshot()),
        scenario.local(direct.snapshot()),
      );
      for (let tick = 0; tick < 3; tick++) {
        staged.beginAdvance(state, controls, DT);
        stagedWorld.step(DT);
        const nextEvents = staged.finishAdvance(state);
        assert.deepEqual(nextEvents, direct.advance(other, controls, DT));
        if (tick === 0) scenario.assertNext?.(staged.snapshot(), nextEvents);
      }
      assert.deepEqual(state, other);
      assert.deepEqual(
        scenario.local(staged.snapshot()),
        scenario.local(direct.snapshot()),
      );
    } finally {
      staged.dispose();
      direct.dispose();
      stagedWorld.dispose();
      directWorld.dispose();
    }
  });
}

test('Helion ten-body session stages every owner but advances its shared world only once per tick', async () => {
  const definition = (await import('../src/levels/helion/index.js')).default();
  const track = definition.createTrack();
  const world = await createRapierWorld();
  let steps = 0;
  const dynamics = {
    ...world,
    step(dt) {
      steps++;
      return world.step(dt);
    },
  };
  const devices = definition.racing.createDevices(track);
  const createRuntime = () =>
    createDeviceRuntime({
      track,
      devices,
      motion: definition.racing.createMotion({
        track,
        dynamics,
        presentation: false,
      }),
    });
  const runtime = createRuntime();
  const racers = createRacers({ track, devices, dynamics, createRuntime });
  try {
    const state = { ...createVehicleState(), ...RACE_GRID.player };
    const race = createRace(track, { rulesId: runtime.rulesId });
    runtime.reset({ state });
    racers.reset({ enabled: true });
    for (let tick = 0; tick < 4; tick++)
      advanceSession({
        state,
        input: controls,
        dt: DT,
        runtime,
        racers,
        dynamics,
        race,
        emit() {},
      });
    assert.equal(steps, 4);
    for (const vehicle of [
      state,
      ...racers.opponents.map((opponent) => opponent.state),
    ])
      assert.equal(vehicle.time, 4 * DT);
  } finally {
    racers.dispose();
    runtime.dispose();
    dynamics.dispose();
  }
});
