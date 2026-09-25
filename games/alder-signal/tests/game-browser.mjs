import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Euler, Quaternion } from 'three';
import { getForestColliders } from '../src/world/ForestWorld.js';
import { pathCenter, terrainHeight } from '../src/world/terrain.js';
import { openScene, root, samplePerformance } from './lib/browser.mjs';

const output = path.join(root, '.artifacts/game-verification');
await mkdir(output, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
    .toString()
    .trim(),
  method:
    'Production preview. Visible buttons, real keyboard and mouse input; snapshots are observers. Only timeout setup calls setRemaining. No teleport, camera preset or completion hooks.',
  checks: [],
  movement: [],
};
let harness;
let page;
let snapshot;
let mouseX = 800;
let mouseY = 500;
const yawEuler = new Euler(0, 0, 0, 'YXZ');
const quaternion = new Quaternion();
const distanceXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const angle = (value) => Math.atan2(Math.sin(value), Math.cos(value));
const positionAt = (x, z) => [x, terrainHeight(x, z), z];

async function fingerprint() {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(path.join(root, directory), {
      withFileTypes: true,
    })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(relative);
      else files.push(relative);
    }
  }
  await walk('src');
  await walk('public');
  files.push('index.html', 'package.json', 'vite.config.js');
  const hash = createHash('sha256');
  for (const filename of files.sort()) {
    hash.update(filename);
    hash.update(await readFile(path.join(root, filename)));
  }
  return hash.digest('hex');
}

async function check(name, action) {
  try {
    const detail = await action();
    report.checks.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    const screenshot = `${name.replace(/[^a-z0-9]+/gi, '-')}.png`;
    await page
      ?.screenshot({ path: path.join(output, screenshot) })
      .catch(() => {});
    report.checks.push({ name, pass: false, error: error.stack, screenshot });
    console.error(`FAIL ${name}: ${error.message}`);
    return false;
  } finally {
    await writeFile(
      path.join(output, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
}

async function state(expected) {
  await page.waitForFunction(
    (expected) => window.__ALDER_TEST__?.snapshot().state === expected,
    expected,
    { timeout: 10000 },
  );
  return snapshot();
}

async function button(action) {
  const target = page.locator(`[data-action="${action}"]:visible`).first();
  assert.ok(await target.isVisible(), `${action} button is visible`);
  await target.click();
}

async function pressFor(key, duration) {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  await page.keyboard.up(key);
}

async function releaseMovement() {
  for (const key of ['w', 'a', 's', 'd', 'Shift', 'e'])
    await page.keyboard.up(key);
}

// Orient using actual mouse input, then verify the observed quaternion. The
// target positions are authored route data, never writes to the running world.
async function face(target) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const observed = await snapshot();
    const [x, , z] = observed.camera.position;
    const desired = Math.atan2(-(target[0] - x), -(target[2] - z));
    yawEuler.setFromQuaternion(
      quaternion.fromArray(observed.camera.quaternion),
    );
    const delta = angle(yawEuler.y - desired);
    const pitchDelta = yawEuler.x + 0.06;
    if (Math.abs(delta) < 0.007 && Math.abs(pitchDelta) < 0.007) return;
    const movement = Math.max(-600, Math.min(600, delta / 0.002));
    const vertical = Math.max(-300, Math.min(300, pitchDelta / 0.002));
    const locked = await page.evaluate(() => !!document.pointerLockElement);
    if (locked) {
      mouseX += movement;
      mouseY += vertical;
      await page.mouse.move(mouseX, mouseY);
    } else {
      // Drag-to-look fallback is a supported user control, including headless
      // browsers where pointer lock is unavailable.
      mouseX = 800 - movement / 2;
      mouseY = 500 - vertical / 2;
      await page.mouse.move(mouseX, mouseY);
      await page.mouse.down();
      mouseX += movement;
      mouseY += vertical;
      await page.mouse.move(mouseX, mouseY, { steps: 3 });
      await page.mouse.up();
    }
    await page.waitForTimeout(20);
  }
  throw new Error('Real mouse input could not orient toward the route target');
}

async function walkTo(target, tolerance = 0.25) {
  const started = Date.now();
  const before = (await snapshot()).camera.position;
  let priorDistance = Infinity;
  let stagnant = 0;
  while (Date.now() - started < 15000) {
    const observed = await snapshot();
    assert.equal(observed.game.state, 'playing');
    const distance = distanceXZ(observed.camera.position, target);
    if (distance <= tolerance) {
      report.movement.push({
        target,
        before,
        after: observed.camera.position,
        distance,
        milliseconds: Date.now() - started,
      });
      return;
    }
    await face(target);
    if (Math.abs(priorDistance - distance) < 0.025) stagnant++;
    else stagnant = 0;
    assert.ok(stagnant < 6, `Route blocked at ${observed.camera.position}`);
    priorDistance = distance;
    const duration = Math.max(
      35,
      Math.min(600, ((distance - tolerance * 0.6) / 6.2) * 1000),
    );
    await page.keyboard.down('Shift');
    await pressFor('w', duration);
    await page.keyboard.up('Shift');
  }
  throw new Error(`Timed out walking to ${target}`);
}

async function alongTrail(target, tolerance = 2.1) {
  let [, , z] = (await snapshot()).camera.position;
  await walkTo(positionAt(pathCenter(z), z), 0.35);
  const direction = Math.sign(target[2] - z);
  while (Math.abs(target[2] - z) > 4) {
    z += direction * 4;
    await walkTo(positionAt(pathCenter(z), z), 0.35);
  }
  await walkTo(positionAt(pathCenter(target[2]), target[2]), 0.25);
  await walkTo(target, tolerance);
  await face(target);
}

async function frozen(observed, duration = 450) {
  await page.waitForTimeout(duration);
  const after = await snapshot();
  assert.deepEqual(after.camera.position, observed.camera.position);
  assert.deepEqual(after.camera.quaternion, observed.camera.quaternion);
  assert.equal(after.game.remainingSeconds, observed.game.remainingSeconds);
  return after;
}

try {
  report.sourceFingerprintBefore = await fingerprint();
  harness = await openScene({ mode: 'preview' });
  ({ page, snapshot } = harness);
  report.environment = harness.environment;
  const loaded = await snapshot();
  const initialTime = loaded.game.remainingSeconds;
  assert.equal(loaded.game.state, 'menu');

  await check('visible menu and gesture-gated audio', async () => {
    assert.ok(await page.locator('[data-action="start"]:visible').isVisible());
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(loaded.settings.quality, 'balanced');
    assert.equal(loaded.game.audio.started, false);
    await page.keyboard.down('w');
    await frozen(loaded);
    await page.keyboard.up('w');
    return loaded;
  });

  await check('narrow menu fits and explains desktop input', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
      text: document.body.innerText,
      guidance: [
        ...document.querySelectorAll(
          '[data-desktop-guidance], .desktop-guidance',
        ),
      ]
        .filter((node) => node.getBoundingClientRect().height > 0)
        .map((node) => node.textContent),
    }));
    assert.ok(
      layout.width <= layout.viewport,
      'No horizontal overflow at 390px',
    );
    assert.match(layout.text, /keyboard|desktop/i);
    assert.match(layout.text, /mouse/i);
    assert.ok(await page.locator('[data-action="start"]:visible').isVisible());
    await page.setViewportSize({ width: 1600, height: 1000 });
    return layout;
  });
  // Restore even after an unsuccessful narrow-layout assertion.
  await page.setViewportSize({ width: 1600, height: 1000 });

  await check('start and real grounded keyboard movement', async () => {
    await button('start');
    await state('playing');
    await page.mouse.move(mouseX, mouseY);
    const before = await snapshot();
    assert.equal(before.game.audio.started, true);
    assert.equal(before.game.audio.contextState, 'running');
    await face(positionAt(pathCenter(20), 20));
    await pressFor('w', 550);
    const after = await snapshot();
    const distance = distanceXZ(before.camera.position, after.camera.position);
    assert.ok(distance > 0.8, `Actual W input moved ${distance}m`);
    const [x, y, z] = after.camera.position;
    assert.ok(Math.abs(y - terrainHeight(x, z) - 1.7) < 0.03);
    assert.ok(after.game.remainingSeconds < before.game.remainingSeconds);
    return { before, after, distance };
  });

  await check('pause freezes held input and resume clears it', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(120);
    await page.keyboard.press('p');
    const paused = await state('paused');
    await frozen(paused);
    // W remains physically held across the resume click; no new keydown occurs.
    await button('resume');
    const resumed = await state('playing');
    await page.waitForTimeout(300);
    const idle = await snapshot();
    assert.deepEqual(idle.camera.position, resumed.camera.position);
    assert.ok(idle.game.remainingSeconds < resumed.game.remainingSeconds);
    await page.keyboard.up('w');
    return { paused, resumed, idle };
  });

  await check(
    'five visible graphics controls update rendering settings',
    async () => {
      await page.keyboard.press('p');
      await state('paused');
      const controls = page.locator('[data-setting]');
      assert.equal(await controls.count(), 5);
      assert.deepEqual(
        await controls.evaluateAll((items) =>
          items.map((item) => item.dataset.setting).sort(),
        ),
        ['atmosphere', 'exposure', 'quality', 'richness', 'sunlight'],
      );
      const quality = page.locator('[data-setting="quality"]');
      assert.ok(await quality.isVisible());
      for (const preset of ['high', 'ultra', 'balanced']) {
        await quality.selectOption(preset);
        assert.equal((await snapshot()).settings.quality, preset);
      }
      const values = {};
      for (const setting of [
        'sunlight',
        'atmosphere',
        'richness',
        'exposure',
      ]) {
        const input = page.locator(`[data-setting="${setting}"]`);
        assert.ok(await input.isVisible(), `${setting} is visible`);
        await input.focus();
        await page.keyboard.press('End');
        const maximum = Number(await input.getAttribute('max'));
        assert.equal((await snapshot()).settings[setting], maximum);
        values[setting] = maximum;
        const minimum = Number(await input.getAttribute('min'));
        const step = Number(await input.getAttribute('step')) || 1;
        await page.keyboard.press('Home');
        for (let count = 0; count < Math.round((1 - minimum) / step); count++)
          await page.keyboard.press('ArrowRight');
        assert.equal((await snapshot()).settings[setting], 1);
      }
      return { values, settings: (await snapshot()).settings };
    },
  );

  await check(
    'mute responds to visible control and persists through resume',
    async () => {
      assert.equal((await snapshot()).game.state, 'paused');
      const before = (await snapshot()).game.audio;
      await button('mute');
      const muted = (await snapshot()).game.audio;
      assert.equal(muted.muted, !before.muted);
      await button('resume');
      await state('playing');
      assert.equal((await snapshot()).game.audio.muted, muted.muted);
      await page.keyboard.press('p');
      await state('paused');
      await button('mute');
      assert.equal((await snapshot()).game.audio.muted, before.muted);
      await button('resume');
      return { before, muted, after: (await snapshot()).game.audio };
    },
  );

  await check('real movement collides with an authored rock', async () => {
    const rock = getForestColliders().find((item) => item.id === 'rock-427');
    assert.ok(rock, 'Known near-trail rock exists');
    await alongTrail(positionAt(pathCenter(rock.z), rock.z), 0.25);
    const target = positionAt(rock.x, rock.z);
    const before = (await snapshot()).camera.position;
    const samples = [];
    for (let attempt = 0; attempt < 24; attempt++) {
      await face(target);
      await pressFor('w', 100);
      const position = (await snapshot()).camera.position;
      samples.push({
        position,
        clearance: distanceXZ(position, target) - rock.radius,
      });
    }
    assert.ok(
      samples.every((sample) => sample.clearance >= 0.32),
      'Never penetrates solid proxy',
    );
    const last = samples.at(-1);
    assert.ok(last.clearance < 0.4, 'Reaches actual contact boundary');
    assert.ok(
      distanceXZ(before, last.position) < 3.5 * 2.4 - 1,
      'Solid rock limits requested movement',
    );
    return { rock, before, samples };
  });

  await check(
    'restart resets mission and clears a held movement key',
    async () => {
      await page.keyboard.down('w');
      await page.keyboard.press('p');
      await state('paused');
      await button('restart');
      const restarted = await state('playing');
      assert.deepEqual(restarted.game.restored, []);
      assert.equal(restarted.game.interactionProgress, 0);
      assert.ok(restarted.game.remainingSeconds >= initialTime - 1);
      assert.ok(
        distanceXZ(restarted.camera.position, restarted.game.spawn) < 0.001,
      );
      await page.waitForTimeout(350);
      assert.deepEqual(
        (await snapshot()).camera.position,
        restarted.camera.position,
      );
      await page.keyboard.up('w');
      return restarted;
    },
  );

  const played = await check(
    'real input restores three relays and returns to win',
    async () => {
      const began = await snapshot();
      assert.equal(began.game.state, 'playing');
      const route = began.game.route.filter((item) =>
        item.id.startsWith('relay-'),
      );
      assert.equal(route.length, 3);
      const stations = [];
      for (const [index, station] of route.entries()) {
        await alongTrail(station.position);
        const arrived = await snapshot();
        assert.equal(arrived.game.target.id, station.id);
        assert.ok(arrived.game.target.distance < 2.7);
        if (index === 0 || index === 2) {
          await page.waitForTimeout(200);
          await page.screenshot({
            path: path.join(
              output,
              `gameplay-${index === 0 ? 'trail' : 'ridge'}.png`,
            ),
          });
        }
        await page.keyboard.down('e');
        await page.waitForTimeout(700);
        const progress = (await snapshot()).game.interactionProgress;
        assert.ok(
          progress > 0 && progress < 1,
          `Visible hold progresses at ${station.id}`,
        );
        await page.waitForFunction(
          (id) => window.__ALDER_TEST__.snapshot().restored.includes(id),
          station.id,
          { timeout: 5000 },
        );
        await page.keyboard.up('e');
        stations.push({
          id: station.id,
          arrived,
          progress,
          restored: (await snapshot()).game.restored,
        });
      }
      const returnTarget = (await snapshot()).game.target;
      assert.ok(
        returnTarget && !route.some((item) => item.id === returnTarget.id),
      );
      await alongTrail(returnTarget.position);
      await page.keyboard.down('e');
      const won = await state('won');
      await page.keyboard.up('e');
      assert.equal(won.game.restored.length, 3);
      assert.ok(won.game.remainingSeconds > 0);
      assert.ok(
        await page.locator('[data-action="restart"]:visible').isVisible(),
      );
      await page.keyboard.down('w');
      await frozen(won);
      await page.keyboard.up('w');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      const narrowResult = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        text: document.body.innerText,
      }));
      assert.ok(narrowResult.width <= narrowResult.viewport);
      const restartBox = await page
        .locator('[data-action="restart"]:visible')
        .boundingBox();
      assert.ok(restartBox.x >= 0 && restartBox.x + restartBox.width <= 390);
      await page.setViewportSize({ width: 1600, height: 1000 });
      return { stations, returnTarget, won, narrowResult };
    },
  );

  if (played) {
    await check(
      'win restart removes restored state and returns to the trailhead',
      async () => {
        await button('restart');
        const restarted = await state('playing');
        assert.deepEqual(restarted.game.restored, []);
        assert.equal(restarted.game.interactionProgress, 0);
        assert.equal(restarted.game.target.id, restarted.game.route[0].id);
        assert.ok(restarted.game.remainingSeconds >= initialTime - 1);
        assert.ok(
          distanceXZ(restarted.camera.position, restarted.game.spawn) < 0.001,
        );
        return restarted;
      },
    );
  }

  await check(
    'balanced desktop frame timing and renderer metrics',
    async () => {
      assert.equal((await snapshot()).settings.quality, 'balanced');
      assert.deepEqual(page.viewportSize(), { width: 1600, height: 1000 });
      await page.waitForTimeout(1000);
      report.performance = await samplePerformance(page, 5000);
      assert.ok(report.performance.samples >= 10);
      return { performance: report.performance, snapshot: await snapshot() };
    },
  );

  await check(
    'ordinary countdown reaches loss and restart clears it',
    async () => {
      assert.equal((await snapshot()).game.state, 'playing');
      // The only state-changing test hook used in this script sets up a rare
      // clock state; normal frame updates, UI and inputs must produce the loss.
      await page.evaluate(() => window.__ALDER_TEST__.setRemaining(0.4));
      const before = await snapshot();
      assert.ok(before.game.remainingSeconds > 0);
      const lost = await state('lost');
      assert.equal(lost.game.remainingSeconds, 0);
      await page.keyboard.down('w');
      await frozen(lost);
      await page.keyboard.up('w');
      assert.ok(
        await page.locator('[data-action="restart"]:visible').isVisible(),
      );
      await button('restart');
      const restarted = await state('playing');
      assert.deepEqual(restarted.game.restored, []);
      assert.equal(restarted.game.interactionProgress, 0);
      assert.ok(restarted.game.remainingSeconds >= initialTime - 1);
      assert.ok(
        distanceXZ(restarted.camera.position, restarted.game.spawn) < 0.001,
      );
      return { before, lost, restarted };
    },
  );

  await check('narrow gameplay and pause remain within viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const gameplay = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      text: document.body.innerText,
    }));
    assert.ok(gameplay.width <= gameplay.viewport);
    assert.match(gameplay.text, /WASD.*WALK/i);
    assert.match(gameplay.text, /LOOK/i);
    assert.match(gameplay.text, /PAUSE/i);
    await page.keyboard.press('p');
    await state('paused');
    assert.ok(await page.locator('[data-action="resume"]:visible').isVisible());
    const pause = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    assert.ok(pause.width <= pause.viewport);
    await page.setViewportSize({ width: 1600, height: 1000 });
    return { gameplay, pause };
  });

  await check('no browser asset or WebGL errors', () => {
    for (const [kind, errors] of Object.entries(harness.errors))
      assert.deepEqual(errors, [], `${kind}: ${errors.join('; ')}`);
    return harness.errors;
  });
  report.finalSnapshot = await snapshot();

  await check('ordinary production launch exposes no test hooks', async () => {
    await releaseMovement();
    const url = new URL(page.url());
    url.search = '';
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-action="start"]:visible', {
      timeout: 120000,
    });
    await page.waitForFunction(() =>
      document.querySelector('#loading')?.classList.contains('loaded'),
    );
    const exposed = await page.evaluate(() => ({
      scene: Object.hasOwn(window, '__SCENE_TEST__'),
      game: Object.hasOwn(window, '__ALDER_TEST__'),
    }));
    assert.deepEqual(exposed, { scene: false, game: false });
    for (const [kind, errors] of Object.entries(harness.errors))
      assert.deepEqual(errors, [], `${kind}: ${errors.join('; ')}`);
    return exposed;
  });

  await check(
    'rendered source stayed frozen throughout verification',
    async () => {
      report.sourceFingerprintAfter = await fingerprint();
      assert.equal(
        report.sourceFingerprintAfter,
        report.sourceFingerprintBefore,
      );
      return { sha256: report.sourceFingerprintAfter };
    },
  );
} catch (error) {
  report.checks.push({
    name: 'harness startup or fatal error',
    pass: false,
    error: error.stack,
  });
  console.error(error);
} finally {
  if (page) await releaseMovement().catch(() => {});
  if (harness) {
    report.errors = harness.errors;
    await harness.close();
  }
  report.passed =
    report.checks.length > 0 && report.checks.every((item) => item.pass);
  report.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (!report.passed) process.exitCode = 1;
}
