import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { createCatalog, circuitURL } from '../src/levels/contract.js';
import { createVesperTrack as baselineTrack } from '../src/levels/vesper/track/model.js';
import { createVesperTrack as pilotTrack } from '../src/levels/vesper-forest/track/model.js';
import { createVesperRuntime as baselineRuntime } from '../src/levels/vesper/runtime.js';
import { createVesperRuntime as pilotRuntime } from '../src/levels/vesper-forest/runtime.js';
import { createDevices as baselineDevices } from '../src/levels/vesper/devices.js';
import { createDevices as pilotDevices } from '../src/levels/vesper-forest/devices.js';
import { sampleVesperSurface as baselineSurface } from '../src/levels/vesper/surface.js';
import { sampleVesperSurface as pilotSurface } from '../src/levels/vesper-forest/surface.js';
import { createVehicleState } from '../src/physics/index.js';
import {
  compatibleRuntime,
  runtimeIdentity,
} from '../src/core/session-runtime.js';
import { trackChallenge } from '../src/frontend/track-challenge.js';
import { menuCatalog } from './menu-catalog.mjs';
import { editionPolicy } from './desktop/policy.mjs';

// Keep the approved circuit as a measurable control for this art-only pilot.
test('Vesper Forest is a separate discoverable circuit with its own course identity', async () => {
  const entries = await readdir(new URL('../src/levels/', import.meta.url), {
    withFileTypes: true,
  });
  const metadata = {},
    loaders = {};
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    const module = await import(`../src/levels/${entry.name}/metadata.js`);
    metadata[`./${entry.name}/metadata.js`] = module.default;
    loaders[`./${entry.name}/index.js`] = () => {
      assert.fail('Catalog discovery must not construct a world');
    };
  }
  const catalog = createCatalog(metadata, loaders);
  const original = catalog.list.find((entry) => entry.id === 'vesper');
  const pilot = catalog.list.find((entry) => entry.id === 'vesper-forest');
  assert.equal(original.name, 'Vesper Canopy');
  assert.equal(pilot.name, 'Vesper Forest');
  assert.equal(catalog.list.indexOf(pilot), catalog.list.indexOf(original) + 1);
  assert.equal(trackChallenge(pilot.id), trackChallenge(original.id));
  assert.equal(
    circuitURL('https://example.test/?level=vesper', pilot.id).searchParams.get(
      'level',
    ),
    pilot.id,
  );
  assert.ok(editionPolicy('full').levels.includes(pilot.id));
  assert.ok(!editionPolicy('demo').levels.includes(pilot.id));
  const courses = await menuCatalog({
    levelIds: [original.id, pilot.id],
    warn() {},
  });
  assert.equal(courses.length, 2);
  assert.notEqual(courses[0].trackId, courses[1].trackId);
  assert.equal(courses[0].routeSignature, courses[1].routeSignature);
});

test('the pilot retains every route frame, jump, surface and device from approved Vesper', () => {
  const original = baselineTrack(),
    pilot = pilotTrack();
  assert.notEqual(original.id, pilot.id);
  const geometry = (track) =>
    Object.fromEntries(
      Object.entries(track).filter(
        ([key, value]) =>
          !['id', 'name', 'review'].includes(key) &&
          typeof value !== 'function',
      ),
    );
  assert.deepEqual(geometry(pilot), geometry(original));
  for (let distance = -2; distance <= original.length + 2; distance += 1) {
    assert.deepEqual(
      pilot.sample(distance),
      original.sample(distance),
      `route at ${distance}m`,
    );
    assert.equal(pilot.isGap(distance), original.isGap(distance));
    for (const lateral of [-12, 0, 12]) {
      const state = { distance, lateral };
      assert.deepEqual(
        pilotSurface(pilot, state),
        baselineSurface(original, state),
      );
    }
  }
  assert.deepEqual(pilotDevices(pilot), baselineDevices(original));
});

test('pilot physics matches the control through ground travel and crown flight, with isolated replay identity', () => {
  const tracks = [baselineTrack(), pilotTrack()];
  const factories = [baselineRuntime, pilotRuntime];
  const jump = tracks[0].jumps[0];
  for (const initial of [
    { distance: 460, speed: 80 },
    { distance: tracks[0].landmarks.hollow.entry, speed: 60 },
    { distance: jump.takeoff - 0.1, speed: 112 },
  ]) {
    const adapters = factories.map((factory, index) =>
      factory({ track: tracks[index], presentation: false }),
    );
    const states = adapters.map(() => ({
      ...createVehicleState(),
      ...initial,
    }));
    try {
      assert.equal(adapters[0].rulesId, adapters[1].rulesId);
      assert.equal(
        compatibleRuntime(adapters[0], runtimeIdentity(adapters[1])),
        false,
      );
      assert.equal(
        compatibleRuntime(adapters[1], runtimeIdentity(adapters[0])),
        false,
      );
      adapters.forEach((adapter, index) =>
        adapter.reset({ state: states[index], seed: 7 }),
      );
      for (let tick = 0; tick < 720; tick++) {
        const input = {
          throttle: 0,
          brake: 0,
          steer: 0,
          boost: false,
          airbrake: false,
        };
        const events = adapters.map((adapter, index) =>
          adapter.advance(states[index], input, 1 / 120),
        );
        assert.deepEqual(events[1], events[0]);
        assert.deepEqual(states[1], states[0]);
        assert.deepEqual(adapters[1].snapshot(), adapters[0].snapshot());
      }
    } finally {
      adapters.forEach((adapter) => adapter.dispose());
    }
  }
});
