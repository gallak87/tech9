import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Hidden, accelerated real-physics trial flow. Test-only instrumentation is
// supplied by the browser route; production exposes no completion shortcuts.
const base = process.env.VN_URL;
const level = process.env.VN_TRIAL_LEVEL ?? 'halcyon';
const sprint = level === 'shatterline';
if (!base) throw Error('Set VN_URL to the current dev server');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const [width, height] = (process.env.VN_TRIAL_VIEWPORT ?? '1440x900')
  .split('x')
  .map(Number);
const touch = width < 900;
const context = await browser.newContext({
  viewport: { width, height },
  hasTouch: touch,
});
try {
  await context.addInitScript(() =>
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }),
    ),
  );
  await context.route('**/src/core/game.js*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    assert.ok(source.includes('      getSnapshot() {'));
    await route.fulfill({
      response,
      body: source.replace(
        '      getSnapshot() {',
        `
      verifyTrialStep(ticks, idle = false) {
        cancelCountdown();
        mode = 'racing';
        for (let i = 0; i < ticks && !trial?.result; i++) {
          advanceTick(idle ? { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false } : racerModule.getRacerControl(state, track, { runtime, difficulty: 'easy' }));
        }
        if (!trial?.result) pause();
        return this.getSnapshot();
      },
      getSnapshot() {`,
      ),
    });
  });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (e) => faults.push(e.message));
  await page.goto(base + `?level=${level}&music=0`);
  await page
    .locator('[data-action="time-trial"]')
    .first()
    [touch ? 'tap' : 'click']();
  await page.locator('[data-action="launch"]')[touch ? 'tap' : 'click']();
  await page.waitForFunction(() => window.__VN?.ready, null, {
    timeout: 120000,
  });
  let snap = await page.evaluate(() => {
    window.__VN.restartRace();
    window.__VN.pause();
    return window.__VN.getSnapshot();
  });
  assert.equal(snap.timeTrial.best, null);
  assert.equal(snap.competition.enabled, false);
  assert.equal(snap.vehicle.energy, 100);
  assert.equal(snap.vehicle.distance, 0);
  for (let batch = 0; batch < 35 && !snap.timeTrial.result; batch++) {
    snap = await page.evaluate(() => window.__VN.verifyTrialStep(1200));
  }
  assert.ok(
    snap.timeTrial.result?.playerValid,
    JSON.stringify({ race: snap.race, vehicle: snap.vehicle }),
  );
  assert.equal(snap.timeTrial.result.laps, sprint ? 1 : 3);
  assert.equal(snap.timeTrial.result.saved.ghostSaved, true);
  assert.ok(!snap.events.some((e) => e.type === 'pickup-activate'));
  await page.getByRole('heading', { name: 'First personal best.' }).waitFor();
  assert.equal(await page.locator('.trial-splits li').count(), sprint ? 3 : 9);
  const first = snap.timeTrial.result.playerTotalTime;
  await page.locator('[data-action="records"]').click();
  assert.equal(await page.locator('.records-list li').count(), 1);
  assert.match(
    await page.locator('.records-list').textContent(),
    /Personal ghost saved/,
  );
  await page.locator('[data-record-key]').focus();
  await page.keyboard.press('KeyS');
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .locator('[data-record-key]')
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator('[data-record-filter="ship"]').selectOption('needle');
  assert.equal(await page.locator('.records-list li').count(), 0);
  await page.locator('[data-record-filter="ship"]').selectOption('all');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
    'results',
  );

  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  if (touch) await page.locator('[data-action="retry-race"]').tap();
  else await page.keyboard.press('r');
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen === 'race',
  );
  snap = await page.evaluate(() => {
    window.__VN.pause();
    return window.__VN.getSnapshot();
  });
  assert.equal(snap.timeTrial.best, first);
  assert.equal(snap.timeTrial.ghost, true);
  assert.equal(snap.timeTrial.elapsed, 0);
  for (let batch = 0; batch < 35 && !snap.timeTrial.result; batch++)
    snap = await page.evaluate(() => window.__VN.verifyTrialStep(1200));
  assert.ok(
    Math.abs(snap.timeTrial.result.playerTotalTime - first) < 1e-8,
    'identical input produces identical total',
  );
  assert.equal(snap.timeTrial.result.improved, false);
  await page.locator('[data-action="change"]').click();
  if (!(await page.locator('[data-action="practice"]').count()))
    await page.locator('[data-action="home"]').first().click();
  await page.locator('[data-action="practice"]').first().click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () => window.__VN?.getSnapshot().timeTrial === null,
  );
  await page.evaluate(() => window.__VN.pause());
  assert.equal(
    await page.locator('.timing > span').textContent(),
    sprint ? 'ELAPSED' : 'LAP TIME',
  );
  await page.reload();
  await page.locator('[data-action="time-trial"]').first().click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(() => window.__VN?.ready, null, {
    timeout: 120000,
  });
  snap = await page.evaluate(() => {
    window.__VN.pause();
    return window.__VN.getSnapshot();
  });
  assert.equal(snap.timeTrial.best, first);
  assert.equal(snap.timeTrial.ghost, true);
  // Simulate a persisted time-only quota fallback, then verify the next
  // slower completed run never promises a ghost that is absent after reload.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage).filter((key) =>
      key.startsWith('vector-nova.trial.'),
    )) {
      const record = JSON.parse(localStorage.getItem(key));
      record.ghost = null;
      localStorage.setItem(key, JSON.stringify(record));
    }
  });
  await page.reload();
  await page.locator('[data-action="time-trial"]').first().click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(() => window.__VN?.ready, null, {
    timeout: 120000,
  });
  snap = await page.evaluate(() => {
    window.__VN.restartRace();
    return window.__VN.verifyTrialStep(120, true);
  });
  assert.equal(snap.timeTrial.ghost, false);
  assert.equal(snap.timeTrial.best, first);
  assert.equal(
    await page.locator('#last').textContent(),
    'BEST TIME · NO GHOST',
  );
  for (let batch = 0; batch < 35 && !snap.timeTrial.result; batch++)
    snap = await page.evaluate(() => window.__VN.verifyTrialStep(1200));
  assert.equal(snap.timeTrial.result.improved, false);
  assert.equal(
    snap.timeTrial.result.playerValid,
    true,
    JSON.stringify(snap.timeTrial.result),
  );
  assert.equal(snap.timeTrial.result.ghostAvailable, false);
  assert.equal(
    await page.locator('.results-note').textContent(),
    'Personal best unchanged. No compatible ghost is saved for this best.',
  );
  if (touch) {
    await page.locator('[data-action="retry-race"]').tap();
    await page.waitForFunction(
      () => window.__VN.getSnapshot().mode === 'racing',
    );
    const pad = page.locator('[data-touch-control="power"]');
    assert.equal(await pad.isVisible(), true);
    const b = await pad.boundingBox();
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height * 0.12 }],
    });
    await page.waitForFunction(
      () => window.__VN.getSnapshot().vehicle.speed > 5,
    );
    assert.equal(await pad.getAttribute('data-power'), 'boost');
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.equal(await pad.getAttribute('data-active'), 'false');
    await page.evaluate(() => window.__VN.pause());
    await page.locator('#restart').tap();
    snap = await page.evaluate(() => window.__VN.getSnapshot());
    assert.equal(snap.timeTrial.elapsed, 0);
    assert.equal(snap.vehicle.energy, 100);
    await session.detach();
  }
  assert.deepEqual(faults, []);
  console.log(
    `PASS Time Trial ${level}: real-physics finish (${first.toFixed(3)} s), deterministic retry, ghost, records after reload, practice transition`,
  );
} finally {
  await context.close();
  await browser.close();
}
