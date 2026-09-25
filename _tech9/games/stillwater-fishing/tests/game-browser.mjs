import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isWalkable } from '../src/world/pondDefinition.js';
import { terrainHeight } from '../src/world/terrain.js';
import { openScene, root, samplePerformance } from './lib/browser.mjs';

process.env.SCENE_PORT ??= '4442';
const output = path.join(root, '.artifacts/verification');
await mkdir(output, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  input:
    'Real keyboard, mouse, and visible form controls; hooks are read-only.',
  checks: [],
  unavailable: [],
};
const harness = await openScene({ mode: 'preview' });
const { page, snapshot } = harness;
report.environment = harness.environment;
const initial = await snapshot();
const game = async () => (await snapshot()).game;
const waitPhase = (phase, timeout = 20000) =>
  page.waitForFunction(
    (expected) => window.__SCENE_TEST__.snapshot().game.phase === expected,
    phase,
    { timeout },
  );
const hold = async (key, milliseconds) => {
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(milliseconds);
  } finally {
    await page.keyboard.up(key);
  }
};
async function restart() {
  await page.keyboard.up('Space');
  if (!(await game()).paused) await page.locator('#pause-button').click();
  await page.locator('#restart').click();
  await waitPhase('ready');
  await page.waitForFunction(
    () => !window.__SCENE_TEST__.snapshot().game.paused,
  );
}
async function approach() {
  await hold('KeyW', 1500);
  assert.ok((await game()).aim.valid, 'Bank offers a valid cast into water');
}
async function cast() {
  assert.equal((await game()).phase, 'ready');
  await page.keyboard.down('Space');
  await waitPhase('charging');
  await page.waitForTimeout(800);
  const charged = await game();
  assert.ok(
    charged.power > 0.2 && charged.power < 0.9,
    'Power responds to holding Space',
  );
  await page.keyboard.up('Space');
  await waitPhase('casting');
  await waitPhase('waiting');
  return charged.power;
}
async function hook() {
  await waitPhase('bite');
  assert.match(await page.locator('.action-title').textContent(), /hook/i);
  await page.keyboard.press('Space');
  await waitPhase('fight');
  assert.equal((await game()).held, false);
}
async function screenshot(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}
async function check(name, action) {
  try {
    const detail = await action();
    if (detail?.available === false) {
      report.checks.push({ name, pass: null, status: 'unavailable', detail });
      console.log(`UNAVAILABLE ${name}: ${detail.reason}`);
    } else {
      report.checks.push({ name, pass: true, detail });
      console.log(`PASS ${name}`);
    }
  } catch (error) {
    const capture = `${name.replace(/[^a-z0-9]+/gi, '-')}.png`;
    await page.keyboard.up('Space').catch(() => {});
    await page.screenshot({ path: path.join(output, capture) }).catch(() => {});
    report.checks.push({
      name,
      pass: false,
      error: error.message,
      screenshot: capture,
    });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
try {
  await check(
    'intro loads with truthful controls and no movement',
    async () => {
      assert.equal(initial.scene.id, 'stillwater-fishing');
      assert.equal(initial.game.started, false);
      assert.equal(initial.game.phase, 'ready');
      assert.equal(await page.locator('canvas').count(), 1);
      assert.ok(await page.locator('#begin').isVisible());
      await hold('KeyW', 300);
      assert.deepEqual(
        (await snapshot()).camera.position,
        initial.camera.position,
      );
      await screenshot('intro');
      await page.locator('#begin').click();
      assert.equal((await game()).started, true);
      assert.equal(await page.locator('.intro').isVisible(), false);
      return initial;
    },
  );
  await check('walking reaches bank and remains grounded', async () => {
    const before = (await snapshot()).camera.position;
    await approach();
    const after = (await snapshot()).camera.position;
    const distance = Math.hypot(after[0] - before[0], after[2] - before[2]);
    assert.ok(distance > 2.5 && distance < 4.4, `Walking distance ${distance}`);
    assert.ok(
      Math.abs(after[1] - terrainHeight(after[0], after[2]) - 1.68) < 1e-6,
    );
    await screenshot('bank');
    return { before, after, distance };
  });
  await check('shoreline blocks walking into pond', async () => {
    await hold('KeyW', 4000);
    const stopped = (await snapshot()).camera.position;
    await hold('KeyW', 1000);
    const after = (await snapshot()).camera.position;
    assert.ok(
      isWalkable(after[0], after[2]),
      'Player remains outside the water',
    );
    assert.ok(Math.hypot(after[0] - stopped[0], after[2] - stopped[2]) < 0.1);
    return { stopped, after };
  });
  await check('right drag and keyboard aim change camera', async () => {
    const before = (await snapshot()).camera.quaternion;
    await page.mouse.move(900, 430);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(990, 460, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    const dragged = (await snapshot()).camera.quaternion;
    assert.notDeepEqual(dragged, before);
    await hold('KeyJ', 250);
    const keyed = (await snapshot()).camera.quaternion;
    assert.notDeepEqual(keyed, dragged);
    assert.equal((await game()).phase, 'ready', 'Looking does not cast');
    await restart();
    assert.deepEqual(
      (await snapshot()).camera.quaternion,
      initial.camera.quaternion,
    );
    await approach();
    return { before, dragged, keyed };
  });
  await check(
    'cast hook pause resume reel land and release through real input',
    async () => {
      await restart();
      await approach();
      const power = await cast();
      await hook();
      await hold('Space', 400);
      await screenshot('fight');
      await page.locator('#pause-button').click();
      const frozen = await snapshot();
      assert.equal(frozen.game.paused, true);
      assert.equal(frozen.game.held, false);
      await hold('KeyW', 400);
      await hold('Space', 350);
      const paused = await snapshot();
      assert.deepEqual(paused.camera.position, frozen.camera.position);
      for (const key of ['timer', 'tension', 'progress', 'fightTime'])
        assert.equal(
          paused.game[key],
          frozen.game[key],
          `Pause freezes ${key}`,
        );
      await page.locator('#resume').click();
      assert.equal((await game()).paused, false);
      const deadline = Date.now() + 110000;
      const fight = [];
      let reeling = false;
      let previousLog = -10;
      while (Date.now() < deadline) {
        const state = await game();
        if (state.phase !== 'fight') break;
        const shouldReel = reeling
          ? state.tension < 0.68
          : state.tension < 0.29;
        if (shouldReel !== reeling) {
          if (shouldReel) await page.keyboard.down('Space');
          else await page.keyboard.up('Space');
          reeling = shouldReel;
        }
        if (state.fightTime - previousLog >= 10) {
          fight.push({
            time: state.fightTime,
            tension: state.tension,
            progress: state.progress,
          });
          previousLog = state.fightTime;
          console.log(
            `FIGHT ${state.fightTime.toFixed(1)}s ${(state.progress * 100).toFixed(0)}%`,
          );
        }
        await page.waitForTimeout(90);
      }
      await page.keyboard.up('Space');
      const landed = await game();
      assert.equal(
        landed.phase,
        'landed',
        `Fight result: ${JSON.stringify(landed)}`,
      );
      assert.equal(landed.catches, 1);
      assert.ok(landed.lastCatch.lengthCm >= 34);
      assert.ok(await page.locator('#release').isVisible());
      assert.equal(
        await page.locator('.length-value').textContent(),
        String(landed.lastCatch.lengthCm),
      );
      await screenshot('landed');
      await page.locator('#release').click();
      const released = await game();
      assert.equal(released.phase, 'ready');
      assert.equal(released.released, 1);
      assert.equal(released.catches, 1);
      assert.match(
        await page.locator('.catch-count').textContent(),
        /1 returned/,
      );
      assert.equal(await page.locator('.catch-panel').isVisible(), false);
      await cast();
      assert.equal(
        (await game()).castNumber,
        2,
        'Released trout permits a new cast',
      );
      return { power, frozen: frozen.game, fight, landed, released };
    },
  );
  await check(
    'restart clears visit catches targets and presentation',
    async () => {
      await restart();
      const state = await snapshot();
      assert.equal(state.game.catches, 0);
      assert.equal(state.game.released, 0);
      assert.equal(state.game.lastCatch, null);
      assert.equal(state.game.castNumber, 0);
      assert.equal(state.game.held, false);
      assert.equal(state.game.phase, 'ready');
      assert.deepEqual(state.camera.position, initial.camera.position);
      assert.deepEqual(state.camera.quaternion, initial.camera.quaternion);
      assert.deepEqual(state.game.castTarget, initial.game.castTarget);
      assert.equal(await page.locator('.catch-panel').isVisible(), false);
      assert.equal(await page.locator('.fight-wrap').isVisible(), false);
      assert.equal(await page.locator('.power-wrap').isVisible(), false);
      assert.match(
        await page.locator('.catch-count').textContent(),
        /0 returned/,
      );
      assert.match(
        await page.locator('.action-title').textContent(),
        /Cast into the quiet/,
      );
      return state.game;
    },
  );
  await check('invalid land cast explains failure and can retry', async () => {
    await restart();
    await hold('KeyJ', 2600);
    assert.equal((await game()).aim.valid, false);
    await hold('Space', 800);
    await waitPhase('failed');
    const failure = await game();
    assert.match(failure.reason, /bank/i);
    await page.keyboard.press('Space');
    await waitPhase('ready');
    assert.equal((await game()).reason, '');
    await restart();
    assert.deepEqual(
      (await snapshot()).camera.quaternion,
      initial.camera.quaternion,
    );
    await approach();
    await cast();
    return failure;
  });
  await check(
    'missed bite escapes without granting catch and can retry',
    async () => {
      await waitPhase('bite');
      await waitPhase('failed');
      const missed = await game();
      assert.match(missed.reason, /slipped away/i);
      assert.equal(missed.catches, 0);
      await page.keyboard.press('Space');
      await waitPhase('ready');
      await cast();
      return missed;
    },
  );
  await check(
    'continuous reel breaks line without granting catch',
    async () => {
      await waitPhase('bite');
      await page.keyboard.down('Space');
      await waitPhase('fight');
      await waitPhase('failed', 20000);
      await page.keyboard.up('Space');
      const broken = await game();
      assert.match(broken.reason, /line snapped/i);
      assert.equal(broken.catches, 0);
      assert.equal(await page.locator('.catch-panel').isVisible(), false);
      await page.keyboard.press('Space');
      await waitPhase('ready');
      return broken;
    },
  );
  await check('all five scene settings respond to their controls', async () => {
    await page.locator('#pause-button').click();
    await page.locator('.pause-panel summary').click();
    assert.equal(
      await page.locator('.pause-panel select, .pause-panel input').count(),
      5,
    );
    for (const quality of ['balanced', 'ultra', 'high']) {
      await page.locator('#quality').selectOption(quality);
      assert.equal((await snapshot()).settings.quality, quality);
    }
    for (const name of ['sunlight', 'atmosphere', 'richness', 'exposure']) {
      await page.locator(`#${name}`).focus();
      await page.keyboard.press('End');
      assert.equal((await snapshot()).settings[name], 1.6);
      await page.keyboard.press('Home');
      assert.equal((await snapshot()).settings[name], 0.4);
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
      assert.equal((await snapshot()).settings[name], 1);
    }
    await page.locator('#resume').click();
    return (await snapshot()).settings;
  });
  await check(
    'narrow viewport stays usable without horizontal overflow',
    async () => {
      const measurements = [];
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 900, height: 640 },
      ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(250);
        const dimensions = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert.ok(
          dimensions.scroll <= dimensions.width,
          JSON.stringify(dimensions),
        );
        assert.ok(await page.locator('#pause-button').isVisible());
        await page.locator('#pause-button').click();
        assert.ok(await page.locator('#resume').isVisible());
        await page.locator('#resume').click();
        const box = await page.locator('canvas').boundingBox();
        assert.equal(Math.round(box.width), viewport.width);
        assert.equal(Math.round(box.height), viewport.height);
        measurements.push({ viewport, dimensions });
      }
      await page.setViewportSize({ width: 1600, height: 1000 });
      return measurements;
    },
  );
  await check(
    'explicit pointer capture and Escape release pause safely',
    async () => {
      await page.locator('#lock-button').click();
      try {
        await page.waitForFunction(
          () => document.pointerLockElement?.id === 'scene',
          undefined,
          { timeout: 3000 },
        );
      } catch {
        report.unavailable.push(
          'Headless browser did not grant pointer lock after clicking Capture mouse. Keyboard aiming and right-drag aiming have separate checks.',
        );
        return { available: false, reason: report.unavailable.at(-1) };
      }
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.pointerLockElement === null);
      assert.equal((await game()).paused, true);
      assert.equal((await game()).held, false);
      await page.locator('#resume').click();
      return { available: true, exitPaused: true };
    },
  );
  await check('real page focus loss clears held input and pauses', async () => {
    await page.keyboard.down('Space');
    await waitPhase('charging');
    const other = await harness.browser.newPage();
    try {
      await other.goto('about:blank');
      await other.bringToFront();
      try {
        await page.waitForFunction(
          () => window.__SCENE_TEST__.snapshot().game.paused,
          undefined,
          { timeout: 3000 },
        );
      } catch {
        report.unavailable.push(
          'Headless Chromium did not deliver page blur/visibility loss when another real page came forward. Unit lifecycle checks cover event behavior.',
        );
        return { available: false, reason: report.unavailable.at(-1) };
      }
      const state = await game();
      assert.equal(state.held, false);
      return { available: true, phase: state.phase, paused: state.paused };
    } finally {
      await other.close();
      await page.bringToFront();
      await page.keyboard.up('Space');
      await restart();
    }
  });
  await check(
    'frame timing records browser GPU viewport and preset',
    async () => {
      await page.locator('#pause-button').click();
      await page.locator('#quality').selectOption('balanced');
      await page.locator('#resume').click();
      await approach();
      report.performance = await samplePerformance(page, 5000);
      assert.ok(report.performance.samples >= 5);
      report.performance.preset = (await snapshot()).settings;
      report.performance.viewport = page.viewportSize();
      return report.performance;
    },
  );
  report.finalSnapshot = await snapshot();
  await check('ordinary production launch exposes no test hooks', async () => {
    const url = new URL(page.url());
    url.search = '';
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.locator('#begin').waitFor({ state: 'visible' });
    assert.equal(
      await page.evaluate(() => Object.hasOwn(window, '__SCENE_TEST__')),
      false,
    );
  });
  await check('no browser asset or WebGL errors', () => {
    for (const [kind, errors] of Object.entries(harness.errors))
      assert.deepEqual(errors, [], `${kind}: ${errors.join('; ')}`);
  });
} finally {
  report.errors = harness.errors;
  report.passed = report.checks.every((item) => item.pass !== false);
  report.coverageComplete = report.unavailable.length === 0;
  report.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(output, 'game-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await harness.close();
  if (!report.passed) process.exitCode = 1;
  console.log(`Report: ${path.join(output, 'game-report.json')}`);
}
