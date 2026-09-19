import test from 'node:test';
import assert from 'node:assert/strict';
import { worldViewFogPixels } from '../src/world-view-fog.js';

const scene = { id: 'coast', width: 600, height: 360 };
const alphaAt = (pixels, x, y) =>
  pixels.data[
    (Math.floor((y * pixels.height) / scene.height) * pixels.width +
      Math.floor((x * pixels.width) / scene.width)) *
      4 +
      3
  ];

test('unknown terrain is opaque and explored edges fade smoothly into clear terrain', () => {
  const cells = Object.fromEntries(
    [1, 2].flatMap((x) => [0, 1, 2].map((y) => [`${x},${y}`, 1])),
  );
  const state = { fog: { coast: cells } },
    before = JSON.stringify(state);
  const pixels = worldViewFogPixels(scene, state);
  assert.equal(alphaAt(pixels, 60, 180), 255);
  assert.equal(alphaAt(pixels, 420, 180), 255);
  const edge = alphaAt(pixels, 126, 180),
    middle = alphaAt(pixels, 162, 180),
    inside = alphaAt(pixels, 222, 180);
  assert.ok(edge > middle && middle > inside);
  assert.ok(edge < 255 && middle > 0);
  assert.equal(inside, 0);
  assert.equal(
    alphaAt(pixels, 222, 6),
    0,
    'Map borders do not count as unexplored neighbours',
  );
  assert.equal(JSON.stringify(state), before);
});

test('fog belongs to the current scene and a fully surveyed map is clear', () => {
  const all = Object.fromEntries(
    Array.from({ length: 5 }, (_, x) =>
      [0, 1, 2].map((y) => [`${x},${y}`, true]),
    ).flat(),
  );
  const hidden = worldViewFogPixels(scene, { fog: { anotherScene: all } });
  const clear = worldViewFogPixels(scene, { fog: { coast: all } });
  for (let i = 3; i < hidden.data.length; i += 4) {
    assert.equal(hidden.data[i], 255);
    assert.equal(clear.data[i], 0);
  }
  const legacy = worldViewFogPixels(scene, { fog: { coast: [1, 2, 3] } });
  assert.equal(
    alphaAt(legacy, 60, 60),
    255,
    'Legacy numeric entries cannot accidentally reveal coordinates',
  );
});

test('fog texture allocation stays small even for very large maps', () => {
  const pixels = worldViewFogPixels(
    { id: 'large', width: 100_000, height: 50_000 },
    { fog: {} },
  );
  assert.ok(pixels.width <= 512 && pixels.height <= 512);
  assert.equal(pixels.data.length, pixels.width * pixels.height * 4);
});
