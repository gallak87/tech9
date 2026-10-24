import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProfileStore,
  sessionBuild,
  shipUnlocked,
  validateProfile,
  PROFILE_KEY,
} from './profile.js';
import { ENHANCEMENTS, REWARDS } from './catalog.js';
import { Vector3, Quaternion } from 'three';
import { createRace } from '../race/index.js';
import {
  createTimeTrial,
  trialIdentity,
  readTrialBest,
} from '../race/time-trial.js';
import { createCupStore } from '../race/cup.js';
import { createSaveTransfer, SAVE_BACKUP_KEY } from './save-transfer.js';
import { vehicleHandling, getShip } from '../ships/catalog.js';
const memory = () => {
  const values = new Map();
  return {
    isolated: true,
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i],
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
};
test('wins award each milestone once, starter and ordered cup unlocks persist', () => {
  const storage = memory(),
    store = createProfileStore(() => storage);
  assert.equal(shipUnlocked(store.snapshot().state, 'shrike'), true);
  assert.equal(shipUnlocked(store.snapshot().state, 'kestrel'), false);
  assert.deepEqual(store.recordRace({ id: 'loss', won: false }), []);
  assert.deepEqual(
    store.recordRace({ id: 'one', won: true }).map((r) => r.id),
    ['speed-1'],
  );
  assert.deepEqual(store.recordRace({ id: 'one', won: true }), []);
  assert.deepEqual(
    store.recordRace({ id: 'two', won: true }).map((r) => r.id),
    ['speed-2', 'acceleration-1', 'boost-1', 'equipment-jump'],
  );
  for (const [cup, ship] of [
    ['founders', 'bastion'],
    ['frontier', 'needle'],
    ['horizon', 'kestrel'],
  ]) {
    store.recordCup(cup);
    assert.ok(shipUnlocked(store.snapshot().state, ship));
  }
  assert.deepEqual(
    createProfileStore(() => storage).snapshot().state,
    store.snapshot().state,
  );
});
test('full collection requires distinct valid Time Trial maps and exotic choice is permanent', () => {
  const store = createProfileStore(() => memory());
  for (let i = 0; i < 24; i++) store.recordRace({ id: `${i}`, won: true });
  for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
    store.recordCup(cup);
  assert.equal(store.snapshot().state.claims.length, REWARDS.length - 2);
  assert.deepEqual(store.recordTrial('halcyon', false), []);
  store.recordTrial('halcyon', true);
  store.recordTrial('halcyon', true);
  assert.equal(store.snapshot().state.claims.length, REWARDS.length - 1);
  store.recordTrial('orbital', true);
  assert.equal(store.snapshot().state.claims.length, REWARDS.length);
  assert.ok(store.chooseExotic('kestrel'));
  assert.equal(store.chooseExotic('shrike'), false);
  store.equip('kestrel', 1, 'jump');
  assert.deepEqual(sessionBuild(store.snapshot().state, 'kestrel').equipment, [
    null,
    'jump',
    null,
    null,
  ]);
  assert.deepEqual(
    sessionBuild(store.snapshot().state, 'kestrel', { stock: true }),
    { version: 1, enhancements: {}, equipment: [] },
  );
  assert.ok(validateProfile(store.snapshot().state));
});
test('player upgrades never mutate fleet handling or rival defaults', () => {
  const stock = getShip('shrike').handling,
    saved = structuredClone(stock);
  const upgraded = vehicleHandling({
    shipId: 'shrike',
    enhancements: Object.fromEntries(ENHANCEMENTS.map((s) => [s.id, 3])),
  });
  assert.equal(upgraded.cruiseSpeed, stock.cruiseSpeed * 1.2);
  assert.equal(upgraded.boostDrain, stock.boostDrain / 1.2);
  assert.deepEqual(vehicleHandling({ shipId: 'shrike' }), saved);
  assert.deepEqual(stock, saved);
});
test('save transfer validates, backs up and rolls back a failed write', () => {
  const storage = memory(),
    profileStore = createProfileStore(() => storage),
    cupStore = createCupStore(() => storage);
  const transfer = createSaveTransfer({
    profileStore,
    cupStore,
    storage: () => storage,
  });
  profileStore.recordRace({ id: 'one', won: true });
  cupStore.start('founders', 'shrike', 'easy');
  const first = transfer.export();
  profileStore.recordRace({ id: 'two', won: true });
  const previous = transfer.export();
  transfer.replace(transfer.parse(first));
  assert.equal(profileStore.snapshot().state.wins, 1);
  const backup = JSON.parse(storage.getItem(SAVE_BACKUP_KEY)),
    expected = JSON.parse(previous);
  delete backup.savedAt;
  delete expected.savedAt;
  assert.deepEqual(backup, expected);
  assert.equal(cupStore.snapshot().state.cupId, 'founders');
  assert.throws(() => transfer.parse('{bad'));
  const damaged = JSON.parse(first);
  damaged.profile.loadouts.shrike = ['fake', null];
  assert.throws(() => transfer.parse(JSON.stringify(damaged)));
  const before = storage.getItem(PROFILE_KEY),
    set = storage.setItem;
  let fail = true;
  storage.setItem = (key, value) => {
    if (key === SAVE_BACKUP_KEY && fail) {
      fail = false;
      throw Error('quota');
    }
    return set(key, value);
  };
  assert.throws(
    () => transfer.replace(transfer.parse(previous)),
    /could not be saved/,
  );
  assert.equal(storage.getItem(PROFILE_KEY), before);
  assert.equal(profileStore.snapshot().state.wins, 1);
});

test('denied browser storage still allows exporting in-memory career progress', () => {
  const storage = () => {
    throw new Error('Storage denied');
  };
  const profileStore = createProfileStore(storage),
    cupStore = createCupStore(storage);
  profileStore.recordRace({ id: 'offline', won: true });
  const transfer = createSaveTransfer({ profileStore, cupStore, storage });
  assert.equal(JSON.parse(transfer.export()).profile.wins, 1);
  assert.equal(transfer.exportBackup(), null);
});

test('full save transfer carries a playable Time Trial ghost to fresh storage', () => {
  const source = memory(),
    destination = memory();
  const track = {
    id: 'save-transfer',
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
  const trial = createTimeTrial({ identity, race, store: source });
  const pose = (distance) => ({
    position: new Vector3(distance, 0, 0),
    quaternion: new Quaternion(),
  });
  trial.capture(pose(0));
  for (let distance = 0; race.lap === 1; distance++) {
    race.step(distance, distance + 1, 0.01);
    trial.capture(pose(distance + 1), 0.01);
  }
  const transfer = (storage) =>
    createSaveTransfer({
      profileStore: createProfileStore(() => storage),
      cupStore: createCupStore(() => storage),
      storage: () => storage,
    });
  const file = transfer(source).export(),
    target = transfer(destination);
  target.replace(target.parse(file));
  const restored = readTrialBest(identity, destination),
    original = readTrialBest(identity, source);
  assert.ok(restored.samples.length > 2);
  assert.deepEqual(restored, original);
  const damaged = JSON.parse(file);
  damaged.trials[0].data.ghost = { invalid: true };
  assert.throws(() => target.parse(JSON.stringify(damaged)), /ghost/);
  assert.deepEqual(readTrialBest(identity, destination), original);
});

test('early Time Trial milestones wait for the preceding boost tier and are not lost', () => {
  const storage = memory(),
    store = createProfileStore(() => storage);
  assert.deepEqual(store.recordTrial('halcyon', true), []);
  assert.deepEqual(store.recordTrial('orbital', true), []);
  assert.equal(
    sessionBuild(store.snapshot().state, 'shrike').enhancements.boost,
    0,
  );
  const restored = createProfileStore(() => storage);
  for (let i = 1; i <= 3; i++)
    restored.recordRace({ id: `win-${i}`, won: true });
  assert.deepEqual(
    restored.snapshot().state.claims.filter((id) => id.startsWith('boost-')),
    ['boost-1', 'boost-2', 'boost-3'],
  );
  assert.equal(
    sessionBuild(restored.snapshot().state, 'shrike').enhancements.boost,
    3,
  );
});

test('legacy careers migrate without losing equipment; new careers enforce two/four items', () => {
  const storage = memory(),
    store = createProfileStore(() => storage);
  for (let i = 0; i < 24; i++)
    store.recordRace({ id: `migration-${i}`, won: true });
  for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
    store.recordCup(cup);
  store.chooseExotic('kestrel');
  const legacy = store.snapshot().state;
  legacy.version = 1;
  for (const id of Object.keys(legacy.loadouts))
    legacy.loadouts[id] = [null, null];
  legacy.loadouts.shrike = ['jump', null];
  legacy.loadouts.kestrel = ['lance', 'deflector'];
  storage.setItem(PROFILE_KEY, JSON.stringify(legacy));
  const migrated = createProfileStore(() => storage);
  assert.equal(migrated.snapshot().state.version, 3);
  assert.deepEqual(migrated.snapshot().state.loadouts.kestrel, [
    'lance',
    'deflector',
    null,
    null,
  ]);
  assert.ok(migrated.equip('shrike', 1, 'injector'));
  assert.equal(migrated.equip('shrike', 2, 'stabilizer'), false);
  assert.ok(migrated.equip('kestrel', 2, 'stabilizer'));
  assert.ok(migrated.equip('kestrel', 3, 'jump'));
  assert.equal(migrated.equip('kestrel', 4, 'injector'), false);
  assert.ok(migrated.equip('kestrel', 3, 'lance'));
  assert.equal(
    migrated.snapshot().state.loadouts.kestrel[0],
    null,
    'moving an item never duplicates it',
  );
  assert.deepEqual(
    createProfileStore(() => storage).snapshot().state,
    migrated.snapshot().state,
  );
  const invalid = migrated.snapshot().state;
  invalid.loadouts.shrike[2] = 'stabilizer';
  assert.equal(validateProfile(invalid), null);
  const transfer = createSaveTransfer({
    profileStore: migrated,
    cupStore: createCupStore(() => storage),
    storage: () => storage,
  });
  assert.deepEqual(
    transfer.parse(transfer.export()).profile.loadouts,
    migrated.snapshot().state.loadouts,
  );
});
