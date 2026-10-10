import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

test('local ship-inspection evidence leaves saved previews valid; source changes invalidate them', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vector-nova-menu-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (path, contents) => {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  };
  await write('tools/capture-menu-previews.mjs', '// capture version 1');
  await copyFile(
    new URL('./menu-catalog.mjs', import.meta.url),
    join(root, 'tools/menu-catalog.mjs'),
  );
  await write('src/levels/example/metadata.js', '// metadata');
  await write('src/levels/example/track/model.js', '// route geometry');
  await write('src/ships/index.js', '// ship renderer version 1');
  await write('public/assets/menu/example.webp', 'saved preview');
  const { menuCatalog } = await import(
    pathToFileURL(join(root, 'tools/menu-catalog.mjs'))
  );
  const loadModule = async (path) =>
    path.endsWith('metadata.js')
      ? { default: { id: 'example', name: 'Example' } }
      : {
          createExampleTrack: () => ({
            length: 100,
            width: 10,
            sample: (distance) => ({
              position: { clone: () => ({ x: distance, z: distance }) },
            }),
          }),
        };
  const [initial] = await menuCatalog({ loadModule });
  await write(
    'public/assets/menu/previews.json',
    JSON.stringify({ example: initial.fingerprint }),
  );
  assert.equal(
    (await menuCatalog({ loadModule }))[0].preview,
    'assets/menu/example.webp',
  );
  await write('src/ships/evidence/inspection-front.png', 'local screenshot');
  await write(
    'src/ships/evidence/inspection-rear-boost.png',
    'another local screenshot',
  );
  const [withEvidence] = await menuCatalog({ loadModule });
  assert.equal(withEvidence.fingerprint, initial.fingerprint);
  assert.equal(withEvidence.preview, 'assets/menu/example.webp');
  await write('src/ships/index.js', '// ship renderer version 2');
  const [withSourceChange] = await menuCatalog({ loadModule });
  assert.notEqual(withSourceChange.fingerprint, initial.fingerprint);
  assert.equal(withSourceChange.preview, null);
});
