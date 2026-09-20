import { reviewURL } from '../scripts/review-output.mjs';
/** Bounded UI regressions. Fixtures set locations/resources; input uses production keys. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const evidence = reviewURL('ui-compact/');
await fs.mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' }),
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const report = { checks: [], errors: [], badAssets: [], browserClosed: false };
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400 || r.url().includes('/public/fonts'))
    report.badAssets.push(r.url());
});
await page.routeWebSocket('**/*', (socket) => {
  socket.send('{"type":"connected"}');
  socket.onMessage(() => {});
});
const capture = async (name) => {
  await page.screenshot({ path: new URL(name + '.png', evidence).pathname });
  return name + '.png';
};
const read = () =>
  page.evaluate(() => ({
    panel: window.__ECHO__.game.ui.panel?.type,
    inventory: { ...window.__ECHO__.game.state.inventory },
    ore: window.__ECHO__.game.state.resources.ore,
    focus: document.activeElement?.dataset.do,
  }));
const fixture = async (name = 'settlement') =>
  page.evaluate((name) => {
    window.__ECHO__.preset(name);
    const g = window.__ECHO__.game;
    g.resetSession();
    g.ui.render();
  }, name);
const shop = async () => {
  await fixture();
  await page.evaluate(() => {
    const g = window.__ECHO__.game,
      o = g.scene.objects.find((o) => o.service === 'provisions');
    window.__ECHO__.interact(o.id);
  });
};
const action = async (a) => {
  await page.locator(`[data-do="${a}"]`).focus();
  await page.keyboard.press('Enter');
};
try {
  await page.goto(process.env.ECHO_URL || 'http://127.0.0.1:4321/?test=1');
  await page.waitForFunction(() => window.__ECHO_READY__);
  await shop();
  await action('shop-qty:field_tonic:up');
  await action('shop-qty:field_tonic:up');
  const initial = await read();
  await page.locator('[data-do="buy:field_tonic"]').focus();
  await page.keyboard.down('Enter');
  assert.equal((await read()).panel, 'vendor');
  assert.equal((await read()).ore, initial.ore);
  assert.equal((await read()).focus, 'shop-confirm:field_tonic');
  await page.keyboard.down('Enter');
  await page.waitForTimeout(200);
  assert.equal(
    (await read()).ore,
    initial.ore,
    'Held opening Enter must not transact',
  );
  const tonicCard = page.locator('[data-shop-item="field_tonic"]');
  assert.match(await tonicCard.locator('.shop-quantity').innerText(), /×3/);
  assert.match(
    await tonicCard.locator('.shop-card-controls strong').innerText(),
    /24 ore/,
  );
  assert.equal(await page.locator('.modal.purchase-confirm').count(), 0);
  const cardBeforePurchase = await tonicCard.boundingBox();
  await capture('purchase-inline-confirm');
  await page.keyboard.up('Enter');
  await page.keyboard.press('Escape');
  assert.equal((await read()).panel, 'vendor');
  assert.equal((await read()).focus, 'buy:field_tonic');
  assert.equal((await read()).ore, initial.ore);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  let after = await read();
  assert.equal(after.ore, initial.ore - 24);
  assert.equal(after.inventory.field_tonic, initial.inventory.field_tonic + 3);
  assert.equal(after.focus, 'buy:field_tonic');
  assert.match(
    await page.locator('.ui-toast').innerText(),
    /Bought 3 Field Tonic/,
  );
  assert.deepEqual(await tonicCard.boundingBox(), cardBeforePurchase);
  report.checks.push({
    name: 'Inline purchase fresh Enter, held-key prevention, per-card quantity/cost, Escape focus restoration and stable toast layout',
    pass: true,
  });
  await page.keyboard.down(' ');
  assert.equal((await read()).panel, 'vendor');
  assert.equal((await read()).focus, 'shop-confirm:field_tonic');
  await page.keyboard.down(' ');
  assert.equal((await read()).ore, after.ore);
  await page.keyboard.up(' ');
  await page.keyboard.press(' ');
  assert.equal((await read()).ore, after.ore - 24);
  report.checks.push({
    name: 'Purchase fresh Space and held-Space prevention',
    pass: true,
  });
  await page.locator('[data-do="buy:field_tonic"]').click();
  await page.locator('[data-do="shop-cancel:field_tonic"]').click();
  assert.equal((await read()).focus, 'buy:field_tonic');
  await page.evaluate(
    () => (window.__ECHO__.game.state.flags.mara_trade_route = true),
  );
  await action('buy:field_tonic');
  assert.match(
    await tonicCard.locator('.shop-card-controls strong').innerText(),
    /21 ore/,
  );
  const discounted = await read();
  await page.keyboard.press('Enter');
  assert.equal((await read()).ore, discounted.ore - 21);
  await action('buy:field_tonic');
  const inventory = (await read()).inventory;
  await page.evaluate(() => (window.__ECHO__.game.state.resources.ore = 0));
  await page.keyboard.press('Enter');
  assert.deepEqual((await read()).inventory, inventory);
  assert.match(
    await page.locator('.ui-toast').innerText(),
    /This trade is no longer available/,
  );
  assert.equal(
    await page.locator('[data-do="buy:field_tonic"]').isDisabled(),
    true,
  );
  await page.evaluate(() => {
    const g = window.__ECHO__.game;
    g.state.resources.ore = 100;
    g.ui.render();
  });
  await action('buy:field_tonic');
  await page.evaluate(
    () => (window.__ECHO__.game.state.flags.mara_trade_route = false),
  );
  await page.keyboard.press('Enter');
  assert.equal((await read()).ore, 100);
  assert.match(
    await page.locator('.ui-toast').innerText(),
    /Price changed\. Review the new total\./,
  );
  report.checks.push({
    name: 'Mouse cancel, discounted exact total, funds and price revalidated at confirmation',
    pass: true,
  });
  await fixture('party');
  await page.evaluate(() => {
    const g = window.__ECHO__.game;
    Object.assign(g.state.flags, {
      mara_started: true,
      smith_calibration_started: true,
      vex_arc_started: true,
      rune_arc_started: true,
    });
    Object.assign(g.state.visited, {
      forest_veil: true,
      crater_ember: true,
      orbital_reach: true,
    });
    g.ui.toggleMenu();
  });
  for (const width of [1920, 1024]) {
    await page.setViewportSize({ width, height: Math.round((width * 9) / 16) });
    for (let tab = 1; tab <= 7; tab++) {
      await page.keyboard.press(String(tab));
      const metrics = await page.locator('.expedition').evaluate((el) => ({
        width: el.clientWidth,
        overflow: el.scrollWidth > el.clientWidth + 2,
        bodyOverflow:
          el.querySelector('.atlas-body').scrollWidth >
          el.querySelector('.atlas-body').clientWidth + 2,
        font: getComputedStyle(el).fontFamily,
      }));
      assert.ok(
        !metrics.overflow && !metrics.bodyOverflow,
        JSON.stringify({ tab, width, metrics }),
      );
      if (
        (width === 1920 && [3, 5, 7].includes(tab)) ||
        (width === 1024 && tab === 5)
      )
        await capture(`${width}-tab-${tab}`);
    }
  }
  await page.keyboard.press('5');
  const quests = await page.evaluate(async () => {
    const { questList } = await import('/src/narrative.js');
    return questList(window.__ECHO__.game.state).map((q) => ({
      id: q.id,
      rewards: q.rewardItems,
    }));
  });
  for (const q of quests) {
    const row = page.locator(`[data-quest="${q.id}"]`);
    assert.equal(
      await row.locator('.exp-quest-reward').count(),
      q.rewards.length,
    );
    for (const r of q.rewards)
      assert.equal(await row.locator(`[data-icon="${r.id}"]`).count(), 1);
  }
  assert.equal(await page.locator('.expedition .quest>div>small').count(), 0);
  report.checks.push({
    name: 'All seven compact pages at1920/1024 without overflow; actual quest reward IDs/counts',
    pass: true,
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await fixture('world');
  await page.evaluate(() => {
    const g = window.__ECHO__.game;
    g.ui.rewards([
      {
        id: 'vex',
        kind: 'recruitment',
        label: 'Vex joined the party',
        amount: 1,
      },
      { id: 'kaida', label: 'Kaida · Level 13', amount: 3 },
      { id: 'food', label: 'Food', amount: 12 },
    ]);
  });
  await page.waitForTimeout(150);
  await capture('crew-level-loot');
  assert.equal(
    await page
      .locator('[data-kind="recruitment"] [data-portrait="vex"]')
      .count(),
    1,
  );
  assert.match(
    await page.locator('[data-kind="recruitment"]').innerText(),
    /Vex joined the party\s*CREW/,
  );
  assert.match(
    await page.locator('[data-kind="level-up"]').innerText(),
    /LEVEL UP/,
  );
  assert.doesNotMatch(
    await page.locator('[data-kind="level-up"]').innerText(),
    /×|RECOVERED/,
  );
  await page.waitForTimeout(2380);
  assert.equal(
    await page.locator('[data-kind="loot"],[data-kind="level-up"]').count(),
    0,
  );
  assert.equal(await page.locator('[data-kind="recruitment"]').count(), 1);
  await page.waitForTimeout(750);
  assert.equal(await page.locator('.reward').count(), 0);
  report.checks.push({
    name: 'Hero portraits/categories; loot unchanged2360ms, recruitment3140ms',
    pass: true,
  });
  await fixture('world');
  await page.evaluate(() => {
    const g = window.__ECHO__.game,
      o = g.scene.objects.find((o) => o.id === 'hav_waystone');
    Object.assign(g.state, g.safePoint(g.scene, o.x, o.y + 34));
    g.near = o;
    g.updateCamera(true);
    g.ui.updateHUD();
    g.encounterCooldown = 999;
  });
  const changed = await page.evaluate(() => {
    const g = window.__ECHO__.game,
      first = g.near,
      other = g.scene.objects.find((o) => o.id === 'hav_camp');
    g.near = other;
    g.ui.positionInteraction();
    const immediate =
      document.querySelector('.interaction')?.dataset.object === other.id;
    g.near = first;
    g.ui.positionInteraction();
    return immediate;
  });
  assert.ok(changed, 'New target is shown without waiting160ms for HUD redraw');
  await page.keyboard.down('d');
  const drift = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [];
        let frames = 0;
        function sample() {
          const g = window.__ECHO__.game,
            p = document.querySelector('.interaction'),
            o = g.near;
          if (p && o && p.dataset.object === o.id) {
            const box = document.querySelector('#hud').getBoundingClientRect(),
              r = p.getBoundingClientRect(),
              x = ((o.x - Math.round(g.camera.x)) * box.width) / 960;
            const expected = Math.round(x - r.width / 2);
            samples.push({
              dx: Math.abs(r.left - box.left - expected),
              transition: getComputedStyle(p).transitionProperty,
            });
          }
          if (++frames < 30) requestAnimationFrame(sample);
          else resolve(samples);
        }
        requestAnimationFrame(sample);
      }),
  );
  await page.keyboard.up('d');
  assert.ok(drift.length > 2);
  assert.ok(
    drift.every((v) => v.dx <= 1 && v.transition === 'none'),
    JSON.stringify(drift),
  );
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.interaction').count(), 0);
  report.checks.push({
    name: 'Prompt immediately synchronizes targets and stays world-fixed during actual movement; hides after leaving range',
    pass: true,
    samples: drift.length,
    maxError: Math.max(...drift.map((s) => s.dx)),
  });
  await page.evaluate(() => document.fonts.ready);
  assert.ok(
    await page.evaluate(
      () =>
        document.fonts.check('16px Barlow') &&
        document.fonts.check('16px "EB Garamond"'),
    ),
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.badAssets, []);
  report.result = 'pass';
} catch (e) {
  report.result = 'fail';
  report.failure = e.stack || String(e);
  await capture('failure');
  process.exitCode = 1;
} finally {
  await browser.close();
  report.browserClosed = true;
  await fs.writeFile(
    new URL('report.json', evidence),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
