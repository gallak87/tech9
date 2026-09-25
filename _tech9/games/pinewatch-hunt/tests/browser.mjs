import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openScene, samplePerformance } from './lib/browser.mjs';
import { pathCenter } from '../src/world/terrain.js';
const out = '.artifacts/verification';
await mkdir(out, { recursive: true });
process.env.HEADED ??= '1';
const scene = await openScene({ mode: 'preview' });
const { page } = scene;
const results = [];
const snapshot = () => page.evaluate(() => window.__HUNT_TEST__.snapshot());
const brief = (s) => ({ ...s, colliders: undefined });
async function check(name, fn) {
  await fn();
  results.push({ name, pass: true });
  console.log('PASS', name);
}
async function hold(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
async function orient(target, pitchToo = true) {
  for (let i = 0; i < 9; i++) {
    const s = await snapshot();
    const dx = target[0] - s.player[0],
      dz = target[2] - s.player[2];
    let yaw = -Math.atan2(dx, -dz) - s.yaw;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const pitch =
      Math.atan2(target[1] - s.player[1], Math.hypot(dx, dz)) - s.pitch;
    if (Math.abs(yaw) > 0.004)
      await hold(
        yaw > 0 ? 'ArrowLeft' : 'ArrowRight',
        Math.max(10, Math.min(900, (Math.abs(yaw) / 0.75) * 1000)),
      );
    if (pitchToo && Math.abs(pitch) > 0.004)
      await hold(
        pitch > 0 ? 'ArrowUp' : 'ArrowDown',
        Math.max(10, Math.min(700, (Math.abs(pitch) / 0.55) * 1000)),
      );
    if (Math.abs(yaw) < 0.009 && (!pitchToo || Math.abs(pitch) < 0.009)) return;
  }
}
async function walkTo(x, z, { quiet = false, stop = 0.5 } = {}) {
  if (quiet) await page.keyboard.down('ShiftLeft');
  for (let i = 0; i < 55; i++) {
    const s = await snapshot();
    const d = Math.hypot(x - s.player[0], z - s.player[2]);
    if (d <= stop) break;
    assert.equal(s.mode, 'playing', JSON.stringify(brief(s)));
    await orient([x, s.player[1], z], false);
    await hold(
      'KeyW',
      Math.min(700, Math.max(40, ((d - stop) / (quiet ? 1.25 : 3.5)) * 1000)),
    );
    if (i === 54)
      throw new Error(
        'Navigation stuck: ' + JSON.stringify(brief(await snapshot())),
      );
  }
  if (quiet) await page.keyboard.up('ShiftLeft');
}
async function approach() {
  await walkTo(pathCenter(8), 8);
  await walkTo(pathCenter(-4), -4, { quiet: true });
}
async function drawRelease({ miss = false, mouse = false } = {}) {
  const s = await snapshot();
  await orient(
    miss ? [s.player[0], s.player[1] + 8, s.player[2] - 8] : s.target,
  );
  if (mouse) await page.mouse.down({ button: 'right' });
  else await page.keyboard.down('KeyQ');
  await page.waitForTimeout(350);
  if (!miss) await orient((await snapshot()).target);
  if (mouse) await page.mouse.down();
  else await page.keyboard.down('Space');
  await page.waitForTimeout(1250);
  if (!miss) {
    await orient((await snapshot()).target);
    await page.screenshot({ path: out + '/aim.png' });
  }
  if (mouse) await page.mouse.up();
  else await page.keyboard.up('Space');
  if (mouse) await page.mouse.up({ button: 'right' });
  else await page.keyboard.up('KeyQ');
  await page.waitForTimeout(300);
}
try {
  await page.waitForTimeout(700);
  await page.screenshot({ path: out + '/intro.png' });
  await check('Visible start enters a fresh hunt', async () => {
    await page.locator('#begin').click();
    await page.waitForTimeout(300);
    assert.equal((await snapshot()).mode, 'playing');
  });
  await check(
    'Real keyboard walk and quiet stalk locate the deer',
    async () => {
      await approach();
      const s = await snapshot();
      assert.ok(s.distance < 16 && s.distance > 10);
      assert.equal(s.animal, 'grazing');
      await page.screenshot({ path: out + '/stalk.png' });
    },
  );
  const performance = await samplePerformance(page, 3500);
  await check(
    'Draw, pause, disabled aiming and cleared held inputs',
    async () => {
      await page.keyboard.down('KeyQ');
      await page.waitForTimeout(100);
      await page.keyboard.down('Space');
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(350);
      await page.keyboard.press('KeyP');
      const a = await snapshot();
      assert.equal(a.mode, 'paused');
      assert.equal(a.draw, 0);
      await page.waitForTimeout(350);
      const b = await snapshot();
      assert.deepEqual(b.player, a.player);
      assert.equal(b.elapsed, a.elapsed);
      assert.equal(b.aiming, false);
      await page.keyboard.up('Space');
      await page.keyboard.up('KeyW');
      await page.keyboard.up('KeyQ');
      await page.locator('#resume').click();
      await page.waitForTimeout(200);
      assert.equal((await snapshot()).moving, false);
    },
  );
  await check(
    'Real aim/draw/release hits, then walking and E retrieve completes hunt',
    async () => {
      await drawRelease();
      let s = await snapshot();
      assert.equal(s.phase, 'retrieve', JSON.stringify(brief(s)));
      await walkTo(s.deer[0], s.deer[2], { stop: 2.2 });
      await page.screenshot({ path: out + '/retrieve.png' });
      await page.keyboard.press('KeyE');
      s = await snapshot();
      assert.equal(s.phase, 'won');
      assert.equal(s.mode, 'result');
      await page.screenshot({ path: out + '/success.png' });
    },
  );
  await check('Retry resets the encounter and held inputs', async () => {
    await page.locator('#restart').click();
    await page.waitForTimeout(150);
    const s = await snapshot();
    assert.equal(s.phase, 'stalk');
    assert.equal(s.arrows, 3);
    assert.equal(s.alert, 0);
    assert.ok(s.distance > 38);
    assert.equal(s.draw, 0);
  });
  await check(
    'Real mouse miss and exhausted arrows lead to recoverable loss',
    async () => {
      for (let i = 0; i < 3; i++)
        await drawRelease({ miss: true, mouse: true });
      const s = await snapshot();
      assert.equal(s.phase, 'lost');
      assert.equal(s.arrows, 0);
      await page.screenshot({ path: out + '/failure.png' });
      await page.locator('#restart').click();
    },
  );
  await check(
    'Noisy close approach alerts the animal and causes escape',
    async () => {
      await walkTo(pathCenter(8), 8);
      await orient((await snapshot()).target, false);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(8500);
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(4300);
      const s = await snapshot();
      assert.equal(s.phase, 'lost', JSON.stringify(brief(s)));
      assert.match(s.message, /deep forest/);
      await page.locator('#restart').click();
    },
  );
  await check('Focus loss cancels aim/draw and movement', async () => {
    await page.keyboard.down('KeyQ');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(100);
    await page.keyboard.down('Space');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const s = await snapshot();
    assert.equal(s.mode, 'paused');
    assert.equal(s.draw, 0);
    assert.equal(s.aiming, false);
    await page.keyboard.up('KeyQ');
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    await page.locator('#resume').click();
  });
  await check(
    'Pointer-lock exit pauses and resume does not fire held draw',
    async () => {
      await page.waitForTimeout(1500);
      await page.locator('#scene').click();
      await page.waitForTimeout(300);
      const locked = await page.evaluate(
        () => document.pointerLockElement !== null,
      );
      assert.ok(locked, 'Pointer capture must be active before exit test');
      await page.evaluate(() => document.exitPointerLock());
      await page.waitForTimeout(200);
      assert.equal((await snapshot()).mode, 'paused');
      await page.locator('#resume').click();
      assert.equal((await snapshot()).arrows, 3);
    },
  );
  await check(
    'Real walking cannot pass through the trailhead post',
    async () => {
      const post = (await snapshot()).colliders.find(
        (c) => c.id === 'trail-post',
      );
      await walkTo(post.x, post.z + 2);
      await orient([post.x, 1, post.z], false);
      await hold('KeyW', 1700);
      const s = await snapshot();
      assert.ok(
        Math.hypot(s.player[0] - post.x, s.player[2] - post.z) >=
          post.radius + 0.31,
      );
    },
  );
  await check('No runtime, network or WebGL errors', async () => {
    assert.deepEqual(scene.errors, {
      console: [],
      page: [],
      requests: [],
      webgl: [],
    });
  });
  await page.keyboard.press('KeyP');
  await page.setViewportSize({ width: 600, height: 800 });
  await page.screenshot({ path: out + '/narrow.png' });
  await writeFile(
    out + '/report.json',
    JSON.stringify(
      {
        environment: scene.environment,
        performance,
        results,
        errors: scene.errors,
        focusTest:
          'Browser blur event injected for focus loss; core gameplay exclusively real keyboard and mouse; pointer lock exited with browser DOM API.',
        final: brief(await snapshot()),
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: results.length,
      performance,
      environment: scene.environment,
    }),
  );
} catch (error) {
  await page.screenshot({ path: out + '/error.png' });
  await writeFile(
    out + '/error.json',
    JSON.stringify(
      {
        error: error.message,
        state: brief(await snapshot()),
        results,
        errors: scene.errors,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await scene.close();
}
