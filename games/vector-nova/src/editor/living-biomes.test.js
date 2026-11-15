import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { generateDocument, analyzeDocument } from './document.js';
import { createEditorTrack } from './track.js';
import { createRegionPlan } from './region-plan.js';
import { createProductionEnvironment } from './production-environment.js';
import { livingBiomeDescriptor } from './living-biomes.js';
import { createRouteClearance } from '../environment/placement.js';

test('production Nightweir and Vesper keep authored roads exact and reserve native corridors', async () => {
  for (const biome of ['nightweir', 'vesper-forest']) {
    const doc = generateDocument({
      biome,
      seed: 42,
      length: 10000,
      crossovers: 0.65,
      environmentSeed: 7001,
    });
    const before = JSON.stringify(doc);
    const track = createEditorTrack(doc),
      plan = createRegionPlan(doc, track),
      solids = [];
    const descriptor = livingBiomeDescriptor(biome);
    const owner = createProductionEnvironment(doc, track, {
      descriptor,
      plan,
      collectSolid: (s) => solids.push(s),
    });
    await owner.ready;
    assert(analyzeDocument(doc).valid);
    assert.equal(JSON.stringify(doc), before);
    assert(owner.group.userData.region.assemblies > 15, biome);
    assert(
      solids.some((s) => s.kind === 'structure'),
      biome,
    );
    const clears = createRouteClearance(track, {
      spacing: 8,
      sidePadding: 30,
      localVertical: [-22, 44],
    }).clears;
    for (const record of owner.group.userData.regionalPlacements) {
      const box = new T.Box3(
        new T.Vector3(...record.bounds.min),
        new T.Vector3(...record.bounds.max),
      );
      const center = box.getCenter(new T.Vector3()),
        size = box.getSize(new T.Vector3());
      assert(
        clears(center.x, center.z, size.x, size.z, box.max.y, 0, box.min.y),
        record.id,
      );
    }
    if (biome === 'nightweir')
      assert(new Set(solids.map((s) => s.asset).filter(Boolean)).size >= 3);
    if (biome === 'vesper-forest') {
      assert(owner.group.userData.region.groveTrees > 25);
      assert(
        !solids.some((s) => /leaf|understory.*leaf/i.test(s.name)),
        'foliage stays non-solid',
      );
    }
    const contacts = solids.filter((s) => s.kind === 'structure');
    assert(
      contacts.reduce(
        (sum, s) =>
          sum +
          (s.geometry.index?.count ?? s.geometry.attributes.position.count) / 3,
        0,
      ) < 100000,
      `${biome} has bounded structural contact cost`,
    );
    owner.dispose();
    owner.dispose();
    assert.equal(owner.group.children.length, 0);
  }
});

test('Vesper binds production anchored foliage after owned surfaces become ready', async (t) => {
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    async () => new T.Texture(),
  );
  const doc = generateDocument({
    biome: 'vesper-forest',
    seed: 42,
    length: 3000,
    environmentSeed: 7001,
  });
  const track = createEditorTrack(doc);
  const owner = createProductionEnvironment(doc, track, {
    descriptor: livingBiomeDescriptor(doc.biome),
  });
  try {
    await owner.ready;
    const foliage = [];
    owner.group.traverse((mesh) => {
      if (mesh.isInstancedMesh && mesh.geometry.getAttribute('windAnchor'))
        foliage.push(mesh);
    });
    assert(foliage.length > 0, 'the actual rooted understory is present');
    for (const mesh of foliage) {
      assert.match(
        mesh.material.customProgramCacheKey(),
        /weather-anchored-foliage/,
      );
      assert.equal(mesh.castShadow, false, 'soft foliage remains decorative');
      assert(
        owner.ownedTextures.has(mesh.material.map),
        'late-loaded maps stay in the world lifetime',
      );
    }
    const shader = {
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    foliage[0].material.onBeforeCompile(shader);
    owner.update({
      time: 12,
      mode: 'racing',
      settings: { reducedMotion: false },
    });
    assert.equal(shader.uniforms.foliageWeatherTime.value, 12);
    assert(shader.uniforms.foliageWeatherWind.value.length() > 0);
  } finally {
    owner.dispose();
  }
});
