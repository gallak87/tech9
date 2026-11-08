import assert from 'node:assert/strict';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../src/progression/careers.js';
import { createProfileStore } from '../src/progression/profile.js';

// Completed, acknowledged career, using the real progression reducer. This
// exercises the production event entry rather than bypassing it with dev=2.
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
profile.queueCompletion('shrike');
profile.acknowledgeCompletion();
const seed = Array.from({ length: storage.length }, (_, i) => {
  const key = storage.key(i);
  return [key, storage.getItem(key)];
});
const browser = await launchVerificationBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = collectPageErrors(page);
await page.addInitScript((values) => {
  for (const [key, value] of values) localStorage.setItem(key, value);
  localStorage.setItem(
    'vector-nova.settings',
    JSON.stringify({ quality: 'low', volume: 0 }),
  );
}, seed);
// Fixed ticks still run the live native session with bounded normalized input.
// This response-only hook freezes between assertions, never changes poses,
// contacts or outcomes, and is absent from the application and its builds.
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch();
  let source = await response.text();
  assert.ok(source.includes('function advanceTick(control) {'));
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
    '/?intro=0&level=launchworks&music=0',
    process.env.VN_URL ?? 'http://127.0.0.1:5213',
  );
  await page.goto(url.href);
  await page.locator('[data-action="launch"]').waitFor();
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'menu entry constructs no world',
  );
  assert.match(
    await page.locator('#front-shell').innerText(),
    /Freestyle.*Pilot/i,
  );
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
  const boot = await read();
  assert.equal(boot.track.name, 'Zephyr Skywell');
  assert.equal(motion(boot).equipment, undefined);
  assert.equal(await page.locator('.equipment-hud').count(), 0);
  await page.evaluate(() => window.__VN.stepFreestyle(1, {}));
  console.log(
    'PASS · post-credits Pilot entry, Zephyr biome, equipment disabled',
  );

  // Exercise actual DOM keyboard events, not calls into the input reader.
  for (const [keys, expected] of [
    [
      ['KeyQ', 'KeyZ', 'KeyC'],
      { aerialRoll: 1, aerialPitch: -1, aerialYaw: 1, boost: false },
    ],
    [
      ['KeyE', 'KeyX', 'KeyV', 'Space'],
      { aerialRoll: -1, aerialPitch: 1, aerialYaw: -1, airbrake: true },
    ],
    [
      ['ShiftLeft'],
      { aerialRoll: 0, aerialPitch: 0, aerialYaw: 0, boost: true },
    ],
    [
      ['ControlLeft', 'KeyW', 'KeyA'],
      { aerialRoll: 1, aerialPitch: -1, aerialYaw: 0 },
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
    if (keys.includes('ShiftLeft'))
      assert.equal(Math.hypot(...motion(turned).freestyle.angular), 0);
    else
      assert.ok(
        Math.hypot(...motion(turned).flight.angularVelocity) > 0.1,
        'held axes turn the actual native hull',
      );
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
      padInput.aerialPitch < -0.8 &&
      padInput.aerialYaw > 0.5,
  );
  assert.equal(padInput.aerialRoll, 1);
  assert.equal(padInput.boost, false);
  await page.evaluate(() => {
    window.__testPad.axes = [0, 0, 0, 0];
    window.__testPad.buttons[2] = { pressed: false, value: 0 };
  });
  console.log('PASS · independent controller steering, pitch/yaw and roll');

  // Production practice controls must be reachable through the shared pad menu.
  await page.evaluate(() => window.__VN.pause());
  await focusByPad('#freestyle-practice-transfer');
  await padButton(15);
  assert.equal(
    await page.locator('#freestyle-practice-transfer').inputValue(),
    'transfer-2',
  );
  await focusByPad('#freestyle-practice-start');
  await padButton(0);
  let snapshot = await read();
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
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        key.includes('vector-nova.freestyle.v2.'),
      ),
    ),
    false,
    'practice cannot save a ranked best',
  );
  await page.keyboard.press('KeyR');
  assert.equal((await read()).freestylePractice.id, 'transfer-4');
  await flyToLip();
  // Deliberate gesture: hold a right line, E550ms, E+Space400ms, then settle.
  // No receiver quaternion, future contact or controller steers this gesture.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await heldTicks(18);
  await page.keyboard.down('KeyE');
  await heldTicks(66);
  await page.keyboard.down('Space');
  await heldTicks(48);
  await page.keyboard.up('KeyE');
  await page.keyboard.up('KeyD');
  for (let i = 0; i < 20; i++) {
    snapshot = await heldTicks(60);
    if (snapshot.freestylePractice.outcome) break;
  }
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  assert.equal(
    snapshot.freestylePractice.outcome?.landed,
    true,
    `a deliberate keyboard roll and brake trim catches the opposing bank: ${JSON.stringify(snapshot.freestylePractice.outcome)}`,
  );
  console.log(
    `PASS · failed keyboard practice (${missed}), launch feedback, R retry and credited held-key bank`,
  );
  await page.locator('#freestyle-full-run').click();
  assert.equal((await read()).freestylePractice, null);

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
  for (let i = 0; i < 8; i++) {
    snapshot = await page.evaluate(() =>
      window.__VN.stepFreestyle(1200, window.__fsPilot),
    );
    if (motion(snapshot).freestyle.result) break;
  }
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
  console.log(
    `PASS · native five-transfer chain from rest, ${result.score} points, no resets or airborne impacts`,
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
