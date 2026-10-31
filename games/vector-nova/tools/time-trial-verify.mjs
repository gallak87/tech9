import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { formatTime } from '../src/race/timing.js';
import { careerKey, seedVerificationCareer } from './verification-career.mjs';

// Browser-only instrumentation accelerates real physics. Production has no
// finish shortcuts; both the runtime and rendered ghost are exercised here.
const base = process.env.VN_URL;
const level = process.env.VN_TRIAL_LEVEL ?? 'halcyon';
const sprint = level === 'shatterline';
if (!base) throw Error('Set VN_URL to the current dev server');
const browser = await chromium.launch({
  args: ['--mute-audio'],
  headless: true,
  channel: 'chrome',
});
const [width, height] = (process.env.VN_TRIAL_VIEWPORT ?? '1440x900')
  .split('x')
  .map(Number);
const touch = width < 900;
const context = await browser.newContext({
  viewport: { width, height },
  hasTouch: touch,
});
try {
  await seedVerificationCareer(context);
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
      verifyTrialStep(ticks, idle = false, untilLap = Infinity) {
        cancelCountdown();
        mode = 'racing';
        for (let i = 0; i < ticks && !trial?.result && race.lap < untilLap; i++) {
          advanceTick(idle ? { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false } : racerModule.getRacerControl(state, track, { runtime, difficulty: 'easy' }));
        }
        if (!trial?.result) pause();
        return this.getSnapshot();
      },
      verifyTrialGhost() {
        const root = scene.getObjectByName('Personal best ghost / non-colliding');
        return { visible: root.visible, meshes: root.children.length, position: root.position.toArray(), samples: ghostSamples?.length ?? 0 };
      },
      getSnapshot() {`,
      ),
    });
  });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (e) => faults.push(e.message));
  let snap;
  const activate = (locator) => locator[touch ? 'tap' : 'click']();
  async function start() {
    await activate(page.locator('[data-action="time-trial"]').first());
    await activate(page.locator('[data-action="launch"]'));
    await page.waitForFunction(
      () =>
        window.__VN?.ready &&
        window.__VN_FRONTEND.getState().screen === 'race' &&
        window.__VN.getSnapshot().timeTrial,
      null,
      {
        timeout: 120000,
      },
    );
    snap = await page.evaluate(() => {
      window.__VN.restartRace();
      window.__VN.pause();
      return window.__VN.getSnapshot();
    });
  }
  async function finishLap() {
    const untilLap = sprint ? null : snap.lap.lap + 1;
    for (
      let batch = 0;
      batch < 35 && (sprint ? !snap.timeTrial.result : snap.lap.lap < untilLap);
      batch++
    ) {
      snap = await page.evaluate(
        (end) => window.__VN.verifyTrialStep(1200, false, end ?? Infinity),
        untilLap,
      );
    }
    const result = sprint ? snap.timeTrial.result : snap.timeTrial.lastLap;
    assert.ok(
      result?.playerValid,
      JSON.stringify({ lap: snap.lap, vehicle: snap.vehicle }),
    );
    assert.equal(result.laps, 1);
    assert.equal(result.splits.length, 3);
    assert.ok(!snap.events.some((e) => e.type === 'pickup-activate'));
    return result;
  }
  async function setup() {
    if (sprint) await activate(page.locator('[data-action="change"]'));
    else await activate(page.locator('#home'));
    await page.locator('[data-action="records"]').waitFor();
  }
  async function retry() {
    if (sprint) await activate(page.locator('[data-action="retry-race"]'));
    else await activate(page.locator('#restart'));
    snap = await page.evaluate(() => {
      window.__VN.pause();
      return window.__VN.getSnapshot();
    });
    assert.equal(snap.timeTrial.elapsed, 0);
    assert.equal(snap.vehicle.energy, 100);
  }
  await page.goto(base + `?intro=0&level=${level}&music=0`);
  await start();
  assert.equal(snap.timeTrial.best, null);
  assert.equal(snap.competition.enabled, false);
  assert.equal(snap.vehicle.energy, 100);
  assert.equal(snap.vehicle.distance, 0);
  if (!sprint) {
    assert.equal(
      await page.locator('#last').textContent(),
      'STANDING BEST: PENDING',
    );
    assert.equal(
      await page.locator('#best').textContent(),
      'FLYING BEST: PENDING',
    );
  }
  const first = await finishLap();
  assert.equal(first.saved.ghostSaved, true);
  assert.equal(first.improved, true);
  if (sprint) {
    await page.getByRole('heading', { name: 'First personal best.' }).waitFor();
    assert.equal(await page.locator('.trial-splits li').count(), 3);
  } else {
    assert.equal(snap.timeTrial.ghost, true);
    assert.equal(snap.timeTrial.ghostStart, 'standing');
    assert.equal(snap.timeTrial.best, null);
    assert.equal(snap.lap.lap, 2);
    await page.waitForFunction(
      () => document.querySelector('#lap').textContent === '2',
    );
    assert.equal(
      await page.locator('.timing > span').textContent(),
      'LAP TIME',
    );
    const standingRow = `STANDING BEST: ${formatTime(first.playerTotalTime, 2)}`;
    assert.equal(await page.locator('#last').textContent(), standingRow);
    assert.equal(
      await page.locator('#best').textContent(),
      'FLYING BEST: PENDING',
    );
    await page.evaluate(() => window.__VN.verifyTrialStep(960));
    assert.equal(
      await page.locator('#last').textContent(),
      standingRow,
      'record stays visible beyond the old six-second announcement',
    );
    assert.equal(
      await page.locator('#best').textContent(),
      'FLYING BEST: PENDING',
    );
    await page.waitForFunction(() => window.__VN.verifyTrialGhost().visible);
    assert.ok(
      (await page.evaluate(() => window.__VN.verifyTrialGhost())).meshes > 0,
    );
    // A new flying best replaces the standing fallback without ending play.
    const second = await finishLap();
    assert.equal(second.start, 'flying');
    assert.equal(second.improved, true);
    assert.equal(snap.timeTrial.ghostStart, 'flying');
    await page.waitForFunction(
      () =>
        document.querySelector('#best').textContent !== 'FLYING BEST: PENDING',
    );
    assert.equal(await page.locator('#last').textContent(), standingRow);
    assert.equal(
      await page.locator('#best').textContent(),
      `FLYING BEST: ${formatTime(second.playerTotalTime, 2)}`,
    );
    await page.evaluate(() => window.__VN.verifyTrialStep(240));
    await page.waitForFunction(() => window.__VN.verifyTrialGhost().visible);
    const ghost = await page.evaluate(() => window.__VN.verifyTrialGhost());
    assert.ok(ghost.samples > 2);
    assert.ok(ghost.position.every(Number.isFinite));
    await finishLap();
    await finishLap();
    assert.equal(
      snap.lap.lap,
      5,
      'driving continues past the old three-lap cap',
    );
    assert.equal(snap.lap.complete, false);
    assert.equal(snap.timeTrial.result, null);
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
      'race',
    );
    await setup();
  }
  await activate(page.locator('[data-action="records"]'));
  assert.equal(await page.locator('.records-list li').count(), sprint ? 1 : 2);
  const recordsText = await page.locator('.records-list').textContent();
  assert.match(recordsText, /Personal ghost saved/);
  if (!sprint) {
    assert.match(recordsText, /Standing lap/);
    assert.match(recordsText, /Flying lap/);
  }
  await page.locator('[data-record-key]').first().focus();
  await page.keyboard.press('KeyS');
  await page.keyboard.press('Escape');
  assert.equal(
    await page
      .locator('[data-record-key]')
      .first()
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.locator('[data-record-filter="ship"]').selectOption('needle');
  assert.equal(await page.locator('.records-list li').count(), 0);
  await page.locator('[data-record-filter="ship"]').selectOption('all');
  await page.keyboard.press('Escape');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  if (!sprint) {
    await activate(page.locator('[data-action="resume-session"]'));
    await page.evaluate(() => window.__VN.pause());
  }
  await retry();
  assert.equal(snap.timeTrial.best, first.playerTotalTime);
  assert.equal(snap.timeTrial.ghost, true);
  const repeated = await finishLap();
  assert.ok(
    Math.abs(repeated.playerTotalTime - first.playerTotalTime) < 1e-8,
    'identical input reproduces standing lap/descent',
  );
  assert.equal(repeated.improved, false);
  if (!sprint)
    assert.equal(
      snap.timeTrial.ghostStart,
      'flying',
      'retry picks saved flying ghost on lap two',
    );
  await setup();
  await activate(page.locator('[data-action="practice"]').first());
  await activate(page.locator('[data-action="launch"]'));
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().screen === 'race' &&
      window.__VN?.getSnapshot().timeTrial === null,
  );
  await page.evaluate(() => window.__VN.pause());
  assert.equal(
    await page.locator('.timing > span').textContent(),
    sprint ? 'ELAPSED' : 'LAP TIME',
  );
  await page.reload();
  await start();
  assert.equal(snap.timeTrial.best, first.playerTotalTime);
  assert.equal(snap.timeTrial.ghost, true);
  // Time-only quota fallback must never promise a missing ghost on reload.
  await page.evaluate((prefix) => {
    for (const key of Object.keys(localStorage).filter((key) =>
      key.startsWith(prefix),
    )) {
      const record = JSON.parse(localStorage.getItem(key));
      record.ghost = null;
      localStorage.setItem(key, JSON.stringify(record));
    }
  }, careerKey('vector-nova.trial.'));
  await page.reload();
  await start();
  snap = await page.evaluate(() => window.__VN.verifyTrialStep(120, true));
  assert.equal(snap.timeTrial.ghost, false);
  assert.equal(snap.timeTrial.best, first.playerTotalTime);
  if (sprint)
    await page.waitForFunction(
      () =>
        document.querySelector('#last').textContent === 'BEST TIME · NO GHOST',
    );
  else
    assert.equal(
      await page.locator('#last').textContent(),
      `STANDING BEST: ${formatTime(first.playerTotalTime, 2)}`,
    );
  const slower = await finishLap();
  assert.equal(slower.improved, false);
  assert.equal(slower.ghostAvailable, false);
  if (sprint)
    assert.equal(
      await page.locator('.results-note').textContent(),
      'Personal best unchanged. No compatible ghost is saved for this best.',
    );
  if (touch) {
    await retry();
    await page.evaluate(() => window.__VN.resume());
    await page.waitForFunction(
      () => window.__VN.getSnapshot().mode === 'racing',
    );
    const pad = page.locator('[data-touch-control="power"]');
    assert.equal(await pad.isVisible(), true);
    const b = await pad.boundingBox();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height * 0.12 }],
    });
    await page.waitForFunction(
      () => window.__VN.getSnapshot().vehicle.speed > 5,
    );
    assert.equal(await pad.getAttribute('data-power'), 'boost');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.equal(await pad.getAttribute('data-active'), 'false');
    await page.evaluate(() => window.__VN.pause());
    await activate(page.locator('#restart'));
    snap = await page.evaluate(() => window.__VN.getSnapshot());
    assert.equal(snap.timeTrial.elapsed, 0);
    assert.equal(snap.vehicle.energy, 100);
    await cdp.detach();
  }
  assert.deepEqual(faults, []);
  console.log(
    `PASS Time Trial ${level}: ${sprint ? 'descent' : 'unlimited laps and immediate ghosts'}, deterministic retry (${first.playerTotalTime.toFixed(3)} s), records/reload, practice transition${touch ? ', touch controls' : ''}`,
  );
} finally {
  await context.close();
  await browser.close();
}
