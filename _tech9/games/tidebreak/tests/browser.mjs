import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openScene, samplePerformance, root } from './lib/browser.mjs';
import { coastDistance } from '../src/world/islandDefinition.js';

const output = path.join(
  root,
  '.artifacts',
  process.env.CAPTURE_DIR || 'verification',
);
await mkdir(output, { recursive: true });
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  checks: [],
  captures: [],
  competingLoad:
    'Other desktop workloads are not controlled; no isolated GPU claim.',
};
const scene = await openScene({ mode: 'preview' }),
  { page } = scene;
const held = new Set();
async function keys(wanted = []) {
  for (const key of [...held])
    if (!wanted.includes(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  for (const key of wanted)
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
}
async function snapshot() {
  return scene.snapshot();
}
async function capture(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.captures.push(name);
}
function check(name, value) {
  assert.ok(value, name);
  report.checks.push(name);
  console.log(`PASS ${name}`);
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
async function navigate(points, { dock = false, maxSeconds = 190 } = {}) {
  const start = Date.now();
  let index = 0,
    lastGate = 0;
  while (index < points.length) {
    if (Date.now() - start > maxSeconds * 1000)
      throw new Error(
        `Navigation timed out ${index}/${points.length}: ${JSON.stringify(await snapshot())}`,
      );
    const s = await snapshot(),
      b = s.boat;
    if (s.lap.state === 'finished') {
      await keys();
      return;
    }
    assert.equal(s.lap.state, 'running');
    const target = points[index],
      dx = target[0] - b.x,
      dz = target[1] - b.z,
      d = Math.hypot(dx, dz),
      final = dock && index === points.length - 1;
    if (d < (final ? 2.7 : 8) && (!final || b.planarSpeed < 0.6)) {
      index++;
      continue;
    }
    const error = wrap(Math.atan2(dx, -dz) - b.heading);
    const wanted = [];
    if (error > 0.055) wanted.push('KeyD');
    else if (error < -0.055) wanted.push('KeyA');
    const targetSpeed = final
      ? Math.min(4.5, Math.max(0.35, (d - 1.5) * 0.8))
      : Math.abs(error) > 1.0
        ? 2.8
        : 6.3;
    if (b.speed > targetSpeed + 0.25) wanted.push('KeyS');
    else if (b.speed < targetSpeed - 0.15) wanted.push('KeyW');
    await keys(wanted);
    await page.waitForTimeout(100);
    if (s.lap.nextGate > lastGate) {
      lastGate = s.lap.nextGate;
      console.log(`Gate ${lastGate}: ${s.lap.elapsed.toFixed(1)}s`);
      await capture(`gate-${lastGate}`);
    }
  }
  await keys();
}
try {
  report.environment = scene.environment;
  await page.waitForTimeout(1000);
  await capture('arrival');
  if (process.env.CAPTURE_ONLY === '1') {
    await page.getByRole('button', { name: 'Cast off' }).click();
    await keys(['KeyW']);
    await page.waitForTimeout(2400);
    await keys();
    await capture('under-way');
    report.performance = await samplePerformance(page);
    report.snapshot = await snapshot();
  } else {
    check('starts ready at dock', (await snapshot()).lap.state === 'ready');
    await page.getByRole('button', { name: 'Cast off' }).click();
    await keys(['KeyW']);
    await page.waitForTimeout(1700);
    await page.keyboard.press('KeyP');
    const paused = await snapshot();
    await page.waitForTimeout(350);
    check(
      'pause freezes boat and timer while throttle held',
      (await snapshot()).lap.elapsed === paused.lap.elapsed &&
        (await snapshot()).boat.x === paused.boat.x,
    );
    await page.getByRole('button', { name: 'Resume lap' }).click();
    check(
      'resume clears held throttle',
      (await snapshot()).input.throttle === 0,
    );
    await keys();
    await page.keyboard.press('KeyR');
    check(
      'reset clears route and timer',
      (await snapshot()).lap.nextGate === 0 &&
        (await snapshot()).lap.elapsed === 0,
    );
    await page.getByRole('button', { name: 'Cast off' }).click();
    const angles = [
      60, 30, 10, -10, -30, -60, -80, -100, -120, -150, -170, -190, -210, -240,
      -265,
    ];
    const route = angles.map((deg) => [
      112 * Math.cos((deg * Math.PI) / 180),
      112 * Math.sin((deg * Math.PI) / 180),
    ]);
    await navigate(route);
    check(
      'all three gates crossed in order',
      (await snapshot()).lap.nextGate === 3,
    );
    await navigate([[15, 110]], { dock: true, maxSeconds: 30 });
    // Settle with actual brake/reverse input, never mutate the simulation.
    for (
      let i = 0;
      i < 100 && (await snapshot()).lap.state !== 'finished';
      i++
    ) {
      const b = (await snapshot()).boat;
      await keys(b.speed > 0.45 ? ['KeyS'] : b.speed < -0.45 ? ['KeyW'] : []);
      await page.waitForTimeout(100);
    }
    check(
      'full real-input lap finishes at gentle docking speed',
      (await snapshot()).lap.state === 'finished',
    );
    report.completedLap = await snapshot();
    await capture('result');
    report.performance = await samplePerformance(page);
    await page.getByRole('button', { name: 'Sail again' }).click();
    const retry = await snapshot();
    check(
      'retry resets gates/time/motion and preserves session best',
      retry.lap.nextGate === 0 &&
        retry.lap.elapsed < 0.2 &&
        retry.boat.planarSpeed < 0.01 &&
        retry.lap.best > 0,
    );
    await capture('retry');
    // Miss gate 01 outside the opening, then come back through it correctly.
    await navigate(
      [
        [145, 95],
        [155, 35],
        [155, -12],
      ],
      { maxSeconds: 60 },
    );
    check(
      'crossing outside a gate opening does not count',
      (await snapshot()).lap.nextGate === 0,
    );
    await navigate(
      [
        [137, -22],
        [128, 20],
        [111, 18],
        [111, -12],
      ],
      { maxSeconds: 60 },
    );
    check(
      'missed gate can be recovered with another forward crossing',
      (await snapshot()).lap.nextGate === 1,
    );
    // Drive into visible shore and reverse out using only keyboard input.
    await navigate([[112, 12]], { maxSeconds: 30 });
    let collisionStart = (await snapshot()).boat.collisions;
    for (let i = 0; i < 240; i++) {
      const b = (await snapshot()).boat,
        error = wrap(Math.atan2(-b.x, b.z) - b.heading);
      await keys([
        'KeyW',
        ...(error > 0.04 ? ['KeyD'] : error < -0.04 ? ['KeyA'] : []),
      ]);
      await page.waitForTimeout(100);
      if ((await snapshot()).boat.collisions > collisionStart) break;
    }
    const hit = (await snapshot()).boat;
    check(
      'shore collision blocks visible boat without land penetration',
      hit.collisions > collisionStart && coastDistance(hit.x, hit.z) >= 2.79,
    );
    await capture('shore-contact');
    await keys(['KeyS']);
    await page.waitForTimeout(2700);
    await keys();
    const reversed = (await snapshot()).boat;
    check(
      'reverse escapes collision',
      reversed.speed < -0.2 &&
        Math.hypot(reversed.x - hit.x, reversed.z - hit.z) > 1,
    );
    await page.keyboard.press('KeyR');
    await page.getByRole('button', { name: 'Cast off' }).click();
    await navigate(
      [
        [-55, 113],
        [-112, 32],
        [-118, -23],
        [-130, -23],
        [-125, 14],
      ],
      { maxSeconds: 85 },
    );
    check(
      'out-of-order third gate cannot advance first gate',
      (await snapshot()).lap.nextGate === 0,
    );
    await keys(['KeyW']);
    const other = await scene.browser.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await page.waitForTimeout(400);
    await page.bringToFront();
    await other.close();
    check(
      'losing page focus pauses and clears held input',
      (await snapshot()).lap.state === 'paused' &&
        (await snapshot()).input.throttle === 0,
    );
    await keys();
    for (const quality of ['high', 'ultra', 'balanced']) {
      await page.locator('#quality').selectOption(quality);
      await page.waitForTimeout(200);
      check(
        `${quality} graphics updates owned water budget`,
        (await snapshot()).world.find((w) => w.id === 'tidebreak-ocean')
          .quality === quality,
      );
    }
    await page.setViewportSize({ width: 560, height: 820 });
    await capture('narrow');
    check(
      'narrow layout retains usable menu',
      await page.locator('#primary').isVisible(),
    );
    await page.goto(scene.page.url().split('?')[0]);
    await page.waitForSelector('.loading', { state: 'detached' });
    check(
      'production URL exposes no test hook',
      await page.evaluate(() => typeof window.__SCENE_TEST__ === 'undefined'),
    );
  }
  check(
    'no console/page/request/WebGL errors',
    Object.values(scene.errors).every((a) => a.length === 0),
  );
  report.errors = scene.errors;
} catch (error) {
  report.failure = error.stack;
  report.snapshot = await snapshot().catch(() => null);
  await capture('failure').catch(() => {});
  throw error;
} finally {
  await keys().catch(() => {});
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await scene.close();
  console.log(`Evidence: ${output}`);
}
