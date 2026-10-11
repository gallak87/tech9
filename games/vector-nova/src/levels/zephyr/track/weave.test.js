import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import createLevel from '../index.js';
import { createZephyrRoad } from './index.js';

test('Zephyr weave stays metric across banks and owns its maps without owning the reflection', () => {
  const road = createZephyrRoad(createLevel().createTrack());
  const deck = road.group.children.find((o) => o.material.normalMap);
  const maps = [
    deck.material.map,
    deck.material.normalMap,
    deck.material.roughnessMap,
  ];
  const released = [0, 0, 0];
  maps.forEach((m, i) => {
    m.addEventListener('dispose', () => released[i]++);
    assert.deepEqual(m.repeat.toArray(), [32 / 0.64, 2.5 / 0.64]);
    assert.equal(m.generateMipmaps, true);
    assert.equal(
      m.colorSpace,
      i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    );
  });
  for (const mesh of road.group.children.filter(
    (o) => o.userData.roadSurface,
  )) {
    const { normal } = mesh.geometry.attributes;
    assert.ok([...normal.array].every(Number.isFinite));
  }
  const probe = new THREE.Texture();
  let probeReleased = 0;
  probe.addEventListener('dispose', () => probeReleased++);
  road.setReflection(probe);
  assert.equal(deck.material.envMap, probe);
  road.dispose();
  road.dispose();
  assert.deepEqual(released, [1, 1, 1]);
  assert.equal(probeReleased, 0);
  probe.dispose();
});
