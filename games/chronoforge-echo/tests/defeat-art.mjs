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
    'Production battle rendering and Game.update. Built-in solo and final-party presets supply character/skill fixtures. Every attack/heal uses legal battleKey command, technique, target and execute flow; no enemy HP, actor resources, action times, poses or opacity are assigned. Samples advance production update by exact seconds after a naturally lethal contact. These fixtures verify death presentation, not earned campaign progression.',
  errors: [],
  cases: [],
};
page.on('pageerror', (e) => report.errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') report.errors.push(m.text());
});
await page.routeWebSocket('**/*', (s) => {
  s.send('{"type":"connected"}');
  s.onMessage(() => {});
});
try {
  await page.goto('http://127.0.0.1:4321/?test=1');
  await page.waitForFunction(() => window.__ECHO_READY__);
  await page.evaluate(async () => {
    window.deathModules = await Promise.all([
      import('/src/combat.js'),
      import('/src/content.js'),
    ]);
    window.deathUpdate = window.__ECHO__.game.update;
    window.__ECHO__.game.update = () => {};
  });
  for (const preset of ['battle', 'final']) {
    await page.evaluate((preset) => {
      window.__ECHO__.game.resetSession();
      window.__ECHO__.preset(preset);
      if (preset === 'final') {
        window.__ECHO__.game.battle.encounter.id = 'void_architect';
        window.__ECHO__.game.battle.biome = 'alien';
      }
    }, preset);
    const lethal = await page.evaluate(() => {
      const g = window.__ECHO__.game,
        [B, C] = window.deathModules;
      let turns = 0;
      while (turns++ < 150) {
        let ticks = 0;
        while (!g.battle.action && !g.battle.selectedHero && ticks++ < 6000)
          window.deathUpdate.call(g, 0.02);
        const b = g.battle;
        if (!b.action) {
          const key = (k) => B.battleKey(b, g.state, k),
            choose = (i) => {
              let n = 0;
              while (b.cursor !== i && n++ < 30) key('ArrowDown');
              key('Enter');
            };
          const available = B.battleView(b, g.state)
            .techs.filter((t) => !t.unavailable)
            .map((t) => C.TECHS[t.id]);
          let tech = b.heroes.some((h) => h.hp > 0 && h.hp / h.maxHp < 0.55)
            ? available.find(
                (t) => t.effect === 'heal' && t.target === 'allAllies',
              ) || available.find((t) => t.effect === 'heal')
            : null;
          if (!tech)
            tech = available
              .filter((t) => ['damage', 'drain', 'slow'].includes(t.effect))
              .sort(
                (a, z) => z.power * z.heroes.length - a.power * a.heroes.length,
              )[0];
          if (b.mode === 'waiting') key('Enter');
          if (tech) {
            choose(1);
            choose(
              B.battleView(b, g.state).techs.findIndex((t) => t.id === tech.id),
            );
          } else choose(0);
          if (b.mode === 'target') key('Enter');
        }
        const a = b.action;
        if (!a) throw Error('Legal action was not available');
        const before = B.battleView(b, g.state);
        window.deathUpdate.call(g, Math.max(0.001, a.contact - a.elapsed));
        if (b.enemies.every((e) => e.hp === 0))
          return {
            turns,
            enemy: b.enemies[0].id,
            killingAction: a.command.name,
            before,
            clock: b.clock,
            after: B.battleView(b, g.state),
          };
        if (b.heroes.every((h) => h.hp === 0))
          throw Error(
            'Fixture party defeated before the requested death frame',
          );
        window.deathUpdate.call(g, a.duration - a.elapsed + 0.001);
      }
      throw Error('Legal action limit reached');
    });
    const frames = [];
    let last = 0;
    for (const elapsed of [0, 0.2, 0.5, 0.67, 0.83, 1.02, 1.12]) {
      if (elapsed > last)
        await page.evaluate(
          (dt) => window.deathUpdate.call(window.__ECHO__.game, dt),
          elapsed - last,
        );
      await page.waitForTimeout(25);
      const file =
        'defeat-' +
        lethal.enemy +
        '-' +
        String(frames.length).padStart(2, '0') +
        '.png';
      await page.screenshot({ path: reviewRoot + '' + file });
      frames.push({
        elapsed,
        file,
        ...(await page.evaluate(() => ({
          battle: window.__ECHO__.snapshot().battle,
          resultTime: window.__ECHO__.game.battleResultTime,
          mode: window.__ECHO__.game.mode,
        }))),
      });
      last = elapsed;
    }
    for (const f of frames) {
      const e = f.battle.enemies[0];
      assert.equal(e.hp, 0);
      assert.equal(e.atb, 0);
      assert.equal(e.visual.pose, 'down');
      assert.ok(!f.battle.targets.some((t) => t.id === e.uid));
      if (f.elapsed <= 0.67) assert.equal(e.visual.opacity, 1);
    }
    for (const f of frames.filter(
      (f) => f.elapsed === 0.83 || f.elapsed === 1.02,
    ))
      assert.ok(
        f.battle.enemies[0].visual.opacity > 0 &&
          f.battle.enemies[0].visual.opacity < 1,
      );
    assert.equal(frames.at(-1).battle.enemies[0].visual.opacity, 0);
    assert.equal(frames.at(-1).battle.result, 'victory');
    const beforeFinish = await page.evaluate(() => {
      const g = window.__ECHO__.game;
      window.deathUpdate.call(g, 1.34 - g.battleResultTime);
      return {
        mode: g.mode,
        resultTime: g.battleResultTime,
        result: g.battle?.result,
      };
    });
    assert.equal(beforeFinish.mode, 'battle');
    assert.equal(beforeFinish.result, 'victory');
    const afterFinish = await page.evaluate(() => {
      const g = window.__ECHO__.game;
      window.deathUpdate.call(g, 0.02);
      return {
        mode: g.mode,
        battle: !!g.battle,
        panel: g.ui.panel?.type,
        pendingEnding: g.state.flags.pendingEnding,
      };
    });
    assert.equal(afterFinish.mode, 'world');
    assert.equal(afterFinish.battle, false);
    if (preset === 'final') {
      assert.equal(afterFinish.panel, 'dialogue');
      assert.equal(afterFinish.pendingEnding, true);
    }
    let endingCompletion;
    if (preset === 'final') {
      for (
        let i = 0;
        i < 30 &&
        (await page.evaluate(
          () => window.__ECHO__.game.ui.panel?.type === 'dialogue',
        ));
        i++
      )
        await page.keyboard.press('Enter');
      assert.equal(
        await page.evaluate(() => window.__ECHO__.game.ui.panel?.type),
        'ending',
      );
      await page.screenshot({
        path: reviewRoot + 'defeat-void_architect-ending.png',
      });
      for (
        let i = 0;
        i < 12 &&
        !(await page.evaluate(
          () => document.activeElement?.dataset.do === 'ending-continue',
        ));
        i++
      )
        await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(() => document.activeElement?.dataset.do),
        'ending-continue',
      );
      await page.keyboard.press('Enter');
      endingCompletion = await page.evaluate(() => {
        window.deathUpdate.call(window.__ECHO__.game, 1);
        const g = window.__ECHO__.game;
        return {
          complete: g.state.campaignComplete,
          pendingEnding: g.state.flags.pendingEnding,
          endingSeen: g.state.flags.ending_seen,
          scene: g.scene.id,
          panel: g.ui.panel?.type,
        };
      });
      assert.equal(endingCompletion.complete, true);
      assert.equal(endingCompletion.pendingEnding, false);
      assert.equal(endingCompletion.endingSeen, true);
      assert.match(endingCompletion.scene, /^haventide/);
      assert.equal(endingCompletion.panel, undefined);
    }
    report.cases.push({
      preset,
      lethal,
      frames,
      beforeFinish,
      afterFinish,
      endingCompletion,
      assertions:
        'Visible .68s down hold; .42s fade; untargetable; result transition retained at 1.35s',
    });
    console.log('PASS ' + lethal.enemy);
  }
  assert.deepEqual(report.errors, []);
  report.result = 'pass';
} catch (e) {
  report.result = 'fail';
  report.failure = String(e);
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    reviewRoot + 'defeat-art.json',
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  console.log(
    JSON.stringify({
      result: report.result,
      failure: report.failure,
      cases: report.cases.length,
      errors: report.errors,
    }),
  );
}
