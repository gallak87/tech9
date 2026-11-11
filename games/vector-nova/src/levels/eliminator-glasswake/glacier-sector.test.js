import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeEliminatorTrack } from './track/model.js';
import { createGlasswakePlacementPlan, COMET_FLOOR } from './scenery.js';

async function load(file) {
  const data = await fs.readFile(
    new URL(`../../../public/assets/levels/${file}`, import.meta.url),
  );
  return (
    await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      '',
    )
  ).scene;
}

function inside(group, point) {
  const directions = [
    new T.Vector3(0.823, 0.371, 0.431).normalize(),
    new T.Vector3(-0.217, 0.913, 0.345).normalize(),
  ];
  return directions.every((direction) => {
    const hits = new T.Raycaster(point, direction)
      .intersectObject(group, true)
      .filter(
        (hit, i, all) =>
          hit.distance > 1e-5 &&
          (!i || Math.abs(hit.distance - all[i - 1].distance) > 1e-5),
      );
    return hits.length % 2 === 1;
  });
}

test('the replacement crown sector preserves native placement, exact route clearance and founded exported feet', async () => {
  const scenes = await Promise.all([
    load('glasswake/glasswake-environment-v5.glb'),
    load('eliminator-glasswake/fault-massif.glb'),
    load('eliminator-glasswake/glacier-sector.glb'),
  ]);
  const geometries = new Set(),
    materials = new Set();
  try {
    const templates = new Map();
    for (const scene of scenes) {
      scene.updateMatrixWorld(true);
      for (const root of scene.children) {
        const parts = [],
          bounds = new T.Box3();
        root.traverse((object) => {
          assert.ok(
            !object.isCamera && !object.isLight && !/^GUIDE/i.test(object.name),
            'editor references must not ship',
          );
          if (!object.isMesh) return;
          geometries.add(object.geometry);
          for (const material of [object.material].flat()) {
            material.side = T.DoubleSide;
            materials.add(material);
          }
          const geometry = object.geometry
            .clone()
            .applyMatrix4(object.matrixWorld);
          assert.ok(
            geometry.attributes.position.array.every(Number.isFinite),
            'exported metre coordinates are finite',
          );
          geometries.add(geometry);
          geometry.computeBoundingBox();
          bounds.union(geometry.boundingBox);
          parts.push({ geometry, material: object.material });
        });
        templates.set(root.name, { parts, bounds });
      }
    }
    const source = scenes[2].getObjectByName('fracture_glacier_sector');
    assert.ok(source, 'promised native prototype exists');
    assert.deepEqual(
      source.matrixWorld.elements,
      new T.Matrix4().elements,
      'export is native metres under an identity root',
    );
    const track = createGlasswakeEliminatorTrack();
    const baselineTemplates = new Map(
      [...templates].filter(([name]) => name !== 'fracture_glacier_sector'),
    );
    const baseline = createGlasswakePlacementPlan(track, baselineTemplates);
    const plan = createGlasswakePlacementPlan(track, templates);
    assert.equal(
      plan.massif.stations[0].placement.prototype,
      'fracture_glacier_sector',
    );
    for (let i = 0; i < 3; i++) {
      assert.deepEqual(
        plan.massif.stations[i].placement.matrix.elements,
        baseline.massif.stations[i].placement.matrix.elements,
      );
      assert.deepEqual(
        plan.massif.stations[i].shoulder.matrix.elements,
        baseline.massif.stations[i].shoulder.matrix.elements,
      );
      if (i)
        assert.equal(
          plan.massif.stations[i].placement.prototype,
          'fracture_massif',
          'other original sectors are unchanged',
        );
    }
    const placement = plan.massif.stations[0].placement;
    const body = templates.get('fracture_glacier_sector');
    const worldParts = body.parts.map((part) => {
      const geometry = part.geometry.clone().applyMatrix4(placement.matrix);
      geometries.add(geometry);
      return geometry;
    });
    const box = new T.Box3(
      new T.Vector3(-42, -12, -16),
      new T.Vector3(42, 90, 16),
    );
    const triangle = new T.Triangle(),
      a = new T.Vector3(),
      b = new T.Vector3(),
      c = new T.Vector3();
    let volumes = 0,
      checked = 0;
    for (let s = 0; s < track.length; s += 12) {
      volumes++;
      const frame = track.sample(s),
        inverse = new T.Matrix4()
          .compose(frame.position, frame.quaternion, new T.Vector3(1, 1, 1))
          .invert();
      for (const geometry of worldParts) {
        const positions = geometry.attributes.position,
          index = geometry.index;
        for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
          a.fromBufferAttribute(
            positions,
            index ? index.getX(i) : i,
          ).applyMatrix4(inverse);
          b.fromBufferAttribute(
            positions,
            index ? index.getX(i + 1) : i + 1,
          ).applyMatrix4(inverse);
          c.fromBufferAttribute(
            positions,
            index ? index.getX(i + 2) : i + 2,
          ).applyMatrix4(inverse);
          assert.ok(
            !box.intersectsTriangle(triangle.set(a, b, c)),
            `new geology intersects actual banked corridor at ${s}m`,
          );
          checked++;
        }
      }
    }
    assert.equal(volumes, 409);
    assert.ok(
      checked > 1000000,
      'guard uses every actual exported triangle, not only the prototype bounds',
    );

    const terrain = plan.placements
      .filter((part) => part.kind === 'foundation')
      .map((part) => {
        const group = new T.Group();
        for (const piece of templates.get(part.prototype).parts)
          group.add(new T.Mesh(piece.geometry, piece.material));
        group.applyMatrix4(part.matrix);
        group.updateMatrixWorld(true);
        return { group, bounds: new T.Box3().setFromObject(group) };
      });
    const feet = new Map();
    for (const part of body.parts) {
      const positions = part.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const point = new T.Vector3().fromBufferAttribute(positions, i);
        if (Math.abs(point.y) < 0.001)
          feet.set(
            point
              .toArray()
              .map((n) => n.toFixed(4))
              .join(','),
            point,
          );
      }
    }
    assert.ok(feet.size >= 4, 'actual closed bottom vertices exist');
    for (const native of feet.values()) {
      const point = native.clone().applyMatrix4(placement.matrix);
      assert.ok(
        point.y < COMET_FLOOR - 10,
        'complete foot is below the connected basal cap',
      );
      assert.ok(
        terrain.some(
          (part) =>
            part.bounds.containsPoint(point) && inside(part.group, point),
        ),
        'every actual exported foot vertex is inside closed placed geology',
      );
    }
  } finally {
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const scene of scenes) scene.clear();
  }
});
