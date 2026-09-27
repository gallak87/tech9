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
    'modules.json',
    JSON.stringify({
      schemaVersion: 1,
      modules: [{ id: 'walking', version: '1.0.0' }],
    }),
  );
  await write(
    'baselines/web-3d-world/package.json',
    JSON.stringify({
      tech9: { runtime: 'web', renderer: 'three', modules: ['walking'] },
    }),
  );
  await write('modules/walking/src/walk.js', 'export const speed = 3;\n');
  await write('modules/walking/README.md', '# Walking contract\n');
  await write('modules/walking/LICENSE.txt', 'Fixture source license\n');
  await write('games/accepted/keep.txt', 'accepted game\n');
  return {
    root,
    write,
    target: path.join(
      root,
      'baselines/web-3d-world/src/modules/walking/src/walk.js',
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
  await f.write('modules/walking/src/walk.js', 'export const speed = 4;\n');
  await assert.rejects(syncModules({ root: f.root }), /Module copy differs/);
  await syncModules({ root: f.root, write: true });
  await syncModules({ root: f.root });
  assert.equal(
    await readFile(path.join(f.root, 'games/accepted/keep.txt'), 'utf8'),
    'accepted game\n',
  );
});

test('module copying refuses symlinks and unknown module IDs before writes', async (t) => {
  const f = await fixture(t);
  await symlink(f.target, path.join(f.root, 'modules/walking/src/link.js'));
  await assert.rejects(syncModules({ root: f.root, write: true }), /symlinks/);
  await rm(path.join(f.root, 'modules/walking/src/link.js'));
  await f.write(
    'baselines/web-3d-world/package.json',
    JSON.stringify({
      tech9: { runtime: 'web', renderer: 'three', modules: ['missing'] },
    }),
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
    'baselines/web-3d-world/src/modules/walking/src/local.js',
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

test('removed module copies require explicit inspection', async (t) => {
  const f = await fixture(t);
  await syncModules({ root: f.root, write: true });
  await f.write(
    'baselines/web-3d-world/package.json',
    JSON.stringify({
      tech9: { runtime: 'web', renderer: 'three', modules: [] },
    }),
  );
  await assert.rejects(
    syncModules({ root: f.root, write: true }),
    /Unexpected module copy/,
  );
  assert.equal(await readFile(f.target, 'utf8'), 'export const speed = 3;\n');
});

test('sync selects named Pixi packages and arbitrary owned packages with matching requirements', async (t) => {
  const f = await fixture(t);
  await f.write(
    'modules.json',
    JSON.stringify({
      schemaVersion: 1,
      modules: [
        {
          id: 'walking',
          version: '1.0.0',
          requires: {
            runtime: 'web',
            renderer: 'pixi',
            dependencies: { 'pixi.js': '8.16.0' },
          },
        },
      ],
    }),
  );
  const pkg = {
    tech9: { runtime: 'web', renderer: 'pixi', modules: ['walking'] },
    dependencies: { 'pixi.js': '8.16.0' },
  };
  await f.write('baselines/web-2.5d-world/package.json', JSON.stringify(pkg));
  await f.write('games/owned/package.json', JSON.stringify(pkg));
  await f.write('games/owned/tech9.json', 'immutable original receipt');
  await f.write('modules/walking/assets/source.svg', '<svg/>');
  await f.write('modules/walking/assets/LICENSE.txt', 'CC0');
  for (const options of [
    { from: 'web-2.5d-world' },
    { packagePath: 'games/owned' },
  ]) {
    const result = await syncModules({ root: f.root, write: true, ...options });
    assert.equal(result.files, 5);
    await syncModules({ root: f.root, ...options });
    assert.equal(
      await readFile(
        path.join(
          f.root,
          result.package,
          'src/modules/walking/assets/source.svg',
        ),
        'utf8',
      ),
      '<svg/>',
    );
  }
  assert.equal(
    await readFile(path.join(f.root, 'games/owned/tech9.json'), 'utf8'),
    'immutable original receipt',
  );
  await assert.rejects(readFile(f.target), { code: 'ENOENT' });
});

test('sync preflights dependencies and renderer requirements before copying any files', async (t) => {
  const f = await fixture(t);
  await f.write(
    'modules.json',
    JSON.stringify({
      schemaVersion: 1,
      modules: [
        { id: 'walking', version: '1.0.0' },
        {
          id: 'sprites',
          version: '1.0.0',
          requires: {
            runtime: 'web',
            renderer: 'pixi',
            modules: ['walking'],
            dependencies: { 'pixi.js': '8.16.0' },
          },
        },
      ],
    }),
  );
  await f.write(
    'modules/sprites/src/index.js',
    'export const name = "sprites";',
  );
  for (const pkg of [
    {
      tech9: {
        runtime: 'web',
        renderer: 'three',
        modules: ['walking', 'sprites'],
      },
      dependencies: { 'pixi.js': '8.16.0' },
    },
    {
      tech9: { runtime: 'web', renderer: 'pixi', modules: ['sprites'] },
      dependencies: { 'pixi.js': '8.16.0' },
    },
    {
      tech9: {
        runtime: 'web',
        renderer: 'pixi',
        modules: ['walking', 'sprites'],
      },
      dependencies: {},
    },
    {
      tech9: {
        runtime: 'web',
        renderer: 'pixi',
        modules: ['walking', 'sprites'],
      },
      devDependencies: { 'pixi.js': '8.16.0' },
    },
    {
      tech9: {
        runtime: 'web',
        renderer: 'pixi',
        modules: ['walking', 'sprites'],
      },
      dependencies: { 'pixi.js': '8.15.0' },
    },
  ]) {
    await f.write('games/owned/package.json', JSON.stringify(pkg));
    await assert.rejects(
      syncModules({ root: f.root, packagePath: 'games/owned', write: true }),
      /requires/,
    );
    await assert.rejects(
      readFile(
        path.join(f.root, 'games/owned/src/modules/walking/src/walk.js'),
      ),
      { code: 'ENOENT' },
    );
  }
});

test('sync refuses ambiguous selectors, traversal and symlinked package paths', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    syncModules({
      root: f.root,
      from: 'web-pixi',
      packagePath: 'games/owned',
      write: true,
    }),
    /Choose/,
  );
  for (const packagePath of ['../outside', '/tmp/outside', 'modules/walking'])
    await assert.rejects(
      syncModules({ root: f.root, packagePath, write: true }),
      /traversal|relative|canonical/,
    );
  await symlink(
    path.join(f.root, 'baselines/web-3d-world'),
    path.join(f.root, 'games/alias'),
  );
  await assert.rejects(
    syncModules({ root: f.root, packagePath: 'games/alias', write: true }),
    /Symlinks/,
  );
  await symlink(
    path.join(f.root, 'modules/walking'),
    path.join(f.root, 'modules/walking/assets'),
  );
  await assert.rejects(
    syncModules({ root: f.root, write: true }),
    /Symlinks|symlinks/,
  );
});
