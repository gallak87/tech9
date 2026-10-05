import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCindercoilTrack } from '../src/levels/cindercoil/track/model.js';
import { createRouteClearance } from '../src/environment/placement.js';
import { createCindercoilEnvironment } from '../src/levels/cindercoil/environment/index.js';
import { createCindercoilBackdrop } from '../src/levels/cindercoil/backdrop/index.js';

const track = createCindercoilTrack();
async function loadAsset() {
  const bytes = await readFile(
    new URL(
      '../public/assets/levels/cindercoil/cindercoil-hero-kit-v7.glb',
      import.meta.url,
    ),
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}

test('Cindercoil hero kit loads, updates deterministically and disposes owned resources once', async () => {
  const world = createCindercoilEnvironment({ track, loadAsset });
  await world.ready;
  const metrics = world.group.userData.metrics;
  assert.ok(metrics.meshCount < 100, JSON.stringify(metrics));
  assert.ok(metrics.triangleCount < 750000, JSON.stringify(metrics));
  assert.equal(metrics.crustRafts, 96);
  assert.ok(metrics.basaltClusters > 80);
  const camera = new T.PerspectiveCamera();
  camera.position.set(...track.landmarks.basin.center);
  camera.position.y = 140;
  const pose = () => {
    const values = [];
    world.group.traverse((node) => {
      values.push(...node.position.toArray(), ...node.scale.toArray());
      if (node.isInstancedMesh) values.push(...node.instanceMatrix.array);
    });
    return values;
  };
  world.update({ time: 9, camera, settings: { quality: 'high' } });
  const first = pose();
  world.update({ time: 16, camera, settings: { quality: 'low' } });
  world.update({ time: 9, camera, settings: { quality: 'high' } });
  assert.deepEqual(
    pose(),
    first,
    'replayed simulation time reproduces all transforms',
  );
  world.update({
    time: 3.4,
    camera,
    settings: { quality: 'low', reducedMotion: true },
  });
  assert.equal(world.group.userData.presentation.vent, 1);
  assert.ok(
    world.group.getObjectByName('Cindercoil / active vent molten tongues').scale
      .y > 0.99,
  );
  const resources = new Set();
  world.group.traverse((node) => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of [node.material].flat().filter(Boolean))
      resources.add(material);
  });
  const disposals = new Map();
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      disposals.set(resource, (disposals.get(resource) ?? 0) + 1),
    );
  world.dispose();
  world.dispose();
  for (const resource of resources) assert.equal(disposals.get(resource), 1);
  assert.equal(world.group.children.length, 0);
});

test('Cindercoil hero and ordinary rock masses clear rolled road and camera envelopes', async () => {
  const world = createCindercoilEnvironment({ track, loadAsset });
  await world.ready;
  world.update({ time: 9 });
  world.group.updateMatrixWorld(true);
  const clearance = createRouteClearance(track, {
    spacing: 6,
    sidePadding: 12,
    localVertical: [-18, 28],
  });
  const collisions = [];
  for (const node of world.group.children) {
    if (node.name !== 'broken_launch_pylon') continue;
    const box = new T.Box3().setFromObject(node);
    const size = box.getSize(new T.Vector3());
    const center = box.getCenter(new T.Vector3());
    if (
      !clearance.clears(
        center.x,
        center.z,
        size.x,
        size.z,
        box.max.y,
        0,
        box.min.y,
      )
    )
      collisions.push(node.name);
  }
  for (const p of world.group.userData.clearanceReport.placements) {
    if (
      !clearance.clears(
        p.position[0],
        p.position[2],
        p.width,
        p.width,
        p.top,
        0,
        p.bottom,
      )
    )
      collisions.push(`cluster ${p.s}`);
  }
  // A circular chimney is tested with its actual radial silhouette against a
  // sphere enclosing the complete rolled road/camera box at each sample.
  const tower = world.group.getObjectByName('hollow_tower');
  let radius = 0;
  const vertex = new T.Vector3();
  tower.traverse((node) => {
    if (!node.isMesh) return;
    const positions = node.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
      radius = Math.max(
        radius,
        Math.hypot(
          vertex.x - track.landmarks.coil.center[0],
          vertex.z - track.landmarks.coil.center[2],
        ),
      );
    }
  });
  assert.ok(radius <= track.landmarks.coil.towerRadius);
  const envelopeRadius = Math.hypot(track.width / 2 + 12, 23, 10);
  for (let s = 0; s < track.length; s += 6) {
    const frame = track.sample(s);
    const center = frame.position.clone().addScaledVector(frame.up, 5);
    const separation = Math.hypot(
      center.x - track.landmarks.coil.center[0],
      center.z - track.landmarks.coil.center[2],
    );
    assert.ok(separation > radius + envelopeRadius, `tower at ${s}m`);
  }
  assert.deepEqual(collisions, []);
  world.dispose();
});

test('Cindercoil loading rejection unwinds world and shape loads no asset', async () => {
  const rejected = createCindercoilEnvironment({
    track,
    loadAsset: async () => {
      throw new Error('asset unavailable');
    },
  });
  await assert.rejects(rejected.ready, /asset unavailable/);
  assert.equal(rejected.group.children.length, 0);
  rejected.dispose();
  const shape = createCindercoilEnvironment({
    track,
    shape: true,
    loadAsset: () => {
      throw new Error('shape requested production');
    },
  });
  assert.equal(shape.group.children.length, 1);
  shape.dispose();
  const backdrop = await createCindercoilBackdrop({ shape: true });
  backdrop.update({ time: 0, settings: {} });
  backdrop.dispose();
  backdrop.dispose();
});

test('Cindercoil selected sky is owned, camera-relative and released once', async () => {
  const texture = new T.Texture();
  let requested;
  const backdrop = await createCindercoilBackdrop({
    loadTexture: async (url) => {
      requested = url;
      return texture;
    },
  });
  assert.equal(requested, '/assets/levels/cindercoil/cindercoil-sky-v2.png');
  assert.equal(texture.colorSpace, T.SRGBColorSpace);
  assert.deepEqual(backdrop.ownedTextures, [texture]);
  const camera = new T.PerspectiveCamera();
  camera.position.set(20, 200, -400);
  backdrop.update({ camera, time: 10, settings: { reducedMotion: true } });
  assert.deepEqual(
    backdrop.group.position.toArray(),
    camera.position.toArray(),
  );
  let count = 0;
  texture.addEventListener('dispose', () => count++);
  backdrop.dispose();
  backdrop.dispose();
  assert.equal(count, 1);
  await assert.rejects(
    createCindercoilBackdrop({
      loadTexture: async () => {
        throw new Error('missing');
      },
    }),
    /ash sky could not load/,
  );
});

test('loaded basalt texture replaces the fallback and has one owner', async () => {
  const texture = new T.Texture();
  let textureDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++);
  const world = createCindercoilEnvironment({
    track,
    loadAsset,
    loadTexture: async (url) => {
      assert.equal(url, '/assets/levels/cindercoil/basalt-albedo-v1.png');
      return texture;
    },
  });
  await world.ready;
  assert.equal(world.group.userData.metrics.textures, 1);
  let users = 0;
  world.group.traverse((n) => {
    for (const m of [n.material].flat().filter(Boolean))
      if (m.map === texture) users++;
  });
  assert.ok(users > 5);
  world.dispose();
  world.dispose();
  assert.equal(textureDisposals, 1);
});

test('late texture failure after disposal does not release geometry or materials twice', async () => {
  let begin, reject;
  const began = new Promise((resolve) => (begin = resolve));
  const pending = new Promise((_, rejectLoad) => (reject = rejectLoad));
  const world = createCindercoilEnvironment({
    track,
    loadAsset,
    loadTexture: () => {
      begin();
      return pending;
    },
  });
  const failure = assert.rejects(world.ready, /basalt surface could not load/);
  await began;
  const releases = new Map();
  world.group.traverse((n) => {
    for (const resource of [n.geometry, ...[n.material].flat()].filter(
      Boolean,
    )) {
      if (releases.has(resource)) continue;
      releases.set(resource, 0);
      resource.addEventListener('dispose', () =>
        releases.set(resource, releases.get(resource) + 1),
      );
    }
  });
  world.dispose();
  reject(new Error('texture unavailable'));
  await failure;
  world.dispose();
  assert.equal(world.group.children.length, 0);
  for (const count of releases.values()) assert.equal(count, 1);
});

test('roadside spill crater exposes an open molten throat and an upward-facing rim', async () => {
  const world = createCindercoilEnvironment({ track, loadAsset });
  await world.ready;
  world.group.updateMatrixWorld(true);
  const crater = world.group.getObjectByName(
    'Cindercoil / hollow roadside spill crater',
  );
  assert.ok(crater);
  const down = new T.Vector3(0, -1, 0);
  const hitAt = (x) =>
    new T.Raycaster(
      crater.localToWorld(new T.Vector3(x, 30, 0)),
      down,
    ).intersectObject(crater, true);
  assert.ok(
    hitAt(0).some((hit) => /Lava/.test(hit.object.name)),
    'the open mouth exposes molten fill',
  );
  assert.ok(
    hitAt(9.3).some((hit) => /Scoria/.test(hit.object.name)),
    'the crater rim is visible from above',
  );
  world.dispose();
});
