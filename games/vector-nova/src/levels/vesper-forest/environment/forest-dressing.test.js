import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVesperEnvironment } from './index.js';
import { createVesperTrack } from '../track/model.js';
import { groundFrame } from '../../../environment/placement.js';
import {
  boughGeometry,
  createForestDressing,
  forestDressingRegions,
  surfaceAnchorNormal,
} from './forest-dressing.js';

function fixtures(track) {
  const scene = new T.Group(),
    library = new T.Group(),
    forestKit = new T.Group();
  const bark = new T.MeshStandardMaterial({ name: 'Test living bark' });
  const sourceGeometry = new T.BoxGeometry(28, 280, 28);
  for (const region of forestDressingRegions(track)) {
    for (let station = region.start; station <= region.end; station += 43) {
      const frame = groundFrame(track, station);
      for (const side of [-1, 1]) {
        const tree = new T.Mesh(sourceGeometry, bark);
        tree.name = `source-trunk-${region.id}-${Math.round(station)}-${side}`;
        tree.position
          .copy(frame.position)
          .addScaledVector(frame.right, side * 90);
        tree.position.y -= 80;
        scene.add(tree);
      }
    }
  }
  const leaf = new T.Group();
  leaf.name = 'connected_tree_lod_0';
  const leafGeometry = new T.SphereGeometry(8, 8, 4);
  leaf.add(
    new T.Mesh(
      leafGeometry,
      new T.MeshStandardMaterial({ name: 'Borrowed leaf' }),
    ),
  );
  library.add(leaf);
  const fern = new T.Group();
  fern.name = 'fern_a';
  const fernGeometry = new T.PlaneGeometry(0.7, 0.5);
  fern.add(
    new T.Mesh(
      fernGeometry,
      new T.MeshStandardMaterial({ name: 'ForestFern' }),
    ),
  );
  forestKit.add(fern);
  return {
    scene,
    library,
    forestKit,
    bark,
    sourceGeometry,
    leafGeometry,
    fernGeometry,
  };
}

test('bough surfaces have outward normals, stable metre UVs and finite tapered geometry', () => {
  const { geometry } = boughGeometry(
    [new T.Vector3(0, 0, 0), new T.Vector3(0, 10, 0), new T.Vector3(0, 20, 0)],
    [4, 3, 0.2],
    7,
  );
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal;
  for (let index = 0; index < positions.count; index++) {
    const p = new T.Vector3().fromBufferAttribute(positions, index).setY(0);
    const n = new T.Vector3().fromBufferAttribute(normals, index);
    assert.ok(p.dot(n) > 0, `outward surface normal ${index}`);
  }
  for (const attribute of Object.values(geometry.attributes))
    assert.ok([...attribute.array].every(Number.isFinite));
  assert.ok(geometry.attributes.uv.getY(positions.count - 1) > 2);
  geometry.dispose();
});

test('recipe uses actual source surfaces in all three track-visible districts, with bounded rendering batches', async () => {
  const track = createVesperTrack();
  const f = fixtures(track);
  const options = {
    track,
    library: f.library,
    barkMaterial: f.bark,
    attachmentScene: f.scene,
    forestKit: f.forestKit,
  };
  const a = await createForestDressing(options),
    b = await createForestDressing(options);
  try {
    assert.deepEqual(
      a.stats,
      b.stats,
      'same seed and surfaces reproduce the same assembly plan',
    );
    assert.equal(a.stats.regions[0].end - a.stats.regions[0].start, 220);
    assert.equal(a.stats.regions[2].start, track.jumps[0].landingEnd);
    assert.equal(a.stats.regions[2].end - a.stats.regions[2].start, 220);
    assert.ok(a.stats.addedDraws <= 12);
    for (const region of a.stats.regions) {
      assert.ok(
        region.assemblies >= 2,
        `${region.id} produces a substantial composition`,
      );
      assert.ok(region.foliageClusters >= region.assemblies);
      for (const anchor of region.anchorSources) {
        assert.ok(anchor.mesh.startsWith('source-trunk-'));
        assert.ok(
          anchor.station >= region.start && anchor.station <= region.end,
        );
        assert.ok(
          Math.abs(
            new T.Vector3(...anchor.position).distanceTo(
              new T.Vector3(...anchor.start),
            ) - 5,
          ) < 1e-6,
        );
      }
    }
    const camera = new T.PerspectiveCamera();
    camera.position.set(100000, 100000, 100000);
    a.configure({}, camera);
    assert.ok(a.group.children.every((region) => !region.visible));
  } finally {
    a.dispose();
    b.dispose();
  }
});

test('disposal releases owned assemblies while preserving borrowed kit, scene, materials and leaf textures', async () => {
  const track = createVesperTrack(),
    f = fixtures(track);
  const borrowed = [f.sourceGeometry, f.leafGeometry, f.fernGeometry, f.bark];
  let sourceDisposals = 0,
    ownedDisposals = 0;
  borrowed.forEach((resource) =>
    resource.addEventListener('dispose', () => sourceDisposals++),
  );
  const dressing = await createForestDressing({
    track,
    library: f.library,
    barkMaterial: f.bark,
    attachmentScene: f.scene,
    forestKit: f.forestKit,
  });
  dressing.group.traverse((object) => {
    if (object.isMesh && !object.isInstancedMesh)
      object.geometry.addEventListener('dispose', () => ownedDisposals++);
  });
  dressing.dispose();
  dressing.dispose();
  assert.equal(sourceDisposals, 0);
  assert.equal(ownedDisposals, 3);
  assert.equal(dressing.group.children.length, 0);
});

// Keep actual positions/meshes/material names; omit image decoding in this CPU test.
async function geometryAsset(url) {
  const bytes = await readFile(url);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const stripTextures = (object) => {
    for (const key of Object.keys(object)) {
      if (key.endsWith('Texture')) delete object[key];
      else if (object[key] && typeof object[key] === 'object')
        stripTextures(object[key]);
    }
  };
  json.materials.forEach(stripTextures);
  delete json.images;
  delete json.textures;
  const source = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(source.length / 4) * 4;
  const binaryChunk = bytes.subarray(20 + jsonLength);
  const result = new Uint8Array(20 + padded + binaryChunk.byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + padded);
  result.set(source, 20);
  result.set(binaryChunk, 20 + padded);
  return (await new GLTFLoader().parseAsync(result.buffer, '')).scene;
}

test('actual shipped Vesper geometry supports substantial approach and full post-landing reuse', async () => {
  const [library, forest, kit] = await Promise.all([
    geometryAsset(
      new URL(
        '../../../../public/assets/levels/vesper/vesper-canopy.glb',
        import.meta.url,
      ),
    ),
    geometryAsset(
      new URL(
        '../../../../public/assets/levels/vesper/vesper-connected-forest-v1.glb',
        import.meta.url,
      ),
    ),
    geometryAsset(
      new URL(
        '../../../../../../worldkit/modules/landscape/assets/runtime/forest-kit.glb',
        import.meta.url,
      ),
    ),
  ]);
  const track = createVesperTrack();
  const environment = createVesperEnvironment({
    track,
    loadAsset: async (url) => ({
      scene: url.includes('connected-forest') ? forest : library,
    }),
  });
  await environment.ready;
  const bark = new T.MeshStandardMaterial({ name: 'Test bark' });
  const dressing = await createForestDressing({
    track,
    library,
    barkMaterial: bark,
    attachmentScene: environment.group,
    hollow: environment.group.getObjectByName(
      'Vesper / colossal living hollow with route-cut entry and crown',
    ),
    forestKit: kit,
  });
  try {
    for (const region of dressing.stats.regions) {
      assert.ok(
        region.assemblies >= 4,
        `${region.id} must work with actual placed meshes`,
      );
      assert.ok(
        region.foliageClusters >= region.assemblies,
        `${region.id} has connected authored crowns`,
      );
      assert.ok(region.draws <= 4);
    }
    dressing.group.traverse((object) => {
      if (!object.geometry?.userData.branchCrown) return;
      object.geometry.computeBoundingBox();
      assert.ok(
        object.geometry.boundingBox.min.y >= -1e-4,
        'lower root flare has been removed from every crown prototype',
      );
    });
    const landing = dressing.stats.regions.find(
      (region) => region.id === 'landing',
    );
    const stations = landing.anchorSources.map((anchor) => anchor.station);
    assert.ok(
      Math.max(...stations) - Math.min(...stations) >= 150,
      'reuse spans the landing district',
    );
    assert.ok(landing.anchorSources.some((anchor) => anchor.side === -1));
    assert.ok(landing.anchorSources.some((anchor) => anchor.side === 1));
  } finally {
    dressing.dispose();
    environment.dispose();
    bark.dispose();
    const geometries = new Set(),
      materials = new Set();
    kit.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
});

test('surface anchors preserve perpendicular normals through nonuniform instance transforms', () => {
  const matrixWorld = new T.Matrix4().makeRotationY(0.7);
  const instance = new T.Matrix4().makeScale(3, 0.5, 1.4);
  const normal = surfaceAnchorNormal({
    face: { normal: new T.Vector3(1, 1, 0).normalize() },
    object: {
      matrixWorld,
      getMatrixAt(_id, matrix) {
        matrix.copy(instance);
      },
    },
    instanceId: 2,
  });
  const tangent = new T.Vector3(1, -1, 0).transformDirection(
    matrixWorld.clone().multiply(instance),
  );
  assert.ok(Math.abs(normal.dot(tangent)) < 1e-7);
  assert.ok(Math.abs(normal.length() - 1) < 1e-7);
});
