import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.VN_URL ?? 'http://127.0.0.1:5237';
const output = '.experiments/fleet-runtime';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const checks = [];
const ready = (page) =>
  page.waitForFunction(() => window.__VN?.ready, null, { timeout: 60000 });
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
const select = async (page, id, panel = 'title-panel') => {
  await page.locator(`#${panel} [data-ship="${id}"]`).click();
  await page.waitForFunction((id) => {
    const s = window.__VN.getSnapshot();
    return s.ship.id === id && !s.ship.loading;
  }, id);
  assert.equal(
    await page
      .locator(`#${panel} [data-ship="${id}"]`)
      .getAttribute('aria-checked'),
    'true',
  );
};
function monitor(page) {
  page.on('pageerror', (error) => errors.push(error.message));
}
try {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
  });
  const page = await context.newPage();
  monitor(page);
  await page.goto(base);
  await ready(page);
  const circuits = await page
    .locator('#circuit-select option')
    .evaluateAll((options) => options.map((option) => option.value));
  for (const quality of ['high', 'low']) {
    await context.addInitScript((quality) => {
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({
          quality,
          volume: 0,
          reducedMotion: quality === 'low',
        }),
      );
    }, quality);
    for (const level of circuits) {
      await page.goto(`${base}/?level=${level}`);
      await ready(page);
      for (const id of ['kestrel', 'shrike', 'bastion', 'needle']) {
        await select(page, id);
        await page.locator('#inspect').click();
        assert.equal(
          await page
            .locator('#inspection-panel [aria-checked="true"]')
            .getAttribute('data-ship'),
          id,
        );
        await page.locator('#inspect-start').click();
        await page.keyboard.down('KeyW');
        await page.waitForFunction(
          () => window.__VN.getSnapshot().vehicle.speed > 23,
        );
        await page.keyboard.down('ShiftLeft');
        await page.waitForFunction(
          () => window.__VN.getSnapshot().vehicle.boosting,
        );
        await page.keyboard.up('ShiftLeft');
        await page.keyboard.up('KeyW');
        await page.waitForFunction(
          () => !window.__VN.getSnapshot().vehicle.boosting,
        );
        await page.keyboard.press('Escape');
        const live = await snapshot(page);
        assert.equal(live.ship.id, id);
        assert.equal(live.vehicle.shipId, id);
        assert.equal(live.handling.steeringAssist, 0.3);
        assert.ok(live.vehicle.speed > 0);
        const replay = await page.evaluate(() => window.__VN.getReplay());
        const played = await page.evaluate(
          (replay) => window.__VN.playReplay(replay),
          replay,
        );
        assert.deepEqual(played.vehicle, live.vehicle);
        await page.locator('#home').click();
        assert.equal((await snapshot(page)).ship.id, id);
        checks.push(
          `${quality}/${level}/${id}: selection, inspect, throttle, boost, replay, paddock`,
        );
      }
    }
  }
  // Switching to another ship must reject a replay recorded with the old one.
  await page.locator('#start').click();
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__VN.getSnapshot().tick > 15);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('Escape');
  const replay = await page.evaluate(() => window.__VN.getReplay());
  await page.locator('#home').click();
  await select(page, 'shrike');
  const rejected = await page.evaluate((replay) => {
    try {
      window.__VN.playReplay(replay);
      return false;
    } catch {
      return true;
    }
  }, replay);
  assert.ok(rejected);
  await page.reload();
  await ready(page);
  assert.equal((await snapshot(page)).ship.id, 'shrike');
  checks.push('ship persists on reload; cross-ship replay rejected');

  // Failed loads leave the currently usable model and controls intact.
  await page.route('**/assets/ships/needle/needle.glb', (route) =>
    route.abort(),
  );
  await page.locator('#title-panel [data-ship="needle"]').click();
  await page.waitForFunction(() => !window.__VN.getSnapshot().ship.loading);
  assert.equal((await snapshot(page)).ship.id, 'shrike');
  assert.equal(await page.locator('#start').isEnabled(), true);
  await page.unroute('**/assets/ships/needle/needle.glb');
  await select(page, 'needle');
  checks.push('failed asset request retains previous ship; retry succeeds');

  // A disabled loading state must return focus to the selected radio.
  await select(page, 'kestrel');
  await page.locator('#title-panel [data-ship="kestrel"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () =>
      window.__VN.getSnapshot().ship.id === 'shrike' &&
      !window.__VN.getSnapshot().ship.loading,
  );
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () =>
      window.__VN.getSnapshot().ship.id === 'bastion' &&
      !window.__VN.getSnapshot().ship.loading,
  );
  checks.push('keyboard arrow selection retains focus across async loads');

  // Desktop visual evidence after behavior has settled.
  await page.goto(`${base}/?level=halcyon`);
  await ready(page);
  await page.screenshot({ path: `${output}/paddock-final.png` });
  const launch = await page.locator('#inspect').boundingBox();
  assert.ok(
    launch.y + launch.height < 920,
    'both desktop launch actions fit above footer',
  );
  await page.locator('#inspect').click();
  for (const id of ['shrike', 'bastion', 'needle']) {
    await select(page, id, 'inspection-panel');
    await page.waitForTimeout(180); // Let the selection color transition finish for the still.
    await page.screenshot({ path: `${output}/inspect-${id}.png` });
  }

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.__VN.home());
  await page.screenshot({ path: `${output}/paddock-720.png` });
  const shortLaunch = await page.locator('#inspect').boundingBox();
  assert.ok(
    shortLaunch.y + shortLaunch.height < 650,
    'launch actions fit on a short desktop',
  );
  checks.push('1280x720 paddock launch actions remain visible');

  // Complete desktop before portrait/short-landscape layout checks.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.__VN.home());
    await select(page, 'bastion');
    await page.locator('#inspect').click();
    await select(page, 'needle', 'inspection-panel');
    await page.screenshot({ path: `${output}/inspect-${viewport.width}.png` });
    assert.equal(
      await page
        .locator('#inspection-panel [aria-checked="true"]')
        .getAttribute('data-ship'),
      'needle',
    );
    await page.locator('#inspect-start').click();
    assert.equal((await snapshot(page)).vehicle.shipId, 'needle');
    checks.push(
      `${viewport.width}x${viewport.height}: picker, inspect, launch`,
    );
  }
  const failedStorage = await browser.newContext({
    viewport: { width: 1000, height: 800 },
  });
  await failedStorage.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('Storage disabled');
    };
    Storage.prototype.setItem = () => {
      throw new Error('Storage disabled');
    };
  });
  const offline = await failedStorage.newPage();
  monitor(offline);
  await offline.goto(base);
  await ready(offline);
  await select(offline, 'needle');
  await offline.locator('#start').click();
  assert.equal((await snapshot(offline)).vehicle.shipId, 'needle');
  checks.push('storage failure keeps ship selection and launch usable');
  assert.deepEqual(errors, []);
  console.log(`${checks.length} fleet runtime cases passed; no page errors.`);
} finally {
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
  await browser.close();
}
