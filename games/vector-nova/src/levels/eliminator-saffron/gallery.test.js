import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronEliminatorTrack } from './track/model.js';
import { createOssuaryDunes, createOssuaryPassageGeometry } from './scenery.js';
import {
  createOssuaryGalleryPlan,
  createOssuaryGalleryScarpGeometry,
  createOssuaryGalleryShoulderGeometry,
  calculateOssuaryFootSeat,
  createOssuaryBuriedBeds,
} from './gallery.js';

test('Representative cortical gallery has real source depth, buried feet and a clear full-route race/camera envelope', async () => {
  const data = await fs.readFile(
    new URL(
      '../../../public/assets/levels/saffron/leviathan-kit.glb',
      import.meta.url,
    ),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    '',
  );
  scene.updateMatrixWorld(true);
  const owned = new Set(),
    templates = new Map();
  const track = createSaffronEliminatorTrack(),
    dunes = createOssuaryDunes(track);
  owned.add(dunes.geometry);
  try {
    for (const name of ['scapula', 'rib_1', 'rib_2', 'vertebra']) {
      const root = scene.getObjectByName(name),
        inverse = root.matrixWorld.clone().invert();
      const parts = [],
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
    const plan = createOssuaryGalleryPlan(track, templates, dunes),
      pieces = [];
    assert.ok(plan.end - plan.start >= 250 && plan.end - plan.start <= 350);
    assert.equal(new Set(plan.passages.map((p) => p.prototype)).size, 3);
    for (const passage of plan.passages)
      for (const part of templates.get(passage.prototype).parts) {
        const geometry = createOssuaryPassageGeometry(
          track,
          part.geometry,
          passage.fraction * track.length,
          passage.scale,
          dunes,
        );
        owned.add(geometry);
        pieces.push({ name: passage.prototype, geometry });
        assert.deepEqual(
          geometry.index?.array,
          part.geometry.index?.array,
          'original cortical connectivity survives fitting',
        );
        assert.deepEqual(
          geometry.attributes.color?.array,
          part.geometry.attributes.color?.array,
          'baked cortex/marrow colours survive fitting',
        );
      }
    let shoulderFeet = 0;
    for (const part of templates.get('scapula').parts) {
      const source = part.geometry.attributes.position,
        before = source.array.slice();
      const geometry = createOssuaryGalleryShoulderGeometry(
        track,
        part.geometry,
        dunes,
        plan.shoulder,
      );
      owned.add(geometry);
      pieces.push({ name: 'shoulder', geometry });
      for (let i = 0; i < source.count; i++)
        if (source.getY(i) <= 5) {
          shoulderFeet++;
          const point = new T.Vector3().fromBufferAttribute(
            geometry.attributes.position,
            i,
          );
          assert.ok(
            point.y <= dunes.heightAt(point.x, point.z) - 9.999,
            'each actual cortical foot contacts the rendered dune surface',
          );
        }
      assert.deepEqual(
        source.array,
        before,
        'canonical scapula remains unchanged',
      );
      assert.deepEqual(
        geometry.attributes.color?.array,
        part.geometry.attributes.color?.array,
      );
    }
    assert.ok(
      shoulderFeet > 50,
      'proof covers the full actual low cortical perimeter',
    );
    const scarpLocal = createOssuaryGalleryScarpGeometry(plan.sediment.family);
    const scarp = scarpLocal.clone().applyMatrix4(plan.sediment.matrix);
    owned.add(scarpLocal);
    owned.add(scarp);
    pieces.push({ name: 'sediment', geometry: scarp });
    let sedimentFeet = 0;
    for (let i = 0; i < scarpLocal.attributes.position.count; i++)
      if (scarpLocal.attributes.position.getY(i) <= -0.19) {
        sedimentFeet++;
        const point = new T.Vector3().fromBufferAttribute(
          scarp.attributes.position,
          i,
        );
        assert.ok(
          point.y <= dunes.heightAt(point.x, point.z) - 7.999,
          'every closed sediment foot is buried in real dunes',
        );
      }
    assert.equal(sedimentFeet, plan.sediment.footCount);
    assert.ok(sedimentFeet > 20);
    // Prove the new bone shoulder penetrates the actual closed sediment body,
    // not merely its bounding box. Deduplicate shared-edge ray intersections.
    const sedimentMaterial = new T.MeshBasicMaterial({ side: T.DoubleSide });
    owned.add(sedimentMaterial);
    const sedimentMesh = new T.Mesh(scarp, sedimentMaterial);
    sedimentMesh.updateMatrixWorld(true);
    const ray = new T.Raycaster(),
      rayDirection = new T.Vector3(0.007, 1, 0.013).normalize();
    let buriedCortex = 0;
    for (const piece of pieces.filter((piece) => piece.name === 'shoulder')) {
      const positions = piece.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const point = new T.Vector3().fromBufferAttribute(positions, i);
        if (!scarp.boundingBox.containsPoint(point)) continue;
        ray.set(point, rayDirection);
        const hits = ray.intersectObject(sedimentMesh),
          distances = [];
        for (const hit of hits)
          if (
            !distances.length ||
            Math.abs(hit.distance - distances.at(-1)) > 0.0001
          )
            distances.push(hit.distance);
        if (distances.length % 2) buriedCortex++;
      }
    }
    assert.ok(
      buriedCortex > 100,
      'substantial actual cortex penetrates the closed supporting sediment volume',
    );

    // Complete route, including neighbouring returning branches, rather than
    // only the source's nominal station. Every overlap uses actual triangles.
    const box = new T.Box3(
      new T.Vector3(-29, -1, -10),
      new T.Vector3(29, 40, 10),
    );
    const inverseFrame = new T.Matrix4(),
      triangle = new T.Triangle();
    let boxes = 0,
      triangleChecks = 0;
    for (let s = 0; s < track.length; s += 12) {
      boxes++;
      const frame = track.sample(s);
      inverseFrame
        .compose(frame.position, frame.quaternion, new T.Vector3(1, 1, 1))
        .invert();
      for (const { name, geometry } of pieces) {
        if (
          !geometry.boundingBox
            .clone()
            .applyMatrix4(inverseFrame)
            .intersectsBox(box)
        )
          continue;
        const positions = geometry.attributes.position,
          index = geometry.index;
        for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
          triangle.a
            .fromBufferAttribute(positions, index ? index.getX(i) : i)
            .applyMatrix4(inverseFrame);
          triangle.b
            .fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1)
            .applyMatrix4(inverseFrame);
          triangle.c
            .fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2)
            .applyMatrix4(inverseFrame);
          triangleChecks++;
          assert.ok(
            !box.intersectsTriangle(triangle),
            `${name} obstructs the58m×40m envelope at ${s.toFixed(0)}m`,
          );
        }
      }
    }
    assert.ok(boxes > 450 && triangleChecks > 10000);

    // The representative should be visible at ordinary course-4 chase height.
    // This saved native camera belongs only in evidence, never runtime helpers.
    const camera = new T.PerspectiveCamera(67.68789808917198, 1.6, 0.1, 20000);
    camera.position.set(
      721.241940995706,
      173.47108149672908,
      154.58200426028066,
    );
    camera.quaternion.set(
      -0.08744842462386603,
      -0.5021935175793933,
      -0.07295702378075447,
      0.8572232594914198,
    );
    camera.updateMatrixWorld(true);
    const frustum = new T.Frustum().setFromProjectionMatrix(
      new T.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    const visible = {};
    for (const { name, geometry } of pieces) {
      visible[name] ??= 0;
      for (let i = 0; i < geometry.attributes.position.count; i++)
        if (
          frustum.containsPoint(
            new T.Vector3().fromBufferAttribute(
              geometry.attributes.position,
              i,
            ),
          )
        )
          visible[name]++;
    }
    assert.ok(
      visible.shoulder > 500 && visible.sediment > 200,
      'connected shoulder occupies the actual approach composition',
    );

    // Reusable source-perimeter seat works on unchanged complete stock parts.
    const matrix = new T.Matrix4().makeScale(1.3, 1.45, 1.25);
    matrix.setPosition(900, 300, -300);
    const seat = calculateOssuaryFootSeat(
      templates.get('scapula').parts,
      matrix,
      dunes,
    );
    assert.ok(seat.feet.length > 50 && Number.isFinite(seat.offsetY));
    for (const point of seat.feet)
      assert.ok(point.y <= dunes.heightAt(point.x, point.z) - 11.999);
  } finally {
    scene.traverse((object) => {
      if (object.geometry) owned.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean))
        owned.add(material);
    });
    for (const resource of owned) resource.dispose();
  }
});

test('Two offset buried fossil beds retain real anatomy, shared sediment and full-route clearance', async () => {
  const data = await fs.readFile(
    new URL(
      '../../../public/assets/levels/saffron/leviathan-kit.glb',
      import.meta.url,
    ),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    '',
  );
  scene.updateMatrixWorld(true);
  const owned = new Set(),
    templates = new Map(),
    track = createSaffronEliminatorTrack(),
    dunes = createOssuaryDunes(track);
  owned.add(dunes.geometry);
  try {
    for (const name of ['scapula', 'rib_2', 'vertebra_1']) {
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
    const plans = createOssuaryBuriedBeds(track, templates, dunes),
      pieces = [];
    const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
    owned.add(material);
    const ray = new T.Raycaster(),
      direction = new T.Vector3(0.013, 1, 0.007).normalize();
    function inside(point, meshes) {
      ray.set(point, direction);
      const distances = [];
      for (const hit of ray.intersectObjects(meshes))
        if (
          !distances.length ||
          Math.abs(hit.distance - distances.at(-1)) > 0.0001
        )
          distances.push(hit.distance);
      return distances.length % 2 === 1;
    }
    const poses = [
      {
        position: [739.8037500217913, 426.57325688534075, 789.6519948192933],
        quaternion: [
          -0.17650814660356684, -0.3517958428676856, 0.05875358003662405,
          0.917405349862572,
        ],
      },
      {
        position: [-248.27131131254885, 158.96676824379966, -510.4084258963991],
        quaternion: [
          0.30063752643473884, 0.8762922754852479, 0.13396040960763816,
          0.3518288423109196,
        ],
      },
    ];
    for (const [bedIndex, plan] of plans.entries()) {
      assert.equal(plan.anatomy.length, 2);
      const boneMeshes = [],
        bonePieces = [];
      let feet = 0;
      for (const placement of plan.anatomy) {
        const position = new T.Vector3(),
          rotation = new T.Quaternion(),
          scale = new T.Vector3();
        placement.matrix.decompose(position, rotation, scale);
        assert.ok(
          Math.min(...scale.toArray()) > 0 &&
            Math.max(...scale.toArray()) - Math.min(...scale.toArray()) <
              0.00001,
          'anatomy retains original proportions',
        );
        assert.ok(
          Math.abs(new T.Vector3(0, 1, 0).applyQuaternion(rotation).y - 1) <
            0.00001,
          'no arbitrary tilted or mirrored bones',
        );
        const meshes = [],
          geometries = [],
          template = templates.get(placement.prototype);
        let minY = Infinity;
        for (const { geometry } of template.parts)
          for (let i = 0; i < geometry.attributes.position.count; i++)
            minY = Math.min(minY, geometry.attributes.position.getY(i));
        for (const { geometry: source } of template.parts) {
          const before = source.attributes.position.array.slice(),
            geometry = source.clone().applyMatrix4(placement.matrix);
          owned.add(geometry);
          pieces.push({
            name: `${plan.name}/${placement.prototype}`,
            geometry,
          });
          geometries.push(geometry);
          assert.deepEqual(source.attributes.position.array, before);
          assert.deepEqual(geometry.index?.array, source.index?.array);
          assert.deepEqual(
            geometry.attributes.color?.array,
            source.attributes.color?.array,
          );
          for (let i = 0; i < source.attributes.position.count; i++)
            if (source.attributes.position.getY(i) <= minY + 6) {
              feet++;
              const point = new T.Vector3().fromBufferAttribute(
                geometry.attributes.position,
                i,
              );
              assert.ok(
                point.y <=
                  dunes.heightAt(point.x, point.z) - placement.burial + 0.001,
                'every low source cortical foot is genuinely buried',
              );
            }
          const mesh = new T.Mesh(geometry, material);
          mesh.updateMatrixWorld(true);
          meshes.push(mesh);
        }
        boneMeshes.push(meshes);
        bonePieces.push(geometries);
      }
      const local = createOssuaryGalleryScarpGeometry(plan.sediment.family),
        geometry = local.clone().applyMatrix4(plan.sediment.matrix);
      owned.add(local);
      owned.add(geometry);
      pieces.push({ name: `${plan.name}/sediment`, geometry });
      const sedimentMesh = new T.Mesh(geometry, material);
      sedimentMesh.updateMatrixWorld(true);
      let sedimentFeet = 0;
      for (let i = 0; i < local.attributes.position.count; i++)
        if (local.attributes.position.getY(i) <= -0.19) {
          sedimentFeet++;
          const point = new T.Vector3().fromBufferAttribute(
            geometry.attributes.position,
            i,
          );
          assert.ok(
            point.y <= dunes.heightAt(point.x, point.z) - 9.999,
            'complete sediment perimeter contacts actual rendered terrain',
          );
        }
      assert.equal(sedimentFeet, plan.sediment.footCount);
      let boneOverlap = 0,
        sedimentOverlap = 0;
      for (const [partIndex, geometries] of bonePieces.entries())
        for (const geometry of geometries) {
          for (let i = 0; i < geometry.attributes.position.count; i++) {
            const point = new T.Vector3().fromBufferAttribute(
              geometry.attributes.position,
              i,
            );
            if (inside(point, [sedimentMesh])) sedimentOverlap++;
            if (partIndex === 1 && inside(point, boneMeshes[0])) boneOverlap++;
          }
        }
      const camera = new T.PerspectiveCamera(
        67.68789808917198,
        1.6,
        0.1,
        20000,
      );
      camera.position.fromArray(poses[bedIndex].position);
      camera.quaternion.fromArray(poses[bedIndex].quaternion);
      camera.updateMatrixWorld(true);
      const frustum = new T.Frustum().setFromProjectionMatrix(
        new T.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      );
      let visible = 0;
      for (const geometries of bonePieces)
        for (const geometry of geometries)
          for (let i = 0; i < geometry.attributes.position.count; i++)
            if (
              frustum.containsPoint(
                new T.Vector3().fromBufferAttribute(
                  geometry.attributes.position,
                  i,
                ),
              )
            )
              visible++;
      assert.ok(feet > 40, 'each bed checks actual cortical feet');
      assert.ok(
        boneOverlap > 10,
        `${plan.name} has actual overlapping cortical anatomy`,
      );
      assert.ok(
        sedimentOverlap > 100,
        `${plan.name} anatomy intersects its real closed sediment body`,
      );
      assert.ok(
        visible > 1000,
        `${plan.name} occupies its ordinary saved native chase frustum`,
      );
    }
    const box = new T.Box3(
        new T.Vector3(-29, -1, -10),
        new T.Vector3(29, 40, 10),
      ),
      inverse = new T.Matrix4(),
      triangle = new T.Triangle();
    let boxes = 0,
      triangleChecks = 0;
    for (let s = 0; s < track.length; s += 12) {
      boxes++;
      const frame = track.sample(s);
      inverse
        .compose(frame.position, frame.quaternion, new T.Vector3(1, 1, 1))
        .invert();
      for (const { name, geometry } of pieces) {
        if (
          !geometry.boundingBox.clone().applyMatrix4(inverse).intersectsBox(box)
        )
          continue;
        const p = geometry.attributes.position,
          index = geometry.index;
        for (let i = 0; i < (index?.count ?? p.count); i += 3) {
          triangle.a
            .fromBufferAttribute(p, index ? index.getX(i) : i)
            .applyMatrix4(inverse);
          triangle.b
            .fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1)
            .applyMatrix4(inverse);
          triangle.c
            .fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2)
            .applyMatrix4(inverse);
          triangleChecks++;
          assert.ok(
            !box.intersectsTriangle(triangle),
            `${name} obstructs full route at ${s}m`,
          );
        }
      }
    }
    assert.equal(boxes, 467);
    assert.ok(
      triangleChecks > 100000,
      'near-route source triangles receive exact clearance checks',
    );
  } finally {
    scene.traverse((object) => {
      if (object.geometry) owned.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean))
        owned.add(material);
    });
    for (const resource of owned) resource.dispose();
  }
});
