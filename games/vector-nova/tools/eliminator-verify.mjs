import assert from 'node:assert/strict';
import {
  createCareerSlots,
  createMemoryStorage,
  CAREER_SLOTS_KEY,
} from '../src/progression/careers.js';
import { createProfileStore, PROFILE_KEY } from '../src/progression/profile.js';
import { MODE_UNLOCKS } from '../src/levels/access.js';
import { launchVerificationBrowser } from './verification-browser.mjs';

const base = process.env.VN_URL ?? 'http://127.0.0.1:5214';
const levelIds = MODE_UNLOCKS.find(
  ({ mode }) => mode === 'eliminator',
).levelIds;
const levelId = process.env.VN_LEVEL ?? 'eliminator-glasswake';
assert.ok(
  levelIds.includes(levelId),
  `VN_LEVEL must be one of: ${levelIds.join(', ')}`,
);
function careerSeed({ earned = false } = {}) {
  const storage = createMemoryStorage();
  const careers = createCareerSlots({ storage: () => storage, now: () => 1 });
  careers.create(1);
  const store = createProfileStore(() => careers.storageFor(1));
  if (earned) {
    store.recordCup('frontier');
    for (const id of levelIds.slice(0, levelIds.indexOf(levelId)))
      assert.equal(store.recordCourseFinish(id), true);
  }
  return Array.from({ length: storage.length }, (_, i) => {
    const key = storage.key(i);
    return [key, storage.getItem(key)];
  });
}
const freshSeed = careerSeed();
const earnedSeed = careerSeed({ earned: true });
const profileStorageKey = earnedSeed.find(([key]) =>
  key.endsWith(`.${PROFILE_KEY}`),
)[0];
const entryURL = (id, options = {}) => {
  const target = new URL(base);
  target.search = new URLSearchParams({
    level: id,
    intro: '0',
    music: '0',
    ...options,
  });
  return target.href;
};
const browser = await launchVerificationBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const faults = [];
page.on('pageerror', (error) => faults.push(error.message));
const worldRequests = [];
page.on('request', (request) => {
  if (/\/src\/levels\/[^/]+\/index\.js(?:\?|$)/.test(request.url()))
    worldRequests.push(request.url());
});

await page.addInitScript(
  ({ seed, registryKey }) => {
    // Seed one real scoped career only on first entry; later navigations retain
    // earned fixtures and native result writes instead of silently resetting them.
    if (!localStorage.getItem(registryKey))
      for (const [key, value] of seed) localStorage.setItem(key, value);
    localStorage.setItem(
      'vector-nova.settings',
      JSON.stringify({
        quality: 'low',
        volume: 0,
        reducedMotion: true,
        difficulty: 'easy',
      }),
    );
    window.__checkPad = {
      id: 'event-controller-check',
      index: 0,
      connected: false,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [window.__checkPad],
    });
  },
  { seed: freshSeed, registryKey: CAREER_SLOTS_KEY },
);

// Response-only diagnostics accelerate the unchanged fixed-step session. They
// never enter the application, its production builds or durable player saves.
await page.route('**/src/core/game.js*', async (route) => {
  const response = await route.fetch(),
    source = await response.text();
  assert.ok(
    source.includes('getSnapshot() {'),
    'the maintained session API is present',
  );
  await route.fulfill({
    response,
    body: source.replace(
      'getSnapshot() {',
      `
    stepEvent(n,control={}) {
      if(eliminator?.snapshot().result)return this.getSnapshot();
      cancelCountdown();mode='racing';ui.setMode(mode);
      for(let i=0;i<Math.min(n,1200)&&mode==='racing';i++)
        advanceTick(typeof control==='function'?control({state:{...state},motion:runtime.snapshot(),track,racers,devices,avoidance:runtime.avoidance?.()}):control);
      if(mode==='racing')pause();return this.getSnapshot();
    },
    eventDiagnostics() {
      return {actors:dynamics?.snapshot().actors.map(({id,active})=>({id,active}))??[],
        opponents:racers.opponents.map(opponent=>({id:opponent.specification.id,eliminated:opponent.eliminated,state:{...opponent.state}}))};
    },getSnapshot() {`,
    ),
  });
});

const front = () => page.evaluate(() => window.__VN_FRONTEND.getState());
const snap = () => page.evaluate(() => window.__VN.getSnapshot());
const pressButton = async (selector) => {
  await page.locator(selector).focus();
  await page.keyboard.press('Enter');
};
const still = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const padButton = async (index, pressed) => {
  await page.evaluate(
    ({ index, pressed }) => {
      window.__checkPad.buttons[index] = { pressed, value: Number(pressed) };
    },
    { index, pressed },
  );
  await page.waitForTimeout(80);
};
async function installPilot() {
  await page.evaluate(async () => {
    const { getRacerControl } = await import('/src/race/racers.js');
    const { vehicleHandling } = await import('/src/ships/catalog.js');
    window.__eventPilot = ({
      state,
      motion,
      track,
      racers,
      devices,
      avoidance,
    }) => {
      const input = getRacerControl(state, track, {
        difficulty: 'hard',
        pace: 1,
        lane: 0,
        nearby: [
          state,
          ...racers.opponents
            .filter((opponent) => !opponent.eliminated)
            .map((opponent) => opponent.state),
        ],
        devices: devices.filter((device) =>
          ['vector', 'aegis'].includes(device.type),
        ),
        runtime: {
          pose: () => ({ grounded: motion.mode !== 'flight' }),
          avoidance: () => avoidance,
        },
      });
      const nextStrip = Math.min(
        ...devices
          .filter((device) => device.type === 'vector')
          .map(
            (device) =>
              (((device.distance - state.distance) % track.length) +
                track.length) %
              track.length,
          ),
      );
      input.boost &&=
        state.speed < vehicleHandling(state).boostSpeed - 8 &&
        nextStrip > 170 &&
        state.energy > (state.boosting ? 15 : 35);
      const slots = motion.equipment?.slots ?? [];
      input.equipment1 =
        slots[0]?.id === 'injector' &&
        slots[0].remaining === 0 &&
        state.energy < 55;
      input.equipment2 =
        slots[1]?.id === 'deflector' && slots[1].remaining === 0;
      return input;
    };
  });
}
async function runContest(label) {
  await installPilot();
  const cuts = [],
    retired = new Map();
  let result = null;
  for (let batch = 0; batch < 12 && !result; batch++) {
    const current = await page.evaluate(() => {
      const game = window.__VN;
      game.stepEvent(1200, window.__eventPilot);
      return {
        snapshot: game.getSnapshot(),
        diagnostics: game.eventDiagnostics(),
      };
    });
    const event = current.snapshot.eliminator;
    for (const eliminated of event.eliminated) {
      if (
        eliminated.id === 'player' ||
        cuts.some((cut) => cut.id === eliminated.id)
      )
        continue;
      cuts.push(eliminated);
      const driver = current.diagnostics.opponents.find(
        (row) => row.id === eliminated.id,
      );
      assert.equal(
        driver.eliminated,
        true,
        'the cut is applied to that actual AI driver',
      );
      retired.set(driver.id, driver.state);
    }
    for (const [id, state] of retired)
      assert.deepEqual(
        current.diagnostics.opponents.find((driver) => driver.id === id).state,
        state,
        'a cut driver never moves or rejoins later ticks',
      );
    const activeHulls =
      10 - event.eliminated.filter((driver) => driver.id !== 'player').length;
    assert.equal(
      current.diagnostics.actors.filter((actor) => actor.active).length,
      activeHulls,
      'cut AI racers have no active physical hulls',
    );
    if (event.result)
      result = {
        ...event.result,
        vehicle: current.snapshot.vehicle,
        errors: current.snapshot.errors,
        cuts,
      };
  }
  assert.ok(result, 'the physically driven contest reaches a conclusion');
  console.log(
    JSON.stringify({
      check: label,
      won: result.won,
      position: result.playerPosition,
      elapsed: result.elapsed,
      cuts: cuts.map((cut) => ({ id: cut.id, at: cut.at })),
      distance: result.vehicle.distance,
      reserve: result.vehicle.energy,
      valid: result.playerValid,
      survivors: result.standings
        .filter((row) => !row.eliminated)
        .map(({ id, distance }) => ({ id, distance })),
    }),
  );
  assert.deepEqual(result.errors, []);
  return result;
}

try {
  await page.goto(entryURL('halcyon'));
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'ordinary menus never construct a world',
  );
  await pressButton('[data-action="eliminator"]');
  assert.equal((await front()).intent, 'eliminator');
  assert.equal((await front()).selected, levelIds[0]);
  assert.deepEqual(
    await page
      .locator('.circuit-card')
      .evaluateAll((cards) => cards.map((card) => card.dataset.level)),
    levelIds,
  );
  if (levelId !== levelIds[0]) await pressButton(`[data-level="${levelId}"]`);
  assert.equal((await front()).selected, levelId);
  assert.equal(await page.locator('[data-action="launch"]').isDisabled(), true);
  assert.match(
    await page.locator('#course-start-requirement').textContent(),
    /Win Frontier Cup/,
  );
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'choosing the event stays lazy',
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  const fit = await page.locator('#front-shell').evaluate((element) => ({
    vertical: element.scrollHeight - element.clientHeight,
    horizontal: element.scrollWidth - element.clientWidth,
  }));
  assert.ok(
    fit.vertical <= 1 && fit.horizontal <= 1,
    `the event menu fits1280x720: ${JSON.stringify(fit)}`,
  );
  await pressButton('[data-action="quick-race"]');
  assert.equal(
    (await front()).selected,
    'halcyon',
    'leaving Eliminator restores the selected race course',
  );
  await pressButton('[data-action="eliminator"]');
  assert.equal(
    await page.evaluate(() => !!window.__VN),
    false,
    'locked previews and ordinary mode switching never construct a world',
  );
  assert.deepEqual(
    worldRequests,
    [],
    'locked previews fetch no level factories',
  );
  // Record the cup and any earlier course completions through the production
  // reducer. This navigation then exercises ordinary earned launch permission.
  await page.evaluate((entries) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, earnedSeed);
  await page.goto(entryURL(levelId));
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  assert.equal((await front()).selected, levelId);
  assert.equal(
    await page.locator('[data-action="launch"]').isDisabled(),
    false,
  );
  assert.equal(await page.evaluate(() => !!window.__VN), false);
  assert.deepEqual(
    worldRequests,
    [],
    'earned setup also stays lazy until Start',
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await pressButton('[data-action="launch"]');
  await page.waitForFunction(
    () =>
      window.__VN_FRONTEND.getState().error ||
      (window.__VN?.ready &&
        window.__VN_FRONTEND.getState().screen === 'race' &&
        !window.__VN_FRONTEND.getState().loading),
    null,
    { timeout: 60000 },
  );
  assert.equal(
    (await front()).error,
    '',
    `world load failed: ${JSON.stringify(faults)}`,
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const starting = await page.evaluate(() => {
    const game = window.__VN,
      { camera } = game.getScene(),
      track = game.getTrack(),
      frame = track.sample(game.getSnapshot().vehicle.distance);
    return {
      behind: camera.position.clone().sub(frame.position).dot(frame.tangent),
      snapshot: game.getSnapshot(),
    };
  });
  assert.ok(
    starting.behind < -8,
    'the starting chase camera is behind the actual racer',
  );
  assert.equal(starting.snapshot.eliminator.elapsed, 0);
  assert.equal(starting.snapshot.eliminator.remaining, 10);
  assert.equal(starting.snapshot.competition.difficulty, 'easy');
  console.log(
    'PASS · native event entry, lazy map selection, full grid and starting camera',
  );

  await page.evaluate((control) => window.__VN.stepEvent(120, control), still);
  assert.equal((await snap()).mode, 'paused');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'racing');
  await page.keyboard.press('Escape');
  const paused = await snap();
  await page.waitForTimeout(180);
  assert.equal(
    (await snap()).eliminator.elapsed,
    paused.eliminator.elapsed,
    'pause freezes the cut clock',
  );
  await page.evaluate(() => {
    window.__checkPad.connected = true;
  });
  await page.waitForTimeout(100);
  await page.locator('#resume').focus();
  await padButton(0, true);
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'racing');
  await padButton(0, false);
  await padButton(9, true);
  await page.waitForFunction(() => window.__VN.getSnapshot().mode === 'paused');
  await padButton(9, false);
  await page.evaluate(() => {
    window.__checkPad.connected = false;
  });
  console.log(
    'PASS · keyboard pause, frozen cut clock and controller resume/pause',
  );

  const loss = await page.evaluate((control) => {
    const game = window.__VN;
    for (let i = 0; i < 3 && !game.getSnapshot().eliminator.result; i++)
      game.stepEvent(1200, control);
    return game.getSnapshot();
  }, still);
  assert.equal(loss.mode, 'results');
  assert.equal(loss.eliminator.result.playerPosition, 10);
  assert.equal(loss.eliminator.result.reason, 'eliminated');
  assert.equal(loss.eliminator.result.elapsed, 22);
  await page.waitForFunction(
    () => window.__VN_FRONTEND.getState().screen === 'results',
  );
  assert.match(
    await page.locator('.eliminator-results h1').textContent(),
    /Eliminated.*10th/,
  );
  const afterLoss = (await front()).career.state;
  assert.equal(afterLoss.finishes, 1);
  assert.equal(afterLoss.points, 1);
  await page.evaluate(() => {
    window.__VN.showResults();
    window.__VN.showResults();
  });
  assert.deepEqual(
    (await front()).career.state,
    afterLoss,
    'reopening a classification never duplicates career progress',
  );
  await page.keyboard.press('KeyR');
  await page.waitForFunction(
    () => window.__VN.getSnapshot().mode === 'countdown',
  );
  const restarted = await snap();
  assert.equal(restarted.eliminator.elapsed, 0);
  assert.equal(restarted.eliminator.remaining, 10);
  assert.deepEqual(restarted.eliminator.eliminated, []);
  assert.equal(restarted.vehicle.distance, 0);
  console.log(
    'PASS · honest stationary 22s elimination, career dedupe and native result retry',
  );

  let beforeWinCareer = (await front()).career.state;
  let result = await runContest('stock defensive drive');
  let durableCareer = null;
  if (!result.won) {
    // The event explicitly permits earned career builds. This isolated fixture
    // exercises a genuine win without fabricating positions, damage or survival.
    durableCareer = await page.evaluate(
      (key) => localStorage.getItem(key),
      profileStorageKey,
    );
    await page.goto(
      entryURL(levelId, {
        dev: '2',
        ship: 'shrike',
        upgrades: '3',
        equipment: 'injector,deflector',
      }),
    );
    await page.waitForFunction(
      () => window.__VN_FRONTEND?.getState().screen === 'home',
    );
    beforeWinCareer = (await front()).career.state;
    await pressButton('[data-action="launch"]');
    await page.waitForFunction(
      () =>
        window.__VN_FRONTEND.getState().error ||
        (window.__VN?.ready &&
          window.__VN_FRONTEND.getState().screen === 'race' &&
          !window.__VN_FRONTEND.getState().loading),
      null,
      { timeout: 60000 },
    );
    assert.equal((await front()).error, '');
    result = await runContest('isolated earned Shrike / injector + deflector');
    assert.equal(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        profileStorageKey,
      ),
      durableCareer,
      'earned fixture cannot alter the durable career',
    );
  }
  assert.equal(
    result.won,
    true,
    'a real stock or legitimately earned build reaches last survivor with ordinary inputs',
  );
  assert.equal(result.playerPosition, 1);
  assert.equal(result.playerValid, true);
  assert.equal(result.elapsed, 102);
  assert.equal(result.cuts.length, 9);
  assert.deepEqual(result.errors, []);
  assert.match(
    await page.locator('.eliminator-results h1').textContent(),
    /Last racer standing/,
  );
  const afterWin = (await front()).career.state;
  assert.equal(afterWin.finishes, beforeWinCareer.finishes + 1);
  assert.equal(afterWin.points, beforeWinCareer.points + 5);
  assert.equal(afterWin.wins, beforeWinCareer.wins + 1);
  await page.evaluate(() => window.__VN.showResults());
  assert.deepEqual((await front()).career.state, afterWin);
  await pressButton('[data-action="retry-race"]');
  const retry = await snap();
  assert.equal(retry.eliminator.remaining, 10);
  assert.equal(retry.eliminator.elapsed, 0);
  assert.ok(
    (await page.evaluate(() => window.__VN.eventDiagnostics().opponents)).every(
      (driver) => !driver.eliminated,
    ),
  );
  console.log(
    'PASS · nine physical cuts, last-survivor result, win award once and restored full field',
  );
  assert.deepEqual(faults, [], 'no uncaught browser exceptions');
} finally {
  await browser.close();
}
