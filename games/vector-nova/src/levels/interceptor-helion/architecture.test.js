import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'three';
import { createRouteClearance } from '../../environment/placement.js';
import { createHelionBreachTrack } from './track/model.js';
import { createBreachArchitecture } from './architecture.js';

test('Breach infrastructure clears the full tilted route and owns only its geometry/materials', () => {
  const track = createHelionBreachTrack();
  const owner = createBreachArchitecture({ track });
  const clearance = createRouteClearance(track, {
    localVertical: [-15, 30],
    sidePadding: 13,
  });
  const borrowed = new Texture(),
    replacement = new Texture();
  const resources = new Set([borrowed, replacement]),
    counts = new Map();
  try {
    assert.ok(owner.metrics.triangles < 500000);
    assert.ok(owner.metrics.meshes <= 12);
    for (const site of owner.metrics.placements) {
      const center = site.min.map((v, i) => (v + site.max[i]) / 2),
        size = site.min.map((v, i) => site.max[i] - v);
      assert.ok(
        clearance.clears(
          center[0],
          center[2],
          size[0],
          size[2],
          site.max[1],
          0,
          site.min[1],
        ),
        site.name,
      );
    }
    owner.group.traverse((object) => {
      if (!object.isMesh) return;
      resources.add(object.geometry);
      resources.add(object.material);
      for (const key of ['position', 'normal'])
        assert.ok(
          object.geometry.attributes[key].array.every(Number.isFinite),
          object.name,
        );
    });
    for (const resource of resources)
      resource.addEventListener('dispose', () =>
        counts.set(resource, (counts.get(resource) ?? 0) + 1),
      );
    owner.setReflection(borrowed);
    owner.setReflection(replacement);
    owner.dispose();
    owner.dispose();
    for (const resource of resources)
      assert.equal(
        counts.get(resource) ?? 0,
        resource === borrowed || resource === replacement ? 0 : 1,
        resource.name || resource.type,
      );
    assert.equal(owner.group.children.length, 0);
  } finally {
    owner.dispose();
    borrowed.dispose();
    replacement.dispose();
  }
});
