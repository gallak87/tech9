import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { generateDocument } from './document.js';
import { createEditorTrack } from './track.js';
import {
  createProductionEnvironment,
  createProductionPlacement,
} from './production-environment.js';
import { createRegionPlan } from './region-plan.js';
import { createEditorOwner } from './world-owner.js';
import { createProceduralAssemblies } from './procedural-assemblies.js';
import { proceduralBiomeDescriptor } from './procedural-biomes.js';
import { flattenNacreBatches } from './nacre-biome.js';
import { NACRE_WAVE_HEIGHT_BOUND } from '../levels/nacre/environment/ocean-waves.js';

function fingerprint(owner) {
  const hash = createHash('sha256');
  owner.group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    hash.update(mesh.name);
    for (const key of [
      'position',
      'normal',
      'uv',
      'color',
      'industrialCoord',
    ]) {
      const data = mesh.geometry.getAttribute(key)?.array;
      if (data)
        hash.update(
          new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        );
    }
    const data = mesh.instanceMatrix?.array;
    if (data)
      hash.update(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
  });
  return hash.digest('hex');
}

test('canonical manufactured assemblies keep deterministic full bounds and matching rendered/CPU geometry', async () => {
  for (const biome of ['orbital', 'halcyon', 'colossus']) {
    const doc = generateDocument({
      biome,
      seed: 42,
      environmentSeed: 7001,
      length: 3000,
      seedJumps: false,
    });
    const before = JSON.stringify(doc),
      track = createEditorTrack(doc),
      plan = createRegionPlan(doc, track),
      descriptor = proceduralBiomeDescriptor(biome);
    const solids = [];
    const cpu = createProductionEnvironment(doc, track, {
      plan,
      descriptor,
      collectSolid: (solid) => solids.push(solid),
    });
    const visual = createProductionEnvironment(doc, track, {
      plan,
      descriptor,
    });
    await Promise.all([cpu.ready, visual.ready]);
    assert.equal(fingerprint(cpu), fingerprint(visual), biome);
    assert(cpu.group.userData.region.assemblies > 12, biome);
    assert(cpu.group.userData.region.assemblies <= descriptor.limit, biome);
    assert(solids.length > 25, biome);
    const clear = createProductionPlacement(doc, track, plan);
    for (const record of cpu.group.userData.regionalPlacements) {
      assert(
        clear.clears(
          new T.Box3(
            new T.Vector3(...record.bounds.min),
            new T.Vector3(...record.bounds.max),
          ),
        ),
        record.id,
      );
    }
    const displayed = new Set();
    cpu.group.traverse((mesh) => {
      if (mesh.geometry) displayed.add(mesh.geometry);
    });
    const sourceTriangles = new Set();
    for (const geometry of displayed) {
      const position = geometry.attributes.position,
        index = geometry.index;
      for (let i = 0, count = index?.count ?? position.count; i < count; i += 3)
        sourceTriangles.add(
          [0, 1, 2]
            .map((n) => {
              const at = index ? index.getX(i + n) : i + n;
              return [
                position.getX(at),
                position.getY(at),
                position.getZ(at),
              ].join(',');
            })
            .join(';'),
        );
    }
    for (const solid of solids) {
      if (displayed.has(solid.geometry)) continue;
      const p = solid.geometry.attributes.position,
        index = solid.geometry.index;
      for (let i = 0, count = index?.count ?? p.count; i < count; i += 3) {
        const triangle = [0, 1, 2]
          .map((n) => {
            const at = index ? index.getX(i + n) : i + n;
            return [p.getX(at), p.getY(at), p.getZ(at)].join(',');
          })
          .join(';');
        assert(
          sourceTriangles.has(triangle),
          'structural contact uses exact visible source faces',
        );
      }
    }
    assert.equal(JSON.stringify(doc), before);
    const one = fingerprint(cpu);
    const changed = structuredClone(doc);
    changed.environment.seed++;
    const other = createProductionEnvironment(changed, track, { descriptor });
    await other.ready;
    assert.notEqual(
      fingerprint(other),
      one,
      biome + ' world seed affects placement',
    );
    cpu.dispose();
    visual.dispose();
    other.dispose();
  }
});

test('canonical assembly adapter preserves holes, shader clocks and exclusively owned late textures', async () => {
  const doc = generateDocument({ biome: 'orbital', seed: 7, seedJumps: false }),
    track = createEditorTrack(doc),
    plan = createRegionPlan(doc, track);
  const owner = createEditorOwner('Owned canonical fixture', true, {
    regional: true,
  });
  const placement = createProductionPlacement(doc, track, plan);
  const shape = new T.Shape([
    new T.Vector2(-20, -20),
    new T.Vector2(20, -20),
    new T.Vector2(20, 20),
    new T.Vector2(-20, 20),
  ]);
  shape.holes.push(
    new T.Path([
      new T.Vector2(-12, -12),
      new T.Vector2(-12, 12),
      new T.Vector2(12, 12),
      new T.Vector2(12, -12),
    ]),
  );
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: 8,
    bevelEnabled: false,
  });
  const time = { value: 0 },
    texture = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const material = new T.ShaderMaterial({
    uniforms: { time, map: { value: texture } },
  });
  material.name = 'Fixture / cliff screen';
  material.userData.editorVisualOnly = true;
  const group = new T.Group();
  group.add(new T.Mesh(geometry, material));
  let ready,
    disposed = 0,
    textureDisposals = 0;
  texture.addEventListener('dispose', () => textureDisposals++);
  const source = {
    prototypes: { frame: group },
    ownedTextures: new Set([texture]),
    ready: new Promise((done) => {
      ready = done;
    }),
    dispose() {
      disposed++;
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
  const solids = [];
  const kit = createProceduralAssemblies(
    { doc, track, plan, owner, placement, collectSolid: (s) => solids.push(s) },
    source,
  );
  owner.borrowed.push(kit);
  assert(
    kit.emit('frame', {
      id: 'screen',
      x: plan.bounds.min.x + 100,
      z: plan.bounds.min.z + 100,
    }),
  );
  owner.finish();
  ready();
  await kit.ready;
  assert.equal(
    solids.length,
    0,
    'explicit non-solid source role remains non-solid',
  );
  const rendered = owner.group.children.find((node) => node.isInstancedMesh);
  assert.equal(rendered.material.uniforms.time, time);
  assert.equal(rendered.material.uniforms.map.value, texture);
  assert(kit.ownedTextures.has(texture));
  assert.equal(rendered.castShadow, false);
  owner.dispose();
  owner.dispose();
  assert.equal(disposed, 1);
  assert.equal(textureDisposals, 1);
});

test('Cindercoil parses actual named geology with owned production finish and synchronous exact contact', async (t) => {
  const descriptor = proceduralBiomeDescriptor('cindercoil');
  const doc = generateDocument({
      biome: 'cindercoil',
      seed: 42,
      environmentSeed: 7001,
      length: 3000,
      seedJumps: false,
    }),
    track = createEditorTrack(doc);
  let loads = 0;
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    loads++;
    assert.match(
      url,
      /^\/assets\/levels\/cindercoil\/cindercoil-hero-kit-v7\.glb$/,
    );
    const bytes = await readFile(
      new URL('../../public' + url, import.meta.url),
    );
    return new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
  });
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    async () => new T.Texture(),
  );
  const solids = [];
  const cpu = createProductionEnvironment(doc, track, {
    descriptor,
    collectSolid: (s) => solids.push(s),
  });
  assert.equal(loads, 0, 'CPU contact never awaits a model or image');
  const visual = createProductionEnvironment(doc, track, { descriptor });
  await visual.ready;
  assert.equal(loads, 1, 'all named families share a single parsed source');
  assert(
    visual.group.userData.region.assemblies >=
      cpu.group.userData.region.assemblies,
  );
  assert(cpu.group.userData.region.assemblies > 20);
  const registered = new Set(Object.keys(descriptor.assets));
  assert(solids.some((solid) => registered.has(solid.asset)));
  assert(
    visual.group.children.some((group) =>
      group.name.includes('registered art'),
    ),
  );
  cpu.dispose();
  visual.dispose();
});

test('an open canonical frame keeps its aperture in emitted CPU faces', async () => {
  const doc = generateDocument({
      biome: 'colossus',
      seed: 7,
      seedJumps: false,
    }),
    track = createEditorTrack(doc),
    plan = createRegionPlan(doc, track);
  const owner = createEditorOwner('Physical aperture fixture', true, {
    regional: true,
  });
  const placement = createProductionPlacement(doc, track, plan);
  const shape = new T.Shape([
    new T.Vector2(-20, -20),
    new T.Vector2(20, -20),
    new T.Vector2(20, 20),
    new T.Vector2(-20, 20),
  ]);
  shape.holes.push(
    new T.Path([
      new T.Vector2(-12, -12),
      new T.Vector2(-12, 12),
      new T.Vector2(12, 12),
      new T.Vector2(12, -12),
    ]),
  );
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: 8,
    bevelEnabled: false,
  });
  const material = new T.MeshStandardMaterial({
    name: 'Colossus / open structural frame',
  });
  const group = new T.Group();
  group.add(new T.Mesh(geometry, material));
  const solids = [];
  const kit = createProceduralAssemblies(
    {
      doc,
      track,
      plan,
      owner,
      placement,
      collectSolid: (solid) => solids.push(solid),
    },
    {
      prototypes: { frame: group },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    },
  );
  owner.borrowed.push(kit);
  assert(
    kit.emit('frame', {
      id: 'open frame',
      x: plan.bounds.min.x + 100,
      z: plan.bounds.min.z + 100,
    }),
  );
  owner.finish();
  await kit.ready;
  assert.equal(solids.length, 1);
  const solid = solids[0],
    points = solid.geometry.attributes.position;
  function hitAt(x) {
    const ray = new T.Ray(
      new T.Vector3(x, 0, -20).applyMatrix4(solid.matrix),
      new T.Vector3(0, 0, 1).transformDirection(solid.matrix),
    );
    for (let i = 0; i < points.count; i += 3) {
      const face = [0, 1, 2].map((n) =>
        new T.Vector3()
          .fromBufferAttribute(points, i + n)
          .applyMatrix4(solid.matrix),
      );
      if (ray.intersectTriangle(...face, false, new T.Vector3())) return true;
    }
    return false;
  }
  assert.equal(hitAt(0), false, 'the through-opening remains empty');
  assert.equal(
    hitAt(17),
    true,
    'the adjacent thick frame has real contact faces',
  );
  owner.dispose();
});

test('source instance transforms and colors cannot be silently discarded', () => {
  const geometry = new T.BoxGeometry(),
    material = new T.MeshStandardMaterial();
  const instances = new T.InstancedMesh(geometry, material, 2);
  instances.setMatrixAt(1, new T.Matrix4().makeTranslation(100, 0, 0));
  instances.setColorAt(1, new T.Color('#448866'));
  const group = new T.Group();
  group.add(instances);
  assert.throws(
    () =>
      createProceduralAssemblies({}, { prototypes: { unflattened: group } }),
    /Flatten canonical source instances/,
  );
  instances.dispose();
  geometry.dispose();
  material.dispose();
});

test('assembly contact overrides keep rendered geometry and placement while leasing private proxy topology', async () => {
  const visualGeometry = new T.SphereGeometry(10, 12, 8),
    proxy = new T.BoxGeometry(2, 80, 4);
  // A deliberately displaced sentinel makes accidental proxy-bound seating or
  // replacement of visible topology immediately observable.
  proxy.translate(500, 0, 0);
  const material = new T.MeshStandardMaterial({ name: 'Forest / wood' });
  const leafMaterial = new T.MeshStandardMaterial({
    name: 'Forest / leaf',
    transparent: true,
  });
  const group = new T.Group(),
    trunk = new T.Mesh(visualGeometry, material);
  trunk.name = 'trunk';
  trunk.position.set(8, 3, -4);
  trunk.rotation.y = 0.35;
  trunk.userData.editorCollisionGeometry = proxy;
  const branches = new T.Mesh(visualGeometry, material);
  branches.name = 'branches';
  branches.position.set(-12, 10, 2);
  branches.userData.editorCollisionGeometry = false;
  const leaves = new T.Mesh(visualGeometry, leafMaterial);
  leaves.name = 'leaves';
  leaves.position.set(0, 12, 0);
  leaves.userData.editorCollisionGeometry = proxy;
  group.add(trunk, branches, leaves);
  let sourceDisposals = 0,
    originalProxyDisposals = 0;
  proxy.addEventListener('dispose', () => originalProxyDisposals++);
  const owner = createEditorOwner('Contact override fixture', true, {
    regional: true,
  });
  const contacts = [],
    accepted = [];
  const kit = createProceduralAssemblies(
    {
      owner,
      doc: { biome: 'vesper' },
      plan: { surfaceHeight: () => 7 },
      placement: {
        acceptBounds(bounds) {
          accepted.push(bounds.clone());
          return true;
        },
      },
      collectSolid: (solid) => contacts.push(solid),
    },
    {
      prototypes: { tree: group },
      dispose() {
        sourceDisposals++;
        visualGeometry.dispose();
        proxy.dispose();
        material.dispose();
        leafMaterial.dispose();
      },
    },
  );
  owner.borrowed.push(kit);
  const localBounds = new T.Box3().setFromObject(group);
  assert(
    kit.localBounds.tree.equals(localBounds),
    'proxy bounds never affect the visible assembly bounds',
  );
  assert(
    kit.emit('tree', { id: 'tree-a', x: 30, z: -40, yaw: 1.1, scale: 1.3 }),
  );
  assert(
    kit.emit('tree', { id: 'tree-b', x: -80, z: 20, yaw: -0.4, scale: 0.8 }),
  );
  assert.equal(
    contacts.length,
    2,
    'disabled branches and transparent leaves never produce contact',
  );
  assert.notEqual(
    contacts[0].geometry,
    proxy,
    'source proxy remains exclusive to its source owner',
  );
  assert.equal(
    contacts[0].geometry,
    contacts[1].geometry,
    'proxy topology is cloned once per owner',
  );
  assert.deepEqual(
    contacts[0].geometry.attributes.position.array,
    proxy.attributes.position.array,
  );
  let clonedProxyDisposals = 0;
  contacts[0].geometry.addEventListener(
    'dispose',
    () => clonedProxyDisposals++,
  );
  owner.finish();
  await kit.ready;
  assert.equal(
    clonedProxyDisposals,
    0,
    'finishing rendered batches retains non-rendered contact geometry',
  );
  const meshes = owner.group.children.filter((node) => node.isInstancedMesh);
  const wood = meshes.find((node) => node.material.name === material.name);
  assert.deepEqual(
    wood.geometry.attributes.position.array,
    visualGeometry.attributes.position.array,
    'visual geometry is unchanged',
  );
  const renderedMatrices = meshes
    .filter((node) => node.material.name === material.name)
    .flatMap((mesh) =>
      Array.from({ length: mesh.count }, (_, index) => {
        const matrix = new T.Matrix4();
        mesh.getMatrixAt(index, matrix);
        return matrix;
      }),
    );
  for (let i = 0; i < 2; i++) {
    assert(
      renderedMatrices.some((rendered) =>
        contacts[i].matrix.elements.every(
          (value, n) => Math.abs(value - rendered.elements[n]) < 1e-5,
        ),
      ),
      'proxy and visible part share the exact anchor',
    );
    assert(
      accepted[i].max.x - accepted[i].min.x < 100,
      'huge sentinel proxy does not affect placement',
    );
  }
  owner.dispose();
  owner.dispose();
  assert.equal(clonedProxyDisposals, 1);
  assert.equal(originalProxyDisposals, 1);
  assert.equal(sourceDisposals, 1);
});

test('production scenery contact stays bounded for short and maximum-length courses', async () => {
  for (const biome of ['orbital', 'halcyon', 'colossus', 'cindercoil', 'nacre'])
    for (const length of [3000, 20000]) {
      const doc = generateDocument({
        biome,
        seed: 42,
        environmentSeed: 7001,
        length,
        seedJumps: false,
      });
      const solids = [],
        environment = createProductionEnvironment(doc, createEditorTrack(doc), {
          descriptor: proceduralBiomeDescriptor(biome),
          collectSolid: (solid) => solids.push(solid),
        });
      await environment.ready;
      const faces = solids
        .filter((solid) => solid.kind === 'structure')
        .reduce(
          (total, solid) =>
            total +
            (solid.geometry.index?.count ??
              solid.geometry.attributes.position.count) /
              3,
          0,
        );
      assert(
        faces > 0 && faces <= 90000,
        `${biome} ${length}: ${faces} exact structural contact faces`,
      );
      assert(
        environment.group.userData.region.assemblies > 15,
        'contact budget keeps the visible complete scenery',
      );
      environment.dispose();
    }
});

test('Nacre flattens original instance placement/tint without changing calcareous tissue tone', () => {
  const geometry = new T.BoxGeometry();
  geometry.setAttribute(
    'color',
    new T.Float32BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 3).fill(0.5),
      3,
    ),
  );
  const material = new T.MeshStandardMaterial({ vertexColors: true });
  const mesh = new T.InstancedMesh(geometry, material, 2);
  mesh.setMatrixAt(0, new T.Matrix4());
  mesh.setMatrixAt(1, new T.Matrix4().makeTranslation(100, 0, 0));
  mesh.setColorAt(0, new T.Color(1, 0.5, 0.25));
  mesh.setColorAt(1, new T.Color(0.25, 1, 0.5));
  const group = new T.Group();
  group.position.set(7, 1, 4);
  group.add(mesh);
  const flattened = flattenNacreBatches(group),
    result = flattened.children[0].geometry;
  result.computeBoundingBox();
  assert.equal(result.boundingBox.min.x, 6.5);
  assert.equal(result.boundingBox.max.x, 107.5);
  assert.equal(result.attributes.color.getY(0), 0.25);
  assert.equal(result.attributes.nacreSourceTissueTone.getX(0), 0.5);
  assert(flattened.children.every((part) => !part.isInstancedMesh));
  result.dispose();
  material.dispose();
});

test('Nacre owns real ocean waves below every driving reservation and rooted canonical reef contact', async () => {
  const doc = generateDocument({
      biome: 'nacre',
      seed: 42,
      environmentSeed: 7001,
      length: 3000,
      seedJumps: false,
    }),
    track = createEditorTrack(doc);
  const descriptor = proceduralBiomeDescriptor('nacre'),
    plan = createRegionPlan(doc, track),
    solids = [];
  const cpu = createProductionEnvironment(doc, track, {
    descriptor,
    plan,
    collectSolid: (solid) => solids.push(solid),
  });
  const skyTexture = new T.Texture();
  let skyDisposals = 0;
  skyTexture.addEventListener('dispose', () => skyDisposals++);
  const visual = createProductionEnvironment(doc, track, {
    backdropAssets: { skyTexture },
    descriptor,
    plan,
    preview: true,
  });
  await Promise.all([cpu.ready, visual.ready]);
  assert(cpu.group.userData.region.assemblies > 15);
  assert.deepEqual(
    cpu.group.userData.regionalPlacements,
    visual.group.userData.regionalPlacements,
  );
  let water;
  visual.group.traverse((mesh) => {
    if (mesh.userData.editorOcean) water = mesh;
  });
  assert(water);
  assert.equal(water.material.uniforms.stormSky.value, skyTexture);
  assert.equal(water.material.defines.NACRE_SKY_REFLECTION, 1);
  assert.equal(
    water.position.y,
    plan.oceanWaterY,
    'ocean, terrain and foundations share the surveyed datum',
  );
  for (const point of plan.roadSamples)
    assert(water.position.y + NACRE_WAVE_HEIGHT_BOUND < point.minY);
  assert.equal(water.userData.getPresentation().quality, 'low');
  assert.equal(water.userData.getPresentation().displaced, true);
  visual.update({ time: 17, settings: { quality: 'high' } });
  assert.equal(water.material.uniforms.time.value, 17);
  assert.equal(
    water.userData.getPresentation().quality,
    'low',
    'editing keeps its bounded Low water presentation',
  );
  const camera = new T.PerspectiveCamera();
  camera.position.set(17000, plan.oceanWaterY - 20, -12000);
  visual.update({ camera, time: 28, settings: { reducedMotion: true } });
  assert(Math.abs(camera.position.x - water.position.x) <= 6);
  assert(Math.abs(camera.position.z - water.position.z) <= 6);
  assert.equal(water.material.uniforms.time.value, 0);
  assert.equal(water.material.uniforms.wetness.value, 1);
  camera.position.y = plan.oceanWaterY + 1900;
  const surfaceLookAt = new T.Vector3(17000, plan.oceanWaterY, -14200);
  camera.lookAt(surfaceLookAt);
  visual.update({ camera, time: 28, settings: {} });
  assert(
    Math.abs(water.position.z - surfaceLookAt.z) <= 6,
    'overview resolves the water beneath its subject',
  );
  camera.position.y = plan.oceanWaterY;
  visual.update({ camera, time: 29, settings: {} });
  assert.equal(water.material.uniforms.nearSurface.value, 0);
  assert(
    solids.some(
      (solid) => solid.name.includes('headland') || solid.name.includes('reef'),
    ),
  );
  let disposed = 0;
  water.material.addEventListener('dispose', () => disposed++);
  cpu.dispose();
  visual.dispose();
  visual.dispose();
  assert.equal(disposed, 1);
  assert.equal(skyDisposals, 0);
  skyTexture.dispose();
});
