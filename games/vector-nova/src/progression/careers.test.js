import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import {
  createCareerSlots,
  createMemoryStorage,
  CAREER_SLOTS_KEY,
} from './careers.js';
import { createProfileStore, PROFILE_KEY } from './profile.js';
import { createCupStore, CUP_STORAGE_KEY } from '../race/cup.js';
import { createCupCollection, CUP_COLLECTION_KEY } from './cup-collection.js';
import { createSaveTransfer, SAVE_BACKUP_KEY } from './save-transfer.js';
import { createDeveloperSession } from './developer.js';
import { createRace } from '../race/index.js';
import {
  createTimeTrial,
  trialIdentity,
  readTrialBest,
} from '../race/time-trial.js';
import { loadShipSelection, saveShipSelection } from '../ships/catalog.js';

function memory() {
  const data = new Map();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(String(key), String(value)),
    removeItem: (key) => data.delete(key),
  };
}
const entries = (storage) =>
  Object.fromEntries(
    Array.from({ length: storage.length }, (_, i) => storage.key(i)).map(
      (key) => [key, storage.getItem(key)],
    ),
  );
const transferFor = (storage) =>
  createSaveTransfer({
    profileStore: createProfileStore(() => storage),
    cupStore: createCupStore(() => storage),
    cupCollection: createCupCollection(() => storage),
    storage: () => storage,
  });

test('transient developer storage has an independent isolated identity', () => {
  const one = createMemoryStorage(),
    two = createMemoryStorage();
  one.setItem('profile', 'temporary');
  assert.equal(one.isolated, true);
  assert.equal(one.key(0), 'profile');
  assert.equal(one.length, 1);
  assert.equal(two.getItem('profile'), null);
  one.removeItem('profile');
  assert.equal(one.length, 0);
});

function recordGhost(storage) {
  const track = {
    id: 'career-isolation',
    length: 90,
    checkpoints: [0, 30, 60].map((distance) => ({ distance })),
  };
  const identity = trialIdentity({
    track,
    ship: { id: 'shrike', version: 1 },
    version: 1,
    runtime: { id: 'test', version: 1, rulesId: 'test' },
  });
  const race = createRace(track, { continuous: true });
  const trial = createTimeTrial({ identity, race, store: storage });
  const pose = (distance) => ({
    position: new Vector3(distance, 0, 0),
    quaternion: new Quaternion(),
  });
  trial.capture(pose(0));
  for (let distance = 0; race.lap === 1; distance++) {
    race.step(distance, distance + 1, 0.01);
    trial.capture(pose(distance + 1), 0.01);
  }
  return identity;
}

test('three empty careers use only the new registry and never read unscoped saves', () => {
  const source = memory();
  source.setItem(PROFILE_KEY, 'old career');
  source.setItem(CUP_STORAGE_KEY, 'old cup');
  source.setItem(SAVE_BACKUP_KEY, 'old backup');
  const before = entries(source),
    reads = [];
  const get = source.getItem;
  source.getItem = (key) => {
    reads.push(key);
    return get(key);
  };
  const slots = createCareerSlots({ storage: () => source, now: () => 100 });
  assert.deepEqual(
    slots.list().map(({ id, name, empty }) => ({ id, name, empty })),
    [1, 2, 3].map((id) => ({ id, name: `Career ${id}`, empty: true })),
  );
  assert.equal(slots.active(), null);
  assert.ok(reads.every((key) => key === CAREER_SLOTS_KEY));
  assert.deepEqual(entries(source), before);
});

test('create, select and rename persist three fixed careers with stable isolated adapters', () => {
  const source = memory();
  let now = 100;
  const slots = createCareerSlots({ storage: () => source, now: () => now });
  const one = slots.create(1);
  assert.equal(one.empty, false);
  assert.equal(one.createdAt, 100);
  assert.equal(slots.active().id, 1);
  now = 200;
  slots.create(2);
  now = 300;
  slots.create(3);
  now = 400;
  slots.select(1);
  slots.rename(1, '  Evening  pilot  ');
  assert.equal(slots.active().name, 'Evening pilot');
  assert.equal(slots.active().lastPlayed, 400);
  assert.equal(slots.storageFor(1), slots.storageFor(1));
  assert.notEqual(slots.storageFor(1), slots.storageFor(2));
  assert.equal(slots.storageFor(1).isolated, true);
  const restored = createCareerSlots({ storage: () => source, now: () => 500 });
  assert.deepEqual(restored.list(), slots.list());
  assert.equal(restored.active().id, 1);
  assert.throws(() => slots.create(1), /already exists/);
  assert.throws(() => slots.create(4), /three careers/);
  assert.throws(() => slots.rename(1, ''), /name/);
  assert.throws(() => slots.rename(1, 'x'.repeat(33)), /name/);
});

test('career, cup, trophies, ghost, backup, ship and circuit belong to their selected slot', () => {
  const source = memory(),
    slots = createCareerSlots({ storage: () => source, now: () => 100 });
  source.setItem('vector-nova.settings', 'shared settings');
  source.setItem('vector-nova.music', 'shared music');
  for (const id of [1, 2, 3]) slots.create(id);
  const [one, two, three] = [1, 2, 3].map((id) => slots.storageFor(id));
  for (const [index, storage] of [one, two, three].entries()) {
    const profile = createProfileStore(() => storage);
    for (let i = 0; i <= index; i++)
      profile.recordRace({ id: `race-${i}`, won: true });
    createCupStore(() => storage).start(
      ['founders', 'frontier', 'horizon'][index],
      'shrike',
      'easy',
    );
    storage.setItem(
      CUP_COLLECTION_KEY,
      JSON.stringify({
        version: 1,
        cups: {
          founders: { earnedAt: index + 1, difficulty: 'easy', points: 75 },
        },
      }),
    );
    storage.setItem(SAVE_BACKUP_KEY, `backup-${index}`);
    storage.setItem(
      'vector-nova.circuit',
      ['halcyon', 'glasswake', 'helion'][index],
    );
    saveShipSelection(['shrike', 'bastion', 'needle'][index], storage);
  }
  const identity = recordGhost(one);
  assert.ok(readTrialBest(identity, one).samples.length > 2);
  assert.equal(readTrialBest(identity, two), null);
  assert.equal(readTrialBest(identity, three), null);
  assert.deepEqual(
    [one, two, three].map(
      (s) => createProfileStore(() => s).snapshot().state.wins,
    ),
    [1, 2, 3],
  );
  assert.deepEqual(
    [one, two, three].map(
      (s) => createCupStore(() => s).snapshot().state.cupId,
    ),
    ['founders', 'frontier', 'horizon'],
  );
  assert.deepEqual(
    [one, two, three].map((s) => loadShipSelection(s).id),
    ['shrike', 'bastion', 'needle'],
  );
  assert.deepEqual(
    [one, two, three].map((s) => s.getItem('vector-nova.circuit')),
    ['halcyon', 'glasswake', 'helion'],
  );
  assert.ok(
    Object.keys(entries(one)).every((key) => !key.startsWith(CAREER_SLOTS_KEY)),
  );
  assert.equal(one.getItem('vector-nova.settings'), null);
  const untouchedTwo = entries(two),
    untouchedThree = entries(three);
  const input = transferFor(two).export();
  const output = transferFor(one);
  output.replace(output.parse(input));
  assert.equal(createProfileStore(() => one).snapshot().state.wins, 2);
  assert.equal(
    readTrialBest(identity, one),
    null,
    'import only clears destination ghosts',
  );
  assert.deepEqual(entries(two), untouchedTwo);
  assert.deepEqual(entries(three), untouchedThree);
  assert.equal(source.getItem('vector-nova.settings'), 'shared settings');
  assert.equal(source.getItem('vector-nova.music'), 'shared music');
  assert.ok(JSON.parse(one.getItem(SAVE_BACKUP_KEY)).trials.length > 0);
});

test('the Time Trial memory fallback is isolated even when record writes are denied', () => {
  const source = memory(),
    slots = createCareerSlots({ storage: () => source, now: () => 100 });
  slots.create(1);
  slots.create(2);
  const one = slots.storageFor(1),
    two = slots.storageFor(2),
    set = source.setItem;
  source.setItem = (key, value) => {
    if (key.includes('vector-nova.trial.v1.')) throw Error('quota');
    set(key, value);
  };
  const identity = recordGhost(one);
  assert.ok(readTrialBest(identity, slots.storageFor(1)).samples.length > 2);
  assert.equal(readTrialBest(identity, two), null);
});

test('a failed new career rolls back its payload and leaves every existing career unchanged', () => {
  const source = memory(),
    slots = createCareerSlots({ storage: () => source, now: () => 100 });
  slots.create(1);
  slots.storageFor(1).setItem('marker', 'untouched');
  const before = entries(source),
    set = source.setItem;
  let fail = true;
  source.setItem = (key, value) => {
    if (key === CAREER_SLOTS_KEY && fail) {
      fail = false;
      throw Error('quota');
    }
    set(key, value);
  };
  assert.throws(() => slots.create(2), /could not be saved/);
  assert.deepEqual(entries(source), before);
  assert.equal(slots.active().id, 1);
  assert.equal(slots.list()[1].empty, true);
  slots.create(2);
  assert.equal(slots.active().id, 2);
});

test('unreadable current registries fail clearly instead of becoming fresh careers', () => {
  const source = memory();
  source.setItem(
    CAREER_SLOTS_KEY,
    JSON.stringify({ version: 99, active: null, slots: [null, null, null] }),
  );
  const before = entries(source),
    slots = createCareerSlots({ storage: () => source });
  assert.ok(slots.list().every((slot) => slot.unavailable));
  assert.match(slots.snapshotNotice(), /could not be read/);
  assert.throws(() => slots.create(1), /could not be read/);
  assert.deepEqual(entries(source), before);
  const denied = createCareerSlots({
    storage: () => {
      throw Error('denied');
    },
  });
  assert.ok(denied.list().every((slot) => slot.unavailable));
  assert.throws(() => denied.select(1), /could not be read/);
});

test('developer careers clone only the supplied slot and never mutate it', () => {
  const source = memory(),
    slots = createCareerSlots({ storage: () => source, now: () => 100 });
  slots.create(1);
  const slot = slots.storageFor(1);
  createProfileStore(() => slot).recordRace({ id: 'source', won: true });
  slot.setItem('vector-nova.circuit', 'glasswake');
  slot.setItem(SAVE_BACKUP_KEY, 'slot backup');
  const before = entries(slot),
    play = createDeveloperSession(new URLSearchParams('dev=1'), slot).storage();
  assert.equal(createProfileStore(() => play).snapshot().state.wins, 1);
  assert.equal(play.getItem('vector-nova.circuit'), 'glasswake');
  assert.equal(play.getItem(SAVE_BACKUP_KEY), 'slot backup');
  createProfileStore(() => play).recordRace({ id: 'playtest', won: true });
  assert.deepEqual(entries(slot), before);
  const synthetic = createDeveloperSession(
    new URLSearchParams('dev=2'),
    slot,
  ).storage();
  assert.equal(
    createProfileStore(() => synthetic).snapshot().state.claims.length,
    28,
  );
  assert.equal(synthetic.getItem(SAVE_BACKUP_KEY), null);
});
