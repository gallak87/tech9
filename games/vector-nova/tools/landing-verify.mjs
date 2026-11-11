import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import { replaceOnce, routeRuntimeProbe } from './runtime-probe.mjs';

// Bounded authored-jump checks. The response-only probe advances native fixed
// ticks and freezes between assertions; it never fabricates contacts or poses.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an existing Vite server.');
const browser = await launchVerificationBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = collectPageErrors(page);
await context.addInitScript(() =>
  localStorage.setItem(
    'vector-nova.settings',
    JSON.stringify({ quality: 'low', volume: 0.35, reducedMotion: false }),
  ),
);
await routeRuntimeProbe(
  context,
  `landingCheckStep(n, control = {}, untilTransfer = false) {
    if (!Number.isInteger(n) || n < 0 || n > 1200) throw Error('Invalid bounded tick count');
    __landingFrozen = false;
    cancelCountdown(); mode = 'racing'; ui.setMode(mode);
    const from = tick;
    for (let i = 0; i < n && mode === 'racing'; i++) {
      advanceTick(control);
      if (untilTransfer && events.some(e => e.tick >= from && e.type === 'jump-transfer')) break;
    }
    __landingFrozen = true; prev = { ...state }; accumulator = 0;
    return this.getSnapshot();
  },
  landingCheckRead() {
    const pose = runtime.pose(1);
    return { state: { ...state }, pose: { grounded: pose?.grounded, recovering: pose?.recovering },
      landing: structuredClone(landingFeedback?.read()) };
  },
  landingCheckMeasure(hidden = false) {
    __landingHidden = hidden; view.resetMetrics();
  },`,
  {
    transform(source) {
      source = replaceOnce(
        source,
        'const errors = [];',
        'const errors = []; let __landingFrozen = true, __landingHidden = false;',
      );
      source = replaceOnce(
        source,
        'function advanceTick(control) {',
        'function advanceTick(control) { if (__landingFrozen) return;',
      );
      source = replaceOnce(
        source,
        'const alpha =\n        mode ===',
        'const alpha = __landingFrozen ? 1 :\n        mode ===',
      );
      source = replaceOnce(
        source,
        '      audio.setImmersion(',
        '      if (__landingFrozen) { frame.dt = 0; frame.presentationDt = 0; }\n      audio.setImmersion(',
      );
      source = replaceOnce(
        source,
        '      landingVfx?.update(frame);',
        `      landingVfx?.update(frame);
      if (__landingHidden && landingVfx) landingVfx.group.visible = false;`,
      );
      return source;
    },
  },
);
const snapshot = () => page.evaluate(() => window.__VN.getSnapshot());
const probe = () => page.evaluate(() => window.__VN.landingCheckRead());
const step = (ticks, control = {}, untilTransfer = false) =>
  page.evaluate(
    ({ ticks, control, untilTransfer }) =>
      window.__VN.landingCheckStep(ticks, control, untilTransfer),
    { ticks, control, untilTransfer },
  );
const frames = (count = 2) =>
  page.evaluate(
    (n) =>
      new Promise((resolveFrame) => {
        const next = () =>
          --n <= 0 ? resolveFrame() : requestAnimationFrame(next);
        requestAnimationFrame(next);
      }),
    count,
  );
async function scenario(name) {
  await page.evaluate((value) => window.__VN.loadScenario(value, 7), name);
  await step(0);
  await frames();
  const state = await snapshot();
  assert.equal(
    state.environment.landing.visible,
    false,
    'scenario clears old glow',
  );
  assert.equal((await probe()).landing.burst, null);
  return state;
}
const transfer = (state) =>
  state.events.find((event) => event.type === 'jump-transfer');
const triggerCount = (state) =>
  state.environment.audio.landing?.triggerCount ?? 0;

try {
  const url = new URL('/?level=saffron&capture=1&intro=0&music=0', base);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__VN?.ready, null, {
    timeout: 120000,
  });
  await page.locator('#start').click();
  await step(0);
  await page.waitForFunction(
    () => window.__VN.getSnapshot().environment.audio.landing !== null,
    null,
    { timeout: 15000 },
  );
  await frames();
  assert.equal((await snapshot()).environment.audio.audible, true);

  const initial = await scenario('jump2-success');
  const landed = await step(900, { throttle: 1, steer: 0, boost: false }, true);
  assert.equal(
    transfer(landed)?.payload.outcome,
    'landed',
    JSON.stringify(landed.events),
  );
  // Actual support can follow transfer by one solver tick. Do not invent it.
  for (let i = 0; i < 12 && !(await probe()).landing.contact; i++)
    await step(1);
  await step(23);
  await frames();
  const seated = await snapshot();
  const native = await probe();
  assert.equal(native.pose.grounded, true);
  assert.equal(native.landing.supported, true);
  assert.equal(seated.environment.landing.visible, true);
  assert.ok(
    seated.environment.landing.age > 0,
    'inspect inside the seating pulse',
  );
  assert.equal('grade' in seated.environment.landing, false);
  assert.equal(
    triggerCount(seated) - triggerCount(initial),
    1,
    'one real landing cue',
  );
  assert.ok(!seated.events.some((event) => event.type === 'road-recovery'));
  console.log(
    'PASS · native Saffron transfer, supported neutral seating, one landing cue',
  );

  const fixed = await probe();
  await page.evaluate(() => window.__VN.pause());
  await frames(10);
  const paused = await snapshot();
  assert.equal(paused.mode, 'paused');
  assert.deepEqual(
    await probe(),
    fixed,
    'pause freezes native state and landing clock',
  );
  assert.equal(paused.environment.landing.age, seated.environment.landing.age);
  assert.equal(triggerCount(paused), triggerCount(seated));
  console.log('PASS · pause freezes seating and does not repeat its cue');

  await step(0);
  await frames();
  const metrics = [];
  for (const quality of ['low', 'high']) {
    await page.evaluate((value) => {
      const api = window.__VN;
      api.configure({ ...api.getSnapshot().settings, quality: value });
    }, quality);
    await frames(15);
    for (const hidden of [true, false]) {
      await page.evaluate(
        (value) => window.__VN.landingCheckMeasure(value),
        hidden,
      );
      await frames(12);
      await page.evaluate(
        (value) => window.__VN.landingCheckMeasure(value),
        hidden,
      );
      await frames(45);
      assert.deepEqual(
        await probe(),
        fixed,
        'matched measurement retains exact native state',
      );
      metrics.push({
        quality,
        landing: hidden ? 'off' : 'on',
        ...(await page.evaluate(() => window.__VN.getMetrics())),
      });
    }
  }
  for (const quality of ['low', 'high']) {
    const off = metrics.find(
      (entry) => entry.quality === quality && entry.landing === 'off',
    );
    const on = metrics.find(
      (entry) => entry.quality === quality && entry.landing === 'on',
    );
    assert.ok(on.frames >= 40 && off.frames >= 40);
    assert.ok(on.calls > off.calls && on.triangles > off.triangles);
    assert.equal(
      on.geometries,
      off.geometries,
      'toggling reuses the existing pool',
    );
    assert.equal(on.textures, off.textures);
    console.log(
      JSON.stringify({
        quality,
        viewport: on.viewport,
        gpu: on.gpu,
        on: {
          frames: on.frames,
          calls: on.calls,
          triangles: on.triangles,
          frameMs: on.frameMs,
          estimatedGpuMiB: on.estimatedGpuMiB,
        },
        off: {
          frames: off.frames,
          calls: off.calls,
          triangles: off.triangles,
          frameMs: off.frameMs,
          estimatedGpuMiB: off.estimatedGpuMiB,
        },
        delta: {
          calls: on.calls - off.calls,
          triangles: on.triangles - off.triangles,
          estimatedGpuMiB: on.estimatedGpuMiB - off.estimatedGpuMiB,
        },
        timingNote: on.timingNote,
      }),
    );
  }
  if (process.env.VN_EVIDENCE) {
    const output = resolve(process.env.VN_EVIDENCE);
    await mkdir(output, { recursive: true });
    const path = resolve(output, 'landing-high.png');
    await page.screenshot({ path });
    console.log(`SCREENSHOT ${path}`);
  }

  const missedBefore = await scenario('jump3-short');
  const missed = await step(
    1200,
    { throttle: 0, steer: 0, boost: false },
    true,
  );
  assert.ok(
    transfer(missed),
    'short launch reaches its normal transfer/recovery decision',
  );
  assert.notEqual(
    transfer(missed).payload.outcome,
    'landed',
    'short jump is the recovery fixture',
  );
  await frames();
  assert.equal((await snapshot()).environment.landing.visible, false);
  assert.equal(
    triggerCount(await snapshot()),
    triggerCount(missedBefore),
    'recovery has no celebration',
  );
  console.log('PASS · short-jump recovery produces no landing wash or cue');

  await scenario('staging');
  assert.deepEqual(errors, [], 'no browser errors');
  assert.deepEqual((await snapshot()).errors, [], 'no runtime errors');
  console.log(
    'PASS · scenario reset clears the seating envelope; no runtime/browser errors',
  );
} finally {
  await context.close();
  await browser.close();
}
