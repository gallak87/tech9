import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'three';
import { createInterceptorTrack } from './track/model.js';
import { createInterceptorEnvironment } from './environment.js';

test('Dispatch scenery disposes its current geometry/materials once and never disposes borrowed finish or reflection textures', async () => {
  const surface = new Texture(),
    reflection = new Texture(),
    replacement = new Texture();
  const borrowed = [surface, reflection, replacement];
  const released = new Map(borrowed.map((resource) => [resource, 0]));
  for (const resource of borrowed)
    resource.addEventListener('dispose', () =>
      released.set(resource, released.get(resource) + 1),
    );
  const owner = createInterceptorEnvironment({
    track: createInterceptorTrack(),
    road: {
      finish: {
        bind(material) {
          material.map = surface;
        },
      },
    },
  });
  try {
    await owner.ready;
    const resources = new Set();
    owner.group.traverse((object) => {
      if (!object.isMesh) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        resources.add(material);
    });
    assert.ok(
      resources.size > 20,
      'exercise the complete terrain and process ownership graph',
    );
    const counts = new Map([...resources].map((resource) => [resource, 0]));
    for (const resource of resources)
      resource.addEventListener('dispose', () =>
        counts.set(resource, counts.get(resource) + 1),
      );
    owner.setReflection(reflection);
    owner.setReflection(replacement);
    owner.dispose();
    owner.dispose();
    for (const [resource, count] of counts)
      assert.equal(count, 1, resource.name || resource.type);
    for (const count of released.values()) assert.equal(count, 0);
    assert.equal(owner.group.children.length, 0);
  } finally {
    owner.dispose();
    borrowed.forEach((resource) => resource.dispose());
  }
});
