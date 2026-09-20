import { HEROES, ITEMS, TECHS, BUILDINGS, ENEMIES } from './content.js';
import { ALL_SCENES, REGIONS } from './world.js';
import { stats } from './progression.js';
import { mainObjective } from './narrative.js';
import { FOG_CELL } from './maps.js';
import { canEquip } from './equipment.js';
import { migrateWeaponFamilies } from './legacy-weapon-migration.js';
import { migrateCommunityState } from './community-restoration.js';
export const SAVE_PREFIX = 'chronforge_echo_v1';
export const SAVE_GAME = 'chronforge-echo';
export const MAX_SAVE_BYTES = 5 * 1024 * 1024;
const own = (object, key) => Object.hasOwn(object, key);
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value) => Number.isFinite(value) && value >= 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const fail = (message) => {
  throw Error(message);
};
const requireRecord = (value, label) => {
  if (!record(value)) fail(`Invalid ${label} in save.`);
};
const requireNumbers = (value, keys, label) => {
  for (const key of keys)
    if (!number(value[key])) fail(`Invalid ${label} in save.`);
};
const point = (value) =>
  record(value) && Number.isFinite(value.x) && Number.isFinite(value.y);
function checkTree(value, depth = 0) {
  if (depth > 64) fail('Save data is nested too deeply.');
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        fail('Invalid property in save.');
      checkTree(child, depth + 1);
    }
}
function serialize(value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    fail('Save data is not valid JSON.');
  }
  if (typeof text !== 'string') fail('Save data is not valid JSON.');
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES)
    fail('Save files must be 5 MB or smaller.');
  return text;
}
function copy(value) {
  const out = JSON.parse(serialize(value));
  checkTree(out);
  return out;
}
function slotKey(slot, strict = false) {
  if (strict && !['checkpoint', '1', '2', '3'].includes(String(slot)))
    fail('Choose an autosave or manual save slot.');
  return `${SAVE_PREFIX}:${slot}`;
}
function validateHero(h, unique) {
  requireRecord(h, 'hero');
  if (
    !own(HEROES, h.id) ||
    unique.has(h.id) ||
    !Number.isInteger(h.level) ||
    h.level < 1 ||
    h.level > 60
  )
    fail('Invalid hero identity or level in save.');
  unique.add(h.id);
  requireNumbers(h, ['hp', 'mp', 'xp', 'skillPoints'], 'hero values');
  if (
    !Array.isArray(h.skills) ||
    h.skills.some((id) => typeof id !== 'string' || !own(TECHS, id))
  )
    fail('Unknown technique in save.');
  h.equip ??= {};
  requireRecord(h.equip, 'equipment');
  for (const [slot, id] of Object.entries(h.equip))
    if (
      !['weapon', 'armor', 'accessory'].includes(slot) ||
      (id !== null && (!own(ITEMS, id) || ITEMS[id].slot !== slot))
    )
      fail('Invalid equipped item in save.');
  h.name = HEROES[h.id].name;
}
const battleModes = [
  'waiting',
  'command',
  'tech',
  'item',
  'target',
  'action',
  'result',
];
function validateBattle(b, s) {
  requireRecord(b, 'suspended battle');
  requireRecord(b.encounter, 'battle encounter');
  if (
    typeof b.encounter.id !== 'string' ||
    !Array.isArray(b.encounter.enemies) ||
    !b.encounter.enemies.length ||
    b.encounter.enemies.some((id) => !own(ENEMIES, id))
  )
    fail('Invalid battle encounter in save.');
  if (
    !Array.isArray(b.heroes) ||
    b.heroes.length !== s.heroes.length ||
    !Array.isArray(b.enemies) ||
    !b.enemies.length
  )
    fail('Invalid battle formation in save.');
  const heroes = new Set(),
    actors = new Set();
  for (const h of b.heroes) {
    validateHero(h, heroes);
    if (!s.heroes.some((member) => member.id === h.id))
      fail('Battle party does not match the expedition.');
  }
  for (const [side, list] of [
    ['hero', b.heroes],
    ['enemy', b.enemies],
  ])
    for (const actor of list) {
      requireRecord(actor, 'battle actor');
      const id = side === 'hero' ? actor.id : actor.uid;
      if (
        actor.side !== side ||
        typeof id !== 'string' ||
        actors.has(id) ||
        (side === 'enemy' && !own(ENEMIES, actor.id)) ||
        !integer(actor.index) ||
        !point(actor.home)
      )
        fail('Invalid battle actor in save.');
      actors.add(id);
      requireNumbers(
        actor,
        [
          'hp',
          'mp',
          'maxHp',
          'maxMp',
          'str',
          'int',
          'tec',
          'def',
          'spd',
          'crit',
          'atb',
          'shield',
          'slowTurns',
          'reaction',
        ],
        'battle values',
      );
      if (actor.maxHp === 0 || typeof actor.name !== 'string')
        fail('Invalid battle actor in save.');
    }
  const refs = (ids, set = actors) =>
    Array.isArray(ids) &&
    ids.every((id) => typeof id === 'string' && set.has(id));
  const selection = (value) => {
    requireRecord(value, 'battle selection');
    if (
      !battleModes.includes(value.mode) ||
      !integer(value.cursor) ||
      !integer(value.target) ||
      (value.selectedHero != null && !heroes.has(value.selectedHero)) ||
      (value.lastSelectedHero != null && !heroes.has(value.lastSelectedHero))
    )
      fail('Invalid battle selection in save.');
    if (
      value.mode !== 'waiting' &&
      value.mode !== 'action' &&
      value.mode !== 'result' &&
      !heroes.has(value.selectedHero)
    )
      fail('Battle selection is missing its hero.');
    if (value.pending != null) command(value.pending, true);
    if (value.mode === 'target' && !value.pending)
      fail('Battle selection is missing its action.');
  };
  const command = (c, hero) => {
    requireRecord(c, 'battle command');
    if (
      typeof c.id !== 'string' ||
      typeof c.name !== 'string' ||
      !['self', 'enemy', 'allEnemies', 'ally', 'allAllies'].includes(
        c.target,
      ) ||
      ![
        'damage',
        'drain',
        'slow',
        'heal',
        'restoreMp',
        'revive',
        'shield',
        'guard',
        'retreat',
        'telegraph',
      ].includes(c.effect)
    )
      fail('Invalid battle command in save.');
    if (
      hero &&
      (!refs(c.participants, heroes) ||
        !c.participants.length ||
        !['attack', 'tech', 'item', 'defend', 'retreat'].includes(c.kind))
    )
      fail('Invalid battle participants in save.');
    if (c.kind === 'tech' && (!own(TECHS, c.id) || !refs(c.heroes, heroes)))
      fail('Unknown battle technique in save.');
    if (
      c.kind === 'item' &&
      (!own(ITEMS, c.id) || ITEMS[c.id].slot !== 'consumable')
    )
      fail('Unknown battle item in save.');
    if (
      (c.power !== undefined && !number(c.power)) ||
      (c.stat !== undefined && !['str', 'int', 'tec'].includes(c.stat))
    )
      fail('Invalid battle power in save.');
    if (c.mp !== undefined) {
      if (record(c.mp)) {
        if (Object.values(c.mp).some((n) => !number(n)))
          fail('Invalid technique cost in save.');
      } else if (!number(c.mp)) fail('Invalid technique cost in save.');
    }
  };
  if (
    !refs(b.readyQueue, heroes) ||
    !['active', 'action', 'victory', 'defeat', 'retreat'].includes(b.phase) ||
    (b.result != null && !['victory', 'defeat', 'retreat'].includes(b.result))
  )
    fail('Invalid battle phase in save.');
  selection(b);
  requireNumbers(
    b,
    ['clock', 'noticeTime', 'actionSerial', 'inputSerial'],
    'battle clock',
  );
  if (
    typeof b.message !== 'string' ||
    typeof b.notice !== 'string' ||
    typeof b.biome !== 'string'
  )
    fail('Invalid battle description in save.');
  if (
    !Array.isArray(b.logs) ||
    b.logs.some((log) => !record(log) || typeof log.text !== 'string') ||
    !Array.isArray(b.floaters) ||
    b.floaters.some(
      (f) =>
        !point(f) ||
        typeof f.text !== 'string' ||
        !number(f.life) ||
        !number(f.maxLife) ||
        !f.maxLife,
    )
  )
    fail('Invalid battle feedback in save.');
  b.held ??= {};
  requireRecord(b.held, 'battle keys');
  if (b.action != null) {
    const a = b.action;
    requireRecord(a, 'battle action');
    if (
      !['hero', 'enemy'].includes(a.side) ||
      !refs(a.participants) ||
      !a.participants.length ||
      !refs(a.targets) ||
      !a.targets.length
    )
      fail('Invalid battle action targets in save.');
    command(a.command, a.side === 'hero');
    requireNumbers(
      a,
      [
        'elapsed',
        'contact',
        'duration',
        'windowStart',
        'windowEnd',
        'executeInput',
      ],
      'battle timing',
    );
    if (
      !a.duration ||
      a.contact > a.duration ||
      a.windowStart > a.windowEnd ||
      a.windowEnd > a.contact ||
      a.elapsed > a.duration ||
      (a.timingPressedAt != null && !number(a.timingPressedAt))
    )
      fail('Invalid battle timing in save.');
    if (a.returnSelection != null) selection(a.returnSelection);
  } else if (b.mode === 'action')
    fail('Suspended battle is missing its action.');
  if (b.itemConfirmation != null) {
    const c = b.itemConfirmation;
    requireRecord(c, 'item confirmation');
    command(c.command, true);
    requireRecord(c.use, 'item confirmation');
    if (!heroes.has(c.targetId) || typeof c.use.confirmationKey !== 'string')
      fail('Invalid item confirmation in save.');
  }
}
export function migrate(input) {
  if (!record(input)) fail('Save contains no expedition.');
  const s = copy(input);
  if (s.version === undefined) s.version = 1;
  if (s.version !== 1)
    fail('This save needs a newer version of Chronforge Echo.');
  if (
    s.equipmentRevision !== undefined &&
    s.equipmentRevision !== 0 &&
    s.equipmentRevision !== 1
  )
    fail('Unsupported equipment revision in save.');
  if (!Array.isArray(s.heroes) || !s.heroes.some((h) => h?.id === 'kaida'))
    fail('The save is missing Kaida.');
  const unique = new Set();
  for (const h of s.heroes) validateHero(h, unique);
  requireRecord(s.resources, 'supplies');
  if (
    !own(ALL_SCENES, s.region) ||
    !Number.isFinite(s.x) ||
    !Number.isFinite(s.y)
  )
    fail('Save location or supplies are invalid.');
  if (
    s.x < 0 ||
    s.y < 0 ||
    s.x > ALL_SCENES[s.region].width ||
    s.y > ALL_SCENES[s.region].height
  )
    fail('Saved position is outside the world.');
  requireNumbers(
    s.resources,
    ['food', 'ore', 'energy', 'renown'],
    'resource data',
  );
  for (const key of [
    'inventory',
    'buildings',
    'flags',
    'quests',
    'cleared',
    'pickups',
    'fog',
  ]) {
    s[key] ??= {};
    requireRecord(s[key], key);
  }
  for (const [id, n] of Object.entries(s.inventory))
    if (!own(ITEMS, id) || !integer(n))
      fail('Invalid inventory ownership in save.');
  for (const [id, n] of Object.entries(s.buildings))
    if (!own(BUILDINGS, id) || !integer(n) || n > 4)
      fail('Invalid settlement in save.');
  if (!Number.isInteger(s.tier) || s.tier < 1 || s.tier > 4)
    fail('Invalid civilization tier in save.');
  s.visited ??= { [s.region]: true };
  requireRecord(s.visited, 'visited locations');
  for (const key of ['flags', 'cleared', 'pickups', 'visited'])
    for (const [id, v] of Object.entries(s[key])) {
      if (key === 'flags' && id === 'rewardLedger') {
        requireRecord(v, 'reward ledger');
        if (Object.values(v).some((claimed) => typeof claimed !== 'boolean'))
          fail('Invalid reward ledger in save.');
      } else if (
        v !== null &&
        !['string', 'number', 'boolean'].includes(typeof v)
      )
        fail(`Invalid ${key} in save.`);
    }
  for (const cells of Object.values(s.fog)) {
    // Early v1 saves could contain indexed fog lists. Keep them loadable; new
    // coordinate cells are appended normally when that region is explored.
    if (Array.isArray(cells)) {
      if (cells.some((cell) => !integer(cell)))
        fail('Invalid explored terrain in save.');
      continue;
    }
    requireRecord(cells, 'explored terrain');
    if (
      Object.entries(cells).some(
        ([key, value]) =>
          !/^[-]?\d+,[-]?\d+$/.test(key) ||
          ![0, 1, true, false].includes(value),
      )
    )
      fail('Invalid explored terrain in save.');
  }
  s.settings ??= { music: 0.4, sfx: 0.6, minimap: true };
  requireRecord(s.settings, 'settings');
  for (const key of ['music', 'sfx'])
    if (
      s.settings[key] !== undefined &&
      (!number(s.settings[key]) || s.settings[key] > 1)
    )
      fail('Invalid audio setting in save.');
  for (const key of ['timingAssist', 'reducedMotion', 'minimap'])
    if (s.settings[key] !== undefined && typeof s.settings[key] !== 'boolean')
      fail('Invalid display setting in save.');
  if (s.settings.keys !== undefined) {
    requireRecord(s.settings.keys, 'key bindings');
    if (
      Object.values(s.settings.keys).some(
        (key) => typeof key !== 'string' || !key.length || key.length > 40,
      )
    )
      fail('Invalid key binding in save.');
  }
  for (const [key, fallback] of Object.entries({
    seed: 9127,
    rng: 9127,
    playTime: 0,
    productionClock: 0,
  })) {
    s[key] ??= fallback;
    if (!number(s[key])) fail('Invalid expedition clock or seed in save.');
  }
  s.facing ??= 'right';
  if (!['left', 'right', 'up', 'down'].includes(s.facing))
    fail('Invalid facing direction in save.');
  s.campaignComplete ??= false;
  if (typeof s.campaignComplete !== 'boolean')
    fail('Invalid campaign status in save.');
  if (s.endingProgress != null) {
    const e = s.endingProgress;
    if (
      !record(e) ||
      !integer(e.index) ||
      !['dialogue', 'ending'].includes(e.panel)
    )
      fail('Invalid ending progress in save.');
  }
  if (s.recruitmentWalk != null) {
    const w = s.recruitmentWalk;
    requireRecord(w, 'recruitment');
    if (
      !unique.has(w.id) ||
      !own(ALL_SCENES, w.region) ||
      !Array.isArray(w.path) ||
      !w.path.length ||
      w.path.some((p) => !point(p))
    )
      fail('Invalid recruitment path in save.');
    requireNumbers(w, ['length', 'elapsed', 'duration'], 'recruitment timing');
    if (w.leaderPath !== undefined) {
      if (
        !Array.isArray(w.leaderPath) ||
        !w.leaderPath.length ||
        w.leaderPath.some((p) => !point(p))
      )
        fail('Invalid recruitment path in save.');
      requireNumbers(
        w,
        ['leaderLength', 'leaderDuration', 'revealDuration', 'walkDuration'],
        'recruitment timing',
      );
      if (!w.leaderDuration) fail('Invalid recruitment timing in save.');
    }
  }
  if (s.suspendedBattle != null) validateBattle(s.suspendedBattle, s);
  migrateWeaponFamilies(s);
  migrateCommunityState(s);
  for (const hero of [...s.heroes, ...(s.suspendedBattle?.heroes || [])])
    if (hero.equip.weapon && !canEquip(hero.id, hero.equip.weapon))
      fail('Equipped weapon does not match its hero in save.');
  return s;
}
function normalizeRecord(input) {
  requireRecord(input, 'save record');
  if (input.game !== undefined && input.game !== SAVE_GAME)
    fail('This file belongs to a different game.');
  const wrapped = own(input, 'state');
  if (wrapped && input.version !== 1)
    fail('This save needs a newer version of Chronforge Echo.');
  const state = migrate(wrapped ? input.state : input);
  // A raw legacy state has no recorded date. Epoch keeps it behind dated saves
  // rather than inventing a new save time on every import or metadata read.
  const savedAt = wrapped
    ? input.savedAt
    : (input.savedAt ?? '1970-01-01T00:00:00.000Z');
  if (typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt)))
    fail('Invalid save date.');
  return {
    game: SAVE_GAME,
    version: 1,
    savedAt: new Date(savedAt).toISOString(),
    state,
  };
}
export function parseSaveFile(text) {
  if (typeof text !== 'string' || !text.trim())
    fail('Choose a JSON save file.');
  if (new TextEncoder().encode(text).byteLength > MAX_SAVE_BYTES)
    fail('Save files must be 5 MB or smaller.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('This file is not valid JSON.');
  }
  checkTree(parsed);
  return normalizeRecord(parsed);
}
export function importSave(record, slot, storage = localStorage) {
  const key = slotKey(slot, true),
    payload = normalizeRecord(copy(record)),
    text = serialize(payload);
  // localStorage.setItem is atomic: validation/serialization finish before this
  // single write, so cancellation or quota/security failure cannot erase a slot.
  storage.setItem(key, text);
  return payload;
}
export function saveState(state, slot = 'checkpoint', storage = localStorage) {
  const payload = normalizeRecord({
      game: SAVE_GAME,
      version: 1,
      savedAt: new Date().toISOString(),
      state,
    }),
    text = serialize(payload);
  storage.setItem(slotKey(slot), text);
  return payload;
}
function readSave(slot, storage, persistMigration = false) {
  const text = storage.getItem(slotKey(slot));
  if (text === null || text === undefined || text === '')
    fail('This save slot is empty.');
  const payload = parseSaveFile(text);
  if (persistMigration) {
    const original = JSON.parse(text);
    if (
      (original.state || original).equipmentRevision !==
        payload.state.equipmentRevision ||
      (original.state || original).communityRevision !==
        payload.state.communityRevision
    )
      storage.setItem(slotKey(slot), serialize(payload));
  }
  return payload;
}
export function exportSave(slot, storage = localStorage) {
  slotKey(slot, true);
  return serialize(readSave(slot, storage));
}
export function loadState(slot = 'checkpoint', storage = localStorage) {
  return readSave(slot, storage, true).state;
}
function exploration(s) {
  let revealed = 0,
    total = 0;
  const regions = Object.values(REGIONS);
  for (const region of regions) {
    const cols = Math.ceil(region.width / FOG_CELL),
      rows = Math.ceil(region.height / FOG_CELL);
    total += cols * rows;
    if (!s.visited[region.id]) continue;
    const cells = s.fog[region.id];
    if (!record(cells)) continue;
    for (const [key, value] of Object.entries(cells)) {
      const [x, y] = key.split(',').map(Number);
      if (value && x >= 0 && y >= 0 && x < cols && y < rows) revealed++;
    }
  }
  return {
    percent: Math.round((revealed / total) * 1000) / 10,
    revealed,
    total,
    regionsVisited: regions.filter((r) => s.visited[r.id]).length,
    regionsTotal: regions.length,
  };
}
export function saveMeta(slot, storage = localStorage) {
  try {
    const text = storage.getItem(slotKey(slot));
    if (text === null || text === undefined || text === '') return null;
    const p = parseSaveFile(text),
      s = p.state,
      heroes = s.heroes.map((h) => {
        const max = stats(h, s),
          saved =
            s.suspendedBattle?.heroes.find((actor) => actor.id === h.id) || h;
        return {
          id: h.id,
          name: HEROES[h.id].name,
          level: h.level,
          hp: saved.hp,
          maxHp: max.maxHp,
          mp: saved.mp,
          maxMp: max.maxMp,
        };
      });
    return {
      savedAt: p.savedAt,
      level: s.heroes[0].level,
      region: s.region,
      playTime: s.playTime,
      complete: s.campaignComplete,
      party: heroes.map((h) => h.name).join(' · '),
      tier: s.tier,
      status: s.flags.pendingEnding
        ? 'ending'
        : s.campaignComplete
          ? 'complete'
          : s.suspendedBattle
            ? 'battle'
            : 'exploring',
      heroes,
      exploration: exploration(s),
      objective: mainObjective(s),
      regionName: ALL_SCENES[s.region].name,
    };
  } catch {
    return { corrupt: true };
  }
}
export function deleteSave(slot, storage = localStorage) {
  storage.removeItem(slotKey(slot));
}
export function latestSave(storage = localStorage) {
  const slots = ['checkpoint', 1, 2, 3]
    .map((slot) => ({ slot, meta: saveMeta(slot, storage) }))
    .filter((x) => x.meta && !x.meta.corrupt)
    .sort((a, b) => Date.parse(b.meta.savedAt) - Date.parse(a.meta.savedAt));
  return slots[0]?.slot ?? null;
}
