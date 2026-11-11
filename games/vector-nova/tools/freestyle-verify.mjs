import assert from 'node:assert/strict';
import {
  freestyleLandingGrade,
  FREESTYLE_GRADES,
} from '../src/freestyle/arcade.js';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import {
  CAREER_SLOTS_KEY,
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import { createProfileStore } from '../src/progression/profile.js';

// Earned rewards/cups use the real progression reducer. Founders opens Skywell;
// its own course finish remains unearned until the native run below. The full
// fleet keeps the established landing gesture on its existing hull.
const storage = createMemoryStorage();
const careers = createCareerSlots({ storage: () => storage, now: () => 1 });
careers.create(1);
const profile = createProfileStore(() => careers.storageFor(1));
for (let i = 0; i < 24; i++)
  profile.recordRace({ id: `fixture-${i}`, position: 1 });
for (const cup of ['founders', 'frontier', 'horizon', 'apex'])
  profile.recordCup(cup);
profile.recordTrial('halcyon', true);
profile.recordTrial('nacre', true);
assert.equal(profile.snapshot().state.cups.includes('founders'), true);
assert.equal(
  profile.snapshot().state.finishedCourses.includes('zephyr-skywell'),
  false,
);
const seed = Array.from({ length: storage.length }, (_, i) => {
  const key = storage.key(i);
  return [key, storage.getItem(key)];
});
const browser = await launchVerificationBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = collectPageErrors(page);
await page.addInitScript(
  ({ values, registryKey }) => {
    // A later navigation must preserve real course finishes and ranked records,
    // rather than replacing the active career with its initial fixture again.
    if (localStorage.getItem(registryKey) === null)
      for (const [key, value] of values) localStorage.setItem(key, value);
    localStorage.setItem(
      'vector-nova.settings',
      // Chromium is host-muted; an enabled effects mix still exercises real cues.
      JSON.stringify({ quality: 'low', volume: 0.35 }),
    );
  },
  { values: seed, registryKey: CAREER_SLOTS_KEY },
);
// Fixed ticks still run the live native session with bounded normalized input.
// This response-only hook freezes between assertions, never changes poses,
// contacts or outcomes, and is absent from the application and its builds.
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch();
  let source = await response.text();
  for (const anchor of [
    'const errors = [];',
    'function advanceTick(control) {',
    'getSnapshot() {',
  ])
    assert.ok(
      source.includes(anchor),
      `the maintained fixed-step hook is present: ${anchor}`,
    );
  source = source.replace(
    'const errors = [];',
    'const errors = []; let __fsFrozen = false;',
  );
  source = source.replace(
    'function advanceTick(control) {',
    'function advanceTick(control) { if (__fsFrozen) return;',
  );
  source = source.replace(
    'getSnapshot() {',
    `stepFreestyle(n, driver) {
    __fsFrozen=false;cancelCountdown();mode='racing';ui.setMode(mode);
    for(let i=0;i<Math.min(n,2400)&&mode==='racing';i++)
      advanceTick(typeof driver==='function'?driver({state:{...state},motion:runtime.snapshot(),pose:runtime.pose(1),track}):driver);
    __fsFrozen=true;return this.getSnapshot();
  },getSnapshot() {`,
  );
  await route.fulfill({ response, body: source });
});
const read = () => page.evaluate(() => window.__VN.getSnapshot());
const motion = (snapshot) =>
  snapshot.runtime.state.motion ?? snapshot.runtime.state;
const renderFrame = () =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
async function padButton(index) {
  await page.evaluate((i) => {
    window.__testPad.buttons[i] = { pressed: true, value: 1 };
  }, index);
  await page.waitForTimeout(80);
  await page.evaluate((i) => {
    window.__testPad.buttons[i] = { pressed: false, value: 0 };
  }, index);
  await page.waitForTimeout(80);
}
async function focusByPad(selector) {
  for (let i = 0; i < 30; i++) {
    if (
      await page
        .locator(selector)
        .evaluate((node) => node === document.activeElement)
    )
      return;
    await padButton(13);
  }
  assert.fail(`Controller cannot reach ${selector}`);
}
try {
  const url = new URL(
    '/?intro=0&level=zephyr-skywell&music=0',
    process.env.VN_URL ?? 'http://127.0.0.1:5213',
  );
  await page.goto(url.href);
  await page.locator('[data-action="launch"]').waitFor();
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'menu entry constructs no world',
  );
  assert.match(await page.locator('#front-shell').innerText(), /Freestyle/i);
  assert.doesNotMatch(
    await page.locator('[data-action="freestyle"]').textContent(),
    /Pilot/i,
  );
  assert.match(
    await page.locator('.freestyle-guide').innerText(),
    /WASD.*↑ \/ ↓.*← \/ →.*Q \/ E/s,
  );
  assert.match(
    await page.locator('.freestyle-pad-guide').innerText(),
    /right stick.*pitch \/ roll.*X \/ Y.*flat-spin/s,
  );
  await page.locator('[data-action="settings"]').click();
  assert.match(
    await page.locator('.settings-layout > .keyboard-guide').innerText(),
    /↑.*↓.*Pitch.*←.*→.*Roll/s,
  );
  assert.match(
    await page.locator('.controller-guide').innerText(),
    /Right stick.*Pitch.*Roll.*X \/ Y.*Flat spin/s,
  );
  await page.locator('[data-action="settings-back"]').click();
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().preload.ready === 4,
    null,
    { timeout: 60000 },
  );
  await page.locator('[data-action="launch"]').press('Enter');
  await page.waitForFunction(
    () =>
      window.__VN?.ready && window.__VN_FRONTEND.getState().screen === 'race',
    null,
    { timeout: 90000 },
  );
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'racing');
  await renderFrame();
  const boot = await read();
  assert.equal(boot.environment.audio.audible, true);
  assert.equal(boot.environment.thunder.type, 'freestyle');
  assert.equal(boot.track.name, 'Zephyr Skywell');
  assert.equal(motion(boot).equipment, undefined);
  assert.equal(await page.locator('.equipment-hud').count(), 0);
  await page.evaluate(() => window.__VN.stepFreestyle(1, {}));
  console.log('PASS · Freestyle entry, Zephyr biome, equipment disabled');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  const groundInput = (await read()).input;
  assert.equal(groundInput.throttle, 0);
  assert.equal(groundInput.brake, 0);
  assert.equal(groundInput.steer, 0);
  const grounded = await page.evaluate(
    (control) => window.__VN.stepFreestyle(30, control),
    groundInput,
  );
  assert.equal(
    Math.hypot(...motion(grounded).freestyle.angular),
    0,
    'arrows do not rotate a supported ship',
  );
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');

  assert.equal(await page.locator('.fs-practice, .fs-diagnostics').count(), 0);
  assert.equal(
    await page
      .locator(
        '.fs-approach, .fs-receiver, .fs-catch, .fs-alignment, .fs-speed',
      )
      .count(),
    0,
  );
  await page.evaluate(() => window.__VN.pause());
  assert.equal(await page.locator('#freestyle-practice-transfer').count(), 0);
  assert.equal(
    await page.locator('#restart').isVisible(),
    true,
    'full-run Restart remains available',
  );
  await page.locator('#restart').click();
  await page.evaluate(() => window.__VN.stepFreestyle(1, {}));
  assert.equal((await read()).freestylePractice, null);
  assert.equal(motion(await read()).freestyle.invalid, false);
  console.log(
    'PASS · compact production scorecard, no practice menu, and valid full-run Restart',
  );

  // Exercise actual DOM keyboard events, not calls into the input reader.
  for (const [keys, expected] of [
    [
      ['ArrowLeft', 'ArrowUp', 'KeyQ', 'KeyW'],
      {
        aerialRoll: -1,
        aerialPitch: 1,
        aerialYaw: 1,
        boost: false,
        throttle: 1,
        steer: 0,
        brake: 0,
      },
    ],
    [
      ['ArrowRight', 'ArrowDown', 'KeyE', 'Space'],
      {
        aerialRoll: 1,
        aerialPitch: -1,
        aerialYaw: -1,
        airbrake: true,
        throttle: 0,
        brake: 0,
        steer: 0,
      },
    ],
    [
      ['ShiftLeft'],
      { aerialRoll: 0, aerialPitch: 0, aerialYaw: 0, boost: true },
    ],
    [
      ['KeyW', 'KeyA'],
      { aerialRoll: 0, aerialPitch: 0, aerialYaw: 0, throttle: 1, steer: -1 },
    ],
  ]) {
    await page.evaluate(() => {
      window.__VN.loadScenario('jump1-success');
      window.__VN.stepFreestyle(1, {});
    });
    for (const key of keys) await page.keyboard.down(key);
    const input = (await read()).input;
    for (const [axis, value] of Object.entries(expected))
      assert.equal(input[axis], value, axis);
    for (let i = 1; i <= 4; i++) assert.equal(input[`equipment${i}`], false);
    const turned = await page.evaluate(
      (control) => window.__VN.stepFreestyle(100, control),
      input,
    );
    if (!Math.hypot(input.aerialRoll, input.aerialPitch, input.aerialYaw))
      assert.equal(Math.hypot(...motion(turned).freestyle.angular), 0);
    else
      assert.ok(
        Math.hypot(...motion(turned).flight.angularVelocity) > 0.1,
        'held axes turn the actual native hull',
      );
    if (
      input.aerialRoll === -1 &&
      input.aerialPitch === 1 &&
      input.aerialYaw === 1
    ) {
      const partialFlight = motion(turned).freestyle.flight;
      assert.equal(
        partialFlight.tricks.length,
        0,
        'this is a partial turn, not a completed trick',
      );
      assert.ok(
        partialFlight.rotationPoints > 0,
        'real held rotation earns points before a full turn',
      );
      assert.equal(
        motion(turned).freestyle.score,
        0,
        'air points stay unbanked before touchdown',
      );
      await renderFrame();
      const floating = page.locator('.freestyle-air-readout');
      assert.equal(await floating.isVisible(), true);
      assert.equal(
        await floating.evaluate((node) => !!node.closest('.freestyle-hud')),
        false,
        'air score floats over the ship instead of living in the left scorecard',
      );
      assert.equal(await page.locator('.fs-charge').isVisible(), true);
      assert.match(
        await page.locator('.fs-air-score').innerText(),
        /AIR SCORE/,
      );
      const partialAirScore = Number(
        (await page.locator('.fs-air-score strong').innerText()).replaceAll(
          ',',
          '',
        ),
      );
      assert.ok(
        partialAirScore > 0,
        'the live counter already shows a partial rotation award',
      );
      const anchor = (await read()).environment.freestyleAir;
      assert.equal(anchor.visible, true);
      assert.ok(
        anchor.y < anchor.shipY,
        'the score anchor sits above the projected hull',
      );
      assert.ok(
        Math.abs(anchor.x - anchor.shipX) < 120,
        'the score follows the ship across the view',
      );
      const floatingBounds = await floating.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { centreX: box.left + box.width / 2, bottom: box.bottom };
      });
      assert.ok(Math.abs(floatingBounds.centreX - anchor.x) < 2);
      assert.ok(Math.abs(floatingBounds.bottom - anchor.y) < 2);
      const charge = await page
        .locator('.fs-charge b')
        .evaluate((node) =>
          Number(node.style.transform.match(/scaleX\(([^)]+)\)/)?.[1]),
        );
      assert.ok(
        charge > 0 && charge <= 1,
        'a real partial turn fills the rotation charge',
      );
      const growing = await page.evaluate(
        (control) => window.__VN.stepFreestyle(30, control),
        input,
      );
      assert.equal(motion(growing).freestyle.flight.tricks.length, 0);
      assert.ok(
        motion(growing).freestyle.flight.rotationPoints >
          partialFlight.rotationPoints,
        'holding the same rotation continues to earn before trick completion',
      );
      assert.equal(motion(growing).freestyle.score, 0);
      await renderFrame();
      assert.ok(
        Number(
          (await page.locator('.fs-air-score strong').innerText()).replaceAll(
            ',',
            '',
          ),
        ) > partialAirScore,
      );
      const completed = await page.evaluate(
        (control) => window.__VN.stepFreestyle(150, control),
        input,
      );
      assert.ok(
        motion(completed).freestyle.flight?.tricks.length > 0,
        'held compound rotation completes a real trick',
      );
      assert.ok(
        completed.events.some((event) => event.type === 'freestyle-trick'),
      );
      assert.equal(
        motion(completed).freestyle.score,
        0,
        'completed tricks are also provisional until landing',
      );
      await renderFrame();
      assert.match(
        await page.locator('.fs-trick').innerText(),
        /Corkscrew.*\+/,
      );
      assert.equal(
        (await read()).environment.thunder.lastCue,
        'trick:corkscrew',
      );
      const beforePause = await read();
      const pausedReadout = await page
        .locator('.fs-air-score strong')
        .textContent();
      await page.evaluate(() => window.__VN.pause());
      await renderFrame();
      const paused = await read();
      assert.equal(paused.mode, 'paused');
      assert.equal(
        motion(paused).freestyle.clock,
        motion(beforePause).freestyle.clock,
      );
      assert.equal(
        motion(paused).freestyle.flight.rotationPoints,
        motion(beforePause).freestyle.flight.rotationPoints,
      );
      assert.equal(
        await page.locator('.fs-air-score strong').textContent(),
        pausedReadout,
      );
      assert.equal(await floating.isVisible(), false);
      assert.equal(paused.environment.freestyleAir.visible, false);
      assert.equal(
        paused.environment.freestyleAir.x,
        null,
        'pause clears the screen anchor',
      );
      assert.equal(paused.environment.thunder.activeVoices, 0);
      await page.locator('#resume').click();
      for (const key of keys) await page.keyboard.up(key);
      const releasedInput = (await read()).input;
      assert.equal(releasedInput.aerialRoll, 0);
      assert.equal(releasedInput.aerialPitch, 0);
      assert.equal(releasedInput.aerialYaw, 0);
      const released = await page.evaluate(
        (control) => window.__VN.stepFreestyle(10, control),
        releasedInput,
      );
      assert.equal(
        motion(released).freestyle.flight.rotationPoints,
        motion(beforePause).freestyle.flight.rotationPoints,
        'releasing the directions stops authoritative rotation earnings immediately',
      );
      assert.equal(motion(released).freestyle.score, 0);
    }
    for (const key of keys) await page.keyboard.up(key);
  }
  console.log(
    'PASS · compound held keys, fine trim, boost separation and native hull rotation',
  );

  await page.evaluate(() => {
    window.__testPad = {
      id: 'freestyle-verifier',
      index: 0,
      mapping: 'standard',
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__testPad],
    });
  });
  await page.waitForFunction(() => window.__VN.getSnapshot().gamepadPresent);
  await page.evaluate(() => {
    window.__testPad.axes = [0.4, 0, 0.6, -0.9];
    window.__testPad.buttons[2] = { pressed: true, value: 1 };
  });
  const padInput = (await read()).input;
  assert.ok(
    padInput.steer > 0.2 &&
      padInput.aerialPitch > 0.8 &&
      padInput.aerialRoll > 0.5,
  );
  assert.equal(
    padInput.aerialYaw,
    1,
    'X flat-spins left independently of right-stick roll',
  );
  assert.equal(padInput.boost, false);
  await page.evaluate(() => {
    window.__testPad.axes = [0, 0, 0, 0];
    window.__testPad.buttons[2] = { pressed: false, value: 0 };
  });
  console.log(
    'PASS · independent controller steering, right-stick pitch/roll and X/Y flat spins',
  );

  let snapshot;
  const careerBeforeRun = await page.evaluate(
    () => window.__VN_FRONTEND.getState().career.state,
  );

  await page.evaluate(async () => {
    const { createTransferPilot } = await import('/tools/freestyle-pilot.mjs');
    window.__fsPilot = createTransferPilot(window.__VN.getTrack(), {
      reaction: 0.15,
      quantum: 0.25,
      targetSpeed: 'course',
    });
    window.__VN.restart();
    window.__VN.stepFreestyle(1, window.__fsPilot);
  });
  let observedBanks = 0;
  for (let i = 0; i < 320; i++) {
    snapshot = await page.evaluate(() =>
      window.__VN.stepFreestyle(30, window.__fsPilot),
    );
    const legs = motion(snapshot).freestyle.legs;
    if (legs.length > observedBanks) {
      observedBanks = legs.length;
      const leg = legs.at(-1);
      const grade = freestyleLandingGrade(leg);
      await renderFrame();
      assert.equal(
        await page.locator('.fs-grade').textContent(),
        FREESTYLE_GRADES[grade].label,
      );
      assert.equal(
        await page.locator('.freestyle-payoff').isVisible(),
        true,
        'a real full-run bank shows its grade and score payoff',
      );
      const presented = await read();
      assert.equal(presented.environment.freestyleCatch.grade, grade);
      assert.equal(presented.environment.freestyleCatch.contactId, leg.id);
      assert.equal(
        presented.environment.freestyleAir.visible,
        false,
        'banked landings hide the provisional readout',
      );
      assert.equal(presented.environment.thunder.lastGrade, grade);
    }
    if (motion(snapshot).freestyle.result) break;
  }
  assert.equal(
    observedBanks,
    5,
    'all five real bank grades reach the public HUD, VFX and audio',
  );
  const result = motion(snapshot).freestyle.result;
  assert.ok(result, 'native full run must reach the finish');
  assert.equal(result.landed, 5);
  assert.ok(result.legs.every((leg) => leg.landed));
  assert.ok(
    result.legs.some((leg) => leg.clean),
    'settled arrivals retain their clean bonus',
  );
  assert.equal(result.bestChain, 5);
  assert.equal(result.playerValid, true);
  assert.ok(
    result.score >= 15000,
    'five credited landings earn at least the base chain score',
  );
  assert.equal(
    result.score,
    result.legs.reduce((sum, leg) => sum + leg.bank, 0),
  );
  assert.equal(
    snapshot.events.filter((e) => e.type === 'jump-launch').length,
    5,
  );
  assert.equal(
    snapshot.events.filter((e) => e.type === 'road-recovery').length,
    0,
  );
  assert.equal(
    snapshot.events.filter(
      (e) => e.type === 'pickup-activate' && e.payload.kind === 'vector',
    ).length,
    3,
  );
  let airborne = false;
  const airborneImpacts = [];
  for (const event of snapshot.events) {
    if (event.type === 'jump-launch') airborne = true;
    if (event.type === 'impact' && airborne) airborneImpacts.push(event);
    if (['jump-transfer', 'jump-miss'].includes(event.type)) airborne = false;
  }
  assert.deepEqual(
    airborneImpacts,
    [],
    'every scored catch must remain physically clean',
  );
  const careerAfterRun = await page.evaluate(
    () => window.__VN_FRONTEND.getState().career.state,
  );
  const earnedProgress = { Gold: 5, Silver: 4, Bronze: 3, Complete: 1 }[
    result.medal
  ];
  assert.equal(careerAfterRun.points, careerBeforeRun.points + earnedProgress);
  assert.equal(careerAfterRun.finishes, careerBeforeRun.finishes + 1);
  assert.equal(
    await page
      .locator('.race-reward-progress:not(.course-result-progress) > h3')
      .textContent(),
    `+${earnedProgress} race progress`,
  );
  console.log(
    `PASS · native five-transfer chain from rest, ${result.score} points, no resets or airborne impacts`,
  );
  await page.locator('[data-action="change"]').click();
  await page.locator('[data-action="quick-race"]').click();
  await page.locator('[data-action="settings"]').click();
  assert.match(
    await page.locator('.settings-layout > .keyboard-guide').innerText(),
    /WASD \/ Arrows/,
  );
  assert.match(
    await page.locator('.controller-guide').innerText(),
    /Equipment 1 \/ 2 \/ 3 \/ 4/,
  );
  assert.doesNotMatch(
    await page.locator('.controller-guide').innerText(),
    /Flat spin/,
  );
  await page.locator('[data-action="settings-back"]').click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () =>
      window.__VN?.ready && window.__VN_FRONTEND.getState().screen === 'race',
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__VN.stepFreestyle(1, {}));
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  const raceInput = (await read()).input;
  assert.equal(raceInput.throttle, 1);
  assert.equal(raceInput.steer, 1);
  assert.equal('aerialRoll' in raceInput, false);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  await page.evaluate(() => {
    window.__testPad.axes = [0, 0, 0.9, -0.9];
  });
  const racePad = (await read()).input;
  assert.equal(racePad.throttle, 0);
  assert.equal(racePad.brake, 0);
  assert.equal(racePad.steer, 0);
  assert.equal('aerialPitch' in racePad, false);
  assert.equal('aerialYaw' in racePad, false);
  assert.equal('aerialRoll' in racePad, false);
  console.log(
    'PASS · ordinary keyboard/controller driving and Settings hints retain their existing layout',
  );
  url.searchParams.set('dev', '1');
  await page.goto(url.href);
  await page.locator('[data-action="launch"]').waitFor();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () =>
      window.__VN?.ready && window.__VN_FRONTEND.getState().screen === 'race',
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__VN.stepFreestyle(1, {}));
  await page.evaluate(() => {
    window.__testPad = {
      id: 'freestyle-verifier',
      index: 0,
      mapping: 'standard',
      connected: true,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__testPad],
    });
  });
  await page.waitForFunction(() => window.__VN.getSnapshot().gamepadPresent);
  const rankedRecordsBeforePractice = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.includes('vector-nova.freestyle.v2.'))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  );
  // Developer-only practice controls must be reachable through the shared pad menu.
  await page.evaluate(() => window.__VN.pause());
  await focusByPad('#freestyle-practice-transfer');
  await padButton(15);
  assert.equal(
    await page.locator('#freestyle-practice-transfer').inputValue(),
    'transfer-2',
  );
  await focusByPad('#freestyle-practice-start');
  await padButton(0);
  snapshot = await read();
  assert.equal(snapshot.freestylePractice.id, 'transfer-2');
  assert.equal(motion(snapshot).freestyle.invalid, true);
  await page.keyboard.press('KeyR');
  assert.equal((await read()).freestylePractice.id, 'transfer-2');
  await page.evaluate(() => window.__VN.pause());
  // Native select typeahead chooses Veil; Tab and Enter activate practice.
  await page.locator('#freestyle-practice-transfer').focus();
  await page.keyboard.press('v');
  assert.equal(
    await page.locator('#freestyle-practice-transfer').inputValue(),
    'transfer-3',
  );
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'freestyle-practice-start',
  );
  await page.keyboard.press('Enter');
  assert.equal((await read()).freestylePractice.id, 'transfer-3');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.matches('button,input,select'),
    ),
    false,
    'practice gives driving keys back to the game',
  );
  await page.evaluate(() => window.__VN.pause());
  await focusByPad('#freestyle-full-run');
  await padButton(0);
  assert.equal((await read()).freestylePractice, null);
  console.log(
    'PASS · keyboard and controller practice selection, retry, unranked state and ranked exit',
  );

  // One deliberate failure and retry use the native practice flow. The
  // approach driver only steers the road; the airborne attempt is held keys.
  await page.evaluate(() => window.__VN.pause());
  await page.locator('#freestyle-practice-transfer').selectOption('transfer-4');
  await page.locator('#freestyle-practice-start').click();
  async function flyToLip() {
    await page.evaluate(async () => {
      const { createTransferPilot } =
        await import('/tools/freestyle-pilot.mjs');
      window.__approachPilot = createTransferPilot(window.__VN.getTrack(), {
        reaction: 0.15,
        quantum: 0.25,
        targetSpeed: 'course',
      });
    });
    for (let i = 0; i < 40; i++) {
      const state = await page.evaluate(() =>
        window.__VN.stepFreestyle(12, window.__approachPilot),
      );
      if (motion(state).flight) return;
    }
    assert.fail('Practice approach must reach its native launch');
  }
  async function heldTicks(count) {
    return page.evaluate(
      (ticks) =>
        window.__VN.stepFreestyle(ticks, window.__VN.getSnapshot().input),
      count,
    );
  }
  await flyToLip();
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 12; i++) {
    snapshot = await heldTicks(90);
    if (snapshot.freestylePractice.outcome) break;
  }
  await page.keyboard.up('KeyW');
  assert.ok(snapshot.freestylePractice.outcome);
  assert.equal(
    snapshot.freestylePractice.outcome.clean,
    false,
    'holding the launch bank must not silently pass the opposing bank',
  );
  await page.waitForTimeout(100);
  assert.match(
    await page.locator('.fs-practice-status').innerText(),
    /Launch \d+ km\/h; band/,
  );
  assert.equal(
    await page.locator('#restart').isVisible(),
    false,
    'practice provides one visible retry action',
  );
  const missed = snapshot.freestylePractice.outcome.reason;
  assert.equal(
    await page.locator('.freestyle-air-readout').isVisible(),
    false,
    'a real missed jump hides its provisional counter',
  );
  assert.equal((await read()).environment.freestyleAir.visible, false);
  assert.deepEqual(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.includes('vector-nova.freestyle.v2.'))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
    ),
    rankedRecordsBeforePractice,
    'practice cannot create or overwrite a ranked best',
  );
  await page.keyboard.press('KeyR');
  assert.equal((await read()).freestylePractice.id, 'transfer-4');
  await flyToLip();
  await renderFrame();
  assert.equal(
    (await read()).environment.freestyleCatch.visible,
    false,
    'retry clears the previous landing effect',
  );
  assert.equal(
    (await read()).environment.thunder.activeVoices,
    0,
    'retry has no old landing voices',
  );
  // Deliberate gesture: hold a right line, roll left550ms, trim400ms, then settle.
  // No receiver quaternion, future contact or controller steers this gesture.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await heldTicks(18);
  await page.keyboard.down('ArrowLeft');
  await heldTicks(66);
  await page.keyboard.down('Space');
  await heldTicks(48);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('KeyD');
  let observedContact = false;
  for (let i = 0; i < 100; i++) {
    snapshot = await heldTicks(12);
    if (motion(snapshot).freestyle.pendingLanding && !observedContact) {
      observedContact = true;
      await renderFrame();
      const effect = (await read()).environment.freestyleCatch;
      assert.equal(effect.contactId, 'transfer-4');
      assert.equal(effect.visible, true);
      assert.equal(
        effect.grade,
        null,
        'contact-only seating does not invent a landing grade',
      );
    }
    if (snapshot.freestylePractice.outcome) break;
  }
  assert.equal(
    observedContact,
    true,
    'the held-key gesture reaches genuine pending contact before grading',
  );
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  assert.equal(
    snapshot.freestylePractice.outcome?.landed,
    true,
    `a deliberate keyboard roll and brake trim catches the opposing bank: ${JSON.stringify(snapshot.freestylePractice.outcome)}`,
  );
  await renderFrame();
  const landed = motion(snapshot).freestyle.legs.at(-1);
  const landedGrade = freestyleLandingGrade(landed);
  assert.equal(
    await page.locator('.fs-grade').textContent(),
    FREESTYLE_GRADES[landedGrade].label,
  );
  assert.equal((await read()).environment.freestyleCatch.grade, landedGrade);
  assert.equal(
    (await read()).environment.thunder.activeVoices,
    0,
    'practice pause stops landing voices',
  );
  assert.equal(
    await page.locator('.freestyle-payoff').isVisible(),
    false,
    'pause keeps the score payoff behind its menu',
  );
  console.log(
    `PASS · failed keyboard practice (${missed}), launch feedback, R retry, real contact-only seating and ${landedGrade} catch`,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.includes('vector-nova.freestyle.v2.'))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
    ),
    rankedRecordsBeforePractice,
    'a credited practice landing cannot change ranked records',
  );
  await page.locator('#freestyle-full-run').click();
  assert.equal((await read()).freestylePractice, null);
  url.searchParams.set('dev', '2');
  await page.goto(url.href);
  await page.locator('[data-action="launch"]').waitFor();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () =>
      window.__VN?.ready && window.__VN_FRONTEND.getState().screen === 'race',
    null,
    { timeout: 90000 },
  );
  await page.evaluate(() => window.__VN.pause());
  assert.equal(
    await page.locator('#freestyle-practice-transfer').isVisible(),
    true,
  );
  assert.equal(await page.locator('.fs-diagnostics').count(), 1);
  console.log(
    'PASS · transfer practice and diagnostics are available in both dev=1 and dev=2',
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(snapshot.errors, []);
} catch (error) {
  console.error(
    JSON.stringify(
      await page
        .evaluate(() => ({
          screen: window.__VN_FRONTEND?.getState().screen,
          error: window.__VN_FRONTEND?.getState().error,
          practice: window.__VN?.getSnapshot().freestylePractice,
          focus: document.activeElement?.id || document.activeElement?.tagName,
        }))
        .catch(() => null),
    ),
  );
  console.error(errors);
  throw error;
} finally {
  await browser.close();
}
