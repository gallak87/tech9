import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { EDITOR_BIOMES } from './biomes.js';
import { environmentThumbnail } from './environment-thumbnails.js';

test('every visual style links its own reproducible generated-editor image', async () => {
  const root = new URL('../../', import.meta.url);
  const manifest = JSON.parse(
    await readFile(new URL('assets/editor/presets-manifest.json', root)),
  );
  const images = new Set();
  for (const biome of EDITOR_BIOMES)
    for (const preset of biome.presets) {
      const key = `${biome.id}/${preset.id}`;
      const record = manifest.images[key];
      assert(record, key);
      const url = environmentThumbnail(biome.id, preset.id);
      assert.equal(url, '/' + record.file);
      const bytes = await readFile(new URL('public/' + record.file, root));
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        record.sha256,
      );
      assert(!images.has(record.sha256), key + ' reuses another style image');
      images.add(record.sha256);
      assert(
        record.camera &&
          record.documentFingerprint &&
          Number.isInteger(record.environmentSeed),
      );
    }
  assert.equal(images.size, 35);
  assert.throws(() => environmentThumbnail('../arbitrary', 'x'), /supported/);
  assert.throws(
    () => environmentThumbnail('shatterline', 'arbitrary'),
    /preset/,
  );
});
