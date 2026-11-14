import assert from 'node:assert/strict';
import test from 'node:test';
import { createVehicleState } from '../src/physics/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createGlasswakeTrack } from '../src/levels/glasswake/track/model.js';
import { createGlasswakeRuntime } from '../src/levels/glasswake/runtime.js';
import { FIRST_SHELF_RULES } from '../src/levels/glasswake/environment/first-shelf.js';
import createZephyr from '../src/levels/zephyr/index.js';
import { createZephyrRuntime } from '../src/levels/zephyr/runtime.js';

const DT = 1 / 120;
const input = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const copy = (data) => JSON.parse(JSON.stringify(data));

function equivalent(actual, expected, path = 'state') {
  if (typeof expected === 'number') {
    // Standalone flight also refreshes its displayed speed after resolving a
    // tick. That can differ by one ULP at takeoff from the shared-world path.
    assert.ok(
      Math.abs(actual - expected) < 1e-10,
      `${path}: ${actual} / ${expected}`,
    );
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected), path);
    for (const key of Object.keys(expected))
      equivalent(actual[key], expected[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}

for (const fixture of [
  {
    name: 'Glasswake',
    createTrack: createGlasswakeTrack,
    createRuntime: createGlasswakeRuntime,
    distance: () => FIRST_SHELF_RULES.triggerDistance - 1,
  },
  {
    name: 'Zephyr',
    createTrack: () => createZephyr().createTrack(),
    createRuntime: createZephyrRuntime,
    distance: (track) => track.curtains[0].s - 1,
  },
]) {
  test(`${fixture.name} staged and standalone Native ticks retain equivalent state and exact replay checkpoints`, async (t) => {
    async function actor(staged) {
      const track = fixture.createTrack();
      const dynamics = await createRapierWorld();
      const runtime = fixture.createRuntime({
        track,
        dynamics,
        presentation: false,
      });
      const state = Object.assign(createVehicleState(), {
        distance: fixture.distance(track),
        speed: 112,
      });
      runtime.reset({ reason: 'scenario', state });
      t.after(() => {
        runtime.dispose();
        dynamics.dispose();
      });
      return {
        state,
        runtime,
        dynamics,
        step() {
          if (!staged) return runtime.advance(state, input, DT);
          runtime.beginAdvance(state, input, DT);
          dynamics.step(DT);
          return runtime.finishAdvance(state);
        },
      };
    }
    const standalone = await actor(false),
      staged = await actor(true);
    const read = (owner) =>
      copy({ state: owner.state, runtime: owner.runtime.snapshot() });
    for (let tick = 0; tick < 180; tick++) {
      assert.deepEqual(
        staged.step(),
        standalone.step(),
        `events at tick ${tick}`,
      );
      equivalent(read(staged), read(standalone), `state at tick ${tick}`);
    }
    const checkpoint = copy({
      ...read(staged),
      dynamics: staged.dynamics.snapshot(),
    });
    const continuation = [];
    for (let tick = 0; tick < 90; tick++)
      continuation.push(copy(staged.step()));
    const final = read(staged);
    Object.assign(staged.state, checkpoint.state);
    staged.runtime.restore(checkpoint.runtime);
    staged.dynamics.restore(checkpoint.dynamics);
    for (const events of continuation) assert.deepEqual(staged.step(), events);
    assert.deepEqual(read(staged), final);

    staged.runtime.beginAdvance(staged.state, input, DT);
    assert.throws(
      () => staged.runtime.beginAdvance(staged.state, input, DT),
      /Finish the pending/,
    );
    staged.runtime.reset({ state: staged.state });
    assert.throws(
      () => staged.runtime.finishAdvance(staged.state),
      /Stage the .* step/,
    );
    assert.doesNotThrow(() => staged.step());
    const restored = copy({
      ...read(staged),
      dynamics: staged.dynamics.snapshot(),
    });
    staged.runtime.beginAdvance(staged.state, input, DT);
    Object.assign(staged.state, restored.state);
    staged.runtime.restore(restored.runtime);
    staged.dynamics.restore(restored.dynamics);
    assert.throws(
      () => staged.runtime.finishAdvance(staged.state),
      /Stage the .* step/,
    );
    assert.deepEqual(read(staged), {
      state: restored.state,
      runtime: restored.runtime,
    });
    assert.doesNotThrow(() => staged.step());
  });
}
