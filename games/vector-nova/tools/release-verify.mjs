import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  createCareerSlots,
  createMemoryStorage,
  CAREER_SLOTS_KEY,
} from '../src/progression/careers.js';
import { createProfileStore } from '../src/progression/profile.js';
import { saveShipSelection } from '../src/ships/catalog.js';

// Maintained release-flow integration checks. Use an existing development server:
// VN_URL=http://127.0.0.1:5179 node tools/release-verify.mjs
// Race callbacks are injected through an unshipped browser-only module fixture;
// career stores, frontend controls, finale rendering/assets and persistence are real.
// Real race/physics/results checks remain in frontend-verify.mjs and desktop probes.
const responsive = process.argv.includes('--responsive');
assert.ok(
  process.argv.slice(2).every((flag) => flag === '--responsive'),
  'Use only --responsive or no flags.',
);
const base = process.env.VN_URL;
assert.ok(base, 'Set VN_URL to an existing development server.');
function fixture({ wins = 0, cups = false, trials = 0, pending = false } = {}) {
  const storage = createMemoryStorage();
  const careers = createCareerSlots({ storage: () => storage, now: () => 1 });
  careers.create(1);
  const scoped = careers.storageFor(1);
  const store = createProfileStore(() => scoped);
  for (let i = 0; i < wins; i++)
    store.recordRace({ id: `release-race-${i}`, won: true });
  if (cups)
    for (const id of ['founders', 'frontier', 'horizon', 'apex'])
      store.recordCup(id);
  for (const id of ['halcyon', 'orbital'].slice(0, trials))
    store.recordTrial(id, true);
  if (pending) assert.equal(store.queueCompletion('needle'), true);
  saveShipSelection(wins ? 'needle' : 'shrike', scoped);
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index);
    return [key, storage.getItem(key)];
  });
}
const fresh = fixture();
const complete = fixture({ wins: 24, cups: true, trials: 2 });
const trialsRemaining = fixture({ wins: 24, cups: true });
const lastTrial = fixture({ wins: 24, cups: true, trials: 1 });
const lastRace = fixture({ wins: 23, cups: true, trials: 2 });
const pending = fixture({ wins: 24, cups: true, trials: 2, pending: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--mute-audio'],
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : { channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome' }),
});
const url = (query = '') => {
  const target = new URL(base);
  target.search = query;
  target.searchParams.set('intro', '0');
  target.searchParams.set('music', '0');
  return target.href;
};
const state = (page) => page.evaluate(() => window.__VN_FRONTEND.getState());
const ready = (page) =>
  page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
    null,
    { timeout: 90000 },
  );
const phase = async (page, value) => {
  await page.waitForFunction(
    (expected) =>
      window.__VN_FRONTEND?.getState().completion?.phase === expected,
    value,
    { timeout: 90000 },
  );
  const completion = (await state(page)).completion;
  if (!completion.error) {
    assert.equal(
      completion.rendering?.world,
      'nacre',
      'finale uses the production Nacre world',
    );
    assert.equal(completion.rendering?.source, 'native-replay');
    assert.equal(completion.rendering?.pipeline?.world, 'nacre-tempest');
  }
};
const mockGame = `export async function createGame(options) {
  let shipId='needle', session=false, mode='overview';
  const snapshot=()=>({mode,ship:{id:shipId},vehicle:{shipId},competition:{enabled:true,playerFinished:false},timeTrial:null});
  const api={ready:true,getSnapshot:snapshot,configure(){},prepareSession(){session=false},setBuild(){},
    setSuspended(value){window.__releaseSuspended=value},clearInput(){},dispose(){session=false},
    hasSession:()=>session,async selectShip(id){shipId=id;return true},
    start(){session=true;mode='racing';options.onMode(mode)},
    timeTrial(){this.start()},practice(){this.start()},startCup(){this.start()},
    returnToSetup(){mode='overview'},resumeSession(){mode='racing';options.onMode(mode)},showResults(){mode='results'},
    celebrateCup(){return 0.6}};
  window.__releaseRace={
    trial(){options.onTrialRecord({playerValid:true,improved:true,shipId})},
    home(){options.onHome()},
    win(valid=true){mode='results';options.onResults({playerValid:valid,playerTotalTime:65,playerLapTimes:[32,33],laps:2,
      standings:[{id:'player',name:'You',position:1,valid,finished:true,totalTime:65}]})}};
  window.__VN=api;return api;
}`;
async function check(
  name,
  seed,
  run,
  {
    reducedMotion = true,
    game = false,
    failImport = false,
    viewport = { width: 1440, height: 900 },
  } = {},
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const faults = [];
  const requests = new Set();
  page.on('pageerror', (error) => faults.push(error.message));
  page.on('request', (request) =>
    requests.add(new URL(request.url()).pathname),
  );
  try {
    await context.addInitScript(
      ({ values, registryKey, reducedMotion }) => {
        if (!localStorage.getItem(registryKey))
          for (const [key, value] of values) localStorage.setItem(key, value);
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({
            quality: 'low',
            masterVolume: 0,
            musicVolume: 0,
            sfxVolume: 0,
            reducedMotion,
            difficulty: 'easy',
          }),
        );
        localStorage.setItem('startUpMusicOn', 'false');
        window.__releasePad = {
          index: 0,
          id: 'Release verification',
          connected: true,
          mapping: 'standard',
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({
            pressed: false,
            touched: false,
            value: 0,
          })),
        };
        Object.defineProperty(navigator, 'getGamepads', {
          value: () => [window.__releasePad],
        });
      },
      { values: seed, registryKey: CAREER_SLOTS_KEY, reducedMotion },
    );
    if (game)
      await page.route('**/src/core/game.js*', (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: mockGame,
        }),
      );
    if (failImport)
      await page.route('**/src/frontend/completion-cinematic.js*', (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: 'throw new Error("Injected finale chunk failure");',
        }),
      );
    await run(page);
    if (
      !failImport &&
      [...requests].some((path) =>
        path.endsWith('/src/frontend/completion-stage.js'),
      )
    ) {
      for (const source of [
        '/src/levels/nacre/index.js',
        '/src/frontend/completion-run.js',
        '/src/renderer/index.js',
        '/assets/levels/nacre/nacre-storm-sky-v1.png',
        '/assets/levels/nacre/leviathan/nacre-leviathan-v2.glb',
      ])
        assert.ok(
          [...requests].some((path) => path.endsWith(source)),
          `production finale requested ${source}`,
        );
      assert.equal(
        [...requests].some((path) =>
          path.endsWith('/assets/levels/nomad/nomad-sky-v1.png'),
        ),
        false,
        'Nacre finale uses its own storm sky',
      );
    }
    assert.deepEqual(faults, [], 'no uncaught browser errors');
    console.log(`PASS ${name}`);
  } catch (error) {
    throw new Error(`${name}: ${error.message}`, { cause: error });
  } finally {
    await context.close();
  }
}
async function padButton(page, index) {
  await page.evaluate((i) => {
    window.__releasePad.buttons[i] = { pressed: true, touched: true, value: 1 };
  }, index);
  await page.waitForTimeout(100);
  await page.evaluate((i) => {
    window.__releasePad.buttons[i] = {
      pressed: false,
      touched: false,
      value: 0,
    };
  }, index);
  await page.waitForTimeout(100);
}
async function creditsClose(page, { controller = false } = {}) {
  await phase(page, 'credits');
  await page.getByRole('button', { name: /^Close/ }).focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.textContent.trim().startsWith('Close'),
    ),
    true,
    'Tab stays inside modal',
  );
  if (controller) await padButton(page, 0);
  else await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.__VN_FRONTEND.getState().completion);
  const current = await state(page);
  assert.equal(current.career.state.completion.acknowledged, true);
  assert.equal(
    await page.locator('.completion-cinematic').count(),
    0,
    'film resources leave the DOM',
  );
  await page.reload();
  await ready(page);
  assert.equal(
    (await state(page)).completion,
    null,
    'acknowledged finale never replays on reload',
  );
}
try {
  if (!responsive) {
    await check(
      'fresh career hides three bonus tracks and fifth cup, including copied art URLs',
      fresh,
      async (page) => {
        await page.goto(url());
        await ready(page);
        assert.equal(await page.locator('[data-level]').count(), 14);
        await page.getByRole('button', { name: /^Championships/ }).click();
        assert.equal(await page.locator('[data-cup]').count(), 4);
        assert.equal(await page.locator('.cup-bonus-badge').count(), 0);
        await page.goto(url('level=oriel&artPass=1'));
        await page.waitForFunction(
          () => window.__VN_FRONTEND?.getState().error,
        );
        assert.match((await state(page)).error, /28 career rewards/);
        assert.equal(await page.evaluate(() => !!window.__VN?.ready), false);
      },
    );
    await check(
      'developer access reveals all three tracks without changing the saved career',
      fresh,
      async (page) => {
        await page.goto(url('dev=1'));
        await ready(page);
        for (const id of ['ravel', 'nomad', 'oriel'])
          assert.equal(await page.locator(`[data-level="${id}"]`).count(), 1);
        assert.equal(await page.locator('[data-level]').count(), 17);
        assert.equal((await state(page)).developer, true);
        await page.goto(url());
        await ready(page);
        assert.equal((await state(page)).career.state.claims.length, 0);
      },
    );
    await check(
      'all four cups won still advertises the two Time Trial unlocks',
      trialsRemaining,
      async (page) => {
        await page.goto(url());
        await ready(page);
        assert.equal((await state(page)).career.state.claims.length, 26);
        assert.equal(
          await page
            .locator('[data-action="time-trial"] .mode-unlock-badge')
            .textContent(),
          '2',
        );
        assert.equal(
          await page
            .locator('[data-action="cup-hub"] .mode-unlock-badge')
            .count(),
          0,
        );
        assert.equal(
          await page
            .locator('[data-action="quick-race"] .mode-unlock-badge')
            .count(),
          0,
        );
      },
    );
    await check(
      'complete career exposes the spanning fifth cup and dimmed, uniquely badged trophy',
      complete,
      async (page) => {
        await page.goto(url());
        await ready(page);
        assert.equal(await page.locator('[data-level]').count(), 17);
        await page.getByRole('button', { name: /^Championships/ }).click();
        const encore = page.locator('[data-cup="encore"]');
        assert.equal(await page.locator('[data-cup]').count(), 5);
        assert.equal(await page.locator('.cup-bonus-badge').count(), 1);
        assert.equal(
          await encore.evaluate((el) => getComputedStyle(el).gridColumn),
          '1 / -1',
        );
        const box = await encore.boundingBox();
        const founders = await page
          .locator('[data-cup="founders"]')
          .boundingBox();
        assert.ok(
          box.width > founders.width * 1.9,
          'Encore spans both columns',
        );
        assert.equal(
          await page.locator('.cup-cabinet .is-bonus.is-earned').count(),
          0,
        );
        assert.equal(
          await page
            .locator('.cup-cabinet .is-bonus img')
            .evaluate((el) => getComputedStyle(el).opacity),
          '0.22',
        );
        assert.ok(
          await page
            .locator('.cup-cabinet .is-bonus img')
            .evaluate((el) => el.complete && el.naturalWidth > 0),
          'custom trophy asset decodes',
        );
        await page.locator('[data-cup="apex"]').focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.cup),
          'encore',
          'keyboard reaches the spanning card',
        );
        await padButton(page, 12);
        assert.ok(
          ['horizon', 'apex'].includes(
            await page.evaluate(() => document.activeElement.dataset.cup),
          ),
          'controller returns to preceding row',
        );
      },
    );
    await check(
      'a final circuit Time Trial record queues the last racer without needing a results screen',
      lastTrial,
      async (page) => {
        await page.goto(url('level=orbital'));
        await ready(page);
        await page.locator('[data-action="time-trial"]').click();
        await page.locator('[data-action="launch"]').click();
        await page.waitForFunction(() => !!window.__releaseRace);
        await page.evaluate(() => window.__releaseRace.trial());
        await phase(page, 'playing');
        const current = await state(page);
        assert.equal(current.career.state.claims.length, 28);
        assert.deepEqual(current.career.state.completion, {
          shipId: 'needle',
          acknowledged: false,
        });
        assert.equal(current.completion.shipId, 'needle');
        assert.equal(
          await page.evaluate(() => window.__releaseSuspended),
          true,
          'retained race suspends during finale',
        );
        await page.keyboard.press('Escape');
        await creditsClose(page, { controller: true });
      },
      { reducedMotion: false, game: true },
    );
    await check(
      'last race win uses the retained racer after a different menu ship was selected',
      lastRace,
      async (page) => {
        await page.goto(url('level=halcyon'));
        await ready(page);
        await page.locator('[data-action="launch"]').click();
        await page.waitForFunction(() => !!window.__releaseRace);
        await page.evaluate(() => window.__releaseRace.home());
        await page.locator('[data-action="ship-step"]').click();
        await page.locator('[data-ship="shrike"]').click();
        await page.locator('[data-action="race-tab"]').click();
        assert.equal((await state(page)).shipId, 'shrike');
        await page.locator('[data-action="resume-session"]').click();
        await page.evaluate(() => window.__releaseRace.win());
        await phase(page, 'credits');
        assert.equal(
          (await state(page)).career.state.completion.shipId,
          'needle',
        );
        await creditsClose(page);
      },
      { game: true },
    );
    await check(
      'pending reduced-motion finale resumes after interruption and can be closed once',
      pending,
      async (page) => {
        await page.goto(url());
        await phase(page, 'credits');
        assert.equal((await state(page)).completion.shipId, 'needle');
        await page.reload();
        await phase(page, 'credits');
        await creditsClose(page);
      },
    );
    await check(
      'failed finale download preserves earned courses and a keyboard-accessible close',
      pending,
      async (page) => {
        await page.goto(url());
        await phase(page, 'credits');
        assert.match(
          (await state(page)).completion.error,
          /Injected finale chunk failure/,
        );
        assert.equal(
          await page.getByRole('alert').textContent(),
          'The cinematic couldn’t load. Your unlocks are still available.',
        );
        const retry = page.getByRole('button', { name: 'Reload and retry' });
        await retry.focus();
        await page.keyboard.press('Tab');
        assert.equal(
          await page.evaluate(() => document.activeElement.textContent.trim()),
          'Close',
          'Tab reaches Close from Retry',
        );
        await page.keyboard.press('Shift+Tab');
        assert.equal(
          await page.evaluate(() => document.activeElement.textContent.trim()),
          'Reload and retry',
          'Shift+Tab reaches Retry',
        );
        assert.equal(
          (await state(page)).career.state.completion.acknowledged,
          false,
        );
        const reloaded = page.waitForEvent('domcontentloaded');
        await retry.click();
        await reloaded;
        await phase(page, 'credits');
        assert.equal(
          (await state(page)).career.state.completion.acknowledged,
          false,
          'Retry preserves pending completion',
        );
        await page.getByRole('button', { name: /^Close/ }).click();
        await page.waitForFunction(
          () => !window.__VN_FRONTEND.getState().completion,
        );
        assert.equal(
          (await state(page)).career.state.completion.acknowledged,
          true,
        );
        await page.reload();
        await ready(page);
        assert.equal((await state(page)).completion, null);
        await page.getByRole('button', { name: /^Championships/ }).click();
        assert.equal(await page.locator('[data-cup="encore"]').count(), 1);
      },
      { failImport: true },
    );
  } else {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1024, height: 768 },
    ]) {
      await check(
        `production completion controls fit ${viewport.width}×${viewport.height}`,
        pending,
        async (page) => {
          await page.goto(url());
          await phase(page, 'credits');
          const card = page.locator('.completion-card');
          const bounds = await card.boundingBox();
          assert.ok(
            bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1,
            'credits fit horizontally',
          );
          const thanks = await page.locator('#completion-thanks').textContent();
          assert.match(thanks, /Thx for playing, 3 new courses unlocked!/);
          await page
            .getByRole('button', { name: /^Close/ })
            .scrollIntoViewIfNeeded();
          await creditsClose(page);
          await page.getByRole('button', { name: /^Championships/ }).click();
          const encore = page.locator('[data-cup="encore"]');
          if (!(await encore.isVisible()))
            await page.locator('[data-action="circuits"]').click();
          await encore.scrollIntoViewIfNeeded();
          const box = await encore.boundingBox();
          assert.ok(
            box.x >= -1 && box.x + box.width <= viewport.width + 1,
            'bonus cup fits horizontally',
          );
          assert.equal(await page.locator('.cup-bonus-badge').count(), 1);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
          );
        },
        { viewport },
      );
      await check(
        `mode badges remain reachable ${viewport.width}×${viewport.height}`,
        trialsRemaining,
        async (page) => {
          await page.goto(url());
          await ready(page);
          const trial = page.locator('[data-action="time-trial"]');
          await trial.scrollIntoViewIfNeeded();
          assert.equal(
            await trial.locator('.mode-unlock-badge').textContent(),
            '2',
          );
          await trial.focus();
          await page.keyboard.press('Enter');
          assert.equal((await state(page)).intent, 'time-trial');
        },
        { viewport },
      );
    }
  }
} finally {
  await browser.close();
}
