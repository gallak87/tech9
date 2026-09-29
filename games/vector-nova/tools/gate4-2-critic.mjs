import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.VN_URL || 'http://127.0.0.1:5194/';
const output = path.resolve(
  process.env.VN_EVIDENCE || '.experiments/gate4-2-critic-round1',
);
await mkdir(output, { recursive: true });
const report = {
  kind: `Independent Gate 4.2 round ${process.env.VN_CRITIC_ROUND || 1}; own short real-key motion/stills`,
  errors: [],
  checks: [],
  views: [],
  runs: {},
  caveat:
    'Hidden Chromium; no foreground performance, audio listening, physical devices, video or full lap claimed.',
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
page.on('pageerror', (e) => report.errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') report.errors.push(m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400) report.errors.push(`${r.status()} ${r.url()}`);
});
const check = (name, pass, detail = {}) =>
  report.checks.push({ name, pass, ...detail });
const snap = () => page.evaluate(() => window.__VN.getSnapshot());
const save = () =>
  writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
async function go(query = '') {
  await page.goto(`${base}${query}`);
  await page.waitForFunction(() => window.__VN?.ready, undefined, {
    timeout: 90000,
  });
}
async function scenario(name) {
  await page.evaluate((name) => window.__VN.loadScenario(name, 91373), name);
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 10, y: 10 }, force: true });
  await page.waitForTimeout(150);
}
async function capture(name) {
  const before = await snap();
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.views.push({
    name,
    before,
    after: await snap(),
    metrics: await page.evaluate(() => window.__VN.getMetrics()),
  });
  await save();
}
async function drive(keys, seconds) {
  const start = await snap();
  for (const key of keys) await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      (target) => window.__VN.getSnapshot().vehicle.time >= target,
      start.vehicle.time + seconds,
      { polling: 'raf', timeout: 30000 },
    );
    return await snap();
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
}
async function until(keys, predicate) {
  for (const key of keys) await page.keyboard.down(key);
  try {
    await page.waitForFunction(predicate, undefined, {
      polling: 'raf',
      timeout: 20000,
    });
    return await snap();
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
}
async function group(name, action) {
  try {
    await action();
  } catch (e) {
    report.checks.push({
      name,
      pass: false,
      harnessFailure: String(e.stack || e),
    });
  } finally {
    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'])
      await page.keyboard.up(key);
    await save();
  }
}
async function fullReview() {
  await group('baseline and feature motion', async () => {
    await go();
    report.build = await page
      .locator('script[type=module]')
      .getAttribute('src');
    if (
      process.env.VN_EXPECTED_BUILD &&
      report.build !== process.env.VN_EXPECTED_BUILD
    )
      throw new Error('Unexpected production candidate: ' + report.build);
    await page.locator('#start').click();
    report.runs.baseline = await drive(['KeyW'], 3.2);
    await capture('baseline-motion');
    check(
      'plain Halcyon has no devices or pickup rules',
      report.runs.baseline.runtime.id === 'magnetic' &&
        (await page.locator('.halcyon-devices').count()) === 0,
    );
    await go('?features=halcyon-pickups');
    report.featureAssets = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => n.includes('/assets/halcyon-')),
    );
    await capture('feature-title');
    await page.locator('#start').click();
    await capture('vector-distant');
    report.runs.feature = await drive(['KeyW'], 3.2);
    await capture('feature-motion');
    check(
      'strip changes actual motion without reserve cost',
      report.runs.feature.vehicle.distance >
        report.runs.baseline.vehicle.distance + 1 &&
        report.runs.feature.vehicle.speed >
          report.runs.baseline.vehicle.speed + 2 &&
        report.runs.feature.vehicle.energy >= 99.9,
      {
        baseline: report.runs.baseline.vehicle,
        feature: report.runs.feature.vehicle,
      },
    );
    check(
      'Halcyon route and assistance preserved',
      Math.abs(report.runs.feature.track.length - 5000) < 1e-6 &&
        report.runs.feature.handling.steeringAssist === 0.3,
    );
  });
  await group('Vector inputs and recovery', async () => {
    await scenario('vector-launch');
    await capture('vector-medium');
    await drive(['KeyW'], 1.1);
    await capture('vector-close');
    let state = await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.vectorRemaining > 0,
    );
    check(
      'Vector activates on drive-over',
      state.runtime.state.vectorRemaining > 0,
    );
    await capture('vector-active');
    const before = await snap();
    state = await drive(['KeyW', 'ShiftLeft'], 0.18);
    check(
      'manual Shift spends reserve during free drive',
      state.vehicle.boosting && state.vehicle.energy < before.vehicle.energy,
      { before: before.vehicle, after: state.vehicle },
    );
    state = await drive(['KeyS'], 0.12);
    check(
      'brake cancels Vector',
      state.runtime.state.vectorRemaining === 0 &&
        state.events.some(
          (e) => e.type === 'pickup-cancel' && e.payload.reason === 'brake',
        ),
    );
    await capture('vector-brake');
    await scenario('vector-launch');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.vectorRemaining > 0,
    );
    await drive(['KeyS'], 0.1);
    await page.keyboard.press('KeyR');
    state = await snap();
    check(
      'manual recovery clears effects and preserves consumed traversal',
      state.runtime.state.vectorRemaining === 0 &&
        state.runtime.state.used['vector-launch'] === 0 &&
        state.vehicle.resetCount > 0 &&
        !state.lap.valid,
      { state },
    );
    state = await drive(['KeyW'], 3.1);
    check(
      'recovery cannot farm used strip',
      state.runtime.state.vectorRemaining === 0 &&
        state.runtime.state.used['vector-launch'] === 0,
    );
    await page.keyboard.press('Escape');
    await page.locator('#restart').click();
    state = await snap();
    check(
      'real restart resets traversal',
      state.runtime.state.used['vector-launch'] === -1 &&
        state.runtime.state.vectorRemaining === 0 &&
        state.vehicle.resetCount === 0,
    );
  });
  await group('Aegis protected and follow-up impact', async () => {
    await scenario('aegis-crown');
    await capture('aegis-medium');
    await drive(['KeyW'], 0.95);
    await capture('aegis-close');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    await capture('aegis-active');
    await page.keyboard.press('Escape');
    const frozen = await snap();
    await page.waitForTimeout(350);
    const paused = await snap();
    check(
      'pause freezes shield and lap',
      paused.mode === 'paused' &&
        paused.runtime.state.aegisRemaining ===
          frozen.runtime.state.aegisRemaining &&
        paused.vehicle.time === frozen.vehicle.time &&
        paused.lap.elapsed === frozen.lap.elapsed,
    );
    await page.locator('#resume').click();
    let state = await until(['KeyW', 'KeyA'], () =>
      window.__VN.getSnapshot().events.some((e) => e.type === 'shield-hit'),
    );
    report.runs.protectedImpact = state;
    check(
      'protected impact consumes shield and retains reserve/separation',
      state.runtime.state.aegisRemaining === 0 &&
        state.vehicle.energy > 99.8 &&
        state.events.some((e) => e.type === 'impact' && e.payload.shielded) &&
        Math.abs(state.vehicle.lateral) <= 11.76,
    );
    await capture('aegis-hit');
    state = await until(['KeyW', 'KeyA'], () =>
      window.__VN
        .getSnapshot()
        .events.some((e) => e.type === 'impact' && !e.payload.shielded),
    );
    report.runs.unprotectedImpact = state;
    check(
      'follow-up impact costs reserve',
      state.vehicle.energy < 97 &&
        state.events.filter((e) => e.type === 'impact').length >= 2,
    );
    await capture('aegis-followup-hit');
  });
  await group('Aegis expiry', async () => {
    await scenario('aegis-crown');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    await drive(['KeyS'], 1);
    const state = await until([], () =>
      window.__VN
        .getSnapshot()
        .events.some(
          (e) => e.type === 'pickup-expire' && e.payload.kind === 'aegis',
        ),
    );
    check('expiry clears shield', state.runtime.state.aegisRemaining === 0);
    await capture('aegis-expiry');
  });
  for (const name of [
    'vector-transit',
    'aegis-corkscrew',
    'vector-sky-exit',
    'vector-canal',
  ])
    await group(`${name} views`, async () => {
      await scenario(name);
      await capture(`${name}-medium`);
      await page.evaluate(() => window.__VN.setCamera('vista'));
      await page.waitForTimeout(150);
      await capture(`${name}-vista`);
      await page.evaluate(() => window.__VN.setCamera('chase'));
      await drive(['KeyW'], 1.5);
      await capture(`${name}-close-motion`);
    });
  await replayChecks();
  await group('inspection after shield', async () => {
    await scenario('aegis-crown');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    await page.evaluate(() => window.__VN.setCamera('inspection'));
    await page.waitForTimeout(150);
    check(
      'inspection hides owned HUD while effects freeze',
      (await snap()).mode === 'inspection' &&
        (await page.locator('.halcyon-devices').evaluate((el) => el.hidden)),
    );
    await capture('inspection-after-shield');
  });
  await group('responsive and low quality', async () => {
    await scenario('aegis-crown');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    await drive(['KeyS'], 0.8);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('portrait-active');
    report.runs.portraitLayout = await page
      .locator('.halcyon-devices')
      .boundingBox();
    await page.setViewportSize({ width: 844, height: 390 });
    await capture('landscape-active');
    report.runs.landscapeLayout = await page
      .locator('.halcyon-devices')
      .boundingBox();
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption('low');
    await page.locator('#volume').fill('0');
    await page.locator('#volume').dispatchEvent('input');
    await page.locator('#motion').check();
    await page.locator('#resume').click();
    await scenario('vector-launch');
    await capture('low-vector-medium');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.vectorRemaining > 0,
    );
    await capture('low-vector-active');
    await scenario('aegis-crown');
    await capture('low-aegis-medium');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    await capture('low-aegis-active');
    const state = await snap();
    check(
      'low muted reduced motion finite',
      state.settings.quality === 'low' &&
        state.settings.volume === 0 &&
        state.settings.reducedMotion &&
        state.camera.position.every(Number.isFinite),
    );
  });
  await group('orbital isolation', async () => {
    await go('?level=orbital&features=halcyon-pickups');
    const state = await snap();
    check(
      'orbital rejects pickup runtime HUD asset',
      state.track.id === 'asterion-orbital-1' &&
        state.runtime.id === 'magnetic' &&
        (await page.locator('.halcyon-devices').count()) === 0 &&
        (await page.evaluate(
          () =>
            !performance
              .getEntriesByType('resource')
              .some((e) => e.name.includes('/assets/halcyon-')),
        )),
    );
    await page.locator('#start').click();
    await drive(['KeyW'], 0.5);
    await capture('orbital-feature-rejected');
  });
  check('no runtime or asset errors', report.errors.length === 0);
}
async function replayChecks() {
  await group('replay and blur', async () => {
    await scenario('vector-launch');
    await drive(['KeyW'], 2);
    const result = await page.evaluate(() => {
      window.__VN.pause();
      const before = window.__VN.getSnapshot();
      const replay = window.__VN.getReplay();
      const after = window.__VN.playReplay(replay);
      const exported = window.__VN.getReplay();
      const reexportInputs = {
        before: replay.inputs.length,
        after: exported.inputs.length,
        exact:
          JSON.stringify(replay.inputs) === JSON.stringify(exported.inputs),
      };
      const rejects = {};
      const preservation = {};
      const deterministicView = () => {
        const snapshot = window.__VN.getSnapshot();
        const { vehicle, runtime, lap, tick, events, mode } = snapshot;
        return {
          vehicle,
          runtime,
          lap,
          tick,
          events,
          mode,
          inputLog: window.__VN.getInputLog(),
          replay: window.__VN.getReplay(),
        };
      };
      for (const field of ['rules', 'initial', 'track']) {
        const invalid = structuredClone(replay);
        if (field === 'rules') invalid.runtime.rulesId += '-wrong';
        if (field === 'initial') invalid.initial.vehicle.energy -= 1;
        if (field === 'track') invalid.trackId += '-wrong';
        const preserved = deterministicView();
        try {
          window.__VN.playReplay(invalid);
          rejects[field] = false;
        } catch {
          rejects[field] = true;
        }
        preservation[field] =
          JSON.stringify(preserved) === JSON.stringify(deterministicView());
      }
      return {
        before,
        after,
        rejects,
        reexportInputs,
        preservation,
        header: {
          version: replay.version,
          trackId: replay.trackId,
          runtime: replay.runtime,
          initial: replay.initial,
        },
      };
    });
    report.runs.replay = result;
    check(
      'rejected replay preserves vehicle runtime race events mode and retained input log',
      Object.values(result.preservation).every(Boolean),
      result.preservation,
    );
    check(
      'replayed run re-exports retained real-key input log',
      result.reexportInputs.exact && result.reexportInputs.before > 0,
      result.reexportInputs,
    );
    check(
      'real-key replay exact and stale/tampered data rejected',
      JSON.stringify(result.before.vehicle) ===
        JSON.stringify(result.after.vehicle) &&
        JSON.stringify(result.before.runtime) ===
          JSON.stringify(result.after.runtime) &&
        Object.values(result.rejects).every(Boolean),
    );
    await page.evaluate(() => window.__VN.resume());
    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('KeyW');
    const before = await snap();
    await page.waitForTimeout(200);
    const after = await snap();
    check(
      'blur event releases input and freezes effects',
      after.mode === 'paused' &&
        after.input.throttle === 0 &&
        after.vehicle.time === before.vehicle.time &&
        after.runtime.state.vectorRemaining ===
          before.runtime.state.vectorRemaining,
    );
    await page.locator('#resume').click();
  });
}
async function targetedReview() {
  await go('?features=halcyon-pickups');
  report.build = await page.locator('script[type=module]').getAttribute('src');
  if (
    process.env.VN_EXPECTED_BUILD &&
    report.build !== process.env.VN_EXPECTED_BUILD
  )
    throw new Error('Unexpected production candidate: ' + report.build);
  report.featureAssets = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => n.includes('/assets/halcyon-')),
  );
  await page.locator('#start').click();
  for (const quality of ['high', 'low']) {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption(quality);
    await page.locator('#volume').fill('0');
    await page.locator('#volume').dispatchEvent('input');
    await page.locator('#resume').click();
    for (const name of ['aegis-crown', 'aegis-corkscrew'])
      await group(`${quality} ${name} stopped exit`, async () => {
        await page.setViewportSize({ width: 1600, height: 900 });
        await scenario(name);
        await capture(`${quality}-${name}-approach`);
        await until(
          ['KeyW'],
          () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
        );
        await capture(`${quality}-${name}-crossing`);
        await drive(['KeyW'], 0.25);
        await capture(`${quality}-${name}-passing-camera`);
        await drive(['KeyW'], 0.35);
        await capture(`${quality}-${name}-past-camera`);
        await scenario(name);
        await until(
          ['KeyW'],
          () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
        );
        await drive(['KeyS'], 1);
        const stopped = await snap();
        check(
          `${quality} ${name} actual brake/stop retains shield`,
          stopped.vehicle.speed === 0 &&
            stopped.runtime.state.aegisRemaining > 0,
          { vehicle: stopped.vehicle },
        );
        for (const [label, width, height] of [
          ['desktop', 1600, 900],
          ['portrait', 390, 844],
          ['landscape', 844, 390],
        ]) {
          await page.setViewportSize({ width, height });
          await page.waitForTimeout(160);
          await capture(`${quality}-${name}-stop-${label}`);
          report.runs[`${quality}-${name}-${label}-HUD`] = {
            rect: await page.locator('.halcyon-devices').boundingBox(),
            text: await page.locator('.halcyon-devices').innerText(),
          };
        }
        await page.setViewportSize({ width: 1600, height: 900 });
        await drive(['KeyW'], 0.6);
        await capture(`${quality}-${name}-leave-stop`);
      });
  }
  await group('portrait active and idle strip road', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await scenario('vector-launch');
    await capture('portrait-vector-approach');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.vectorRemaining > 0,
    );
    await capture('portrait-vector-active');
    await drive(['KeyS'], 0.4);
    await capture('portrait-vector-brake');
  });
  await group('protected follow-up and expiry presentation', async () => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await scenario('aegis-crown');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    let state = await until(['KeyW', 'KeyA'], () =>
      window.__VN.getSnapshot().events.some((e) => e.type === 'shield-hit'),
    );
    check(
      'protected hit remains one charge and preserves reserve',
      state.vehicle.energy > 99.8 && state.runtime.state.aegisRemaining === 0,
    );
    await capture('protected-hit');
    state = await until(['KeyW', 'KeyA'], () =>
      window.__VN
        .getSnapshot()
        .events.some((e) => e.type === 'impact' && !e.payload.shielded),
    );
    check('next hit spends reserve', state.vehicle.energy < 97);
    await capture('unprotected-followup');
    await scenario('aegis-crown');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    await drive(['KeyS'], 1);
    await until([], () =>
      window.__VN
        .getSnapshot()
        .events.some(
          (e) => e.type === 'pickup-expire' && e.payload.kind === 'aegis',
        ),
    );
    await capture('expired-parked-exit');
  });
  await replayChecks();
  for (const [name, query] of [
    ['plain', ''],
    ['orbital', '?level=orbital&features=halcyon-pickups'],
    ['orbital-shape', '?level=orbital&review=shape&features=halcyon-pickups'],
  ])
    await group(`${name} compact smoke`, async () => {
      await go(query);
      await page.setViewportSize({ width: 844, height: 390 });
      await scenario('staging');
      const state = await drive(['KeyW'], 0.5);
      check(
        `${name} excludes pickup runtime HUD and feature resource`,
        state.runtime.id === 'magnetic' &&
          (await page.locator('.halcyon-devices').count()) === 0 &&
          (await page.evaluate(
            () =>
              !performance
                .getEntriesByType('resource')
                .some((e) => e.name.includes('/assets/halcyon-')),
          )),
      );
      await capture(`${name}-compact-smoke`);
    });
  check('no runtime asset or shader errors', report.errors.length === 0);
}

async function corkscrewStopSupplement() {
  await go('?features=halcyon-pickups');
  report.build = await page.locator('script[type=module]').getAttribute('src');
  if (
    process.env.VN_EXPECTED_BUILD &&
    report.build !== process.env.VN_EXPECTED_BUILD
  )
    throw new Error('Unexpected production candidate: ' + report.build);
  await page.locator('#start').click();
  for (const quality of ['high', 'low']) {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.keyboard.press('Escape');
    await page.locator('#quality').selectOption(quality);
    await page.locator('#resume').click();
    await scenario('aegis-corkscrew');
    await until(
      ['KeyW'],
      () => window.__VN.getSnapshot().runtime.state.aegisRemaining > 0,
    );
    await drive(['KeyS'], 1);
    await drive(['KeyW'], 0.3);
    await drive(['KeyS'], 0.5);
    const state = await snap();
    check(
      `${quality} corkscrew real-key stop lies within authored+10..14m`,
      state.vehicle.speed === 0 &&
        state.vehicle.distance >= 1720 &&
        state.vehicle.distance <= 1724,
      { vehicle: state.vehicle },
    );
    for (const [label, width, height] of [
      ['desktop', 1600, 900],
      ['portrait', 390, 844],
      ['landscape', 844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(160);
      await capture(`${quality}-corkscrew-exact-stop-${label}`);
    }
  }
  check('no runtime asset or shader errors', report.errors.length === 0);
}
try {
  if (process.env.VN_CRITIC_FOCUS === 'corkscrew-stop')
    await corkscrewStopSupplement();
  else if (process.env.VN_CRITIC_ROUND === '2') await targetedReview();
  else await fullReview();
} finally {
  await save();
  await browser.close();
  console.log(
    JSON.stringify(
      {
        build: report.build,
        assets: report.featureAssets,
        checks: report.checks.map(({ name, pass, harnessFailure }) => ({
          name,
          pass,
          harnessFailure,
        })),
        errors: report.errors,
        output,
      },
      null,
      2,
    ),
  );
}
if (report.checks.some((c) => !c.pass)) process.exitCode = 1;
