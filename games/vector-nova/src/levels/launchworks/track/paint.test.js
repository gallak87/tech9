import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture } from 'three';
import { createLaunchworksTrack } from './model.js';
import { createLaunchworksRoad } from './road.js';

test('the finished road releases its shared and cloned surface resources once while borrowing its reflection', () => {
  const road = createLaunchworksRoad({ track: createLaunchworksTrack() });
  const resources = new Map();
  const observe = (resource) => {
    if (!resource || resources.has(resource)) return;
    resources.set(resource, 0);
    resource.addEventListener('dispose', () =>
      resources.set(resource, resources.get(resource) + 1),
    );
  };
  road.group.traverse((mesh) => {
    observe(mesh.geometry);
    for (const material of [mesh.material].flat().filter(Boolean)) {
      observe(material);
      for (const value of Object.values(material))
        if (value?.isTexture) observe(value);
    }
  });
  const reflection = new Texture();
  let borrowedDisposals = 0;
  reflection.addEventListener('dispose', () => borrowedDisposals++);
  road.setReflection(reflection);
  road.dispose();
  road.dispose();
  assert.ok(resources.size > 15);
  assert.deepEqual(
    [...resources.values()].filter((count) => count !== 1),
    [],
  );
  assert.equal(borrowedDisposals, 0);
  reflection.dispose();
});

test('receiver paint marks the actual accepted lane across its runout without adding a driving surface', () => {
  const track = createLaunchworksTrack();
  const road = createLaunchworksRoad({ track, shape: true });
  try {
    const fields = road.group.children.filter(
      (mesh) => mesh.userData.receiverId,
    );
    assert.equal(
      fields.length,
      track.jumps.filter((jump) => jump.receiverType !== 'tube').length,
    );
    for (const field of fields) {
      const jump = track.jumps.find(
        (entry) => entry.id === field.userData.receiverId,
      );
      const coordinates = field.geometry.getAttribute('roadCoord');
      let minimum = Infinity,
        maximum = -Infinity;
      let start = Infinity,
        end = -Infinity;
      for (let i = 0; i < coordinates.count; i++) {
        minimum = Math.min(minimum, coordinates.getY(i));
        maximum = Math.max(maximum, coordinates.getY(i));
        start = Math.min(start, coordinates.getX(i));
        end = Math.max(end, coordinates.getX(i));
      }
      assert.ok(
        Math.abs(maximum - minimum - jump.catchWidth) < 0.002,
        jump.label,
      );
      assert.ok(Math.abs(minimum + jump.catchWidth / 2) < 0.002, jump.label);
      assert.ok(Math.abs(start - jump.landingStart - 0.5) < 0.002, jump.label);
      assert.ok(Math.abs(end - jump.landingEnd + 0.5) < 0.002, jump.label);
      assert.ok((maximum - minimum) / track.width >= 0.9, jump.label);
      assert.equal(field.userData.drivingSurface, undefined);
      assert.equal(field.userData.roadSurface, undefined);
    }
  } finally {
    road.dispose();
  }
});
