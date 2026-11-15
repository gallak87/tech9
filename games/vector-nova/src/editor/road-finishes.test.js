import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import * as T from 'three';
import { EDITOR_BIOMES } from './biomes.js';
import { attachRoadFinish } from './road-finishes.js';

test('CPU road builders never import finish factories or request textures in any biome', async () => {
  for (const biome of EDITOR_BIOMES) {
    const material = new T.MeshStandardMaterial();
    const original = material.onBeforeCompile;
    const owner = attachRoadFinish(material, {
      id: biome.id,
      renderer: null,
      loadFinish: () => {
        throw new Error('CPU loaded a finish');
      },
    });
    await owner.ready;
    owner.dispose();
    owner.dispose();
    assert.equal(material.onBeforeCompile, original);
    assert.equal(material.map, null);
    material.dispose();
  }
});

test('finish ownership handles disposal before import and while native maps settle', async () => {
  for (const aborting of [false, true]) {
    let complete, began;
    const started = new Promise((resolve) => {
      began = resolve;
    });
    const controller = new AbortController();
    let disposed = 0,
      materialDisposed = 0;
    const material = new T.MeshStandardMaterial();
    material.addEventListener('dispose', () => materialDisposed++);
    const owner = attachRoadFinish(material, {
      id: 'orbital',
      renderer: {},
      signal: controller.signal,
      loadFinish: async () => {
        began();
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    });
    await started;
    if (aborting) controller.abort();
    else owner.dispose();
    complete({
      ready: Promise.resolve(),
      dispose() {
        disposed++;
      },
    });
    await owner.ready;
    owner.dispose();
    assert.equal(disposed, 1);
    assert.equal(materialDisposed, 0);
    material.dispose();
  }
  let rejectMap,
    disposed = 0;
  const owner = attachRoadFinish(new T.MeshStandardMaterial(), {
    id: 'nacre',
    renderer: {},
    loadFinish: async () => ({
      ready: new Promise((resolve, reject) => {
        rejectMap = reject;
      }),
      dispose() {
        disposed++;
      },
    }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  owner.dispose();
  rejectMap(new Error('late failed request'));
  await owner.ready;
  assert.equal(disposed, 1);
});

test('live load failure releases resources and reflection is borrowed without owning the material', async () => {
  const material = new T.MeshStandardMaterial();
  let disposed = 0,
    reflected;
  const reflection = new T.Texture();
  const detail = new T.Texture();
  const leases = new Set([detail]);
  const owner = attachRoadFinish(material, {
    id: 'nomad',
    renderer: {},
    loadFinish: async () => ({
      ready: Promise.resolve(),
      ownedTextures: leases,
      setReflection(value) {
        reflected = value;
      },
      dispose() {
        disposed++;
      },
    }),
  });
  owner.setReflection(reflection);
  await owner.ready;
  assert.equal(reflected, reflection);
  assert.equal(owner.ownedTextures, leases);
  assert.equal(owner.ownedTextures.has(reflection), false);
  owner.dispose();
  assert.deepEqual([...owner.ownedTextures], []);
  assert.equal(disposed, 1);
  material.dispose();
  reflection.dispose();
  detail.dispose();
  const failure = attachRoadFinish(new T.MeshStandardMaterial(), {
    id: 'glasswake',
    renderer: {},
    loadFinish: async () => ({
      ready: Promise.reject(new Error('map failed')),
      dispose() {
        disposed++;
      },
    }),
  });
  await assert.rejects(failure.ready, /Glasswake Comet/);
  failure.dispose();
  assert.equal(disposed, 2);
});

test('attribute-free procedural finishes compile against the editor standard-material contract', async () => {
  for (const id of ['vesper-forest', 'saffron', 'zephyr', 'oriel']) {
    const material = new T.MeshStandardMaterial();
    const owner = attachRoadFinish(material, { id, renderer: {} });
    await owner.ready;
    const shader = {
      vertexShader: T.ShaderLib.standard.vertexShader,
      fragmentShader: T.ShaderLib.standard.fragmentShader,
      uniforms: {},
    };
    material.onBeforeCompile(shader, {});
    assert(
      !/nacrePanel|ceramicPanel|steelCoord|umbraCassette|_umbralight/.test(
        shader.vertexShader + shader.fragmentShader,
      ),
    );
    assert.notEqual(shader.fragmentShader, T.ShaderLib.standard.fragmentShader);
    owner.dispose();
    material.dispose();
  }
});
