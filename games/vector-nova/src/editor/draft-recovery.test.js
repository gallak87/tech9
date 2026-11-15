import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from './document.js';
import { createDraftRecovery, EDITOR_DRAFT_KEY } from './draft-recovery.js';

function memoryStorage() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
}

test('recovery preserves the applied road and environment without touching saved library or career', () => {
  const storage = memoryStorage();
  storage.setItem('vector-nova.tracks.v1.track-existing', 'saved');
  storage.setItem('vector-nova.careers.v1', 'career');
  const recovery = createDraftRecovery({ storage, now: () => 1700 });
  assert.equal(recovery.read(), null);
  const doc = createDocument({ seed: 42, blank: true });
  doc.name = 'Recover my course';
  recovery.write(doc);
  const read = recovery.read();
  assert.equal(read.updatedAt, 1700);
  assert.deepEqual(read.document, doc);
  read.document.name = 'mutated';
  assert.equal(recovery.read().document.name, doc.name);
  recovery.clear();
  assert.equal(recovery.read(), null);
  assert.equal(
    storage.getItem('vector-nova.tracks.v1.track-existing'),
    'saved',
  );
  assert.equal(storage.getItem('vector-nova.careers.v1'), 'career');
});

test('damaged recovery and quota failures preserve existing stored content', () => {
  const storage = memoryStorage();
  const recovery = createDraftRecovery({ storage });
  storage.setItem(EDITOR_DRAFT_KEY, '{broken');
  assert.throws(() => recovery.read());
  const doc = createDocument({ blank: true });
  recovery.write(doc);
  storage.setItem = () => {
    throw new Error('Quota exceeded');
  };
  assert.throws(() => recovery.write({ ...doc, name: 'New draft' }), /Quota/);
  assert.equal(recovery.read().document.name, doc.name);
});
