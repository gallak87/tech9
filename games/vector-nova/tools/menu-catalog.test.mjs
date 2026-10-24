import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { menuCatalog, previewPreset, webpSize } from './menu-catalog.mjs';

function header(width = 640, height = 400) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBPVP8X', 8);
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

test('saved previews survive source/artifact changes and stale routes; only missing images fall back', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vector-nova-menu-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, contents) => {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  };
  await write('src/levels/example/metadata.js', '// metadata');
  await write('public/assets/menu/example.webp', header());
  let length = 100;
  const warnings = [];
  const options = {
    root,
    warn: (message) => warnings.push(message),
    loadModule: async (path) =>
      path.endsWith('metadata.js')
        ? { default: { id: 'example', name: 'Example' } }
        : {
            createExampleTrack: () => ({
              length,
              sample: (distance) => ({
                position: { clone: () => ({ x: distance, z: distance }) },
              }),
            }),
          },
  };
  const [first] = await menuCatalog(options);
  const manifest = {
    version: 1,
    images: {
      example: {
        file: 'example.webp',
        width: 640,
        height: 400,
        preset: previewPreset,
        routeSignature: first.routeSignature,
        sourceRevision: null,
      },
    },
  };
  const save = () =>
    write('public/assets/menu/previews.json', JSON.stringify(manifest));
  await save();
  warnings.length = 0;
  await write('src/ships/index.js', '// unrelated source change');
  await write('src/ships/evidence/local.png', 'an accidental local capture');
  assert.equal(
    (await menuCatalog(options))[0].preview,
    'assets/menu/example.webp',
  );
  assert.equal(warnings.length, 0);
  length = 125;
  assert.equal(
    (await menuCatalog(options))[0].preview,
    'assets/menu/example.webp',
  );
  assert.match(warnings.at(-1), /outdated/);
  await rm(join(root, 'public/assets/menu/example.webp'));
  assert.equal((await menuCatalog(options))[0].preview, null);
  assert.match(warnings.at(-1), /Missing/);
  await write('public/assets/menu/example.webp', header(320, 200));
  await assert.rejects(menuCatalog(options), /must be 640×400/);
  manifest.images.example.file = '../elsewhere.webp';
  await save();
  await assert.rejects(menuCatalog(options), /Invalid menu preview record/);
});

test('WebP headers report dimensions and reject incomplete or unrelated files', () => {
  assert.deepEqual(webpSize(header()), { width: 640, height: 400 });
  assert.throws(() => webpSize(Buffer.from('not an image')), /Invalid/);
  assert.throws(() => webpSize(header().subarray(0, 20)), /Missing/);
});

test('Orbital menu records use the production identity rather than its shape study', async () => {
  const { default: createOrbital } =
    await import('../src/levels/orbital/index.js');
  const entries = await menuCatalog({ levelIds: ['orbital'], warn() {} });
  assert.equal(
    entries[0].trackId,
    createOrbital({ shape: false }).createTrack().id,
  );
});
