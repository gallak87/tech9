import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.VN_URL || 'http://127.0.0.1:5194/';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate4-2-initial',
);
await mkdir(output, { recursive: true });
const report = {
  scope:
    'Short real-key production checks; hidden Chromium, no video or full lap',
  errors: [],
  checks: [],
  views: [],
  snapshots: {},
  caveat:
    'Capture timings do not certify foreground performance; audio listening and physical devices unverified.',
};
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') report.errors.push(message.text());
});
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
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
  report.snapshots[name] = await snap();
}
async function goto(query = '') {
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
}
async function scenario(name) {
  await page.evaluate((name) => window.__VN.loadScenario(name, 47219), name);
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 10, y: 10 }, force: true });
}
async function drive(keys, seconds) {
  const time = (await snap()).vehicle.time;
  for (const key of keys) await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      (target) => window.__VN.getSnapshot().vehicle.time >= target,
      time + seconds,
      { timeout: 20000, polling: 'raf' },
    );
    return await snap();
  } finally {
    for (const key of keys.reverse()) await page.keyboard.up(key);
  }
}
try {
  await goto();
  report.baselineBuild = await page
    .locator('script[type=module]')
    .getAttribute('src');
  await page.locator('#start').click();
  await page.keyboard.press('Escape');
  await capture('baseline-grid');
  check(
    'plain Halcyon has baseline rules and no pickup HUD',
    (await snap()).runtime.id === 'magnetic' &&
      (await page.locator('.halcyon-devices').count()) === 0,
  );
  await goto('?features=halcyon-pickups');
  report.build = await page.locator('script[type=module]').getAttribute('src');
  await capture('feature-title');
  await page.locator('#start').click();
  await page.keyboard.press('Escape');
  await capture('feature-grid');
  check(
    'explicit feature retains Halcyon route and assistance',
    (await snap()).runtime.id === 'halcyon-pickups' &&
      (await snap()).handling.steeringAssist === 0.3,
  );
  await scenario('vector-launch');
  await capture('vector-approach');
  let state = await drive(['KeyW'], 1.7);
  check(
    'drive-over Vector activates without item input',
    state.events.some(
      (e) => e.type === 'pickup-activate' && e.payload.kind === 'vector',
    ),
    { speed: state.vehicle.speed, distance: state.vehicle.distance },
  );
  await capture('vector-active');
  const replayResult = await page.evaluate(() => {
    window.__VN.pause();
    const before = window.__VN.getSnapshot();
    const replay = window.__VN.getReplay();
    const after = window.__VN.playReplay(replay);
    const mismatch = structuredClone(replay);
    mismatch.runtime.rulesId += '-wrong';
    let rejected = false;
    try {
      window.__VN.playReplay(mismatch);
    } catch {
      rejected = true;
    }
    return { before, after, rejected, initial: !!replay.initial };
  });
  check(
    'live/replay feature vehicle and effect state are exact and mismatch rejected',
    JSON.stringify(replayResult.before.vehicle) ===
      JSON.stringify(replayResult.after.vehicle) &&
      JSON.stringify(replayResult.before.runtime) ===
        JSON.stringify(replayResult.after.runtime) &&
      replayResult.rejected &&
      replayResult.initial,
  );
  await page.evaluate(() => window.__VN.resume());
  state = await drive(['KeyS'], 0.15);
  check(
    'brake cancels active free propulsion',
    state.runtime.state.vectorRemaining === 0 &&
      state.events.some((e) => e.type === 'pickup-cancel'),
  );
  await capture('vector-braked');
  await scenario('aegis-crown');
  await capture('aegis-approach');
  state = await drive(['KeyW'], 1.7);
  check(
    'Aegis activates automatically',
    state.runtime.state.aegisRemaining > 0,
  );
  await capture('aegis-active');
  state = await drive(['KeyW', 'KeyA'], 1.8);
  check(
    'protected impact consumes shield and retains collision feedback',
    state.events.some((e) => e.type === 'impact' && e.payload.shielded) &&
      state.events.some((e) => e.type === 'shield-hit') &&
      state.runtime.state.aegisRemaining === 0,
  );
  await capture('aegis-impact');
  await scenario('aegis-crown');
  await drive(['KeyW'], 1.7);
  await drive(['KeyS'], 1.0);
  state = await drive([], 5.2);
  check(
    'simulation expiry is explicit while parked',
    state.events.some(
      (e) => e.type === 'pickup-expire' && e.payload.kind === 'aegis',
    ),
  );
  await capture('aegis-expired');
  await scenario('vector-transit');
  await capture('bank-placement');
  await scenario('aegis-corkscrew');
  await capture('roll-approach');
  await page.setViewportSize({ width: 390, height: 844 });
  await scenario('vector-launch');
  await capture('portrait');
  await page.setViewportSize({ width: 844, height: 390 });
  await capture('landscape');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.keyboard.press('Escape');
  await page.locator('#quality').selectOption('low');
  await page.locator('#volume').fill('0');
  await page.locator('#volume').dispatchEvent('input');
  await page.locator('#motion').check();
  await page.locator('#resume').click();
  await scenario('vector-launch');
  await capture('low-muted-reduced');
  check(
    'quality/mute/reduced motion settings applied',
    (await snap()).settings.quality === 'low' &&
      (await snap()).settings.volume === 0 &&
      (await snap()).settings.reducedMotion,
  );
  await goto('?level=orbital&features=halcyon-pickups');
  state = await snap();
  check(
    'orbital rejects feature allocation and identity',
    state.track.id === 'asterion-orbital-1' &&
      state.runtime.id === 'magnetic' &&
      (await page.locator('.halcyon-devices').count()) === 0,
  );
  await capture('orbital-rejection');
  check('no runtime or asset errors', report.errors.length === 0);
} catch (error) {
  report.failure = String(error.stack || error);
} finally {
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
  console.log(
    JSON.stringify(
      {
        build: report.build,
        checks: report.checks,
        errors: report.errors,
        failure: report.failure,
        output,
      },
      null,
      2,
    ),
  );
}
if (report.failure || report.checks.some((check) => !check.pass))
  process.exitCode = 1;
