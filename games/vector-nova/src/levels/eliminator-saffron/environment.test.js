import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronEliminatorTrack } from './track/model.js';
import {
  createOssuaryDunes,
  createOssuarySceneryPlan,
  createOssuaryPassageGeometry,
  OSSUARY_PASSAGES,
} from './scenery.js';

test('Ossuary dunes stay below both banked road edges and prop foundations are actually seated', async () => {
  const track = createSaffronEliminatorTrack(),
    dunes = createOssuaryDunes(track);
  const bytes = await fs.readFile(
    new URL(
      '../../../public/assets/levels/saffron/leviathan-kit.glb',
      import.meta.url,
    ),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  scene.updateMatrixWorld(true);
  const owned = new Set(),
    templates = new Map();
  for (const name of ['scapula', 'outcrop', 'outcrop_1']) {
    const root = scene.getObjectByName(name),
      inverse = root.matrixWorld.clone().invert(),
      parts = [],
      bounds = new T.Box3();
    root.traverse((object) => {
      if (!object.isMesh) return;
      const geometry = object.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      owned.add(geometry);
      geometry.computeBoundingBox();
      bounds.union(geometry.boundingBox);
      parts.push({ geometry });
    });
    templates.set(name, { parts, bounds });
  }
  try {
    for (let s = 0; s < track.length; s += 7)
      for (const lateral of [-24, 0, 24]) {
        const frame = track.sample(s),
          point = frame.position.clone().addScaledVector(frame.right, lateral);
        assert.ok(
          point.y - dunes.heightAt(point.x, point.z) > 27,
          `dune clearance at ${s}/${lateral}`,
        );
      }
    const plan = createOssuarySceneryPlan(track, templates, dunes);
    assert.ok(plan.placements.length >= 18);
    for (const placement of plan.placements) {
      assert.ok(
        plan.clear(placement.bounds),
        'outboard fossil clears the full pack/camera corridor',
      );
      const template = templates.get(placement.prototype);
      let feet = 0;
      for (const { geometry } of template.parts) {
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          if (positions.getY(i) > template.bounds.min.y + 6) continue;
          feet++;
          const point = new T.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(placement.matrix);
          assert.ok(
            dunes.heightAt(point.x, point.z) - point.y >= 11.999,
            'every actual low source perimeter embeds twelve metres in rendered dune triangles',
          );
        }
      }
      assert.ok(feet > 20);
    }
  } finally {
    scene.traverse((object) => {
      if (object.geometry) owned.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean))
        owned.add(material);
    });
    for (const resource of owned) resource.dispose();
    scene.clear();
    dunes.geometry.dispose();
  }
});

test('Actual fitted fossil passage triangles preserve the complete racing/camera envelope', async () => {
  const scenes = await Promise.all(
    ['saffron/leviathan-kit.glb', 'eliminator-saffron/cortical-web.glb'].map(
      async (file) => {
        const data = await fs.readFile(
          new URL(`../../../public/assets/levels/${file}`, import.meta.url),
        );
        return (
          await new GLTFLoader().parseAsync(
            data.buffer.slice(
              data.byteOffset,
              data.byteOffset + data.byteLength,
            ),
            '',
          )
        ).scene;
      },
    ),
  );
  const track = createSaffronEliminatorTrack(),
    owned = new Set(),
    dunes = createOssuaryDunes(track);
  owned.add(dunes.geometry);
  for (const scene of scenes) scene.updateMatrixWorld(true);
  try {
    for (const passage of OSSUARY_PASSAGES) {
      const root = scenes
        .map((scene) => scene.getObjectByName(passage.prototype))
        .find(Boolean);
      const inverse = root.matrixWorld.clone().invert();
      const box = new T.Box3(
        new T.Vector3(-29, 1, -8),
        new T.Vector3(29, 40, 8),
      );
      root.traverse((object) => {
        if (!object.isMesh) return;
        const local = object.geometry
          .clone()
          .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
        const geometry = createOssuaryPassageGeometry(
          track,
          local,
          passage.fraction * track.length,
          passage.scale,
          dunes,
        );
        owned.add(local);
        owned.add(geometry);
        const p = geometry.attributes.position,
          source = local.attributes.position,
          index = geometry.index;
        const triangle = new T.Triangle(),
          inverseFrame = new T.Matrix4();
        const vertex = (i) => (index ? index.getX(i) : i);
        for (let i = 0; i < (index?.count ?? p.count); i += 3) {
          const ids = [vertex(i), vertex(i + 1), vertex(i + 2)];
          const sourceZ =
            (ids.reduce((sum, id) => sum + source.getZ(id), 0) / 3) *
            passage.scale;
          const frame = track.sample(passage.fraction * track.length + sourceZ);
          inverseFrame
            .compose(frame.position, frame.quaternion, new T.Vector3(1, 1, 1))
            .invert();
          triangle.a.fromBufferAttribute(p, ids[0]).applyMatrix4(inverseFrame);
          triangle.b.fromBufferAttribute(p, ids[1]).applyMatrix4(inverseFrame);
          triangle.c.fromBufferAttribute(p, ids[2]).applyMatrix4(inverseFrame);
          assert.ok(
            !box.intersectsTriangle(triangle),
            `${passage.prototype} obstructs the placed forty-metre-high pack/camera envelope`,
          );
        }
      });
    }
  } finally {
    for (const scene of scenes)
      scene.traverse((object) => {
        if (object.geometry) owned.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean))
          owned.add(material);
      });
    for (const resource of owned) resource.dispose();
    for (const scene of scenes) scene.clear();
  }
});
