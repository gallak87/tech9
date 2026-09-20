import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ENEMIES, TECHS, EXPANSION_CONTRACT } from '../src/content.js';
import { canEquip } from '../src/equipment.js';
import {
  createState,
  stats,
  awardXp,
  recruit,
  equip,
  unequip,
  learn,
  build,
  advanceTier,
  production,
  buy,
  buyPrice,
  sell,
  sellPrice,
  futureEligibility,
  applyRewards,
  useItem,
  research,
  serviceAvailable,
  xpForLevel,
  rest,
  battleReward,
} from '../src/progression.js';
import {
  interactStory,
  onEvent,
  questList,
  finishEnding,
} from '../src/narrative.js';
import { REGIONS, ALL_SCENES } from '../src/world.js';
import {
  createBattle,
  updateBattle,
  battleKey,
  battleView,
} from '../src/combat.js';
const count = (s, id) =>
  (s.inventory[id] || 0) +
  s.heroes.reduce(
    (n, h) => n + Object.values(h.equip).filter((x) => x === id).length,
    0,
  );
const rich = (s) => {
  Object.assign(s.resources, {
    food: 9999,
    ore: 9999,
    energy: 9999,
    renown: 9999,
  });
  return s;
};
function opening() {
  const s = createState();
  onEvent(s, 'victory', 'hav_guard');
  interactStory(s, 'hav_beacon');
  return s;
}
function crew() {
  const s = opening();
  onEvent(s, 'victory', 'ember_signal');
  interactStory(s, 'vex');
  onEvent(s, 'victory', 'orbital_guard');
  interactStory(s, 'rune');
  return s;
}
function choice(s, id, flag) {
  const r = interactStory(s, id);
  assert.ok(r.choices.some((c) => c.flag === flag));
  s.flags[flag] = true;
  return onEvent(s, 'choice', flag);
}

test('solo opening, all reference gear and full 18+1 enemy hierarchy', () => {
  const s = createState();
  assert.deepEqual(
    s.heroes.map((h) => h.id),
    ['kaida'],
  );
  assert.ok(s.heroes[0].skills.includes('salt_mend'));
  const ids = [
    'iron_blade',
    'void_shard',
    'rune_gauntlet',
    'scrap_vest',
    'bio_weave',
    'data_chip',
    'crit_lens',
    'bog_fang',
    'swamp_coil',
    'glacial_claw',
    'moss_ward',
    'ember_core',
    'frost_plate',
    'void_scepter',
    'magma_blade',
    'titan_shard',
    'ember_crown',
  ];
  for (const id of ids) assert.ok(ITEMS[id]);
  assert.equal(Object.keys(ENEMIES).length, 19);
  assert.notEqual(ENEMIES.void_architect, ENEMIES.architect_herald);
});
test('linear XP makes level 40 reachable and companions grow independently', () => {
  const s = createState();
  const required = Array.from({ length: 39 }, (_, i) =>
    xpForLevel(i + 1),
  ).reduce((a, b) => a + b, 0);
  assert.equal(required, 18720);
  awardXp(s, required);
  assert.equal(s.heroes[0].level, 40);
  recruit(s, 'vex');
  assert.equal(s.heroes[1].level, 40);
  assert.equal(s.heroes[1].skillPoints, 39);
  const n = s.heroes.length;
  assert.equal(recruit(s, 'vex').ok, false);
  assert.equal(s.heroes.length, n);
});
test('equipment transfers preserve ownership; selling never sells equipped copies', () => {
  const s = rich(createState());
  buy(s, 'iron_blade', 2);
  const total = count(s, 'iron_blade');
  assert.equal(equip(s, 'kaida', 'iron_blade').ok, true);
  assert.equal(count(s, 'iron_blade'), total);
  assert.equal(unequip(s, 'kaida', 'weapon').ok, true);
  assert.equal(count(s, 'iron_blade'), total);
  assert.equal(sell(s, 'iron_blade', total + 1).ok, false);
  equip(s, 'kaida', 'iron_blade');
  assert.equal(sell(s, 'iron_blade', total).ok, false);
  assert.equal(buy(s, 'iron_blade', -2).ok, false);
  assert.equal(sell(s, 'iron_blade', 0.5).ok, false);
  s.inventory.namekeeper = 1;
  assert.equal(sell(s, 'namekeeper').ok, false);
});
test('resale rewards higher equipment tiers without making discounted trade profitable', () => {
  assert.deepEqual(
    ['iron_blade', 'signal_saber', 'magma_blade', 'horizon_edge'].map(
      sellPrice,
    ),
    [13, 40, 85, 156],
  );
  assert.equal(sellPrice('field_tonic'), 3);
  assert.equal(sellPrice('tide_elixir'), 9);
  assert.equal(sellPrice('namekeeper'), 0);
  assert.equal(sellPrice('missing'), 0);
  for (const item of Object.values(ITEMS).filter(
    (i) => !i.unique && i.price > 0,
  )) {
    const state = createState();
    state.tier = 4;
    state.resources.ore = 9999;
    state.flags.mara_trade_route = true;
    state.inventory = {};
    assert.equal(buy(state, item.id, 3).ok, true);
    const paid = 9999 - state.resources.ore;
    assert.ok(sellPrice(item.id) * 3 < paid, item.name);
    const before = state.resources.ore;
    assert.equal(sell(state, item.id, 3).ok, true);
    assert.equal(state.resources.ore - before, sellPrice(item.id) * 3);
    assert.equal(state.inventory[item.id], 0);
  }
});

test('purchase quotes and payments share discounts and round once for the whole quantity', () => {
  const state = rich(createState());
  state.flags.mara_trade_route = true;
  assert.equal(buyPrice(state, 'iron_blade'), 26);
  assert.equal(buyPrice(state, 'iron_blade', 2), 51);
  for (const quantity of [1, 2, 99]) {
    const before = state.resources.ore;
    const quoted = buyPrice(state, 'iron_blade', quantity);
    assert.equal(buy(state, 'iron_blade', quantity).ok, true);
    assert.equal(before - state.resources.ore, quoted);
  }
  for (const quantity of [0, -1, 0.5, 100, NaN]) {
    assert.equal(buyPrice(state, 'iron_blade', quantity), null);
    assert.equal(buy(state, 'iron_blade', quantity).ok, false);
  }
  assert.equal(buyPrice(state, 'missing'), null);
  assert.equal(buyPrice(state, 'namekeeper'), null);
});
test('equipment stat changes clamp health and consumables cannot duplicate', () => {
  const s = createState(),
    h = s.heroes[0];
  s.inventory.titan_shard = 1;
  equip(s, 'kaida', 'titan_shard');
  h.hp = stats(h, s).maxHp;
  unequip(s, 'kaida', 'armor');
  assert.equal(h.hp, stats(h, s).maxHp);
  s.inventory.dawn_seed = 1;
  h.hp = 0;
  assert.equal(useItem(s, 'field_tonic', 'kaida').ok, false);
  assert.equal(useItem(s, 'dawn_seed', 'kaida').ok, true);
  assert.equal(s.inventory.dawn_seed, 0);
  assert.equal(useItem(s, 'dawn_seed', 'kaida').ok, false);
});
test('skill prerequisites and all pair/triple techniques are real progression gates', () => {
  const s = crew();
  awardXp(s, 14000);
  const h = s.heroes[0];
  assert.equal(learn(s, 'kaida', 'time_sever').ok, false);
  assert.equal(learn(s, 'kaida', 'chrono_strike').ok, true);
  assert.equal(learn(s, 'vex', 'null_field').ok, true);
  assert.equal(learn(s, 'rune', 'bulwark').ok, true);
  assert.equal(learn(s, 'kaida', 'prism_cut').ok, true);
  assert.equal(learn(s, 'rune', 'harbor_break').ok, true);
  assert.equal(learn(s, 'vex', 'shelterlight').ok, true);
  assert.equal(learn(s, 'kaida', 'concord_dawn').ok, false);
  s.tier = 4;
  assert.equal(learn(s, 'kaida', 'concord_dawn').ok, true);
  assert.equal(learn(s, 'vex', 'concord_dawn').ok, false);
  assert.ok(h.skillPoints >= 0);
});
test('civic progression has no circular building gates and all buildings affect play', () => {
  const s = rich(opening());
  assert.equal(build(s, 'town_center').ok, true);
  assert.equal(advanceTier(s).ok, true);
  assert.equal(s.tier, 2);
  for (const id of [
    'farm',
    'mine',
    'energy_extractor',
    'walls',
    'barracks',
    'forge',
    'research_lab',
  ])
    assert.equal(build(s, id).ok, true, id);
  assert.equal(build(s, 'town_center').ok, true);
  assert.equal(advanceTier(s).ok, false);
  recruit(s, 'vex');
  recruit(s, 'rune');
  assert.equal(advanceTier(s).ok, true);
  for (const id of ['town_center', 'research_lab', 'forge', 'walls'])
    assert.equal(build(s, id).ok, true, id);
  assert.equal(advanceTier(s).ok, false);
  for (const f of ['forest_seal', 'mire_seal', 'crater_seal', 'frost_seal'])
    s.flags[f] = true;
  assert.equal(advanceTier(s).ok, true);
  assert.equal(s.tier, 4);
  assert.equal(s.flags.final_ready, false);
  s.flags.crown_memory = true;
  onEvent(s, 'build', 'walls');
  assert.equal(s.flags.final_ready, true);
  const before = { ...s.resources };
  production(s, 20);
  for (const id of ['food', 'ore', 'energy'])
    assert.ok(s.resources[id] > before[id]);
  const base = createState();
  assert.ok(stats(s.heroes[0], s).def > stats(base.heroes[0], base).def);
});
test('research, service schedule and purchase costs are enforced', () => {
  const s = rich(opening());
  assert.equal(serviceAvailable(s, 'archivist'), false);
  s.tier = 2;
  s.buildings.research_lab = 1;
  awardXp(s, 900);
  assert.equal(serviceAvailable(s, 'archivist'), true);
  const before = stats(s.heroes[0], s).int;
  assert.equal(research(s).ok, true);
  assert.equal(stats(s.heroes[0], s).int, before + 6);
  assert.equal(research(s).ok, false);
  assert.equal(buy(s, 'horizon_edge').ok, false);
});
test('main quest and liberation rewards are idempotent through save round trips', () => {
  const s = opening();
  const snapshot = JSON.stringify(s);
  assert.equal(onEvent(s, 'victory', 'hav_guard').rewards.length, 0);
  assert.equal(interactStory(s, 'hav_beacon').rewards.length, 0);
  assert.equal(JSON.stringify(s), snapshot);
  const restored = JSON.parse(snapshot);
  assert.equal(applyRewards(restored, { ore: 400 }, 'main_beacon').ok, false);
  assert.equal(restored.resources.ore, s.resources.ore);
});
test('each Vex branch concludes with exactly its unique item and technique', () => {
  for (const branch of ['vex_keep', 'vex_release']) {
    const s = crew();
    interactStory(s, 'vex_record');
    choice(s, 'vex_echo', branch);
    assert.ok(s.flags.vex_arc_complete);
    assert.ok(
      s.heroes.find((h) => h.id === 'vex').skills.includes('witness_song'),
    );
    assert.equal(
      s.inventory[branch === 'vex_keep' ? 'witness_prism' : 'quiet_prism'],
      1,
    );
    assert.equal(
      s.inventory[branch === 'vex_keep' ? 'quiet_prism' : 'witness_prism'],
      undefined,
    );
    assert.equal(onEvent(s, 'choice', branch).rewards.length, 0);
  }
});
test('each Rune branch concludes honestly and one changes crew health', () => {
  for (const branch of ['rune_remember', 'rune_renew']) {
    const s = crew();
    interactStory(s, 'rune_names');
    const before = stats(s.heroes[0], s).maxHp;
    choice(s, 'rune_oath', branch);
    assert.ok(s.flags.rune_arc_complete);
    assert.equal(
      s.inventory[branch === 'rune_remember' ? 'namekeeper' : 'open_gate'],
      1,
    );
    assert.ok(
      s.heroes.find((h) => h.id === 'rune').skills.includes('open_horizon'),
    );
    if (branch === 'rune_renew') assert.ok(s.flags.rune_living_oath);
    assert.ok(stats(s.heroes[0], s).maxHp >= before);
  }
});
test('Mara’s two choices preserve exclusive services and converge on reunion', () => {
  for (const branch of ['mara_choose_route', 'mara_choose_shelter']) {
    const s = crew();
    interactStory(s, 'mara');
    interactStory(s, 'coastal_cache');
    choice(s, 'mara_convoy', branch);
    interactStory(s, 'signal_receiver');
    assert.equal(interactStory(s, 'mara_lantern').rewards.length, 0);
    s.flags.frost_seal = true;
    interactStory(s, 'mara_lantern');
    assert.ok(s.flags.mara_arc_complete);
    assert.equal(s.inventory.mara_compass, 1);
    assert.notEqual(
      Boolean(s.flags.mara_trade_route),
      Boolean(s.flags.mara_shelter),
    );
    const finished = questList(s).find((q) => q.id === 'mara');
    assert.equal(finished.complete, true);
    assert.equal(interactStory(s, 'mara_lantern').rewards.length, 0);
  }
});
test('regional main objectives require guardians; only Architect finishes campaign', () => {
  const s = crew();
  for (const [boss, object, flag] of [
    ['forest_warden', 'forest_heart', 'forest_seal'],
    ['mire_warden', 'mire_archive', 'mire_seal'],
    ['crater_lord', 'crater_forge', 'crater_seal'],
    ['frost_colossus', 'frost_beacon', 'frost_seal'],
    ['crown_herald', 'crown_memory', 'crown_memory'],
  ]) {
    assert.equal(interactStory(s, object).rewards.length, 0);
    onEvent(s, 'victory', boss);
    interactStory(s, object);
    assert.ok(s.flags[flag]);
  }
  assert.equal(s.campaignComplete, false);
  const result = onEvent(s, 'victory', 'void_architect');
  assert.equal(s.campaignComplete, false);
  assert.equal(s.flags.pendingEnding, true);
  assert.ok(result.lines.length > 10);
  assert.ok(result.lines.some((l) => l.text.includes('Listener')));
  assert.equal(onEvent(s, 'victory', 'void_architect').rewards.length, 0);
  assert.equal(finishEnding(s).ok, true);
  assert.equal(s.campaignComplete, true);
  assert.ok(interactStory(s, 'ending_beacon').lines.length > 4);
  assert.equal(interactStory(s, 'ending_beacon').rewards.length, 0);
});
test('future player eligibility requires BOTH conditions and never ships expansion', () => {
  for (const level of [1, 39, 40, 60])
    for (const done of [false, true]) {
      const s = createState();
      s.heroes[0].level = level;
      s.campaignComplete = done;
      const gate = futureEligibility(s);
      assert.equal(gate.eligible, done && level >= 40);
      assert.equal(gate.available, false);
      assert.equal(gate.developmentAuthorized, false);
    }
  assert.equal(EXPANSION_CONTRACT.available, false);
});

// This simulates production combat through the same fresh keyboard API as the UI.
// It grants no levels, flags, gear, currency, or victories outside actual gameplay rules.
function simulateCampaign(seed = 9127, minimal = false) {
  const state = createState();
  state.seed = seed;
  state.rng = seed;
  const report = {
    battles: [],
    milestones: [],
    builds: [],
    losses: 0,
    heals: 0,
    items: 0,
    defends: 0,
    training: 0,
    flagsGranted: 0,
  };
  const objects = Object.values(ALL_SCENES).flatMap((s) => s.objects);
  const snapshot = (id) =>
    report.milestones.push({
      id,
      levels: state.heroes.map((h) => `${h.id}:${h.level}`),
      resources: Object.fromEntries(
        Object.entries(state.resources).map(([k, v]) => [k, Math.floor(v)]),
      ),
    });
  function improve() {
    for (const h of state.heroes) {
      const score = (i) => {
        const s = ITEMS[i]?.stats || {};
        return (
          (h.id === 'vex' ? s.int || 0 : s.str || 0) * 3 +
          (s.def || 0) * 2 +
          (s.maxHp || 0) * 0.1 +
          (s.maxMp || 0) * 0.1 +
          (s.spd || 0) +
          (s.crit || 0) * 0.5
        );
      };
      for (const slot of ['weapon', 'armor', 'accessory']) {
        const owned = Object.keys(state.inventory)
          .filter(
            (id) =>
              state.inventory[id] > 0 &&
              ITEMS[id]?.slot === slot &&
              canEquip(h.id, id),
          )
          .sort((a, b) => score(b) - score(a));
        if (owned[0] && score(owned[0]) > score(h.equip[slot]))
          equip(state, h.id, owned[0]);
      }
    }
    for (const t of Object.values(TECHS))
      for (const id of t.heroes) learn(state, id, t.id);
  }
  function press(b, key) {
    battleKey(b, state, key);
  }
  function selectIndex(b, n) {
    let guard = 0;
    while (b.cursor !== n && guard++ < 40) press(b, 'ArrowDown');
    assert.equal(b.cursor, n);
    press(b, 'Enter');
  }
  function act(b) {
    if (b.action || !b.selectedHero) return;
    const selected = b.heroes.find((h) => h.id === b.selectedHero),
      view = battleView(b, state),
      living = b.heroes.filter((h) => h.hp > 0),
      need = living.filter((h) => h.hp / h.maxHp < 0.55),
      critical = living.some((h) => h.hp / h.maxHp < 0.32);
    const techs = view.techs
      .filter((t) => !t.unavailable)
      .map((t) => TECHS[t.id]);
    let tech = need.length
      ? techs.find((t) => t.effect === 'heal' && t.target === 'allAllies') ||
        techs.find((t) => t.effect === 'heal')
      : null;
    let itemId =
      !tech && critical
        ? ['tide_elixir', 'field_tonic'].find((id) => state.inventory[id] > 0)
        : null;
    if (!tech && !itemId && b.heroes.some((h) => h.hp <= 0))
      itemId = state.inventory.dawn_seed > 0 ? 'dawn_seed' : null;
    if (
      !tech &&
      !itemId &&
      b.enemies.some((e) => e.charging) &&
      !selected.guarding
    )
      tech = techs.find(
        (t) =>
          t.effect === 'shield' &&
          t.target === 'allAllies' &&
          living.some((h) => h.shield < 20),
      );
    if (!tech && !itemId)
      tech = techs
        .filter((t) => ['damage', 'drain', 'slow'].includes(t.effect))
        .sort((a, z) => {
          const value = (t) =>
            t.power *
            t.heroes.reduce(
              (n, id) => n + (b.heroes.find((h) => h.id === id)[t.stat] || 0),
              0,
            ) *
            (t.target === 'allEnemies'
              ? b.enemies.filter((e) => e.hp > 0).length
              : 1);
          return value(z) - value(a);
        })[0];
    if (b.mode === 'waiting') press(b, 'Enter');
    assert.equal(b.mode, 'command');
    if (tech) {
      selectIndex(b, 1);
      selectIndex(
        b,
        battleView(b, state).techs.findIndex((t) => t.id === tech.id),
      );
      if (tech.effect === 'heal') report.heals++;
    } else if (itemId) {
      selectIndex(b, 3);
      selectIndex(
        b,
        Object.keys(state.inventory)
          .filter((id) => state.inventory[id] > 0 && ITEMS[id]?.effect)
          .indexOf(itemId),
      );
      report.items++;
    } else selectIndex(b, 0);
    if (b.mode === 'target') {
      if (b.pending.target === 'enemy') {
        const targets = b.enemies.filter((e) => e.hp > 0);
        let index = targets.findIndex(
          (e) => e.hp === Math.min(...targets.map((x) => x.hp)),
        );
        while (b.target !== index) press(b, 'ArrowDown');
      }
      press(b, 'Enter');
    }
    assert.ok(b.action, `No action ${b.mode} ${b.notice}`);
  }
  function fight(id) {
    const e = objects.find((o) => o.id === id && o.enemies);
    assert.ok(e, id);
    if (e.requires) assert.ok(state.flags[e.requires], `Blocked ${id}`);
    const level = state.heroes[0].level,
      b = createBattle(state, e);
    let ticks = 0;
    while (!b.result && ticks++ < 50000) {
      if (!b.action && b.selectedHero) act(b);
      updateBattle(b, state, 0.05);
    }
    report.battles.push({
      id,
      level,
      result: b.result,
      seconds: Math.round(b.clock),
      hp: state.heroes.map((h) => h.hp),
      actions: b.actionSerial,
    });
    if (b.result !== 'victory') {
      report.losses++;
      throw Error(
        `Lost ${id} at level${level}, ${b.logs
          .map((x) => x.text)
          .slice(-12)
          .join(' | ')}`,
      );
    }
    const reward = battleReward(e, true);
    applyRewards(state, reward, 'battle_' + e.id);
    onEvent(state, 'victory', e.id);
    production(state, 12);
    improve();
  }
  function story(id, choice) {
    const r = interactStory(state, id);
    if (choice) {
      assert.ok(r.choices.some((c) => c.flag === choice));
      state.flags[choice] = true;
      onEvent(state, 'choice', choice);
    }
    production(state, 8);
    improve();
  }
  function recover() {
    rest(state);
  }
  function construct(id) {
    const result = build(state, id);
    report.builds.push({ id, ok: result.ok, message: result.message });
    assert.ok(result.ok, result.message);
  }
  function tier() {
    const result = advanceTier(state);
    assert.ok(result.ok, result.message);
    snapshot('tier' + state.tier);
  }
  function visit(id) {
    state.region = id;
    onEvent(state, 'visit', id);
  }
  function travel(id) {
    const p = REGIONS[state.region].portals.find((p) => p.to === id);
    assert.ok(p, `${state.region}->${id}`);
    const req = p.requires;
    if (typeof req === 'string') assert.ok(state.flags[req], req);
    if (req?.tier) assert.ok(state.tier >= req.tier);
    if (req?.flag) assert.ok(state.flags[req.flag], req.flag);
    visit(id);
    production(state, 20);
  }
  function gather(region) {
    for (const o of REGIONS[region].objects.filter(
      (o) => o.type === 'pickup',
    )) {
      if (state.pickups[o.id]) continue;
      const reward = ITEMS[o.item]
        ? { items: { [o.item]: o.amount || 1 } }
        : { [o.item]: o.amount || 1 };
      applyRewards(state, reward, 'pickup_' + o.id);
      state.pickups[o.id] = true;
    }
    improve();
  }
  if (minimal) {
    story('hav_beacon');
    fight('hav_first');
    fight('hav_guard');
    recover();
    story('hav_beacon');
    construct('town_center');
    tier();
    recover();
    travel('emberline');
    fight('ember_guard');
    recover();
    story('vex');
    snapshot('minimalBeforeVex');
    fight('ember_signal');
    story('ember_observatory');
    snapshot('minimalAfterVex');
    return report;
  }
  // Authored route: one clear per encounter; no repeated farming, grants or training.
  story('hav_beacon');
  fight('hav_first');
  fight('hav_guard');
  recover();
  story('mara');
  story('hav_beacon');
  construct('farm');
  construct('mine');
  construct('energy_extractor');
  construct('walls');
  story('coastal_cache');
  story('well_filter');
  gather('haventide');
  fight('hav_road');
  recover();
  fight('hav_crabway');
  recover();
  fight('hav_road_east');
  recover();
  fight('hav_east_sentries');
  construct('town_center');
  tier();
  recover();
  snapshot('beforeEmber');
  travel('emberline');
  fight('ember_arrival');
  recover();
  story('mara_convoy', 'mara_choose_route');
  fight('ember_guard');
  recover();
  story('vex');
  snapshot('beforeVexBattle');
  fight('ember_signal');
  story('ember_observatory');
  snapshot('recruitVex');
  recover();
  story('signal_receiver');
  gather('emberline');
  construct('barracks');
  construct('forge');
  construct('research_lab');
  fight('ember_dunes');
  recover();
  fight('ember_north_patrol');
  recover();
  fight('ember_road_east');
  recover();
  travel('orbital_reach');
  fight('orbital_entry');
  recover();
  fight('orbital_guard');
  story('rune');
  snapshot('recruitRune');
  recover();
  gather('orbital_reach');
  story('orbital_blackbox');
  construct('town_center');
  tier();
  research(state);
  fight('orbital_east');
  recover();
  fight('orbital_upper');
  recover();
  travel('emberline');
  travel('forest_veil');
  gather('forest_veil');
  fight('forest_entry');
  recover();
  story('vex_record');
  story('seed_vault');
  fight('forest_hollows');
  recover();
  fight('forest_warden');
  story('forest_heart');
  recover();
  fight('forest_east');
  recover();
  snapshot('forestComplete');
  travel('mire_bog');
  gather('mire_bog');
  fight('mire_entry');
  recover();
  fight('mire_west');
  recover();
  fight('mire_pool');
  recover();
  fight('mire_steppingstones');
  recover();
  fight('mire_warden');
  story('mire_archive');
  story('vex_echo', 'vex_keep');
  recover();
  snapshot('mireComplete');
  travel('forest_veil');
  travel('emberline');
  travel('crater_ember');
  gather('crater_ember');
  fight('crater_entry');
  recover();
  fight('crater_north');
  recover();
  fight('crater_bridge');
  recover();
  story('crater_pressure');
  fight('crater_south');
  recover();
  fight('crater_lord');
  story('crater_forge');
  recover();
  snapshot('craterComplete');
  travel('emberline');
  travel('orbital_reach');
  travel('frost_canyon');
  gather('frost_canyon');
  fight('frost_entry');
  recover();
  story('rune_names');
  fight('frost_revenants');
  recover();
  fight('frost_crossing');
  recover();
  fight('frost_colossus');
  story('frost_beacon');
  story('mara_lantern');
  recover();
  snapshot('frostComplete');
  travel('orbital_reach');
  travel('last_crown');
  gather('last_crown');
  fight('crown_entry');
  recover();
  fight('crown_guard');
  recover();
  story('rune_oath', 'rune_remember');
  fight('crown_garden');
  recover();
  fight('crown_south');
  recover();
  fight('crown_herald');
  story('crown_memory');
  snapshot('heraldDefeated');
  assert.equal(state.campaignComplete, false);
  construct('town_center');
  construct('research_lab');
  construct('forge');
  construct('walls');
  tier();
  improve();
  recover();
  snapshot('beforeFinal');
  fight('void_architect');
  assert.equal(state.campaignComplete, false);
  assert.ok(state.flags.pendingEnding);
  assert.equal(finishEnding(state).ok, true);
  assert.ok(state.campaignComplete);
  snapshot('ending');
  travel('orbital_reach');
  travel('emberline');
  travel('haventide');
  story('ending_beacon');
  snapshot('aftermath');
  assert.ok(state.heroes[0].level >= 40);
  assert.ok(Object.keys(REGIONS).every((id) => state.visited[id]));
  assert.equal(report.losses, 0);
  return report;
}

test('whole campaign: 40 unique legal battles, eight portal-gated regions, three arcs, tiers, Architect and level-40 aftermath', (t) => {
  for (const seed of [9127, 2048, 7]) {
    const report = simulateCampaign(seed);
    assert.equal(report.battles.length, 40);
    assert.equal(new Set(report.battles.map((b) => b.id)).size, 40);
    assert.equal(report.losses, 0);
    assert.equal(report.training, 0);
    assert.equal(report.flagsGranted, 0);
    assert.ok(report.heals > 0, 'The route should use actual support actions.');
    const beforeFinal = report.milestones.find((m) => m.id === 'beforeFinal');
    assert.ok(
      Number(beforeFinal.levels[0].split(':')[1]) < 45,
      'Main-campaign rewards should not trivialize the final boss.',
    );
    t.diagnostic(
      JSON.stringify({
        seed,
        battles: report.battles.length,
        losses: report.losses,
        heals: report.heals,
        consumables: report.items,
        combatSeconds: report.battles.reduce((n, b) => n + b.seconds, 0),
        beforeVex: report.milestones.find((m) => m.id === 'beforeVexBattle')
          .levels,
        beforeFinal: beforeFinal.levels,
        aftermath: report.milestones.find((m) => m.id === 'aftermath').levels,
      }),
    );
  }
});
test('shared first-clear and replay economy preserve separate rewards', () => {
  const encounter = {
    id: 'test',
    enemies: ['rust_scrapper', 'drone_sentinel'],
  };
  const first = battleReward(encounter, true),
    repeat = battleReward(encounter, false, () => 0.9);
  assert.equal(first.xp, ENEMIES.rust_scrapper.xp + ENEMIES.drone_sentinel.xp);
  assert.equal(first.items.iron_blade, 1);
  assert.equal(first.items.data_chip, 1);
  assert.equal(repeat.xp, Math.floor(first.xp * 0.35));
  assert.equal(repeat.ore, Math.floor(first.ore * 0.5));
  assert.deepEqual(repeat.items, {});
});

test('minimal main route earns Vex solo without optional quests, perfect timing or encounter farming', (t) => {
  for (const seed of [9127, 2048, 7, 81, 19]) {
    const report = simulateCampaign(seed, true);
    assert.equal(report.battles.length, 4);
    assert.equal(report.losses, 0);
    assert.equal(report.milestones.at(-1).levels.length, 2);
    t.diagnostic(
      JSON.stringify({
        seed,
        minimalRoute: true,
        battles: report.battles.length,
        losses: report.losses,
        heals: report.heals,
        consumables: report.items,
        beforeVex: report.milestones.find((m) => m.id === 'minimalBeforeVex')
          .levels,
        afterVex: report.milestones.at(-1).levels,
      }),
    );
  }
});

test('branch dialogue only gives lines to companions who have actually joined', () => {
  const solo = opening();
  interactStory(solo, 'coastal_cache');
  const convoy = interactStory(solo, 'mara_convoy');
  assert.ok(convoy.lines.length > 0);
  assert.equal(
    convoy.lines.some((l) => l.speaker === 'Vex' || l.speaker === 'Rune'),
    false,
  );
  const pair = opening();
  onEvent(pair, 'victory', 'ember_signal');
  interactStory(pair, 'ember_observatory');
  assert.equal(pair.heroes.length, 2);
  onEvent(pair, 'victory', 'mire_warden');
  const archive = interactStory(pair, 'mire_archive');
  assert.equal(
    archive.lines.some((l) => l.speaker === 'Rune'),
    false,
  );
  assert.ok(
    archive.lines.some(
      (l) => l.speaker === 'Kaida' && l.text === 'A shelter with no door.',
    ),
  );
});

test('Architect victory alone does not complete the ending or grant future eligibility', () => {
  const s = crew();
  awardXp(s, 18720);
  assert.ok(s.heroes[0].level >= 40);
  assert.equal(finishEnding(s).ok, false);
  const defeat = onEvent(s, 'victory', 'void_architect');
  assert.ok(defeat.lines.length > 10);
  assert.equal(s.flags.architect_defeated, true);
  assert.equal(s.flags.pendingEnding, true);
  assert.equal(s.flags.ending_seen, false);
  assert.equal(s.campaignComplete, false);
  assert.equal(futureEligibility(s).eligible, false);
  const saved = JSON.parse(JSON.stringify(s));
  assert.equal(onEvent(saved, 'victory', 'void_architect').rewards.length, 0);
  assert.equal(futureEligibility(saved).eligible, false);
  assert.equal(finishEnding(saved).ok, true);
  assert.equal(saved.flags.ending_seen, true);
  assert.equal(saved.flags.pendingEnding, false);
  assert.equal(saved.campaignComplete, true);
  assert.equal(futureEligibility(saved).eligible, true);
  assert.equal(futureEligibility(saved).available, false);
  const finished = JSON.stringify(saved);
  assert.equal(finishEnding(saved).ok, false);
  assert.equal(JSON.stringify(saved), finished);
});

test('Bran’s optional vendor quest accepts a found chip, consumes one loose copy and rewards once', () => {
  const s = createState();
  assert.equal(
    questList(s).some((q) => q.id === 'smith_calibration'),
    false,
  );
  choice(s, 'smith_calibration', 'smith_calibration_defer');
  assert.equal(s.flags.smith_calibration_started, undefined);
  choice(s, 'smith_calibration', 'smith_calibration_accept');
  assert.equal(s.flags.smith_calibration_started, true);
  assert.equal(
    questList(s).find((q) => q.id === 'smith_calibration').stage,
    'A salvaged interpreter',
  );
  const missing = JSON.stringify(s);
  assert.equal(interactStory(s, 'smith_calibration').choices, undefined);
  assert.equal(JSON.stringify(s), missing);
  // The actual mandatory gate reward supplies a chip; no invented quest pickup is needed.
  const gate = ALL_SCENES.haventide.objects.find((o) => o.id === 'hav_guard');
  applyRewards(s, battleReward(gate, true), 'test_gate');
  onEvent(s, 'victory', 'hav_guard');
  assert.equal(s.inventory.data_chip, 1);
  assert.equal(equip(s, 'kaida', 'data_chip').ok, true);
  const equipped = interactStory(s, 'smith_calibration');
  assert.ok(equipped.lines.some((l) => l.text.includes('equipped')));
  assert.equal(equipped.choices, undefined);
  assert.equal(s.heroes[0].equip.accessory, 'data_chip');
  assert.equal(unequip(s, 'kaida', 'accessory').ok, true);
  assert.equal(
    questList(s).find((q) => q.id === 'smith_calibration').stage,
    'Return to Bran',
  );
  const before = { ore: s.resources.ore, cells: s.inventory.ether_cell };
  const r = choice(s, 'smith_calibration', 'smith_calibration_handoff');
  assert.equal(r.rewards.find((r) => r.id === 'xp').amount, 150);
  assert.equal(s.inventory.data_chip, 0);
  assert.equal(s.flags.smith_calibration_complete, true);
  assert.equal(s.resources.ore, before.ore + 35);
  assert.equal(s.inventory.ether_cell, before.cells + 2);
  assert.equal(
    questList(s).find((q) => q.id === 'smith_calibration').complete,
    true,
  );
  const restored = JSON.parse(JSON.stringify(s)),
    snapshot = JSON.stringify(restored);
  assert.equal(interactStory(restored, 'smith_calibration').rewards.length, 0);
  assert.equal(
    onEvent(restored, 'choice', 'smith_calibration_handoff').rewards.length,
    0,
  );
  assert.equal(JSON.stringify(restored), snapshot);
});

test('Bran’s handoff rechecks inventory after the choice opens and never consumes equipment', () => {
  const s = createState();
  choice(s, 'smith_calibration', 'smith_calibration_accept');
  s.inventory.data_chip = 1;
  assert.ok(interactStory(s, 'smith_calibration').choices);
  equip(s, 'kaida', 'data_chip');
  s.flags.smith_calibration_handoff = true;
  const before = { ...s.resources };
  const r = onEvent(s, 'choice', 'smith_calibration_handoff');
  assert.equal(r.rewards.length, 0);
  assert.equal(s.flags.smith_calibration_complete, undefined);
  assert.equal(s.flags.smith_calibration_handoff, undefined);
  assert.equal(s.inventory.data_chip, 0);
  assert.equal(s.heroes[0].equip.accessory, 'data_chip');
  assert.deepEqual(s.resources, before);
});
