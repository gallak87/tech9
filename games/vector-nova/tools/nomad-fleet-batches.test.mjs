import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createIndustrialFinish } from '@worldkit/environment/industrial';
import createLevel from '../src/levels/nomad/index.js';
import { createNomadEnvironment } from '../src/levels/nomad/environment.js';
import { createNomadDistricts } from '../src/levels/nomad/districts.js';
import { createNomadHallMachinery } from '../src/levels/nomad/hall-machinery.js';
import { createNomadFleetBatches } from '../src/levels/nomad/fleet-batches.js';
import { createNomadRoad } from '../src/levels/nomad/track/road.js';
import {
  sampleCarrierMotion,
  NOMAD_MOTION_RULES,
} from '../src/levels/nomad/motion.js';
import { sampleNomadGroundMotion } from '../src/levels/nomad/ground-motion.js';
import kit from '../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const anchors = kit.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');
const details = ['', '_mid', '_far'];
const environmentPaths = [
  'carrier-kit.glb',
  'route-supports.glb',
  'receiver-crown.glb',
  'interior-freight.glb',
  'companion-armour.glb',
  'saltwind-gallery.glb',
  'wallride-service.glb',
  'salt-escarpments.glb',
];
const industrialPartSample =
  'texture2D(industrialDetail,vec2(industrialLocal.y,length(industrialLocal.xz))/3.).rgb';
const industrialShellNoise = 'industrialPoint.xz*.015';
async function model(path = 'carrier-kit.glb') {
  const bytes = await readFile(
    new URL(`../public/assets/levels/nomad/${path}`, import.meta.url),
  );
  return (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
  ).scene;
}
async function environmentAssets() {
  const scenes = await Promise.all(environmentPaths.map((path) => model(path)));
  return {
    scenes,
    loadAsset: async (url) => ({
      scene: scenes[environmentPaths.findIndex((path) => url.endsWith(path))],
    }),
  };
}
function materialsIn(scenes) {
  const materials = new Set();
  for (const scene of scenes)
    scene.traverse((mesh) => {
      if (mesh.isMesh)
        for (const material of [].concat(mesh.material))
          materials.add(material);
    });
  return materials;
}
function shaderProgram(material) {
  const source =
    T.ShaderLib[
      {
        MeshPhysicalMaterial: 'physical',
        MeshStandardMaterial: 'standard',
      }[material.type]
    ];
  assert.ok(source, `Use the actual stock shader for ${material.type}`);
  return {
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader,
    uniforms: T.UniformsUtils.clone(source.uniforms),
  };
}
function observedIndustrialFinish() {
  const finish = createIndustrialFinish(),
    bindings = [];
  const bind = finish.bind;
  const fixture = { finish, bindings, missingAnchor: null };
  finish.bind = (material, kind, coordinates) => {
    bind(material, kind, coordinates);
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      if (fixture.missingAnchor)
        shader.fragmentShader = shader.fragmentShader.replaceAll(
          fixture.missingAnchor,
          '',
        );
    };
    bindings.push({ material, kind, key: material.customProgramCacheKey() });
  };
  return fixture;
}
function assertAttachedIndustrialFinish({ material, kind }, machined = false) {
  const shader = shaderProgram(material),
    key = material.customProgramCacheKey();
  assert.doesNotThrow(
    () => material.onBeforeCompile(shader, null),
    material.name,
  );
  assert.equal(material.customProgramCacheKey(), key);
  assert.ok(shader.uniforms.industrialDetail, material.name);
  if (machined) {
    assert.ok(shader.fragmentShader.includes(industrialPartSample));
    assert.ok(shader.fragmentShader.includes('float turning='));
  } else {
    assert.ok(!shader.fragmentShader.includes(industrialPartSample));
    for (const plane of ['yz', 'xz', 'xy'])
      assert.ok(
        shader.fragmentShader.includes(
          `texture2D(industrialDetail,industrialLocal.${plane}/7.).rgb`,
        ),
        `${material.name}: attached triplanar ${plane} sample`,
      );
  }
  assert.ok(!shader.fragmentShader.includes(industrialShellNoise));
  assert.equal(
    shader.fragmentShader.includes('industrialLocal.xz*.015'),
    kind === 'shell',
  );
}
function assertRequiredIndustrialAnchors(fixture, bindings) {
  fixture.missingAnchor = industrialPartSample;
  for (const { material } of bindings)
    assert.throws(
      () => material.onBeforeCompile(shaderProgram(material), null),
      /Shader patch anchor not found: texture2D\(industrialDetail,vec2/,
      `${material.name}: active part sample remains required`,
    );
  fixture.missingAnchor = industrialShellNoise;
  for (const { material, kind } of bindings) {
    const compile = () =>
      material.onBeforeCompile(shaderProgram(material), null);
    if (kind === 'shell')
      assert.throws(
        compile,
        /Shader patch anchor not found: industrialPoint\.xz\*\.015/,
        `${material.name}: active shell noise remains required`,
      );
    else assert.doesNotThrow(compile, material.name);
  }
  fixture.missingAnchor = null;
}
const source = await model();
const sourceMaterials = new Map();
source.traverse((mesh) => {
  if (mesh.isMesh) {
    sourceMaterials.set(mesh.material.uuid, mesh.material);
    mesh.geometry.setAttribute(
      'industrialCoord',
      mesh.geometry.attributes.position.clone(),
    );
  }
});
source.updateWorldMatrix(true, true);
const sourceMaterial = (batch) => {
  const material = sourceMaterials.get(batch.userData.nomadSourceMaterialUUID);
  assert.ok(material, `${batch.name}: retained source material identity`);
  return material;
};
const partsOf = (kind, level) => {
  const root = source.getObjectByName(`nomad_${kind}${details[level]}`);
  const parts = new Map();
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (!parts.has(mesh.material)) parts.set(mesh.material, []);
    parts.get(mesh.material).push(mesh);
  });
  return parts;
};
const partCount = (kind, material) =>
  Math.max(
    ...details.map(
      (_, level) => partsOf(kind, level).get(material)?.length ?? 0,
    ),
  );
const retainedInstances = (kind, carrierCount) => {
  const materials = new Set(
    details.flatMap((_, level) => [...partsOf(kind, level).keys()]),
  );
  return (
    [...materials].reduce(
      (sum, material) => sum + partCount(kind, material),
      0,
    ) *
    carrierCount *
    (kind === 'wheel' ? anchors.length : 1)
  );
};
const retainedTriangleCounts = (kind) =>
  details.map((suffix) => {
    let triangles = 0;
    source.getObjectByName(`nomad_${kind}${suffix}`).traverse((mesh) => {
      if (mesh.isMesh)
        triangles +=
          (mesh.geometry.index?.count ??
            mesh.geometry.attributes.position.count) / 3;
    });
    return triangles;
  });
function expectedMatrix(carrier, time, kind, anchorIndex, mesh, grade) {
  const position = carrier.origin
    .clone()
    .add(sampleCarrierMotion(carrier, time).translation);
  const matrix = new T.Matrix4().compose(
    position,
    carrier.quaternion,
    carrier.scale,
  );
  if (kind === 'wheel') {
    const angle =
      ((NOMAD_MOTION_RULES.convoySpeed * time +
        sampleCarrierMotion(carrier, time).translation.z) *
        Math.hypot(1, grade)) /
      (anchors[anchorIndex].rollingRadius * carrier.scale.x);
    matrix
      .multiply(
        new T.Matrix4()
          .makeScale(1, 1, carrier.scale.x / carrier.scale.z)
          .setPosition(
            new T.Vector3().fromArray(anchors[anchorIndex].position),
          ),
      )
      .multiply(new T.Matrix4().makeRotationX(angle));
    let root = mesh;
    while (!/^nomad_wheel(?:_mid|_far)?$/.test(root.name)) root = root.parent;
    matrix.multiply(
      root.matrixWorld.clone().invert().multiply(mesh.matrixWorld),
    );
  } else {
    let root = mesh;
    while (!/^nomad_carrier(?:_mid|_far)?$/.test(root.name)) root = root.parent;
    matrix.multiply(
      (root.parent?.matrixWorld ?? new T.Matrix4())
        .clone()
        .invert()
        .multiply(mesh.matrixWorld),
    );
  }
  return matrix;
}

test('1500 km/h wheel rotation covers exact relative ground travel along the slope without changing carrier motion', () => {
  assert.equal(NOMAD_MOTION_RULES.convoySpeed * 3.6, 1500);
  const track = createLevel().createTrack();
  const fleet = createNomadFleetBatches({ track, source });
  const batch = fleet.group.children.find(
    (child) => child.userData.nomadFleetKind === 'wheel',
  );
  const orientation = (index, time) => {
    track.presentationTime = time;
    fleet.update();
    const matrix = new T.Matrix4();
    batch.getMatrixAt(
      index * partCount('wheel', sourceMaterial(batch)) * anchors.length,
      matrix,
    );
    const quaternion = new T.Quaternion();
    matrix.decompose(new T.Vector3(), quaternion, new T.Vector3());
    return quaternion;
  };
  try {
    for (const index of [0, 5, 6])
      for (const time of [0, 8.3, 19, 40, 75]) {
        const carrier = track.carriers[index];
        const dt = 0.03; // Below half a revolution, so no angle unwrapping ambiguity.
        const rotation = orientation(index, time).angleTo(
          orientation(index, time + dt),
        );
        const rimTravel = rotation * anchors[0].rollingRadius * carrier.scale.x;
        const relativeTravel = sampleNomadGroundMotion(track, time)
          .translation.sub(
            sampleNomadGroundMotion(track, time + dt).translation,
          )
          .add(sampleCarrierMotion(carrier, time + dt).translation)
          .sub(sampleCarrierMotion(carrier, time).translation);
        // The tires roll in the pitched longitudinal plane. The carrier's
        // small lateral drift is separate from its fore/aft wheel rotation.
        relativeTravel.x = 0;
        assert.ok(
          Math.abs(rimTravel - relativeTravel.length()) < 0.001,
          `${carrier.id}: actual rendered tread and moving graded salt cover the same distance`,
        );
      }
  } finally {
    fleet.dispose();
  }
});

test('fleet batches retain all authored LOD vertices, normals, finish coordinates, indices and materials', () => {
  const track = createLevel().createTrack(),
    fleet = createNomadFleetBatches({ track, source });
  try {
    assert.deepEqual(fleet.report, {
      batches: 10,
      hullInstances: retainedInstances('carrier', track.carriers.length),
      wheelInstances: retainedInstances('wheel', track.carriers.length),
      hullTriangles: retainedTriangleCounts('carrier'),
      wheelTriangles: retainedTriangleCounts('wheel'),
    });
    const camera = new T.PerspectiveCamera();
    for (const [level, distance] of [0, 2200, 6000].entries()) {
      camera.position
        .copy(track.carriers[0].origin)
        .add(new T.Vector3(distance, 0, 0));
      camera.updateMatrixWorld();
      fleet.update({ camera });
      for (const batch of fleet.group.children) {
        assert.equal(batch.perObjectFrustumCulled, true);
        assert.equal(batch.sortObjects, false);
        assert.equal(batch.castShadow, true);
        assert.equal(batch.receiveShadow, true);
        const kind = batch.userData.nomadFleetKind;
        const originals = partsOf(kind, level).get(sourceMaterial(batch)) ?? [];
        const copies = kind === 'wheel' ? anchors.length : 1;
        for (
          let part = 0;
          part < partCount(kind, sourceMaterial(batch));
          part++
        ) {
          const original = originals[part];
          const instance = part * copies;
          assert.equal(
            batch.getVisibleAt(instance),
            Boolean(original),
            `${batch.name}/${level}/${part}: retained part visibility`,
          );
          if (!original) continue;
          if (batch.userData.nomadFleetKind === 'wheel') {
            assert.notEqual(batch.material, original.material);
            assert.deepEqual(batch.material.color, original.material.color);
            for (const property of [
              'map',
              'normalMap',
              'roughnessMap',
              'metalnessMap',
              'envMap',
            ])
              assert.equal(
                batch.material[property],
                original.material[property],
              );
            assert.equal(batch.material.opacity, original.material.opacity);
            assert.equal(
              batch.material.transparent,
              original.material.transparent,
            );
          } else assert.equal(batch.material, original.material);
          const range = batch.getGeometryRangeAt(
            batch.getGeometryIdAt(instance),
          );
          assert.equal(
            range.vertexCount,
            original.geometry.attributes.position.count,
          );
          assert.equal(range.indexCount, original.geometry.index.count);
          for (const [name, attribute] of Object.entries(
            original.geometry.attributes,
          )) {
            const packed = batch.geometry.attributes[name];
            assert.equal(packed.itemSize, attribute.itemSize);
            assert.equal(packed.normalized, attribute.normalized);
            for (let vertex = 0; vertex < attribute.count; vertex++)
              for (
                let component = 0;
                component < attribute.itemSize;
                component++
              )
                assert.equal(
                  packed.getComponent(range.vertexStart + vertex, component),
                  attribute.getComponent(vertex, component),
                  `${batch.name}/${level}/${name}/${vertex}/${component}`,
                );
          }
          for (let index = 0; index < range.indexCount; index++)
            assert.equal(
              batch.geometry.index.getX(range.indexStart + index) -
                range.vertexStart,
              original.geometry.index.getX(index),
            );
          if (
            !original.geometry.hasAttribute('uv') &&
            batch.geometry.hasAttribute('uv')
          )
            for (let vertex = 0; vertex < range.vertexCount; vertex++)
              assert.equal(
                batch.geometry.attributes.uv.getX(range.vertexStart + vertex) +
                  batch.geometry.attributes.uv.getY(range.vertexStart + vertex),
                0,
              );
        }
      }
    }
    const versions = fleet.group.children.map(
      (batch) => batch._matricesTexture.version,
    );
    fleet.update({ camera });
    assert.deepEqual(
      fleet.group.children.map((batch) => batch._matricesTexture.version),
      versions,
      'a paused pose and stable LOD do not re-upload matrix textures',
    );
    track.presentationTime += 0.1;
    fleet.update({ camera });
    assert.ok(
      fleet.group.children.every(
        (batch, index) => batch._matricesTexture.version > versions[index],
      ),
      'real carrier and wheel motion immediately refreshes every material batch',
    );
  } finally {
    fleet.dispose();
  }
});

test('all carrier/wheel matrices, world vertices and bounds agree with the former hierarchy at every LOD and motion phase', (t) => {
  const track = createLevel().createTrack(),
    fleet = createNomadFleetBatches({ track, source });
  const camera = new T.PerspectiveCamera(),
    actual = new T.Matrix4();
  let maxError = 0,
    matrices = 0,
    vertices = 0;
  try {
    for (const time of [0, 9.5, 27, 81.125]) {
      track.presentationTime = time;
      for (const [carrierIndex, carrier] of track.carriers.entries()) {
        const position = carrier.origin
          .clone()
          .add(sampleCarrierMotion(carrier, time).translation);
        for (const [level, distance] of [0, 2200, 6000].entries()) {
          camera.position.copy(position).add(new T.Vector3(distance, 0, 0));
          camera.updateMatrixWorld();
          fleet.update({ camera });
          for (const batch of fleet.group.children) {
            const kind = batch.userData.nomadFleetKind;
            const originals =
              partsOf(kind, level).get(sourceMaterial(batch)) ?? [];
            const count = partCount(kind, sourceMaterial(batch));
            const copies = kind === 'wheel' ? anchors.length : 1;
            for (let part = 0; part < count; part++) {
              const original = originals[part];
              for (let anchor = 0; anchor < copies; anchor++) {
                const instance =
                  (carrierIndex * count + part) * copies + anchor;
                assert.equal(
                  batch.getVisibleAt(instance),
                  Boolean(original),
                  `${carrier.id}/${kind}/${level}/${part}: retained part visibility`,
                );
                if (!original) continue;
                const range = batch.getGeometryRangeAt(
                  batch.getGeometryIdAt(instance),
                );
                assert.equal(
                  range.indexCount,
                  original.geometry.index.count,
                  `${carrier.id}/${kind}/${level}`,
                );
                batch.getMatrixAt(instance, actual);
                const expected = expectedMatrix(
                  carrier,
                  time,
                  kind,
                  anchor,
                  original,
                  track.saltPlane.grade,
                );
                for (let index = 0; index < 16; index++)
                  assert.ok(
                    Math.abs(
                      actual.elements[index] - expected.elements[index],
                    ) < 0.001,
                    `${carrier.id}/${kind}/${anchor}: matrix component ${index}`,
                  );
                matrices++;
                const attribute = original.geometry.attributes.position;
                // Every actual source vertex for the first carrier and wheel;
                // the remaining placements use their exact matrices and extrema.
                const stride =
                  carrierIndex === 0 && anchor === 0
                    ? 1
                    : Math.max(1, Math.floor(attribute.count / 24));
                for (
                  let vertex = 0;
                  vertex < attribute.count;
                  vertex += stride
                ) {
                  const point = new T.Vector3().fromBufferAttribute(
                    attribute,
                    vertex,
                  );
                  const expectedPoint = point.clone().applyMatrix4(expected);
                  const actualPoint = point.applyMatrix4(actual);
                  maxError = Math.max(
                    maxError,
                    expectedPoint.distanceTo(actualPoint),
                  );
                  vertices++;
                  assert.ok(
                    batch.boundingBox.containsPoint(actualPoint),
                    `${batch.name}: bounded full motion`,
                  );
                  assert.ok(
                    batch.boundingSphere.containsPoint(actualPoint),
                    `${batch.name}: bounded all wheel angles`,
                  );
                }
                if (kind === 'wheel') {
                  const centre = new T.Vector3().applyMatrix4(actual);
                  const ry = new T.Vector3(0, anchors[anchor].rollingRadius, 0)
                    .applyMatrix4(actual)
                    .distanceTo(centre);
                  const rz = new T.Vector3(0, 0, anchors[anchor].rollingRadius)
                    .applyMatrix4(actual)
                    .distanceTo(centre);
                  assert.ok(
                    Math.abs(ry - rz) < 0.00001,
                    `${carrier.id}: rotating tyres stay circular`,
                  );
                }
              }
            }
          }
        }
      }
    }
    assert.ok(maxError < 0.0015, `maximum world error ${maxError}`);
    t.diagnostic(
      `${matrices} exact hierarchy matrices, ${vertices} vertices, maximum float32 world error ${maxError.toFixed(7)}m`,
    );
  } finally {
    fleet.dispose();
  }
});

test('LOD transitions match THREE.LOD including camera zoom and a transformed parent', () => {
  const track = createLevel().createTrack(),
    carrier = track.carriers[0];
  const fleet = createNomadFleetBatches({ track, source, carriers: [carrier] });
  const reference = new T.Group(),
    root = new T.Object3D(),
    lod = new T.LOD();
  fleet.group.position.set(71, -43, 102);
  fleet.group.rotation.y = 0.2;
  fleet.group.scale.set(1.02, 0.99, 1.01);
  reference.copy(fleet.group, false);
  reference.add(root);
  root.add(lod);
  for (const distance of [0, 1800, 4500]) lod.addLevel(new T.Group(), distance);
  const camera = new T.PerspectiveCamera();
  try {
    track.presentationTime = 19;
    root.position
      .copy(carrier.origin)
      .add(sampleCarrierMotion(carrier, 19).translation);
    root.quaternion.copy(carrier.quaternion);
    root.scale.copy(carrier.scale);
    reference.updateWorldMatrix(true, true);
    const origin = new T.Vector3().setFromMatrixPosition(lod.matrixWorld);
    for (const zoom of [1, 2])
      for (const distance of [
        0, 1799.99, 1800, 1800.01, 4499.99, 4500, 4500.01, 7000, 1700,
      ]) {
        camera.zoom = zoom;
        camera.position.copy(origin).add(new T.Vector3(distance * zoom, 0, 0));
        camera.updateMatrixWorld();
        lod.update(camera);
        fleet.update({ camera });
        const expectedLevel = lod.getCurrentLevel();
        for (const batch of fleet.group.children) {
          const kind = batch.userData.nomadFleetKind;
          const originals =
            partsOf(kind, expectedLevel).get(sourceMaterial(batch)) ?? [];
          const copies = kind === 'wheel' ? anchors.length : 1;
          for (
            let part = 0;
            part < partCount(kind, sourceMaterial(batch));
            part++
          ) {
            const original = originals[part];
            const instance = part * copies;
            assert.equal(
              batch.getVisibleAt(instance),
              Boolean(original),
              `${batch.name}/${expectedLevel}/${part}: retained part visibility`,
            );
            if (!original) continue;
            assert.equal(
              batch.getGeometryRangeAt(batch.getGeometryIdAt(instance))
                .indexCount,
              original.geometry.index.count,
            );
          }
        }
      }
  } finally {
    fleet.dispose();
  }
});

test('batch disposal is idempotent, releases owned native resources once and never releases borrowed sources or finishes', () => {
  const track = createLevel().createTrack(),
    borrowed = new Map(),
    released = new Map();
  const watch = (object, map) =>
    object.addEventListener('dispose', () =>
      map.set(object, (map.get(object) ?? 0) + 1),
    );
  source.traverse((mesh) => {
    if (mesh.isMesh) {
      watch(mesh.geometry, borrowed);
      watch(mesh.material, borrowed);
    }
  });
  const fleet = createNomadFleetBatches({ track, source });
  const ownedFinishes = new Set();
  for (const batch of fleet.group.children) {
    watch(batch, released);
    watch(batch.geometry, released);
    watch(batch._matricesTexture, released);
    watch(batch._indirectTexture, released);
    if (
      batch.material !== sourceMaterial(batch) &&
      !ownedFinishes.has(batch.material)
    ) {
      ownedFinishes.add(batch.material);
      watch(batch.material, released);
    }
  }
  const expected = fleet.report.batches * 4 + ownedFinishes.size;
  fleet.dispose();
  fleet.dispose();
  fleet.update();
  assert.equal(fleet.group.children.length, 0);
  assert.equal(borrowed.size, 0);
  assert.equal(released.size, expected);
  assert.ok([...released.values()].every((count) => count === 1));
  const invalid = source.clone(true);
  invalid.getObjectByName('nomad_wheel_far').removeFromParent();
  const events = [],
    originalDispose = T.BatchedMesh.prototype.dispose;
  T.BatchedMesh.prototype.dispose = function () {
    events.push(this);
    return originalDispose.call(this);
  };
  try {
    assert.throws(
      () => createNomadFleetBatches({ track, source: invalid }),
      /missing a detail tier/,
    );
  } finally {
    T.BatchedMesh.prototype.dispose = originalDispose;
  }
  assert.equal(
    events.length,
    6,
    'already acquired hull batches unwind after a wheel-tier error',
  );
  assert.equal(borrowed.size, 0);
});

test('replacing one carrier hull retains every rolling wheel and its exact moving transform', () => {
  const track = createLevel().createTrack();
  const full = createNomadFleetBatches({ track, source });
  const replaced = createNomadFleetBatches({
    track,
    source,
    excludeHullIds: ['nomad-saltwind'],
  });
  try {
    assert.equal(
      replaced.report.hullInstances,
      (full.report.hullInstances * (track.carriers.length - 1)) /
        track.carriers.length,
    );
    assert.equal(replaced.report.wheelInstances, full.report.wheelInstances);
    for (const time of [0, 17]) {
      track.presentationTime = time;
      full.update();
      replaced.update();
      for (const batch of full.group.children.filter(
        (child) => child.userData.nomadFleetKind === 'wheel',
      )) {
        const other = replaced.group.children.find(
          (child) =>
            child.userData.nomadFleetKind === 'wheel' &&
            child.userData.nomadSourceMaterialUUID ===
              batch.userData.nomadSourceMaterialUUID,
        );
        assert.equal(other.instanceCount, batch.instanceCount);
        for (let index = 0; index < batch.instanceCount; index++) {
          const a = new T.Matrix4(),
            b = new T.Matrix4();
          batch.getMatrixAt(index, a);
          other.getMatrixAt(index, b);
          assert.deepEqual(a.elements, b.elements);
        }
      }
    }
  } finally {
    full.dispose();
    replaced.dispose();
  }
});

test('Nomad industrial finishes compose real district and hall material kinds with strict active anchors', () => {
  const track = createLevel().createTrack();
  for (const [create, suffix] of [
    [createNomadDistricts, '-nomad-working-district-local-v1'],
    [createNomadHallMachinery, '-nomad-hoist-local-v1'],
  ]) {
    const fixture = observedIndustrialFinish();
    const owner = create({ track, finish: fixture.finish });
    try {
      assert.deepEqual(
        fixture.bindings.map(({ kind }) => kind),
        ['shell', 'steel', 'dark', 'cast', 'machined'],
      );
      for (const binding of fixture.bindings) {
        const machined = binding.kind === 'machined';
        assertAttachedIndustrialFinish(binding, machined);
        assert.equal(
          binding.material.customProgramCacheKey(),
          binding.key + (machined ? '' : suffix),
        );
      }
      assertRequiredIndustrialAnchors(
        fixture,
        fixture.bindings.filter(({ kind }) => kind !== 'machined'),
      );
      const unbound = create({ track });
      try {
        const unboundMaterials = materialsIn([unbound.group]);
        for (const { material: bound } of fixture.bindings) {
          const material = [...unboundMaterials].find(
            (candidate) => candidate.name === bound.name,
          );
          assert.ok(material, `${bound.name}: retained without a finish`);
          const stock = shaderProgram(material),
            shader = shaderProgram(material);
          assert.doesNotThrow(() => material.onBeforeCompile(shader, null));
          assert.equal(shader.vertexShader, stock.vertexShader);
          assert.equal(shader.fragmentShader, stock.fragmentShader);
          assert.equal(
            material.customProgramCacheKey(),
            T.Material.prototype.onBeforeCompile.toString(),
          );
        }
      } finally {
        unbound.dispose();
      }
    } finally {
      owner.dispose();
      fixture.finish.dispose();
    }
  }
});

test('Nomad industrial finishes compose loaded carrier materials and require only their active anchors', async () => {
  const track = createLevel().createTrack(),
    fixture = observedIndustrialFinish(),
    assets = await environmentAssets();
  const road = createNomadRoad({ track, collisionOnly: true });
  const environment = createNomadEnvironment({
    track,
    road: { ...road, finish: fixture.finish },
    loadAsset: assets.loadAsset,
  });
  try {
    await environment.ready;
    const bindings = fixture.bindings.filter(({ material }) =>
      material.customProgramCacheKey().includes('-nomad-attached-finish-v1'),
    );
    assert.deepEqual([...new Set(bindings.map(({ kind }) => kind))].sort(), [
      'dark',
      'shell',
      'steel',
    ]);
    for (const binding of bindings) {
      assertAttachedIndustrialFinish(binding);
      assert.equal(
        binding.material.customProgramCacheKey(),
        binding.key +
          '-nomad-attached-finish-v1' +
          (/ivory/.test(binding.material.name) ? '-nomad-coating-wear-v2' : ''),
      );
    }
    assertRequiredIndustrialAnchors(fixture, bindings);
  } finally {
    environment.dispose();
    road.dispose();
    fixture.finish.dispose();
  }
});

test('environment integration retains carrier attachments, absent-finish shaders and cleans up normal, interrupted and failed loads', async () => {
  const track = createLevel().createTrack();
  const { scenes, loadAsset } = await environmentAssets();
  const attachedScenes = scenes.filter(
    (_, index) => environmentPaths[index] !== 'salt-escarpments.glb',
  );
  const originalPrograms = new Map(
    [...materialsIn(attachedScenes)].map((material) => [
      material,
      {
        shader: shaderProgram(material),
        key: material.customProgramCacheKey(),
      },
    ]),
  );
  const expectedAttachedNames = new Set(
    [...originalPrograms.keys()]
      .filter((material) => !/rubber|amber|glazing/.test(material.name))
      .map((material) => material.name),
  );
  const environment = createNomadEnvironment({
    track,
    loadAsset,
  });
  await environment.ready;
  try {
    const attachedNames = new Set();
    for (const material of materialsIn(attachedScenes)) {
      if (/rubber|amber|glazing/.test(material.name)) continue;
      const original = originalPrograms.get(material);
      const shader = shaderProgram(material);
      assert.doesNotThrow(() => material.onBeforeCompile(shader, null));
      assert.equal(shader.vertexShader, original.shader.vertexShader);
      assert.equal(shader.fragmentShader, original.shader.fragmentShader);
      assert.equal(
        material.customProgramCacheKey(),
        original.key + '-nomad-attached-finish-v1',
      );
      attachedNames.add(material.name);
    }
    assert.ok(expectedAttachedNames.size > 0);
    assert.deepEqual(attachedNames, expectedAttachedNames);
    assert.equal(
      environment.carrierRoots
        .get('nomad-companion-starboard-heavy')
        .children.filter((child) => child.name === 'nomad_companion_armour')
        .length,
      1,
    );
    assert.equal(
      environment.carrierRoots
        .get('nomad-companion-port-tender')
        .children.find((child) => child.name === 'nomad_companion_armour').scale
        .x,
      -1,
    );
    let batches = 0,
      lods = 0;
    environment.group.traverse((object) => {
      if (object.userData.nomadFleetKind) batches++;
      if (object.isLOD) lods++;
    });
    assert.equal(batches, 10);
    assert.equal(lods, 0);
    track.presentationTime = 17;
    environment.update();
    for (const carrier of track.carriers) {
      const root = environment.carrierRoots.get(carrier.id);
      assert.ok(
        root.position.distanceTo(
          carrier.origin
            .clone()
            .add(sampleCarrierMotion(carrier, 17).translation),
        ) < 1e-10,
      );
      assert.equal(
        root.children.filter((child) => child.name === 'nomad_freight').length,
        2,
      );
      assert.equal(
        root.children.filter((child) => child.name === 'nomad_receiver_crown')
          .length,
        carrier.id === 'nomad-passing-deck' ? 1 : 0,
      );
      assert.equal(
        root.children.filter((child) => child.name === 'nomad_interior_freight')
          .length,
        carrier.id === 'nomad-freight-cathedral' ? 1 : 0,
      );
      assert.equal(
        root.children.filter((child) => child.name === 'nomad_saltwind_gallery')
          .length,
        carrier.id === 'nomad-saltwind' ? 1 : 0,
      );
      assert.equal(
        root.children.filter((child) => child.name === 'nomad_saltwind_hull')
          .length,
        carrier.id === 'nomad-saltwind' ? 1 : 0,
      );
      assert.equal(
        root.children.filter((child) => child.name === 'nomad_wallride_service')
          .length,
        carrier.id === 'nomad-portside-dive' ? 1 : 0,
      );
    }
  } finally {
    environment.dispose();
    environment.dispose();
  }
  const late = await Promise.all(environmentPaths.map((path) => model(path))),
    pending = [],
    released = new Map();
  for (const scene of late)
    scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (const resource of [mesh.geometry, mesh.material])
        if (!released.has(resource)) {
          released.set(resource, 0);
          resource.addEventListener('dispose', () =>
            released.set(resource, released.get(resource) + 1),
          );
        }
    });
  const interrupted = createNomadEnvironment({
    track,
    loadAsset: () => new Promise((resolve) => pending.push(resolve)),
  });
  await Promise.resolve();
  assert.equal(pending.length, environmentPaths.length);
  interrupted.dispose();
  pending.forEach((resolve, index) => resolve({ scene: late[index] }));
  await interrupted.ready;
  interrupted.dispose();
  assert.ok(
    [...released.values()].every((count) => count === 1),
    'late source assets are released once',
  );
  const failed = createNomadEnvironment({
    track,
    loadAsset: async () => {
      throw new Error('fixture load failure');
    },
  });
  await assert.rejects(failed.ready, /could not load/);
  failed.dispose();
});
