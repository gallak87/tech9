import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createVehicleState } from '../physics/index.js';
import { createFlightModel } from '../physics/flight.js';
import { createDeviceRuntime } from '../pickups/runtime.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import {
  advanceSession,
  createMagneticRuntime,
  readRuntimeFrame,
} from './session-runtime.js';
import { createCindercoilTrack } from '../levels/cindercoil/track/model.js';
import { createCindercoilRuntime } from '../levels/cindercoil/runtime.js';
import { createGlasswakeTrack } from '../levels/glasswake/track/model.js';
import { createGlasswakeRuntime } from '../levels/glasswake/runtime.js';
import { createHelionTrack } from '../levels/helion/track/model.js';
import { createHelionRuntime } from '../levels/helion/runtime.js';
import { createNomadTrack } from '../levels/nomad/track/model.js';
import { createNomadRuntime } from '../levels/nomad/runtime.js';
import { createRavelTrack } from '../levels/ravel/track/model.js';
import { createRavelRuntime } from '../levels/ravel/runtime.js';
import { createSaffronTrack } from '../levels/saffron/track/model.js';
import { createSaffronRuntime } from '../levels/saffron/runtime.js';

const DT = 1 / 120;
function straightTrack() {
  return {
    id: 'frame-track',
    length: 1000,
    width: 20,
    jumps: [],
    checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 700 }],
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
function assertProjection(frame, checkpoint) {
  if (frame && typeof frame === 'object') {
    for (const [key, value] of Object.entries(frame))
      assertProjection(value, checkpoint?.[key]);
  } else assert.equal(frame, checkpoint);
}
function corrupt(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (entry && typeof entry === 'object') corrupt(entry);
    else value[key] = typeof entry === 'number' ? 99999 : 'changed';
  }
}

test('frame reads retain legacy adapter fallback without invoking snapshots for dedicated readers', () => {
  assert.equal(readRuntimeFrame({ snapshot: () => null }), null);
  assert.deepEqual(readRuntimeFrame({ snapshot: () => ({ mode: 'legacy' }) }), {
    mode: 'legacy',
  });
  assert.equal(
    readRuntimeFrame({
      readFrame: () => null,
      snapshot() {
        throw new Error('A null frame is intentional, not a fallback.');
      },
    }),
    null,
  );
});

test('device frame reads omit combat checkpoints and retained device ledgers', () => {
  let captures = 0;
  const motion = {
    id: 'frame-motion',
    version: 1,
    rulesId: 'frame-motion',
    readFrame: () => ({ mode: 'flight', flight: { id: 'jump' } }),
    snapshot() {
      throw new Error('Frame presentation must not capture motion.');
    },
    dispose() {},
  };
  const combat = {
    snapshot() {
      captures++;
      return { largeOwnedCheckpoint: true };
    },
    resetActor() {},
  };
  const runtime = createDeviceRuntime({
    track: { length: 1000 },
    devices: [],
    motion,
    combat,
  });
  try {
    const frame = runtime.readFrame();
    assert.equal(frame.vectorActive, false);
    assert.equal(frame.mode, 'flight');
    assert.equal(frame.motion.flight.id, 'jump');
    assert.equal(captures, 0);
    for (const key of ['combat', 'equipment', 'used', 'layoutKey'])
      assert.equal(key in frame, false, key);
  } finally {
    runtime.dispose();
  }
});

test('flight status and detached frames preserve ground, airborne and manual recovery state', () => {
  const jump = {
    id: 'frame-jump',
    takeoff: 100,
    landingStart: 200,
    landingEnd: 500,
    recovery: 550,
    halfWidth: 10,
  };
  const track = { ...straightTrack(), jumps: [jump] };
  const runtime = createFlightModel({ timeout: 0.02 }).createRuntime(
    { track },
    { id: 'frame', version: 1, rulesId: 'frame', testLaunch: true },
  );
  const state = createVehicleState();
  runtime.reset({ state });
  function read(mode) {
    const before = runtime.snapshot();
    assert.equal(runtime.status().mode, mode);
    const frame = runtime.readFrame();
    assert.equal(frame.mode, mode);
    assertProjection(frame, before);
    corrupt(frame);
    assert.deepEqual(
      runtime.snapshot(),
      before,
      'presentation cannot mutate checkpoint state',
    );
  }
  try {
    read('magnetic');
    runtime.launch(state, {
      jump: jump.id,
      position: [0, 20, 100],
      velocity: [0, 0, 70],
    });
    read('flight');
    for (let i = 0; i < 8 && runtime.status().mode !== 'recovery'; i++)
      runtime.advance(state, {}, DT);
    read('recovery');
    assert.equal(runtime.readFrame().flight.manualRecovery, true);
  } finally {
    runtime.dispose();
  }
});

test('reading and mutating detached presentation frames cannot change native fixed-step outcomes', async () => {
  const run = async (readFrames) => {
    const track = straightTrack();
    const dynamics = await createRapierWorld();
    const runtime = createMagneticRuntime({
      track,
      dynamics,
      equipment: true,
      settings: { steeringAssist: 0.3 },
    });
    const state = createVehicleState();
    const race = { runoutControl: (_state, input) => input, step: () => [] };
    try {
      runtime.reset({ state });
      for (let tick = 0; tick < 120; tick++) {
        advanceSession({
          state,
          runtime,
          race,
          dynamics,
          dt: DT,
          input: { throttle: 1, steer: tick < 60 ? 0.1 : -0.1 },
          emit() {},
        });
        if (readFrames) {
          runtime.status();
          corrupt(runtime.readFrame());
        }
      }
      return {
        state,
        checkpoint: runtime.snapshot(),
        native: dynamics.snapshot(),
      };
    } finally {
      runtime.dispose();
      dynamics.dispose();
    }
  };
  assert.deepEqual(await run(true), await run(false));
});

for (const [name, createTrack, createRuntime] of [
  ['Cindercoil', createCindercoilTrack, createCindercoilRuntime],
  ['Glasswake', createGlasswakeTrack, createGlasswakeRuntime],
  ['Helion', createHelionTrack, createHelionRuntime],
  ['Nomad', createNomadTrack, createNomadRuntime],
  ['Ravel', createRavelTrack, createRavelRuntime],
  ['Saffron', createSaffronTrack, createSaffronRuntime],
]) {
  test(`${name} frame fields retain the consumed level-specific checkpoint paths`, () => {
    const track = createTrack();
    // Readers need no native collision world, scene or presentation resources.
    const runtime = createRuntime({
      track,
      collisionWorld: { id: 'frame', version: 1, rulesId: 'frame' },
    });
    const state = createVehicleState();
    try {
      runtime.reset({ state, reason: 'fresh-lap', seed: 5 });
      const before = runtime.snapshot();
      assertProjection(runtime.readFrame(), before);
      corrupt(runtime.readFrame());
      assert.deepEqual(runtime.snapshot(), before);
    } finally {
      runtime.dispose();
      track.dispose?.();
    }
  });
}
