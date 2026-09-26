import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root, samplePerformance } from './lib/browser.mjs';
const output = path.join(root, '.artifacts/weather-verification');
await mkdir(output, { recursive: true });
const h = await openScene({ mode: 'preview' });
const { page, snapshot } = h;
const report = { environment: h.environment, checks: [] };
const wait = async (milliseconds = 350) => page.waitForTimeout(milliseconds);
async function check(name, action) {
  try {
    const detail = await action();
    report.checks.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, pass: false, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
    await page.screenshot({
      path: path.join(output, `${name.replace(/\W+/g, '-')}.png`),
    });
  }
}
async function range(key, position) {
  const control = page.locator(`[data-weather="${key}"]`);
  await control.focus();
  await page.keyboard.press(position === 'max' ? 'End' : 'Home');
}
try {
  await page.locator('[data-setting="quality"]').selectOption('balanced');
  await page.locator('#close-panel').click();
  await check(
    'all presets change actual controls and rendered state',
    async () => {
      for (const name of ['drizzle', 'rain', 'winter', 'snowfall', 'clear']) {
        await page.locator(`[data-preset="${name}"]`).click();
        await wait(300);
        assert.equal((await snapshot()).weather.preset, name);
      }
      await page.locator('[data-preset="rain"]').click();
      await wait(4200);
      const s = await snapshot();
      assert.ok(s.weather.rain > 0.9);
      assert.ok(s.weather.wetness > 0.4);
      assert.ok(s.weather.particles.rain > 3000);
      return s.weather;
    },
  );
  await page.locator('#weather-details summary').click();
  await check(
    'stopped rain leaves wet surfaces that dry gradually',
    async () => {
      await range('rain', 'min');
      await wait(6500);
      const before = (await snapshot()).weather;
      assert.ok(before.rain < 0.003);
      assert.ok(before.wetness > 0.3);
      await wait(1500);
      const after = (await snapshot()).weather;
      assert.ok(after.wetness < before.wetness);
      return { before: before.wetness, after: after.wetness };
    },
  );
  await check(
    'settled snow without falling snow and rain on snowy surfaces',
    async () => {
      await range('snow', 'max');
      await range('snowfall', 'min');
      await wait(4800);
      let s = (await snapshot()).weather;
      assert.ok(s.snow > 0.98);
      assert.equal(s.particles.snow, 0);
      await range('rain', 'max');
      await wait(1200);
      s = (await snapshot()).weather;
      assert.ok(s.rain > 0.65 && s.snow > 0.98);
      return s;
    },
  );
  await check(
    'windy clear weather and shared wind during precipitation',
    async () => {
      await page.locator('[data-preset="clear"]').click();
      await range('wind', 'max');
      await range('windDirection', 'min');
      await wait(5000);
      const clear = (await snapshot()).weather;
      assert.ok(clear.wind > 0.99);
      assert.ok(clear.windX > 3);
      assert.ok(Math.abs(clear.windZ) < 0.1);
      await range('snowfall', 'max');
      await wait(800);
      const snow = (await snapshot()).weather;
      assert.ok(snow.snowfall > 0.4);
      assert.ok(snow.windX > 3);
      return { clear, snow };
    },
  );
  await check(
    'surface wetness and cloud controls accept keyboard input',
    async () => {
      await range('wetness', 'max');
      await range('cloud', 'max');
      await wait(1000);
      const s = (await snapshot()).weather;
      assert.ok(s.wetness > 0.97);
      assert.equal(s.target.cloud, 1);
      return s.target;
    },
  );
  await check(
    'weather pause freezes motion and resume advances it',
    async () => {
      await page.locator('#weather-pause').click();
      await wait(100);
      const before = (await snapshot()).weather.time;
      await wait(500);
      assert.equal((await snapshot()).weather.time, before);
      await page.locator('#weather-pause').click();
      await wait(150);
      assert.ok((await snapshot()).weather.time > before);
    },
  );
  await check('sound unlock and mute use actual UI', async () => {
    await page.locator('#weather-sound').click();
    await wait();
    const unmuted = (await snapshot()).weather;
    assert.equal(unmuted.muted, false);
    assert.equal(unmuted.audio.state, 'running');
    await page.locator('#weather-sound').click();
    await wait();
    assert.equal((await snapshot()).weather.muted, true);
  });
  await check(
    'exposed and sheltered viewpoints report different cover',
    async () => {
      await page.locator('[data-weather-view="weatherShelter"]').click();
      await wait();
      assert.equal(
        await page.locator('#weather-exposure').textContent(),
        'Under canopy',
      );
      await page.locator('[data-weather-view="trail"]').click();
      await wait();
      assert.equal(
        await page.locator('#weather-exposure').textContent(),
        'Open sky',
      );
    },
  );
  await check('real flight and camera jumps keep effects bounded', async () => {
    await page.locator('canvas').click({ position: { x: 800, y: 600 } });
    const before = (await snapshot()).camera.position;
    await page.keyboard.down('w');
    await wait(700);
    await page.keyboard.up('w');
    const after = (await snapshot()).camera.position;
    assert.ok(Math.hypot(...after.map((v, i) => v - before[i])) > 1);
    await page.evaluate(() => window.__SCENE_TEST__.setView('boundary'));
    await wait();
    const s = (await snapshot()).weather;
    assert.ok(
      s.particles.rain <= 7200 &&
        s.particles.snow <= 1800 &&
        s.impacts.splashes <= 160 &&
        s.impacts.puddles <= 52,
    );
    return { before, after };
  });
  await check(
    'focus loss freezes weather without a catch-up jump',
    async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await wait(100);
      const before = (await snapshot()).weather.time;
      await wait(500);
      assert.equal((await snapshot()).weather.time, before);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await wait(200);
      const after = (await snapshot()).weather.time;
      assert.ok(after > before && after - before < 0.5);
      return { before, after };
    },
  );
  await check(
    'reset restores dry clear state and repeated lifecycle stays bounded',
    async () => {
      await page.locator('#weather-reset').click();
      await wait(5000);
      let s = (await snapshot()).weather;
      assert.ok(s.snow < 0.01 && s.rain < 0.01 && s.wetness === 0);
      assert.equal(s.target.wind, 0.18);
      await page.locator('[data-preset="rain"]').click();
      await wait(1200);
      await page.locator('[data-preset="snowfall"]').click();
      await wait(800);
      const memory = (await snapshot()).renderer.memory;
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.__SCENE_TEST__.cycleWeather());
        await page.locator('[data-preset="rain"]').click();
        await wait(150);
        await page.locator('[data-preset="snowfall"]').click();
        await wait(150);
      }
      const after = (await snapshot()).renderer.memory;
      assert.ok(
        after.geometries <= memory.geometries + 1,
        JSON.stringify({ memory, after }),
      );
      assert.ok(after.textures <= memory.textures + 1);
      assert.ok(after.programs <= memory.programs + 1);
      return { memory, after };
    },
  );
  await check('Balanced frame sample at 1600 by 1000', async () => {
    await page.locator('[data-weather-view="trail"]').click();
    await wait(1000);
    return samplePerformance(page, 3500);
  });
  await check('weather renders without browser or GPU errors', async () => {
    assert.deepEqual(h.errors, {
      console: [],
      page: [],
      requests: [],
      webgl: [],
    });
  });
} finally {
  await h.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
if (report.checks.some((c) => !c.pass)) process.exitCode = 1;
