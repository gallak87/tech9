import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlasswakeTrack } from '../src/levels/glasswake/track/model.js';
import { buildGlasswakeRoad } from '../src/levels/glasswake/track/production.js';
import { createGlasswakeEnvironment } from '../src/levels/glasswake/environment/index.js';

test('every production shoe straddles an actual static geological triangle, including inverted/ascent/Return anchors', async () => {
  const track = createGlasswakeTrack(),
    road = buildGlasswakeRoad(track);
  const bytes = await readFile(
    new URL(
      '../public/assets/levels/glasswake/glasswake-environment-v5.glb',
      import.meta.url,
    ),
  );
  const env = createGlasswakeEnvironment({
    track,
    road,
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
    await env.ready;
    const contacts = road.group.userData.supportContacts;
    const shoes = road.group.getObjectByName(
      'Anchor shoes embedded in actual geological faces',
    );
    const collars = road.group.getObjectByName(
      'Blue coupling collars at articulated knees',
    );
    assert.equal(contacts.length, collars.count);
    assert.equal(shoes.count, contacts.length);
    const ray = new T.Raycaster();
    ray.near = 0;
    ray.far = 0.12;
    const matrix = new T.Matrix4(),
      center = new T.Vector3();
    for (const [index, c] of contacts.entries()) {
      const p = new T.Vector3(...c.point),
        n = new T.Vector3(...c.normal);
      ray.set(p.clone().addScaledVector(n, 0.05), n.clone().negate());
      const hits = ray.intersectObject(
        env.group.getObjectByProperty('uuid', c.terrainUuid),
        false,
      );
      assert.ok(
        hits.some(
          (h) => h.instanceId === c.instanceId && h.point.distanceTo(p) < 0.001,
        ),
        `actual contact ${c.distance}/${c.side}`,
      );
      shoes.getMatrixAt(index, matrix);
      center.setFromMatrixPosition(matrix);
      assert.ok(
        center.distanceTo(p) < 1,
        'shoe embeds its 3.8m thickness into terrain',
      );
      assert.ok(center.toArray().every(Number.isFinite));
      assert.ok(
        !track.jumps.some(
          (j) =>
            c.distance > j.takeoff - 18 && c.distance < j.landingStart + 18,
        ),
        'no false support through gap',
      );
    }
    for (const id of [
      'corkscrew-inverted',
      'crevice-floor',
      'crevice-ascent',
      'return-showcase',
    ]) {
      const s = track.scenarios[id].distance;
      assert.ok(
        contacts.some((c) => Math.abs(c.distance - s) < 60),
        id,
      );
    }
  } finally {
    road.dispose();
    env.dispose();
  }
});
