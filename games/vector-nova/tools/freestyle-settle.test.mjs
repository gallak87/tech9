import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/launchworks/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createTransferPilot } from './freestyle-pilot.mjs';

const DT = 1 / 120;
const copy = (value) => JSON.parse(JSON.stringify(value));

test('a real late-roll landing earns recovered credit after sustained native support and replays once', async (t) => {
  const level = createLevel();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const runtime = createDeviceRuntime({
    track,
    devices: level.racing.createDevices(track),
    equipmentEnabled: false,
    motion: level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    }),
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  const state = {
    ...createVehicleState('kestrel'),
    ...track.scenarios['jump1-approach'],
  };
  runtime.reset({ state, seed: 7 });
  const pilot = createTransferPilot(track, { reaction: 0.15, quantum: 0.25 });
  let touchdown = null;
  for (let tick = 0; tick < 1800; tick++) {
    const before = runtime.snapshot();
    const input = {
      ...pilot({ state, motion: before, pose: runtime.pose(1) }),
    };
    // A deliberate 300 ms roll input late in flight recreates the original
    // "Still rotating" arrival using ordinary controls, not fabricated hits.
    if (before.flight?.elapsed >= 4.05 && before.flight.elapsed < 4.35)
      input.aerialRoll = -1;
    const events = runtime.advance(state, input, DT);
    assert.equal(
      events.some((event) => event.type === 'jump-miss'),
      false,
    );
    const contact = events.find((event) => event.type === 'jump-transfer');
    if (!contact) continue;
    touchdown = { time: state.time, before, events, contact };
    break;
  }
  assert.ok(
    touchdown,
    'the real hull must contact the authored receiving bank',
  );
  assert.equal(touchdown.contact.payload.outcome, 'landed');
  assert.ok(
    Math.hypot(...touchdown.before.freestyle.angular) >= 0.9,
    'this arrival crossed the former Still rotating scoring threshold',
  );
  assert.equal(
    touchdown.events.some((event) => event.type === 'impact'),
    false,
  );
  assert.equal(
    touchdown.events.some((event) => event.type === 'freestyle-bank'),
    false,
  );
  assert.equal(runtime.snapshot().freestyle.score, 0);
  assert.equal(
    runtime.snapshot().freestyle.pendingLanding.id,
    track.jumps[0].id,
  );
  assert.equal(runtime.snapshot().freestyle.pendingLanding.clean, false);

  const checkpoint = {
    state: copy(state),
    runtime: runtime.snapshot(),
    dynamics: dynamics.snapshot(),
  };
  for (let i = 0; i < 30; i++) runtime.readFrame();
  assert.deepEqual(
    runtime.snapshot(),
    checkpoint.runtime,
    'presentation cannot advance the settling clock',
  );

  const controls = [],
    observed = [];
  for (let tick = 0; tick < 48; tick++) {
    const input = {
      ...pilot({ state, motion: runtime.snapshot(), pose: runtime.pose(1) }),
    };
    controls.push(input);
    observed.push(...runtime.advance(state, input, DT));
    assert.equal(
      runtime.pose(1).grounded,
      true,
      'native magnetic support remains attached',
    );
    if (state.time - touchdown.time < 0.29)
      assert.equal(
        runtime.snapshot().freestyle.score,
        0,
        'first contact alone cannot bank points',
      );
  }
  const banks = observed.filter((event) => event.type === 'freestyle-bank');
  assert.equal(banks.length, 1);
  assert.equal(banks[0].payload.reason, 'Recovered landing');
  assert.equal(banks[0].payload.landed, true);
  assert.equal(banks[0].payload.clean, false);
  assert.equal(banks[0].payload.perfect, false);
  const airPoints = checkpoint.runtime.freestyle.pendingLanding.style;
  assert.ok(
    airPoints > 0,
    'the real airborne corrections earned continuous rotation points',
  );
  assert.equal(banks[0].payload.bank, Math.round(1000 + airPoints));
  assert.equal(banks[0].payload.chain, 1);
  assert.ok(banks[0].payload.at - banks[0].payload.touchdownAt >= 0.299);
  assert.equal(
    observed.some((event) => event.type === 'road-recovery'),
    false,
  );
  const expected = {
    state: copy(state),
    runtime: runtime.snapshot(),
    dynamics: dynamics.snapshot(),
    events: observed,
  };

  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, checkpoint.state);
  runtime.restore(checkpoint.runtime, { state, presentation: false });
  dynamics.restore(checkpoint.dynamics);
  const replayed = controls.flatMap((input) =>
    runtime.advance(state, input, DT),
  );
  assert.deepEqual(
    {
      state: copy(state),
      runtime: runtime.snapshot(),
      dynamics: dynamics.snapshot(),
      events: replayed,
    },
    expected,
    'a pending touchdown restores its native body, grade and single score event exactly',
  );
});
