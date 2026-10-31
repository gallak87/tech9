import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { createCatalog, circuitURL } from '../src/levels/contract.js';
import { createVesperTrack } from '../src/levels/vesper-forest/track/model.js';
import { createVesperRoad } from '../src/levels/vesper-forest/track/road.js';
import { createVesperCollisionWorld } from '../src/levels/vesper-forest/collision.js';
import { createVesperRuntime } from '../src/levels/vesper-forest/runtime.js';
import { createDevices } from '../src/levels/vesper-forest/devices.js';
import { sampleVesperSurface } from '../src/levels/vesper-forest/surface.js';
import { createVehicleState } from '../src/physics/index.js';
import {
  compatibleRuntime,
  runtimeIdentity,
} from '../src/core/session-runtime.js';
import { trackChallenge } from '../src/frontend/track-challenge.js';
import { menuCatalog } from './menu-catalog.mjs';
import { editionPolicy } from './desktop/policy.mjs';

// These fingerprints describe the approved Forest route, road and contacts.
// Quantize double precision noise without allowing a physical route change.
const fingerprint = (value) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_, item) =>
        typeof item === 'number'
          ? Math.round(item * 1e8) / 1e8
          : ArrayBuffer.isView(item)
            ? Array.from(item)
            : item,
      ),
    )
    .digest('hex');

test('Vesper Forest is independently discoverable without constructing a world', async () => {
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
  const forest = catalog.list.find((entry) => entry.id === 'vesper-forest');
  assert.equal(forest.name, 'Vesper Forest');
  assert.equal(
    catalog.list.filter((entry) => entry.id === forest.id).length,
    1,
  );
  assert.equal(trackChallenge(forest.id), 'Easy');
  assert.equal(
    circuitURL('https://example.test/', forest.id).searchParams.get('level'),
    forest.id,
  );
  assert.ok(editionPolicy('full').levels.includes(forest.id));
  assert.ok(!editionPolicy('demo').levels.includes(forest.id));
  const [course] = await menuCatalog({ levelIds: [forest.id], warn() {} });
  assert.equal(course.trackId, 'vesper-forest-1');
});

test('the approved Forest route, surfaces and device layout retain their physical contract', () => {
  const track = createVesperTrack();
  assert.equal(track.id, 'vesper-forest-1');
  assert.equal(track.name, 'Vesper Forest');
  assert.equal(track.width, 28);
  assert.equal(track.length, 4762.5398043901305);
  assert.equal(track.jumps.length, 1);
  assert.equal(track.inversions.length, 1);
  const geometry = Object.fromEntries(
    Object.entries(track).filter(
      ([key, value]) =>
        !['id', 'name', 'review'].includes(key) && typeof value !== 'function',
    ),
  );
  assert.equal(
    fingerprint(geometry),
    '6752cd5a186fcb53d7d9f10ae3702633a5ee2878fc39ce3c150144f31e21214a',
  );
  const frames = [];
  for (let distance = -2; distance <= track.length + 2; distance++) {
    const frame = track.sample(distance);
    frames.push({
      distance,
      position: frame.position.toArray(),
      tangent: frame.tangent.toArray(),
      right: frame.right.toArray(),
      up: frame.up.toArray(),
      quaternion: frame.quaternion.toArray(),
      curvature: frame.curvature,
      bank: frame.bank,
      roll: frame.roll,
      gap: track.isGap(distance),
      surfaces: [-12, 0, 12].map((lateral) =>
        sampleVesperSurface(track, { distance, lateral, speed: 85 }),
      ),
    });
  }
  assert.equal(
    fingerprint(frames),
    '9bade6deadc92d1a6bc4a1a0b458ca39d4d9bd7539306e915b88877688b1a57a',
  );
  assert.equal(
    fingerprint(createDevices(track)),
    '65fdff8db17985352fa675a4b0ae82b2d8e09646fb6b027c4f63425ac1598ff3',
  );
});

test('Forest coast, hollow and crown-flight simulations retain their deterministic behavior', () => {
  const track = createVesperTrack();
  for (const [initial, expected] of [
    [
      { distance: 460, speed: 80 },
      '198a785e08381125bf19af195708d2931bd2266d19bbec2f29eecf33f762856e',
    ],
    [
      { distance: track.landmarks.hollow.entry, speed: 60 },
      'e95ef4ade25ae2e40cd88b0ff99e88320841ce6fd9fb82f9f8a7368697386b67',
    ],
    [
      { distance: track.jumps[0].takeoff - 0.1, speed: 112 },
      '21a7b3a9f558b9fb0f73ab697d64d6c556dd5e6a601b74b0b72e223c523ff7b3',
    ],
  ]) {
    const runtime = createVesperRuntime({ track, presentation: false });
    const state = { ...createVehicleState(), ...initial };
    try {
      runtime.reset({ state, seed: 7 });
      assert.equal(compatibleRuntime(runtime, runtimeIdentity(runtime)), true);
      const trace = [];
      for (let tick = 0; tick < 720; tick++) {
        const events = runtime.advance(
          state,
          {
            throttle: 0,
            brake: 0,
            steer: 0,
            boost: false,
            airbrake: false,
          },
          1 / 120,
        );
        trace.push({ state: { ...state }, motion: runtime.snapshot(), events });
      }
      assert.equal(
        fingerprint(trace),
        expected,
        `simulation at ${initial.distance}m`,
      );
      if (initial.speed === 112)
        assert.ok(
          trace.some((step) =>
            step.events.some(
              (event) =>
                event.type === 'jump-transfer' &&
                event.payload.outcome === 'landed',
            ),
          ),
        );
    } finally {
      runtime.dispose();
    }
  }
});

test('Forest road geometry, materials and guidance retain the approved mesh contract', () => {
  const road = createVesperRoad({ track: createVesperTrack() });
  try {
    const meshes = [];
    road.group.updateMatrixWorld(true);
    road.group.traverse((object) => {
      if (!object.isMesh) return;
      const state = object.material.toJSON();
      delete state.uuid;
      meshes.push({
        name: object.name,
        userData: object.userData,
        index: object.geometry.index?.array,
        attributes: Object.fromEntries(
          Object.entries(object.geometry.attributes).map(([id, attribute]) => [
            id,
            {
              itemSize: attribute.itemSize,
              normalized: attribute.normalized,
              array: attribute.array,
            },
          ]),
        ),
        groups: object.geometry.groups,
        drawRange: object.geometry.drawRange,
        matrix: object.matrix.toArray(),
        material: {
          state,
          shader: object.material.onBeforeCompile.toString(),
          cacheKey: object.material.customProgramCacheKey(),
        },
      });
    });
    assert.equal(meshes.length, 89);
    assert.ok(meshes.some((mesh) => mesh.userData.drivingSurface));
    assert.ok(
      meshes.some(
        (mesh) => mesh.name === 'Advance jump lane and landing guidance',
      ),
    );
    assert.equal(
      fingerprint(meshes),
      'e0403b4fb877f90bb3313f2ede5d3882f100f9c2749db99849bc5998d4176c33',
    );
  } finally {
    road.dispose();
  }
});

test('Forest collision keeps every approved deck, rail and structural triangle', () => {
  const collision = createVesperCollisionWorld({ track: createVesperTrack() });
  try {
    assert.equal(collision.targets.length, 9);
    assert.equal(collision.triangleCount, 4318);
    assert.equal(
      fingerprint({
        targets: collision.targets,
        triangles: collision.triangles,
      }),
      'f24d9bfaf21930594c3ec7cb10fdc0bc78eb00126d61731e7fd373e70e6488d7',
    );
  } finally {
    collision.dispose();
  }
});
