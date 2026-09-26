import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
const out = path.join(root, '.artifacts/verification');
await mkdir(out, { recursive: true });
const h = await openScene({ mode: 'preview' }),
  { page, snapshot } = h;
const report = { environment: h.environment, checks: [], errors: h.errors };
async function check(name, fn) {
  try {
    const detail = await fn();
    report.checks.push({ name, pass: true, detail });
    console.log('PASS', name);
  } catch (e) {
    report.checks.push({ name, pass: false, error: e.message });
    console.error('FAIL', name, e.message);
    await page.screenshot({
      path: path.join(out, name.replaceAll(' ', '-') + '.png'),
    });
  }
}
try {
  await check('garage and vehicle previews', async () => {
    assert.equal((await snapshot()).state, 'garage');
    for (const id of ['jeep', 'atv', 'bike']) {
      await page.locator(`[data-action="vehicle"][data-value="${id}"]`).click();
      assert.equal((await snapshot()).vehicle, id);
      await page.screenshot({ path: path.join(out, id + '-garage.png') });
    }
    await page.locator('[data-action="vehicle"][data-value="jeep"]').click();
  });
  await check('keyboard acceleration turning braking and camera', async () => {
    await page.locator('[data-action="free"]').click();
    const a = (await snapshot()).motion;
    await page.keyboard.down('w');
    await page.waitForTimeout(1800);
    await page.keyboard.up('w');
    const b = (await snapshot()).motion;
    assert.ok(b.speed > 5);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 4);
    await page.keyboard.down('d');
    await page.waitForTimeout(500);
    await page.keyboard.up('d');
    assert.ok((await snapshot()).motion.heading > b.heading + 0.03);
    await page.keyboard.down('Space');
    await page.waitForTimeout(1300);
    await page.keyboard.up('Space');
    assert.ok(Math.abs((await snapshot()).motion.speed) < 1);
    await page.keyboard.press('c');
    assert.equal((await snapshot()).cameraMode, 'mounted');
    await page.screenshot({ path: path.join(out, 'jeep-driver.png') });
    await page.keyboard.press('c');
    assert.equal((await snapshot()).cameraMode, 'follow');
  });
  await check('pause and focus loss clear held input', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    let s = await snapshot();
    assert.equal(s.state, 'paused');
    assert.equal(s.input.throttle, 0);
    const p = s.motion;
    await page.waitForTimeout(350);
    s = await snapshot();
    assert.equal(s.motion.x, p.x);
    assert.equal(s.motion.z, p.z);
    await page.keyboard.up('w');
    await page.locator('[data-action="resume"]').click();
    assert.equal((await snapshot()).input.throttle, 0);
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal((await snapshot()).state, 'paused');
    assert.equal((await snapshot()).input.throttle, 0);
    await page.keyboard.up('w');
    await page.locator('[data-action="garage"]').last().click();
  });
  await check(
    'recovery penalty preserves route progress and restart clears it',
    async () => {
      await page.locator('[data-action="start"]').click();
      await page.keyboard.down('w');
      await page.waitForTimeout(2200);
      await page.keyboard.up('w');
      const a = await snapshot();
      assert.ok(a.trial.nextGate >= 1);
      await page.keyboard.press('r');
      const b = await snapshot();
      assert.equal(b.trial.nextGate, a.trial.nextGate);
      assert.equal(b.trial.penalties, 5);
      assert.equal(b.motion.speed, 0);
      assert.equal(b.input.throttle, 0);
      assert.equal(b.motion.airborne, false);
      await page.keyboard.press('t');
      const c = await snapshot();
      assert.equal(c.trial.nextGate, 0);
      assert.equal(c.trial.penalties, 0);
      assert.ok(c.trial.elapsed < 0.2);
    },
  );
  await check(
    'missed reverse and out of order gates never award progress',
    async () => {
      const route = (
        await page.evaluate(() => window.__SCENE_TEST__.routes())
      )[0];
      for (const setup of [
        { gate: route.gates[2], reverse: false, offset: 0 },
        { gate: route.gates[0], reverse: true, offset: 0 },
        { gate: route.gates[0], reverse: false, offset: 12 },
      ]) {
        const { gate, reverse, offset } = setup;
        const h = gate.heading + (reverse ? Math.PI : 0);
        await page.evaluate((p) => window.__SCENE_TEST__.arrange(p), {
          x: gate.x - Math.sin(h) * 3 + Math.cos(h) * offset,
          z: gate.z + Math.cos(h) * 3 + Math.sin(h) * offset,
          heading: h,
        });
        await page.keyboard.down('w');
        await page.waitForTimeout(1400);
        await page.keyboard.up('w');
        assert.equal((await snapshot()).trial.nextGate, 0);
      }
      await page.keyboard.press('t');
    },
  );
  await check('all vehicles driver views and resource lifecycle', async () => {
    await page.keyboard.press('Escape');
    await page.locator('[data-action="garage"]').last().click();
    let warmed;
    for (let cycle = 0; cycle < 4; cycle++) {
      for (const id of ['jeep', 'atv', 'bike']) {
        await page
          .locator(`[data-action="vehicle"][data-value="${id}"]`)
          .click();
        await page.locator('[data-action="free"]').click();
        await page.keyboard.press('c');
        await page.waitForTimeout(150);
        const s = await snapshot();
        assert.ok(s.camera.position.every(Number.isFinite));
        if (cycle === 0)
          await page.screenshot({ path: path.join(out, id + '-driver.png') });
        await page.keyboard.press('Escape');
        await page.locator('[data-action="garage"]').last().click();
      }
      if (cycle === 1) warmed = (await snapshot()).renderer.memory;
    }
    const after = (await snapshot()).renderer.memory;
    assert.ok(after.geometries <= warmed.geometries + 2);
    assert.ok(after.textures <= warmed.textures + 1);
    return { warmed, after };
  });
  await check('responsive menus and graphics audio controls', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(out, 'narrow-garage.png') });
    await page.locator('[data-action="settings"]').click();
    await page.locator('[data-setting="quality"]').selectOption('high');
    assert.equal((await snapshot()).settings.quality, 'high');
    await page.locator('[data-setting="quality"]').selectOption('balanced');
    await page.locator('[data-action="mute"]').click();
    await page.locator('[data-action="garage"]').last().click();
    assert.ok(await page.locator('[data-action="start"]').isVisible());
    await page.setViewportSize({ width: 1600, height: 1000 });
  });
  await check('balanced observed frame performance', async () => {
    report.performance = await samplePerformance(page, 5000);
    return report.performance;
  });
  await check('no browser asset or WebGL errors', async () => {
    for (const errors of Object.values(h.errors)) assert.deepEqual(errors, []);
  });
  await check('production has no test hooks', async () => {
    const url = new URL(page.url());
    url.search = '';
    await page.goto(url.href);
    await page.waitForSelector('#loading.loaded', { state: 'attached' });
    assert.equal(
      await page.evaluate(() => Object.hasOwn(window, '__SCENE_TEST__')),
      false,
    );
  });
  report.passed = report.checks.every((c) => c.pass);
  if (!report.passed) process.exitCode = 1;
} finally {
  await writeFile(
    path.join(out, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await h.close();
}
