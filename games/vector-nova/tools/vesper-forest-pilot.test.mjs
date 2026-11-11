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

// These fingerprints describe the authored Forest route, road and contacts.
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

test('the authored Forest route, surfaces and device layout retain their physical contract', () => {
  const track = createVesperTrack();
  assert.equal(track.id, 'vesper-forest-1');
  assert.equal(track.name, 'Vesper Forest');
  assert.equal(track.width, 28);
  assert.equal(track.length, 5301.169944527549);
  assert.equal(track.jumps.length, 2);
  assert.equal(track.inversions.length, 1);
  assert.equal(track.revision, 'vesper-route-9-river-run');
  assert.equal(track.geometryVersion, track.revision);
  const roll = track.inversions[0];
  assert.ok(
    track.sapZones.every(
      (zone) => zone.end < roll.start || zone.start > roll.end,
    ),
    'sap never secretly slows the roll',
  );
  for (const jump of track.jumps) {
    assert.ok(
      track.sample(jump.takeoff).tangent.y > 0.07,
      'visible pitched takeoff',
    );
    assert.ok(
      track.sample(jump.landingStart).tangent.y < 0,
      'falling catch runway',
    );
    assert.ok(
      track.sample(jump.takeoff).position.y -
        track.sample(jump.landingStart).position.y >=
        7.5,
      'receiver sits clearly below the release',
    );
    assert.ok(jump.landingEnd - jump.landingStart > 350, 'wide speed envelope');
  }
  const geometry = Object.fromEntries(
    Object.entries(track).filter(
      ([key, value]) =>
        !['id', 'name', 'review', 'revision', 'geometryVersion'].includes(
          key,
        ) && typeof value !== 'function',
    ),
  );
  assert.equal(
    fingerprint(geometry),
    'b7883426c8f8f99ccc3c588a00a6a50e2082f5c9c530fb3bd773525237a2d54f',
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
    '7d4011c21b193c6059ec58df2ee033372f146cd782f5e071fb69f42cc0b3f6fc',
  );
  assert.equal(
    fingerprint(createDevices(track)),
    '7603134860d5f3603a44ad140d70d206724200322537a91c341e8f49921c87dc',
  );
});

test('Bloomspan lane frames follow the real ribbon while ordinary shelves retain their reference handling', () => {
  const track = createVesperTrack();
  const roll = track.inversions[0];
  assert.equal(track.sampleSurface(460, -8), undefined);
  assert.equal(track.sampleSurface(track.landmarks.hollow.entry, 8), undefined);
  assert.equal(track.sampleSurface(track.jumps[0].takeoff, 0), undefined);
  for (const fraction of [0.2, 0.5, 0.8])
    for (const lateral of [-8, 0, 8]) {
      const distance = roll.start + (roll.end - roll.start) * fraction;
      const lane = track.sampleSurface(distance, lateral);
      const point = (s) => {
        const frame = track.sample(s);
        return frame.position.addScaledVector(frame.right, lateral);
      };
      assert.ok(lane.position.distanceTo(point(distance)) < 1e-8);
      // Independently compare the reported metric against a shorter physical
      // chord, so native motion and AI guidance use actual lane metres.
      const chord = point(distance + 0.05).sub(point(distance - 0.05));
      assert.ok(
        Math.abs(chord.dot(lane.tangent) / 0.1 - lane.longitudinalMetric) <
          0.002,
      );
      assert.ok(Math.abs(lane.tangent.dot(lane.right)) < 1e-10);
      assert.ok(Math.abs(lane.up.length() - 1) < 1e-10);
      assert.ok(Number.isFinite(lane.curvature));
      const nextLap = track.sampleSurface(distance + track.length, lateral);
      assert.ok(nextLap.position.distanceTo(lane.position) < 1e-8);
      assert.ok(nextLap.up.distanceTo(lane.up) < 1e-8);
    }
});

test('Bloomspan lane guidance restores independently of surface memo history', () => {
  const track = createVesperTrack();
  const roll = track.inversions[0];
  const runtime = createVesperRuntime({ track, presentation: false });
  const state = {
    ...createVehicleState(),
    distance: (roll.start + roll.end) / 2,
    lateral: 8,
    speed: 112,
  };
  const input = { throttle: 1, steer: 0.05, boost: false };
  runtime.reset({ state, seed: 7 });
  const trace = (motion, vehicle, ticks) =>
    Array.from({ length: ticks }, () => ({
      events: motion.advance(vehicle, input, 1 / 120),
      state: { ...vehicle },
      motion: motion.snapshot(),
    }));
  try {
    trace(runtime, state, 16);
    const savedState = { ...state };
    const savedMotion = structuredClone(runtime.snapshot());
    const expected = trace(runtime, state, 48);
    const otherTrack = createVesperTrack();
    for (let i = 0; i < 1200; i++)
      otherTrack.sampleSurface(roll.start + 2 + (i % 1100) / 3, -8);
    const restored = createVesperRuntime({
      track: otherTrack,
      presentation: false,
    });
    try {
      restored.reset({ state: savedState, seed: 7 });
      restored.restore(savedMotion);
      assert.deepEqual(trace(restored, savedState, 48), expected);
    } finally {
      restored.dispose();
    }
  } finally {
    runtime.dispose();
  }
});

test('Forest coast, hollow and crown-flight simulations retain their deterministic behavior', () => {
  const track = createVesperTrack();
  for (const [initial, expected] of [
    [
      { distance: 460, speed: 80 },
      '8a37f7578108d06db4cc7be692da2389184ecd0a67c24d2799320679e71e51a1',
    ],
    [
      { distance: track.landmarks.hollow.entry, speed: 60 },
      '4fde84a444c57b74fd89165d3fc7b3b76f601ae0b52b3866b59e2210803107a0',
    ],
    [
      { distance: track.jumps[0].takeoff - 0.1, speed: 112 },
      '05185495167e00da9dc61f80213657267e872c5e17ba949d7b62551d057e3ddb',
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

test('Forest road geometry, materials and guidance retain the authored mesh contract', () => {
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
    assert.equal(meshes.length, 100);
    assert.ok(meshes.some((mesh) => mesh.userData.drivingSurface));
    assert.ok(
      meshes.some(
        (mesh) => mesh.name === 'Advance jump lane and landing guidance',
      ),
    );
    assert.equal(
      fingerprint(meshes),
      // This revision includes two gaps, fine roll cells and visible sap films.
      '62e0482deded1cd4488dd3ef1722ab9ad5b36f4e51994c4913061b2836f199b6',
    );
  } finally {
    road.dispose();
  }
});

test('Forest collision keeps every authored deck, rail and structural triangle', () => {
  const collision = createVesperCollisionWorld({ track: createVesperTrack() });
  try {
    // Exact running faces cover the whole supported route; scenery stays
    // limited to both launch/receiving neighbourhoods; raised decorative
    // reinforcement decals never create physical speed bumps.
    assert.equal(collision.targets.length, 24);
    assert.equal(collision.triangleCount, 185722);
    assert.equal(
      fingerprint({
        targets: collision.targets,
        triangles: collision.triangles,
      }),
      'cc5b35082ea567f5c61f9cd68f5ce9782b198b40dc6e2d534715ab977b0ac6dc',
    );
  } finally {
    collision.dispose();
  }
});
