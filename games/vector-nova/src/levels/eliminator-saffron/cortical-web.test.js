import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronEliminatorTrack } from './track/model.js';
import { createOssuaryDunes, createOssuaryPassageGeometry } from './scenery.js';

test('Original cortical web is attached solid anatomy with preserved source data and complete course clearance', async () => {
  const manifest = JSON.parse(
    await fs.readFile(
      new URL(
        '../../../assets/levels/eliminator-saffron/cortical-web-manifest.json',
        import.meta.url,
      ),
    ),
  );
  const [webData, skullData] = await Promise.all([
    fs.readFile(
      new URL(
        '../../../public/assets/levels/eliminator-saffron/cortical-web.glb',
        import.meta.url,
      ),
    ),
    fs.readFile(
      new URL(
        '../../../public/assets/levels/saffron/leviathan-kit.glb',
        import.meta.url,
      ),
    ),
  ]);
  assert.equal(
    createHash('sha256').update(webData).digest('hex'),
    manifest.runtimeAsset.sha256,
  );
  assert.equal(webData.byteLength, manifest.runtimeAsset.bytes);
  assert.equal(
    createHash('sha256').update(skullData).digest('hex'),
    manifest.canonicalMaterialSource.sha256,
  );
  const parse = (buffer) =>
    new GLTFLoader().parseAsync(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ),
      '',
    );
  const [{ scene: webScene }, { scene: skullScene }] = await Promise.all([
    parse(webData),
    parse(skullData),
  ]);
  const owned = new Set(),
    track = createSaffronEliminatorTrack(),
    dunes = createOssuaryDunes(track);
  owned.add(dunes.geometry);
  try {
    webScene.updateMatrixWorld(true);
    skullScene.updateMatrixWorld(true);
    const webRoot = webScene.getObjectByName('cortical_web'),
      skullRoot = skullScene.getObjectByName('skull');
    assert.ok(webRoot && skullRoot);
    assert.ok(
      webRoot.matrix.equals(new T.Matrix4()),
      'runtime root is canonical common-coordinate identity',
    );
    const roles = new Set(),
      bounds = new T.Box3();
    let triangleCount = 0;
    function localParts(root, isWeb = false) {
      const inverse = root.matrixWorld.clone().invert(),
        geometries = [];
      root.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = object.geometry
          .clone()
          .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
        owned.add(geometry);
        geometry.computeBoundingBox();
        geometries.push(geometry);
        if (!isWeb) return;
        bounds.union(geometry.boundingBox);
        triangleCount +=
          (geometry.index?.count ?? geometry.attributes.position.count) / 3;
        assert.ok(
          geometry.attributes.normal && geometry.attributes.color,
          'real cavity COLOR_0 and formed normals are exported',
        );
        for (const attribute of Object.values(geometry.attributes))
          for (const value of attribute.array)
            assert.ok(
              Number.isFinite(value),
              'every actual exported attribute is finite',
            );
        for (const material of [object.material].flat()) {
          roles.add(material.name);
          for (const property of ['map', 'normalMap', 'roughnessMap', 'aoMap'])
            assert.ok(
              !material[property],
              'asset introduces no embedded runtime textures',
            );
        }
      });
      return geometries;
    }
    const nativeWeb = localParts(webRoot, true),
      nativeSkull = localParts(skullRoot);
    assert.equal(triangleCount, manifest.geometry.triangles);
    assert.ok(triangleCount <= 10000);
    assert.deepEqual(
      [...roles].sort(),
      [...manifest.geometry.materialRoles].sort(),
    );
    for (const end of ['min', 'max'])
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          Math.abs(
            bounds[end].getComponent(axis) -
              manifest.geometry.bounds[end][axis],
          ) < 0.0001,
        );
    assert.ok(
      bounds.min.y >= 45,
      'lowest central cortex stays above the authored native clearance',
    );
    let minimumColour = Infinity,
      maximumColour = -Infinity;
    for (const geometry of nativeWeb) {
      const colours = geometry.attributes.color;
      for (let i = 0; i < colours.count; i++) {
        minimumColour = Math.min(minimumColour, colours.getX(i));
        maximumColour = Math.max(maximumColour, colours.getX(i));
      }
    }
    assert.ok(
      minimumColour < 0.7 && maximumColour > 0.9,
      'actual geometry-derived sheltered/exposed cavity variation survives export',
    );

    const fit = (geometry) => {
      const before = {};
      for (const [name, attribute] of Object.entries(geometry.attributes))
        before[name] = attribute.array.slice();
      const beforeIndex = geometry.index?.array.slice();
      const fitted = createOssuaryPassageGeometry(
        track,
        geometry,
        0.245 * track.length,
        1.2,
        dunes,
      );
      owned.add(fitted);
      for (const [name, values] of Object.entries(before))
        assert.deepEqual(
          geometry.attributes[name].array,
          values,
          `fit must not mutate source ${name}`,
        );
      assert.deepEqual(geometry.index?.array, beforeIndex);
      assert.deepEqual(
        fitted.index?.array,
        beforeIndex,
        'fitted cortical connectivity remains unchanged',
      );
      for (const [name, values] of Object.entries(before))
        if (!['position', 'normal'].includes(name))
          assert.deepEqual(
            fitted.attributes[name].array,
            values,
            `source ${name} survives the shared fit exactly`,
          );
      return fitted;
    };
    const fittedWeb = nativeWeb.map(fit),
      fittedSkull = nativeSkull.map(fit);
    const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
    owned.add(material);
    const meshes = (geometries) =>
      geometries.map((geometry) => {
        const mesh = new T.Mesh(geometry, material);
        mesh.updateMatrixWorld(true);
        return mesh;
      });
    const nativeWebMeshes = meshes(nativeWeb),
      nativeSkullMeshes = meshes(nativeSkull),
      fittedSkullMeshes = meshes(fittedSkull);
    const ray = new T.Raycaster(),
      rayDirection = new T.Vector3(0.013, 1, 0.007).normalize();
    function uniqueHits(point, direction, source) {
      ray.set(point, direction);
      ray.far = Infinity;
      const distances = [];
      for (const hit of ray.intersectObjects(source))
        if (
          !distances.length ||
          Math.abs(hit.distance - distances.at(-1)) > 0.0001
        )
          distances.push(hit.distance);
      return distances;
    }
    function inside(point, source) {
      return uniqueHits(point, rayDirection, source).length % 2 === 1;
    }

    for (const [name, socket] of Object.entries(manifest.sockets)) {
      const sourceSocket = webRoot.getObjectByName(`cortical_socket_${name}`);
      assert.ok(sourceSocket);
      const centre = new T.Vector3(...socket.position);
      assert.ok(
        sourceSocket.getWorldPosition(new T.Vector3()).distanceTo(centre) <
          0.0001,
      );
      const measured = new Set();
      let nativeContacts = 0,
        fittedContacts = 0;
      for (let part = 0; part < nativeWeb.length; part++) {
        const native = nativeWeb[part].attributes.position,
          fitted = fittedWeb[part].attributes.position;
        for (let i = 0; i < native.count; i++) {
          const point = new T.Vector3().fromBufferAttribute(native, i);
          if (point.distanceTo(centre) > 18) continue;
          const key = point
            .toArray()
            .map((value) => value.toFixed(5))
            .join(',');
          if (measured.has(key)) continue;
          measured.add(key);
          if (!inside(point, nativeSkullMeshes)) continue;
          nativeContacts++;
          if (
            inside(
              new T.Vector3().fromBufferAttribute(fitted, i),
              fittedSkullMeshes,
            )
          )
            fittedContacts++;
        }
      }
      assert.ok(
        nativeContacts >= 5 && fittedContacts >= 5,
        `${name} root penetrates actual canonical cortex before and after their identical source fit`,
      );
    }

    // A thick plate cannot pass by being a painted hole or a zero-depth card.
    // Front/back intersection pairs measure the actual solid formed midway
    // along the bridge and through its fused branch junction.
    const thickness = {};
    for (const [name, x, y] of [
      ['bridge', -40, 63],
      ['junction', -10, 58],
    ]) {
      const hits = uniqueHits(
        new T.Vector3(x, y, 250),
        new T.Vector3(0, 0, 1),
        nativeWebMeshes,
      );
      assert.ok(
        hits.length >= 2 && hits.length % 2 === 0,
        `${name} has an actual closed front and back`,
      );
      thickness[name] = hits[1] - hits[0];
      assert.ok(
        thickness[name] > 7 && thickness[name] < 26,
        `${name} is a substantial cortical plate with actual depth`,
      );
    }

    const box = new T.Box3(
      new T.Vector3(-29, -1, -10),
      new T.Vector3(29, 40, 10),
    );
    const inverse = new T.Matrix4(),
      triangle = new T.Triangle();
    let boxes = 0,
      triangleChecks = 0;
    for (let s = 0; s < track.length; s += 12) {
      boxes++;
      const frame = track.sample(s);
      inverse
        .compose(frame.position, frame.quaternion, new T.Vector3(1, 1, 1))
        .invert();
      for (const geometry of fittedWeb) {
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
            `formed cortex obstructs58m×40m road/camera envelope at ${s}m`,
          );
        }
      }
    }
    assert.equal(boxes, 467);
    assert.ok(
      triangleChecks > 0,
      'triangle guard actually examines near-corridor geometry',
    );
  } finally {
    for (const scene of [webScene, skullScene])
      scene.traverse((object) => {
        if (object.geometry) owned.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean))
          owned.add(material);
      });
    for (const resource of owned) resource.dispose();
  }
});
