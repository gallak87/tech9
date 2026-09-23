import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_MANIFEST, keyNeutralExterior } from '../src/assets.js';
import { readPngPixels } from './png-pixels.js';

const victory = ASSET_MANIFEST.find((entry) => entry.id === 'kaida_victory');
const showcase = { width: 2172, height: 724 };
const walk = { width: 1447, height: 1087 };
const replacement = { width: 1024, height: 1536 };

function rendered(art, options) {
  const calls = [],
    context = {
      globalAlpha: 1,
      save() {},
      restore() {},
      fillRect() {},
      translate(...args) {
        calls.push(['translate', ...args]);
      },
      scale(...args) {
        calls.push(['scale', ...args]);
      },
      drawImage(...args) {
        calls.push(['drawImage', ...args]);
      },
    };
  art.drawHero(context, 'kaida', 100.4, 200.8, options);
  return calls;
}

test('the single victory override preserves every other Kaida pose and gait', async () => {
  const art = await import('../src/art.js?hero-pose-isolation');
  art.installKaidaSheet(showcase);
  art.installKaidaWalkSheet(walk);
  const options = [
    ...[
      'idle',
      'anticipate',
      'attack',
      'cast',
      'heal',
      'hurt',
      'guard',
      'down',
    ].map((pose) => ({ pose })),
    ...['left', 'right', 'up', 'down'].flatMap((facing) => [
      { pose: 'idle', facing },
      ...[0, 1 / 9, 2 / 9, 3 / 9].map((time) => ({
        pose: 'move',
        facing,
        time,
      })),
    ]),
  ];
  const before = options.map((opt) => ({
    draw: rendered(art, opt),
    bounds: art.actorBounds('kaida', { ...opt, side: 'hero' }),
  }));
  art.installHeroPose(
    victory.heroId,
    victory.pose,
    replacement,
    victory.metadata,
  );
  assert.equal(victory.required, true);
  assert.equal(
    ASSET_MANIFEST.filter((entry) => entry.kind === 'heroPose').length,
    1,
  );
  assert.ok(ASSET_MANIFEST.some((entry) => entry.kind === 'kaida'));
  assert.deepEqual(
    options.map((opt) => ({
      draw: rendered(art, opt),
      bounds: art.actorBounds('kaida', { ...opt, side: 'hero' }),
    })),
    before,
  );
  assert.equal(rendered(art, { pose: 'victory' }).at(-1)[1], replacement);
});

test('victory survives either source load order and shares its crop with bounds', async () => {
  const draws = [];
  for (const order of ['pose-first', 'pose-last']) {
    const art = await import('../src/art.js?hero-pose-' + order),
      installPose = () =>
        art.installHeroPose(
          victory.heroId,
          victory.pose,
          replacement,
          victory.metadata,
        );
    if (order === 'pose-first') installPose();
    art.installKaidaSheet(showcase);
    art.installKaidaWalkSheet(walk);
    if (order === 'pose-last') installPose();
    for (const scale of [1, 2.5, 3]) {
      for (const facing of ['left', 'right']) {
        const options = { pose: 'victory', scale, facing },
          calls = rendered(art, options),
          bounds = art.actorBounds('kaida', { ...options, side: 'hero' }),
          [, source, , , , , x, y, width, height] = calls.at(-1),
          renderedBounds = {
            left: facing === 'left' ? -x - width : x,
            right: facing === 'left' ? -x : x + width,
            top: y,
            bottom: y + height,
          };
        assert.equal(source, replacement);
        assert.deepEqual(calls[0], ['translate', 100, 201]);
        assert.deepEqual(calls[1], ['scale', facing === 'left' ? -1 : 1, 1]);
        for (const edge of Object.keys(bounds))
          assert.ok(
            Math.abs(bounds[edge] - renderedBounds[edge]) <= 1,
            order + ' ' + facing + ' ' + edge + ' rounds only at draw time',
          );
        draws.push(calls);
      }
    }
    assert.deepEqual(art.artMetrics().heroPoses, ['kaida:victory']);
    assert.equal(art.artMetrics().retainedSourceCount, 3);
    assert.equal(
      art.artMetrics().retainedSourceBytes,
      [showcase, walk, replacement].reduce(
        (bytes, image) => bytes + image.width * image.height * 4,
        0,
      ),
    );
  }
  assert.deepEqual(draws.slice(0, 6), draws.slice(6));
});

test('victory extraction and prepared alpha keep the complete weapon and boots inside the crop', () => {
  const image = readPngPixels(
      new URL('../' + victory.authoring.url, import.meta.url),
    ),
    prepared = readPngPixels(
      new URL('../public/' + victory.url, import.meta.url),
    ),
    original = image.data.slice(),
    frame = victory.metadata.frames[0];
  assert.equal(victory.key, undefined);
  assert.equal(prepared.width, image.width);
  assert.equal(prepared.height, image.height);
  keyNeutralExterior(
    { getImageData: () => image, putImageData() {} },
    image.width,
    image.height,
    { ...victory, ...victory.authoring },
  );
  for (const pixels of [image, prepared]) {
    let left = image.width,
      top = image.height,
      right = 0,
      bottom = 0;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++)
        if (pixels.data[(y * image.width + x) * 4 + 3]) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
    assert.ok(left >= frame.x + 4 && right < frame.x + frame.w - 4);
    assert.ok(top >= frame.y + 4 && bottom < frame.y + frame.h - 4);
    // Exterior air, both enclosed hair loops, and the open space between her legs.
    for (const [x, y] of [
      [0, 0],
      [527, 455],
      [515, 468],
      [550, 1100],
      [480, 1200],
    ])
      assert.equal(
        pixels.data[(y * image.width + x) * 4 + 3],
        0,
        `${x},${y} air`,
      );
    // Pale blade tip and forearm highlights must survive alongside the magenta
    // blade core and both planted boots; broad color keying would damage these.
    for (const [x, y] of [
      [827, 62],
      [750, 105],
      [380, 500],
      [327, 1400],
      [803, 1420],
    ]) {
      const index = (y * image.width + x) * 4;
      assert.deepEqual(
        pixels.data.slice(index, index + 4),
        original.slice(index, index + 4),
      );
      assert.equal(pixels.data[index + 3], 255);
    }
  }
});
