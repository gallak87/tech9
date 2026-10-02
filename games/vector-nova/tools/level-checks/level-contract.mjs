import assert from 'node:assert/strict';
import {
  validateMetadata,
  validateDefinition,
} from '../../src/levels/contract.js';
import { assertTrackContract } from './track-contract.mjs';
import { createDeviceLayout } from '../../src/pickups/layout.js';
import { createDeviceRuntime } from '../../src/pickups/runtime.js';
import { createMagneticRuntime } from '../../src/core/session-runtime.js';
import { createVehicleState } from '../../src/physics/index.js';

// CPU-only: selected factories and track models must not need world construction.
export async function assertLevelContract(
  { metadata, createLevel },
  options = {},
) {
  validateMetadata(metadata);
  assert.equal(
    typeof createLevel,
    'function',
    'default export must be a level factory',
  );
  const production = validateDefinition(
    await createLevel({ shape: false }),
    metadata.id,
  );
  const track = await production.createTrack();
  const report = {
    id: metadata.id,
    production: assertTrackContract(track, options),
  };
  // Every production circuit reuses the graduated race/device system.
  assert.ok(production.racing, 'production levels require shared racing');
  const {
    createDevices,
    createMotion = createMagneticRuntime,
    identity,
  } = production.racing;
  const devices = createDeviceLayout(track, createDevices(track));
  for (const kind of ['vector', 'aegis'])
    assert.ok(
      devices.some((device) => device.type === kind),
      `missing ${kind} layout`,
    );
  const runtime = createDeviceRuntime({
    track,
    devices,
    identity,
    motion: createMotion({ track, settings: {}, presentation: false }),
  });
  try {
    const state = createVehicleState();
    runtime.reset({ reason: 'initialize', state, seed: 0 });
    runtime.advance(state, { throttle: 1 }, 1 / 120);
    assert.ok(
      state.time > 0 && Number.isFinite(state.distance),
      'pure racing adapter advances',
    );
    runtime.restore(JSON.parse(JSON.stringify(runtime.snapshot())));
    report.racing = { devices: devices.length, runtime: runtime.id };
  } finally {
    runtime.dispose();
  }
  if (metadata.shape) {
    const definition = validateDefinition(
      await createLevel({ shape: true }),
      metadata.id,
    );
    const bare = await definition.createTrack();
    report.shape = assertTrackContract(bare, options);
    assert.equal(
      bare.length,
      track.length,
      'shape and production must share route length',
    );
    assert.equal(
      bare.width,
      track.width,
      'shape and production must share route width',
    );
    assert.deepEqual(
      bare.sections,
      track.sections,
      'shape and production must share review sections',
    );
    assert.deepEqual(
      bare.checkpoints,
      track.checkpoints,
      'shape and production must share checkpoints',
    );
    const count = report.production.samples - 1;
    for (let i = 0; i <= count; i++) {
      const distance = (i * track.length) / count;
      const rendered = track.sample(distance);
      const position = rendered.position.clone(),
        quaternion = rendered.quaternion.clone();
      const shape = bare.sample(distance);
      assert.ok(
        position.distanceTo(shape.position) < 1e-5 &&
          quaternion.angleTo(shape.quaternion) < 1e-5,
        `shape and production differ at ${distance}m`,
      );
    }
  }
  return report;
}

export async function loadLevel(slug) {
  if (!/^[a-z][a-z0-9-]*$/.test(slug || ''))
    throw new Error(
      'Supply a level folder slug, for example: npm run check:level -- orbital',
    );
  const root = new URL(`../../src/levels/${slug}/`, import.meta.url);
  const { default: metadata } = await import(new URL('metadata.js', root));
  validateMetadata(metadata, slug);
  const { default: createLevel } = await import(new URL('index.js', root));
  return { metadata, createLevel };
}
