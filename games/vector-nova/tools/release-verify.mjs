import assert from 'node:assert/strict';
import {
  launchVerificationBrowser,
  collectPageErrors,
} from './verification-browser.mjs';
import {
  createCareerSlots,
  createMemoryStorage,
  CAREER_SLOTS_KEY,
} from '../src/progression/careers.js';
import { createProfileStore } from '../src/progression/profile.js';
import { saveShipSelection } from '../src/ships/catalog.js';
import { createCupStore } from '../src/race/cup.js';
import { RACE_ORDER } from '../src/race/roster.js';
import { COURSE_IDS, MODE_UNLOCKS } from '../src/levels/access.js';
import { careerUnlockProgress } from '../src/progression/completion.js';
import { createEliminatorEvent } from '../src/events/eliminator.js';
import { createInterceptorEvent } from '../src/events/interceptor.js';

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
const selectedChecks = new RegExp(process.env.VN_CHECK ?? '.');
const cupFinish = {
  mode: 'cup',
  final: true,
  courseFormat: 'sprint',
  playerValid: true,
  playerTotalTime: 106.107,
  playerLapTimes: [106.107],
  laps: 1,
  standings: RACE_ORDER.map((id, index) => ({
    id,
    name: id === 'player' ? 'You' : id,
    position: index + 1,
    valid: true,
    finished: true,
    totalTime: 106.107 + index,
  })),
};
function fixture({
  wins = 0,
  cups = false,
  trials = 0,
  pending = false,
  horizonFinal = false,
  starterCups = [],
} = {}) {
  const storage = createMemoryStorage();
  const careers = createCareerSlots({ storage: () => storage, now: () => 1 });
  careers.create(1);
  const scoped = careers.storageFor(1);
  const store = createProfileStore(() => scoped);
  for (const id of starterCups) store.recordCup(id);
  for (let i = 0; i < wins; i++)
    store.recordRace({ id: `release-race-${i}`, won: true });
  if (cups)
    for (const id of ['founders', 'frontier', 'horizon', 'apex'])
      store.recordCup(id);
  if (cups) for (const id of COURSE_IDS) store.recordCourseFinish(id);
  for (const id of ['halcyon', 'orbital'].slice(0, trials))
    store.recordTrial(id, true);
  if (horizonFinal) {
    store.recordCup('founders');
    store.recordCup('frontier');
    const cup = createCupStore(() => scoped);
    cup.start('horizon', 'shrike', 'hard');
    for (let event = 0; event < 2; event++) {
      const state = cup.snapshot().state;
      cup.finish(cupFinish);
      store.recordRace({ id: `${state.runId}:${event}`, position: 1 });
      cup.next();
    }
  }
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
const horizonFinal = fixture({ horizonFinal: true });
const browser = await launchVerificationBrowser();
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
      'shatterline',
      'finale uses the production Shatterline world',
    );
    assert.equal(completion.rendering?.source, 'recorded-race');
    assert.equal(completion.rendering?.replay?.raceMotion, 'native');
    assert.equal(
      completion.rendering?.replay?.finishMotion,
      'choreographed-drift',
    );
    assert.equal(completion.rendering?.pipeline?.world, 'shatterline');
    const selectedRecord = `/assets/completion/shatterline-v1/${completion.shipId}.json.gz`;
    assert.equal(
      await page.evaluate(
        (suffix) =>
          performance
            .getEntriesByType('resource')
            .some((entry) => new URL(entry.name).pathname.endsWith(suffix)),
        selectedRecord,
      ),
      true,
      'finale loaded its selected final native record',
    );
  }
};
const mockGame = `export async function createGame(options) {
  let shipId='needle', session=false, mode='overview';
  (window.__releaseGameEntries??=[]).push({level:options.parameters.get('level'),access:structuredClone(options.contentAccess)});
  const snapshot=()=>({mode,ship:{id:shipId},vehicle:{shipId},competition:{enabled:true,playerFinished:false},timeTrial:null});
  const api={ready:true,getSnapshot:snapshot,configure(){},prepareSession(){session=false},setBuild(){},
    setSuspended(value){window.__releaseSuspended=value},clearInput(){},dispose(){session=false},
    hasSession:()=>session,async selectShip(id){shipId=id;return true},
    start(){session=true;mode='racing';options.onMode(mode)},
    timeTrial(){this.start()},practice(){this.start()},startCup(){this.start()},
    returnToSetup(){mode='overview'},resumeSession(){mode='racing';options.onMode(mode)},showResults(){mode='results'},
    celebrateCup(){window.__releaseCelebrations=(window.__releaseCelebrations??0)+1;return 0.6}};
  window.__releaseRace={
    finishCourse(data){mode='results';session=false;options.onResults({...data,shipId})},
    trial(){options.onTrialRecord({playerValid:true,improved:true,shipId})},
    home(){options.onHome()},
    cupFinish(present=true){mode='results';options.onResults(${JSON.stringify(cupFinish)},{present})},
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
    component = false,
    viewport = { width: 1440, height: 900 },
  } = {},
) {
  if (!selectedChecks.test(name)) return;
  const context = await browser.newContext({
    viewport,
    hasTouch: responsive,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const faults = [];
  const requests = new Set();
  collectPageErrors(page, faults);
  page.on('request', (request) =>
    requests.add(new URL(request.url()).pathname),
  );
  try {
    await context.addInitScript(
      ({ values, registryKey, reducedMotion }) => {
        // Vite module graphs plus a garage visit exceed the browser's default
        // 250-entry buffer before the selected finale record is fetched.
        performance.setResourceTimingBufferSize(4000);
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
      !component &&
      !failImport &&
      [...requests].some((path) =>
        path.endsWith('/src/frontend/completion-stage.js'),
      )
    ) {
      for (const source of [
        '/src/levels/shatterline/index.js',
        '/src/frontend/completion-run.js',
        '/src/renderer/index.js',
        '/assets/levels/shatterline/shatterline-sky-v1.png',
        '/assets/levels/shatterline/receiver-command.glb',
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
        'Shatterline finale uses its own sky',
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
// Real overlay/playback code with only the heavy world replaced at the HTTP
// boundary, so late stage completion can be controlled without release hooks.
async function completionLifecycleFixture(
  page,
  { disposeBeforeFilm = false } = {},
) {
  await page.route('**/completion-overlay-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><link rel="stylesheet" href="/src/frontend/completion-cinematic.css"><main id="fixture"><button id="invoker">Return here</button></main>',
    }),
  );
  await page.route('**/src/frontend/completion-stage.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export function createCompletionStage({mount,onProgress}) {
      window.__stageCreates=(window.__stageCreates??0)+1;
      let prepared=false,disposed=false;
      const canvas=document.createElement('canvas'); mount.append(canvas);
      window.__stageDraws=[]; window.__stageDisposals=0;
      const ready=new Promise((resolve,reject)=>window.__stageSettle=(fail=false)=>{
        prepared=true; fail ? reject(new Error('Late stage failure')) : resolve();
      });
      onProgress(.25);
      return { ready, draw(time,reduced){window.__stageDraws.push({time,reduced,disposed});
          if(disposed)throw Error('Disposed stage drew again'); if(!prepared)return null; return {};},
        metrics:()=>({replay:{duration:4,landmarks:{finishTime:1,slideStopTime:2}}}),
        dispose(){if(disposed)return;disposed=true;window.__stageDisposals++;canvas.remove();} };
    }`,
    }),
  );
  await page.goto(new URL('/completion-overlay-fixture', base).href);
  await page.evaluate(
    async ({ disposeBeforeFilm }) => {
      const [
        { createCompletionOverlay },
        { createCompletionCinematic },
        { bindMenuGamepad },
      ] = await Promise.all([
        import('/src/frontend/completion-overlay.js'),
        import('/src/frontend/completion-cinematic.js'),
        import('/src/input/menu-gamepad.js'),
      ]);
      document.querySelector('#invoker').focus();
      window.__fixtureLife = new AbortController();
      bindMenuGamepad(window.__fixtureLife.signal);
      window.__fixtureCloses = 0;
      window.__fixtureOverlay = createCompletionOverlay({
        host: document.querySelector('#fixture'),
        settings: { reducedMotion: true },
        signal: window.__fixtureLife.signal,
        onClose: () => window.__fixtureCloses++,
      });
      window.__stageCreates = 0;
      window.__playbackCallbacks = 0;
      window.__playbackListenerSignals = [];
      const addEventListener = EventTarget.prototype.addEventListener;
      if (disposeBeforeFilm) {
        window.__fixtureOverlay.dispose();
        EventTarget.prototype.addEventListener = function (
          type,
          listener,
          options,
        ) {
          if (
            (this === window || this === document) &&
            ['blur', 'focus', 'visibilitychange'].includes(type)
          ) {
            window.__playbackListenerSignals.push(options?.signal);
            const original = listener;
            listener = function (...args) {
              window.__playbackCallbacks++;
              return original.apply(this, args);
            };
          }
          return addEventListener.call(this, type, listener, options);
        };
      }
      try {
        window.__fixtureFilm = createCompletionCinematic({
          overlay: window.__fixtureOverlay,
          settings: { reducedMotion: true },
        });
      } finally {
        EventTarget.prototype.addEventListener = addEventListener;
      }
      window.__fixtureRoot = window.__fixtureOverlay.element;
    },
    { disposeBeforeFilm },
  );
}
const settleBrowser = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

async function launchHorizonFinal(page) {
  await page.goto(url());
  await ready(page);
  await page.getByRole('button', { name: /^Championships/ }).click();
  await page.locator('.race-actions [data-action="cup-resume"]').click();
  await page.waitForFunction(
    () =>
      window.__releaseRace && window.__VN_FRONTEND.getState().screen === 'race',
  );
  const current = await state(page);
  assert.equal(current.loadedId, 'shatterline');
  assert.equal(current.cup.state.eventIndex, 2);
  assert.equal(current.cup.state.results.length, 2);
}
function horizonAward(current) {
  assert.equal(current.career.state.finishes, 3);
  assert.equal(current.career.state.wins, 3);
  assert.equal(current.career.state.points, 15);
  assert.ok(current.career.state.cups.includes('horizon'));
  assert.ok(current.career.state.claims.includes('ship-kestrel'));
  assert.equal(current.cupCollection.cups.horizon.points, 75);
  assert.equal(current.cupCollection.cups.horizon.difficulty, 'hard');
}
function courseFinishFixture(mode) {
  if (mode === 'freestyle')
    return {
      mode,
      playerValid: true,
      medal: 'Gold',
      score: 30000,
      bestChain: 5,
      landed: 5,
      clean: 5,
      best: 30000,
      improved: true,
      saved: true,
      legs: Array.from({ length: 5 }, (_, i) => ({
        id: `transfer-${i + 1}`,
        landed: true,
        clean: true,
        perfect: false,
        reason: 'Clean banked catch',
        tricks: [],
        bank: 2000 * (i + 1),
      })),
    };
  if (mode === 'eliminator') {
    const event = createEliminatorEvent({ ids: RACE_ORDER });
    event.step(
      102,
      RACE_ORDER.map((id, i) => ({ id, distance: 1000 - i * 20, valid: true })),
    );
    assert.equal(event.snapshot().result.won, true);
    return event.snapshot().result;
  }
  const mission = createInterceptorEvent({
    difficulty: 'easy',
    escapeDistance: 8600,
  });
  for (let i = 0; i < 100 && mission.snapshot().health > 0; i++)
    mission.hit({
      source: 'player',
      target: 'goliath',
      kind: 'repulsor',
      equipment: 'lance',
      key: `fixture-${i}`,
    });
  mission.step(1 / 120, { targetDistance: 300, playerDistance: 0 });
  assert.equal(mission.snapshot().result.won, true);
  return mission.snapshot().result;
}
try {
  if (!responsive) {
    await check(
      'sequential mode completion opens and launches the next course without reload',
      fixture({ starterCups: MODE_UNLOCKS.map(({ cupId }) => cupId) }),
      async (page) => {
        await page.goto(url());
        await ready(page);
        const documentMark = await page.evaluate(
          () => (window.__releaseDocumentMark = crypto.randomUUID()),
        );
        for (const {
          mode,
          cupId,
          levelIds: [first, next],
        } of MODE_UNLOCKS) {
          await page.locator(`[data-action="${mode}"]`).click();
          await page.locator(`[data-level="${first}"]`).click();
          assert.equal(
            await page
              .locator(`[data-level="${next}"]`)
              .getAttribute('data-locked'),
            'true',
          );
          const before = careerUnlockProgress((await state(page)).career.state);
          assert.equal(before.total, 37);
          assert.equal(
            before.items.find(({ id }) => id === next).collected,
            false,
          );
          await page.locator('[data-action="launch"]').click();
          await page.waitForFunction(
            (id) =>
              window.__VN_FRONTEND.getState().loadedId === id &&
              window.__VN_FRONTEND.getState().screen === 'race',
            first,
          );
          // Classification fixtures exercise real settlement and menu state;
          // this is deliberately not a native driving or combat simulation.
          await page.evaluate(
            (result) => window.__releaseRace.finishCourse(result),
            courseFinishFixture(mode),
          );
          await page.waitForFunction(
            () => window.__VN_FRONTEND.getState().screen === 'results',
          );
          assert.match(
            await page.locator('.course-result-progress').textContent(),
            /unlocked\./,
          );
          const profile = (await state(page)).career.state;
          assert.ok(profile.finishedCourses.includes(first));
          assert.equal(
            profile.claims.includes(next),
            false,
            'course unlocks are derived, not equipment claims',
          );
          const after = careerUnlockProgress(profile);
          assert.equal(after.total, 37);
          assert.equal(after.courseCount, before.courseCount + 1);
          assert.equal(
            after.items.find(({ id }) => id === next).collected,
            true,
          );
          await page.locator('[data-action="change"]').click();
          assert.equal(
            await page
              .locator('.career-progress-bar')
              .getAttribute('aria-valuenow'),
            String(after.collected),
          );
          assert.deepEqual(
            await page
              .locator('.career-progress-notch')
              .evaluateAll((notches) =>
                notches.map((notch) => notch.classList.contains('is-earned')),
              ),
            Array.from({ length: after.total }, (_, i) => i < after.collected),
            'new unlocks extend the filled section without leaving holes',
          );
          await page.locator('[data-action="career"]').click();
          assert.equal(
            await page
              .locator(
                `.career-course-card.is-completed[data-course="${first}"]`,
              )
              .count(),
            1,
          );
          assert.equal(
            await page
              .locator(
                `.career-course-card.is-available[data-course="${next}"]`,
              )
              .count(),
            1,
          );
          assert.match(
            await page.locator('.career-summary').textContent(),
            new RegExp(`${after.collected} / 37 unlocks`),
          );
          await page.locator('.career-page [data-close]').click();
          await page.locator(`[data-level="${next}"]`).click();
          assert.equal(
            await page.locator('[data-action="launch"]').isDisabled(),
            false,
          );
          const entriesBefore = await page.evaluate(
            () => window.__releaseGameEntries.length,
          );
          await page.locator('[data-action="launch"]').click();
          await page.waitForFunction(
            (id) =>
              window.__VN_FRONTEND.getState().loadedId === id &&
              window.__VN_FRONTEND.getState().screen === 'race',
            next,
          );
          const entries = await page.evaluate(
            () => window.__releaseGameEntries,
          );
          assert.equal(entries.length, entriesBefore + 1);
          assert.equal(entries.at(-1).level, next);
          assert.ok(entries.at(-1).access.cupWins.includes(cupId));
          assert.ok(
            entries.at(-1).access.finishedCourses.includes(first),
            'the next world receives refreshed same-session access',
          );
          assert.equal(
            await page.evaluate(() => window.__releaseDocumentMark),
            documentMark,
          );
          await page.evaluate(() => window.__releaseRace.home());
          await ready(page);
        }
      },
      { game: true },
    );
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
        assert.match((await state(page)).error, /37 career unlocks/);
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
      'developer completion requires the exact showcase=1 parameter',
      pending,
      async (page) => {
        for (const query of [
          'dev=1',
          'dev=2',
          'dev=1&showcase=0',
          'dev=2&showcase=completion',
        ]) {
          await page.goto(url(query));
          await ready(page);
          assert.equal((await state(page)).developer, true);
          if (query === 'dev=2') {
            await page.locator('[data-action="quick-race"]').click();
            await page.locator('[data-action="launch"]').click();
            await page.waitForFunction(() => !!window.__releaseRace);
            await page.evaluate(() => window.__releaseRace.win());
            const finished = await state(page);
            assert.equal(finished.screen, 'results');
            assert.equal(finished.career.state.claims.length, 28);
            assert.equal(
              finished.career.state.completion.acknowledged,
              false,
              'the developer win queues a completion without presenting it',
            );
          }
          assert.equal((await state(page)).completion, null, query);
          assert.equal(await page.locator('.completion-cinematic').count(), 0);
          assert.equal(
            await page.evaluate(() =>
              performance
                .getEntriesByType('resource')
                .some((entry) =>
                  /\/src\/frontend\/completion-(cinematic|stage)\.js/.test(
                    new URL(entry.name).pathname,
                  ),
                ),
            ),
            false,
            `${query} never loads the finale`,
          );
        }
        await page.goto(url());
        await phase(page, 'credits');
        assert.equal((await state(page)).completion.shipId, 'needle');
        await creditsClose(page);
      },
      { game: true },
    );
    await check(
      'developer showcase=1 explicitly previews completion without acknowledging the real career',
      pending,
      async (page) => {
        for (const mode of ['1', '2']) {
          await page.goto(url(`dev=${mode}&showcase=1&ship=bastion`));
          await phase(page, 'credits');
          assert.equal((await state(page)).developer, true);
          assert.equal((await state(page)).completion.error, null);
          assert.equal((await state(page)).completion.shipId, 'bastion');
          await page.getByRole('button', { name: /^Close/ }).click();
          await page.waitForFunction(
            () => !window.__VN_FRONTEND.getState().completion,
          );
        }
        await page.goto(url());
        await phase(page, 'credits');
        assert.equal((await state(page)).completion.shipId, 'needle');
        assert.equal(
          (await state(page)).career.state.completion.acknowledged,
          false,
        );
        await creditsClose(page);
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
        await encore.click();
        for (const selector of [
          '[data-cup="encore"] .cup-card-trophy',
          '.cup-cabinet .is-bonus img',
          '.cup-hero-trophy',
        ]) {
          const image = page.locator(selector);
          await image.evaluate((element) => element.decode());
          assert.ok(
            (await image.getAttribute('src')).endsWith(
              '/assets/menu/cups/encore-trophy.webp',
            ),
            `${selector} uses the current Encore export`,
          );
          assert.equal(
            await image.evaluate((element) => element.naturalWidth),
            512,
          );
        }
        assert.equal(
          await encore.evaluate((element) =>
            element.style.getPropertyValue('--cup-accent').toLowerCase(),
          ),
          '#d8dee5',
        );
      },
    );
    await check(
      'the final Horizon score and rewards persist in the hub before results are presented',
      horizonFinal,
      async (page) => {
        await launchHorizonFinal(page);
        await page.evaluate(() => window.__releaseRace.home());
        await page.locator('[data-action="race-tab"]').click();
        assert.equal((await state(page)).screen, 'home');
        await page.locator('[data-action="time-trial"]').focus();
        await page.evaluate(() => window.__releaseRace.cupFinish(false));
        const earned = await state(page);
        horizonAward(earned);
        assert.equal(earned.screen, 'home');
        assert.equal(earned.cup.state.results.length, 3);
        assert.equal(earned.cup.state.phase, 'results');
        assert.equal(earned.cupCelebration, false);
        assert.equal(earned.completion, null);
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'time-trial',
          'the current menu control retains keyboard focus',
        );
        assert.match(
          await page
            .locator('.menu-selection[data-action="circuits"]')
            .textContent(),
          /3 scored/,
        );
        assert.equal(
          await page
            .locator('.cup-cabinet [aria-label="Horizon Cup: trophy earned"]')
            .count(),
          1,
        );
        await page.evaluate(() => window.__releaseRace.cupFinish(false));
        horizonAward(await state(page));
        assert.equal(
          await page.evaluate(() => window.__releaseCelebrations ?? 0),
          0,
          'saving results does not play the celebration',
        );
        await page.getByRole('button', { name: /^Championships/ }).click();
        horizonAward(await state(page));
        await page.reload();
        await ready(page);
        const restored = await state(page);
        horizonAward(restored);
        assert.deepEqual(
          restored.cupCollection.cups.horizon,
          earned.cupCollection.cups.horizon,
          'navigation and reload do not award the trophy again',
        );
        assert.equal(restored.cup.state, null);
      },
      { game: true },
    );
    await check(
      'presenting a saved cup finish reveals its rewards and celebration exactly once',
      horizonFinal,
      async (page) => {
        await launchHorizonFinal(page);
        await page.evaluate(() => window.__releaseRace.cupFinish(false));
        const saved = await state(page);
        horizonAward(saved);
        assert.equal(saved.screen, 'race');
        assert.equal(saved.cupCelebration, false);
        assert.equal(
          await page.evaluate(() => window.__releaseCelebrations ?? 0),
          0,
        );
        await page.evaluate(() => window.__releaseRace.cupFinish());
        assert.equal((await state(page)).screen, 'results');
        assert.equal((await state(page)).cupCelebration, true);
        assert.equal(
          await page.evaluate(() => window.__releaseCelebrations),
          1,
        );
        await page.locator('[data-action="cup-standings"]').click();
        assert.match(
          await page.locator('.result-rewards').textContent(),
          /Kestrel/,
        );
        await page.evaluate(() => window.__releaseRace.cupFinish());
        horizonAward(await state(page));
        assert.equal(
          await page.evaluate(() => window.__releaseCelebrations),
          1,
        );
        assert.equal((await state(page)).cupCelebration, false);
      },
      { game: true },
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
      'eager completion shell can skip and close before its chunk arrives',
      pending,
      async (page) => {
        let release, finished;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        const fulfilled = new Promise((resolve) => {
          finished = resolve;
        });
        await page.route(
          '**/src/frontend/completion-cinematic.js*',
          async (route) => {
            await held;
            await route.fulfill({
              contentType: 'application/javascript',
              body: 'export function createCompletionCinematic(){window.__unexpectedFinaleCreates=(window.__unexpectedFinaleCreates??0)+1;throw Error("Closed finale revived");}',
            });
            finished();
          },
        );
        try {
          await page.goto(url(), { waitUntil: 'domcontentloaded' });
          await page.locator('.completion-loading').waitFor();
          const root = page.locator('.completion-cinematic');
          assert.equal(await root.count(), 1);
          assert.equal(await root.getAttribute('role'), 'dialog');
          assert.equal(
            await root.evaluate((el) => getComputedStyle(el).position),
            'fixed',
            'shell CSS is eager',
          );
          await page.evaluate(() => {
            window.__eagerCompletionRoot = document.querySelector(
              '.completion-cinematic',
            );
          });
          assert.equal(
            await page.evaluate(() =>
              document.activeElement.hasAttribute('data-completion-skip'),
            ),
            true,
          );
          await page.keyboard.press('Tab');
          assert.equal(
            await page.evaluate(() =>
              document.activeElement.hasAttribute('data-completion-skip'),
            ),
            true,
          );
          assert.equal((await state(page)).completion.phase, 'loading');
          assert.equal(
            (await state(page)).career.state.completion.acknowledged,
            false,
          );
          await padButton(page, 1);
          assert.equal((await state(page)).completion.phase, 'credits');
          assert.equal(
            (await state(page)).career.state.completion.acknowledged,
            false,
            'Skip is not acknowledgement',
          );
          assert.equal(
            await page.evaluate(
              () =>
                window.__eagerCompletionRoot ===
                document.querySelector('.completion-cinematic'),
            ),
            true,
          );
          await padButton(page, 0);
          assert.equal((await state(page)).completion, null);
          assert.equal(
            (await state(page)).career.state.completion.acknowledged,
            true,
          );
          assert.equal(
            await page.evaluate(
              () =>
                document.activeElement.dataset.cup ??
                document.activeElement.dataset.action,
            ),
            'encore',
          );
          const saved = await page.evaluate(() =>
            JSON.stringify(Object.entries(localStorage).sort()),
          );
          release();
          await fulfilled;
          await settleBrowser(page);
          assert.equal(await root.count(), 0);
          assert.equal(
            await page.evaluate(() => window.__unexpectedFinaleCreates ?? 0),
            0,
          );
          assert.equal(
            await page.evaluate(() =>
              JSON.stringify(Object.entries(localStorage).sort()),
            ),
            saved,
            'late chunk cannot write career state',
          );
          assert.equal((await state(page)).completion, null);
        } finally {
          release();
        }
      },
    );
    await check(
      'completion chunk adopts the eager shell without replacing its dialog',
      pending,
      async (page) => {
        let release;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        await page.route(
          '**/src/frontend/completion-cinematic.js*',
          async (route) => {
            const response = await route.fetch();
            await held;
            await route.fulfill({ response });
          },
        );
        try {
          await page.goto(url(), { waitUntil: 'domcontentloaded' });
          await page.locator('.completion-loading').waitFor();
          await page.evaluate(() => {
            window.__adoptedCompletionRoot = document.querySelector(
              '.completion-cinematic',
            );
          });
          release();
          await phase(page, 'credits');
          assert.equal(
            await page.evaluate(
              () =>
                window.__adoptedCompletionRoot ===
                document.querySelector('.completion-cinematic'),
            ),
            true,
          );
          assert.equal(await page.locator('.completion-cinematic').count(), 1);
          assert.equal(
            await page.locator('.completion-cinematic .menu-backdrop').count(),
            1,
          );
          await creditsClose(page, { controller: true });
        } finally {
          release();
        }
      },
    );
    await check(
      'pre-disposed completion shell aborts newly attached playback listeners',
      fresh,
      async (page) => {
        await completionLifecycleFixture(page, { disposeBeforeFilm: true });
        const current = await page.evaluate(async () => {
          const snapshot = await window.__fixtureFilm.ready;
          window.dispatchEvent(new Event('blur'));
          window.dispatchEvent(new Event('focus'));
          document.dispatchEvent(new Event('visibilitychange'));
          return {
            phase: snapshot.phase,
            stageCreates: window.__stageCreates,
            stageDraws: window.__stageDraws?.length ?? 0,
            listenerCount: window.__playbackListenerSignals.length,
            listenersAborted: window.__playbackListenerSignals.every(
              (signal) => signal?.aborted,
            ),
            callbacks: window.__playbackCallbacks,
            closes: window.__fixtureCloses,
            focus: document.activeElement.id,
          };
        });
        assert.deepEqual(current, {
          phase: 'disposed',
          stageCreates: 0,
          stageDraws: 0,
          listenerCount: 3,
          listenersAborted: true,
          callbacks: 0,
          closes: 0,
          focus: 'invoker',
        });
        assert.equal(
          await page.locator('.completion-cinematic, #fixture canvas').count(),
          0,
        );
        await page.evaluate(() => window.__fixtureLife.abort());
      },
      { component: true },
    );
    for (const failure of [false, true])
      await check(
        `late ${failure ? 'failed' : 'successful'} stage settlement cannot revive an aborted completion shell`,
        fresh,
        async (page) => {
          await completionLifecycleFixture(page);
          assert.equal(
            await page.evaluate(() => window.__fixtureOverlay.snapshot().phase),
            'loading',
          );
          await page.evaluate(() => window.__fixtureLife.abort());
          assert.equal(await page.locator('.completion-cinematic').count(), 0);
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            'invoker',
          );
          const draws = await page.evaluate(() => window.__stageDraws.length);
          await page.evaluate((fail) => window.__stageSettle(fail), failure);
          await page.evaluate(() => window.__fixtureFilm.ready);
          await settleBrowser(page);
          assert.equal(
            await page
              .locator('.completion-cinematic, #fixture canvas')
              .count(),
            0,
          );
          assert.equal(
            await page.evaluate(() => window.__stageDraws.length),
            draws,
          );
          assert.equal(await page.evaluate(() => window.__stageDisposals), 1);
          assert.equal(
            await page.evaluate(() => window.__fixtureCloses),
            0,
            'abort never acknowledges completion',
          );
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            'invoker',
          );
        },
        { component: true },
      );
    await check(
      'loading Skip preserves credits when its stage becomes ready later',
      fresh,
      async (page) => {
        await completionLifecycleFixture(page);
        await page.keyboard.press('Escape');
        assert.equal(
          await page.evaluate(() => window.__fixtureOverlay.snapshot().phase),
          'credits',
        );
        await page.evaluate(() => window.__stageSettle());
        await page.evaluate(() => window.__fixtureFilm.ready);
        await settleBrowser(page);
        assert.equal(
          await page.evaluate(
            () =>
              window.__fixtureRoot ===
              document.querySelector('.completion-cinematic'),
          ),
          true,
        );
        assert.equal(
          await page.evaluate(() => window.__fixtureOverlay.snapshot().phase),
          'credits',
        );
        assert.equal(
          await page.evaluate(
            () => window.__fixtureOverlay.element.dataset.stageReady,
          ),
          'true',
        );
        assert.equal(await page.evaluate(() => window.__fixtureCloses), 0);
        const draws = await page.evaluate(() => window.__stageDraws.length);
        await settleBrowser(page);
        assert.equal(
          await page.evaluate(() => window.__stageDraws.length),
          draws,
          'late readiness cannot restart playback',
        );
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => window.__fixtureCloses), 1);
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          'invoker',
        );
        await page.evaluate(() => window.__fixtureLife.abort());
      },
      { component: true },
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
          await page.evaluate(() =>
            document.activeElement.textContent.trim().startsWith('Close'),
          ),
          true,
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
        await padButton(page, 1);
        await page.waitForFunction(
          () => !window.__VN_FRONTEND.getState().completion,
        );
        assert.equal(
          (await state(page)).career.state.completion.acknowledged,
          true,
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.activeElement.dataset.cup ??
              document.activeElement.dataset.action,
          ),
          'encore',
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
          assert.match(thanks, /Thx for playing, 3 Encore courses unlocked!/);
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
        `failed completion controls fit and close by touch ${viewport.width}×${viewport.height}`,
        pending,
        async (page) => {
          await page.goto(url());
          await phase(page, 'credits');
          assert.match(
            (await state(page)).completion.error,
            /Injected finale chunk failure/,
          );
          const card = await page.locator('.completion-card').boundingBox();
          assert.ok(
            card.x >= -1 && card.x + card.width <= viewport.width + 1,
            'failed credits fit horizontally',
          );
          assert.equal(
            await page
              .locator('.completion-credits')
              .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            true,
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            true,
          );
          await page.keyboard.press('Shift+Tab');
          assert.equal(
            await page.evaluate(() =>
              document.activeElement.hasAttribute('data-completion-retry'),
            ),
            true,
            'Tab reaches Retry',
          );
          const retry = await page
            .locator('[data-completion-retry]')
            .boundingBox();
          assert.ok(
            retry.y >= -1 && retry.y + retry.height <= viewport.height + 1,
            'focused Retry scrolls into view',
          );
          const close = page.locator('[data-completion-close]');
          await close.scrollIntoViewIfNeeded();
          await close.tap();
          await page.waitForFunction(
            () => !window.__VN_FRONTEND.getState().completion,
          );
          assert.equal(
            (await state(page)).career.state.completion.acknowledged,
            true,
          );
          assert.equal(await page.locator('.completion-cinematic').count(), 0);
          assert.equal(
            await page.evaluate(
              () =>
                document.activeElement.dataset.cup ??
                document.activeElement.dataset.action,
            ),
            viewport.width >= 900 ? 'encore' : 'cup-hub',
          );
        },
        { viewport, failImport: true },
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
