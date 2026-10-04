import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.VN_URL;
if (!base) throw new Error('VN_URL must identify the owned Umbra preview');
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/expansion/umbra/production',
);
await mkdir(output, { recursive: true });
const report = {
  kind: 'Umbra bounded real-input production checks',
  checks: [],
  views: [],
  errors: [],
  limitations: [
    'Hidden browser timing only',
    'No audio listening or physical-device certification',
  ],
};
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') report.errors.push(m.text());
});
const snap = () => page.evaluate(() => window.__VN.getSnapshot());
const check = (name, pass, detail) =>
  report.checks.push({ name, pass: !!pass, detail });
async function scenario(name) {
  await page.evaluate((n) => window.__VN.loadScenario(n, 47219), name);
}
async function capture(name) {
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.views.push({
    name,
    snapshot: await snap(),
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
}
async function keys(key, duration) {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  await page.keyboard.up(key);
}
async function waitMotion(mode) {
  await page.waitForFunction(
    (m) => window.__VN.getSnapshot().runtime.state.mode === m,
    mode,
    { timeout: 12000 },
  );
}
try {
  const url = new URL(base);
  url.search = '?level=umbra';
  await page.goto(url.href);
  await page.waitForFunction(() => window.__VN?.ready, null, {
    timeout: 90000,
  });
  report.build = await page.locator('script[type=module]').getAttribute('src');
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'racing');
  await keys('w', 650);
  check(
    'real throttle accelerates from grid',
    (await snap()).vehicle.speed > 5,
  );
  const before = (await snap()).vehicle.speed;
  await keys('s', 400);
  check('real brake slows craft', (await snap()).vehicle.speed < before);
  await capture('grid');
  for (const section of (await snap()).track.sections) {
    await scenario(`${section.id}-showcase`);
    await capture(`district-${section.id}`);
  }
  for (const name of ['inverted-hold', 'fold-descent', 'hardest-turn']) {
    await scenario(name);
    await keys('w', 400);
    await capture(name);
    const s = await snap();
    check(
      `${name} finite road-local camera`,
      [...s.ship.position, ...s.camera.position, ...s.camera.up].every(
        Number.isFinite,
      ),
    );
  }
  for (let i = 1; i <= 2; i++) {
    for (const kind of ['success', 'imperfect']) {
      await scenario(`jump${i}-${kind}`);
      await page.keyboard.down('w');
      await waitMotion('flight');
      await capture(`jump${i}-${kind}-flight`);
      if (kind === 'imperfect') {
        await page.keyboard.down('d');
        await page.waitForTimeout(80);
        check(
          `jump${i} real airborne steering`,
          (await snap()).vehicle.steer > 0,
        );
        await page.keyboard.up('d');
      }
      await page.waitForFunction(
        () =>
          window.__VN
            .getSnapshot()
            .events.some((e) => e.type === 'jump-transfer'),
        null,
        { timeout: 12000 },
      );
      await page.keyboard.up('w');
      await page.keyboard.press('Escape');
      const s = await snap();
      check(
        `jump${i} ${kind} actual-key swept landing`,
        s.events.some(
          (e) => e.type === 'jump-transfer' && e.payload.outcome === 'landed',
        ),
      );
      const replay = await page.evaluate(() => window.__VN.getReplay());
      const played = await page.evaluate(
        (r) => window.__VN.playReplay(r),
        replay,
      );
      check(
        `jump${i} ${kind} exact replay`,
        JSON.stringify(s.vehicle) === JSON.stringify(played.vehicle) &&
          JSON.stringify(s.runtime.state) ===
            JSON.stringify(played.runtime.state),
      );
      const rejected = await page.evaluate((r) => {
        const before = window.__VN.getSnapshot();
        r.initial.vehicle.energy -= 1;
        try {
          window.__VN.playReplay(r);
          return false;
        } catch {
          const after = window.__VN.getSnapshot();
          return ['vehicle', 'competition', 'runtime'].every(
            (key) => JSON.stringify(before[key]) === JSON.stringify(after[key]),
          );
        }
      }, replay);
      check('invalid replay rejected and prior field retained', rejected);
      await capture(`jump${i}-${kind}-landing`);
    }
    await scenario(`jump${i}-short`);
    await page.keyboard.down('s');
    await waitMotion('recovery');
    await page.keyboard.up('s');
    await page.keyboard.press('Escape');
    const paused = await snap();
    await page.waitForTimeout(160);
    check(
      `jump${i} pause freezes recovery`,
      JSON.stringify((await snap()).runtime.state) ===
        JSON.stringify(paused.runtime.state),
    );
    await page.locator('#resume').click();
    await waitMotion('magnetic');
    const recovered = await snap();
    check(
      `jump${i} real miss recovers stationary`,
      Math.abs(
        recovered.vehicle.distance - recovered.track.jumps[i - 1].recovery,
      ) < 1e-5 &&
        recovered.vehicle.speed === 0 &&
        recovered.vehicle.resetCount === 0,
    );
    await keys('w', 500);
    check(
      `jump${i} recovery releases with throttle`,
      (await snap()).vehicle.distance > recovered.vehicle.distance + 1,
    );
  }
  for (const name of ['lens-tide-test', 'knot-tide-test', 'return-tide-test']) {
    await scenario(name);
    const begin = await snap();
    await keys('a', 120);
    await keys('d', 120);
    await page.keyboard.down('w');
    await keys('Shift', 300);
    await page.keyboard.up('w');
    await keys('s', 180);
    await capture(name);
    check(
      `${name} declared tidal feedback`,
      (await snap()).environment.umbra?.tidal?.active,
    );
    check(
      `${name} actual input recorded`,
      (await page.evaluate(() => window.__VN.getReplay().inputs)).some(
        (e) => e.input.steer !== 0,
      ),
    );
    check(
      `${name} moving response`,
      (await snap()).vehicle.distance > begin.vehicle.distance,
    );
  }
  for (const name of [
    'accretion-intact',
    'accretion-stretch',
    'accretion-fragment',
    'accretion-consume',
  ]) {
    await scenario(name);
    await keys('w', 160);
    await capture(name);
  }
  await page.keyboard.press('Escape');
  const stopped = (await snap()).environment.umbra.accretion;
  await page.waitForTimeout(160);
  check(
    'pause freezes accretion',
    JSON.stringify(stopped) ===
      JSON.stringify((await snap()).environment.umbra.accretion),
  );
  await page.locator('#quality').selectOption('low');
  await page.locator('#motion').check();
  await page.locator('#resume').click();
  await scenario('knot-tide-test');
  await capture('low-reduced-motion-tide');
  await page.evaluate(() => window.__VN.restart());
  const reset = await snap();
  check(
    'restart resets flight and event',
    reset.vehicle.time < 0.2 && reset.runtime.state.mode === 'magnetic',
  );
  check('steering assistance preserved', reset.handling.steeringAssist === 0.3);
  assert.deepEqual(report.errors, []);
  for (const asset of [
    'umbra-observatory.glb',
    'umbra-sky-v2.png',
    'umbra-surfaces-v1.png',
  ]) {
    const pattern = `**/assets/levels/umbra/${asset}`;
    await page.route(pattern, (route) => route.abort('failed'));
    await page.goto(url.href);
    await page
      .locator('.failure')
      .waitFor({ state: 'visible', timeout: 30000 });
    check(
      `selected ${asset} failure removes renderer and offers recovery`,
      (await page.locator('canvas#world').count()) === 0 &&
        (await page.locator('.failure button').count()) === 2 &&
        !(await page.evaluate(() => !!window.__VN?.ready)),
    );
    // Each intentionally aborted owned asset logs an expected network error.
    report.expectedAssetFailureErrors ??= [];
    report.expectedAssetFailureErrors.push(...report.errors.splice(0));
    await page.unroute(pattern);
  }
} catch (e) {
  report.errors.push(e.stack || String(e));
} finally {
  await browser.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        checks: report.checks,
        errors: report.errors,
        views: report.views.map((v) => v.name),
        browser: 'CLOSED',
        report: path.join(output, 'report.json'),
      },
      null,
      2,
    ),
  );
  if (report.errors.length || report.checks.some((c) => !c.pass))
    process.exitCode = 1;
}
