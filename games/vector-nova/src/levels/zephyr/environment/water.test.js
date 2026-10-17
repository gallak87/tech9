import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../index.js';
import { createZephyrWater } from './water.js';

test('Zephyr water advances before green, freezes while paused and respects reduced motion', (t) => {
  let now = 1000;
  t.mock.method(performance, 'now', () => now);
  const water = createZephyrWater(createLevel().createTrack(), new T.Texture());
  const frame = {
    time: 0,
    mode: 'title',
    settings: { reducedMotion: false },
    state: { resetCount: 0 },
  };
  water.update(frame);
  now += 50;
  water.update(frame);
  assert.ok(water.clock.value > 0);
  const waiting = water.clock.value;
  water.update({ ...frame, mode: 'racing', time: 1 });
  assert.equal(water.clock.value, waiting + 1);
  now += 1000;
  water.update({ ...frame, mode: 'paused', time: 1 });
  assert.equal(water.clock.value, waiting + 1);
  water.update({
    ...frame,
    mode: 'racing',
    time: 2,
    settings: { reducedMotion: true },
  });
  assert.equal(water.clock.value, 0);
  water.dispose();
});

test('Zephyr owns water resources once, preserves borrowed maps and keeps its flow geometry finite', () => {
  const stone = new T.Texture(),
    probe = new T.Texture();
  let borrowedDisposals = 0;
  for (const map of [stone, probe])
    map.addEventListener('dispose', () => borrowedDisposals++);
  const water = createZephyrWater(createLevel().createTrack(), stone);
  const source = new T.BoxGeometry(68, 360, 2);
  source.translate(0, -180, 0);
  const sourceMaterial = new T.MeshStandardMaterial({
    name: 'Zephyr water deep volume',
  });
  const mesh = new T.Mesh(source, sourceMaterial);
  let oldGeometryDisposals = 0;
  source.addEventListener('dispose', () => oldGeometryDisposals++);
  water.finishMesh(mesh);
  assert.equal(oldGeometryDisposals, 1);
  assert.ok(
    [...mesh.geometry.attributes.position.array].every(Number.isFinite),
  );
  assert.equal(new Set(mesh.geometry.attributes.strandEnd.array).size, 5);
  const owned = new Map();
  const observe = (resource) => {
    if (!owned.has(resource)) {
      owned.set(resource, 0);
      resource.addEventListener('dispose', () =>
        owned.set(resource, owned.get(resource) + 1),
      );
    }
  };
  water.group.traverse((o) => {
    if (o.isMesh) {
      observe(o.geometry);
      observe(o.material);
    }
  });
  observe(mesh.material);
  water.setReflection(probe);
  assert.equal(mesh.material.envMap, probe);
  water.dispose();
  water.dispose();
  assert.ok([...owned.values()].every((n) => n === 1));
  assert.equal(borrowedDisposals, 0);
  // The environment retains ownership of replacement mesh geometry and maps.
  mesh.geometry.dispose();
  sourceMaterial.dispose();
  stone.dispose();
  probe.dispose();
});
