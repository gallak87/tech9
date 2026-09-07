// Chronoforge Dusk — deterministic, renderer-independent chapter systems.
export const SAVE_KEY = 'chronoforge-dusk-save-v1';
export const HEROES = [
  { id: 'kaida', name: 'Kaida', role: 'Warrior', color: '#ffb366', description: 'An agile blade, a quick grin, and no intention of letting the old world win.', maxHp: 190, maxMp: 38, attack: 30, defense: 9, speed: 27 },
  { id: 'vex', name: 'Vex', role: 'Mage', color: '#df8cff', description: 'A keeper of impossible hours. Every future still has room for kindness.', maxHp: 150, maxMp: 56, attack: 34, defense: 6, speed: 23 },
  { id: 'rune', name: 'Rune', role: 'Sentinel', color: '#78e2e8', description: 'Old armor, new purpose. A walking shelter for the people he calls home.', maxHp: 235, maxMp: 46, attack: 25, defense: 15, speed: 20 },
];
export const ITEMS = {
  'kaida-blade': { name: 'Wayfarer blade', slot: 'weapon', hero: 'kaida', description: 'A sharpened promise from the road to Bellwether.', stats: { attack: 2 } },
  'vex-focus': { name: 'Hourglass focus', slot: 'weapon', hero: 'vex', description: 'Its sand falls toward tomorrow.', stats: { attack: 2 } },
  'rune-hammer': { name: 'Sentinel driver', slot: 'weapon', hero: 'rune', description: 'Equal parts workshop tool and very firm suggestion.', stats: { attack: 2 } },
  'field-coat': { name: 'Reclaimer coat', slot: 'armor', description: 'Weathered fabric lined with salvage plates.', stats: { defense: 2 } },
  'copper-tag': { name: 'Bellwether tag', slot: 'accessory', description: 'A reminder that someone is waiting for you.', stats: { maxHp: 5 } },
  'sunsteel-edge': { name: 'Sunsteel edge', slot: 'weapon', hero: 'kaida', description: 'A solar-forged blade. Stronger Arc Cuts begin here.', stats: { attack: 12, speed: 2 } },
  'void-prism': { name: 'Violet-hour prism', slot: 'weapon', hero: 'vex', description: 'An observatory lens with a little midnight trapped inside.', stats: { attack: 13, maxMp: 10 } },
  'warden-driver': { name: 'Warden driver', slot: 'weapon', hero: 'rune', description: 'A recovered industrial heart, tuned for protection.', stats: { attack: 11, defense: 3 } },
  'relay-mail': { name: 'Relay mail', slot: 'armor', description: 'Conductive mesh turns incoming force into harmless light.', stats: { defense: 8, maxHp: 25 } },
  'dawn-charm': { name: 'Dawn charm', slot: 'accessory', description: 'A small machine that remembers the sunrise.', stats: { speed: 5, maxMp: 6 } },
  'memory-lens': { name: 'Memory lens', slot: 'accessory', description: 'The old observatory crew left more than a warning.', stats: { attack: 5, maxMp: 12 } },
  medkit: { name: 'Field medkit', slot: 'consumable', description: 'Restore 110 HP to one ally, or revive them with 80 HP.', heal: 110 },
  ether: { name: 'Aether cell', slot: 'consumable', description: 'Restore 24 MP to one living ally.', mana: 24 },
};
export const SKILLS = {
  kaida: [
    { id: 'tempered-edge', name: 'Tempered Edge', branch: 'Edge', cost: 1, requires: [], description: '+6 attack. Every strike lands with purpose.', stats: { attack: 6 } },
    { id: 'afterimage', name: 'Afterimage', branch: 'Edge', cost: 2, requires: ['tempered-edge'], description: 'Unlock Afterimage: a powerful wide slash that weakens enemy armor.', ability: 'afterimage' },
    { id: 'swiftfoot', name: 'Swiftfoot', branch: 'Tempo', cost: 1, requires: [], description: '+5 speed. Shorter waits, more openings.', stats: { speed: 5 } },
    { id: 'second-wind', name: 'Second Wind', branch: 'Tempo', cost: 2, requires: ['swiftfoot'], description: '+30 maximum HP. Recover 12 HP after every action.', stats: { maxHp: 30 } },
  ],
  vex: [
    { id: 'void-focus', name: 'Void Focus', branch: 'Entropy', cost: 1, requires: [], description: '+7 attack and +8 maximum MP.', stats: { attack: 7, maxMp: 8 } },
    { id: 'event-horizon', name: 'Event Horizon', branch: 'Entropy', cost: 2, requires: ['void-focus'], description: 'Unlock Event Horizon: strike the whole field and burn enemies over time.', ability: 'event-horizon' },
    { id: 'timekeeper', name: 'Timekeeper', branch: 'Continuum', cost: 1, requires: [], description: '+4 speed and +3 defense.', stats: { speed: 4, defense: 3 } },
    { id: 'rewind', name: 'Rewind', branch: 'Continuum', cost: 2, requires: ['timekeeper'], description: 'Unlock Rewind: restore 120 HP, revive a fallen ally, and grant Haste.', ability: 'rewind' },
  ],
  rune: [
    { id: 'reinforced', name: 'Reinforced', branch: 'Bastion', cost: 1, requires: [], description: '+5 defense and +30 maximum HP.', stats: { defense: 5, maxHp: 30 } },
    { id: 'fortress', name: 'Fortress', branch: 'Bastion', cost: 2, requires: ['reinforced'], description: 'Unlock Fortress: shield the entire crew for 75 damage each.', ability: 'fortress' },
    { id: 'signal-boost', name: 'Signal Boost', branch: 'Artifice', cost: 1, requires: [], description: '+5 attack and +10 maximum MP.', stats: { attack: 5, maxMp: 10 } },
    { id: 'capacitor', name: 'Capacitor', branch: 'Artifice', cost: 2, requires: ['signal-boost'], description: 'Unlock Capacitor: give Kaida and Vex 16 MP and Haste.', ability: 'capacitor' },
  ],
};
export const LANDMARKS = [
  { id: 'mira', name: 'Mira · Bellwether', kind: 'npc', x: -3, z: 14 },
  { id: 'beacon', name: 'Dawn Beacon', kind: 'build', x: 0, z: 12 },
  { id: 'causeway', name: 'Broken Causeway', kind: 'encounter', x: 1, z: 4 },
  { id: 'garden', name: 'Glassroot Garden', kind: 'encounter', x: -14, z: -5 },
  { id: 'wardens', name: 'Sentinel Approach', kind: 'encounter', x: 12, z: -12 },
  { id: 'cache-west', name: 'Sunken salvage', kind: 'cache', x: -18, z: 6 },
  { id: 'cache-east', name: 'Courier’s cache', kind: 'cache', x: 17, z: 1 },
  { id: 'memory', name: 'A voice in the glass', kind: 'memory', x: -15, z: -15 },
  { id: 'relay-west', name: 'West relay', kind: 'relay', x: -12, z: -10 },
  { id: 'relay-east', name: 'East relay', kind: 'relay', x: 12, z: -17 },
  { id: 'boss', name: 'Meridian Observatory', kind: 'boss', x: 0, z: -23 },
];
export const ENCOUNTERS = {
  causeway: { name: 'The broken causeway', description: 'Scavenger constructs guard the road north.', enemies: [
    { name: 'Scrapfang', type: 'crawler', maxHp: 245, attack: 25, defense: 3, speed: 16, x: 2.8, z: -1.5 },
    { name: 'Scrapfang', type: 'crawler', maxHp: 245, attack: 25, defense: 3, speed: 15, x: 3.4, z: 1 },
  ], reward: { xp: 45, sp: 1, food: 2, ore: 3, energy: 2, renown: 1, items: { 'sunsteel-edge': 1, medkit: 2, ether: 1 } } },
  garden: { name: 'The glassroot garden', description: 'The west relay is tangled in feral growth.', enemies: [
    { name: 'Glassroot Stalker', type: 'stalker', maxHp: 420, attack: 34, defense: 6, speed: 19, x: 3, z: -2 },
    { name: 'Spore Lantern', type: 'wisp', maxHp: 340, attack: 29, defense: 3, speed: 16, x: 3.8, z: 0.3 },
    { name: 'Spore Lantern', type: 'wisp', maxHp: 340, attack: 29, defense: 3, speed: 15, x: 2.5, z: 2.2 },
  ], reward: { xp: 70, sp: 1, food: 3, ore: 3, energy: 3, renown: 2, items: { 'void-prism': 1, ether: 2, medkit: 1 } } },
  wardens: { name: 'The sentinel approach', description: 'Old machines still obey a dead city.', enemies: [
    { name: 'Relay Sentinel', type: 'sentinel', maxHp: 580, attack: 42, defense: 10, speed: 16, x: 3.8, z: -1.6 },
    { name: 'Watchlight', type: 'drone', maxHp: 380, attack: 34, defense: 5, speed: 22, x: 2.5, z: 1.4 },
  ], reward: { xp: 95, sp: 1, food: 2, ore: 4, energy: 3, renown: 2, items: { 'warden-driver': 1, 'relay-mail': 1, medkit: 2, ether: 2 } } },
  boss: { name: 'The Pale Warden', description: 'A guardian caught in the final second of the collapse.', enemies: [
    { name: 'The Pale Warden', type: 'boss', maxHp: 2400, attack: 63, defense: 12, speed: 21, x: 3.2, z: 0 },
  ], reward: { xp: 180, sp: 2, food: 5, ore: 6, energy: 8, renown: 8, items: {} } },
};

const COMBOS = [
  { id: 'combo-kaida-vex', name: 'Rift Cleave', participants: ['kaida', 'vex'], cost: 8, target: 'enemy', radius: 3.4, description: 'Kaida cuts through Vex’s folded space. Wide damage and Slow.' },
  { id: 'combo-kaida-rune', name: 'Sunbreak Assault', participants: ['kaida', 'rune'], cost: 8, target: 'enemy', radius: 2.2, description: 'A shield-launched blade strike. Heavy damage and armor break.' },
  { id: 'combo-vex-rune', name: 'Chrono Sanctuary', participants: ['vex', 'rune'], cost: 9, target: 'all', description: 'A field of borrowed time restores 105 HP and grants crew-wide shields.' },
  { id: 'aeon-sunder', name: 'Aeon Sunder', participants: ['kaida', 'vex', 'rune'], cost: 14, target: 'all', description: 'Once per battle, after restoring both relays: massive damage to all enemies and interrupts their gauges. Save it for the decisive moment.' },
];
const BASE_ACTIONS = {
  kaida: [
    { id: 'arc-cut', name: 'Arc Cut', cost: 6, type: 'tech', target: 'enemy', radius: 2.6, description: 'Sweep all foes within 2.6m of the target. Position matters.' },
    { id: 'overclock', name: 'Overclock', cost: 5, type: 'tech', target: 'self', description: 'Gain Haste for 3 actions and restore 20 HP.' },
  ],
  vex: [
    { id: 'gravity-well', name: 'Gravity Well', cost: 8, type: 'tech', target: 'enemy', radius: 3.2, description: 'Void damage in a 3.2m area. Slow enemies for 2 actions.' },
    { id: 'time-stitch', name: 'Time Stitch', cost: 7, type: 'tech', target: 'ally', description: 'Restore 85 HP and cleanse Burn and Slow.' },
  ],
  rune: [
    { id: 'pulse-mend', name: 'Pulse Mend', cost: 6, type: 'tech', target: 'ally', description: 'Restore 95 HP and add a 20-point shield.' },
    { id: 'aegis-pulse', name: 'Aegis Pulse', cost: 8, type: 'tech', target: 'all', description: 'Shield every living ally for 45 damage.' },
  ],
};
const EXTRA_ACTIONS = {
  afterimage: { id: 'afterimage', name: 'Afterimage', cost: 11, type: 'tech', target: 'enemy', radius: 3.2, description: 'A powerful wide slash. Break enemy armor for 3 actions.' },
  'event-horizon': { id: 'event-horizon', name: 'Event Horizon', cost: 14, type: 'tech', target: 'all', description: 'Damage and burn all enemies for 3 actions.' },
  rewind: { id: 'rewind', name: 'Rewind', cost: 12, type: 'tech', target: 'ally', description: 'Restore 120 HP, revive a fallen ally, and grant Haste.' },
  fortress: { id: 'fortress', name: 'Fortress', cost: 12, type: 'tech', target: 'all', description: 'Shield all living allies for 75 damage and cleanse Burn.' },
  capacitor: { id: 'capacitor', name: 'Capacitor', cost: 14, type: 'tech', target: 'all', description: 'Restore 16 MP to Kaida and Vex and grant them Haste.' },
};
const LEVEL_XP = [0, 45, 115, 210, 390];
const copy = value => JSON.parse(JSON.stringify(value));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const statKeys = ['attack', 'defense', 'speed', 'maxHp', 'maxMp'];

function initialState() {
  return {
    version: 1, mode: 'title', player: { x: 0, z: 16 },
    party: HEROES.map((h, i) => ({ id: h.id, name: h.name, hp: h.maxHp + 5, maxHp: h.maxHp + 5, mp: h.maxMp, maxMp: h.maxMp, atb: 0, level: 1, xp: 0, sp: 1, equipment: { weapon: ['kaida-blade', 'vex-focus', 'rune-hammer'][i], armor: 'field-coat', accessory: 'copper-tag' }, skills: [], statuses: [] })),
    resources: { food: 6, ore: 2, energy: 1, renown: 0 },
    inventory: { 'kaida-blade': 1, 'vex-focus': 1, 'rune-hammer': 1, 'field-coat': 3, 'copper-tag': 3, medkit: 5, ether: 4 },
    flags: {}, cleared: [], settlement: { beacon: 0 }, battle: null, checkpoint: null,
    settings: { music: 0.4, sfx: 0.65, quality: 'high', battleSpeed: 1 }, playtime: 0, lastReward: null,
  };
}

export function createGame(onEvent = () => {}) {
  const game = { state: initialState(), newGame, load, save, update, startBattle, act, equip, learn, build, interact, retry, getStats, getActions, getCombos, grantVictory, useItem, getQuests, getBuildCost };
  let enemySerial = 0;
  const emit = event => onEvent(event);
  const toast = message => { game.state.toast = message; emit({ type: 'toast', message }); return { ok: false, message }; };
  const hero = id => game.state.party.find(h => h.id === id);
  const battleActive = () => !!game.state.battle && !game.state.cleared.includes(game.state.battle.id);
  const sound = name => emit({ type: 'sound', name });
  const log = message => { const b = game.state.battle; if (b) { b.log.unshift(message); b.log.length = Math.min(8, b.log.length); } };
  const status = (unit, id) => unit.statuses.find(s => s.id === id);
  function addStatus(unit, id, turns, power = 0) {
    const names = { haste: 'Haste', slow: 'Slow', shield: 'Shield', guard: 'Guard', break: 'Armor break', burn: 'Burn' };
    const old = status(unit, id);
    if (old) { old.turns = Math.max(old.turns, turns); old.power = Math.max(old.power, power); }
    else unit.statuses.push({ id, name: names[id] || id, turns, power });
  }
  function newGame() { const settings = copy(game.state.settings); game.state = initialState(); game.state.settings = settings; game.state.mode = 'explore'; return game.state; }
  function getStats(id) {
    const h = hero(id), base = HEROES.find(h => h.id === id);
    if (!h || !base) return null;
    const level = h.level - 1;
    const result = { attack: base.attack + level * 4, defense: base.defense + level * 2, speed: base.speed + level, maxHp: base.maxHp + level * 24, maxMp: base.maxMp + level * 6 };
    for (const itemId of Object.values(h.equipment)) for (const key of statKeys) result[key] += ITEMS[itemId]?.stats?.[key] || 0;
    for (const skillId of h.skills) for (const key of statKeys) result[key] += SKILLS[id].find(s => s.id === skillId)?.stats?.[key] || 0;
    if (game.state.settlement.beacon >= 1) { result.maxHp += 20; result.maxMp += 8; }
    if (game.state.settlement.beacon >= 2) { result.attack += 5; result.defense += 2; }
    return result;
  }
  function syncStats(h, addCapacity = false) {
    const s = getStats(h.id), hpGain = Math.max(0, s.maxHp - h.maxHp), mpGain = Math.max(0, s.maxMp - h.maxMp);
    h.maxHp = s.maxHp; h.maxMp = s.maxMp;
    h.hp = clamp(h.hp + (addCapacity && h.hp > 0 ? hpGain : 0), 0, h.maxHp);
    h.mp = clamp(h.mp + (addCapacity ? mpGain : 0), 0, h.maxMp);
  }
  function save() {
    try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(SAVE_KEY, JSON.stringify(game.state)); sound('save'); return true; }
    catch { toast('Save unavailable. Browser storage may be full or disabled.'); return false; }
  }
  function load() {
    const previous = game.state;
    try {
      if (typeof localStorage === 'undefined') return false;
      const parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
      const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
      const validStatuses = list => Array.isArray(list) && list.every(s => record(s) && typeof s.id === 'string' && Number.isFinite(s.turns) && Number.isFinite(s.power));
      if (!parsed || parsed.version !== 1 || parsed.party?.length !== 3 || !parsed.player || !parsed.resources || !parsed.inventory || !Array.isArray(parsed.cleared) || !parsed.flags || !parsed.settlement || !Number.isInteger(parsed.settlement.beacon)) return false;
      if (![parsed.flags, parsed.settings, parsed.inventory, parsed.resources, parsed.player, parsed.settlement].every(record)) return false;
      if (!Number.isFinite(parsed.player.x) || !Number.isFinite(parsed.player.z) || Math.abs(parsed.player.x) > 25 || parsed.player.z < -29 || parsed.player.z > 23 || !['food', 'ore', 'energy', 'renown'].every(key => Number.isFinite(parsed.resources[key]) && parsed.resources[key] >= 0)) return false;
      if (!['music', 'sfx', 'battleSpeed'].every(key => Number.isFinite(parsed.settings[key])) || !['high', 'medium', 'low'].includes(parsed.settings.quality) || !Number.isFinite(parsed.playtime) || parsed.playtime < 0 || parsed.settlement.beacon < 0 || parsed.settlement.beacon > 2) return false;
      if (!Object.values(parsed.inventory).every(n => Number.isInteger(n) && n >= 0) || !parsed.cleared.every(id => !!ENCOUNTERS[id])) return false;
      if (!Object.entries(parsed.flags).every(([key, value]) => key === 'combosUsed' ? Array.isArray(value) && value.every(id => COMBOS.some(c => c.id === id)) : typeof value === 'boolean')) return false;
      if (!HEROES.every(h => parsed.party.some(p => p.id === h.id && Number.isFinite(p.hp) && Number.isFinite(p.mp) && Number.isInteger(p.level) && Number.isFinite(p.xp) && Number.isFinite(p.sp) && Array.isArray(p.skills) && p.skills.every(id => SKILLS[h.id].some(s => s.id === id)) && validStatuses(p.statuses) && record(p.equipment) && Object.values(p.equipment).every(id => !!ITEMS[id])))) return false;
      if (parsed.battle && (!record(parsed.battle) || !ENCOUNTERS[parsed.battle.id] || !record(parsed.battle.origin) || !Number.isFinite(parsed.battle.origin.x) || !Number.isFinite(parsed.battle.origin.z) || !Array.isArray(parsed.battle.enemies) || !parsed.battle.enemies.length || !parsed.battle.enemies.every(e => record(e) && typeof e.id === 'string' && ['hp', 'maxHp', 'atb', 'attack', 'defense', 'speed', 'x', 'z'].every(key => Number.isFinite(e[key])) && validStatuses(e.statuses) && record(e.intent)) || !Array.isArray(parsed.battle.log))) return false;
      game.state = { ...initialState(), ...parsed, settings: { ...initialState().settings, ...parsed.settings } };
      game.state.settings.music = clamp(game.state.settings.music, 0, 1); game.state.settings.sfx = clamp(game.state.settings.sfx, 0, 1); game.state.settings.battleSpeed = clamp(game.state.settings.battleSpeed, 0.6, 1.6);
      if (game.state.battle) game.state.battle.actionDelay = clamp(Number(game.state.battle.actionDelay) || 0, 0, 1.7);
      for (const h of game.state.party) { h.level = clamp(h.level, 1, 5); h.atb = clamp(h.atb || 0, 0, 100); syncStats(h); }
      game.state.mode = parsed.mode === 'defeat' ? 'defeat' : parsed.battle && !parsed.cleared.includes(parsed.battle.id) ? 'battle' : parsed.flags?.ending ? 'ending' : 'explore';
      if (game.state.mode === 'explore') game.state.battle = null;
      return true;
    } catch { game.state = previous; return false; }
  }
  function getCombos() {
    return COMBOS.map(c => {
      const missing = c.participants.map(hero).find(h => h.hp <= 0 || h.atb < 100 || h.mp < c.cost);
      let reason = '';
      if (game.state.mode !== 'battle') reason = 'Available in battle';
      else if (game.state.battle.actionDelay > 0) reason = 'Resolving technique';
      else if (c.id === 'aeon-sunder' && (!game.state.flags.relayWest || !game.state.flags.relayEast)) reason = 'Restore both relays to synchronize Aeon Sunder';
      else if (c.id === 'aeon-sunder' && game.state.battle.sunderUsed) reason = 'Aeon Sunder has been used this battle';
      else if (missing) reason = missing.hp <= 0 ? `${missing.name} is down` : missing.atb < 100 ? `${missing.name} needs a full gauge` : `${missing.name} needs ${c.cost} MP`;
      return { ...c, type: c.participants.length === 3 ? 'triple' : 'combo', available: !reason, reason };
    });
  }
  function getActions(id) {
    const h = hero(id); if (!h) return [];
    const actions = [
      { id: 'attack', name: 'Attack', cost: 0, type: 'attack', target: 'enemy', description: 'A reliable weapon strike. Recover 3 MP.' },
      ...BASE_ACTIONS[id],
      ...h.skills.map(skillId => SKILLS[id].find(s => s.id === skillId)?.ability).filter(Boolean).map(a => EXTRA_ACTIONS[a]),
      { id: 'defend', name: 'Defend', cost: 0, type: 'defend', target: 'self', description: 'Reduce incoming damage by 65% until your next action. Recover 6 MP.' },
      { id: 'item-medkit', name: `Medkit ×${game.state.inventory.medkit || 0}`, cost: 0, type: 'item', target: 'ally', description: ITEMS.medkit.description },
      { id: 'item-ether', name: `Aether cell ×${game.state.inventory.ether || 0}`, cost: 0, type: 'item', target: 'ally', description: ITEMS.ether.description },
    ].map(a => {
      const reason = game.state.mode !== 'battle' ? 'Available in battle' : game.state.battle.actionDelay > 0 ? 'Resolving technique' : h.hp <= 0 ? 'Hero is down' : h.atb < 100 ? 'Gauge is charging' : h.mp < a.cost ? `Requires ${a.cost} MP` : a.type === 'item' && !(game.state.inventory[a.id.slice(5)] > 0) ? 'No supplies remaining' : '';
      return { ...a, available: !reason, reason };
    });
    return [...actions, ...getCombos().filter(c => c.participants.includes(id))];
  }
  function position(unit) {
    const b = game.state.battle, index = game.state.party.findIndex(h => h.id === unit.id);
    return { x: (b?.origin.x || 0) + (index >= 0 ? -3 : unit.x), z: (b?.origin.z || 0) + (index >= 0 ? (index - 1) * 2 : unit.z) };
  }
  function effect(type, source, targets, label, color) {
    emit({ type: 'effect', effect: { type, source: source ? position(source) : { ...game.state.player }, target: targets[0] ? position(targets[0]) : { ...game.state.player }, targets: targets.map(position), label, color } });
  }
  function planEnemy(enemy) {
    const b = game.state.battle, living = game.state.party.filter(h => h.hp > 0);
    const target = living[(b.turn + enemy.index) % Math.max(1, living.length)] || game.state.party[0];
    if (enemy.type === 'boss') {
      const sequence = b.turn % (b.phase >= 2 ? 3 : 4);
      enemy.intent = sequence === 2 ? { name: b.phase >= 3 ? 'ZERO HOUR · defend or shield!' : 'Pale Horizon · crew-wide blast', type: 'all', power: b.phase >= 3 ? 1.65 : 1.2, targetId: target.id }
        : sequence === 1 ? { name: 'Entropy Lance · burns its target', type: 'burn', power: 1.1, targetId: target.id }
          : { name: 'Clockhand Crush', type: 'attack', power: 1, targetId: target.id };
    } else if (enemy.type === 'wisp') enemy.intent = { name: 'Spore flare · Burn', type: 'burn', power: 0.9, targetId: target.id };
    else if (enemy.type === 'sentinel' && b.turn % 2) enemy.intent = { name: 'Suppressive sweep', type: 'all', power: 0.8, targetId: target.id };
    else enemy.intent = { name: enemy.type === 'drone' ? 'Prism bolt' : 'Lunge', type: 'attack', power: 1, targetId: target.id };
  }
  function startBattle(id, origin = null) {
    const s = game.state, encounter = ENCOUNTERS[id];
    if (!encounter) return toast('That encounter is unavailable.');
    if (s.mode === 'battle') return { ok: false, message: 'A battle is already underway.' };
    if (s.cleared.includes(id)) return { ok: false, message: 'This path is already clear.' };
    if (id === 'boss' && (!s.flags.relayWest || !s.flags.relayEast)) return toast('The observatory sleeps. Restore both relays first.');
    const landmark = LANDMARKS.find(l => l.id === id);
    const snapshot = copy({ ...s, checkpoint: null, battle: null, mode: 'explore' });
    s.checkpoint = { state: snapshot, id, origin: origin || { x: landmark.x, z: landmark.z } };
    s.mode = 'battle';
    s.battle = { id, name: encounter.name, origin: { ...(origin || landmark) }, enemies: encounter.enemies.map((e, i) => ({ ...e, id: `${id}-${i}`, index: i, hp: e.maxHp, atb: 8 + i * 5, statuses: [], intent: null })), phase: 1, turn: 0, actionDelay: 0, selectedHero: 'kaida', log: [id === 'boss' ? 'THE PALE WARDEN: “Preserve the final hour.”' : encounter.description], reward: encounter.reward, elapsed: 0, sequence: ++enemySerial };
    for (const [i, h] of s.party.entries()) { syncStats(h); h.statuses = []; h.atb = 52 - i * 10 + (s.settlement.beacon >= 2 ? 20 : 0); if (h.hp <= 0) h.hp = Math.round(h.maxHp * 0.35); h.mp = Math.min(h.maxMp, h.mp + (s.settlement.beacon ? 8 : 0)); }
    for (const enemy of s.battle.enemies) planEnemy(enemy);
    emit({ type: 'battleStart' }); sound('interact'); return { ok: true };
  }
  function damage(target, amount) {
    let total = Math.max(1, Math.round(amount));
    if (status(target, 'guard')) total = Math.ceil(total * 0.35);
    const shield = status(target, 'shield');
    if (shield) { const absorbed = Math.min(shield.power, total); shield.power -= absorbed; total -= absorbed; if (shield.power <= 0) target.statuses = target.statuses.filter(s => s.id !== 'shield'); }
    target.hp = Math.max(0, target.hp - total);
    if (target.hp === 0) { target.atb = 0; target.statuses = []; }
    return total;
  }
  function heal(target, amount, revive = false) {
    if (target.hp <= 0 && !revive) return 0;
    const before = target.hp; target.hp = Math.min(target.maxHp, target.hp + amount); return target.hp - before;
  }
  function tickStatuses(unit) {
    const burn = status(unit, 'burn');
    if (burn && unit.hp > 0) { const dealt = damage(unit, burn.power || 12); log(`${unit.name} takes ${dealt} Burn damage.`); }
    unit.statuses = unit.statuses.filter(s => s.id === 'shield' || s.id === 'guard' || --s.turns > 0);
  }
  function update(dt, { paused = false } = {}) {
    const s = game.state;
    if (s.mode !== 'title' && !paused && s.mode !== 'menu') s.playtime += Math.max(0, dt);
    if (paused || s.mode !== 'battle' || !s.battle) return;
    const step = Math.min(Math.max(dt, 0), 0.1) * clamp(Number(s.settings.battleSpeed) || 1, 0.6, 1.6);
    s.battle.elapsed += step;
    const resolving = s.battle.actionDelay > 0;
    s.battle.actionDelay = Math.max(0, (s.battle.actionDelay || 0) - step);
    for (const h of s.party) if (h.hp > 0) {
      const speed = getStats(h.id).speed * (status(h, 'haste') ? 1.55 : 1) * (status(h, 'slow') ? 0.6 : 1);
      h.atb = Math.min(100, h.atb + speed * step);
    }
    // Tactical WAIT gives unlimited planning time. Every committed action advances enemy
    // time during its choreography, even when another ally is holding a full gauge.
    if (!resolving && s.party.some(h => h.hp > 0 && h.atb >= 100)) return;
    for (const enemy of s.battle.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.atb = Math.min(100, enemy.atb + enemy.speed * step * (status(enemy, 'slow') ? 0.55 : 1) * (s.battle.phase >= 3 ? 1.15 : 1));
      if (enemy.atb >= 100) { enemyAct(enemy); if (s.mode !== 'battle') break; }
    }
  }
  function enemyAct(enemy) {
    const s = game.state, b = s.battle, intent = enemy.intent;
    enemy.atb = 0;
    tickStatuses(enemy);
    if (enemy.hp <= 0) { checkOutcome(); return; }
    const living = s.party.filter(h => h.hp > 0), target = hero(intent.targetId);
    const targets = intent.type === 'all' ? living : [target?.hp > 0 ? target : living[0]].filter(Boolean);
    let sum = 0;
    for (const h of targets) {
      sum += damage(h, enemy.attack * intent.power + (b.phase - 1) * 5 - getStats(h.id).defense * 0.65);
      if (intent.type === 'burn' && h.hp > 0) addStatus(h, 'burn', 3, 12);
    }
    log(`${enemy.name} · ${intent.name}: ${sum} damage.`);
    effect(intent.type === 'all' ? 'tech' : 'attack', enemy, targets, intent.name.split(' · ')[0], '#ff6880'); sound('hit');
    b.turn++; planEnemy(enemy); checkOutcome();
  }
  function act(id, actionId, targetId) {
    const s = game.state, h = hero(id);
    if (!h || s.mode !== 'battle') return { ok: false, message: 'No active battle.' };
    const action = getActions(id).find(a => a.id === actionId);
    if (!action || !action.available) return toast(action?.reason || 'That action is unavailable.');
    const livingEnemies = s.battle.enemies.filter(e => e.hp > 0);
    let target = action.target === 'enemy' ? livingEnemies.find(e => e.id === targetId) || (!targetId ? livingEnemies[0] : null) : action.target === 'ally' ? hero(targetId || id) : h;
    if (!target) return toast('Choose a valid target.');
    const revives = ['item-medkit', 'rewind'].includes(actionId);
    if (action.target === 'ally' && target.hp <= 0 && !revives) return toast('Use a Medkit or Rewind to revive a fallen ally.');
    s.battle.actionDelay = action.type === 'triple' ? 1.7 : action.type === 'combo' ? 1.3 : action.type === 'tech' ? 1.05 : 0.85;
    const participants = action.participants ? action.participants.map(hero) : [h];
    for (const participant of participants) { participant.mp -= action.cost; participant.atb = 0; participant.statuses = participant.statuses.filter(s => s.id !== 'guard'); tickStatuses(participant); }
    if (participants.some(p => p.hp <= 0)) {
      log(`${action.name} is interrupted: Burn overcomes a crew member.`);
      checkOutcome(); return { ok: true, targets: [] };
    }
    let targets = action.target === 'enemy' ? livingEnemies.filter(e => e.id === target.id || (action.radius && Math.hypot(e.x - target.x, e.z - target.z) <= action.radius)) : [target];
    const team = s.party.filter(p => p.hp > 0), attack = getStats(id).attack;
    let effectType = action.type, label = action.name, color = HEROES.find(p => p.id === id).color;
    function strike(multiplier, extra = 0) {
      let total = 0;
      for (const enemy of targets) total += damage(enemy, attack * multiplier + extra - enemy.defense * (status(enemy, 'break') ? 0.2 : 0.7));
      log(`${h.name} · ${action.name}: ${total} damage${targets.length > 1 ? ` across ${targets.length} foes` : ''}.`);
      label = `${action.name} · ${total}`;
    }
    if (actionId === 'attack') { strike(1.15); h.mp = Math.min(h.maxMp, h.mp + 3); }
    else if (actionId === 'defend') { addStatus(h, 'guard', 1); h.mp = Math.min(h.maxMp, h.mp + 6); log(`${h.name} braces. Damage reduced by 65%; +6 MP.`); effectType = 'heal'; }
    else if (actionId === 'arc-cut') strike(1.6, 8);
    else if (actionId === 'overclock') { addStatus(h, 'haste', 3); heal(h, 20); log('Kaida overclocks her stride. Haste for 3 actions.'); effectType = 'heal'; }
    else if (actionId === 'gravity-well') { strike(1.8, 8); for (const enemy of targets) if (enemy.hp > 0) addStatus(enemy, 'slow', 2); }
    else if (actionId === 'afterimage') { strike(2.4, 8); for (const enemy of targets) if (enemy.hp > 0) addStatus(enemy, 'break', 3); }
    else if (actionId === 'event-horizon') { targets = livingEnemies; strike(2.3, 10); for (const enemy of targets) if (enemy.hp > 0) addStatus(enemy, 'burn', 3, 20); }
    else if (actionId === 'time-stitch' || actionId === 'pulse-mend' || actionId === 'rewind') {
      const amount = heal(target, actionId === 'rewind' ? 120 : actionId === 'pulse-mend' ? 95 : 85, actionId === 'rewind');
      target.statuses = target.statuses.filter(s => !['burn', 'slow'].includes(s.id));
      if (actionId === 'pulse-mend') addStatus(target, 'shield', 99, 20);
      if (actionId === 'rewind') addStatus(target, 'haste', 3);
      log(`${h.name} · ${action.name}: ${target.name} recovers ${amount} HP.`); label = `+${amount} HP`; effectType = 'heal';
    } else if (actionId === 'aegis-pulse' || actionId === 'fortress') {
      targets = team; for (const ally of targets) { addStatus(ally, 'shield', 99, actionId === 'fortress' ? 75 : 45); if (actionId === 'fortress') ally.statuses = ally.statuses.filter(s => s.id !== 'burn'); }
      log(`${action.name} shields the whole crew.`); effectType = 'heal';
    } else if (actionId === 'capacitor') {
      targets = team.filter(p => p.id !== 'rune'); for (const ally of targets) { ally.mp = Math.min(ally.maxMp, ally.mp + 16); addStatus(ally, 'haste', 3); }
      log('Rune routes power to Kaida and Vex: +16 MP and Haste.'); effectType = 'heal';
    } else if (actionId.startsWith('item-')) {
      const itemId = actionId.slice(5); s.inventory[itemId]--;
      if (itemId === 'medkit') { const amount = heal(target, target.hp <= 0 ? 80 : 110, true); label = `+${amount} HP`; }
      else { const before = target.mp; target.mp = Math.min(target.maxMp, target.mp + 24); label = `+${target.mp - before} MP`; }
      log(`${h.name} uses ${ITEMS[itemId].name} on ${target.name}.`); effectType = 'heal';
    } else if (actionId === 'combo-vex-rune') {
      targets = team; for (const ally of targets) { heal(ally, 105); addStatus(ally, 'shield', 99, 50); ally.statuses = ally.statuses.filter(s => !['burn', 'slow'].includes(s.id)); }
      log('Chrono Sanctuary restores the crew and raises a 50-point shield.'); color = '#87fff0';
    } else if (actionId === 'combo-kaida-vex' || actionId === 'combo-kaida-rune') {
      const combined = participants.reduce((sum, p) => sum + getStats(p.id).attack, 0);
      let total = 0; for (const enemy of targets) { total += damage(enemy, combined * (actionId === 'combo-kaida-rune' ? 2.15 : 1.8) - enemy.defense * 0.35); if (enemy.hp > 0) addStatus(enemy, actionId === 'combo-kaida-vex' ? 'slow' : 'break', 3); }
      log(`${action.name} · ${total} damage. ${participants.map(p => p.name).join(' + ')} in perfect time.`); label = `${action.name} · ${total}`;
    } else if (actionId === 'aeon-sunder') {
      targets = livingEnemies; const combined = participants.reduce((sum, p) => sum + getStats(p.id).attack, 0);
      let total = 0; for (const enemy of targets) { total += damage(enemy, combined * 2.6 + 45); enemy.atb = 0; addStatus(enemy, 'slow', 2); }
      log(`AEON SUNDER · ${total} damage. A new dawn tears through the old hour.`); label = `AEON SUNDER · ${total}`; color = '#fff1bb';
      s.flags.aeonSunderUsed = true;
      s.battle.sunderUsed = true;
    }
    for (const participant of participants) if (participant.hp > 0 && participant.skills.includes('second-wind')) heal(participant, 12);
    if (action.type === 'combo') { s.flags.combosUsed ||= []; if (!s.flags.combosUsed.includes(actionId)) s.flags.combosUsed.push(actionId); }
    effect(effectType === 'defend' || effectType === 'item' ? 'heal' : effectType, h, targets, label, color);
    sound(action.type === 'triple' ? 'triple' : action.type === 'combo' ? 'combo' : effectType === 'heal' ? 'heal' : action.type === 'attack' ? 'attack' : 'tech');
    checkOutcome(); return { ok: true, targets: targets.map(t => t.id) };
  }
  function checkOutcome() {
    const s = game.state, b = s.battle; if (s.mode !== 'battle' || !b) return;
    if (b.enemies.every(e => e.hp <= 0)) { grantVictory(); return; }
    if (s.party.every(h => h.hp <= 0)) { s.mode = 'defeat'; sound('defeat'); emit({ type: 'defeat' }); return; }
    if (b.id === 'boss') {
      const boss = b.enemies[0], phase = boss.hp / boss.maxHp <= 0.35 ? 3 : boss.hp / boss.maxHp <= 0.7 ? 2 : 1;
      if (phase > b.phase) {
        b.phase = phase; boss.atb = Math.min(boss.atb, 20);
        boss.intent = { name: phase === 3 ? 'ZERO HOUR · defend or shield!' : 'Pale Horizon · crew-wide blast', type: 'all', power: phase === 3 ? 1.65 : 1.2, targetId: s.party.find(h => h.hp > 0).id };
        log(phase === 3 ? 'PHASE III · ZERO HOUR. Shield the crew. The Warden prepares its final protocol!' : 'PHASE II · The Warden fractures the hour. A crew-wide blast is charging!');
        emit({ type: 'toast', message: phase === 3 ? 'ZERO HOUR — shield or defend before the Warden’s gauge fills!' : 'The Warden is charging Pale Horizon. Prepare your defenses.' });
      }
    }
  }
  function grantVictory() {
    const s = game.state, b = s.battle;
    if (!b || s.cleared.includes(b.id)) return { ok: false };
    const reward = copy(ENCOUNTERS[b.id].reward); reward.levelUps = [];
    s.cleared.push(b.id);
    for (const key of ['food', 'ore', 'energy', 'renown']) s.resources[key] += reward[key] || 0;
    for (const [itemId, quantity] of Object.entries(reward.items)) s.inventory[itemId] = (s.inventory[itemId] || 0) + quantity;
    for (const h of s.party) {
      const before = h.level; h.xp += reward.xp; h.sp += reward.sp;
      h.level = Math.min(5, LEVEL_XP.filter(xp => h.xp >= xp).length);
      syncStats(h, true); h.statuses = []; h.atb = 0;
      if (h.level > before) { reward.levelUps.push(h.name); h.hp = h.maxHp; h.mp = h.maxMp; }
      else { h.hp = Math.min(h.maxHp, Math.max(1, h.hp) + Math.round(h.maxHp * 0.2)); h.mp = Math.min(h.maxMp, h.mp + 8); }
    }
    s.mode = 'victory'; s.lastReward = reward; s.checkpoint = null;
    if (b.id === 'boss') s.flags.bossDefeated = true;
    sound('victory'); emit({ type: 'victory', reward }); return { ok: true, reward };
  }
  function retry() {
    const s = game.state, checkpoint = s.checkpoint;
    if (!checkpoint || s.mode !== 'defeat') return toast('There is no defeated encounter to retry.');
    const settings = copy(s.settings), playtime = s.playtime;
    game.state = copy(checkpoint.state); game.state.settings = settings; game.state.playtime = playtime;
    for (const h of game.state.party) { h.hp = h.maxHp; h.mp = h.maxMp; h.statuses = []; }
    return startBattle(checkpoint.id, checkpoint.origin);
  }
  function equip(id, itemId) {
    const h = hero(id), item = ITEMS[itemId];
    if (!h || !item || item.slot === 'consumable') return toast('Choose equipment for a crew member.');
    if (battleActive()) return toast('Change equipment outside battle.');
    if (item.hero && item.hero !== id) return toast(`${item.name} belongs to ${HEROES.find(h => h.id === item.hero).name}.`);
    if (h.equipment[item.slot] === itemId) return { ok: true };
    const equipped = game.state.party.filter(p => p.id !== id && p.equipment[item.slot] === itemId).length;
    if ((game.state.inventory[itemId] || 0) <= equipped) return toast('Every copy of that item is already equipped.');
    h.equipment[item.slot] = itemId; syncStats(h); sound('unlock'); return { ok: true };
  }
  function learn(id, skillId) {
    const h = hero(id), skill = SKILLS[id]?.find(s => s.id === skillId);
    if (!h || !skill) return toast('Unknown skill.');
    if (battleActive()) return toast('Learn skills outside battle.');
    if (h.skills.includes(skillId)) return { ok: false, message: 'Already learned.' };
    if (!skill.requires.every(id => h.skills.includes(id))) return toast('Learn the earlier skill in this branch first.');
    if (h.sp < skill.cost) return toast(`Requires ${skill.cost} skill points.`);
    h.sp -= skill.cost; h.skills.push(skillId); syncStats(h, true); sound('unlock'); return { ok: true };
  }
  function useItem(itemId, id) {
    if (battleActive()) return toast('Use the Items command during battle.');
    const h = hero(id); if (!h || !['medkit', 'ether'].includes(itemId) || !(game.state.inventory[itemId] > 0)) return toast('That supply is unavailable.');
    if (itemId === 'ether' && (h.hp <= 0 || h.mp >= h.maxMp)) return toast(h.hp <= 0 ? 'Revive this ally first.' : 'MP is already full.');
    if (itemId === 'medkit' && h.hp >= h.maxHp) return toast('HP is already full.');
    game.state.inventory[itemId]--;
    if (itemId === 'medkit') heal(h, h.hp <= 0 ? 80 : 110, true); else h.mp = Math.min(h.maxMp, h.mp + 24);
    sound('heal'); return { ok: true };
  }
  function getBuildCost() { return game.state.settlement.beacon === 0 ? { food: 2, ore: 4, energy: 2, renown: 0 } : game.state.settlement.beacon === 1 ? { food: 2, ore: 6, energy: 4, renown: 2 } : null; }
  function build() {
    const s = game.state, cost = getBuildCost();
    if (battleActive()) return toast('Build once the battle is over.');
    if (!cost) return toast('The Dawn Beacon is fully restored. Bellwether is a Reclaimer settlement.');
    if (Object.entries(cost).some(([key, n]) => s.resources[key] < n)) return toast(`Need ${cost.food} food, ${cost.ore} ore, ${cost.energy} energy${cost.renown ? ` and ${cost.renown} renown` : ''}. Salvage the ruins to restore the beacon.`);
    for (const [key, n] of Object.entries(cost)) s.resources[key] -= n;
    s.settlement.beacon++; s.flags.beaconBuilt = true;
    for (const h of s.party) { syncStats(h); h.hp = h.maxHp; h.mp = h.maxMp; }
    sound('build'); emit({ type: 'effect', effect: { type: 'build', source: { x: 0, z: 12 }, target: { x: 0, z: 12 }, targets: [{ x: 0, z: 12 }], color: '#89fff1', label: s.settlement.beacon === 1 ? 'DAWN BEACON RESTORED' : 'BELLWETHER · RECLAIMER' } });
    emit({ type: 'toast', message: s.settlement.beacon === 1 ? 'Beacon restored! Crew fully healed, +20 max HP, +8 max MP, and +8 MP at each battle.' : 'Beacon upgraded! Bellwether reaches Reclaimer tier. Crew gains +5 attack, +2 defense, and +20 starting ATB.' });
    return { ok: true };
  }
  function dialogue(speaker, text) { emit({ type: 'dialogue', speaker, text }); return { ok: true, speaker, text }; }
  function discoveryXp(amount) {
    for (const h of game.state.party) { h.xp += amount; h.level = Math.min(5, LEVEL_XP.filter(xp => h.xp >= xp).length); syncStats(h, true); }
  }
  function interact(id) {
    const s = game.state;
    if (s.mode === 'battle') return { ok: false, message: 'Finish the battle first.' };
    if (['causeway', 'garden', 'wardens'].includes(id)) return startBattle(id);
    if (id === 'mira') {
      s.flags.metMira = true;
      if (s.flags.bossDefeated) return dialogue('Mira', 'Look at it. A light that reaches all the way home. Tomorrow we plant beyond the walls. Tonight, you three are staying for dinner.');
      if (s.settlement.beacon) {
        if (s.party.some(h => h.hp < h.maxHp || h.mp < h.maxMp)) {
          if (s.resources.food > 0) { s.resources.food--; for (const h of s.party) { h.hp = h.maxHp; h.mp = h.maxMp; h.statuses = []; } sound('heal'); return dialogue('Mira', 'One food ration, three hot bowls. Your crew is fully restored. The beacon kept the soup warm. Rune insists this is its most important feature.'); }
          return dialogue('Mira', 'We are out of spare rations. Your medkits and aether cells will have to carry you for now.');
        }
        return dialogue('Mira', 'Hear that hum? First steady power in thirty years. Bring both relays online and the observatory will open. Take your time. We intend to be here when you return.');
      }
      return dialogue('Mira', 'Welcome home, crew. The Meridian Observatory holds a dawn core—enough power for every roof in Bellwether. Clear the causeway, wake the west and east relays, then reach the observatory. Salvage can rebuild our beacon along the way. And spend those skill points. Looking heroic only gets you so far.');
    }
    if (id === 'beacon') return build();
    if (id === 'cache-west' || id === 'cache-east') {
      const flag = id === 'cache-west' ? 'cacheWest' : 'cacheEast';
      if (s.flags[flag]) return toast('This cache has already been recovered.');
      s.flags[flag] = true;
      const itemId = id === 'cache-west' ? 'dawn-charm' : 'relay-mail';
      s.inventory[itemId] = (s.inventory[itemId] || 0) + 1; s.inventory.ether = (s.inventory.ether || 0) + 1;
      s.resources.ore += 2; s.resources.energy += 1; s.resources.food += 1;
      discoveryXp(8);
      sound('unlock');
      return dialogue(id === 'cache-west' ? 'Kaida' : 'Rune', `${id === 'cache-west' ? 'Someone hid a sunrise in a box. I like their priorities.' : 'Courier’s seal. Delivery only three centuries late. Still counts.'}\n\nRecovered ${ITEMS[itemId].name}, 1 aether cell, 2 ore, 1 energy, and 1 food. +8 XP for every crew member. Equip your new gear from the Inventory.`);
    }
    if (id === 'memory') {
      if (s.flags.memory) return dialogue('Vex', 'They did not know if anyone would hear them. They left the light on anyway.');
      s.flags.memory = true; s.inventory['memory-lens'] = 1; for (const h of s.party) h.sp++;
      discoveryXp(15);
      sound('unlock');
      return dialogue('Observatory recording', '“To whoever comes after: the Warden is not cruel. It is afraid. It has held this last hour for three hundred years. Show it that morning is allowed to come.”\n\nVex: Then we give it one. Together.\n\nRecovered Memory lens. Every crew member gains 15 XP and 1 skill point.');
    }
    if (id === 'relay-west' || id === 'relay-east') {
      const west = id === 'relay-west', flag = west ? 'relayWest' : 'relayEast', encounter = west ? 'garden' : 'wardens';
      if (s.flags[flag]) return toast('This relay is already carrying the dawn signal.');
      if (!s.cleared.includes(encounter)) return toast(west ? 'Clear the Glassroot Garden to release this relay.' : 'Defeat the sentinels guarding the east relay.');
      s.flags[flag] = true; s.resources.energy += 1; s.resources.renown += 1;
      sound('build'); emit({ type: 'effect', effect: { type: 'build', source: LANDMARKS.find(l => l.id === id), target: LANDMARKS.find(l => l.id === id), targets: [], color: '#79f5df', label: 'RELAY RESTORED' } });
      return dialogue(west ? 'Vex' : 'Rune', `${west ? 'West relay, awake. I can hear the observatory counting backward.' : 'East relay online. Whatever is up there knows we are coming.'}${s.flags.relayWest && s.flags.relayEast ? '\n\nBoth relays are restored. The Meridian Observatory is open. Their synchronized signals awaken AEON SUNDER: a devastating crew finisher, once per battle. Prepare your crew, then head north.' : '\n\nOne relay remains. Follow the other branch of the ruins.'}\n\n+1 energy · +1 renown`);
    }
    if (id === 'boss') {
      if (s.flags.bossDefeated) { s.flags.ending = true; s.mode = 'ending'; sound('unlock'); emit({ type: 'ending' }); return { ok: true }; }
      return startBattle('boss');
    }
    return { ok: false, message: 'Nothing to interact with here.' };
  }
  function getQuests() {
    const s = game.state;
    return [
      { id: 'causeway', name: 'A road out of the dark', description: 'Clear the Broken Causeway north of Bellwether.', complete: s.cleared.includes('causeway') },
      { id: 'beacon', name: 'A light to come home to', description: 'Restore the Dawn Beacon using salvage. Upgrade it to reach Reclaimer tier.', complete: s.settlement.beacon >= 1, progress: `${s.settlement.beacon}/2 beacon stages`, optional: true },
      { id: 'relays', name: 'Wake the sleeping meridian', description: 'Clear both branches and restore the west and east relays.', complete: !!(s.flags.relayWest && s.flags.relayEast), progress: `${Number(!!s.flags.relayWest) + Number(!!s.flags.relayEast)}/2 relays` },
      { id: 'memory', name: 'Someone left the light on', description: 'Find the recording beyond the Glassroot Garden.', complete: !!s.flags.memory, optional: true },
      { id: 'dawn', name: 'The last light of Bellwether', description: 'Defeat the Pale Warden at the Meridian Observatory and bring the dawn core home.', complete: !!s.flags.bossDefeated },
    ];
  }
  return game;
}
