import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as T from 'three';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';

const kit = JSON.parse(
  await readFile(
    new URL(
      '../assets/levels/nomad/blender/route-supports-collision.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const track = createNomadTrack();
for (const prototype of kit.prototypes)
  test(`${prototype.name}: exact load frames clear the full banked driving skin and 50m chase corridor`, () => {
    const carrier = track.carriers.find((entry) => entry.id === prototype.name);
    const matrix = new T.Matrix4().compose(
      carrier.origin,
      carrier.quaternion,
      carrier.scale,
    );
    const triangles = prototype.parts.flatMap((part) =>
      indexedTriangles(
        prototype.positions,
        prototype.indices.slice(
          part.indexStart,
          part.indexStart + part.indexCount,
        ),
        { id: part.name, kind: 'structure' },
        matrix,
      ),
    );
    const world = createCollisionWorld({
      id: prototype.name,
      version: 1,
      geometryId: kit.geometryVersion,
      triangles,
    });
    try {
      // True saddles meet the slab underside. The reserved volume begins 5cm
      // above the running skin; no support exception can hide a real tip there.
      const bottom = 0.05,
        top = 50,
        offset = (top + bottom) / 2;
      for (
        let distance = carrier.start + 0.01;
        distance < carrier.end - 0.01;
        distance += 0.5
      ) {
        const next = Math.min(distance + 0.5, carrier.end - 0.01);
        const before = track.sample(distance),
          after = track.sample(next);
        before.position.addScaledVector(before.up, offset);
        after.position.addScaledVector(after.up, offset);
        const hit = world.sweepHull(before, after, {
          halfWidth:
            Math.max(track.halfWidthAt(distance), track.halfWidthAt(next)) + 3,
          halfLength: 0.1,
          hover: (top - bottom) / 2,
        });
        assert.ok(
          !hit,
          `${prototype.name}/${hit?.shape.id} enters full-width ship/camera clearance at ${distance}`,
        );
      }
    } finally {
      world.dispose();
    }
  });
