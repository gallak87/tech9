import { reviewURL } from '../scripts/review-output.mjs';
/** Prerequisite fixtures use story victory events; every conversation, dismissal,
 * pause and save/load below uses the actual keyboard/DOM controls. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const evidence = reviewURL('recruitment/');
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  channel: process.env.CHROME_CHANNEL || 'chrome',
});
const report = { checks: [], positions: [], screenshots: [], errors: [] };
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.setDefaultTimeout(5000);
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.routeWebSocket('**/*', (s) => {
    s.send('{"type":"connected"}');
    s.onMessage(() => {});
  });
  await page.goto(process.env.ECHO_URL || 'http://127.0.0.1:4321/?test');
  await page.waitForFunction(() => window.__ECHO_READY__);
  await page.evaluate(() => document.fonts.ready);
  const snap = () =>
    page.evaluate(() => {
      const g = window.__ECHO__.game;
      return {
        party: g.state.heroes.map((h) => h.id),
        panel: g.ui.panel?.type,
        line: g.ui.panel?.lines?.[g.ui.panel.index]?.text,
        walk: g.state.recruitmentWalk,
        actor: window.recruitment.recruitmentActor(g.state),
        followers: g.followers,
        flags: g.state.flags,
        paused: g.ui.menu,
        joinEvents: g.logs.filter((l) => l.type === 'companion_joined').length,
      };
    });
  const shot = async (name) => {
    await page.screenshot({ path: new URL(name + '.png', evidence).pathname });
    report.screenshots.push(name + '.png');
  };
  const seed = async ({
    ready = false,
    scene = 'emberline_town',
    object = 'vex',
    reduced = false,
    rune = false,
  } = {}) =>
    page.evaluate(
      async (args) => {
        window.narrative = await import('/src/narrative.js');
        window.recruitment = await import('/src/recruitment.js');
        window.progression = await import('/src/progression.js');
        window.__ECHO__.preset('solo');
        const g = window.__ECHO__.game;
        g.resetSession();
        g.logs = [];
        window.narrative.onEvent(g.state, 'victory', 'hav_guard');
        window.narrative.interactStory(g.state, 'hav_beacon');
        window.narrative.onEvent(g.state, 'victory', 'ember_guard');
        if (args.ready)
          window.narrative.onEvent(g.state, 'victory', 'ember_signal');
        if (args.rune) {
          window.narrative.interactStory(g.state, 'vex');
          window.narrative.onEvent(g.state, 'victory', 'orbital_guard');
        }
        window.__ECHO__.goto(args.scene);
        g.state.settings.reducedMotion = args.reduced;
        const o = g.scene.objects.find((o) => o.id === args.object);
        Object.assign(g.state, g.safePoint(g.scene, o.x, o.y + 34));
        g.state.facing = 'right';
        g.near = o;
        g.resetFollowers();
        g.updateCamera(true);
        g.ui.render();
      },
      { ready, scene, object, reduced, rune },
    );
  const finishDialogue = async () => {
    for (let i = 0; i < 15; i++) {
      if ((await snap()).panel !== 'dialogue') return;
      await page.keyboard.press('Enter');
    }
    throw Error('Dialogue did not end');
  };
  await seed();
  await page.keyboard.press('f');
  assert.match((await snap()).line, /certainty/);
  await page.keyboard.press('Escape');
  assert.deepEqual((await snap()).party, ['kaida']);
  assert.equal((await snap()).walk, undefined);
  await page.keyboard.press('f');
  assert.match((await snap()).line, /observatory is still occupied/);
  await shot('01-distinct-observatory-gate');
  await page.keyboard.press('Escape');
  report.checks.push(
    'Before observatory clear, F/Enter/Esc leave a solo party; repeat conversation explicitly distinguishes the Exchange and names the separate patrol',
  );
  await page.evaluate(() =>
    window.narrative.onEvent(
      window.__ECHO__.game.state,
      'victory',
      'ember_signal',
    ),
  );
  await page.keyboard.press('f');
  let s = await snap();
  assert.deepEqual(s.party, ['kaida', 'vex']);
  assert.equal(s.walk.started, false);
  assert.equal(s.actor.x, s.walk.path[0].x);
  assert.equal(s.actor.y, s.walk.path[0].y);
  await finishDialogue();
  await page.waitForTimeout(220);
  s = await snap();
  assert.ok(s.walk?.started);
  report.positions.push(s.actor);
  await shot('02-vex-first-steps');
  await page.waitForTimeout(210);
  s = await snap();
  report.positions.push(s.actor);
  assert.ok(
    Math.hypot(
      s.actor.x - report.positions[0].x,
      s.actor.y - report.positions[0].y,
    ) > 5,
  );
  await shot('03-vex-approaches-formation');
  await page.keyboard.press('Escape');
  s = await snap();
  assert.equal(s.paused, true);
  const pausedElapsed = s.walk.elapsed;
  await page.waitForTimeout(200);
  assert.equal((await snap()).walk.elapsed, pausedElapsed);
  await page.keyboard.press('6');
  await page.locator('[data-do="save:1"]').click();
  await page.locator('[data-do="load:1"]').click();
  await page.locator('[data-do="confirm-yes"]').click();
  s = await snap();
  assert.ok(
    s.walk.elapsed >= pausedElapsed && s.walk.elapsed < pausedElapsed + 0.2,
  );
  await page.waitForFunction(() => !window.__ECHO__.game.state.recruitmentWalk);
  s = await snap();
  assert.equal(s.flags.vex_join_presented, true);
  assert.equal(s.joinEvents, 1);
  assert.equal(s.followers.filter((h) => h.id === 'vex').length, 1);
  await page
    .locator('.reward')
    .filter({ hasText: 'Vex joined the party' })
    .waitFor();
  assert.equal(
    await page
      .locator('.reward')
      .filter({ hasText: 'Vex joined the party' })
      .locator('[data-portrait="vex"]')
      .count(),
    1,
  );
  assert.match(
    await page
      .locator('.reward')
      .filter({ hasText: 'Vex joined the party' })
      .innerText(),
    /CREW/,
  );
  await page.waitForTimeout(180);
  await shot('04-vex-joined');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  assert.ok(
    (await snap()).followers.find((h) => h.id === 'vex').x !==
      s.followers.find((h) => h.id === 'vex').x,
  );
  report.checks.push(
    'Vex takes visible steps into formation; Escape pauses exact progress; actual Save/Load controls resume it; portrait CREW notice says Vex joined the party once; follower tracks movement',
  );
  await page.evaluate(() => {
    const g = window.__ECHO__.game;
    g.save(2);
    g.load(2);
    window.__ECHO__.goto('emberline');
    const o = g.scene.objects.find((o) => o.id === 'ember_observatory');
    Object.assign(g.state, g.safePoint(g.scene, o.x, o.y + 34));
    g.near = o;
    g.updateCamera(true);
  });
  await page.keyboard.press('f');
  assert.match((await snap()).line, /already with you/);
  assert.equal((await snap()).walk, undefined);
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .locator('.reward')
      .filter({ hasText: 'Vex joined the party' })
      .count(),
    0,
  );
  report.checks.push(
    'Completed save reload and revisiting the lens do not duplicate party, walk or recruitment notice',
  );
  await seed({ ready: true, scene: 'emberline', object: 'ember_observatory' });
  await page.keyboard.press('f');
  assert.equal((await snap()).walk.id, 'vex');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.equal((await snap()).walk.started, true);
  await page.keyboard.press('Enter');
  assert.equal((await snap()).walk, undefined);
  assert.equal((await snap()).flags.vex_join_presented, true);
  report.checks.push(
    'The alternative Observatory Lens endpoint works; dismissing earned join dialogue starts the same walk, and Enter safely skips its remaining motion',
  );
  await seed({ ready: true, reduced: true });
  await page.keyboard.press('f');
  await finishDialogue();
  await page.waitForFunction(() => !window.__ECHO__.game.state.recruitmentWalk);
  assert.equal((await snap()).flags.vex_join_presented, true);
  report.checks.push(
    'Reduced motion settles formation immediately after conversation and still announces the earned companion',
  );
  await seed({
    ready: true,
    rune: true,
    scene: 'orbital_reach_town',
    object: 'rune',
  });
  await page.keyboard.press('f');
  assert.deepEqual((await snap()).party, ['kaida', 'vex', 'rune']);
  await finishDialogue();
  await page.waitForTimeout(150);
  assert.equal((await snap()).walk?.id, 'rune');
  await shot('05-rune-shared-walk');
  await page.waitForFunction(() => !window.__ECHO__.game.state.recruitmentWalk);
  await page
    .locator('.reward')
    .filter({ hasText: 'Rune joined the party' })
    .waitFor();
  assert.equal((await snap()).followers.length, 2);
  report.checks.push(
    'Rune shares the earned walk/notice and occupies the second follower slot without duplicating Vex',
  );
  assert.deepEqual(report.errors, []);
  report.result = 'passed';
} finally {
  await browser.close();
  await fs.writeFile(
    new URL('report.json', evidence),
    JSON.stringify(report, null, 2),
  );
}
console.log(JSON.stringify(report, null, 2));
