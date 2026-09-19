import { reviewRoot } from '../scripts/review-output.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const earned = JSON.parse(
  await fs.readFile(reviewRoot + 'earned-campaign-saves.json', 'utf8'),
).saves['chapter-haventide'].state;
const report = {
  method:
    'Earned Haventide interior state loaded through persistence; actual atlas/settings/save/restart controls. A separate saved-position fixture deliberately places the crew inside a solid counter to verify recovery after layout changes. Checks the rendered map marker and saved restrained-motion presentation.',
  checks: [],
  errors: [],
};
const browser = await chromium.launch({ headless: true, channel: 'chrome' }),
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => report.errors.push(String(e)));
await page.routeWebSocket('**/*', (s) => {
  s.send(JSON.stringify({ type: 'connected' }));
  s.onMessage(() => {});
});
const click = async (id) => page.locator('[data-do="' + id + '"]').click();
try {
  await page.goto('http://127.0.0.1:4321/?test=1');
  await page.waitForFunction(() => window.__ECHO_READY__);
  await page.evaluate(async (state) => {
    const { saveState } = await import('/src/persistence.js');
    saveState(state, 1);
    window.__ECHO__.game.load(1);
  }, earned);
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  const marker = await page.evaluate(() => {
    const c = document.querySelector('#atlas-map'),
      p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let count = 0;
    for (let n = 0; n < p.length; n += 4)
      if (p[n] === 234 && p[n + 1] === 179 && p[n + 2] === 180) count++;
    return { count, scene: window.__ECHO__.game.state.region };
  });
  assert.equal(marker.scene, 'haventide_town');
  assert.ok(
    marker.count >= 9,
    'The interior crew must remain visible on the regional map',
  );
  report.checks.push({
    name: 'An interior map keeps the crew marker at its exterior entrance',
    ...marker,
  });
  await page.screenshot({ path: reviewRoot + 'map-interior-marker.png' });
  await page.keyboard.press('7');
  await click('setting:reducedMotion');
  assert.equal(
    await page
      .locator('#game')
      .evaluate((e) => e.classList.contains('reduced')),
    true,
  );
  await page.keyboard.press('6');
  await click('save:1');
  await page.keyboard.press('7');
  await click('setting:reducedMotion');
  assert.equal(
    await page
      .locator('#game')
      .evaluate((e) => e.classList.contains('reduced')),
    false,
  );
  await page.keyboard.press('6');
  await click('load:1');
  await click('confirm-yes');
  assert.equal(
    await page
      .locator('#game')
      .evaluate((e) => e.classList.contains('reduced')),
    true,
  );
  report.checks.push({
    name: 'Loading restores the actual restrained-motion CSS presentation',
    pass: true,
  });
  const recovery = await page.evaluate(async (source) => {
    const { saveState } = await import('/src/persistence.js');
    const { getScene, isWalkable } = await import('/src/world.js');
    const s = structuredClone(source),
      scene = getScene(s.region),
      o = scene.objects.find((o) => o.solid && o.w);
    s.x = o.x;
    s.y = o.y - (o.h || 18) / 2;
    const blocked = !isWalkable(scene, s.x, s.y);
    saveState(s, 2);
    window.__ECHO__.game.load(2);
    const loaded = window.__ECHO__.game.state;
    return {
      blocked,
      recovered: isWalkable(scene, loaded.x, loaded.y),
      distance: Math.hypot(loaded.x - s.x, loaded.y - s.y),
      sameCrew: JSON.stringify(loaded.heroes) === JSON.stringify(s.heroes),
      sameFlags: JSON.stringify(loaded.flags) === JSON.stringify(s.flags),
    };
  }, earned);
  assert.equal(recovery.blocked, true);
  assert.equal(recovery.recovered, true);
  assert.equal(recovery.sameCrew, true);
  assert.equal(recovery.sameFlags, true);
  report.checks.push({
    name: 'A saved position inside revised scenery recovers nearby without altering the campaign',
    ...recovery,
  });
  await page.keyboard.press('Escape');
  await page.keyboard.press('6');
  await click('restart');
  await click('confirm-yes');
  assert.equal(
    await page
      .locator('#game')
      .evaluate((e) => e.classList.contains('reduced')),
    false,
  );
  report.checks.push({
    name: 'New Expedition resets presentation to its own settings',
    pass: true,
  });
  assert.deepEqual(report.errors, []);
  report.result = 'pass';
} catch (e) {
  report.result = 'fail';
  report.failure = String(e);
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    reviewRoot + 'presentation-browser.json',
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  console.log(JSON.stringify(report));
}
