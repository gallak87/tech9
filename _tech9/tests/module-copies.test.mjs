import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { syncModules } from '../tools/sync-modules.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tech9-module-copy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  };
  await write(
    '_tech9/catalog.json',
    JSON.stringify({
      schemaVersion: 1,
      scenes: [
        {
          id: 'forest',
          version: '1.0.0',
          path: '_tech9/scenes/forest',
          manifest: 'scene.json',
        },
      ],
      starters: [],
      modules: [
        { id: 'walking', version: '1.0.0', path: '_tech9/modules/walking' },
      ],
    }),
  );
  await write(
    '_tech9/scenes/forest/scene.json',
    JSON.stringify({ id: 'forest', version: '1.0.0' }),
  );
  await write(
    '_tech9/scenes/forest/capabilities.json',
    JSON.stringify({ schemaVersion: 1, modules: ['walking'] }),
  );
  await write(
    '_tech9/modules/walking/src/walk.js',
    'export const speed = 3;\n',
  );
  await write('_tech9/modules/walking/README.md', '# Walking contract\n');
  await write('_tech9/modules/walking/LICENSE.txt', 'Fixture source license\n');
  await write('_tech9/games/accepted/keep.txt', 'accepted game\n');
  return {
    root,
    write,
    target: path.join(
      root,
      '_tech9/scenes/forest/src/capabilities/walking/src/walk.js',
    ),
  };
}

test('module snapshots copy exact source plus versions/hashes and detect drift without touching games', async (t) => {
  const f = await fixture(t);
  await assert.rejects(syncModules({ root: f.root }), /Missing module copy/);
  await syncModules({ root: f.root, write: true });
  assert.equal(await readFile(f.target, 'utf8'), 'export const speed = 3;\n');
  assert.equal(
    await readFile(path.join(path.dirname(f.target), '../README.md'), 'utf8'),
    '# Walking contract\n',
  );
  assert.equal(
    await readFile(path.join(path.dirname(f.target), '../LICENSE.txt'), 'utf8'),
    'Fixture source license\n',
  );
  await syncModules({ root: f.root });
  await f.write(
    '_tech9/modules/walking/src/walk.js',
    'export const speed = 4;\n',
  );
  await assert.rejects(syncModules({ root: f.root }), /Module copy differs/);
  await syncModules({ root: f.root, write: true });
  await syncModules({ root: f.root });
  assert.equal(
    await readFile(path.join(f.root, '_tech9/games/accepted/keep.txt'), 'utf8'),
    'accepted game\n',
  );
});

test('module copying refuses symlinks and unknown manifest IDs before writes', async (t) => {
  const f = await fixture(t);
  await symlink(
    f.target,
    path.join(f.root, '_tech9/modules/walking/src/link.js'),
  );
  await assert.rejects(syncModules({ root: f.root, write: true }), /symlinks/);
  await rm(path.join(f.root, '_tech9/modules/walking/src/link.js'));
  await f.write(
    '_tech9/scenes/forest/capabilities.json',
    JSON.stringify({ schemaVersion: 1, modules: ['missing'] }),
  );
  await assert.rejects(
    syncModules({ root: f.root, write: true }),
    /Unknown module/,
  );
});

test('module snapshot never silently deletes unexpected destination files', async (t) => {
  const f = await fixture(t);
  await syncModules({ root: f.root, write: true });
  await f.write(
    '_tech9/scenes/forest/src/capabilities/walking/src/local.js',
    'preserve\n',
  );
  await assert.rejects(
    syncModules({ root: f.root, write: true }),
    /Unexpected module-copy file/,
  );
  assert.equal(
    await readFile(path.join(path.dirname(f.target), 'local.js'), 'utf8'),
    'preserve\n',
  );
});

test('removed capability and game destination need explicit inspection, never automatic mutation', async (t) => {
  const f = await fixture(t);
  await syncModules({ root: f.root, write: true });
  await f.write(
    '_tech9/scenes/forest/capabilities.json',
    JSON.stringify({ schemaVersion: 1, modules: [] }),
  );
  await assert.rejects(
    syncModules({ root: f.root, write: true }),
    /Unexpected capability copy/,
  );
  const file = path.join(f.root, '_tech9/catalog.json');
  const catalog = JSON.parse(await readFile(file, 'utf8'));
  catalog.scenes[0].path = '_tech9/games/accepted';
  await f.write(
    '_tech9/games/accepted/scene.json',
    JSON.stringify({ id: 'forest', version: '1.0.0' }),
  );
  await writeFile(file, JSON.stringify(catalog));
  await assert.rejects(
    syncModules({ root: f.root, write: true }),
    /limited to framework scenes/,
  );
  assert.equal(await readFile(f.target, 'utf8'), 'export const speed = 3;\n');
});
