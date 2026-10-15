import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createWorldspireTrack } from '../src/levels/worldspire/track/model.js';
import { createAwakening } from '../src/levels/worldspire/environment/awakening.js';
import { createWorldspireEnvironment } from '../src/levels/worldspire/environment/index.js';
import { createNightweirTrack } from '../src/levels/nightweir/track/model.js';
import { createNightweirWater } from '../src/levels/nightweir/environment/water.js';
import { wetnessAt } from '../src/levels/zephyr/environment/atmosphere.js';

test('Awakening rewinds exactly and reduced motion preserves the navigation state', () => {
  const track = createWorldspireTrack(),
    texture = new T.Texture(),
    a = createAwakening(track, texture);
  const plates = a.group.getObjectByName(
    'Worldspire / paired grown valve leaves',
  );
  const quiet = Array.from(plates.instanceMatrix.array);
  a.update({ state: { distance: 7000 } });
  const opening = Array.from(plates.instanceMatrix.array);
  assert.notDeepEqual(opening, quiet);
  a.update({ state: { distance: 7000 }, settings: { reducedMotion: true } });
  assert.deepEqual(Array.from(plates.instanceMatrix.array), opening);
  a.update({ state: { distance: 0 } });
  assert.deepEqual(Array.from(plates.instanceMatrix.array), quiet);
  const gs = new Set(),
    ms = new Set();
  a.group.traverse((o) => {
    if (o.geometry) gs.add(o.geometry);
    if (o.material) ms.add(o.material);
    if (o.isInstancedMesh) o.dispose();
  });
  gs.forEach((g) => g.dispose());
  ms.forEach((m) => m.dispose());
  texture.dispose();
});

test('failed Worldspire model loading releases the concurrently acquired texture', async () => {
  const texture = new T.Texture();
  let released = 0;
  texture.addEventListener('dispose', () => released++);
  await assert.rejects(
    createWorldspireEnvironment({
      track: createWorldspireTrack(),
      loadAsset: async () => {
        throw new Error('model unavailable');
      },
      loadTexture: async () => texture,
    }),
    /model unavailable/,
  );
  assert.equal(released, 1);
});

test('Floodgates open on approach, rewind exactly, freeze flow under reduced motion and dispose once', () => {
  const track = createNightweirTrack(),
    water = createNightweirWater(track),
    gate = water.group.getObjectByName('Nightweir / rising sluice leaves');
  const i = 2,
    s = track.curtains[i].s,
    m = new T.Matrix4(),
    y = () => {
      gate.getMatrixAt(i, m);
      return m.elements[13];
    };
  water.update({ state: { distance: s - 350 }, time: 10 });
  const closed = y();
  water.update({ state: { distance: s - 190 }, time: 10 });
  const mid = y();
  water.update({ state: { distance: s - 50 }, time: 10 });
  const open = y();
  assert.ok(closed < mid && mid < open);
  assert.ok(Math.abs(open - closed - 26) < 0.01);
  const fixed = Array.from(gate.instanceMatrix.array);
  water.update({ state: { distance: s - 50 }, time: 10 });
  assert.deepEqual(Array.from(gate.instanceMatrix.array), fixed);
  assert.equal(water.group.userData.flowTime, 10);
  water.update({
    state: { distance: s - 50 },
    time: 20,
    settings: { reducedMotion: true },
  });
  assert.equal(water.group.userData.flowTime, 0);
  assert.deepEqual(Array.from(gate.instanceMatrix.array), fixed);
  water.update({ state: { distance: s - 350 }, time: 0 });
  assert.equal(y(), closed);
  for (const c of track.curtains) {
    assert.equal(wetnessAt(track, c.s), 1);
    assert.equal(wetnessAt(track, c.s - 15), 0);
    assert.equal(wetnessAt(track, c.s + 15), 0);
  }
  const resources = new Set();
  water.group.traverse((o) => {
    if (o.geometry) resources.add(o.geometry);
    if (o.material) resources.add(o.material);
  });
  const disposed = new Map();
  for (const r of resources)
    r.addEventListener('dispose', () =>
      disposed.set(r, (disposed.get(r) ?? 0) + 1),
    );
  water.dispose();
  water.dispose();
  assert.equal(water.group.children.length, 0);
  for (const r of resources) assert.equal(disposed.get(r), 1);
});

test('Nightweir owns its linear water composition and releases it once while borrowing reflections', async () => {
  const { createNightweirEnvironment } =
    await import('../src/levels/nightweir/environment/index.js');
  const root = new T.Group(),
    geometry = new T.BoxGeometry(),
    material = new T.MeshStandardMaterial();
  root.add(new T.Mesh(geometry, material));
  const reflected = new T.Texture();
  let attached = 0,
    detached = 0,
    geometryReleased = 0,
    materialReleased = 0,
    reflectionReleased = 0;
  geometry.addEventListener('dispose', () => geometryReleased++);
  material.addEventListener('dispose', () => materialReleased++);
  reflected.addEventListener('dispose', () => reflectionReleased++);
  const environment = await createNightweirEnvironment({
    track: createNightweirTrack(),
    loadAsset: async () => ({ scene: root }),
    view: {
      attachWorldPass(pass) {
        attached++;
        assert.equal(pass.needsSwap, false);
        assert.equal(pass.enabled, true);
        pass.render();
        return () => detached++;
      },
    },
  });
  environment.setReflection(reflected);
  environment.update({
    state: { distance: 4945 },
    camera: { position: new T.Vector3(0, 1500, 2000) },
    time: 4,
  });
  environment.dispose();
  environment.dispose();
  assert.deepEqual(
    {
      attached,
      detached,
      geometryReleased,
      materialReleased,
      reflectionReleased,
    },
    {
      attached: 1,
      detached: 1,
      geometryReleased: 1,
      materialReleased: 1,
      reflectionReleased: 0,
    },
  );
  reflected.dispose();
});

test('Nightweir loads both bare gzip and HTTP-decoded city payloads', async (t) => {
  const { gzipSync } = await import('node:zlib');
  const { createNightweirEnvironment } =
    await import('../src/levels/nightweir/environment/index.js');
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'City payload fixture' }],
  });
  const length = Math.ceil(Buffer.byteLength(json) / 4) * 4;
  const glb = Buffer.alloc(20 + length, 0x20);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  glb.write(json, 20);
  for (const encoded of [true, false])
    await t.test(encoded ? 'bare gzip' : 'HTTP decoded', async (child) => {
      child.mock.method(
        globalThis,
        'fetch',
        async () => new Response(encoded ? gzipSync(glb) : glb),
      );
      const environment = await createNightweirEnvironment({
        track: createNightweirTrack(),
      });
      try {
        assert.ok(environment.group.getObjectByName('City_payload_fixture'));
      } finally {
        environment.dispose();
      }
    });
});

test('Nightweir keeps its warmed light count through the start and jump while extinguishing distant fixtures', async () => {
  const { createNightweirEnvironment } =
    await import('../src/levels/nightweir/environment/index.js');
  const { createNightweirRoad } =
    await import('../src/levels/nightweir/track/road.js');
  const track = createNightweirTrack(),
    road = createNightweirRoad({ track }),
    environment = await createNightweirEnvironment({
      track,
      loadAsset: async () => ({ scene: new T.Group() }),
    }),
    camera = new T.PerspectiveCamera();
  const lights = () => {
    const result = [];
    for (const owner of [road, environment])
      owner.group.traverseVisible((o) => {
        if (o.isPointLight) result.push(o);
      });
    return result;
  };
  const count = lights().length;
  assert.ok(count > 0);
  try {
    const powers = new Set();
    for (const distance of [
      0,
      2,
      84,
      91,
      5676,
      6029,
      6266,
      ...track.curtains.map((c) => c.s),
    ]) {
      camera.position.copy(track.sample(distance).position);
      for (const owner of [road, environment]) owner.update({ camera });
      assert.equal(
        lights().length,
        count,
        `shader light count at ${distance}m`,
      );
      const power = lights().reduce((sum, l) => sum + l.intensity, 0);
      assert.ok(
        power > 0,
        `nearby fixtures illuminate the route at ${distance}m`,
      );
      powers.add(power);
    }
    assert.ok(powers.size > 1, 'lights still respond to the local district');
    camera.position.set(1e7, 1e7, 1e7);
    for (const owner of [road, environment]) owner.update({ camera });
    assert.equal(
      lights().length,
      count,
      'distant fixtures retain shader slots',
    );
    assert.ok(
      lights().every((l) => l.intensity === 0),
      'distant fixtures cast no light',
    );
  } finally {
    road.dispose();
    environment.dispose();
  }
});

test('Nightweir dam curtains stay downstream of their spill lips and solid faces', async () => {
  const { default: kit } = await import(
    '../assets/levels/nightweir/water-kit.json',
    { with: { type: 'json' } }
  );
  const water = createNightweirWater(createNightweirTrack());
  try {
    const sheets = water.group.getObjectByName(
      'Nightweir / actual falling curtains',
    );
    const positions = sheets.geometry.getAttribute('position');
    const phases = sheets.geometry.getAttribute('sourcePhase');
    assert.equal(
      sheets.material.depthTest,
      true,
      'buildings still occlude water',
    );
    for (const fall of kit.falls.filter((f) => f.kind === 'dam')) {
      let count = 0;
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(phases.getX(i) - fall.seed) > 0.00001) continue;
        count++;
        // The exported dam face is four metres upstream of the spill mouth.
        // Every triangle stays in front when all its vertices do: the old bow
        // crossed back into that wall midway down every broad waterfall.
        assert.ok(
          positions.getZ(i) >= fall.top[2] - 0.0001,
          `dam at z=${fall.top[2]} bends upstream into its retaining wall`,
        );
        if (
          Math.abs(positions.getY(i) - fall.top[1]) < 0.0001 ||
          Math.abs(positions.getY(i) - (fall.top[1] - fall.height)) < 0.0001
        )
          assert.ok(
            Math.abs(positions.getZ(i) - fall.top[2]) < 0.0001,
            'fall remains attached to its spill lip and receiving foam',
          );
      }
      assert.ok(count > 0, 'every authored dam has a rendered curtain');
    }
  } finally {
    water.dispose();
  }
});
