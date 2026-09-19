import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, recruit, stats } from '../src/progression.js';
import { createBattle, updateBattle, battleKey } from '../src/combat.js';
import {
  SAVE_PREFIX,
  SAVE_GAME,
  MAX_SAVE_BYTES,
  exportSave,
  parseSaveFile,
  importSave,
  migrate,
  saveState,
  loadState,
  saveMeta,
  deleteSave,
  latestSave,
} from '../src/persistence.js';

function storage() {
  const rows = new Map();
  return {
    rows,
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)),
    removeItem: (key) => rows.delete(key),
  };
}

test('manual saves and checkpoint preserve the entire expedition without sharing the reference namespace', () => {
  const s = createState(),
    store = storage();
  recruit(s, 'vex');
  s.region = 'forest_veil';
  s.flags.branch = 'voices';
  s.quests.test = { stage: 2, claimed: true };
  s.cleared.guard = true;
  s.pickups.relic = true;
  s.fog.forest_veil = [2, 5, 9];
  s.playTime = 234.5;
  s.settings.timingAssist = true;
  s.settings.keys = { up: 'i' };
  for (const slot of [1, 2, 3, 'checkpoint']) saveState(s, slot, store);
  assert.deepEqual(loadState(1, store), s);
  assert.deepEqual(loadState('checkpoint', store), s);
  assert.equal(store.rows.size, 4);
  assert.ok(
    [...store.rows.keys()].every((k) => k.startsWith('chronforge_echo_v1:')),
  );
  assert.equal(SAVE_PREFIX, 'chronforge_echo_v1');
  const loaded = loadState(1, store);
  loaded.flags.branch = 'silence';
  assert.equal(
    loadState(1, store).flags.branch,
    'voices',
    'Loaded states do not alias stored records.',
  );
});

test('save metadata, latest record selection, and deletion isolate manual slots', () => {
  const s = createState(),
    store = storage();
  saveState(s, 1, store);
  saveState(s, 2, store);
  saveState(s, 'checkpoint', store);
  for (const [slot, savedAt] of [
    [1, '2026-09-14T00:00:00.000Z'],
    [2, '2026-09-16T00:00:00.000Z'],
    ['checkpoint', '2026-09-15T00:00:00.000Z'],
  ]) {
    const key = `${SAVE_PREFIX}:${slot}`,
      record = JSON.parse(store.getItem(key));
    record.savedAt = savedAt;
    store.setItem(key, JSON.stringify(record));
  }
  assert.equal(latestSave(store), 2);
  const meta = saveMeta(2, store);
  assert.equal(meta.savedAt, '2026-09-16T00:00:00.000Z');
  assert.equal(meta.level, 1);
  assert.equal(meta.region, s.region);
  assert.equal(meta.playTime, 0);
  assert.equal(meta.complete, false);
  assert.equal(meta.party, 'Kaida');
  assert.equal(meta.tier, 1);
  assert.equal(meta.status, 'exploring');
  deleteSave(2, store);
  assert.equal(saveMeta(2, store), null);
  assert.equal(latestSave(store), 'checkpoint');
  assert.deepEqual(loadState(1, store), s);
});

test('corrupt records are reported while other slots remain recoverable', () => {
  const store = storage(),
    s = createState();
  saveState(s, 2, store);
  store.setItem(`${SAVE_PREFIX}:1`, '{not valid json');
  assert.deepEqual(saveMeta(1, store), { corrupt: true });
  assert.throws(() => loadState(1, store));
  assert.throws(() => loadState(3, store), /empty/);
  assert.equal(latestSave(store), 2);
  assert.deepEqual(loadState(2, store), s);
  store.setItem(
    `${SAVE_PREFIX}:3`,
    JSON.stringify({ savedAt: '2026-09-20', state: { heroes: [] } }),
  );
  assert.deepEqual(saveMeta(3, store), { corrupt: true });
});

test('versionless base saves migrate idempotently without modifying their source', () => {
  const legacy = createState();
  delete legacy.version;
  delete legacy.flags;
  delete legacy.cleared;
  delete legacy.pickups;
  delete legacy.fog;
  delete legacy.visited;
  delete legacy.settings;
  const before = JSON.stringify(legacy),
    migrated = migrate(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(migrated.version, 1);
  assert.deepEqual(migrate(migrated), migrated);
  assert.deepEqual(migrated.flags, {});
  assert.deepEqual(migrated.cleared, {});
  assert.deepEqual(migrated.visited, { [legacy.region]: true });
  assert.equal(migrated.settings.minimap, true);
});

test('future formats and malformed hero/resource records cannot silently enter the game', () => {
  assert.throws(() => migrate(null), /no expedition/);
  const mutations = [
    (s) => {
      s.version = 100;
    },
    (s) => {
      s.heroes = [];
    },
    (s) => {
      s.heroes[0].level = -1;
    },
    (s) => {
      s.heroes[0].hp = 'healthy';
    },
    (s) => {
      s.x = null;
    },
    (s) => {
      s.resources.ore = -3;
    },
    (s) => {
      s.resources.energy = Infinity;
    },
  ];
  for (const mutate of mutations) {
    const state = createState();
    mutate(state);
    assert.throws(() => migrate(state));
  }
});

test('unknown party members, duplicate identities, and invalid combat values are rejected on load', () => {
  const mutations = [
    (s) => {
      s.heroes.push({ ...s.heroes[0], id: 'missing_content' });
    },
    (s) => {
      s.heroes.push({ ...s.heroes[0] });
    },
    (s) => {
      s.heroes[0].level = 1.5;
    },
    (s) => {
      s.heroes[0].hp = -1;
    },
    (s) => {
      s.heroes[0].mp = 'many';
    },
    (s) => {
      s.heroes[0].xp = -1;
    },
    (s) => {
      s.heroes[0].skillPoints = -1;
    },
    (s) => {
      s.inventory.field_tonic = -2;
    },
    (s) => {
      s.inventory.missing_content = 1;
    },
  ];
  for (const mutate of mutations) {
    const state = createState();
    mutate(state);
    assert.throws(
      () => migrate(state),
      undefined,
      `Invalid record accepted: ${JSON.stringify(state.heroes)} / ${JSON.stringify(state.inventory)}`,
    );
  }
});

test('saving during a battle preserves the exact action and timing opportunity', () => {
  const state = createState(),
    store = storage(),
    b = createBattle(state, { id: 'save_test', enemies: ['gravbot'] });
  b.heroes[0].atb = 99.99;
  updateBattle(b, state, 0.01);
  for (let i = 0; i < 3; i++) battleKey(b, state, 'Enter');
  updateBattle(b, state, b.action.windowStart + 0.01);
  state.suspendedBattle = b;
  saveState(state, 1, store);
  const loaded = loadState(1, store),
    resumed = loaded.suspendedBattle;
  assert.deepEqual(resumed, b);
  battleKey(resumed, loaded, ' ');
  assert.equal(resumed.action.timingSuccess, true);
  const enemyHp = resumed.enemies[0].hp;
  updateBattle(
    resumed,
    loaded,
    resumed.action.contact - resumed.action.elapsed,
  );
  assert.ok(resumed.enemies[0].hp < enemyHp);
  assert.equal(
    loadState(1, store).suspendedBattle.action.timingAttempted,
    false,
  );
});

test('storage errors propagate without overwriting the previous record', () => {
  const store = storage(),
    state = createState();
  saveState(state, 1, store);
  const previous = store.getItem(`${SAVE_PREFIX}:1`);
  store.setItem = () => {
    throw new Error('Quota exceeded');
  };
  state.heroes[0].level = 2;
  assert.throws(() => saveState(state, 1, store), /Quota/);
  assert.equal(store.getItem(`${SAVE_PREFIX}:1`), previous);
});

test('portable exports use each stored snapshot and import only the selected destination', () => {
  const source = storage(),
    destination = storage(),
    live = createState();
  recruit(live, 'vex');
  live.flags.rewardLedger = { first_steps: true };
  live.flags.beacon_restored = true;
  live.fog.haventide = { '3,4': 1 };
  const saved = saveState(live, 1, source);
  saveState(createState(), 2, destination);
  saveState(createState(), 'checkpoint', destination);
  const untouched = destination.getItem(`${SAVE_PREFIX}:checkpoint`),
    running = structuredClone(live);
  live.resources.ore = 999;
  live.heroes[0].hp = 1;
  const downloaded = exportSave('1', source),
    parsed = parseSaveFile(downloaded),
    before = structuredClone(parsed);
  assert.equal(parsed.game, SAVE_GAME);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.savedAt, saved.savedAt);
  assert.deepEqual(
    parsed.state,
    running,
    'export reads disk instead of unsaved live changes',
  );
  const result = importSave(parsed, 2, destination);
  assert.deepEqual(parsed, before, 'import must not mutate its preview record');
  assert.notEqual(result.state, parsed.state);
  assert.deepEqual(loadState(2, destination), running);
  assert.equal(destination.getItem(`${SAVE_PREFIX}:checkpoint`), untouched);
  assert.equal(destination.rows.size, 2);
  assert.equal(live.heroes[0].hp, 1, 'import does not load the game');
  result.state.resources.food = 0;
  assert.notEqual(loadState(2, destination).resources.food, 0);
  for (const slot of [1, 3, 'checkpoint']) {
    importSave(parsed, slot, destination);
    assert.deepEqual(loadState(slot, destination), running);
  }
});

test('legacy v1 wrappers and raw expeditions normalize without losing story or resume data', () => {
  const s = createState();
  s.flags.rewardLedger = { quest_reward: true };
  s.flags.pendingEnding = true;
  s.endingProgress = { index: 2, panel: 'dialogue' };
  const old = { version: 1, savedAt: '2026-09-17T21:00:00-07:00', state: s };
  const wrapped = parseSaveFile(JSON.stringify(old));
  assert.equal(wrapped.savedAt, '2026-09-18T04:00:00.000Z');
  assert.deepEqual(wrapped.state, s);
  const raw = structuredClone(s);
  delete raw.version;
  delete raw.flags;
  delete raw.settings;
  const parsed = parseSaveFile(JSON.stringify(raw));
  assert.equal(parsed.game, SAVE_GAME);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.state.version, 1);
  assert.equal(parsed.savedAt, '1970-01-01T00:00:00.000Z');
  assert.deepEqual(parseSaveFile(JSON.stringify(parsed)), parsed);
  const store = storage();
  store.setItem(`${SAVE_PREFIX}:1`, JSON.stringify(s));
  assert.equal(saveMeta(1, store).status, 'ending');
  assert.deepEqual(loadState(1, store), s);
});

test('malformed, foreign and newer files are rejected without replacing occupied saves', () => {
  const store = storage(),
    s = createState();
  saveState(s, 1, store);
  const initial = store.getItem(`${SAVE_PREFIX}:1`);
  const good = {
    game: SAVE_GAME,
    version: 1,
    savedAt: '2026-09-18T00:00:00Z',
    state: s,
  };
  const files = [
    '',
    '{',
    'null',
    '[]',
    '"hello"',
    JSON.stringify({ ...good, game: 'another-game' }),
    JSON.stringify({ ...good, version: 2 }),
    JSON.stringify({ ...good, state: { ...s, version: 2 } }),
    JSON.stringify({ ...good, savedAt: 'not a date' }),
    JSON.stringify({ ...good, state: null }),
    JSON.stringify({ ...good, version: undefined }),
    JSON.stringify({ ...s, game: 'another-game' }),
    '{"__proto__":{"polluted":true},"version":1}',
  ];
  let writes = 0;
  const original = store.setItem;
  store.setItem = (...args) => {
    writes++;
    return original(...args);
  };
  for (const file of files) {
    assert.throws(
      () => importSave(parseSaveFile(file), 1, store),
      undefined,
      file,
    );
    assert.equal(store.getItem(`${SAVE_PREFIX}:1`), initial);
  }
  assert.equal(writes, 0);
  assert.equal({}.polluted, undefined);
  const parsed = parseSaveFile(JSON.stringify(good));
  parsed.state.heroes[0].hp = -1;
  assert.throws(
    () => importSave(parsed, 1, store),
    'a preview record is revalidated at commit time',
  );
  for (const slot of ['unknown', '../1', 0, 4, null, undefined])
    assert.throws(() => importSave(good, slot, store), /slot/);
  assert.equal(writes, 0);
  assert.equal(store.getItem(`${SAVE_PREFIX}:1`), initial);
  assert.throws(() => exportSave(3, store), /empty/);
  assert.throws(() => exportSave('unknown', store), /slot/);
});

test('unsafe nested state is rejected before it reaches gameplay', () => {
  const mutations = [
    (s) => s.heroes.push(null),
    (s) => (s.heroes[0].equip = 'sword'),
    (s) => (s.heroes[0].equip.boots = null),
    (s) => (s.heroes[0].equip.armor = 'iron_blade'),
    (s) => (s.heroes[0].skills = ['unknown']),
    (s) => (s.inventory = []),
    (s) => (s.buildings = 'town'),
    (s) => (s.flags = []),
    (s) => (s.flags.rewardLedger = 'claimed'),
    (s) => (s.flags.rewardLedger = { claimed: { bad: true } }),
    (s) => (s.quests = []),
    (s) => (s.cleared = { guard: {} }),
    (s) => (s.pickups = { supply: [] }),
    (s) => (s.visited = []),
    (s) => (s.fog = { haventide: 'everywhere' }),
    (s) => (s.fog = { haventide: { '0,0': {} } }),
    (s) => (s.fog = { haventide: [-1] }),
    (s) => (s.settings = 'default'),
    (s) => (s.settings.music = 2),
    (s) => (s.settings.minimap = 'false'),
    (s) => (s.settings.keys = { up: 4 }),
    (s) => (s.playTime = 'many'),
    (s) => (s.productionClock = -1),
    (s) => (s.campaignComplete = 'yes'),
    (s) => (s.facing = 'south-east'),
    (s) => (s.endingProgress = { index: -1, panel: 'dialogue' }),
    (s) => (s.recruitmentWalk = { id: 'vex' }),
    (s) => (s.suspendedBattle = { heroes: [], enemies: [] }),
  ];
  for (const mutate of mutations) {
    const s = createState();
    mutate(s);
    assert.throws(
      () => parseSaveFile(JSON.stringify(s)),
      undefined,
      mutate.toString(),
    );
  }
});

test('file limits count UTF-8 bytes and apply equally to import and export', () => {
  const record = {
    game: SAVE_GAME,
    version: 1,
    savedAt: '2026-09-18T00:00:00Z',
    state: createState(),
  };
  record.state.notes = 'é'.repeat(Math.floor(MAX_SAVE_BYTES / 2));
  const tooLarge = JSON.stringify(record);
  assert.ok(
    tooLarge.length < MAX_SAVE_BYTES,
    'multi-byte input must not bypass the byte limit',
  );
  assert.throws(() => parseSaveFile(tooLarge), /5 MB/);
  const store = storage();
  saveState(createState(), 1, store);
  const original = store.getItem(`${SAVE_PREFIX}:1`);
  assert.throws(() => importSave(record, 1, store), /5 MB/);
  assert.equal(store.getItem(`${SAVE_PREFIX}:1`), original);
  store.setItem(`${SAVE_PREFIX}:2`, tooLarge);
  assert.throws(() => exportSave(2, store), /5 MB/);
  assert.deepEqual(saveMeta(2, store), { corrupt: true });
});

test('storage access failures propagate and failed import preserves existing records', () => {
  const store = storage(),
    saved = saveState(createState(), 1, store),
    before = store.getItem(`${SAVE_PREFIX}:1`);
  const failure = new Error('Storage denied');
  store.setItem = () => {
    throw failure;
  };
  assert.throws(
    () => importSave(saved, 1, store),
    (error) => error === failure,
  );
  assert.equal(store.getItem(`${SAVE_PREFIX}:1`), before);
  const noRead = {
    getItem: () => {
      throw failure;
    },
  };
  assert.throws(
    () => exportSave(1, noRead),
    (error) => error === failure,
  );
  assert.throws(
    () => loadState(1, noRead),
    (error) => error === failure,
  );
  assert.deepEqual(saveMeta(1, noRead), { corrupt: true });
});

test('metadata reports canonical heroes, saved condition, objective and all-world exploration', async () => {
  const { REGIONS } = await import('../src/world.js'),
    { FOG_CELL } = await import('../src/maps.js');
  const s = createState(),
    store = storage();
  recruit(s, 'vex');
  recruit(s, 'rune');
  s.heroes[0].name = 'Untrusted name';
  s.heroes[0].hp = 12;
  s.heroes[1].mp = 7;
  s.fog.haventide = { '0,0': 1, '1,0': true, '-1,0': 1, '9999,0': 1 };
  s.fog.haventide_town = { '0,0': 1 };
  s.fog.emberline = { '0,0': 1 }; // unreached terrain must not count as surveyed
  const total = Object.values(REGIONS).reduce(
    (sum, r) =>
      sum + Math.ceil(r.width / FOG_CELL) * Math.ceil(r.height / FOG_CELL),
    0,
  );
  saveState(s, 1, store);
  let meta = saveMeta(1, store);
  assert.equal(meta.party, 'Kaida · Vex · Rune');
  assert.equal(meta.heroes[0].name, 'Kaida');
  assert.equal(meta.heroes[0].hp, 12);
  assert.equal(meta.heroes[1].mp, 7);
  assert.equal(meta.heroes[0].maxHp, stats(s.heroes[0], s).maxHp);
  assert.deepEqual(meta.exploration, {
    percent: Math.round((2 / total) * 1000) / 10,
    revealed: 2,
    total,
    regionsVisited: 1,
    regionsTotal: 8,
  });
  assert.match(meta.objective, /Drone Sentinel/);
  assert.equal(meta.regionName, 'Haventide');
  for (const r of Object.values(REGIONS)) {
    s.visited[r.id] = true;
    s.fog[r.id] = {};
    for (let y = 0; y < Math.ceil(r.height / FOG_CELL); y++)
      for (let x = 0; x < Math.ceil(r.width / FOG_CELL); x++)
        s.fog[r.id][`${x},${y}`] = 1;
  }
  s.campaignComplete = true;
  saveState(s, 1, store);
  meta = saveMeta(1, store);
  assert.equal(meta.exploration.percent, 100);
  assert.equal(meta.exploration.revealed, total);
  assert.equal(meta.status, 'complete');
  s.flags.pendingEnding = true;
  saveState(s, 1, store);
  assert.equal(saveMeta(1, store).status, 'ending');
});

test('portable battle saves resume incoming defense and reject broken actor references', () => {
  const state = createState(),
    store = storage(),
    b = createBattle(state, {
      id: 'portable_defense',
      enemies: ['rust_scrapper'],
    });
  b.enemies[0].atb = 100;
  updateBattle(b, state, 0.01);
  assert.equal(b.action.side, 'enemy');
  state.suspendedBattle = b;
  saveState(state, 1, store);
  const parsed = parseSaveFile(exportSave(1, store));
  importSave(parsed, 2, store);
  const loaded = loadState(2, store);
  assert.deepEqual(loaded.suspendedBattle, b);
  assert.equal(saveMeta(2, store).status, 'battle');
  updateBattle(loaded.suspendedBattle, loaded, b.action.windowStart);
  battleKey(loaded.suspendedBattle, loaded, ' ');
  assert.equal(loaded.suspendedBattle.action.timingSuccess, true);
  for (const mutate of [
    (b) => (b.action.targets = ['missing']),
    (b) => (b.action.participants = ['missing']),
    (b) => (b.heroes[0].home = null),
    (b) => (b.readyQueue = ['missing']),
    (b) => (b.action.returnSelection.pending = { target: 'self' }),
    (b) => (b.floaters = [{ text: '1' }]),
    (b) => (b.logs = [null]),
    (b) => (b.mode = 'target'),
  ]) {
    const bad = structuredClone(parsed);
    mutate(bad.state.suspendedBattle);
    assert.throws(
      () => importSave(bad, 2, store),
      undefined,
      mutate.toString(),
    );
  }
});
