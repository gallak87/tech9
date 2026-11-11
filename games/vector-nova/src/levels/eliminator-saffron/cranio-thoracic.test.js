import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSaffronEliminatorTrack } from './track/model.js';
import { attachOssuaryCranioThoracic } from './cranio-thoracic.js';
import { createOssuaryDunes, createOssuaryPassageGeometry } from './scenery.js';

const rayDirection = new T.Vector3(0.173, 0.981, 0.087).normalize();

// Material primitives of one closed source component belong to the same
// solid. Deduplicate shared-edge hits before applying the parity test.
function insideComponent(point, meshes, ray) {
  ray.set(point, rayDirection);
  const distances = ray
    .intersectObjects(meshes, false)
    .map((hit) => hit.distance);
  let crossings = 0,
    previous = -Infinity;
  for (const distance of distances)
    if (distance - previous > 0.0001) {
      crossings++;
      previous = distance;
    }
  return crossings % 2 === 1;
}

function intersectsSurface(geometry, inverse, box, triangle) {
  if (!geometry.boundingBox.clone().applyMatrix4(inverse).intersectsBox(box))
    return false;
  const positions = geometry.attributes.position,
    index = geometry.index;
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    triangle.a
      .fromBufferAttribute(positions, index ? index.getX(i) : i)
      .applyMatrix4(inverse);
    triangle.b
      .fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1)
      .applyMatrix4(inverse);
    triangle.c
      .fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2)
      .applyMatrix4(inverse);
    if (box.intersectsTriangle(triangle)) return true;
  }
  return false;
}

test('Cranio-thoracic original anatomy preserves its world frame and complete road/camera volume', async () => {
  const manifest = JSON.parse(
    await fs.readFile(
      new URL(
        '../../../assets/levels/eliminator-saffron/cranio-thoracic/manifest.json',
        import.meta.url,
      ),
    ),
  );
  const data = await fs.readFile(
    new URL(
      '../../../public/assets/levels/eliminator-saffron/cranio-thoracic.glb',
      import.meta.url,
    ),
  );
  assert.equal(
    createHash('sha256').update(data).digest('hex'),
    manifest.runtimeAsset.sha256,
  );
  assert.equal(data.byteLength, manifest.runtimeAsset.bytes);
  const { scene } = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    '',
  );
  scene.updateMatrixWorld(true);
  const root = scene.getObjectByName('ossuary_cranio_thoracic'),
    owned = new Set(),
    material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    components = [],
    geometries = [],
    bounds = new T.Box3();
  owned.add(material);
  try {
    assert.ok(root?.matrixWorld.equals(new T.Matrix4()));
    let triangles = 0,
      minimumCavity = Infinity,
      maximumCavity = -Infinity;
    scene.traverse((object) => {
      assert.ok(
        !object.isCamera &&
          !object.isLight &&
          !/^GUIDE[_ /]/i.test(object.name),
      );
      if (!object.isMesh) return;
      owned.add(object.geometry);
      for (const sourceMaterial of [object.material].flat()) {
        owned.add(sourceMaterial);
        for (const value of Object.values(sourceMaterial))
          assert.ok(
            !value?.isTexture,
            'new anatomy borrows the existing finish family',
          );
      }
      for (const attribute of Object.values(object.geometry.attributes))
        for (const value of attribute.array) assert.ok(Number.isFinite(value));
      assert.ok(
        object.geometry.attributes.normal,
        'real formed normals are exported',
      );
      const colours = object.geometry.attributes.color;
      assert.ok(colours, 'geometry-derived cavity COLOR_0 survives export');
      for (let i = 0; i < colours.count; i++) {
        minimumCavity = Math.min(minimumCavity, colours.getX(i));
        maximumCavity = Math.max(maximumCavity, colours.getX(i));
      }
    });
    for (const child of root.children) {
      const meshes = [],
        componentBounds = new T.Box3();
      child.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = object.geometry
          .clone()
          .applyMatrix4(object.matrixWorld);
        owned.add(geometry);
        geometry.computeBoundingBox();
        componentBounds.union(geometry.boundingBox);
        geometries.push(geometry);
        triangles +=
          (geometry.index?.count ?? geometry.attributes.position.count) / 3;
        const mesh = new T.Mesh(geometry, material);
        mesh.updateMatrixWorld(true);
        meshes.push(mesh);
      });
      if (meshes.length) {
        components.push({ name: child.name, meshes, bounds: componentBounds });
        bounds.union(componentBounds);
      }
    }
    assert.equal(triangles, manifest.geometry.triangles);
    assert.ok(
      minimumCavity >= 0.75 &&
        minimumCavity < 0.9 &&
        maximumCavity > 0.98 &&
        maximumCavity <= 1.001,
      'cavity pass retains restrained, non-uniform sheltered/exposed values',
    );
    assert.ok(
      triangles <= 60000,
      'substantial anatomy has a bounded geometry cost',
    );
    assert.equal(
      components.length,
      manifest.geometry.closedSourceComponents.length,
    );
    for (const end of ['min', 'max'])
      for (let axis = 0; axis < 3; axis++)
        assert.ok(
          Math.abs(
            bounds[end].getComponent(axis) -
              manifest.geometry.bounds[end][axis],
          ) < 0.0001,
        );

    const grounding = manifest.geometry.actualExportContactAndGrounding,
      track = createSaffronEliminatorTrack(),
      dunes = createOssuaryDunes(track);
    owned.add(dunes.geometry);
    assert.equal(grounding.assetSha256, manifest.runtimeAsset.sha256);
    let testedFeet = 0;
    for (const region of grounding.groundingRegions) {
      const unique = new Set();
      let minimumBurial = Infinity;
      const component = root.getObjectByName(
          T.PropertyBinding.sanitizeNodeName(region.node),
        ),
        primitives = [];
      component?.traverse((object) => {
        if (object.isMesh) primitives.push(object);
      });
      for (const part of region.primitiveRegions) {
        const mesh = primitives[part.primitive],
          positions = mesh?.geometry?.attributes.position;
        assert.ok(
          positions,
          'recorded toe regions identify actual runtime geometry',
        );
        assert.equal(
          createHash('sha256')
            .update(
              Buffer.from(
                positions.array.buffer,
                positions.array.byteOffset,
                positions.array.byteLength,
              ),
            )
            .digest('hex'),
          part.positionSha256,
        );
        for (const index of part.vertexIndices) {
          assert.ok(
            Number.isInteger(index) && index >= 0 && index < positions.count,
          );
          const point = new T.Vector3()
            .fromBufferAttribute(positions, index)
            .applyMatrix4(mesh.matrixWorld);
          const key = point
            .toArray()
            .map((value) => value.toFixed(5))
            .join(',');
          if (unique.has(key)) continue;
          unique.add(key);
          const burial = dunes.heightAt(point.x, point.z) - point.y;
          assert.ok(
            burial >= 5.9,
            `complete source foot floats above rendered dune: ${region.name}`,
          );
          minimumBurial = Math.min(minimumBurial, burial);
        }
      }
      assert.equal(
        unique.size,
        region.expectedSourceFootPoints,
        'the complete authored perimeter survives export, not just its centre',
      );
      assert.ok(Math.abs(minimumBurial - region.minimumBurialMetres) < 0.001);
      testedFeet += unique.size;
    }
    assert.ok(
      testedFeet >= 400,
      'all retained spread feet, terminal caps and sediment perimeter are sampled',
    );

    const box = new T.Box3(
        new T.Vector3(-29, -1, -8),
        new T.Vector3(29, 40, 8),
      ),
      inverse = new T.Matrix4(),
      triangle = new T.Triangle(),
      ray = new T.Raycaster(),
      scale = new T.Vector3(1, 1, 1);
    let frames = 0,
      solidChecks = 0,
      nearSurfaces = 0;
    for (let s = 0; s < track.length; s += 4) {
      frames++;
      const frame = track.sample(s),
        centre = frame.position.clone().addScaledVector(frame.up, 19.5);
      inverse.compose(frame.position, frame.quaternion, scale).invert();
      for (const geometry of geometries) {
        if (
          geometry.boundingBox.clone().applyMatrix4(inverse).intersectsBox(box)
        )
          nearSurfaces++;
        assert.ok(
          !intersectsSurface(geometry, inverse, box, triangle),
          `actual original anatomy crosses the 58m×41m envelope at ${s}m`,
        );
      }
      for (const component of components)
        if (component.bounds.containsPoint(centre)) {
          solidChecks++;
          assert.ok(
            !insideComponent(centre, component.meshes, ray),
            `road volume is enclosed by solid ${component.name} at ${s}m`,
          );
        }
    }
    assert.ok(
      frames >= 1400 && nearSurfaces > 0 && solidChecks > 0,
      'all-route guards examine real near surfaces and closed volumes',
    );

    // A surrounding solid has no triangles intersecting the protected box;
    // parity must still reject it rather than treating its interior as air.
    const solid = new T.BoxGeometry(1000, 1000, 1000);
    owned.add(solid);
    solid.computeBoundingBox();
    const solidMesh = new T.Mesh(solid, material);
    solidMesh.updateMatrixWorld(true);
    assert.equal(
      intersectsSurface(solid, new T.Matrix4(), box, triangle),
      false,
    );
    assert.equal(
      insideComponent(new T.Vector3(0, 19.5, 0), [solidMesh], ray),
      true,
    );
  } finally {
    for (const resource of owned) resource.dispose();
  }
});

test('Cranio-thoracic attachment rejects editor cameras and lights', () => {
  for (const editorNode of [new T.PerspectiveCamera(), new T.PointLight()]) {
    const source = new T.Group(),
      root = new T.Group();
    root.name = 'ossuary_cranio_thoracic';
    source.add(root, editorNode);
    assert.throws(
      () => attachOssuaryCranioThoracic(source, { group: new T.Group() }),
      /editor references/,
    );
  }
});

test('Static anatomy material batches retain every original shaded triangle and own merged buffers', async () => {
  const bytes = await fs.readFile(
    new URL(
      '../../../public/assets/levels/eliminator-saffron/cranio-thoracic.glb',
      import.meta.url,
    ),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const owned = new Set(),
    borrowed = new T.MeshStandardMaterial({ name: 'Existing course sediment' }),
    root = scene.getObjectByName('ossuary_cranio_thoracic'),
    group = new T.Group(),
    merged = [];
  owned.add(borrowed);
  scene.traverse((object) => {
    if (object.geometry) owned.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean))
      owned.add(material);
  });
  root.getObjectByName('ossuary_sediment').material = borrowed;
  function triangleStreams(object) {
    object.updateMatrixWorld(true);
    const streams = new Map();
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      assert.ok(
        mesh.matrixWorld.equals(new T.Matrix4()),
        'source and static batch share the exact world frame',
      );
      const geometry = mesh.geometry,
        attributes = ['position', 'normal', 'color'].map(
          (name) => geometry.attributes[name],
        ),
        index = geometry.index,
        stride = attributes.reduce(
          (sum, attribute) => sum + attribute.itemSize,
          0,
        ),
        count = index?.count ?? attributes[0].count,
        stream = new Float32Array(count * stride);
      let cursor = 0;
      for (let i = 0; i < count; i++) {
        const vertex = index ? index.getX(i) : i;
        for (const attribute of attributes)
          for (let component = 0; component < attribute.itemSize; component++)
            stream[cursor++] =
              attribute.array[vertex * attribute.itemSize + component];
      }
      if (!streams.has(mesh.material))
        streams.set(mesh.material, createHash('sha256'));
      streams.get(mesh.material).update(Buffer.from(stream.buffer));
    });
    return new Map(
      [...streams].map(([material, hash]) => [material, hash.digest('hex')]),
    );
  }
  try {
    const before = triangleStreams(root);
    attachOssuaryCranioThoracic(scene, {
      group,
      resources: {
        geometry(value) {
          owned.add(value);
          merged.push(value);
          return value;
        },
      },
      styleMaterial() {},
      sedimentMaterial: borrowed,
    });
    assert.equal(
      merged.length,
      4,
      'three cortex roles plus the borrowed sediment role',
    );
    assert.deepEqual(
      triangleStreams(root),
      before,
      'actual positions/normals/cavity colours and triangle order are exact',
    );
  } finally {
    for (const resource of owned) resource.dispose();
  }
});

test('New far-cheek fans physically join the actual fitted skull rather than empty sockets', async () => {
  const load = async (path) => {
    const bytes = await fs.readFile(new URL(path, import.meta.url));
    return (
      await new GLTFLoader().parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        '',
      )
    ).scene;
  };
  const [anatomy, canonical] = await Promise.all([
    load(
      '../../../public/assets/levels/eliminator-saffron/cranio-thoracic.glb',
    ),
    load('../../../public/assets/levels/saffron/leviathan-kit.glb'),
  ]);
  const owned = new Set(),
    track = createSaffronEliminatorTrack(),
    dunes = createOssuaryDunes(track),
    material = new T.MeshBasicMaterial({ side: T.DoubleSide });
  owned.add(dunes.geometry);
  owned.add(material);
  const ray = new T.Raycaster();
  try {
    anatomy.updateMatrixWorld(true);
    canonical.updateMatrixWorld(true);
    const skull = canonical.getObjectByName('skull'),
      inverseSkull = skull.matrixWorld.clone().invert(),
      skullMeshes = [];
    skull.traverse((object) => {
      if (!object.isMesh) return;
      const native = object.geometry
        .clone()
        .applyMatrix4(inverseSkull.clone().multiply(object.matrixWorld));
      const fitted = createOssuaryPassageGeometry(
        track,
        native,
        0.245 * track.length,
        1.2,
        dunes,
      );
      owned.add(native);
      owned.add(fitted);
      const mesh = new T.Mesh(fitted, material);
      mesh.updateMatrixWorld(true);
      skullMeshes.push(mesh);
    });
    for (const side of [-1, 1]) {
      const fan = anatomy.getObjectByName(
          `Original__broad_seated_far-cheek_cortical_fan_${side}`,
        ),
        socket = anatomy.getObjectByName(`skull_far_cheek_${side}`);
      assert.ok(
        fan && socket,
        `actual ${side} fan and measured skull point exist`,
      );
      const point = socket.getWorldPosition(new T.Vector3()),
        fanMeshes = [],
        fanGeometries = [];
      fan.traverse((object) => {
        if (!object.isMesh) return;
        const geometry = object.geometry
          .clone()
          .applyMatrix4(object.matrixWorld);
        owned.add(geometry);
        fanGeometries.push(geometry);
        const mesh = new T.Mesh(geometry, material);
        mesh.updateMatrixWorld(true);
        fanMeshes.push(mesh);
      });
      assert.ok(fanMeshes.length);
      let contactDistance = Infinity;
      const triangle = new T.Triangle(),
        nearest = new T.Vector3();
      for (const geometry of fanGeometries) {
        const positions = geometry.attributes.position,
          index = geometry.index;
        for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
          triangle.a.fromBufferAttribute(positions, index ? index.getX(i) : i);
          triangle.b.fromBufferAttribute(
            positions,
            index ? index.getX(i + 1) : i + 1,
          );
          triangle.c.fromBufferAttribute(
            positions,
            index ? index.getX(i + 2) : i + 2,
          );
          contactDistance = Math.min(
            contactDistance,
            triangle.closestPointToPoint(point, nearest).distanceTo(point),
          );
        }
      }
      assert.ok(
        contactDistance < 12,
        'actual fan surface reaches the measured source-cheek face, not just a socket marker',
      );
      const unique = new Set();
      let contacts = 0;
      for (const geometry of fanGeometries)
        for (let i = 0; i < geometry.attributes.position.count; i++) {
          const vertex = new T.Vector3().fromBufferAttribute(
            geometry.attributes.position,
            i,
          );
          if (vertex.distanceTo(point) > 55) continue;
          const key = vertex
            .toArray()
            .map((value) => value.toFixed(4))
            .join(',');
          if (unique.has(key)) continue;
          unique.add(key);
          if (insideComponent(vertex, skullMeshes, ray)) contacts++;
        }
      assert.ok(
        contacts >= 5,
        `fan ${side} has substantial actual vertices penetrating fitted canonical cortex`,
      );
    }
  } finally {
    for (const scene of [anatomy, canonical])
      scene.traverse((object) => {
        if (object.geometry) owned.add(object.geometry);
        for (const material of [object.material].flat().filter(Boolean))
          owned.add(material);
      });
    for (const resource of owned) resource.dispose();
  }
});
