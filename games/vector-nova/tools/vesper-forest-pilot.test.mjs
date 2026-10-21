import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { createCatalog, circuitURL } from '../src/levels/contract.js';
import { createVesperTrack as baselineTrack } from '../src/levels/vesper/track/model.js';
import { createVesperTrack as pilotTrack } from '../src/levels/vesper-forest/track/model.js';
import { createVesperRoad as baselineRoad } from '../src/levels/vesper/track/road.js';
import { createVesperRoad as pilotRoad } from '../src/levels/vesper-forest/track/road.js';
import { createVesperCollisionWorld as baselineCollision } from '../src/levels/vesper/collision.js';
import { createVesperCollisionWorld as pilotCollision } from '../src/levels/vesper-forest/collision.js';
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

const oldRoadDecorations = new Set([
  'Paired braided load roots',
  'Maintenance sleeves and root sockets',
]);

test('new-kit road attachments replace old vines without changing any driving, curb or guidance geometry', () => {
  const original = baselineRoad({ track: baselineTrack() });
  const pilot = pilotRoad({ track: pilotTrack() });
  try {
    const meshes = (road) => {
      const result = [];
      road.group.traverse((object) => {
        if (object.isMesh) result.push(object);
      });
      return result;
    };
    const allOriginal = meshes(original),
      actual = meshes(pilot);
    for (const name of oldRoadDecorations) {
      assert.ok(
        allOriginal.some((mesh) => mesh.name === name),
        `baseline contains ${name}`,
      );
      assert.ok(
        !actual.some((mesh) => mesh.name === name),
        `pilot removed ${name}`,
      );
    }
    const expected = allOriginal.filter(
      (mesh) => !oldRoadDecorations.has(mesh.name),
    );
    assert.equal(
      actual.length,
      expected.length,
      'only the two obsolete decoration meshes are removed',
    );
    assert.ok(actual.some((mesh) => mesh.userData.drivingSurface));
    assert.ok(
      actual.some(
        (mesh) => mesh.name === 'Advance jump lane and landing guidance',
      ),
    );
    const materialState = (material) => {
      const state = material.toJSON();
      delete state.uuid;
      return {
        state,
        shader: material.onBeforeCompile.toString(),
        cacheKey: material.customProgramCacheKey(),
      };
    };
    for (let i = 0; i < expected.length; i++) {
      const a = expected[i],
        b = actual[i],
        label = a.name || `road mesh ${i}`;
      assert.equal(b.name, a.name);
      assert.deepEqual(b.userData, a.userData, `${label} semantic tags`);
      assert.deepEqual(
        b.geometry.index.array,
        a.geometry.index.array,
        `${label} triangle indices`,
      );
      assert.deepEqual(
        Object.keys(b.geometry.attributes),
        Object.keys(a.geometry.attributes),
      );
      for (const [name, attribute] of Object.entries(a.geometry.attributes)) {
        const next = b.geometry.attributes[name];
        assert.equal(next.itemSize, attribute.itemSize);
        assert.equal(next.normalized, attribute.normalized);
        assert.deepEqual(next.array, attribute.array, `${label} ${name}`);
      }
      assert.deepEqual(b.geometry.groups, a.geometry.groups);
      assert.deepEqual(b.geometry.drawRange, a.geometry.drawRange);
      assert.deepEqual(b.matrix.toArray(), a.matrix.toArray());
      assert.deepEqual(
        materialState(b.material),
        materialState(a.material),
        `${label} material and shader`,
      );
    }
  } finally {
    original.dispose();
    pilot.dispose();
  }
});

test('the rebuilt pilot removes obsolete bough/vine colliders and retains every driving contact', () => {
  const original = baselineCollision({ track: baselineTrack() });
  const pilot = pilotCollision({ track: pilotTrack() });
  try {
    const removed = 'placed-landing-bough';
    assert.ok(original.targets.some((target) => target.id === removed));
    assert.ok(original.triangles.some((triangle) => triangle.id === removed));
    assert.ok(!pilot.targets.some((target) => target.id === removed));
    assert.ok(!pilot.triangles.some((triangle) => triangle.id === removed));
    assert.notEqual(pilot.rulesId, original.rulesId);
    const removedIds = new Set(
      original.targets
        .filter(
          (target) =>
            target.id === removed || oldRoadDecorations.has(target.name),
        )
        .map((target) => target.id),
    );
    assert.ok(
      pilot.targets.every((target) => !oldRoadDecorations.has(target.name)),
    );
    const remainingTargets = original.targets.filter(
      (target) => !removedIds.has(target.id),
    );
    const contactTarget = (target) => {
      const contact = { ...target };
      delete contact.id;
      return contact;
    };
    assert.deepEqual(
      pilot.targets.map(contactTarget),
      remainingTargets.map(contactTarget),
    );
    const names = (world) =>
      new Map(world.targets.map((target) => [target.id, target.name]));
    const originalNames = names(original);
    const pilotNames = names(pilot);
    const remaining = original.triangles.filter(
      (triangle) => !removedIds.has(triangle.id),
    );
    assert.equal(pilot.triangleCount, remaining.length);
    // Extraction numbers targets and triangles in insertion order. Removing the
    // old bough/vines changes IDs, but no retained road vertex or contact metadata may move.
    const contact = (triangle, targetNames) => {
      const surface = { ...triangle, target: targetNames.get(triangle.id) };
      delete surface.id;
      delete surface.order;
      return surface;
    };
    for (let i = 0; i < remaining.length; i++) {
      assert.deepEqual(
        contact(pilot.triangles[i], pilotNames),
        contact(remaining[i], originalNames),
        `road contact triangle ${i}`,
      );
    }
  } finally {
    original.dispose();
    pilot.dispose();
  }
});
