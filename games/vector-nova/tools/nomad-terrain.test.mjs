import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import createLevel from '../src/levels/nomad/index.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import {
  createNomadTerrain,
  createNomadTerrainPlacements,
  createNomadTerrainTriangles,
  NOMAD_TERRAIN_GEOMETRY_VERSION,
} from '../src/levels/nomad/terrain.js';
import {
  NOMAD_GROUND_GROUP,
  sampleNomadGroundMotion,
} from '../src/levels/nomad/ground-motion.js';
import manifest from '../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-provenance.json' with { type: 'json' };
import collision from '../assets/levels/nomad/blender/salt-escarpments/salt-escarpments-collision.json' with { type: 'json' };

const game = new URL('..', import.meta.url).pathname;
const folder = resolve(game, 'assets/levels/nomad/blender/salt-escarpments');
const runtimePath = resolve(game, manifest.runtimeAsset);
async function loadAsset() {
  const bytes = await readFile(runtimePath);
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}

function pointIndex() {
  const cells = new Map(),
    points = [],
    tolerance = 0.00025;
  return (point) => {
    const cell = point.toArray().map((value) => Math.floor(value / tolerance));
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          for (const index of cells.get(
            [cell[0] + x, cell[1] + y, cell[2] + z].join('/'),
          ) ?? [])
            if (points[index].distanceTo(point) < tolerance) return index;
    const index = points.length,
      key = cell.join('/');
    points.push(point.clone());
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
    return index;
  };
}

test('three retained salt forms have exact render/collision triangles and verified editable-source provenance', async () => {
  for (const [name, expected] of Object.entries(manifest.hashes)) {
    const path = name.endsWith('.glb') ? runtimePath : resolve(folder, name);
    assert.equal(
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
      expected,
      name,
    );
  }
  assert.equal(manifest.prototypes.length, 3);
  assert.ok(manifest.totalTriangles > 10000 && manifest.totalTriangles < 16000);
  const loaded = await loadAsset();
  loaded.scene.updateMatrixWorld(true);
  try {
    let mineralArea = 0,
      totalArea = 0;
    for (const prototype of collision.prototypes) {
      const root = loaded.scene.getObjectByName(prototype.name);
      assert.ok(root, prototype.name);
      const index = pointIndex();
      const triangles = new Map();
      for (let offset = 0; offset < prototype.indices.length; offset += 3) {
        const key = [0, 1, 2]
          .map((corner) =>
            index(
              new T.Vector3().fromArray(
                prototype.positions,
                prototype.indices[offset + corner] * 3,
              ),
            ),
          )
          .sort((a, b) => a - b)
          .join('/');
        triangles.set(key, (triangles.get(key) ?? 0) + 1);
      }
      let count = 0;
      const inverse = root.parent.matrixWorld.clone().invert();
      root.traverse((mesh) => {
        if (!mesh.isMesh) return;
        assert.equal(
          mesh.material.metalness,
          0,
          'the salt remains carbonate, without industrial metal response',
        );
        const matrix = inverse.clone().multiply(mesh.matrixWorld);
        const positions = mesh.geometry.attributes.position;
        const size = mesh.geometry.index?.count ?? positions.count;
        for (let offset = 0; offset < size; offset += 3) {
          const points = [0, 1, 2].map((corner) =>
            new T.Vector3()
              .fromBufferAttribute(
                positions,
                mesh.geometry.index?.getX(offset + corner) ?? offset + corner,
              )
              .applyMatrix4(matrix),
          );
          const key = points
            .map((point) => index(point))
            .sort((a, b) => a - b)
            .join('/');
          assert.ok(
            triangles.get(key) > 0,
            `${prototype.name}: every rendered triangle belongs to the retained native surface`,
          );
          triangles.set(key, triangles.get(key) - 1);
          const area = new T.Triangle(...points).getArea();
          totalArea += area;
          if (mesh.material.name.includes('mineral interbed'))
            mineralArea += area;
          count++;
        }
      });
      assert.equal(count, prototype.triangles);
      assert.ok([...triangles.values()].every((value) => value === 0));
    }
    assert.ok(
      mineralArea / totalArea > 0 && mineralArea / totalArea < 0.05,
      'mineral seams remain subordinate to white salt',
    );
  } finally {
    const geometries = new Set(),
      materials = new Set();
    loaded.scene.traverse((mesh) => {
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) materials.add(mesh.material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
});

test('live-grade bases and moving ground preserve full convoy, wide road and camera exclusions', () => {
  const definition = createLevel();
  for (const grade of [0.025, 0.09, 0.12]) {
    const track = definition.createTrack();
    track.saltPlane.grade = grade;
    const placements = createNomadTerrainPlacements({ track });
    const triangles = createNomadTerrainTriangles({ track });
    assert.equal(placements.length, 3);
    assert.equal(triangles.length, manifest.totalTriangles);
    assert.ok(
      triangles.every(
        (triangle) =>
          triangle.motionGroup === NOMAD_GROUND_GROUP &&
          triangle.kind === 'terrain',
      ),
    );
    const world = createCollisionWorld({
      id: 'nomad-salt-terrain-check',
      version: 1,
      geometryId: NOMAD_TERRAIN_GEOMETRY_VERSION,
      triangles,
    });
    try {
      for (const placement of placements) {
        const safe =
          placement.side < 0
            ? placement.bounds.max.x <= placement.exclusion.left + 1e-6
            : placement.bounds.min.x >= placement.exclusion.right - 1e-6;
        assert.ok(
          safe,
          'the entire form stays outboard of the complete swept convoy corridor',
        );
        const prototype = collision.prototypes.find(
          (part) => part.name === placement.prototype,
        );
        let bases = 0;
        for (let offset = 0; offset < prototype.positions.length; offset += 3) {
          if (prototype.positions[offset + 1] !== 0) continue;
          bases++;
          const point = new T.Vector3()
            .fromArray(prototype.positions, offset)
            .applyMatrix4(placement.matrix);
          for (const time of [0, 45, 130]) {
            const moving = point
              .clone()
              .add(sampleNomadGroundMotion(track, time).translation);
            assert.ok(
              Math.abs(moving.y + grade * moving.z - track.saltPlane.height) <
                1e-8,
              `grade${grade}: actual flat base stays seated throughout ground travel`,
            );
          }
        }
        assert.ok(
          bases > 500,
          'the terrain has a real continuous closed ground face',
        );
      }
      for (const time of [0, 45, 130]) {
        const motion = sampleNomadGroundMotion(track, time).translation;
        for (let distance = 0; distance < track.length - 32; distance += 32) {
          const a = track.frameAtTime(distance, time),
            b = track.frameAtTime(distance + 32, time);
          a.position.sub(motion);
          b.position.sub(motion);
          assert.equal(
            world.sweepHull(a, b, {
              halfWidth:
                Math.max(
                  track.halfWidthAt(distance),
                  track.halfWidthAt(distance + 32),
                ) + 25,
              halfLength: 25,
              hover: 25,
            }),
            null,
            'actual terrain faces clear the full road and moving 25m camera corridor',
          );
        }
      }
    } finally {
      world.dispose();
    }
  }
});

test('normal and shape terrain share real forms and release owned GLB resources once through pause, cancellation and failure', async () => {
  const track = createLevel().createTrack();
  for (const shape of [false, true]) {
    const loaded = await loadAsset(),
      released = new Map(),
      resources = new Set();
    loaded.scene.traverse((mesh) => {
      if (mesh.geometry) resources.add(mesh.geometry);
      if (mesh.material) resources.add(mesh.material);
    });
    for (const resource of resources)
      resource.addEventListener('dispose', () =>
        released.set(resource, (released.get(resource) ?? 0) + 1),
      );
    const terrain = createNomadTerrain({
      track,
      shape,
      loadAsset: async () => loaded,
    });
    await terrain.ready;
    assert.equal(terrain.group.children.length, 3);
    for (const time of [0, 22, 22, 91]) {
      track.presentationTime = time;
      terrain.update();
      assert.ok(
        terrain.group.position.equals(
          sampleNomadGroundMotion(track, time).translation,
        ),
      );
    }
    terrain.dispose();
    terrain.dispose();
    terrain.update();
    assert.equal(terrain.group.children.length, 0);
    assert.equal(released.size, resources.size);
    assert.ok([...released.values()].every((count) => count === 1));
  }
  const late = await loadAsset();
  let resolveLoad;
  const pending = new Promise((resolve) => {
    resolveLoad = resolve;
  });
  const terrain = createNomadTerrain({ track, loadAsset: () => pending });
  terrain.dispose();
  resolveLoad(late);
  await terrain.ready;
  assert.equal(terrain.group.children.length, 0);
  const failed = createNomadTerrain({
    track,
    loadAsset: async () => {
      throw new Error('fixture interrupted');
    },
  });
  await assert.rejects(failed.ready, /salt escarpments could not load/);
  failed.dispose();
  failed.dispose();
});
