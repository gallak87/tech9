import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.VN_URL || 'http://127.0.0.1:5180/';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate3-regression',
);
await mkdir(output, { recursive: true });
const report = {
  kind: 'Orbital production regression; short real-key motion, no critic or full-lap replay',
  errors: [],
  checks: [],
  views: [],
};
const browser = await chromium.launch({
  channel: process.env.VN_BROWSER_CHANNEL || 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
});
page.on('requestfailed', (request) => report.errors.push(request.url()));
page.on('response', (response) => {
  if (response.status() >= 400)
    report.errors.push(`${response.status()} ${response.url()}`);
});
const check = (name, pass, detail = {}) =>
  report.checks.push({ name, pass, ...detail });
const snap = () => page.evaluate(() => window.__VN.getSnapshot());
async function capture(name) {
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.views.push({
    name,
    state: await snap(),
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
}
async function scenario(name) {
  await page.evaluate((value) => window.__VN.loadScenario(value, 47219), name);
  await page.waitForTimeout(100);
}
try {
  await page.goto(`${base}?level=orbital`);
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
  report.build = await page.locator('script[type=module]').getAttribute('src');
  let state = await snap();
  check(
    'Production orbital entry uses the approved route and assistance',
    state.track.id === 'asterion-orbital-1' &&
      Math.abs(state.track.length - 4500) < 0.01 &&
      state.handling.steeringAssist === 0.3 &&
      state.mode === 'title',
  );
  await capture('title');
  await page.locator('#start').click();
  check(
    'Real start enters the grid',
    (await snap()).mode === 'racing' && (await snap()).vehicle.distance === 0,
  );
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1600);
  await page.keyboard.up('KeyW');
  state = await snap();
  check(
    'Grid throttle advances without impact',
    state.vehicle.distance > 25 &&
      !state.events.some((event) => event.type === 'impact'),
  );
  await capture('launch-motion');
  await page.keyboard.press('Escape');
  const paused = await snap();
  await page.waitForTimeout(250);
  state = await snap();
  check(
    'Pause freezes vehicle and lap timer',
    state.mode === 'paused' &&
      state.vehicle.distance === paused.vehicle.distance &&
      state.lap.elapsed === paused.lap.elapsed,
  );
  await page.locator('#resume').click();
  check('Resume works', (await snap()).mode === 'racing');
  await scenario('staging');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await capture('normal-propulsion');
  const reserve = (await snap()).vehicle.energy;
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(400);
  state = await snap();
  check(
    'Boost produces acceleration and spends reserve',
    state.vehicle.boosting && state.vehicle.energy < reserve,
  );
  await capture('boost-propulsion');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await scenario('staging');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1600);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(
    () =>
      window.__VN
        .getSnapshot()
        .events.some(
          (event) => event.type === 'impact' && event.payload.severity > 0.2,
        ),
    undefined,
    { timeout: 4500, polling: 'raf' },
  );
  check(
    'Existing rail contact emits feedback without a render error',
    (await snap()).events.some(
      (event) => event.type === 'impact' && event.payload.severity > 0.2,
    ),
  );
  await capture('contact-feedback');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('KeyW');
  for (const section of state.track.sections) {
    await scenario(`${section.id}-showcase`);
    const before = await snap();
    check(
      `${section.name} starts parked and untimed`,
      before.vehicle.speed === 0 && !before.lap.valid,
    );
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');
    const after = await snap();
    check(
      `${section.name} moves under real controls with a finite camera`,
      after.vehicle.distance > before.vehicle.distance &&
        after.camera.position.every(Number.isFinite) &&
        Math.abs(after.vehicle.lateral) < after.track.width / 2,
    );
    await capture(`section-${section.id}`);
  }
  await scenario('wallride-showcase');
  const parked = await snap();
  await page.waitForTimeout(350);
  check(
    'Wall ride holds at rest',
    (await snap()).vehicle.distance === parked.vehicle.distance &&
      (await snap()).vehicle.speed === 0,
  );
  for (const [key, sign, label] of [
    ['ArrowRight', 1, 'right'],
    ['KeyA', -1, 'left'],
  ]) {
    await scenario('wallride-showcase');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1250);
    const before = await snap();
    await page.keyboard.down(key);
    await page.waitForTimeout(240);
    await page.keyboard.up(key);
    await page.keyboard.up('KeyW');
    const after = await snap();
    const delta =
      after.camera.playerScreenX -
      after.camera.roadScreenX -
      (before.camera.playerScreenX - before.camera.roadScreenX);
    check(
      `Driver-visible ${label} steering on wall ride`,
      delta * sign > 0.002,
      { screenDelta: delta },
    );
    await capture(`wallride-${label}`);
  }
  await scenario('fast-corner');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(1450);
  await page.keyboard.up('KeyS');
  check(
    'Brake stops the craft before docking return',
    (await snap()).vehicle.speed === 0,
  );
  await page.keyboard.press('KeyR');
  state = await snap();
  check(
    'Recovery recentres and invalidates current lap',
    state.vehicle.speed === 0 &&
      state.vehicle.lateral === 0 &&
      state.vehicle.resetCount === 1 &&
      !state.lap.valid,
  );
  await page.locator('#review-toggle').click();
  for (const view of ['top', 'profile', 'perspective']) {
    await page.locator(`[data-overview=${view}]`).click();
    await page.waitForTimeout(100);
    check(
      `${view} review camera is finite and pauses racing`,
      (await snap()).mode === 'overview' &&
        (await snap()).camera.position.every(Number.isFinite),
    );
    await capture(`overview-${view}`);
  }
  await page.locator('#start').click();
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.locator('#resume').click();
  await page.waitForTimeout(100);
  check(
    'Low quality remains playable',
    (await snap()).settings.quality === 'low' &&
      (await snap()).mode === 'racing',
  );
  await capture('low-quality');
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('high');
  await page.locator('#resume').click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    check(
      `${viewport.width}px layout separates circuit controls and telemetry`,
      await page.evaluate(() => {
        const controls = document
          .querySelector('#shape-controls')
          .getBoundingClientRect();
        const telemetry = document
          .querySelector('.top-telemetry')
          .getBoundingClientRect();
        return (
          document.documentElement.scrollWidth <= innerWidth &&
          controls.top >= telemetry.bottom
        );
      }),
    );
    await capture(`responsive-${viewport.width}-race`);
    await page.keyboard.press('Escape');
    check(
      `${viewport.width}px pause has no overlaid HUD or legend`,
      (await page.locator('#hud').isHidden()) &&
        (await page.locator('#legend').isHidden()),
    );
    await page.locator('#motion').scrollIntoViewIfNeeded();
    const box = await page.locator('#motion').boundingBox();
    check(
      `${viewport.width}px final setting is reachable`,
      box.y >= 0 && box.y + box.height <= viewport.height,
    );
    await capture(`responsive-${viewport.width}-pause`);
    await page.locator('#resume').click();
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(base);
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
  state = await snap();
  check(
    'Halcyon route and replay identity are preserved',
    state.track.id === 'halcyon-viaduct-4-compact' &&
      state.version === '0.2.2-gate2-pacing',
  );
  await page.locator('#start').click();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowUp');
  check(
    'Halcyon still drives through real controls',
    (await snap()).vehicle.distance > 6,
  );
  await capture('halcyon');
  report.pass =
    report.errors.length === 0 && report.checks.every((entry) => entry.pass);
} catch (error) {
  report.errors.push(error.stack);
  report.pass = false;
} finally {
  await browser.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        build: report.build,
        checks: report.checks,
        errors: report.errors,
      },
      null,
      2,
    ),
  );
  if (!report.pass) process.exitCode = 1;
}
