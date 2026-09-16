import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, recruit } from '../src/progression.js';
import { TECHS } from '../src/content.js';
import { createBattle, updateBattle, battleKey, battleView, battleClick } from '../src/combat.js';

function setup(enemies = ['rust_scrapper'], party = ['kaida']) {
  const state = createState();
  for (const id of party.slice(1)) recruit(state, id);
  const battle = createBattle(state, { id: 'test_encounter', enemies, biome: 'haventide' });
  return { state, battle };
}
function ready(battle, state, ids = battle.heroes.map(h => h.id)) {
  for (const h of battle.heroes) if (ids.includes(h.id)) h.atb = 99.999;
  for (const e of battle.enemies) e.atb = 0;
  updateBattle(battle, state, .001);
  assert.ok(battle.readyQueue.length);
}
function attack(battle, state) {
  battleKey(battle, state, 'Enter');
  battleKey(battle, state, 'Enter');
  assert.equal(battle.mode, 'target');
  battleKey(battle, state, 'Enter');
  assert.ok(battle.action);
}
function finish(battle, state) {
  for (let i = 0; battle.action && i < 200; i++) updateBattle(battle, state, .025);
  assert.equal(battle.action, null);
}
function giveSkill(state, id) {
  const owner = state.heroes.find(h => TECHS[id].heroes.includes(h.id));
  if (!owner.skills.includes(id)) owner.skills.push(id);
}
function tech(battle, state, id) {
  battleKey(battle, state, 'Enter');
  battleKey(battle, state, 'ArrowDown');
  battleKey(battle, state, 'Enter');
  assert.equal(battle.mode, 'tech');
  const index = battleView(battle, state).techs.findIndex(t => t.id === id);
  assert.ok(index >= 0, `${id} is in the tech atlas`);
  for (let i = 0; i < index; i++) battleKey(battle, state, 'ArrowDown');
  battleKey(battle, state, 'Enter');
}
function contact(battle, state) {
  updateBattle(battle, state, battle.action.contact - battle.action.elapsed + .0001);
}

test('encounters contain one to four distinct, independently identified enemies; invalid required content fails visibly', () => {
  const ids = ['rust_scrapper', 'drone_sentinel', 'bog_stalker', 'slag_rat'];
  for (let n = 1; n <= 4; n++) {
    const { battle } = setup(ids.slice(0, n));
    assert.deepEqual(battle.enemies.map(e => e.id), ids.slice(0, n));
    assert.equal(new Set(battle.enemies.map(e => e.uid)).size, n);
    assert.equal(new Set(battle.enemies.map(e => `${e.home.x},${e.home.y}`)).size, n);
  }
  assert.throws(() => setup([]), /one to four/);
  assert.throws(() => setup([...ids, ids[0]]), /one to four/);
  assert.throws(() => setup(['unknown_enemy']), /Required enemy content missing/);
});

test('readiness queue orders actual threshold arrivals; a later arrival cannot steal focus; Tab is deliberate', () => {
  const { battle: b, state: s } = setup(['rust_scrapper'], ['kaida', 'vex', 'rune']);
  b.heroes[0].atb = 99; b.heroes[1].atb = 99.99; b.heroes[2].atb = 99.9;
  updateBattle(b, s, .1);
  assert.deepEqual(b.readyQueue, ['vex', 'rune', 'kaida']);
  assert.equal(b.selectedHero, 'vex');
  updateBattle(b, s, .3);
  assert.equal(b.selectedHero, 'vex');
  battleKey(b, s, 'Tab'); assert.equal(b.selectedHero, 'rune');
  b.heroes[2].hp = 0;
  updateBattle(b, s, .01);
  assert.deepEqual(b.readyQueue, ['vex', 'kaida']);
  assert.equal(b.selectedHero, 'vex');
});

test('command and target choices pause every gauge; Escape belongs exclusively to global pause', () => {
  const { battle: b, state: s } = setup(['rust_scrapper', 'drone_sentinel']);
  ready(b, s); battleKey(b, s, 'Enter');
  const gauges = [...b.heroes, ...b.enemies].map(a => a.atb);
  updateBattle(b, s, 20);
  assert.deepEqual([...b.heroes, ...b.enemies].map(a => a.atb), gauges);
  assert.equal(b.action, null);
  const mode = b.mode;
  assert.equal(battleKey(b, s, 'Escape'), false);
  assert.equal(b.mode, mode);
  battleKey(b, s, 'Enter');
  assert.equal(b.mode, 'target');
  updateBattle(b, s, 20);
  assert.deepEqual([...b.heroes, ...b.enemies].map(a => a.atb), gauges);
  battleKey(b, s, 'Backspace'); assert.equal(b.mode, 'command');
  battleKey(b, s, 'Backspace'); assert.equal(b.mode, 'waiting');
});

test('held and repeated keydowns cannot skip choices or reuse the execute press as timing input', () => {
  const { battle: b, state: s } = setup(); ready(b, s);
  const down = repeat => battleKey(b, s, { key: 'Enter', type: 'keydown', repeat });
  const up = () => battleKey(b, s, { key: 'Enter', type: 'keyup' });
  down(false); assert.equal(b.mode, 'command');
  down(true); down(false); assert.equal(b.mode, 'command');
  up(); down(false); assert.equal(b.mode, 'target');
  up(); down(false); assert.equal(b.mode, 'action');
  assert.equal(b.action.timingAttempted, false);
  updateBattle(b, s, (b.action.windowStart + b.action.windowEnd) / 2);
  down(true); down(false);
  assert.equal(b.action.timingAttempted, false);
  up(); down(false);
  assert.equal(b.action.timingSuccess, true);
});

test('timing offers one fresh attempt, boosts probability without guaranteeing critical, and resolves damage once', () => {
  const { battle: b, state: s } = setup(['gravbot']); ready(b, s); attack(b, s);
  const a = b.action;
  const before = b.enemies[0].hp;
  assert.equal(a.timingAttempted, false);
  updateBattle(b, s, (a.windowStart + a.windowEnd) / 2);
  assert.equal(b.enemies[0].hp, before);
  battleKey(b, s, ' ');
  assert.equal(a.timingSuccess, true);
  contact(b, s);
  assert.ok(a.criticalChance > .45 && a.criticalChance < 1);
  const after = b.enemies[0].hp;
  assert.ok(after < before);
  updateBattle(b, s, .05);
  assert.equal(b.enemies[0].hp, after);
  assert.equal(a.timingAttempted, true);
  const missed = setup(['gravbot']); ready(missed.battle, missed.state); attack(missed.battle, missed.state);
  battleKey(missed.battle, missed.state, ' '); // too early: the single attempt is spent
  const ma = missed.battle.action;
  updateBattle(missed.battle, missed.state, (ma.windowStart + ma.windowEnd) / 2);
  battleKey(missed.battle, missed.state, 'Enter');
  assert.equal(ma.timingSuccess, false);
  contact(missed.battle, missed.state);
  assert.ok(ma.criticalChance < .2);
});

test('timing assistance widens the opportunity; identical seeds and fresh presses produce identical outcomes', () => {
  const normal = setup(['gravbot']), assisted = setup(['gravbot']);
  assisted.state.settings.timingAssist = true;
  for (const setup of [normal, assisted]) { ready(setup.battle, setup.state); attack(setup.battle, setup.state); }
  assert.ok(assisted.battle.action.windowEnd - assisted.battle.action.windowStart > normal.battle.action.windowEnd - normal.battle.action.windowStart);
  const twin = setup(['gravbot']); ready(twin.battle, twin.state); attack(twin.battle, twin.state);
  finish(twin.battle, twin.state); finish(normal.battle, normal.state);
  assert.equal(twin.battle.enemies[0].hp, normal.battle.enemies[0].hp);
  assert.equal(twin.state.rng, normal.state.rng);
});

test('a paused timeline, contact, and timing window remain exact until updateBattle resumes', () => {
  const { battle: b, state: s } = setup(['gravbot']); ready(b, s); attack(b, s);
  updateBattle(b, s, b.action.windowStart + .01);
  const before = JSON.stringify(battleView(b, s));
  // The root pause does not call updateBattle. Pure view reads cannot mutate time.
  for (let i = 0; i < 120; i++) battleView(b, s);
  assert.equal(JSON.stringify(battleView(b, s)), before);
  battleKey(b, s, ' '); assert.equal(b.action.timingSuccess, true);
  updateBattle(b, s, .01);
  assert.equal(b.action.elapsed, b.action.windowStart + .02);
});

test('single and group healing target only living allies and persist at the authoritative contact', () => {
  const { battle: b, state: s } = setup(['gravbot'], ['kaida', 'vex', 'rune']);
  b.heroes[0].hp = 40; b.heroes[1].hp = 13; b.heroes[2].hp = 0;
  ready(b, s, ['kaida']); tech(b, s, 'salt_mend');
  assert.equal(b.mode, 'target');
  const view = battleView(b, s);
  assert.deepEqual(view.targets.map(t => t.id), ['kaida', 'vex']);
  assert.equal(view.targets[b.target].id, 'vex');
  battleKey(b, s, 'Enter'); contact(b, s);
  assert.ok(b.heroes[1].hp > 13);
  assert.equal(s.heroes[1].hp, b.heroes[1].hp);
  assert.equal(b.heroes[2].hp, 0); finish(b, s);
  ready(b, s, ['vex']); b.selectedHero = 'vex'; tech(b, s, 'lantern_mend');
  battleKey(b, s, 'Enter');
  assert.deepEqual(b.action.targets, ['kaida', 'vex']);
  contact(b, s); assert.ok(b.heroes[0].hp > 40);
});

test('all pair techniques and the full-party technique enforce readiness and spend each participant once', () => {
  for (const id of ['prism_cut', 'harbor_break', 'shelterlight', 'concord_dawn']) {
    const { battle: b, state: s } = setup(['mire_hulk', 'gravbot'], ['kaida', 'vex', 'rune']);
    giveSkill(s, id);
    const members = TECHS[id].heroes;
    ready(b, s, [members[0]]); b.selectedHero = members[0];
    let t = battleView(b, s).techs.find(t => t.id === id);
    assert.match(t.unavailable, /Waiting/);
    ready(b, s, members); b.selectedHero = members[0];
    const mp = b.heroes.map(h => h.mp);
    tech(b, s, id); assert.equal(b.mode, 'target');
    battleKey(b, s, 'Enter');
    assert.deepEqual(b.action.participants, members);
    for (let i = 0; i < b.heroes.length; i++) {
      assert.equal(b.heroes[i].mp, mp[i] - (members.includes(b.heroes[i].id) ? TECHS[id].mp : 0));
      if (members.includes(b.heroes[i].id)) assert.equal(b.heroes[i].atb, 0);
    }
    const targetHp = b.enemies.map(e => e.hp);
    contact(b, s);
    if (TECHS[id].effect === 'damage') assert.ok(b.enemies.some((e, i) => e.hp < targetHp[i]));
  }
});

test('shield, drain, and slow have combat effects; defense never requests an enemy', () => {
  const { battle: b, state: s } = setup(['gravbot'], ['kaida', 'vex', 'rune']);
  ready(b, s, ['rune']); b.selectedHero = 'rune'; tech(b, s, 'aegis_field'); battleKey(b, s, 'Enter'); contact(b, s);
  assert.ok(b.heroes.every(h => h.shield > 0)); finish(b, s);
  const hp = b.heroes.reduce((n, h) => n + h.hp, 0), ward = b.heroes.reduce((n, h) => n + h.shield, 0);
  const unwarded = structuredClone(b), unwardedState = structuredClone(s);
  for (const h of unwarded.heroes) h.shield = 0;
  unwarded.enemies[0].atb = 100; updateBattle(unwarded, unwardedState, .001); contact(unwarded, unwardedState);
  b.enemies[0].atb = 100; updateBattle(b, s, .001); contact(b, s);
  assert.ok(b.heroes.reduce((n, h) => n + h.shield, 0) < ward);
  assert.ok(b.heroes.reduce((n, h) => n + h.hp, 0) > unwarded.heroes.reduce((n, h) => n + h.hp, 0));
  assert.ok(b.heroes.reduce((n, h) => n + h.hp, 0) <= hp); finish(b, s);
  giveSkill(s, 'chrono_strike'); ready(b, s, ['kaida']); b.selectedHero = 'kaida'; tech(b, s, 'chrono_strike'); battleKey(b, s, 'Enter'); contact(b, s);
  assert.equal(b.enemies[0].slowTurns, 2); finish(b, s);
  b.enemies[0].hp = 1000; b.enemies[0].maxHp = 1000;
  giveSkill(s, 'entropy_surge'); b.heroes[1].hp = 20; ready(b, s, ['vex']); b.selectedHero = 'vex'; tech(b, s, 'entropy_surge'); battleKey(b, s, 'Enter'); contact(b, s);
  assert.ok(b.heroes[1].hp > 20); finish(b, s);
  ready(b, s, ['kaida']); b.selectedHero = 'kaida'; battleKey(b, s, 'Enter'); battleKey(b, s, 'ArrowDown'); battleKey(b, s, 'ArrowDown'); battleKey(b, s, 'Enter');
  assert.equal(b.action.command.kind, 'defend'); assert.deepEqual(b.action.targets, ['kaida']);
});

test('revival uses a consumed field supply and can only target a fallen companion', () => {
  const { battle: b, state: s } = setup(['gravbot'], ['kaida', 'vex']);
  s.inventory.dawn_seed = 1; b.heroes[1].hp = 0;
  ready(b, s, ['kaida']); battleKey(b, s, 'Enter');
  for (let i = 0; i < 3; i++) battleKey(b, s, 'ArrowDown');
  battleKey(b, s, 'Enter');
  const index = battleView(b, s).items.findIndex(i => i.id === 'dawn_seed');
  for (let i = 0; i < index; i++) battleKey(b, s, 'ArrowDown');
  battleKey(b, s, 'Enter');
  assert.deepEqual(battleView(b, s).targets.map(t => t.id), ['vex']);
  battleKey(b, s, 'Enter'); assert.equal(s.inventory.dawn_seed, 0);
  contact(b, s); assert.equal(b.heroes[1].hp, Math.round(b.heroes[1].maxHp * .35));
});

test('fallen queued participants and targets cannot perform or receive ghost actions', () => {
  const { battle: b, state: s } = setup(['gravbot', 'mire_hulk'], ['kaida', 'vex']);
  ready(b, s); attack(b, s);
  b.enemies[0].hp = 0; const before = b.enemies[1].hp;
  b.heroes[1].hp = 0;
  contact(b, s); finish(b, s);
  assert.equal(b.enemies[1].hp, before);
  assert.ok(!b.readyQueue.includes('vex'));
  assert.equal(b.result, null);
});

test('elite telegraphs allow a response; the Void Architect changes phases before its real defeat', () => {
  const { battle: b, state: s } = setup(['void_architect']);
  b.enemies[0].atb = 100; updateBattle(b, s, .001);
  assert.equal(b.action.command.effect, 'telegraph'); contact(b, s);
  assert.equal(b.enemies[0].charging, true); finish(b, s);
  assert.equal(b.result, null);
  b.enemies[0].hp = Math.floor(b.enemies[0].maxHp * .66);
  ready(b, s); attack(b, s); contact(b, s);
  assert.equal(b.enemies[0].bossPhase, 2);
  assert.ok(b.enemies[0].shield > 0); finish(b, s);
  b.enemies[0].shield = 0; b.enemies[0].hp = Math.floor(b.enemies[0].maxHp * .32);
  ready(b, s); attack(b, s); contact(b, s);
  assert.equal(b.enemies[0].bossPhase, 3); finish(b, s);
  b.enemies[0].hp = 1; b.enemies[0].shield = 0;
  ready(b, s); attack(b, s); contact(b, s);
  assert.equal(b.result, null, 'The final contact and recovery remain visible.');
  finish(b, s); assert.equal(b.result, 'victory');
  assert.equal(s.campaignComplete, false, 'Narrative ending and reward ownership belong to the integrator.');
});

test('mouse uses the same deliberate targeting and execution rules in native 960×540 coordinates', () => {
  const { battle: b, state: s } = setup(['gravbot', 'mire_hulk']); ready(b, s);
  // These are the public hit-area descriptors produced by drawBattle; mouse input
  // translates the native coordinates once and dispatches the same commands.
  b.hitAreas = [{ x: 282, y: 327, w: 133, h: 16, kind: 'command', index: 0 }];
  battleClick(b, s, 300 * 1.25, 335 * 1.25); assert.equal(b.mode, 'target');
  b.hitAreas = [{ x: 580, y: 190, w: 100, h: 100, kind: 'actor', id: 'enemy_1' }];
  battleClick(b, s, 600 * 1.25, 220 * 1.25); assert.equal(b.target, 1); assert.equal(b.action, null);
  b.hitAreas = [{ x: 430, y: 371, w: 322, h: 25, kind: 'execute' }];
  battleClick(b, s, 500 * 1.25, 380 * 1.25);
  assert.deepEqual(b.action.targets, ['enemy_1']);
});

test('mouse can page techniques, select an ally through the party panel, cancel, and request global pause', () => {
  const { battle: b, state: s } = setup(['gravbot'], ['kaida', 'vex', 'rune']); ready(b, s);
  b.hitAreas = [{ x: 282, y: 342, w: 133, h: 16, kind: 'command', index: 1 }];
  battleClick(b, s, 300 * 1.25, 350 * 1.25); assert.equal(b.mode, 'tech');
  b.hitAreas = [{ x: 616, y: 389, w: 17, h: 24, kind: 'scroll', direction: 1 }];
  battleClick(b, s, 620 * 1.25, 399 * 1.25); assert.equal(b.cursor, 5);
  const mend = battleView(b, s).techs.findIndex(t => t.id === 'salt_mend');
  b.hitAreas = [{ x: 430, y: 327, w: 186, h: 16, kind: 'list', index: mend }];
  battleClick(b, s, 460 * 1.25, 335 * 1.25); assert.equal(b.mode, 'target');
  b.hitAreas = [{ x: 12, y: 353, w: 254, h: 28, kind: 'hero', id: 'vex' }];
  battleClick(b, s, 100 * 1.25, 360 * 1.25);
  assert.equal(battleView(b, s).targets[b.target].id, 'vex');
  assert.equal(b.selectedHero, 'kaida');
  b.hitAreas = [{ x: 561, y: 26, w: 70, h: 18, kind: 'back' }];
  battleClick(b, s, 590 * 1.25, 35 * 1.25); assert.equal(b.mode, 'tech');
  const before = JSON.stringify(battleView(b, s));
  assert.equal(battleClick(b, s, 710 * 1.25, 35 * 1.25), 'pause');
  assert.equal(JSON.stringify(battleView(b, s)), before);
});

test('defeated enemies hold a visible down pose before fading; result updates advance presentation only', () => {
  const { state, battle } = setup();
  battle.enemies[0].hp = 1;
  ready(battle, state); attack(battle, state);
  updateBattle(battle, state, battle.action.contact);
  let visual = battleView(battle, state).enemies[0].visual;
  assert.equal(battle.enemies[0].hp, 0);
  assert.equal(visual.pose, 'down');
  assert.equal(visual.opacity, 1);
  updateBattle(battle, state, .6);
  visual = battleView(battle, state).enemies[0].visual;
  assert.equal(visual.pose, 'down');
  assert.equal(visual.opacity, 1);
  updateBattle(battle, state, .26);
  assert.equal(battle.result, 'victory');
  visual = battleView(battle, state).enemies[0].visual;
  assert.ok(visual.opacity > 0 && visual.opacity < 1);
  const resources = battle.heroes.map(h => ({ hp:h.hp, mp:h.mp, atb:h.atb }));
  const logs = structuredClone(battle.logs);
  assert.equal(battleKey(battle, state, 'Enter'), false);
  updateBattle(battle, state, .5);
  assert.equal(battleView(battle, state).enemies[0].visual.opacity, 0);
  assert.deepEqual(battle.heroes.map(h => ({ hp:h.hp, mp:h.mp, atb:h.atb })), resources);
  assert.deepEqual(battle.logs, logs);
  assert.equal(battle.action, null);
  assert.equal(battle.result, 'victory');
});
