import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3, Matrix4, Texture, Vector3 } from 'three';
import { createBossTarget } from './boss-targets.js';
import { getBossHull, WRAITH_HULL, BULWARK_HULL } from './boss-hulls.js';
import { getCollisionHull } from './contact-hulls.js';
import { getCollisionHull as getFleetHull } from './collision-hulls.js';
import { GOLIATH_HULL } from './interceptor-target-hull.js';
import { SHIPS } from './catalog.js';
import { createTrack as createHalcyonTrack } from '../levels/halcyon/track/model.js';
import { createLevel2Track as createOrbitalTrack } from '../levels/orbital/track/model.js';

const cases = [
  ['wraith', WRAITH_HULL, [8, 3, 18], 2, createOrbitalTrack],
  ['bulwark', BULWARK_HULL, [12, 4, 20], 3, createHalcyonTrack],
];

for (const [id, hull, dimensions, outletCount, createTrack] of cases) {
  test(`${id} principal render forms match its frozen original contact hull and fit its inherited course`, () => {
    const target = createBossTarget(id, { quality: 'low' });
    try {
      assert.equal(target.specification.id, id);
      assert.equal(target.group.userData.blockout, false);
      assert.equal(target.group.userData.rivalId, id);
      assert.deepEqual(target.group.scale.toArray(), [1, 1, 1]);
      assert.equal(
        SHIPS.some((ship) => ship.id === id),
        false,
        'NPC bosses do not enlarge the playable fleet',
      );
      assert.equal(getBossHull(id), hull);
      assert.equal(getCollisionHull(id), hull);
      assert.equal(
        hull.hullSha256,
        createHash('sha256')
          .update(
            JSON.stringify({ vertices: hull.vertices, parts: hull.parts }),
          )
          .digest('hex'),
      );
      assert.ok(
        Object.isFrozen(hull) &&
          Object.isFrozen(hull.vertices) &&
          Object.isFrozen(hull.parts),
      );
      const body = target.group.getObjectByName(
        `${target.specification.name} / authored chassis`,
      );
      const bounds = new Box3().setFromObject(body),
        size = bounds.getSize(new Vector3());
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(
          Math.abs(bounds.min.getComponent(axis) - hull.bounds.min[axis]) <
            1e-6,
        );
        assert.ok(
          Math.abs(bounds.max.getComponent(axis) - hull.bounds.max[axis]) <
            1e-6,
        );
        assert.ok(Math.abs(size.getComponent(axis) - dimensions[axis]) < 1e-6);
      }
      assert.ok(
        Math.hypot(size.x, size.z) / 2 + 1 < createTrack().width / 2,
        'even the worst yawed diagonal retains road clearance',
      );
      for (const part of hull.parts) {
        assert.ok(Object.isFrozen(part.vertices));
        assert.ok(
          part.vertices.every(Number.isFinite) &&
            part.vertices.length % 3 === 0,
        );
        assert.ok(part.vertices.length >= 24);
        const mesh = body.children.find(
          (entry) => entry.userData.contactPart === part.id,
        );
        assert.ok(
          mesh?.isMesh,
          'every principal contact mass is a visible source-authored mass',
        );
        assert.equal(
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) % 3,
          0,
        );
      }
      let anchors = 0;
      target.group.traverse((object) => {
        if (/^Exhaust_[LRC]$/.test(object.name)) {
          anchors++;
          assert.equal(object.position.z, hull.bounds.min[2]);
        }
        if (!object.isMesh || object.parent.name === 'Rival / propulsion')
          return;
        const positions = object.geometry.attributes.position;
        const instances = object.isInstancedMesh ? object.count : 1;
        for (let instance = 0; instance < instances; instance++) {
          const transform = object.matrixWorld.clone();
          if (object.isInstancedMesh) {
            const local = new Matrix4();
            object.getMatrixAt(instance, local);
            transform.multiply(local);
          }
          for (let vertex = 0; vertex < positions.count; vertex++) {
            const point = new Vector3()
              .fromBufferAttribute(positions, vertex)
              .applyMatrix4(transform);
            for (let axis = 0; axis < 3; axis++)
              assert.ok(
                point.getComponent(axis) >= hull.bounds.min[axis] - 1e-6 &&
                  point.getComponent(axis) <= hull.bounds.max[axis] + 1e-6,
                'fitted outlets remain inside the measured contact envelope bounds',
              );
          }
        }
      });
      assert.equal(anchors, outletCount);
    } finally {
      target.dispose();
    }
  });

  test(`${id} propulsion does not accumulate scale and all owned resources dispose exactly once`, () => {
    const target = createBossTarget(id, { quality: 'low' });
    const borrowed = new Texture(),
      resources = new Set(),
      counts = new Map();
    borrowed.addEventListener('dispose', () =>
      counts.set(borrowed, (counts.get(borrowed) ?? 0) + 1),
    );
    const collect = () =>
      target.group.traverse((object) => {
        for (const resource of [
          object.geometry,
          ...(Array.isArray(object.material)
            ? object.material
            : [object.material]),
        ]) {
          if (!resource || resources.has(resource)) continue;
          resources.add(resource);
          if (resource.isMaterial) {
            resource.envMap = borrowed;
            for (const value of Object.values(resource)) {
              if (
                !value?.isTexture ||
                value === borrowed ||
                resources.has(value)
              )
                continue;
              resources.add(value);
              value.addEventListener('dispose', () =>
                counts.set(value, (counts.get(value) ?? 0) + 1),
              );
            }
          }
          resource.addEventListener('dispose', () =>
            counts.set(resource, (counts.get(resource) ?? 0) + 1),
          );
        }
      });
    collect();
    const frame = {
      speed: 100,
      time: 1,
      energy: 1,
      quality: 'low',
      visible: true,
    };
    target.update(frame);
    const plume =
      target.group.getObjectByName('Rival / propulsion').children[0];
    const scale = plume.scale.toArray();
    target.update(frame);
    assert.deepEqual(plume.scale.toArray(), scale);
    target.update({ ...frame, quality: 'high' });
    collect();
    target.update({ ...frame, visible: false });
    collect();
    assert.equal(
      target.group.getObjectByName('Rival / propulsion').visible,
      false,
    );
    target.dispose();
    target.dispose();
    for (const resource of resources) assert.equal(counts.get(resource), 1);
    assert.equal(counts.has(borrowed), false);
    borrowed.dispose();
  });
}

test('new boss silhouettes are independent and the registry preserves Goliath and every fleet chassis', () => {
  assert.notDeepEqual(WRAITH_HULL.vertices, BULWARK_HULL.vertices);
  assert.ok(
    WRAITH_HULL.parts.filter((part) => /cutter/.test(part.id)).length === 2,
  );
  assert.ok(BULWARK_HULL.parts.some((part) => /shield-crown/.test(part.id)));
  assert.equal(getBossHull('goliath'), GOLIATH_HULL);
  assert.equal(getCollisionHull('goliath'), GOLIATH_HULL);
  for (const ship of SHIPS)
    assert.equal(getCollisionHull(ship.id), getFleetHull(ship.id));
  const original = createBossTarget('goliath', { quality: 'low' });
  assert.equal(original.specification.id, 'goliath');
  assert.equal(original.group.userData.source, 'source-authored-goliath-v2');
  original.dispose();
  assert.throws(() => getBossHull('unknown'), /Unknown boss chassis/);
  assert.throws(() => getCollisionHull('unknown'), /Unknown collision chassis/);
  assert.throws(() => createBossTarget('unknown'), /Unknown boss target/);
});

test('Bulwark formed engine skins stay watertight with consistent face winding after curved refinement', () => {
  // Nonconforming subdivisions previously opened hairline raster cracks across
  // the coated roof, despite valid normals and no duplicate/intersecting faces.
  for (const quality of ['high', 'low']) {
    const target = createBossTarget('bulwark', { quality });
    try {
      const skins = [];
      target.group.traverse((mesh) => {
        if (mesh.userData.closedFormedSkin) skins.push(mesh);
      });
      assert.ok(
        skins.length >= 3,
        'closed cowl skins retain their diagnostic identity',
      );
      for (const mesh of skins) {
        const geometry = mesh.geometry,
          p = geometry.attributes.position,
          n = geometry.attributes.normal;
        const index = geometry.index,
          count = index?.count ?? p.count;
        const edges = new Map(),
          points = [new Vector3(), new Vector3(), new Vector3()];
        const normals = new Vector3(),
          face = new Vector3(),
          side = new Vector3();
        const key = (vertex) =>
          [p.getX(vertex), p.getY(vertex), p.getZ(vertex)]
            .map((value) => Math.round(value * 100000))
            .join(',');
        for (let offset = 0; offset < count; offset += 3) {
          const vertices = [0, 1, 2].map((i) =>
            index ? index.getX(offset + i) : offset + i,
          );
          const keys = vertices.map(key);
          normals.set(0, 0, 0);
          vertices.forEach((vertex, i) => {
            points[i].fromBufferAttribute(p, vertex);
            normals.add(new Vector3().fromBufferAttribute(n, vertex));
          });
          face
            .subVectors(points[1], points[0])
            .cross(side.subVectors(points[2], points[0]));
          assert.ok(
            face.lengthSq() > 1e-16,
            `${mesh.name}: no collapsed triangles`,
          );
          assert.ok(
            face.dot(normals) > 0,
            `${mesh.name}: winding agrees with the visible surface`,
          );
          for (let i = 0; i < 3; i++) {
            const pair = [keys[i], keys[(i + 1) % 3]].sort().join('/');
            edges.set(pair, (edges.get(pair) ?? 0) + 1);
          }
        }
        for (const uses of edges.values())
          assert.equal(uses, 2, `${mesh.name}: no open or nonmanifold seams`);
      }
    } finally {
      target.dispose();
    }
  }
});
