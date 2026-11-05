import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOrielTrack } from './track/model.js';
import {
  groundHeight,
  groundGuideVersion,
} from './environment/ground-field.js';
import { loadOrielGround } from './environment/ground-loader.js';

test('Oriel authored ground and CPU seating share the current route and exported surface', async () => {
  const track = createOrielTrack();
  assert.equal(
    groundGuideVersion,
    track.geometryVersion,
    'regenerate the authored ground after changing its protected route',
  );
  const bytes = await readFile(
    new URL(
      '../../../public/assets/levels/oriel/oriel-ground.glb',
      import.meta.url,
    ),
  );
  const kit = await loadOrielGround({
    loadAsset: () =>
      new GLTFLoader().parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        '',
      ),
  });
  try {
    assert.equal(kit.geometries.length, 12);
    for (const geometry of kit.geometries) {
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i += 97) {
        const radius = Math.hypot(p.getX(i), p.getY(i) - 1000);
        const angle = Math.atan2(p.getX(i), 1000 - p.getY(i));
        assert.ok(
          Math.abs(groundHeight(angle, p.getZ(i)) - (1000 - radius)) < 0.12,
          'city/tree seating must follow the rendered Blender surface',
        );
      }
    }
    for (let s = 0; s < track.length; s += 12) {
      const f = track.sample(s);
      for (const side of [-30, 0, 30]) {
        const p = f.position
          .clone()
          .addScaledVector(f.right, side)
          .addScaledVector(f.up, 8);
        const radius = Math.hypot(p.x, p.y - 1000),
          angle = Math.atan2(p.x, 1000 - p.y);
        assert.ok(
          1000 - groundHeight(angle, p.z) - radius > 34.5,
          'the authored ground must remain outside the road and camera corridor',
        );
      }
    }
  } finally {
    kit.dispose();
    kit.dispose();
  }
});
