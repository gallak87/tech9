import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Raycaster } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLifetime } from '../../core/lifecycle.js';
import { createOrielTrack } from './track/model.js';
import { createGardenQuarter } from './environment/garden-quarter.js';
import {
  createShoreQuarter,
  getShoreQuarterReservation,
} from './environment/shore-quarter.js';
import { createPromenadeTerraces } from './environment/promenades.js';
import garden from '../../../assets/levels/oriel/blender/garden-quarter/manifest.json' with { type: 'json' };
import shore from '../../../assets/levels/oriel/blender/shore-quarter/manifest.json' with { type: 'json' };

const source = (name) => new URL(`../../../${name}`, import.meta.url);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function watchResources(scene) {
  const resources = new Map();
  scene.traverse((object) => {
    if (!object.isMesh) return;
    for (const resource of [object.geometry, ...[].concat(object.material)]) {
      if (resources.has(resource)) continue;
      resources.set(resource, 0);
      resource.addEventListener('dispose', () =>
        resources.set(resource, resources.get(resource) + 1),
      );
    }
  });
  return resources;
}

for (const [name, manifest, createQuarter, folder] of [
  ['garden', garden, createGardenQuarter, 'garden-quarter'],
  ['shore', shore, createShoreQuarter, 'shore-quarter'],
]) {
  const bytes = await readFile(source(manifest.export.path));
  const parse = () =>
    new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
  test(`Oriel ${name} quarter matches its editable route, terrain and exported asset`, async () => {
    assert.equal(manifest.geometryVersion, createOrielTrack().geometryVersion);
    assert.equal(hash(bytes), manifest.export.sha256);
    const guides = await readFile(
      source(`assets/levels/oriel/blender/${folder}/road-guides.json`),
    );
    assert.equal(hash(guides), manifest.roadGuidesSHA256);
    const terrain = await readFile(
      source('assets/levels/oriel/blender/ground/height-field.json'),
    );
    assert.equal(hash(terrain), manifest.terrainSHA256);
  });
  test(`Oriel ${name} quarter leaves shoulders and chase envelope open, and releases each asset once`, async () => {
    const track = createOrielTrack(),
      lifetime = createLifetime();
    let watched;
    const quarter = await createQuarter({
      track,
      lifetime,
      loadAsset: async () => {
        const asset = await parse();
        watched = watchResources(asset.scene);
        return asset;
      },
    });
    try {
      assert.ok(quarter.plantingAnchors.length > 20);
      quarter.group.updateMatrixWorld(true);
      const ray = new Raycaster();
      ray.near = 0;
      ray.far = 7.5;
      for (
        let s = manifest.reservation.start - 50;
        s <= manifest.reservation.end + 60;
        s += 8
      ) {
        const frame = track.sample(s);
        for (const side of [-1, 1])
          for (const height of [0, 7, 15]) {
            const position = frame.position
              .clone()
              .addScaledVector(frame.right, side * 24)
              .addScaledVector(frame.up, height);
            ray.set(position, frame.right.clone().multiplyScalar(side));
            assert.equal(
              ray.intersectObject(quarter.group, true).length,
              0,
              `quarter encroaches on shoulder/camera at ${s}, ${side}, ${height}`,
            );
          }
      }
      for (const anchor of quarter.plantingAnchors) {
        assert.ok(anchor.position.toArray().every(Number.isFinite));
        assert.ok(Math.abs(anchor.quaternion.length() - 1) < 1e-6);
      }
      const frame = track.sample(
        (manifest.reservation.start + manifest.reservation.end) / 2,
      );
      assert.equal(quarter.reservation.contains(frame.position), false);
      assert.equal(
        quarter.reservation.contains(
          frame.position
            .clone()
            .addScaledVector(frame.right, manifest.reservation.side * 80)
            .addScaledVector(frame.up, 2000),
        ),
        false,
        'local reservation must preserve the overhead city',
      );
    } finally {
      quarter.dispose();
      quarter.dispose();
      lifetime.dispose();
    }
    assert.ok([...watched.values()].every((count) => count === 1));
    assert.equal(quarter.group.children.length, 0);
  });
  test(`Oriel ${name} quarter releases every decoded resource if material integration fails`, async () => {
    const lifetime = createLifetime();
    let watched;
    await assert.rejects(
      createQuarter({
        track: createOrielTrack(),
        lifetime,
        loadAsset: async () => {
          const asset = await parse();
          watched = watchResources(asset.scene);
          return asset;
        },
        stoneMaps: {
          apply() {
            throw new Error('finish unavailable');
          },
        },
      }),
      /finish unavailable/,
    );
    lifetime.dispose();
    assert.ok([...watched.values()].every((count) => count === 1));
  });
}

test('Oriel sunken shore court replaces the raised shelf while preserving its opposite promenade', () => {
  const track = createOrielTrack(),
    lifetime = createLifetime();
  const reservation = getShoreQuarterReservation(track);
  const promenade = createPromenadeTerraces(
    track,
    (resource) => lifetime.own(resource),
    null,
    { reservations: [reservation] },
  );
  let opposite = 0;
  try {
    promenade.group.traverse((mesh) => {
      const coordinates = mesh.geometry?.attributes.roadCoord;
      if (!coordinates) return;
      for (let i = 0; i < coordinates.count; i++) {
        const s = coordinates.getX(i),
          lateral = coordinates.getY(i);
        if (s <= reservation.start + 1 || s >= reservation.end - 1) continue;
        assert.ok(
          lateral <= 0,
          'old positive-side shelf must not bury the sunken court',
        );
        if (lateral < -32) opposite++;
      }
    });
    assert.ok(opposite > 100, 'opposite promenade stays built');
  } finally {
    lifetime.dispose();
  }
});
