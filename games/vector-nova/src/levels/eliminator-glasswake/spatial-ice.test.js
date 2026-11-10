import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { consolidateIceParts } from '../glasswake/environment/consolidate.js';
import { createGlasswakeEliminatorTrack } from './track/model.js';
import {
  createGlasswakePlacementPlan,
  createGlasswakeArchGeometry,
} from './scenery.js';
import { createFractureSpatialIce } from './spatial-ice.js';

test('spatial ice retains actual source geometry, fitted arch data and every matrix with independent ownership', async () => {
  const scenes = await Promise.all(
    [
      'glasswake/glasswake-environment-v5.glb',
      'eliminator-glasswake/fault-massif.glb',
    ].map(async (file) => {
      const bytes = await fs.readFile(
        new URL(`../../../public/assets/levels/${file}`, import.meta.url),
      );
      return (
        await new GLTFLoader().parseAsync(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
          '',
        )
      ).scene;
    }),
  );
  const geometries = new Set(),
    materials = new Set();
  let spatial;
  try {
    for (const scene of scenes) scene.updateMatrixWorld(true);
    const composite = new T.MeshStandardMaterial({
      name: 'Spatial ice composite fixture',
      vertexColors: true,
    });
    materials.add(composite);
    const templates = new Map(
      scenes
        .flatMap((scene) => scene.children)
        .map((root) => {
          const parts = [],
            bounds = new T.Box3();
          root.traverse((object) => {
            if (!object.isMesh) return;
            geometries.add(object.geometry);
            for (const material of [object.material].flat())
              materials.add(material);
            const geometry = object.geometry
              .clone()
              .applyMatrix4(object.matrixWorld);
            geometries.add(geometry);
            geometry.computeBoundingBox();
            bounds.union(geometry.boundingBox);
            parts.push({ geometry, material: object.material });
          });
          const consolidated = consolidateIceParts(parts, composite);
          if (consolidated.geometry) geometries.add(consolidated.geometry);
          return [root.name, { parts: consolidated.parts, bounds }];
        }),
    );
    const track = createGlasswakeEliminatorTrack(),
      placements = createGlasswakePlacementPlan(track, templates).placements;
    const archPieces = [];
    for (const placement of placements.filter(
      (part) => part.prototype === 'bridge_arch',
    ))
      for (const part of templates.get('bridge_arch').parts) {
        const geometry = createGlasswakeArchGeometry(
          track,
          part.geometry,
          placement.distance,
        );
        geometries.add(geometry);
        archPieces.push({ geometry, material: part.material });
      }
    const borrowedDisposals = new Map();
    for (const resource of [...geometries, ...materials]) {
      borrowedDisposals.set(resource, 0);
      resource.addEventListener('dispose', () =>
        borrowedDisposals.set(resource, borrowedDisposals.get(resource) + 1),
      );
    }
    spatial = createFractureSpatialIce(placements, templates, archPieces);
    const report = spatial.report;
    assert.ok(
      report.cells.length > 4,
      'the world has several bounded XZ draw cells',
    );
    assert.equal(
      report.skippedArches,
      placements.filter((part) => part.prototype === 'bridge_arch').length,
    );
    const expectedInstances = placements.reduce(
      (sum, placement) =>
        sum +
        (placement.prototype === 'bridge_arch'
          ? 0
          : templates.get(placement.prototype).parts.length),
      0,
    );
    assert.equal(report.instances, expectedInstances);
    assert.equal(report.instanceBindings.length, expectedInstances);
    assert.equal(report.archBindings.length, archPieces.length);
    const expectedCells = new Set();
    for (const binding of report.instanceBindings) {
      const placement = placements[binding.placementIndex],
        part = templates.get(placement.prototype).parts[binding.partIndex];
      const mesh = spatial.meshes[binding.meshIndex],
        matrix = new T.Matrix4();
      mesh.getMatrixAt(binding.instanceId, matrix);
      assert.deepEqual(
        matrix.elements,
        placement.matrix.elements.map(Math.fround),
      );
      assert.equal(
        mesh.geometry,
        part.geometry,
        'every source vertex/normal/colour/role attribute stays identical and borrowed',
      );
      assert.equal(mesh.material, part.material);
      assert.equal(mesh.castShadow, Boolean(placement.castShadow));
      assert.equal(mesh.receiveShadow, true);
      assert.equal(mesh.frustumCulled, true);
      assert.ok(mesh.boundingSphere?.radius > 0);
      const origin = new T.Vector3().setFromMatrixPosition(placement.matrix);
      const cell = `${Math.floor(origin.x / 400)},${Math.floor(origin.z / 400)}`;
      assert.equal(binding.cell, cell);
      expectedCells.add(cell);
      const sample = new T.Vector3()
        .fromBufferAttribute(part.geometry.attributes.position, 0)
        .applyMatrix4(matrix);
      assert.ok(
        mesh.boundingBox.clone().expandByScalar(0.00001).containsPoint(sample),
        'cell bounds include actual placed geometry, not only its origin',
      );
    }
    for (const binding of report.archBindings) {
      const piece = archPieces[binding.pieceIndex],
        mesh = spatial.meshes[binding.meshIndex];
      assert.equal(mesh.material, piece.material);
      assert.notEqual(
        mesh.geometry,
        piece.geometry,
        'only arch merge output is owned',
      );
      assert.equal(mesh.castShadow, false);
      assert.equal(mesh.receiveShadow, true);
      const bounds = new T.Box3().setFromBufferAttribute(
          piece.geometry.attributes.position,
        ),
        centre = bounds.getCenter(new T.Vector3());
      const cell = `${Math.floor(centre.x / 400)},${Math.floor(centre.z / 400)}`;
      assert.equal(binding.cell, cell);
      expectedCells.add(cell);
      for (const [name, source] of Object.entries(piece.geometry.attributes)) {
        const merged = mesh.geometry.getAttribute(name);
        assert.ok(merged, `fitted arch ${name} is retained`);
        assert.equal(merged.itemSize, source.itemSize);
        assert.equal(merged.normalized, source.normalized);
        for (let vertex = 0; vertex < source.count; vertex++)
          for (let component = 0; component < source.itemSize; component++)
            assert.equal(
              merged.getComponent(binding.vertexStart + vertex, component),
              source.getComponent(vertex, component),
              `fitted ${name} remains exact`,
            );
      }
      if (piece.geometry.index)
        for (let i = 0; i < piece.geometry.index.count; i++)
          assert.equal(
            mesh.geometry.index.getX(binding.indexStart + i) -
              binding.vertexStart,
            piece.geometry.index.getX(i),
          );
      else assert.equal(mesh.geometry.index, null);
      assert.ok(
        mesh.geometry.boundingBox
          .clone()
          .expandByScalar(0.00001)
          .containsBox(bounds),
      );
    }
    assert.deepEqual(
      new Set(report.cells.map((cell) => cell.key)),
      expectedCells,
      'every actual source cell is represented',
    );
    for (const count of borrowedDisposals.values()) assert.equal(count, 0);
    const ownedDisposals = new Map();
    for (const mesh of spatial.meshes) {
      const resource = mesh.isInstancedMesh ? mesh : mesh.geometry;
      ownedDisposals.set(resource, 0);
      resource.addEventListener('dispose', () =>
        ownedDisposals.set(resource, ownedDisposals.get(resource) + 1),
      );
    }
    spatial.dispose();
    spatial.dispose();
    for (const count of ownedDisposals.values())
      assert.equal(
        count,
        1,
        'only owned instance/merge resources dispose, exactly once',
      );
    for (const count of borrowedDisposals.values())
      assert.equal(
        count,
        0,
        'sources remain alive after repeated owner disposal',
      );
  } finally {
    spatial?.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const scene of scenes) scene.clear();
  }
});
