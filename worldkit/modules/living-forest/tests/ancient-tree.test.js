import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAncientTree } from '../../../src/living-forest-ancient-tree.js';

function watch(resource) {
  const state = { disposals: 0 };
  resource.addEventListener('dispose', () => state.disposals++);
  return state;
}

function fixture({ leaves = true, heartwood = true } = {}) {
  const scene = new T.Group(),
    parent = new T.Group();
  scene.position.set(7, 11, 13);
  parent.position.set(17, 19, 23);
  parent.rotation.set(0.2, 0.4, -0.1);
  parent.scale.set(2, 3, 4);
  scene.add(parent);
  const importedMap = new T.Texture(),
    importedMaterial = new T.MeshStandardMaterial({ map: importedMap });
  const names = [
    'AncientOak_Bark',
    ...(heartwood ? ['AncientOak_Heartwood'] : []),
    ...(leaves ? ['AncientOak_Twigs', 'AncientOak_Leaves'] : []),
  ];
  const meshes = names.map((name, i) => {
    const geometry = new T.BoxGeometry(2, 4, 6);
    if (name === 'AncientOak_Leaves') {
      const count = geometry.attributes.position.count;
      geometry.setAttribute(
        '_wind_anchor',
        new T.Float32BufferAttribute(
          Array.from({ length: count }, () => [1, 2, 3]).flat(),
          3,
        ),
      );
      geometry.setAttribute(
        '_wind_gradient',
        new T.Float32BufferAttribute(
          Array.from({ length: count }, () => [0.2, 0.3, 0.4]).flat(),
          3,
        ),
      );
      geometry.setAttribute(
        '_wind_weight',
        new T.Float32BufferAttribute(new Float32Array(count).fill(0.5), 1),
      );
      geometry.setAttribute(
        '_wind_phase',
        new T.Float32BufferAttribute(new Float32Array(count).fill(1.25), 1),
      );
    }
    const mesh = new T.Mesh(geometry, importedMaterial);
    mesh.name = name;
    mesh.position.set(i * 2, i * 3, i * 5);
    parent.add(mesh);
    return mesh;
  });
  scene.updateMatrixWorld(true);
  return { scene, scenes: [scene], meshes, importedMap, importedMaterial };
}

function palette() {
  const map = new T.Texture();
  const materials = {
    bark: new T.MeshStandardMaterial({ map, vertexColors: true }),
    inner: new T.MeshStandardMaterial({ map, vertexColors: true }),
    leaf: new T.MeshStandardMaterial({
      map,
      alphaTest: 0.5,
      side: T.DoubleSide,
    }),
  };
  return {
    map,
    materials,
    states: [watch(map), ...Object.values(materials).map(watch)],
    dispose() {
      Object.values(materials).forEach((material) => material.dispose());
      map.dispose();
    },
  };
}

test('ancient solid tree flattens private geometry and wind covectors while borrowing the complete palette', async (t) => {
  const source = fixture(),
    supplied = palette();
  const sourceGeometry = source.meshes.map((mesh) => watch(mesh.geometry));
  const sourceMaterial = watch(source.importedMaterial),
    sourceMap = watch(source.importedMap);
  const originalUV = source.meshes[3].geometry.attributes.uv.getY(0);
  const leafSource = source.meshes[3];
  const expectedAnchor = new T.Vector3(1, 2, 3).applyMatrix4(
    leafSource.matrixWorld,
  );
  const expectedGradient = new T.Vector3(0.2, 0.3, 0.4).applyMatrix3(
    new T.Matrix3().getNormalMatrix(leafSource.matrixWorld),
  );
  const expectedPosition = new T.Vector3()
    .fromBufferAttribute(leafSource.geometry.attributes.position, 0)
    .applyMatrix4(leafSource.matrixWorld);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    assert.equal(url, 'consumer-tree.glb');
    return source;
  });
  const tree = await loadAncientTree({
    url: 'consumer-tree.glb',
    materials: supplied.materials,
  });
  const owned = tree.group.children.map((mesh) => watch(mesh.geometry));
  try {
    assert.equal(tree.metrics.source, 'sculpted-solid-ancient-oak');
    assert.equal(tree.metrics.draws, 4);
    assert.equal(tree.metrics.triangles, 48);
    assert.equal(tree.group.userData.metrics, tree.metrics);
    assert.deepEqual(
      tree.group.children.map((mesh) => mesh.name),
      source.meshes.map((mesh) => mesh.name),
    );
    for (const mesh of tree.group.children) {
      assert.equal(mesh.material, supplied.materials[mesh.userData.kind]);
      assert.notEqual(
        mesh.geometry,
        source.scene.getObjectByName(mesh.name).geometry,
      );
      assert.ok(mesh.castShadow && mesh.receiveShadow);
      assert.ok(mesh.geometry.boundingSphere.radius > 0);
      assert.ok(mesh.matrix.equals(new T.Matrix4()));
    }
    const leaf = tree.group.getObjectByName('AncientOak_Leaves'),
      a = leaf.geometry.attributes;
    assert.ok(
      new T.Vector3()
        .fromBufferAttribute(a.position, 0)
        .distanceTo(expectedPosition) < 1e-5,
    );
    assert.ok(
      new T.Vector3()
        .fromBufferAttribute(a.windAnchor, 0)
        .distanceTo(expectedAnchor) < 1e-5,
    );
    assert.ok(
      new T.Vector3()
        .fromBufferAttribute(a.windGradient, 0)
        .distanceTo(expectedGradient) < 1e-6,
    );
    assert.ok(
      Math.abs(
        new T.Vector3().fromBufferAttribute(a.windGradient, 0).length() - 1,
      ) > 0.1,
      'covector magnitude is retained',
    );
    assert.equal(a.windWeight.getX(0), 0.5);
    assert.equal(a.windPhase.getX(0), 1.25);
    assert.equal(a._wind_anchor, undefined);
    assert.equal(a.uv.getY(0), Math.fround(1 - originalUV));
    assert.equal(leafSource.geometry.attributes.uv.getY(0), originalUV);
    assert.equal(supplied.map.flipY, true);
    assert.ok(sourceGeometry.every((state) => state.disposals === 1));
    assert.equal(sourceMaterial.disposals, 1);
    assert.equal(sourceMap.disposals, 1);
    assert.ok(supplied.states.every((state) => state.disposals === 0));
  } finally {
    tree.dispose();
    tree.dispose();
    assert.ok(owned.every((state) => state.disposals === 1));
    assert.equal(tree.group.children.length, 0);
    assert.ok(supplied.states.every((state) => state.disposals === 0));
    supplied.dispose();
  }
});

test('bare solid tree needs no foliage material and accepts a consumer URL object', async (t) => {
  const source = fixture({ leaves: false }),
    supplied = palette();
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    assert.equal(url, 'https://example.test/derived-tree.glb');
    return source;
  });
  const tree = await loadAncientTree({
    url: new URL('https://example.test/derived-tree.glb'),
    materials: {
      bark: supplied.materials.bark,
      inner: supplied.materials.inner,
    },
  });
  assert.equal(tree.metrics.draws, 2);
  assert.equal(tree.metrics.triangles, 24);
  tree.dispose();
  supplied.dispose();
});

test('missing heartwood and incomplete leaf attributes release imports and partial geometry exactly once', async (t) => {
  for (const missing of ['heartwood', 'wind']) {
    const source = fixture({ heartwood: missing !== 'heartwood' }),
      supplied = palette();
    if (missing === 'wind')
      source.meshes[3].geometry.deleteAttribute('_wind_phase');
    const imported = [
      watch(source.importedMaterial),
      watch(source.importedMap),
      ...source.meshes.map((mesh) => watch(mesh.geometry)),
    ];
    const clones = [];
    for (const mesh of source.meshes) {
      const original = mesh.geometry.clone.bind(mesh.geometry);
      t.mock.method(mesh.geometry, 'clone', () => {
        const geometry = original();
        clones.push(watch(geometry));
        return geometry;
      });
    }
    t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => source);
    await assert.rejects(
      loadAncientTree({ url: 'tree.glb', materials: supplied.materials }),
      missing === 'heartwood'
        ? /missing the AncientOak_Heartwood mesh/
        : /windPhase/,
    );
    assert.ok(imported.every((state) => state.disposals === 1));
    assert.ok(
      clones.length > 0 && clones.every((state) => state.disposals === 1),
    );
    assert.ok(supplied.states.every((state) => state.disposals === 0));
    supplied.dispose();
  }
});

test('load failure preserves the caller palette and invalid arguments make no request', async (t) => {
  const supplied = palette(),
    cause = new Error('consumer asset unavailable');
  let requests = 0;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => {
    requests++;
    throw cause;
  });
  await assert.rejects(
    loadAncientTree({ materials: supplied.materials }),
    /consumer-owned asset URL/,
  );
  await assert.rejects(
    loadAncientTree({
      url: 'tree.glb',
      materials: { bark: supplied.materials.bark },
    }),
    /borrowed bark and inner/,
  );
  assert.equal(requests, 0);
  await assert.rejects(
    loadAncientTree({ url: 'tree.glb', materials: supplied.materials }),
    (error) => error === cause,
  );
  assert.equal(requests, 1);
  assert.ok(supplied.states.every((state) => state.disposals === 0));
  supplied.dispose();
});

test('import cleanup preserves caller maps and shared image data even if the source references them', async (t) => {
  const source = fixture({ leaves: false }),
    supplied = palette();
  let imageCloses = 0;
  const image = {
    close() {
      imageCloses++;
    },
  };
  supplied.map.source.data = image;
  source.importedMap.source.data = image;
  source.importedMaterial.alphaMap = supplied.map;
  source.meshes[0].material = supplied.materials.bark;
  const inputMaterial = watch(source.importedMaterial),
    inputMap = watch(source.importedMap);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => source);
  const tree = await loadAncientTree({
    url: 'tree.glb',
    materials: supplied.materials,
  });
  tree.dispose();
  assert.equal(inputMaterial.disposals, 1);
  assert.equal(inputMap.disposals, 1);
  assert.equal(imageCloses, 0);
  assert.ok(supplied.states.every((state) => state.disposals === 0));
  supplied.dispose();
});
