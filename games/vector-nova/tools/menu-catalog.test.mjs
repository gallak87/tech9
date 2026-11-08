import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { menuCatalog, previewPreset, webpSize } from './menu-catalog.mjs';
import { editionPolicy } from './desktop/policy.mjs';
import { ALL_CUPS, availableCups } from '../src/race/cup.js';
import {
  BONUS_LEVEL_IDS,
  filterAvailableLevels,
} from '../src/levels/access.js';
import { ALL_REWARDS } from '../src/progression/catalog.js';
import { isCareerComplete } from '../src/progression/completion.js';

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

test('the full desktop catalogue and every championship resolve to the active worlds', async () => {
  const policy = editionPolicy('full');
  const routes = await menuCatalog({ levelIds: policy.levels, warn() {} });
  assert.equal(routes.length, 17);
  assert.deepEqual(
    new Set(policy.levels),
    new Set(routes.map((route) => route.id)),
  );
  const forest = routes.find((route) => route.id === 'vesper-forest');
  assert.equal(forest.name, 'Vesper Forest');
  assert.equal(forest.preview, 'assets/menu/vesper-forest.webp');
  assert.equal(
    ALL_CUPS.find((cup) => cup.id === 'frontier').tracks[0],
    forest.id,
  );
  for (const cup of ALL_CUPS)
    for (const id of cup.tracks)
      assert.ok(policy.levels.includes(id), `${cup.name}: ${id}`);
  const fullCups = ALL_CUPS.filter((cup) => cup.id !== 'demo');
  assert.deepEqual(
    fullCups.map((cup) => cup.id),
    ['founders', 'frontier', 'horizon', 'apex', 'encore'],
  );
  assert.deepEqual(
    new Set(fullCups.flatMap((cup) => cup.tracks)),
    new Set(policy.levels),
  );
});

test('the development and full catalogues include the finished bonus courses while the demo stays bounded', async () => {
  const routes = await menuCatalog({ warn() {} });
  const ravel = routes.find((route) => route.id === 'ravel');
  assert.ok(ravel);
  assert.equal(ravel.closed, true);
  assert.ok(ravel.length >= 12000 && ravel.length <= 13500);
  for (const id of BONUS_LEVEL_IDS) {
    assert.ok(routes.some((route) => route.id === id));
    assert.equal(editionPolicy('full').levels.includes(id), true);
    assert.equal(editionPolicy('demo').levels.includes(id), false);
  }
  for (const edition of ['demo', 'full'])
    assert.equal(
      editionPolicy(edition).levels.some((id) => /greybox|shape/.test(id)),
      false,
    );
  const demo = await menuCatalog({
    levelIds: editionPolicy('demo').levels,
    warn() {},
  });
  assert.deepEqual(demo.map((route) => route.id).sort(), ['halcyon', 'nacre']);
});

test('shipped bonus courses and Encore remain gated by career completion or developer access', async () => {
  const routes = await menuCatalog({
    levelIds: editionPolicy('full').levels,
    warn() {},
  });
  assert.equal(ALL_REWARDS.length, 28);
  const claims = ALL_REWARDS.map((reward) => reward.id);
  for (const [profile, developer, courseCount, cupCount] of [
    [{ claims: claims.slice(0, -1) }, false, 14, 4],
    [{ claims }, false, 17, 5],
    [{ claims: [] }, true, 17, 5],
  ]) {
    const access = { complete: isCareerComplete(profile), developer };
    const available = filterAvailableLevels(routes, access);
    const cups = availableCups(access);
    assert.equal(available.length, courseCount);
    assert.equal(cups.length, cupCount);
    for (const id of BONUS_LEVEL_IDS)
      assert.equal(
        available.some((route) => route.id === id),
        courseCount === 17,
      );
    assert.equal(
      cups.some((cup) => cup.id === 'encore'),
      cupCount === 5,
    );
  }
});
