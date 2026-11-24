import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as T from 'three';
import { staticBiomeDescriptor } from './static-biomes.js';
import { generateDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { PLAYABLE_STARTERS } from './playable-starters.js';
import { createRegionPlan } from './region-plan.js';
import {
  createProductionPlacement,
  createProductionEnvironment,
} from './production-environment.js';
import { createAssetKit } from './asset-kit.js';
import { STATIC_CONTACT_FACE_LIMIT } from './static-biome-plans.js';
import { createIndustrialBiomeFinish } from './static-biome-finishes.js';
import { buildRavelSails } from './ravel-sails.js';

const families = [
  'zephyr',
  'glasswake',
  'saffron',
  'helion',
  'umbra',
  'ravel',
  'nomad',
  'oriel',
  'worldspire',
];
function fixture(biome, length = 3000, courseType = 'circuit', seed = 42017) {
  return generateDocument({
    biome,
    seed,
    environmentSeed: 90210,
    length,
    courseType,
    seedJumps: false,
    bendiness: 0.55,
    elevation: 0.55,
  });
}
function resolved(doc) {
  const descriptor = staticBiomeDescriptor(doc.biome),
    track = createEditorTrack(doc),
    plan = createRegionPlan(doc, track);
  const placement = createProductionPlacement(doc, track, plan, {
    assets: descriptor.assets,
    limit: descriptor.limit,
  });
  descriptor.plan(doc, track, plan, placement);
  return { descriptor, track, plan, placement };
}

test('Ravel keeps its collector sails on a route with protected jumps', (t) => {
  const doc = generateDocument({
    biome: 'ravel',
    seed: 42017,
    environmentSeed: 42,
    length: 5000,
    bendiness: 0.55,
    elevation: 0.55,
    jumpFrequency: 'normal',
    jumpSize: 'mixed',
  });
  const { track, placement } = resolved(doc);
  assert.equal(track.jumps.length, 2);
  const sails = buildRavelSails({ track, doc, placement });
  t.after(() => sails.dispose());
  const collectors = sails.group.children.filter((mesh) => !mesh.isBatchedMesh);
  assert(collectors.length >= 3);
  for (const mesh of collectors)
    assert(
      placement.clears(mesh.geometry.boundingBox.clone().expandByScalar(30)),
    );
});

test('Zephyr fullness fills the Harbor braid with clear islands at seed 6104', () => {
  const starter = PLAYABLE_STARTERS.find(({ id }) => id === 'harbor');
  for (const sceneryPreset of ['basilica-isles-v1', 'garden-isles-v1']) {
    const counts = [0.1, 0.5, 1].map((density) => {
      const doc = generateDocument({
        ...starter.options,
        biome: 'zephyr',
        sceneryPreset,
        density,
      });
      const { descriptor, placement } = resolved(doc);
      let triangles = 0;
      for (const record of placement.placements) {
        assert(placement.clears(record.bounds), record.id);
        triangles += descriptor.assets[record.asset].visualTriangles;
      }
      assert(triangles <= 700000);
      return placement.placements.length;
    });
    assert(counts[0] >= 5 && counts[0] <= 8, sceneryPreset);
    assert(counts[1] >= 16, sceneryPreset);
    assert(counts[2] >= counts[1] + 5, sceneryPreset);
  }
});

test('all nine static production families are deterministic, route-cleared and source-budgeted through 20km', () => {
  assert.equal(staticBiomeDescriptor('nightweir'), null);
  for (const biome of families)
    for (const [length, courseType] of [
      [3000, 'circuit'],
      [20000, 'downhill'],
    ]) {
      const doc = fixture(biome, length, courseType),
        before = JSON.stringify(doc);
      const one = resolved(doc),
        two = resolved(doc);
      const signature = (records) =>
        records.map(({ id, asset, matrix, solid }) => [
          id,
          asset,
          matrix.toArray(),
          solid,
        ]);
      assert.deepEqual(
        signature(one.placement.placements),
        signature(two.placement.placements),
        biome,
      );
      assert(
        one.placement.placements.length > 0,
        biome + ' has actual production art',
      );
      assert(one.placement.placements.length <= one.descriptor.limit, biome);
      assert(
        one.placement.placements.reduce(
          (sum, record) =>
            sum + one.descriptor.assets[record.asset].visualTriangles,
          0,
        ) <= 700000,
        biome,
      );
      assert(
        one.placement.placements.filter((record) => record.solid).length <= 4,
        biome + ' limits exact structural contacts',
      );
      assert(
        one.placement.placements.reduce(
          (sum, record) => sum + record.contactFaces,
          0,
        ) <= STATIC_CONTACT_FACE_LIMIT,
        biome + ' limits art contact faces',
      );
      for (const record of one.placement.placements) {
        assert(one.placement.clears(record.bounds), biome + '/' + record.id);
        assert.equal(
          record.role,
          record.solid ? 'structural-contact' : 'decorative',
        );
        if (one.descriptor.assets[record.asset].proxy === 'none') {
          assert.equal(record.solid, false);
          assert.equal(
            one.placement.accepted.find((entry) => entry.id === record.id).lod,
            'far',
          );
        }
      }
      assert.equal(
        JSON.stringify(doc),
        before,
        'art planning preserves the authored road and independent seeds',
      );
      if (biome === 'worldspire')
        assert.equal(
          one.placement.placements.length,
          1,
          'one whole monolith retains its authored sector composition',
        );
    }
});

test('Glasswake seeds produce varied canyon walls whose coverage grows with scenery fullness', () => {
  const { options } = PLAYABLE_STARTERS.find(({ id }) => id === 'canyon');
  const canyon = (environmentSeed, density, sceneryPreset = 'glacier-v1') => {
    const { placement, track } = resolved(
      generateDocument({
        ...options,
        biome: 'glasswake',
        sceneryPreset,
        environmentSeed,
        density,
      }),
    );
    for (const { bounds } of placement.placements)
      assert(
        placement.clears(bounds),
        'preserves the route and jump corridors',
      );
    const walls = placement.placements.filter(({ id }) =>
      id.startsWith('glacier-wall-'),
    );
    const nearRoad = [];
    for (let s = 0; s < track.length; s += 50) {
      const { position } = track.sample(s);
      for (const { bounds } of walls)
        if (bounds.distanceToPoint(position) < 250)
          nearRoad.push(bounds.max.y - position.y);
    }
    assert(nearRoad.length > 0);
    return {
      walls,
      canyonHeight: Math.max(...nearRoad),
    };
  };
  const low = canyon(42, 0.25);
  const medium = canyon(42, 0.7);
  const full = canyon(42, 1);
  const another = canyon(4294967295, 1);
  assert(low.walls.length < medium.walls.length);
  assert(medium.walls.length < full.walls.length);
  for (const layout of [full, another]) {
    assert(new Set(layout.walls.map(({ asset }) => asset)).size >= 4);
    assert(layout.canyonHeight > 350);
    assert(
      layout.walls.filter((wall) =>
        layout.walls.some(
          (other) => wall !== other && wall.bounds.intersectsBox(other.bounds),
        ),
      ).length >=
        layout.walls.length / 2,
      'adjoining wall segments create longer ice faces',
    );
  }
  const profiles = ({ walls }) => walls.map(({ id, asset }) => [id, asset]);
  assert.notDeepEqual(profiles(full), profiles(another));
  const shelf = canyon(11142, 0.7, 'frozen-shelf-v1');
  assert(shelf.canyonHeight < medium.canyonHeight);
});

test('selected real GLB prototypes load inside trusted bounds with independent owned materials', async () => {
  const sources = new Map();
  async function loadAsset(url) {
    if (!sources.has(url))
      sources.set(
        url,
        (async () => {
          const bytes = await readFile(
            new URL('../../public' + url, import.meta.url),
          );
          return new GLTFLoader().parseAsync(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
            '',
          );
        })(),
      );
    return sources.get(url);
  }
  for (const biome of families) {
    const { descriptor, placement } = resolved(fixture(biome));
    const assets = Object.fromEntries(
      Object.entries(descriptor.assets).map(([id, value]) => [
        id,
        { ...value, url: value.url },
      ]),
    );
    const kit = createAssetKit({
      assets,
      placements: placement.placements,
      loadAsset,
      loadTexture: async () => new T.Texture(),
      textures: descriptor.textures,
      configureTexture: descriptor.configureTexture,
      finishMaterial: descriptor.finishMaterial,
    });
    try {
      await kit.ready;
      assert(kit.group.children.length > 0, biome);
      assert(
        kit.group.children.every((mesh) => mesh.isInstancedMesh),
        biome,
      );
      assert(kit.materials.size > 0, biome);
      assert(
        kit.group.children.every(
          (mesh) => mesh.geometry.boundingBox && mesh.boundingBox,
        ),
        biome,
      );
    } finally {
      kit.dispose();
    }
  }
});

test('static CPU collision is available synchronously from the exact same accepted placement records', async () => {
  for (const biome of families)
    for (const [length, courseType] of [
      [3000, 'circuit'],
      [20000, 'downhill'],
    ]) {
      const doc = fixture(biome, length, courseType),
        resolvedPlan = resolved(doc),
        solids = [];
      const owner = createProductionEnvironment(doc, resolvedPlan.track, {
        descriptor: resolvedPlan.descriptor,
        plan: resolvedPlan.plan,
        collectSolid: (record) => solids.push(record),
      });
      try {
        await owner.ready;
        const physical = resolvedPlan.placement.placements.filter(
          (record) => record.solid,
        );
        assert.equal(
          solids.filter((record) => record.asset).length,
          physical.length,
          biome,
        );
        assert(
          solids
            .filter((record) => record.asset)
            .every((record) => record.geometry.index?.count > 0),
          biome + ' preserves actual indexed contact faces',
        );
        const faces = solids
          .filter((record) => record.asset)
          .reduce((sum, record) => sum + record.geometry.index.count / 3, 0);
        assert(
          faces <= STATIC_CONTACT_FACE_LIMIT,
          biome + ' actual compiled contact budget',
        );
        assert.equal(owner.group.userData.region.artContactFaces, faces);
        assert.equal(
          owner.group.userData.region.structuralContactAssemblies,
          physical.length,
        );
        assert.equal(
          owner.group.userData.region.decorativeAssemblies,
          resolvedPlan.placement.placements.length - physical.length,
        );
        assert.equal(
          owner.group.userData.region.productionAssets,
          resolvedPlan.placement.placements.length,
          biome,
        );
      } finally {
        owner.dispose();
      }
    }
});

test('exact Umbra structure contacts preserve the visible vault opening', async () => {
  const asset = staticBiomeDescriptor('umbra').assets.vault,
    solids = [];
  const kit = createAssetKit({
    assets: { vault: asset },
    placements: [
      { id: 'vault', asset: 'vault', matrix: new T.Matrix4(), solid: true },
    ],
    collectSolid: (record) => solids.push(record),
  });
  await kit.ready;
  const material = new T.MeshBasicMaterial({ side: T.DoubleSide }),
    mesh = new T.Mesh(solids[0].geometry, material);
  mesh.updateMatrixWorld();
  try {
    const ray = new T.Raycaster(
      new T.Vector3(0, 20, -200),
      new T.Vector3(0, 0, 1),
    );
    assert.equal(
      ray.intersectObject(mesh).length,
      0,
      'the open centre is traversable, rather than sealed by a hull',
    );
    ray.ray.origin.set(60, 55, -200);
    assert(
      ray.intersectObject(mesh).length > 0,
      'the real stone arch still has contact',
    );
  } finally {
    material.dispose();
    kit.dispose();
  }
});

test('industrial map owners retain the production binder and dispose late canceled image loads', async () => {
  const original = T.TextureLoader.prototype.loadAsync,
    pending = [];
  T.TextureLoader.prototype.loadAsync = (url) =>
    new Promise((resolve) => pending.push({ url, resolve }));
  const renderer = { capabilities: { getMaxAnisotropy: () => 8 } };
  try {
    const finish = createIndustrialBiomeFinish({ renderer }, 'nomad');
    assert(pending.every(({ url }) => url.includes('assets/editor/surfaces/')));
    const maps = pending.splice(0).map(({ resolve }) => {
      const texture = new T.Texture();
      resolve(texture);
      return texture;
    });
    await finish.ready;
    const material = new T.MeshStandardMaterial();
    material.name = 'Nomad ivory armour';
    finish.finishMaterial(material);
    const shader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    material.onBeforeCompile(shader, renderer);
    assert.equal(
      shader.uniforms.industrialDetail.value,
      maps[1],
      'native finish samples the owned enamel',
    );
    assert(shader.vertexShader.includes('industrialCoord'));
    assert(
      shader.fragmentShader.includes('armourNormal'),
      'the original Nomad armour modifier remains active',
    );
    const lathe = new T.MeshStandardMaterial();
    lathe.name = 'Machined bearing';
    finish.finishMaterial(lathe, {
      industrialKind: 'machined',
      industrialCoordinates: 'part',
    });
    const latheShader = {
      uniforms: {},
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
    };
    lathe.onBeforeCompile(latheShader, renderer);
    assert(
      latheShader.fragmentShader.includes('toolMark'),
      'explicit native machined roles retain physical lathe marks',
    );
    assert.equal(latheShader.uniforms.industrialDetail.value, maps[0]);
    material.dispose();
    lathe.dispose();
    finish.dispose();
    assert.equal(finish.ownedTextures.size, 0);
    const canceled = createIndustrialBiomeFinish({ renderer }, 'ravel');
    canceled.dispose();
    let disposed = 0;
    for (const { resolve } of pending.splice(0)) {
      const texture = new T.Texture();
      texture.addEventListener('dispose', () => disposed++);
      resolve(texture);
    }
    await canceled.ready;
    assert.equal(disposed, 2);
    assert.equal(
      canceled.ownedTextures.size,
      0,
      'late images are released without retaining disposed textures',
    );
  } finally {
    T.TextureLoader.prototype.loadAsync = original;
  }
});
