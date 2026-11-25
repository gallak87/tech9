import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSkywellEnvironment } from '../src/levels/zephyr-skywell/environment.js';
import { createSkywellTrack } from '../src/levels/zephyr-skywell/track/model.js';

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--check'));
const output = new URL(
  '../src/levels/zephyr-skywell/garden-layout.json',
  import.meta.url,
);
const track = createSkywellTrack();
const groves = [];
const encode = (matrices) => Buffer.from(matrices.buffer).toString('base64');
const environment = await createSkywellEnvironment({
  track,
  async loadAsset(url) {
    const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
    return new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
  },
  async loadTexture() {
    return new Texture();
  },
  onGroveLayout({ trees, shrubs, ...placement }) {
    groves.push({ ...placement, trees: encode(trees), shrubs: encode(shrubs) });
  },
});
try {
  assert.ok(groves.length > 0);
  const data = {
    version: 1,
    geometryVersion: track.geometryVersion,
    groves,
  };
  const source = `${JSON.stringify(data, null, 2)}\n`;
  if (args[0] === '--check') {
    assert.equal(
      await readFile(output, 'utf8'),
      source,
      'Skywell garden bake is stale',
    );
  } else {
    await writeFile(output, source);
  }
  console.log(
    `${args[0] ? 'Verified' : 'Baked'} Skywell garden placements for ${groves.length} terraces`,
  );
} finally {
  environment.dispose();
}
