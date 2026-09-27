import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
const out = path.join(root, '.artifacts/handling');
await mkdir(out, { recursive: true });
const h = await openScene({ mode: 'preview' }),
  { page, snapshot } = h;
const report = { environment: h.environment, vehicles: [], errors: h.errors };
const arrange = (pose) =>
  page.evaluate((p) => window.__SCENE_TEST__.arrange(p), pose);
try {
  const world = await page.evaluate(() => window.__SCENE_TEST__.world());
  const obstacle = world.colliders.find(
    (c) =>
      c.kind === 'rock' &&
      c.x > -230 &&
      c.x < 230 &&
      c.z > -220 &&
      c.z < 210 &&
      !world.colliders.some(
        (d) =>
          d !== c &&
          Math.hypot(d.x - c.x, d.z - (c.z + c.radius + 7)) < d.radius + 10,
      ),
  );
  assert.ok(
    obstacle,
    'Isolated substantial rock exists for input collision test',
  );
  for (const vehicle of ['jeep', 'atv', 'bike']) {
    await page
      .locator(`[data-action="vehicle"][data-value="${vehicle}"]`)
      .click();
    await page.locator('[data-action="free"]').click();
    await arrange({
      x: obstacle.x,
      z: obstacle.z + obstacle.radius + 12,
      heading: 0,
    });
    const before = (await snapshot()).motion;
    await page.keyboard.down('w');
    await page.waitForTimeout(4200);
    await page.keyboard.up('w');
    const stopped = (await snapshot()).motion;
    assert.ok(
      stopped.collision || stopped.speed < 1,
      `${vehicle} stops at rock`,
    );
    assert.ok(
      Math.hypot(stopped.x - obstacle.x, stopped.z - obstacle.z) >
        obstacle.radius,
      `${vehicle} cannot penetrate rock`,
    );
    assert.ok(stopped.distance > 2, `${vehicle} drove into obstacle`);
    await page.keyboard.press('r');
    const recovered = (await snapshot()).motion;
    assert.equal(recovered.airborne, false);
    assert.equal(recovered.speed, 0);
    await page.keyboard.down('s');
    await page.waitForTimeout(1100);
    await page.keyboard.up('s');
    assert.ok(
      (await snapshot()).motion.speed < -0.5,
      `${vehicle} reverse maneuver`,
    );
    await page.keyboard.down('Space');
    await page.waitForTimeout(800);
    await page.keyboard.up('Space');
    assert.ok(Math.abs((await snapshot()).motion.speed) < 1);
    await arrange({ x: 260, z: -4, heading: Math.asin(-0.15) });
    await page.keyboard.down('w');
    let airCaptured = false,
      landedCaptured = false;
    let airborne = 0,
      landings = 0,
      rough = false,
      peak = 0;
    const end = Date.now() + 7000;
    while (Date.now() < end) {
      const s = (await snapshot()).motion;
      airborne += Number(s.airborne);
      if (s.airborne && !airCaptured) {
        airCaptured = true;
        await page.screenshot({
          path: path.join(out, vehicle + '-takeoff.png'),
        });
      } else if (!s.airborne && airCaptured && !landedCaptured) {
        landedCaptured = true;
        await page.screenshot({
          path: path.join(out, vehicle + '-landed.png'),
        });
      }
      landings += Number(s.landing > 0);
      rough ||= s.surface.kind === 'rough';
      peak = Math.max(peak, s.speed);
      await page.waitForTimeout(30);
    }
    await page.keyboard.up('w');
    assert.ok(airborne > 0, `${vehicle} has a terrain-driven jump`);
    assert.ok(!(await snapshot()).motion.airborne, `${vehicle} lands grounded`);
    await page.screenshot({ path: path.join(out, vehicle + '-ridge.png') });
    await page.keyboard.press('Escape');
    await page.locator('[data-action="garage"]').last().click();
    report.vehicles.push({
      vehicle,
      obstacle: obstacle.id,
      approachSurface: before.surface.kind,
      collision: stopped.collision,
      recovery: true,
      reverse: true,
      airborneSamples: airborne,
      landingSamples: landings,
      rough,
      peakSpeed: peak,
    });
    console.log('PASS handling', vehicle);
  }
  await page.locator('[data-action="free"]').click();
  await page.keyboard.down('w');
  report.performance = await samplePerformance(page, 5000);
  await page.keyboard.up('w');
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(600);
  const hidden = await snapshot();
  assert.equal(hidden.state, 'paused');
  assert.ok(
    hidden.audio.engine < 0.002,
    `Paused audio gain ${hidden.audio.engine}`,
  );
  report.hiddenAudio = hidden.audio;
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.up('w');
  await page.locator('[data-action="garage"]').last().click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="free"]').click();
  await page.screenshot({ path: path.join(out, 'narrow-hud.png') });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(out, 'narrow-pause.png') });
  const denied = await h.browser.newContext();
  await denied.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
  });
  const blockedPage = await denied.newPage();
  await blockedPage.goto(page.url());
  await blockedPage.waitForFunction(
    () => window.__SCENE_TEST__?.ready === true,
  );
  assert.equal(
    await blockedPage.evaluate(() => window.__SCENE_TEST__.snapshot().state),
    'garage',
  );
  await denied.close();
  report.deniedStorageBoot = true;
  for (const errors of Object.values(h.errors)) assert.deepEqual(errors, []);
  report.passed = true;
} finally {
  await writeFile(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await h.close();
}
