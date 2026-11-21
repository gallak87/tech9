import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from './document.js';
import { createRaceLibrary } from './race-library.js';
import { editorRouteOutline } from './route-outline.js';
import { supportsCustomLevels } from '../frontend/custom-levels.js';

test('the menu previews a saved route without constructing a level and keeps incomplete drafts editable', async () => {
  const blank = createDocument({ blank: true });
  const race = {
    ...blank,
    id: 'harbor',
    name: 'Harbor',
    points: [
      { id: 'p1', x: 0, y: 150, z: 0, bank: 0, roll: 0 },
      { id: 'p2', x: 0, y: 170, z: 450, bank: 0, roll: 0 },
      { id: 'p3', x: 500, y: 200, z: 450, bank: 0, roll: 0 },
      { id: 'p4', x: 500, y: 150, z: 0, bank: 0, roll: 0 },
    ],
  };
  const documents = new Map([
    [blank.id, blank],
    [race.id, race],
  ]);
  let updatedAt = 1;
  const library = createRaceLibrary({
    list: async () =>
      [...documents.values()].map(({ id }) => ({ id, updatedAt })),
    read: async (id) => documents.get(id) ?? null,
  });
  const entries = await library.list();
  assert.match(entries.get('custom-' + blank.id).reason, /four road points/);
  const card = entries.get('custom-harbor');
  assert.ok(card.route.length > 1800);
  assert.match(card.route.path, /^M.*Z$/);
  await library.check(card);
  assert.equal(card.reason, '');
  const originalGeometry = card.route.trackId;
  race.points[2].y += 50;
  updatedAt++;
  const revised = (await library.list()).get(card.id);
  assert.notEqual(revised.route.trackId, originalGeometry);
  documents.delete(race.id);
  assert.equal((await library.list()).has(card.id), false);
  await assert.rejects(() => library.read(card), /no longer/);
  assert.equal(editorRouteOutline(blank), null);
  const open = editorRouteOutline({ ...race, courseType: 'downhill' });
  assert.equal(open.closed, false);
  assert.ok(!open.path.endsWith('Z'));
});

test('only ordinary racing, practice and time trial accept workshop routes', () => {
  for (const mode of ['race', 'practice', 'time-trial'])
    assert.ok(supportsCustomLevels(mode));
  for (const mode of ['cup', 'interceptor', 'eliminator', 'freestyle'])
    assert.equal(supportsCustomLevels(mode), false);
});
