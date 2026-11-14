import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { createTrackStore, registerTrackHandlers, MAX_TRACK_BYTES } =
  createRequire(import.meta.url)('../../desktop/tracks.cjs');
const document = (id = 'track-first') => ({
  format: 'vector-nova-track',
  version: 1,
  id,
  name: 'Night harbor',
  biome: 'nightweir',
  generator: {
    version: 1,
    seed: 42,
    length: 3000,
    bendiness: 0.45,
    elevation: 0.35,
  },
  width: 40,
  points: [],
  settings: { density: 0.6, waterLevel: -28 },
  props: [],
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'vn-tracks-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: createTrackStore(join(root, 'tracks')) };
}

test('native library round-trips blank drafts and edited courses without adding metadata to documents', async (t) => {
  const { root, store } = await fixture(t);
  const draft = document();
  assert.deepEqual(await store.save(draft), draft);
  const saved = await store.read(draft.id);
  assert.deepEqual(saved, draft);
  saved.name = 'Caller mutation';
  assert.equal((await store.read(draft.id)).name, 'Night harbor');
  const entries = await store.list();
  assert.equal(entries.length, 1);
  assert.deepEqual(Object.keys(entries[0]).sort(), [
    'biome',
    'id',
    'name',
    'updatedAt',
  ]);
  assert(entries[0].updatedAt > 0);
  const changed = {
    ...draft,
    name: 'Edited',
    points: [{ id: 'node-one', x: 0, y: 0, z: 0, bank: 0 }],
  };
  await store.save(changed);
  assert.deepEqual(await store.read(changed.id), changed);
  assert.deepEqual(await readdir(join(root, 'tracks')), ['track-first.json']);
  assert.equal(await store.remove(draft.id), true);
  assert.equal(await store.remove(draft.id), false);
  assert.equal(await store.read(draft.id), null);
});

test('native library confines IDs and rejects malformed, oversized and linked track files', async (t) => {
  const { root, store } = await fixture(t);
  for (const id of [
    '../escape',
    'nested/file',
    'A-track',
    '',
    'x'.repeat(81),
  ]) {
    await assert.rejects(async () => store.save(document(id)), /track ID/);
    await assert.rejects(() => store.read(id), /track ID/);
    await assert.rejects(async () => store.remove(id), /track ID/);
  }
  await assert.rejects(
    async () => store.save({ ...document(), width: Infinity }),
    /JSON/,
  );
  await assert.rejects(
    async () => store.save({ ...document(), biome: 'other' }),
    /supported/,
  );
  await store.save(document());
  await writeFile(join(root, 'tracks', 'track-broken.json'), '{broken');
  await writeFile(
    join(root, 'tracks', 'track-large.json'),
    ' '.repeat(MAX_TRACK_BYTES + 1),
  );
  await writeFile(
    join(root, 'outside.json'),
    JSON.stringify(document('track-link')),
  );
  await symlink(
    join(root, 'outside.json'),
    join(root, 'tracks', 'track-link.json'),
  );
  assert.deepEqual(
    (await store.list()).map((entry) => entry.id),
    ['track-first'],
  );
  await assert.rejects(() => store.read('track-large'), /under 1 MB/);
  await assert.rejects(() => store.read('track-link'));
  await assert.rejects(
    () => store.save(document('track-link')),
    /regular file/,
  );
  await assert.rejects(() => store.remove('track-link'), /removed/);
  assert.equal(
    JSON.parse(await readFile(join(root, 'outside.json'), 'utf8')).id,
    'track-link',
  );
});

test('concurrent native edits serialize complete files and leave no temporary files', async (t) => {
  const { root, store } = await fixture(t);
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      store.save({ ...document(), name: `Edit ${index}` }),
    ),
  );
  assert.equal((await store.read('track-first')).name, 'Edit 11');
  assert.deepEqual(await readdir(join(root, 'tracks')), ['track-first.json']);
});

test('native library refuses a redirected library directory', async (t) => {
  const { root } = await fixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(root, 'redirect'));
  const store = createTrackStore(join(root, 'redirect'));
  await assert.rejects(() => store.save(document()), /unavailable/);
  assert.deepEqual(await readdir(outside), []);
});

test('track IPC validates the sender before operations and handles native import/export cancellation', async (t) => {
  const { root } = await fixture(t);
  const handlers = new Map();
  let trusted = false,
    openResult = { canceled: true },
    saveResult = { canceled: true },
    dialogs = 0;
  const window = {};
  registerTrackHandlers({
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    dialog: {
      showOpenDialog: async (owner) => {
        assert.equal(owner, window);
        dialogs++;
        return openResult;
      },
      showSaveDialog: async (owner) => {
        assert.equal(owner, window);
        dialogs++;
        return saveResult;
      },
    },
    getWindow: () => window,
    trustedSender: () => trusted,
    root: join(root, 'tracks'),
  });
  assert.deepEqual([...handlers.keys()].sort(), [
    'tracks:export',
    'tracks:import',
    'tracks:list',
    'tracks:read',
    'tracks:remove',
    'tracks:save',
  ]);
  for (const handler of handlers.values())
    assert.throws(() => handler({}, document()), /Untrusted/);
  assert.equal(dialogs, 0);
  trusted = true;
  assert.equal(await handlers.get('tracks:import')({}), null);
  assert.equal(await handlers.get('tracks:export')({}, document()), null);
  const source = join(root, 'import.json'),
    target = join(root, 'export.json');
  await writeFile(source, JSON.stringify(document()));
  openResult = { canceled: false, filePaths: [source] };
  saveResult = { canceled: false, filePath: target };
  assert.deepEqual(await handlers.get('tracks:import')({}), document());
  assert.equal(await handlers.get('tracks:export')({}, document()), true);
  assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), document());
  assert.deepEqual(
    await handlers.get('tracks:list')({}),
    [],
    'import does not silently save a course',
  );
});
