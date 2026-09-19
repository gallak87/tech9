import { reviewRoot } from '../scripts/review-output.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const report = {
  method:
    'Actual production renderer and keyboard selection. Built-in party/learned-tech fixtures; enemy roster and RNG seed fixtures select reproducible attackers and defenders. The normal Game.update advances exact elapsed intervals while RAF draws. No HP, MP, readiness, pose, damage or screenshot pixels are assigned. HMR is disconnected to keep the reviewed build stable.',
  errors: [],
  techniques: [],
  enemies: [],
};
page.on('pageerror', (e) => report.errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') report.errors.push(m.text());
});
await page.routeWebSocket('**/*', (s) => {
  s.send(JSON.stringify({ type: 'connected' }));
  s.onMessage(() => {});
});
const snapshot = () => page.evaluate(() => window.__ECHO__.snapshot());
const freeze = () =>
  page.evaluate(() => {
    const g = window.__ECHO__.game;
    window.choreoUpdate ??= g.update;
    g.update = () => {};
  });
const step = (seconds) =>
  page.evaluate(
    (seconds) => window.choreoUpdate.call(window.__ECHO__.game, seconds),
    seconds,
  );
const capture = async (name) => {
  await page.waitForTimeout(20);
  const file = 'choreography-' + name + '.png';
  await page.screenshot({ path: reviewRoot + '' + file });
  return { file, ...(await snapshot()) };
};
async function timeline(name, times) {
  const frames = [];
  let last = 0;
  for (const elapsed of times) {
    if (elapsed > last) await step(elapsed - last);
    frames.push({
      elapsed,
      ...(await capture(name + '-' + String(frames.length).padStart(2, '0'))),
    });
    last = elapsed;
  }
  return frames;
}
async function technique(id) {
  await page.evaluate(() => window.__ECHO__.preset('battle-four'));
  await freeze();
  const ticks = await page.evaluate((id) => {
    const g = window.__ECHO__.game;
    let ticks = 0;
    while (ticks++ < 2000) {
      const b = g.battle;
      if (
        b.heroes.every((h) => h.atb === 100) &&
        !b.action &&
        (id !== 'shelterlight' || b.heroes.some((h) => h.hp < h.maxHp))
      )
        break;
      window.choreoUpdate.call(g, 0.02);
    }
    return ticks;
  }, id);
  assert.ok(ticks < 2000);
  if (id === 'shelterlight') await page.keyboard.press('Tab');
  for (const key of ['Enter', 'ArrowDown', 'Enter'])
    await page.keyboard.press(key);
  const techs = (await snapshot()).battle.techs,
    index = techs.findIndex((t) => t.id === id);
  assert.ok(index >= 0);
  assert.equal(techs[index].unavailable, '');
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  if (id === 'harbor_break') await page.keyboard.press('ArrowDown');
  const target = await capture(id + '-target');
  await page.keyboard.press('Enter');
  const executing = (await snapshot()).battle;
  assert.equal(executing.action.name, techs[index].name);
  for (const h of executing.heroes) {
    const old = target.battle.heroes.find((v) => v.id === h.id),
      participant = executing.action.participants.includes(h.id);
    assert.equal(h.mp, old.mp - (participant ? techs[index].mp : 0));
    assert.equal(h.atb, participant ? 0 : old.atb);
  }
  const frames = await timeline(
    id,
    [0, 0.16, 0.35, 0.46, 0.51, 0.6, 0.73, 0.81, 0.94, 1.06, 1.35, 1.72, 1.93],
  );
  const pre = frames.find((f) => f.elapsed === 0.81).battle,
    contact = frames.find((f) => f.elapsed === 0.94).battle;
  assert.equal(pre.action.resolved, false);
  assert.equal(contact.action.resolved, true);
  if (id === 'shelterlight') {
    assert.ok(contact.heroes.some((h, i) => h.hp > pre.heroes[i].hp));
    assert.equal(
      contact.heroes.find((h) => h.id === 'vex').visual.pose,
      'cast',
    );
    assert.equal(
      contact.heroes.find((h) => h.id === 'rune').visual.pose,
      'guard',
    );
  } else assert.ok(contact.enemies.some((e, i) => e.hp < pre.enemies[i].hp));
  if (id === 'harbor_break') {
    const plant = frames.find((f) => f.elapsed === 0.51).battle.heroes;
    const k = plant.find((h) => h.id === 'kaida').visual,
      r = plant.find((h) => h.id === 'rune').visual;
    assert.ok(Math.abs(k.x - r.x) < 35 && k.y < r.y - 35);
  }
  report.techniques.push({
    id,
    target,
    executing,
    frames,
    assertions:
      'MP/readiness each participant once; actual contact and support pose/launch placement pass',
  });
  console.log('PASS ' + id);
}
async function enemy(id, defender) {
  const preparation = await page.evaluate(
    async ({ id, defender }) => {
      const { createBattle } = await import('/src/combat.js');
      const g = window.__ECHO__.game;
      for (let seed = 1; seed < 100; seed++) {
        window.__ECHO__.preset(id === 'mire_warden' ? 'final' : 'party');
        g.state.flags.battle_taught = true;
        g.state.rng = Math.imul(seed, 0x9e3779b9) >>> 0;
        g.battle = createBattle(g.state, {
          id: 'choreography_' + id,
          biome:
            id === 'frost_revenant'
              ? 'ice'
              : id === 'ember_lord'
                ? 'volcanic'
                : id === 'mire_warden'
                  ? 'forest'
                  : 'coast',
          enemies: [id],
        });
        g.mode = 'battle';
        g.ui.render();
        let ticks = 0;
        while (ticks++ < 8000) {
          const a = g.battle.action;
          if (
            a?.side === 'enemy' &&
            a.targets.length === 1 &&
            ['damage', 'drain', 'slow'].includes(a.command.effect)
          ) {
            if (a.targets.length === 1 && a.targets.includes(defender))
              return {
                seed,
                ticks,
                attacker: id,
                defender,
                action: a.command.name,
              };
            break;
          }
          window.choreoUpdate.call(g, 0.01);
        }
      }
      return null;
    },
    { id, defender },
  );
  assert.ok(preparation, 'Natural single-target action available');
  const frames = await timeline(
    id + '-' + defender,
    [0, 0.18, 0.42, 0.55, 0.66, 0.72, 0.78, 0.92, 1.1, 1.35, 1.41],
  );
  const contact = frames.find((f) => f.elapsed === 0.78).battle,
    pre = frames.find((f) => f.elapsed === 0.66).battle;
  assert.equal(contact.action.resolved, true);
  assert.equal(pre.action.resolved, false);
  assert.ok(
    contact.heroes.find((h) => h.id === defender).hp <
      pre.heroes.find((h) => h.id === defender).hp,
  );
  const target = contact.heroes.find((h) => h.id === defender),
    others = contact.heroes.filter((h) => h.id !== defender);
  assert.ok(
    target.visual.x > Math.max(...others.map((h) => h.visual.x)) + 35,
    'Defender occupies a clear contact lane',
  );
  for (const h of others) {
    const start = frames[0].battle.heroes.find((v) => v.id === h.id);
    assert.equal(h.visual.x, start.visual.x, 'Bystanders keep their x staging');
    assert.equal(h.visual.y, start.visual.y, 'Bystanders keep their y staging');
  }
  report.enemies.push({
    id,
    defender,
    preparation,
    frames,
    assertions:
      'Natural ATB action, one authoritative contact, defender lane and fixed bystanders pass',
  });
  console.log('PASS ' + id + ' / ' + defender);
}
async function groupBoss(id, biome) {
  const preparation = await page.evaluate(
    async ({ id, biome }) => {
      const { createBattle } = await import('/src/combat.js');
      window.__ECHO__.preset('final');
      const g = window.__ECHO__.game;
      g.battle = createBattle(g.state, {
        id: 'choreography_' + id,
        biome,
        enemies: [id],
        boss: true,
      });
      g.mode = 'battle';
      g.ui.render();
      let ticks = 0;
      while (ticks++ < 10000) {
        if (
          g.battle.action?.side === 'enemy' &&
          g.battle.action.command.target === 'allAllies'
        )
          return { ticks, action: g.battle.action.command.name };
        window.choreoUpdate.call(g, 0.01);
      }
      return null;
    },
    { id, biome },
  );
  assert.ok(preparation);
  const frames = await timeline(
    id + '-group',
    [0, 0.18, 0.42, 0.55, 0.66, 0.72, 0.78, 0.92, 1.1, 1.35, 1.41],
  );
  const before = frames.find((f) => f.elapsed === 0.66).battle,
    after = frames.find((f) => f.elapsed === 0.78).battle;
  assert.equal(before.action.resolved, false);
  assert.equal(after.action.resolved, true);
  assert.equal(after.action.targets.length, 3);
  for (const [i, h] of after.heroes.entries())
    assert.ok(
      h.hp < before.heroes[i].hp,
      'Every living hero receives the group contact',
    );
  for (const f of frames) {
    assert.equal(
      f.battle.enemies[0].visual.x,
      frames[0].battle.enemies[0].visual.x,
    );
    assert.equal(
      f.battle.enemies[0].visual.y,
      frames[0].battle.enemies[0].visual.y,
    );
  }
  report.enemies.push({
    id,
    preparation,
    frames,
    assertions:
      'Natural charged group strike; anchored boss; three simultaneous authoritative contacts pass',
  });
  console.log('PASS ' + id + ' / group');
}
try {
  await page.goto('http://127.0.0.1:4321/?test=1', {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(() => window.__ECHO_READY__);
  await freeze();
  report.assets = (await snapshot()).assets;
  const mode = process.argv[2] || 'all';
  if (mode === 'all' || mode === 'combos')
    for (const id of [
      'prism_cut',
      'harbor_break',
      'shelterlight',
      'concord_dawn',
    ])
      await technique(id);
  if (mode === 'all' || mode === 'enemies') {
    for (const id of ['frost_revenant', 'ember_lord'])
      for (const defender of ['kaida', 'vex', 'rune'])
        await enemy(id, defender);
    await enemy('drone_sentinel', 'rune');
  }
  if (mode === 'all' || mode === 'bosses') {
    for (const [id, biome] of [
      ['frost_colossus', 'ice'],
      ['magma_behemoth', 'volcanic'],
      ['architect_herald', 'alien'],
      ['void_architect', 'alien'],
    ])
      await groupBoss(id, biome);
    await enemy('mire_warden', 'vex');
  }
  assert.deepEqual(report.errors, []);
  report.result = 'pass';
} catch (e) {
  report.result = 'fail';
  report.failure = String(e);
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    reviewRoot + 'choreography-' + (process.argv[2] || 'all') + '.json',
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  console.log(
    JSON.stringify({
      result: report.result,
      failure: report.failure,
      errors: report.errors,
      techniques: report.techniques.length,
      enemies: report.enemies.length,
    }),
  );
}
