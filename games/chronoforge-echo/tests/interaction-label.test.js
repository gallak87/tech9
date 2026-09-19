import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionOverlapsHero } from '../src/interaction-label.js';
import {
  actorBounds,
  installKaidaSheet,
  installKaidaWalkSheet,
} from '../src/art.js';

installKaidaSheet({ width: 2172, height: 724 });
installKaidaWalkSheet({ width: 1447, height: 1087 });

test('a world prompt detects Kaida above her feet at different display scales', () => {
  const anchor = { x: 1000.4, y: 800.8 },
    camera = { x: 540.8, y: 490.3 },
    bounds = actorBounds('kaida', { side: 'hero', facing: 'down' });
  for (const scale of [0.75, 1, 2, 3]) {
    const label = {
      left: 420 * scale,
      top: 238 * scale,
      width: 100 * scale,
      height: 25 * scale,
    };
    assert.equal(
      interactionOverlapsHero(label, anchor, camera, bounds, scale),
      true,
    );
    assert.ok(label.top + label.height < (anchor.y - camera.y) * scale);
    assert.equal(
      interactionOverlapsHero(
        label,
        { ...anchor, x: anchor.x + 120 },
        camera,
        bounds,
        scale,
      ),
      false,
      'The prompt becomes opaque again after Kaida moves clear',
    );
  }
});

test('camera translation preserves overlap and uses the renderer’s rounded anchor', () => {
  const label = { left: 459.6, top: 235, width: 1, height: 1 },
    bounds = { left: 0, right: 1, top: -76, bottom: 0 },
    anchor = { x: 1000.4, y: 800.8 },
    camera = { x: 540.8, y: 490.3 };
  assert.equal(interactionOverlapsHero(label, anchor, camera, bounds, 1), true);
  assert.equal(
    interactionOverlapsHero(
      label,
      { x: anchor.x + 1000, y: anchor.y + 500 },
      { x: camera.x + 1000, y: camera.y + 500 },
      bounds,
      1,
    ),
    true,
  );
});

test('labels outside the visible sprite, including touching edges, stay opaque', () => {
  const bounds = { left: -20, top: -80, right: 20, bottom: 0 },
    anchor = { x: 100, y: 100 },
    camera = { x: 0, y: 0 };
  for (const label of [
    { left: 120, top: 30, width: 80, height: 25 },
    { left: 0, top: 30, width: 80, height: 25 },
    { left: 90, top: 100, width: 80, height: 25 },
    { left: 90, top: 0, width: 80, height: 20 },
  ])
    assert.equal(
      interactionOverlapsHero(label, anchor, camera, bounds, 1),
      false,
    );
});

test('Kaida overlap follows the current gait frame and left-facing mirroring', () => {
  const anchor = { x: 100, y: 100 },
    camera = { x: 0, y: 0 },
    label = { left: 70, top: 40, width: 3, height: 12 },
    first = actorBounds('kaida', {
      side: 'hero',
      pose: 'move',
      facing: 'right',
      time: 0,
    }),
    second = actorBounds('kaida', {
      side: 'hero',
      pose: 'move',
      facing: 'right',
      time: 1 / 9,
    }),
    mirrored = actorBounds('kaida', {
      side: 'hero',
      pose: 'move',
      facing: 'left',
      time: 1 / 9,
    });
  assert.equal(interactionOverlapsHero(label, anchor, camera, first, 1), true);
  assert.equal(
    interactionOverlapsHero(label, anchor, camera, second, 1),
    false,
  );
  assert.equal(mirrored.left, -second.right);
  assert.equal(mirrored.right, -second.left);
  assert.deepEqual(
    actorBounds('kaida', { side: 'hero', pose: 'move', facing: 'right' }),
    first,
    'Existing bounds callers retain their first-frame default',
  );
});
