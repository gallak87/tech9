import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../../physics/collision-world.js';
import { createHabitatStructure } from './environment/structure.js';
import { createOrielTrack } from './track/model.js';

test('Oriel habitat foundations leave the complete driving width clear above the running skin', () => {
  const track = createOrielTrack();
  const resources = new Set();
  const structure = createHabitatStructure((resource) => {
    resources.add(resource);
    return resource;
  }, track);
  let world;
  try {
    structure.group.updateWorldMatrix(true, true);
    const triangles = [];
    structure.group.traverse((object) => {
      if (!object.isMesh) return;
      triangles.push(
        ...indexedTriangles(
          object.geometry.attributes.position.array,
          object.geometry.index.array,
          { id: object.name, kind: 'structure' },
          object.matrixWorld,
        ),
      );
    });
    world = createCollisionWorld({
      id: 'oriel-foundation-driving-clearance',
      version: 1,
      geometryId: track.geometryVersion,
      triangles,
    });
    const bottom = 0.05;
    const top = 6.05;
    const step = 2;
    for (let distance = 0; distance < track.length; distance += step) {
      const next = Math.min(distance + step, track.length);
      if (track.isGap(distance) || track.isGap(next)) continue;
      const before = track.sample(distance);
      const after = track.sample(next);
      for (const frame of [before, after])
        frame.position.addScaledVector(frame.up, (bottom + top) / 2);
      const hit = world.sweepHull(before, after, {
        halfWidth: track.width / 2,
        halfLength: 0.1,
        hover: (top - bottom) / 2,
      });
      assert.equal(
        hit,
        null,
        `foundation structure enters the full-width driving volume at ${distance} m: ${hit?.shape.id}`,
      );
    }
  } finally {
    world?.dispose();
    structure.group.removeFromParent();
    structure.group.clear();
    for (const resource of resources) resource.dispose();
  }
});
