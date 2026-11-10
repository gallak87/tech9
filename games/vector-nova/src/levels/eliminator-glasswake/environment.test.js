import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeEliminatorTrack } from './track/model.js';
import {
  createGlasswakePlacementPlan,
  createGlasswakeArchGeometry,
  COMET_FLOOR,
} from './scenery.js';

test('Fracture geology is founded and clears the complete supported racing/camera corridor', async () => {
  const scenes = await Promise.all(
    [
      'glasswake/glasswake-environment-v5.glb',
      'eliminator-glasswake/fault-massif.glb',
    ].map(async (file) => {
      const data = await fs.readFile(
        new URL(`../../../public/assets/levels/${file}`, import.meta.url),
      );
      return (
        await new GLTFLoader().parseAsync(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
          '',
        )
      ).scene;
    }),
  );
  const resources = new Set();
  try {
    for (const scene of scenes) scene.updateMatrixWorld(true);
    const templates = new Map(
      scenes
        .flatMap((scene) => scene.children)
        .map((root) => {
          const parts = [];
          root.traverse((object) => {
            if (!object.isMesh) return;
            const geometry = object.geometry
              .clone()
              .applyMatrix4(object.matrixWorld);
            resources.add(geometry);
            parts.push({ geometry });
          });
          return [
            root.name,
            { bounds: new T.Box3().setFromObject(root), parts },
          ];
        }),
    );
    const track = createGlasswakeEliminatorTrack();
    const plan = createGlasswakePlacementPlan(track, templates);
    assert.ok(plan.placements.length > 150);
    assert.equal(track.jumps.length, 0);
    assert.ok(
      plan.placements.every(
        (placement) => !/^calving_|^cavity_/.test(placement.prototype),
      ),
      'the thin shelf cage is replaced by closed, founded fault sectors',
    );
    assert.equal(plan.massif.stations.length, 3);
    assert.ok(
      plan.placements.some(
        (placement) =>
          placement.prototype === 'fracture_massif' &&
          placement.kind === 'massif',
      ),
    );
    for (const placement of plan.placements) {
      assert.ok(placement.matrix.elements.every(Number.isFinite));
      if (placement.kind === 'scenery') assert.ok(plan.clear(placement.bounds));
      if (placement.kind === 'foundation')
        assert.ok(Math.abs(placement.bounds.max.y - COMET_FLOOR) < 0.01);
      if (placement.prototype === 'cave_pier') {
        assert.ok(Math.abs(placement.bounds.min.y - COMET_FLOOR + 25) < 0.01);
        assert.ok(
          placement.bounds.max.y <
            track.sample(placement.distance).position.y - 38,
        );
      }
    }
    const prototype = scenes[0].getObjectByName('bridge_arch');
    const sourceGeometry = [];
    prototype.traverse((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      resources.add(geometry);
      sourceGeometry.push(geometry);
    });
    for (const placement of plan.placements.filter(
      (item) => item.prototype === 'bridge_arch',
    )) {
      for (const source of sourceGeometry) {
        const geometry = createGlasswakeArchGeometry(
          track,
          source,
          placement.distance,
        );
        try {
          const positions = geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const point = new T.Vector3().fromBufferAttribute(positions, i);
            const running = track.sample(
              placement.distance + source.attributes.position.getZ(i) * 1.65,
            );
            assert.ok(
              point.sub(running.position).dot(running.up) < -0.4,
              'bridge arch must remain below the driving skin',
            );
          }
        } finally {
          geometry.dispose();
        }
      }
    }
  } finally {
    for (const scene of scenes)
      scene.traverse((object) => {
        if (object.geometry) resources.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean))
          resources.add(material);
      });
    for (const resource of resources) resource.dispose();
    for (const scene of scenes) scene.clear();
  }
});
