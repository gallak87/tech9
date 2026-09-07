import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, SAVE_KEY, HEROES, SKILLS, ITEMS } from '../src/game.js';

function fresh() { const events = []; const game = createGame(e => events.push(e)); game.newGame(); return { game, events }; }
function resolve(game) { for (let i = 0; i < 100 && game.state.mode === 'battle' && game.state.battle.actionDelay > 0; i++) game.update(0.05); }
function charge(game) { resolve(game); for (const h of game.state.party) if (h.hp > 0) { h.atb = 100; h.mp = h.maxMp; } }
function finish(game, encounter) {
  if (game.state.mode === 'victory') { game.state.mode = 'explore'; game.state.battle = null; }
  assert.equal(game.startBattle(encounter).ok, true);
  for (const e of game.state.battle.enemies) e.hp = 0;
  assert.equal(game.grantVictory().ok, true);
  game.state.mode = 'explore'; game.state.battle = null;
}
function tick(game, seconds) { for (let t = 0; t < seconds; t += 0.05) game.update(0.05); }

test('initial crew stats, accessible skills, and insufficient-resource guards', () => {
  const { game } = fresh();
  assert.equal(game.state.party.length, 3);
  for (const h of game.state.party) {
    assert.equal(h.hp, game.getStats(h.id).maxHp);
    assert.equal(h.sp, 1);
    assert.equal(SKILLS[h.id].length, 4);
  }
  assert.equal(game.learn('kaida', 'afterimage').ok, false);
  const before = game.getStats('kaida').attack;
  assert.equal(game.learn('kaida', 'tempered-edge').ok, true);
  assert.equal(game.getStats('kaida').attack, before + 6);
  assert.equal(game.learn('kaida', 'swiftfoot').ok, false);
  assert.equal(game.build().ok, false);
  assert.equal(game.startBattle('boss').ok, false);
});

test('speed gauges charge and tactical WAIT allows the whole crew to coordinate', () => {
  const { game } = fresh(); game.startBattle('causeway');
  const initial = game.state.party[0].atb;
  game.update(0.05, { paused: true });
  assert.equal(game.state.party[0].atb, initial);
  tick(game, 2);
  assert.equal(game.state.party[0].atb, 100);
  const enemyGauge = game.state.battle.enemies[0].atb;
  tick(game, 5);
  assert.ok(game.state.party.every(h => h.atb === 100));
  assert.equal(game.state.battle.enemies[0].atb, enemyGauge);
  assert.ok(game.getCombos().filter(c => c.id !== 'aeon-sunder').every(c => c.available));
  assert.equal(game.getCombos().find(c => c.id === 'aeon-sunder').available, false);
});

test('area attacks use target positions and reject missing targets without consuming resources', () => {
  const { game } = fresh(); game.startBattle('garden'); charge(game);
  const [a, b, c] = game.state.battle.enemies;
  a.x = 3; a.z = 0; b.x = 3; b.z = 2; c.x = 3; c.z = 6;
  const h = game.state.party[0], beforeMP = h.mp;
  assert.equal(game.act('kaida', 'arc-cut', 'missing-enemy').ok, false);
  assert.equal(h.atb, 100); assert.equal(h.mp, beforeMP);
  assert.deepEqual(game.act('kaida', 'arc-cut', a.id).targets, [a.id, b.id]);
  assert.ok(a.hp < a.maxHp); assert.ok(b.hp < b.maxHp); assert.equal(c.hp, c.maxHp);
  assert.equal(h.atb, 0); assert.equal(h.mp, beforeMP - 6);
});

test('action choreography advances enemy time with a ready ally held and locks concurrent commands', () => {
  const { game } = fresh(); game.state.flags.relayWest = true; game.state.flags.relayEast = true;
  game.startBattle('boss'); charge(game);
  const boss = game.state.battle.enemies[0], rune = game.state.party[2];
  boss.atb = 99; boss.intent = { name: 'Clockhand Crush', type: 'attack', power: 1, targetId: 'rune' };
  const before = rune.hp;
  assert.equal(game.act('kaida', 'attack', boss.id).ok, true);
  assert.equal(game.state.battle.actionDelay, 0.85);
  assert.ok(game.getActions('vex').every(a => !a.available && a.reason === 'Resolving technique'));
  assert.ok(game.getCombos().every(a => !a.available && a.reason === 'Resolving technique'));
  assert.equal(game.act('vex', 'attack', boss.id).message, 'Resolving technique');
  assert.equal(rune.atb, 100);
  resolve(game);
  assert.ok(rune.hp < before, 'the enemy must execute its attack even though Rune stays ready');
  assert.equal(rune.atb, 100);
  assert.equal(game.state.battle.actionDelay, 0);
  const gauge = boss.atb;
  tick(game, 2);
  assert.equal(boss.atb, gauge, 'enemy time pauses again after choreography ends');
  assert.equal(game.act('vex', 'gravity-well', boss.id).ok, true);
  assert.equal(game.state.battle.actionDelay, 1.05);
});

test('all pairs and the triple consume every participant gauge and MP, with real support and interruption', () => {
  const { game, events } = fresh();
  game.state.flags.relayWest = true; game.state.flags.relayEast = true;
  game.startBattle('boss');
  for (const combo of game.getCombos()) {
    charge(game);
    const before = Object.fromEntries(game.state.party.map(h => [h.id, { mp: h.mp, hp: h.hp }]));
    if (combo.id === 'combo-vex-rune') for (const h of game.state.party) { h.hp = 30; h.statuses = []; }
    const enemy = game.state.battle.enemies[0]; enemy.hp = enemy.maxHp; enemy.atb = 85;
    assert.equal(game.act(combo.participants[0], combo.id, enemy.id).ok, true);
    for (const id of combo.participants) {
      const h = game.state.party.find(h => h.id === id);
      assert.equal(h.atb, 0); assert.equal(h.mp, before[id].mp - combo.cost);
    }
    if (combo.id === 'combo-vex-rune') assert.ok(game.state.party.every(h => h.hp === 135 && h.statuses.some(s => s.id === 'shield' && s.power === 50)));
    else assert.ok(enemy.hp < enemy.maxHp);
    if (combo.id === 'aeon-sunder') { assert.equal(enemy.atb, 0); assert.equal(game.state.flags.aeonSunderUsed, true); }
  }
  charge(game); game.state.party[2].mp = 0;
  assert.equal(game.getCombos().find(c => c.id === 'aeon-sunder').available, false);
  assert.equal(game.act('kaida', 'aeon-sunder').ok, false);
  assert.ok(events.some(e => e.type === 'effect' && e.effect.type === 'triple'));
  assert.equal(game.state.flags.combosUsed.length, 3);
});

test('items heal, revive, restore MP, and cannot be consumed when unavailable', () => {
  const { game } = fresh(); game.startBattle('garden'); charge(game);
  const [kaida, vex, rune] = game.state.party;
  vex.hp = 0;
  assert.equal(game.act('rune', 'pulse-mend', 'vex').ok, false);
  assert.equal(rune.atb, 100);
  assert.equal(game.act('kaida', 'item-medkit', 'vex').ok, true);
  assert.equal(vex.hp, 80); assert.equal(game.state.inventory.medkit, 4);
  resolve(game);
  vex.mp = 0;
  assert.equal(game.act('rune', 'item-ether', 'vex').ok, true);
  assert.equal(vex.mp, 24);
  charge(game); game.state.inventory.medkit = 0;
  assert.equal(game.act('vex', 'item-medkit', 'kaida').ok, false);
  assert.equal(vex.atb, 100);
});

test('enemy telegraphs execute, defensive shields absorb damage, and boss phases are meaningful', () => {
  const { game, events } = fresh();
  game.state.flags.relayWest = true; game.state.flags.relayEast = true;
  game.startBattle('boss'); charge(game);
  const boss = game.state.battle.enemies[0], [kaida, vex, rune] = game.state.party;
  game.act('rune', 'aegis-pulse');
  assert.ok(kaida.statuses.some(s => s.id === 'shield'));
  boss.intent = { name: 'Test strike', type: 'attack', power: 1, targetId: 'kaida' };
  for (const h of game.state.party) h.atb = 0;
  const before = kaida.hp; boss.atb = 99.9; game.update(0.05);
  assert.ok(kaida.hp >= before - 15, '45-point shield should absorb most of a boss hit');
  charge(game); boss.hp = boss.maxHp * 0.7 + 5;
  game.act('kaida', 'attack', boss.id);
  assert.equal(game.state.battle.phase, 2);
  assert.equal(boss.intent.type, 'all');
  assert.match(boss.intent.name, /Horizon/);
  charge(game); boss.hp = boss.maxHp * 0.35 + 5;
  game.act('vex', 'attack', boss.id);
  assert.equal(game.state.battle.phase, 3);
  assert.match(boss.intent.name, /ZERO HOUR/);
  assert.ok(events.some(e => e.type === 'toast' && /shield or defend/.test(e.message)));
});

test('chapter rewards, gear ownership, skill branches, discoveries, economy, and ending connect', () => {
  const { game, events } = fresh();
  assert.equal(game.interact('relay-west').ok, false);
  assert.equal(game.interact('cache-west').ok, true);
  assert.equal(game.interact('cache-west').ok, false);
  assert.equal(game.build().ok, true);
  assert.equal(game.state.settlement.beacon, 1);
  assert.equal(game.getStats('kaida').maxHp, HEROES[0].maxHp + 5 + 20);
  finish(game, 'causeway');
  assert.equal(game.state.party[0].level, 2);
  assert.equal(game.equip('kaida', 'sunsteel-edge').ok, true);
  assert.equal(game.equip('vex', 'sunsteel-edge').ok, false);
  assert.equal(game.equip('kaida', 'dawn-charm').ok, true);
  assert.equal(game.equip('vex', 'dawn-charm').ok, false);
  assert.equal(game.learn('kaida', 'tempered-edge').ok, true);
  finish(game, 'garden');
  assert.equal(game.learn('kaida', 'afterimage').ok, true);
  assert.ok(game.getActions('kaida').some(a => a.id === 'afterimage'));
  assert.equal(game.interact('relay-west').ok, true);
  assert.equal(game.interact('memory').ok, true);
  const memorySP = game.state.party[0].sp; game.interact('memory');
  assert.equal(game.state.party[0].sp, memorySP);
  finish(game, 'wardens');
  assert.equal(game.interact('relay-east').ok, true);
  assert.equal(game.build().ok, true);
  assert.equal(game.state.settlement.beacon, 2);
  assert.equal(game.build().ok, false);
  game.state.party[0].hp = 1;
  const food = game.state.resources.food; game.interact('mira');
  assert.equal(game.state.resources.food, food - 1);
  assert.equal(game.state.party[0].hp, game.state.party[0].maxHp);
  finish(game, 'boss');
  assert.equal(game.state.flags.bossDefeated, true);
  assert.equal(game.interact('boss').ok, true);
  assert.equal(game.state.mode, 'ending');
  assert.ok(game.getQuests().every(q => q.complete));
  assert.ok(events.some(e => e.type === 'ending'));
  assert.ok(Object.values(game.state.resources).every(n => n >= 0));
});

test('defeat retry restores the encounter snapshot and supplies, without duplicating victory rewards', () => {
  const { game, events } = fresh(); game.startBattle('garden'); charge(game);
  game.state.party[1].hp = 10;
  game.act('kaida', 'item-medkit', 'vex');
  assert.equal(game.state.inventory.medkit, 4);
  for (const h of game.state.party) { h.hp = 0; h.atb = 0; }
  game.state.party[0].hp = 1;
  const enemy = game.state.battle.enemies[0]; enemy.atb = 99.9; enemy.intent = { name: 'Finisher', type: 'all', power: 10, targetId: 'kaida' };
  game.update(0.05);
  assert.equal(game.state.mode, 'defeat');
  assert.ok(events.some(e => e.type === 'defeat'));
  assert.equal(game.retry().ok, true);
  assert.equal(game.state.mode, 'battle'); assert.equal(game.state.battle.id, 'garden');
  assert.equal(game.state.inventory.medkit, 5);
  assert.ok(game.state.party.every(h => h.hp === h.maxHp && h.mp === h.maxMp));
  for (const e of game.state.battle.enemies) e.hp = 0;
  game.grantVictory(); const resources = { ...game.state.resources };
  assert.equal(game.grantVictory().ok, false);
  assert.deepEqual(game.state.resources, resources);
});

test('local saves round-trip exploration and active battles, rejecting corrupt saves', () => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  try {
    const { game } = fresh(); game.interact('cache-west'); game.learn('vex', 'void-focus');
    game.state.player = { x: -12, z: -5 }; game.state.settings.music = 0.2;
    assert.equal(game.save(), true);
    const loaded = createGame(); assert.equal(loaded.load(), true);
    assert.deepEqual(loaded.state.party, game.state.party);
    assert.deepEqual(loaded.state.player, game.state.player);
    assert.equal(loaded.state.settings.music, 0.2);
    loaded.startBattle('garden'); charge(loaded); loaded.act('kaida', 'attack', loaded.state.battle.enemies[0].id); loaded.save();
    const battleLoaded = createGame(); assert.equal(battleLoaded.load(), true);
    assert.equal(battleLoaded.state.mode, 'battle');
    assert.equal(battleLoaded.state.battle.enemies[0].hp, loaded.state.battle.enemies[0].hp);
    assert.ok(battleLoaded.state.checkpoint);
    const stable = JSON.stringify(battleLoaded.state);
    const brokenShape = JSON.parse(stable); brokenShape.settlement = null;
    data.set(SAVE_KEY, JSON.stringify(brokenShape)); assert.equal(battleLoaded.load(), false);
    assert.equal(JSON.stringify(battleLoaded.state), stable, 'a failed load must preserve the current game');
    for (const mutate of [s => { s.flags = 'bad'; }, s => { s.settings.music = 'loud'; }, s => { s.player.x = 999; }, s => { s.battle.enemies[0].statuses = [null]; }]) {
      const corrupted = JSON.parse(stable); mutate(corrupted); data.set(SAVE_KEY, JSON.stringify(corrupted));
      assert.equal(battleLoaded.load(), false); assert.equal(JSON.stringify(battleLoaded.state), stable);
    }
    data.set(SAVE_KEY, '{corrupt'); assert.equal(createGame().load(), false);
    data.set(SAVE_KEY, JSON.stringify({ version: 1, party: [] })); assert.equal(createGame().load(), false);
  } finally { delete globalThis.localStorage; }
});

test('a legal tactical playthrough wins every authored encounter without granting resources', () => {
  const { game } = fresh();
  game.interact('cache-west'); game.interact('cache-east'); game.build();
  for (const h of game.state.party) game.learn(h.id, SKILLS[h.id][0].id);
  let actions = 0;
  for (const encounter of ['causeway', 'garden', 'wardens', 'boss']) {
    if (encounter === 'boss') { game.interact('relay-west'); game.interact('relay-east'); game.build(); game.interact('mira'); }
    assert.equal(game.startBattle(encounter).ok, true);
    for (let step = 0; step < 10000 && game.state.mode === 'battle'; step++) {
      game.update(0.05);
      if (game.state.mode !== 'battle' || game.state.battle.actionDelay > 0) continue;
      if (!game.state.party.every(h => h.hp <= 0 || h.atb >= 100)) continue;
      const allies = game.state.party.filter(h => h.hp > 0), target = game.state.battle.enemies.find(e => e.hp > 0);
      const injured = game.state.party.find(h => h.hp < h.maxHp * 0.35);
      let command;
      if (injured && game.state.inventory.medkit) command = [allies[0].id, 'item-medkit', injured.id];
      else if (game.getCombos().find(c => c.id === 'aeon-sunder').available) command = ['kaida', 'aeon-sunder', target.id];
      else {
        const h = allies.find(h => h.atb >= 100);
        if (!h) continue;
        command = [h.id, 'attack', target.id];
      }
      assert.equal(game.act(...command).ok, true); actions++;
      // Let each action's choreography and the enemy timeline resolve before the next command.
      for (const h of allies.filter(h => h.atb >= 100)) {
        resolve(game);
        if (game.state.mode !== 'battle') break;
        if (h.hp <= 0) continue;
        const foe = game.state.battle.enemies.find(e => e.hp > 0);
        assert.equal(game.act(h.id, 'attack', foe.id).ok, true); actions++;
      }
    }
    assert.equal(game.state.mode, 'victory', `${encounter} should be winnable with legal resources`);
    game.state.mode = 'explore'; game.state.battle = null;
    for (const [itemId, item] of Object.entries(ITEMS)) if (item.hero && game.state.inventory[itemId]) game.equip(item.hero, itemId);
    if (encounter === 'garden') game.interact('memory');
  }
  assert.ok(actions > 12, 'the chapter should require a real sequence of commands');
  assert.equal(game.state.flags.bossDefeated, true);
});
