import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from './document.js';
import { createTrackLibrary, TRACK_LIBRARY_KEY } from './library.js';

function memoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('browser track library saves blank drafts independently of career saves', async () => {
  const storage = memoryStorage(),
    library = createTrackLibrary({ storage });
  storage.setItem('vector-nova.careers.v1', 'career');
  const draft = createDocument({ seed: 7, blank: true });
  const saved = await library.save(draft);
  assert.deepEqual(saved, draft);
  saved.name = 'Mutated return value';
  assert.deepEqual(await library.read(draft.id), draft);
  const list = await library.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, draft.id);
  assert.equal(list[0].name, draft.name);
  assert(list[0].updatedAt > 0);
  assert.equal(await library.remove(draft.id), true);
  assert.equal(await library.remove(draft.id), false);
  assert.equal(await library.read(draft.id), null);
  assert.equal(storage.getItem('vector-nova.careers.v1'), 'career');
});

test('a damaged browser item does not hide valid saved tracks; failed writes preserve prior content', async () => {
  const storage = memoryStorage(),
    library = createTrackLibrary({ storage: () => storage });
  const draft = createDocument({ blank: true });
  await library.save(draft);
  storage.setItem(TRACK_LIBRARY_KEY + 'track-broken', '{bad');
  assert.deepEqual(
    (await library.list()).map((entry) => entry.id),
    [draft.id],
  );
  const setItem = storage.setItem;
  storage.setItem = () => {
    throw new Error('Storage full');
  };
  await assert.rejects(
    () => library.save({ ...draft, name: 'New title' }),
    /Storage full/,
  );
  storage.setItem = setItem;
  assert.equal((await library.read(draft.id)).name, draft.name);
  await assert.rejects(() => library.read('../other'), /track ID/);
  await assert.rejects(() => library.save({ ...draft, biome: 'unknown' }));
});

test('desktop adapter canonicalizes track documents and preserves cancel results', async (t) => {
  const draft = createDocument({ blank: true });
  const calls = [];
  globalThis.vectorNovaDesktop = {
    tracks: {
      list: async () => [],
      read: async () => ({ ...draft, unknown: true }),
      save: async (value) => {
        calls.push(value);
        return value;
      },
      remove: async () => true,
      import: async () => null,
      export: async () => null,
    },
  };
  t.after(() => {
    delete globalThis.vectorNovaDesktop;
  });
  const library = createTrackLibrary();
  assert.deepEqual(await library.read(draft.id), draft);
  assert.deepEqual(await library.save({ ...draft, unknown: true }), draft);
  assert.deepEqual(calls, [draft]);
  assert.equal(await library.import(), null);
  assert.equal(await library.export(draft), null);
});
