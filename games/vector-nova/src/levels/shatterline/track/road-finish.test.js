import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { createShatterlineTrack } from './model.js';
import { createShatterlineRoad } from './road.js';
import { createAsphalt } from '../../halcyon/track/asphalt.js';

function deferred(t) {
  const pending = [];
  t.mock.method(KTX2Loader.prototype, 'detectSupport', function () {
    return this;
  });
  t.mock.method(
    KTX2Loader.prototype,
    'loadAsync',
    (url) =>
      new Promise((resolve, reject) => pending.push({ url, resolve, reject })),
  );
  return {
    pending,
    renderer: { capabilities: { getMaxAnisotropy: () => 16 } },
  };
}

test('asphalt reuse keeps both road UV scales metric and Halcyon defaults intact', async (t) => {
  const { pending, renderer } = deferred(t);
  for (const [length, options] of [
    [16, undefined],
    [32, { uvLength: 32, label: 'Shatterline', moisture: 0.34 }],
  ]) {
    const finish = createAsphalt(renderer, 50, options);
    const maps = [
      new THREE.Texture(),
      new THREE.Texture(),
      new THREE.Texture(),
    ];
    pending.splice(0).forEach((load, i) => load.resolve(maps[i]));
    await finish.ready;
    for (const map of maps)
      assert.deepEqual(map.repeat.toArray(), [50 / 2.05, length / 2.05]);
    assert.equal(maps[0].colorSpace, THREE.SRGBColorSpace);
    assert.equal(maps[1].colorSpace, THREE.NoColorSpace);
    assert.equal(maps[2].colorSpace, THREE.NoColorSpace);
    const shader = {
      uniforms: {},
      vertexShader: '#include <uv_vertex>',
      fragmentShader: '',
    };
    finish.material.onBeforeCompile(shader);
    assert.equal(
      shader.uniforms.roadMoisture.value,
      length === 16 ? 0.8 : 0.34,
    );
    finish.dispose();
  }
});

test('Shatterline awaits shared maps, preserves tube cutouts and releases owned resources once', async (t) => {
  const { pending, renderer } = deferred(t);
  const track = createShatterlineTrack();
  const road = createShatterlineRoad({ track, view: { renderer } });
  const maps = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()];
  const released = [0, 0, 0];
  maps.forEach((map, i) =>
    map.addEventListener('dispose', () => released[i]++),
  );
  assert.equal(pending.length, 3);
  assert.ok(pending.every(({ url }) => url.includes('/halcyon/asphalt/')));
  pending.forEach((load, i) => load.resolve(maps[i]));
  await road.ready;
  const decks = road.group.children.filter((o) => /^Deck \d+$/.test(o.name));
  assert.equal(decks.length, track.tubeMesh.roadRuns.length);
  assert.equal(decks[0].material.normalMap, maps[1]);
  for (const deck of decks) {
    const coord = deck.geometry.attributes.roadCoord;
    assert.ok(
      [...deck.geometry.attributes.normal.array].every(Number.isFinite),
    );
    for (let i = 0; i < coord.count; i++)
      assert.ok(
        !track.tubes.some(
          (tube) =>
            coord.getX(i) > tube.start + 0.01 &&
            coord.getX(i) < tube.end - 0.01,
        ),
      );
  }
  const probe = new THREE.Texture();
  let probeReleased = 0;
  probe.addEventListener('dispose', () => probeReleased++);
  road.setReflection(probe);
  road.dispose();
  road.dispose();
  assert.deepEqual(released, [1, 1, 1]);
  assert.equal(probeReleased, 0);
  probe.dispose();
});

test('failed or late asphalt decoding cannot leave a partial or live material behind', async (t) => {
  const { pending, renderer } = deferred(t);
  for (const fail of [false, true]) {
    const finish = createAsphalt(renderer, 50, {
      uvLength: 32,
      label: 'Shatterline',
    });
    const loads = pending.splice(0),
      maps = [new THREE.Texture(), new THREE.Texture(), new THREE.Texture()];
    const releases = [0, 0, 0];
    maps.forEach((m, i) => m.addEventListener('dispose', () => releases[i]++));
    if (!fail) finish.dispose();
    loads.forEach((load, i) =>
      fail && i === 1
        ? load.reject(Error('missing normal'))
        : load.resolve(maps[i]),
    );
    if (fail)
      await assert.rejects(finish.ready, /Shatterline asphalt failed to load/);
    else await finish.ready;
    assert.equal(finish.material.map, null);
    finish.dispose();
    assert.deepEqual(releases, fail ? [1, 0, 1] : [1, 1, 1]);
    if (fail) maps[1].dispose();
  }
});
