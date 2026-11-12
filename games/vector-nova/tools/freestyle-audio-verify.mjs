import assert from 'node:assert/strict';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import { routeRuntimeProbe, replaceOnce } from './runtime-probe.mjs';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import { createProfileStore } from '../src/progression/profile.js';

const base = process.env.VN_URL;
assert.ok(base, 'VN_URL must select this checkout dev server');
const storage = createMemoryStorage(),
  careers = createCareerSlots({ storage: () => storage, now: () => 1 });
careers.create(1);
createProfileStore(() => careers.storageFor(1)).recordCup('founders');
const seed = Array.from({ length: storage.length }, (_, i) => {
  const key = storage.key(i);
  return [key, storage.getItem(key)];
});
const browser = await launchVerificationBrowser();
let page;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript((values) => {
    for (const [key, value] of values) localStorage.setItem(key, value);
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({ quality: 'low', volume: 0.35 }),
    );
  }, seed);
  // The native world only receives ordinary bounded controls. This response-only
  // probe freezes between assertions and never sets poses, contacts or grades.
  await routeRuntimeProbe(
    context,
    `
      stepFeedback(n, until = '') {
        if (!Number.isInteger(n) || n < 0 || n > 2400) throw Error('Invalid tick count');
        const contacts = audio.getStatus().landing?.triggerCount ?? 0;
        const firstTick = tick;
        __feedbackFrozen = false;
        for (let i = 0; i < n && mode === 'racing'; i++) {
          const controls = window.__feedbackPilot({state:{...state},motion:runtime.snapshot(),pose:runtime.pose(1)});
          advanceTick(controls);
          if (until === 'touchdown' && audio.getStatus().landing.triggerCount > contacts) break;
          if (until === 'miss' && events.some(event => event.type === 'jump-miss' && event.tick >= firstTick)) break;
        }
        __feedbackFrozen = true; prev = {...state}; accumulator = 0;
        return this.readFeedback();
      },
      readFeedback() {
        return { mode, tick, state: {...state}, runtime: runtime.snapshot(),
          practice: structuredClone(freestylePractice), audio: audio.getStatus(),
          reward: audio.getPresentation() };
      },`,
    {
      transform(source) {
        source = replaceOnce(
          source,
          'const errors = [];',
          'const errors = []; let __feedbackFrozen = true;',
        );
        return replaceOnce(
          source,
          'function advanceTick(control) {',
          'function advanceTick(control) { if (__feedbackFrozen) return;',
        );
      },
    },
  );
  page = await context.newPage();
  const errors = collectPageErrors(page);
  const read = () => page.evaluate(() => window.__VN.readFeedback());
  const frames = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const fixed = ({ mode, tick, state, runtime, practice }) => ({
    mode,
    tick,
    state,
    runtime,
    practice,
  });
  async function practice(id = 'transfer-1', airAlignment = true) {
    await page.evaluate(() => {
      const api = window.__VN;
      api.configure({ ...api.getSnapshot().settings, volume: 0.35 });
      api.pause();
    });
    await page.locator('#freestyle-practice-transfer').selectOption(id);
    await page.locator('#freestyle-practice-start').click();
    await page.evaluate(async (align) => {
      const { createTransferPilot } =
        await import('/tools/freestyle-pilot.mjs');
      const pilot = createTransferPilot(window.__VN.getTrack(), {
        reaction: 0.15,
        quantum: 0.25,
        targetSpeed: 'course',
        airAlignment: align,
      });
      window.__feedbackPilot = (frame) => {
        const control = pilot(frame);
        // A deliberately held, bounded sideways flight input misses the bank;
        // the native solver still decides collision, recovery and the verdict.
        return !align && (frame.motion.flight || frame.motion.motion?.flight)
          ? {
              ...control,
              steer: 1,
              aerialPitch: 0,
              aerialYaw: 0,
              aerialRoll: 0,
            }
          : control;
      };
    }, airAlignment);
    await frames();
    assert.equal((await read()).mode, 'racing');
  }
  async function touchdown() {
    const before = await read();
    const contact = await page.evaluate(() =>
      window.__VN.stepFeedback(2400, 'touchdown'),
    );
    assert.equal(
      contact.audio.landing.triggerCount,
      before.audio.landing.triggerCount + 1,
    );
    assert.equal(contact.reward.lastGrade, before.reward.lastGrade);
    const fs = contact.runtime.freestyle ?? contact.runtime.motion.freestyle;
    assert.ok(
      fs.pendingLanding,
      'touchdown sounds while grade is still pending',
    );
    assert.equal(fs.score, 0);
    assert.equal(contact.audio.landing.activeVoices, 1);
    return contact;
  }
  async function complete() {
    await touchdown();
    const completed = await page.evaluate(() => window.__VN.stepFeedback(120));
    assert.equal(completed.mode, 'paused');
    assert.equal(completed.practice.outcome.landed, true);
    assert.equal(completed.practice.notified, true);
    assert.ok(
      ['good', 'great', 'perfect'].includes(completed.reward.lastGrade),
    );
    assert.equal(
      completed.reward.activeVoices,
      1,
      'grade starts on the real credited bank',
    );
    await frames();
    const paused = await read();
    assert.equal(
      paused.audio.audible,
      true,
      'automatic completion preserves the audible reward tail',
    );
    assert.equal(paused.reward.activeVoices, 1);
    assert.deepEqual(
      fixed(paused),
      fixed(completed),
      'auto-pause freezes the native session immediately',
    );
    return paused;
  }
  await page.goto(
    new URL('/?intro=0&dev=2&level=zephyr-skywell&music=0', base).href,
  );
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () => window.__VN?.ready || window.__VN_FRONTEND?.getState().error,
    null,
    { timeout: 120000 },
  );
  assert.ok(
    !(await page.evaluate(() => window.__VN_FRONTEND.getState().error)),
  );
  console.log(
    `Loaded native Freestyle world (${await page.evaluate(() => window.__VN.getSnapshot().mode)})`,
  );
  await page.waitForFunction(
    () => window.__VN.getSnapshot().mode === 'racing',
    null,
    { timeout: 15000 },
  );
  await page.waitForFunction(() => {
    const snapshot = window.__VN.getSnapshot();
    return (
      snapshot.environment.audio.landing.loaded &&
      snapshot.environment.thunder.loaded
    );
  });
  await practice();
  const completed = await complete();
  await page.waitForTimeout(80);
  assert.deepEqual(fixed(await read()), fixed(completed));
  await page.waitForFunction(
    () => {
      const environment = window.__VN.getSnapshot().environment;
      return (
        environment.thunder.activeVoices === 0 &&
        environment.audio.landing.activeVoices === 0
      );
    },
    null,
    { timeout: 2000 },
  );
  await frames();
  const released = await read();
  assert.equal(released.audio.audible, false);
  assert.deepEqual(
    fixed(released),
    fixed(completed),
    'physics, score and timers never move while the real sample releases',
  );
  console.log(
    'PASS · native touchdown precedes grading; completed practice freezes immediately and the reward sample finishes naturally',
  );

  await practice();
  await touchdown();
  await page.evaluate(() => window.__VN.pause());
  await frames();
  const manualPause = await read();
  assert.equal(manualPause.audio.landing.activeVoices, 0);
  assert.equal(manualPause.reward.activeVoices, 0);
  assert.equal(manualPause.audio.audible, false);
  console.log(
    'PASS · ordinary manual pause still stops touchdown and reward voices',
  );

  await practice();
  const beforeMute = await complete();
  await page.evaluate(() => {
    const api = window.__VN;
    api.configure({ ...api.getSnapshot().settings, volume: 0 });
  });
  await frames();
  const muted = await read();
  assert.equal(muted.reward.activeVoices, 0);
  assert.equal(muted.audio.audible, false);
  assert.deepEqual(fixed(muted), fixed(beforeMute));
  console.log(
    'PASS · muting cuts the completed-practice tail without advancing the native session',
  );

  await practice();
  await complete();
  await page.keyboard.press('KeyR');
  await frames();
  const retried = await read();
  assert.equal(retried.mode, 'racing');
  assert.equal(retried.practice.outcome, null);
  assert.equal(retried.audio.landing.activeVoices, 0);
  assert.equal(retried.reward.activeVoices, 0);
  assert.equal(
    retried.runtime.freestyle?.score ?? retried.runtime.motion.freestyle.score,
    0,
  );
  console.log(
    'PASS · retry immediately stops old tails and resets to an unranked native approach',
  );

  await practice('transfer-4', false);
  const beforeMiss = await read();
  const provisional = await page.evaluate(() =>
    window.__VN.stepFeedback(2400, 'miss'),
  );
  assert.equal(
    provisional.mode,
    'racing',
    'provisional contact does not prematurely pause practice',
  );
  assert.equal(provisional.practice.outcome, null);
  assert.equal(
    provisional.reward.lastGrade,
    beforeMiss.reward.lastGrade,
    'provisional miss does not sound a failed grade',
  );
  const failed = await page.evaluate(() => window.__VN.stepFeedback(480));
  assert.equal(failed.mode, 'paused');
  assert.equal(failed.practice.outcome.landed, false);
  assert.equal(failed.practice.outcome.kind, 'freestyle-bank');
  assert.equal(failed.reward.lastGrade, 'miss');
  assert.equal(failed.reward.activeVoices, 1);
  const failedFixed = fixed(failed);
  await frames();
  assert.equal(
    (await read()).reward.activeVoices,
    1,
    'confirmed Miss retains its short feedback tail',
  );
  await page.waitForFunction(
    () => window.__VN.getSnapshot().environment.thunder.activeVoices === 0,
    null,
    { timeout: 2000 },
  );
  await frames();
  assert.deepEqual(fixed(await read()), failedFixed);
  assert.deepEqual(errors, []);
  console.log(
    'PASS · provisional miss keeps native recovery running; one confirmed failed bank sounds Miss over frozen practice',
  );
} catch (error) {
  if (page)
    console.error(
      'Live feedback state:',
      await page
        .evaluate(() => ({
          ready: window.__VN?.ready,
          frontend: window.__VN_FRONTEND?.getState(),
          mode: window.__VN?.getSnapshot().mode,
          errors: window.__VN?.getSnapshot().errors,
        }))
        .catch(() => null),
    );
  throw error;
} finally {
  await browser.close();
}
