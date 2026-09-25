import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openScene, root } from './lib/browser.mjs';
import { getForestColliders } from '../src/world/ForestWorld.js';

const output = path.join(root, '.artifacts/walking-verification');
await mkdir(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [] };
const harness = await openScene({ mode: 'preview' });
const { page, snapshot } = harness;
report.environment = harness.environment;
async function check(name, action) {
  try {
    const detail = await action();
    report.checks.push({ name, pass: true, detail });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, pass: false, error: error.message });
    await page.screenshot({ path: path.join(output, 'failure.png') });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
const horizontalDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
async function hold(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
async function resume() {
  if (!(await snapshot()).walking.enabled)
    await page.locator('#enter-world').click();
}
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
async function face(x, z) {
  for (let i = 0; i < 30; i++) {
    const state = await snapshot();
    const [px, , pz] = state.camera.position;
    const yaw = Math.atan2(-(x - px), -(z - pz));
    const delta = wrap(yaw - state.walking.yaw);
    if (Math.abs(delta) < 0.025) return;
    await hold(
      delta > 0 ? 'j' : 'l',
      Math.max(16, Math.min(400, (Math.abs(delta) / 1.15) * 1000)),
    );
  }
  throw new Error('Keyboard look failed to face waypoint');
}
async function walkTo(x, z, stopDistance = 0.4) {
  for (let i = 0; i < 35; i++) {
    const before = (await snapshot()).camera.position;
    const distance = Math.hypot(x - before[0], z - before[2]);
    if (distance <= stopDistance) return before;
    await face(x, z);
    await hold(
      'w',
      Math.max(40, Math.min(300, ((distance - stopDistance) / 2.6) * 1000)),
    );
  }
  throw new Error(`Could not reach walking waypoint ${x},${z}`);
}

try {
  const url = new URL(page.url());
  url.searchParams.set('controller', 'walk');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      window.__SCENE_TEST__?.ready && window.__SCENE_TEST__.snapshot().walking,
  );
  await check(
    'walking starts disabled and retains five graphics controls',
    async () => {
      const before = await snapshot();
      assert.equal(before.walking.enabled, false);
      assert.equal(await page.locator('[data-setting]').count(), 5);
      await hold('w', 250);
      assert.deepEqual(
        (await snapshot()).camera.position,
        before.camera.position,
      );
      await page.locator('[data-setting="quality"]').selectOption('balanced');
      assert.equal((await snapshot()).settings.quality, 'balanced');
      return { controls: 5, disabledPosition: before.camera.position };
    },
  );
  await check(
    'start, WASD movement and terrain-following eye height use real input',
    async () => {
      await resume();
      const before = (await snapshot()).camera.position;
      await hold('w', 650);
      const after = await snapshot();
      assert.ok(horizontalDistance(before, after.camera.position) > 0.6);
      assert.ok(
        Math.abs(
          after.camera.position[1] -
            after.walking.groundHeight -
            after.walking.eyeHeight,
        ) < 1e-6,
      );
      return { before, after: after.camera.position };
    },
  );
  await check('keyboard and right-drag look work without capture', async () => {
    const before = (await snapshot()).walking.yaw;
    await hold('j', 180);
    const keyboardYaw = (await snapshot()).walking.yaw;
    assert.ok(keyboardYaw > before + 0.08);
    await page.mouse.move(700, 420);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(820, 440, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    const dragYaw = (await snapshot()).walking.yaw;
    assert.ok(dragYaw < keyboardYaw - 0.1);
    assert.equal((await snapshot()).walking.locked, false);
    return { before, keyboardYaw, dragYaw };
  });
  await check(
    'pause clears held movement and resume starts without stuck input',
    async () => {
      await page.keyboard.down('w');
      await page.waitForTimeout(100);
      await page.keyboard.press('p');
      const paused = await snapshot();
      assert.equal(paused.walking.enabled, false);
      await page.waitForTimeout(250);
      assert.deepEqual(
        (await snapshot()).camera.position,
        paused.camera.position,
      );
      await resume();
      await page.waitForTimeout(250);
      assert.deepEqual(
        (await snapshot()).camera.position,
        paused.camera.position,
      );
      await page.keyboard.up('w');
      await page.keyboard.press('Escape');
      assert.equal((await snapshot()).walking.enabled, false);
      await resume();
      return { paused: paused.camera.position };
    },
  );
  await check('authored tree blocks a real walking approach', async () => {
    await resume();
    await walkTo(-3.4, 18);
    const tree = getForestColliders().find(
      (c) => c.kind === 'tree' && c.x === -7.5 && c.z === 15,
    );
    assert.ok(tree);
    let closest = Infinity;
    const minimum = tree.radius + (await snapshot()).walking.playerRadius;
    for (let i = 0; i < 18; i++) {
      await face(tree.x, tree.z);
      await hold('w', 200);
      const [x, , z] = (await snapshot()).camera.position;
      const distance = Math.hypot(x - tree.x, z - tree.z);
      closest = Math.min(closest, distance);
      assert.ok(
        distance >= minimum - 0.005,
        `Entered tree proxy: ${distance} < ${minimum}`,
      );
    }
    assert.ok(
      closest < minimum + 0.2,
      `Never reached collider boundary: ${closest}`,
    );
    await page.screenshot({ path: path.join(output, 'tree-collision.png') });
    return { tree, minimum, closest };
  });
  await check(
    'tuning pauses walking and range keyboard input stays with the menu',
    async () => {
      await page.locator('#toggle-panel').click();
      assert.equal((await snapshot()).walking.enabled, false);
      const before = (await snapshot()).camera.position;
      await page.locator('[data-setting="exposure"]').focus();
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowLeft');
      assert.ok((await snapshot()).settings.exposure < 1.6);
      assert.deepEqual((await snapshot()).camera.position, before);
    },
  );
  if (process.env.HEADED === '1') {
    await check(
      'native capture, actual focus transfer and resume clear motion',
      async () => {
        await page.bringToFront();
        await resume();
        await page.locator('#capture-walking-mouse').click();
        await page.waitForFunction(
          () => window.__SCENE_TEST__.snapshot().walking.locked,
          undefined,
          { timeout: 5000 },
        );
        await page.keyboard.down('w');
        const other = await harness.browser.newPage();
        try {
          await other.goto('about:blank');
          await other.bringToFront();
          await page.waitForFunction(
            () => !window.__SCENE_TEST__.snapshot().walking.enabled,
            undefined,
            { timeout: 5000 },
          );
          const paused = (await snapshot()).camera.position;
          await page.waitForTimeout(150);
          assert.deepEqual((await snapshot()).camera.position, paused);
        } finally {
          await other.close();
          await page.bringToFront();
          await page.keyboard.up('w');
        }
        await resume();
        const after = (await snapshot()).camera.position;
        await page.waitForTimeout(200);
        assert.deepEqual((await snapshot()).camera.position, after);
        await page.locator('#capture-walking-mouse').click();
        await page.waitForFunction(
          () => window.__SCENE_TEST__.snapshot().walking.locked,
        );
        await page.keyboard.press('Escape');
        assert.equal((await snapshot()).walking.enabled, false);
        assert.equal((await snapshot()).walking.locked, false);
        return { nativeCapture: true, focusTransfer: true };
      },
    );
  } else {
    report.nativeCapture =
      'Not exercised: run HEADED=1 on an unlocked desktop for native capture/focus validation.';
  }
  await check(
    'walking runtime has no page, asset, console or WebGL errors',
    async () => {
      for (const [kind, errors] of Object.entries(harness.errors))
        assert.deepEqual(errors, [], kind);
      return harness.errors;
    },
  );
  await check('normal walking URL exposes no test globals', async () => {
    const normal = new URL(page.url());
    normal.searchParams.delete('test');
    await page.goto(normal.href, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loading.loaded');
    assert.equal(await page.evaluate(() => '__SCENE_TEST__' in window), false);
  });
} finally {
  report.finishedAt = new Date().toISOString();
  report.errors = harness.errors;
  await writeFile(
    path.join(output, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await harness.close();
}
if (report.checks.some((item) => !item.pass)) process.exitCode = 1;
