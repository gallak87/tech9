import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import createHalcyonLevel from '../src/levels/halcyon/index.js';
import { createVehicleState } from '../src/physics/index.js';
import {
  RACE_GRID,
  createRacers,
  getRacerControl,
} from '../src/race/racers.js';
import { RACE_FIELD_SIZE, RACE_OPPONENTS } from '../src/race/roster.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createCombatSimulation } from '../src/pickups/combat.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createRace } from '../src/race/index.js';
import {
  createMagneticRuntime,
  advanceSession,
  captureInitial,
} from '../src/core/session-runtime.js';

// Maintained player-flow check. Requires an existing server; writes no artifacts.
const base = process.env.VN_URL;
if (!base) throw new Error('Set VN_URL to an existing dev/preview server.');
const flags = process.argv.slice(2);
assert.ok(
  flags.every((flag) => ['--desktop', '--responsive'].includes(flag)) &&
    flags.length <= 1,
  'Use --desktop or --responsive, or neither for both.',
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : { channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome' }),
});
const url = (query = '') => new URL(`?${query}`, base).href;
const front = (page) => page.evaluate(() => window.__VN_FRONTEND.getState());
const snapshot = (page) =>
  page.evaluate(() => (window.__VN_INSPECTOR ?? window.__VN).getSnapshot());
const inspectorReady = (page) =>
  page.waitForFunction(
    () =>
      window.__VN_INSPECTOR?.ready &&
      window.__VN_FRONTEND.getState().screen === 'inspection',
    null,
    { timeout: 60000 },
  );
const booted = (page) =>
  page.waitForFunction(
    () => window.__VN?.ready || window.__VN_INSPECTOR?.ready,
    null,
    { timeout: 90000 },
  );
const fleetReady = (page) =>
  page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().preload.ready === 4,
    null,
    { timeout: 60000 },
  );
async function check(
  name,
  fn,
  viewport = { width: 1440, height: 900 },
  settings = {},
) {
  if (process.env.VN_CHECK && !new RegExp(process.env.VN_CHECK).test(name))
    return;
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 760,
  });
  try {
    await context.addInitScript(
      (settings) =>
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({
            quality: 'low',
            volume: 0,
            reducedMotion: true,
            difficulty: 'easy',
            ...settings,
          }),
        ),
      settings,
    );
    const page = await context.newPage();
    const faults = [];
    page.on('pageerror', (error) => faults.push(error.message));
    await fn(page);
    assert.deepEqual(faults, [], 'uncaught browser errors');
    console.log(`PASS ${name}`);
  } catch (error) {
    throw new Error(`${name}: ${error.message}`, { cause: error });
  } finally {
    await context.close();
  }
}
async function menuFits(page) {
  const layout = await page.evaluate(() => {
    const shell = document.querySelector('#front-shell');
    const visible = [
      ...shell.querySelectorAll('button, .ship-metrics > div'),
    ].filter((el) => el.getBoundingClientRect().height > 0);
    return {
      vertical: shell.scrollHeight - shell.clientHeight,
      horizontal: shell.scrollWidth - shell.clientWidth,
      outside: visible
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.top < 0 ||
            r.bottom > innerHeight + 1 ||
            r.left < 0 ||
            r.right > innerWidth + 1
          );
        })
        .map((el) => el.textContent),
    };
  });
  assert.ok(
    layout.vertical <= 1,
    `menu overflows vertically by ${layout.vertical}px`,
  );
  assert.ok(
    layout.horizontal <= 1,
    `menu overflows horizontally by ${layout.horizontal}px`,
  );
  assert.deepEqual(layout.outside, [], 'menu controls must remain in view');
}
async function finishInputs(difficulty, initial) {
  const definition = createHalcyonLevel({ shape: false });
  const track = definition.createTrack();
  // V8's platform math differs below a nanometre in the sampled route length.
  // Use the browser's recorded scalar for identities, after checking the route.
  const recordedLength = JSON.parse(initial.runtime.layoutKey)[0];
  assert.ok(Math.abs(track.length - recordedLength) < 1e-7);
  track.length = recordedLength;
  const collisionWorld = await definition.createCollisionWorld?.({ track });
  const physicalWorld = withMagneticBoundaries(track, collisionWorld);
  const dynamics = await (definition.createDynamics ?? createRapierWorld)({
    track,
    collisionWorld: physicalWorld,
  });
  const devices = definition.racing.createDevices(track);
  const combat = createCombatSimulation({ track, collisionWorld, dynamics });
  const createRuntime = (specification = { id: 'player' }) =>
    createDeviceRuntime({
      combat,
      combatId: specification.id,
      track,
      devices,
      identity: definition.racing.identity,
      motion: (definition.racing.createMotion ?? createMagneticRuntime)({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
      }),
    });
  const vehicle = { ...createVehicleState(), ...RACE_GRID.player };
  const runtime = createRuntime();
  const racers = createRacers({ track, devices, dynamics, createRuntime });
  const race = createRace(track, { rulesId: runtime.rulesId });
  const inputs = [];
  try {
    // Production binds every chassis before its fresh-session world rebuild.
    // Replacing a default player box after that rebuild changes collider
    // allocation order and therefore crowded-field contact resolution.
    runtime.reset({ reason: 'initialize', state: vehicle });
    dynamics.reset();
    racers.reset({ enabled: true, difficulty });
    runtime.reset({ reason: 'fresh-lap', state: vehicle });
    const actualInitial = captureInitial(vehicle, runtime, dynamics);
    const differences = [];
    const compareInitial = (actual, expected, path = 'initial') => {
      if (Object.is(actual, expected)) return;
      // Node and browser trig can differ by a few ULPs in an otherwise
      // identical pose. Keep identity/allocation checks exact, allowing only
      // sub-picometre numeric roundoff in this cross-engine fixture check.
      if (
        typeof actual === 'number' &&
        typeof expected === 'number' &&
        Math.abs(actual - expected) <= 1e-12
      )
        return;
      if (
        actual &&
        expected &&
        typeof actual === 'object' &&
        typeof expected === 'object'
      ) {
        for (const key of new Set([
          ...Object.keys(actual),
          ...Object.keys(expected),
        ]))
          compareInitial(actual[key], expected[key], `${path}.${key}`);
      } else {
        const brief = (value) =>
          typeof value === 'string' && value.length > 1000
            ? `${value.length} characters`
            : value;
        differences.push({
          path,
          actual: brief(actual),
          expected: brief(expected),
        });
      }
    };
    compareInitial(actualInitial, initial);
    assert.deepEqual(
      differences,
      [],
      'physical input fixture must match browser body state within numeric roundoff',
    );
    // Generate real inputs against the same ten dynamic bodies as the browser.
    // Legacy ghost-racer trajectories no longer predict contact or finish time.
    // Allow a short runout for platform math to change crowded contact timing;
    // the browser must still prove that all ten finish with valid laps.
    let fieldFinishedAt = Infinity;
    while (vehicle.time < Math.min(180, fieldFinishedAt + 5)) {
      const input = getRacerControl(vehicle, track, {
        difficulty,
        devices,
        runtime,
        nearby: racers.opponents.map((opponent) => opponent.state),
      });
      advanceSession({
        state: vehicle,
        input,
        dt: 1 / 120,
        runtime,
        race,
        racers,
        dynamics,
        emit() {},
      });
      runtime.update({});
      inputs.push({ tick: inputs.length, input });
      if (
        fieldFinishedAt === Infinity &&
        race.history.length >= 2 &&
        racers.opponents.every((opponent) => opponent.finish)
      )
        fieldFinishedAt = vehicle.time;
    }
    assert.ok(
      race.history.length >= 2 &&
        racers.opponents.every((opponent) => opponent.finish),
      'physical input fixture must finish the full field within three minutes',
    );
    return inputs;
  } finally {
    racers.dispose();
    runtime.dispose();
    dynamics.dispose();
    collisionWorld?.dispose();
  }
}
try {
  if (!flags.includes('--responsive')) {
    await check(
      'explicit modes, records and setup without loading worlds',
      async (page) => {
        await page.goto(url('level=halcyon&music=0'));
        await page.locator('[data-action="quick-race"]').focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'time-trial',
        );
        await page.keyboard.press('ArrowDown');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'circuits',
        );
        await page.locator('[data-action="time-trial"]').click();
        assert.equal((await front(page)).intent, 'time-trial');
        assert.equal(await page.locator('[data-difficulty]').count(), 0);
        assert.match(
          await page.locator('[data-action="launch"]').textContent(),
          /Time Trial/,
        );
        await page.locator('[data-action="records"]').click();
        assert.match(
          await page.locator('.records-empty').textContent(),
          /No personal bests yet/,
        );
        await page
          .locator('[data-record-filter="ship"]')
          .selectOption('needle');
        await page.keyboard.press('Escape');
        assert.equal((await front(page)).intent, 'time-trial');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'records',
        );
        await page.locator('[data-action="records"]').click();
        await page
          .locator('[data-record-filter="track"]')
          .selectOption('orbital');
        await page.locator('[data-action="record-trial"]').click();
        assert.equal((await front(page)).selected, 'orbital');
        assert.equal((await front(page)).shipId, 'needle');
        assert.equal((await front(page)).intent, 'time-trial');
        await page.locator('[data-action="practice"]').click();
        assert.match(
          await page.locator('[data-action="launch"]').textContent(),
          /Practice/,
        );
        assert.equal(await page.locator('[data-difficulty]').count(), 0);
        await page.locator('[data-action="cup-hub"]').click();
        assert.equal((await front(page)).intent, 'cup');
        assert.equal(await page.locator('[data-cup]').count(), 4);
        await page.locator('[data-action="cup-hub"]').focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.action),
          'circuits',
        );
        await page.keyboard.press('ArrowRight');
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.cup),
          'founders',
        );
        await page.locator('[data-action="quick-race"]').click();
        assert.equal((await front(page)).intent, 'race');
        assert.equal(await page.locator('[data-difficulty]').count(), 3);
        assert.equal((await front(page)).loadedId, null);
        assert.equal(await page.evaluate(() => !!window.__VN), false);
      },
    );

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
    ]) {
      await check(
        `mode switches preserve the cinematic menu at ${viewport.width}×${viewport.height}`,
        async (page) => {
          await page.goto(url('level=halcyon&music=0'));
          const anchors = () =>
            page.evaluate(() => ({
              backdrop: document
                .querySelector('.menu-backdrop img')
                ?.getAttribute('src'),
              bounds: [
                '.menu-wordmark',
                '.mode-picker',
                '.menu-selection[data-action="circuits"]',
                '.menu-selection[data-action="ship-step"]',
                '.race-actions > .primary',
                '.picker-tabs',
              ].map((selector) => {
                const { x, y, width, height } = document
                  .querySelector(selector)
                  .getBoundingClientRect();
                return { selector, x, y, width, height };
              }),
            }));
          const original = await anchors();
          for (const action of [
            'cup-hub',
            'time-trial',
            'practice',
            'quick-race',
            'cup-hub',
          ]) {
            await page.locator(`[data-action="${action}"]`).click();
            assert.deepEqual(
              await anchors(),
              original,
              `${action} moved the shared menu`,
            );
            await menuFits(page);
            const origin = (await front(page)).screen;
            await page.locator('[data-action="records"]').click();
            assert.deepEqual(
              await anchors(),
              original,
              'records moved the shared menu',
            );
            await menuFits(page);
            // Reopening the active view must not overwrite its Back destination.
            await page.locator('[data-action="records"]').click();
            await page
              .locator('[data-record-filter="ship"]')
              .selectOption('needle');
            await page.locator('[data-action="settings"]').click();
            await page.keyboard.press('Escape');
            assert.equal((await front(page)).screen, 'records');
            await page.locator('[data-action="records-back"]').click();
            assert.equal((await front(page)).screen, origin);
            assert.deepEqual(
              await anchors(),
              original,
              'returning from records moved the menu',
            );
          }
          await page.locator('[data-cup="apex"]').click();
          assert.deepEqual(
            await anchors(),
            original,
            'cup selection moved the shared menu',
          );
          assert.equal(await page.locator('.cup-route li').count(), 4);
          await page.locator('.race-menu [data-action="ship-step"]').click();
          await page.locator('[data-ship="shrike"]').click();
          assert.equal((await front(page)).intent, 'cup');
          assert.deepEqual(
            await anchors(),
            original,
            'cup ship selection moved the shared menu',
          );
          await page.locator('.picker-tabs [data-action="circuits"]').click();
          assert.equal(
            await page
              .locator('[data-cup="apex"]')
              .getAttribute('aria-pressed'),
            'true',
          );
          assert.equal((await front(page)).shipId, 'shrike');
          assert.equal((await front(page)).loadedId, null);
          assert.equal(await page.evaluate(() => !!window.__VN), false);
        },
        viewport,
      );
    }

    await check(
      'keyboard-only menu navigation and focus return',
      async (page) => {
        const focused = async (selector) =>
          assert.equal(
            await page
              .locator(selector)
              .evaluate((el) => el === document.activeElement),
            true,
            `focus should be on ${selector}`,
          );
        const press = async (key, selector) => {
          await page.keyboard.press(key);
          if (selector) await focused(selector);
        };
        await page.goto(url('level=halcyon'));
        await fleetReady(page);
        await focused('[data-action="launch"]');
        await press('ArrowUp', '.menu-selection[data-action="ship-step"]');
        await press('ArrowUp', '.menu-selection[data-action="circuits"]');
        await press('Enter', '[data-level="halcyon"]');
        await press('ArrowRight', '[data-level="orbital"]');
        assert.equal((await front(page)).selected, 'halcyon');
        assert.match(
          await page.locator('.circuit-hero h2').textContent(),
          /Asterion/,
        );
        await press('Space', '[data-level="orbital"]');
        assert.equal((await front(page)).selected, 'orbital');
        await press('End', '[data-level="umbra"]');
        await press('Home', '[data-level="halcyon"]');
        await press('ArrowUp', '.picker-tabs [data-action="circuits"]');
        await press('ArrowRight', '.picker-tabs [data-action="ship-step"]');
        await press('ArrowDown', 'button[data-ship="kestrel"]');
        await press('ArrowRight', 'button[data-ship="shrike"]');
        assert.equal((await front(page)).shipId, 'kestrel');
        await press('Space', 'button[data-ship="shrike"]');
        assert.equal((await front(page)).shipId, 'shrike');
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().preview?.selected === 'shrike',
        );
        await press('Tab', '.ship-preview canvas');
        await press('ArrowLeft', '.ship-preview canvas');
        await press('Escape', '.menu-selection[data-action="ship-step"]');
        await press('ArrowDown', '[data-action="launch"]');
        await press('ArrowDown', '[data-difficulty="easy"]');
        await press('ArrowRight', '[data-difficulty="medium"]');
        assert.equal(
          await page
            .locator('[data-difficulty="medium"]')
            .getAttribute('aria-pressed'),
          'true',
        );
        for (const align of await page
          .locator('[data-difficulty]')
          .evaluateAll((items) =>
            items.map((item) => getComputedStyle(item).textAlign),
          ))
          assert.equal(align, 'center');
        await press('ArrowDown', '[data-action="records"]');
        await press('ArrowDown', '[data-action="inspect"]');
        await press('Enter');
        await inspectorReady(page);
        await press('Escape', '[data-action="inspect"]');
        await press('ArrowDown', '[data-action="settings"]');
        await press('Enter', '[data-action="settings-back"]');
        await press('Tab', '[data-setting="quality"]');
        // Native select typeahead also works in headless macOS Chrome.
        await press('h');
        assert.equal(
          await page.locator('[data-setting="quality"]').inputValue(),
          'high',
        );
        await press('Tab', '[data-setting="volume"]');
        await press('ArrowRight');
        assert.equal(
          await page.locator('[data-setting="volume"]').inputValue(),
          '0.05',
        );
        await press('Tab', '[data-setting="reducedMotion"]');
        await press('Space');
        assert.equal(
          await page.locator('[data-setting="reducedMotion"]').isChecked(),
          false,
        );
        await press('Escape', '[data-action="settings"]');
        await page.locator('.menu-selection[data-action="circuits"]').focus();
        await press('ArrowRight', '[data-level="orbital"]');
        await press('End', '[data-level="umbra"]');
        await press('s', '[data-action="settings-back"]');
        await press('Escape', '[data-level="umbra"]');
        assert.equal((await front(page)).selected, 'orbital');
        await press('Tab', '.music-previous');
        await press('Tab', '.music-play');
        await press('Shift+Tab', '.music-previous');
        await press('Shift+Tab', '[data-level="umbra"]');
        await press('Escape', '.menu-selection[data-action="circuits"]');
        await press('ArrowDown', '.menu-selection[data-action="ship-step"]');
        await press('ArrowDown', '[data-action="launch"]');
        assert.equal(await page.evaluate(() => !!window.__VN), false);
        let release;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        await page.route(
          /\/(?:src\/core\/game\.js|assets\/game-[^/]+\.js)(?:\?|$)/,
          async (route) => {
            await gate;
            await route.continue().catch(() => {});
          },
        );
        try {
          await press('Enter', '[data-action="cancel"]');
          assert.equal((await front(page)).screen, 'loading');
          await press('Enter', '[data-action="launch"]');
          await page.locator('[data-action="practice"]').click();
          await page.locator('[data-action="launch"]').focus();
          await press('Enter', '[data-action="cancel"]');
          await press('Escape', '[data-action="launch"]');
        } finally {
          release();
          await page.unrouteAll({ behavior: 'wait' });
        }
      },
    );
    await check(
      'setup, hover/keyboard selection, settings and fleet cache',
      async (page) => {
        await page.goto(url('level=halcyon'));
        await fleetReady(page);
        assert.match(
          await page.locator('[data-action="launch"]').textContent(),
          /9 rivals/,
        );
        assert.equal(
          await page.evaluate(() => !!window.__VN),
          false,
          'landing loaded a world',
        );
        assert.equal(
          (await front(page)).preview,
          null,
          'Tracks does not create the ship studio',
        );
        await page.evaluate(() => {
          window.retainedPlayer = document.querySelector('[data-music-player]');
        });
        const routes = await page.evaluate(() => window.__VN_FRONTEND.routes);
        const circuits = routes;
        assert.equal(
          await page.locator('.circuit-card').count(),
          circuits.length,
        );
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.circuit-card img')].every(
            (image) => image.complete && image.naturalWidth === 640,
          ),
        );
        assert.equal(
          await page.locator('.circuit-card img').count(),
          circuits.filter((route) => route.preview).length,
        );
        for (const [from, key, to] of [
          ['worldspire', 'ArrowDown', 'helion'],
          ['nightweir', 'ArrowDown', 'umbra'],
          ['zephyr', 'ArrowDown', 'nightweir'],
          ['helion', 'ArrowUp', 'worldspire'],
        ]) {
          await page.locator(`[data-level="${from}"]`).focus();
          await page.keyboard.press(key);
          assert.equal(
            await page.evaluate(() => document.activeElement.dataset.level),
            to,
          );
        }
        await page.locator('[data-level="vesper"]').hover();
        assert.equal((await front(page)).selected, 'halcyon');
        assert.equal(
          await page.locator('.circuit-hero h2').textContent(),
          'Vesper Canopy',
        );
        await page.locator('[data-level="vesper"]').focus();
        await page.keyboard.press('Enter');
        assert.equal((await front(page)).screen, 'home');
        assert.equal((await front(page)).selected, 'vesper');
        assert.equal(
          await page
            .locator('[data-level="vesper"]')
            .getAttribute('aria-pressed'),
          'true',
        );
        assert.match(
          await page
            .locator('.menu-selection[data-action="circuits"]')
            .textContent(),
          /Vesper Canopy/,
        );
        await page.locator('.picker-tabs [data-action="ship-step"]').click();
        assert.equal(await page.locator('.ship-metrics > div').count(), 5);
        assert.equal(
          await page.evaluate(() => !!window.__VN),
          false,
          'track selection must not construct a world',
        );
        await page.locator('button[data-ship="shrike"]').hover();
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().preview?.selected === 'shrike',
        );
        assert.equal((await front(page)).shipId, 'kestrel');
        await page.locator('button[data-ship="bastion"]').focus();
        await page.keyboard.press('Enter');
        assert.equal((await front(page)).shipId, 'bastion');
        await page.locator('[data-difficulty="hard"]').click();
        assert.equal(
          await page
            .locator('.race-difficulty [aria-pressed="true"]')
            .textContent(),
          'hard',
        );
        await page.locator('[data-action="settings"]').click();
        assert.equal(await page.locator('.front-heading').count(), 0);
        const headerGroup = await page
          .locator('.front-header')
          .evaluate((el) => {
            const label = el
              .querySelector('.header-label')
              .getBoundingClientRect();
            const back = el
              .querySelector('[data-action="settings-back"]')
              .getBoundingClientRect();
            return back.left - label.right;
          });
        assert.ok(headerGroup >= 0 && headerGroup <= 24);
        assert.match(
          await page.locator('.front-content').textContent(),
          /Keyboard/,
        );
        assert.equal(await page.locator('[data-action="settings"]').count(), 0);
        await page.locator('#front-shell').evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        const back = page.locator(
          '.front-header [data-action="settings-back"]',
        );
        const backBounds = await back.boundingBox();
        assert.ok(backBounds.y >= 0 && backBounds.y + backBounds.height <= 78);
        await back.click();
        assert.equal((await front(page)).screen, 'setup');
        await page.locator('[data-action="settings"]').click();
        await page.keyboard.press('Escape');
        assert.equal((await front(page)).screen, 'setup');
        assert.equal((await front(page)).shipId, 'bastion');
        assert.equal(await page.locator('[data-music-player]').count(), 1);
        assert.equal(
          await page.evaluate(
            () =>
              window.retainedPlayer ===
              document.querySelector('[data-music-player]'),
          ),
          true,
        );
        await page.locator('.picker-tabs [data-action="circuits"]').click();
        assert.equal(await page.locator('.circuit-card').count(), 13);
        assert.equal(
          await page.locator('.circuit-card [data-type="sprint"]').count(),
          3,
        );
        assert.equal(
          await page.locator('.circuit-card [data-type="circuit"]').count(),
          10,
        );
        assert.equal(await page.locator('.track-group').count(), 3);
        assert.equal(await page.locator('.card-challenge').count(), 0);
        assert.match(
          await page
            .locator('[data-level="halcyon"]')
            .getAttribute('aria-label'),
          /Warm-up/,
        );
        assert.match(
          await page
            .locator('[data-level="worldspire"]')
            .getAttribute('aria-label'),
          /Medium, downhill sprint/,
        );
        await page.locator('[data-level="shatterline"]').hover();
        assert.equal((await front(page)).selected, 'vesper');
        assert.equal(
          await page.locator('.circuit-hero .track-type-badge').textContent(),
          'Sprint',
        );
        await page.locator('[data-level="shatterline"]').click();
        assert.equal((await front(page)).screen, 'circuits');
        assert.equal(
          await page
            .locator('[data-level="shatterline"]')
            .getAttribute('aria-pressed'),
          'true',
        );
        assert.match(
          await page.locator('[data-action="launch"]').textContent(),
          /Sprint/,
        );
        assert.match(
          await page.locator('[data-action="practice"]').textContent(),
          /Practice/,
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
      },
    );
    for (const viewport of [
      { width: 1035, height: 730 },
      { width: 900, height: 700 },
      { width: 1100, height: 575 },
    ]) {
      await check(
        `compact desktop menu ${viewport.width}×${viewport.height}`,
        async (page) => {
          await page.goto(url('level=zephyr'));
          await fleetReady(page);
          assert.equal(await page.locator('.circuit-card').count(), 13);
          assert.ok(
            await page
              .locator('.circuit-hero')
              .evaluate((el) => el.clientHeight >= 180),
          );
          assert.equal(
            await page
              .locator('.menu-wordmark')
              .evaluate((el) => getComputedStyle(el).fontSize),
            '32px',
          );
          await menuFits(page);
          await page.locator('[data-level="worldspire"]').click();
          assert.equal((await front(page)).screen, 'home');
          await page.locator('.picker-tabs [data-action="ship-step"]').click();
          await page.waitForFunction(
            () =>
              window.__VN_FRONTEND.getState().preview?.selected === 'kestrel',
          );
          assert.equal(await page.locator('.ship-metrics > div').count(), 5);
          await menuFits(page);
          await page.locator('[data-difficulty="hard"]').click();
          assert.match(
            await page
              .locator('[data-action="launch"]')
              .getAttribute('aria-label'),
            /hard opponents/,
          );
          await menuFits(page);
        },
        viewport,
      );
    }
    await check(
      'menu race/practice launch, retained session and music transport',
      async (page) => {
        await page.goto(url('level=halcyon'));
        await fleetReady(page);
        await page.locator('.picker-tabs [data-action="ship-step"]').click();
        await page.locator('[data-ship="needle"]').click();
        await page.evaluate(() => {
          window.retainedAudio = document.querySelector('audio');
          window.retainedPlayer = document.querySelector('[data-music-player]');
        });
        await page.locator('[data-action="launch"]').click();
        await booted(page);
        await page.waitForFunction(
          () => window.__VN.getSnapshot().mode === 'racing',
          null,
          { timeout: 20000 },
        );
        assert.equal(await page.locator('#front-shell').isVisible(), false);
        assert.equal((await snapshot(page)).ship.id, 'needle');
        assert.equal(
          (await snapshot(page)).competition.standings.length,
          RACE_FIELD_SIZE,
        );
        await page.keyboard.press('Escape');
        const paused = await snapshot(page);
        await page.locator('#quality').selectOption('high');
        await page.locator('#volume').evaluate((el) => {
          el.value = '0.3';
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.locator('#motion').uncheck();
        await page.locator('#pause-difficulty').selectOption('hard');
        const adjusted = await snapshot(page);
        assert.equal(adjusted.mode, 'paused');
        assert.equal(
          adjusted.tick,
          paused.tick,
          'adjusting settings must not advance the race',
        );
        assert.equal(adjusted.settings.quality, 'high');
        assert.equal(adjusted.settings.volume, 0.3);
        assert.equal(adjusted.settings.reducedMotion, false);
        assert.equal(adjusted.settings.difficulty, 'hard');
        assert.equal(
          await page.evaluate(() => window.__VN.getReplay().difficulty),
          'easy',
        );
        await page.locator('#resume').click();
        assert.equal((await snapshot(page)).mode, 'racing');
        await page.keyboard.press('Escape');
        assert.equal(
          await page.evaluate(() => window.__VN.getReplay().difficulty),
          'easy',
        );
        await page.locator('#restart').click();
        await page.waitForFunction(
          () => window.__VN.getSnapshot().mode === 'countdown',
        );
        assert.equal(
          await page.evaluate(() => window.__VN.getReplay().difficulty),
          'hard',
        );
        await page.keyboard.press('Escape');
        await page.locator('#home').click();
        assert.equal((await front(page)).screen, 'home');
        await page.locator('[data-action="settings"]').click();
        assert.equal(
          await page
            .locator('#front-shell [data-setting="quality"]')
            .inputValue(),
          'high',
        );
        assert.equal(
          await page
            .locator('#front-shell [data-setting="volume"]')
            .inputValue(),
          '0.3',
        );
        assert.equal(
          await page
            .locator('#front-shell [data-setting="reducedMotion"]')
            .isChecked(),
          false,
        );
        await page
          .locator('#front-shell [data-setting="quality"]')
          .selectOption('low');
        await page
          .locator('#front-shell [data-setting="reducedMotion"]')
          .check();
        await page.locator('[data-action="settings-back"]').click();
        await page.evaluate(() => {
          window.retainedRuntime = window.__VN;
        });
        await page.locator('[data-action="resume-session"]').click();
        assert.equal(
          await page.evaluate(() => window.retainedRuntime === window.__VN),
          true,
        );
        assert.equal(await page.locator('#quality').inputValue(), 'low');
        assert.equal(await page.locator('#motion').isChecked(), true);
        await page.locator('#home').click();
        await page.locator('[data-action="practice"]').click();
        await page.locator('[data-action="launch"]').click();
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().screen === 'race',
        );
        assert.equal((await front(page)).intent, 'practice');
        assert.equal((await snapshot(page)).ship.id, 'needle');
        assert.equal(
          await page.evaluate(
            () =>
              window.retainedAudio === document.querySelector('audio') &&
              window.retainedPlayer ===
                document.querySelector('[data-music-player]'),
          ),
          true,
        );
        await page.keyboard.press('Escape');
      },
    );
    await check(
      'cold start retains every light, runs Nightweir water and warms driving shaders',
      async (page) => {
        await page.addInitScript(() => {
          const nativeFrame = window.requestAnimationFrame;
          window.__countdownCheck = { stalled: false, lights: [] };
          window.requestAnimationFrame = (callback) =>
            nativeFrame((time) => {
              const check = window.__countdownCheck;
              if (
                !check.stalled &&
                window.__VN?.getSnapshot().mode === 'countdown'
              ) {
                check.stalled = true;
                // Reproduce a driver/upload stall longer than the old timer.
                const until = performance.now() + 3500;
                while (performance.now() < until) {
                  // Deliberate main-thread stall.
                }
              }
              callback(time);
            });
          let previous = null;
          function observe() {
            const light = document.querySelector('#start-lights');
            const step =
              light && !light.classList.contains('hidden')
                ? Number(light.dataset.step)
                : null;
            if (step !== null && step !== previous) {
              window.__countdownCheck.lights.push({
                step,
                at: performance.now(),
                raceTime: window.__VN.getSnapshot().vehicle.time,
                flowTime: window.__VN
                  .getScene()
                  .scene.getObjectByName('Nightweir / the floodgates').userData
                  .flowTime,
              });
            }
            previous = step;
            nativeFrame(observe);
          }
          nativeFrame(observe);
        });
        await page.goto(url('level=nightweir&music=0'));
        await page.locator('[data-action="launch"]').click();
        await booted(page);
        await page.evaluate(() =>
          window.__VN.configure({ reducedMotion: false }),
        );
        await page.waitForFunction(
          () => window.__countdownCheck.lights.some(({ step }) => step === 0),
          null,
          { timeout: 20000 },
        );
        const { stalled, lights } = await page.evaluate(
          () => window.__countdownCheck,
        );
        assert.equal(stalled, true);
        assert.deepEqual(
          lights.map(({ step }) => step),
          [3, 2, 1, 0],
        );
        for (let i = 0; i < 3; i++) {
          assert.equal(lights[i].raceTime, 0, 'race must wait for green');
          assert.ok(
            lights[i + 1].at - lights[i].at >= 950,
            'each light gets its full beat',
          );
        }
        assert.ok(lights[1].flowTime > 0, 'water runs before green');
        for (let i = 1; i < 3; i++)
          assert.ok(
            lights[i + 1].flowTime >= lights[i].flowTime,
            'water keeps flowing through countdown and green',
          );
        const drivingPrograms = () =>
          page.evaluate(() =>
            window.__VN
              .getScene()
              .renderer.info.programs.map(({ cacheKey }) => cacheKey),
          );
        const warmed = new Set(await drivingPrograms());
        await page.keyboard.down('w');
        await page.waitForFunction(
          () => window.__VN.getSnapshot().vehicle.distance >= 500,
          null,
          { timeout: 20000 },
        );
        await page.keyboard.up('w');
        await page.evaluate(() => window.__VN.pause());
        assert.ok(
          (await drivingPrograms()).every((key) => warmed.has(key)),
          'the opening district must reuse warmed geometry and postprocess shaders',
        );
        await page.evaluate(() =>
          window.__VN.loadScenario('market-cut-launch', 7),
        );
        await page.keyboard.down('w');
        await page.waitForFunction(() => window.__VN.getSnapshot().tick >= 480);
        await page.keyboard.up('w');
        await page.evaluate(() => window.__VN.pause());
        assert.ok(
          (await drivingPrograms()).every((key) => warmed.has(key)),
          'the jump around 49% must reuse warmed geometry and postprocess shaders',
        );
      },
      undefined,
      { quality: 'high', reducedMotion: false },
    );
    await check(
      'held countdown controls survive green and release normally',
      async (page) => {
        for (const [level, boostKey] of [
          ['halcyon', 'ShiftLeft'],
          ['nacre', 'ShiftRight'],
        ]) {
          await page.goto(url(`level=${level}&music=0`));
          await page.locator('[data-action="launch"]').click();
          await booted(page);
          await page.waitForFunction(
            () => window.__VN.getSnapshot().mode === 'countdown',
          );
          await page.keyboard.down('w');
          await page.keyboard.down(boostKey);
          const waiting = await snapshot(page);
          assert.equal(waiting.input.throttle, 1);
          assert.equal(waiting.input.boost, true);
          assert.equal(
            waiting.vehicle.time,
            0,
            'countdown must not advance driving',
          );
          assert.equal(
            waiting.vehicle.energy,
            100,
            'countdown must not spend reserve',
          );
          await page.waitForFunction(
            () => window.__VN.getSnapshot().mode === 'racing',
          );
          const green = await snapshot(page);
          assert.equal(
            green.input.throttle,
            1,
            `${level}: held throttle lost at green`,
          );
          assert.equal(
            green.input.boost,
            true,
            `${level}: held Shift lost at green`,
          );
          await page.waitForFunction(
            () => window.__VN.getSnapshot().vehicle.boosting,
            null,
            { timeout: 4000 },
          );
          assert.ok((await snapshot(page)).vehicle.energy < 100);
          await page.keyboard.up(boostKey);
          await page.waitForFunction(
            () => !window.__VN.getSnapshot().vehicle.boosting,
          );
          assert.equal((await snapshot(page)).input.boost, false);
          await page.keyboard.down(boostKey);
          await page.keyboard.press('Escape');
          const paused = await snapshot(page);
          assert.equal(paused.mode, 'paused');
          assert.equal(paused.input.throttle, 0);
          assert.equal(paused.input.boost, false);
          await page.keyboard.up(boostKey);
          await page.keyboard.up('w');
          await page.locator('#resume').click();
          await page.keyboard.down('w');
          await page.keyboard.down(boostKey);
          await page.evaluate(() => window.dispatchEvent(new Event('blur')));
          const blurred = await snapshot(page);
          assert.equal(blurred.mode, 'paused');
          assert.equal(blurred.input.throttle, 0);
          assert.equal(blurred.input.boost, false);
          await page.keyboard.up(boostKey);
          await page.keyboard.up('w');
        }
      },
    );
    await check(
      'race lights, retained session, inspection, finish and continue/pause',
      async (page) => {
        await page.goto(url('level=halcyon&music=0'));
        await page.locator('[data-action="launch"]').click();
        await booted(page);
        await page.waitForFunction(
          () =>
            document.querySelector(
              '.start-lights.go, #start-lights.go, #countdown.go, .go i.lit',
            ),
          null,
          { timeout: 15000 },
        );
        const lights = await page.locator('.go i').evaluateAll((nodes) =>
          nodes.map((node) => ({
            lit: node.classList.contains('lit'),
            color: getComputedStyle(node).backgroundColor,
          })),
        );
        assert.equal(lights.length, 3);
        assert.ok(
          lights.every(
            (light) => light.lit && light.color === 'rgb(59, 191, 105)',
          ),
        );
        assert.equal(
          (await snapshot(page)).competition.standings.length,
          RACE_FIELD_SIZE,
        );
        assert.equal(
          await page.locator('#race-roster li').count(),
          RACE_FIELD_SIZE,
        );
        await page.keyboard.press('Escape');
        assert.equal((await snapshot(page)).mode, 'paused');
        await page.evaluate(() => {
          window.retainedRuntime = window.__VN;
        });
        await page.locator('#home').click();
        assert.equal((await front(page)).screen, 'home');
        await page.locator('[data-action="resume-session"]').click();
        assert.ok(
          await page.evaluate(() => window.__VN === window.retainedRuntime),
        );
        assert.equal((await snapshot(page)).mode, 'paused');
        await page.locator('#resume').click();
        await page.keyboard.press('i');
        assert.equal((await snapshot(page)).mode, 'racing');
        await page.evaluate(() => window.__VN.inspect());
        assert.equal((await snapshot(page)).mode, 'inspection');
        await page.keyboard.press('Escape');
        assert.equal((await snapshot(page)).mode, 'racing');
        const replay = await page.evaluate(() => {
          window.__VN.pause();
          return window.__VN.getReplay();
        });
        assert.equal(replay.field.opponents.length, RACE_OPPONENTS.length);
        for (const legacy of [
          { ...replay, field: undefined },
          {
            ...replay,
            field: {
              ...replay.field,
              opponents: replay.field.opponents.slice(0, 3),
            },
          },
        ]) {
          const rejection = await page.evaluate((recording) => {
            const before = window.__VN.getSnapshot();
            let message;
            try {
              window.__VN.playReplay(recording);
            } catch (error) {
              message = error.message;
            }
            return {
              message,
              unchanged:
                JSON.stringify(before) ===
                JSON.stringify(window.__VN.getSnapshot()),
            };
          }, legacy);
          assert.match(rejection.message, /Replay version mismatch/);
          assert.equal(rejection.unchanged, true);
        }
        const finished = await page.evaluate(
          (recording) => window.__VN.playReplay(recording),
          {
            ...replay,
            inputs: await finishInputs(replay.difficulty, replay.initial),
          },
        );
        assert.ok(finished.competition.playerFinished);
        await page.evaluate(() => window.__VN.resume());
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().screen === 'results',
          null,
          { timeout: 15000 },
        );
        assert.equal(
          await page.locator('.results-list li').count(),
          RACE_FIELD_SIZE,
        );
        assert.ok(
          finished.competition.results.standings.every(
            (racer) => racer.finished && racer.valid,
          ),
          JSON.stringify(finished.competition.results.standings),
        );
        assert.equal(await page.locator('canvas#world').isVisible(), true);
        await page.locator('[data-action="continue"]').click();
        await page.keyboard.press('Escape');
        assert.equal((await front(page)).screen, 'race');
        assert.equal((await snapshot(page)).mode, 'paused');
      },
    );
    await check(
      'ten-pilot HUD and full AI inspector stay clear on desktop',
      async (page) => {
        await page.goto(url('level=halcyon&music=0'));
        await page.locator('[data-action="launch"]').click();
        await booted(page);
        await page.waitForFunction(
          () => window.__VN.getSnapshot().mode === 'racing',
        );
        const layout = await page.evaluate(() => {
          const rect = (selector) =>
            document.querySelector(selector).getBoundingClientRect().toJSON();
          return {
            roster: rect('#race-roster'),
            map: rect('#minimap'),
            speed: rect('.telemetry .speed'),
            rows: [...document.querySelectorAll('#race-roster li')].map(
              (row) => ({
                id: row.dataset.racer,
                color: getComputedStyle(row).getPropertyValue('--racer-color'),
              }),
            ),
          };
        });
        assert.equal(layout.rows.length, RACE_FIELD_SIZE);
        assert.equal(
          new Set(layout.rows.map(({ color }) => color)).size,
          RACE_FIELD_SIZE,
        );
        assert.ok(layout.map.bottom < layout.roster.top);
        assert.ok(layout.roster.bottom < layout.speed.top);
        assert.ok(
          layout.roster.left > 1280 * 0.7,
          'field stays away from the chase craft',
        );
        await page.keyboard.press('Escape');
        await page.locator('#home').click();
        await page.goto(url('inspect=1&ship=kestrel&level=halcyon&dev=1'));
        await booted(page);
        await page.getByRole('tab', { name: 'AI racers' }).click();
        assert.equal(
          await page.locator('[data-rival]').count(),
          RACE_OPPONENTS.length,
        );
        const last = RACE_OPPONENTS.at(-1).id;
        await page.locator('[data-rival="rook"]').focus();
        await page.keyboard.press('End');
        await page.waitForFunction(
          (id) => window.__VN_INSPECTOR.getSnapshot().inspection.rivalId === id,
          last,
        );
        assert.equal(
          await page
            .locator(`[data-rival="${last}"]`)
            .getAttribute('aria-checked'),
          'true',
        );
        const picker = await page
          .locator('#inspection-rivals-picker')
          .boundingBox();
        const back = await page.locator('#inspect-back').boundingBox();
        assert.ok(picker.y + picker.height < back.y);
        assert.ok(back.y + back.height <= 720);
        assert.equal((await snapshot(page)).ship.id, 'kestrel');
      },
      { width: 1280, height: 720 },
    );
    await check('AI inspector tab requires dev=1', async (page) => {
      for (const query of ['', '&dev=0', '&dev=true', '&dev=1']) {
        await page.goto(url(`inspect=1&ship=kestrel${query}`));
        await inspectorReady(page);
        const enabled = query === '&dev=1';
        assert.equal(
          await page.getByRole('tab', { name: 'AI racers' }).count(),
          enabled ? 1 : 0,
        );
        await page.getByRole('tab', { name: 'Your ships' }).focus();
        for (const key of ['End', 'Home', 'ArrowLeft', 'ArrowRight']) {
          await page.keyboard.press(key);
          const expected =
            enabled && ['End', 'ArrowLeft'].includes(key) ? 'rivals' : 'fleet';
          assert.equal((await snapshot(page)).inspection.tab, expected);
          assert.equal(
            await page.locator('#inspection-rivals-picker').isVisible(),
            expected === 'rivals',
          );
        }
        assert.equal(await page.evaluate(() => !!window.__VN), false);
      }
    });
    await check(
      'ship selectors after track selection never launch a session',
      async (page) => {
        await page.goto(url('level=halcyon'));
        for (const selector of [
          '.menu-selection[data-action="ship-step"]',
          '.picker-tabs [data-action="ship-step"]',
        ]) {
          await page.locator('[data-level="vesper"]').click();
          await page.locator(selector).click();
          assert.equal((await front(page)).screen, 'setup');
          assert.equal((await front(page)).selected, 'vesper');
          await page.waitForFunction(
            () => window.__VN_FRONTEND.getState().preview?.selected,
          );
          assert.equal(await page.evaluate(() => !!window.__VN), false);
          await page.locator('.picker-tabs [data-action="circuits"]').click();
        }
        await page.locator('[data-level="halcyon"]').click();
        await page.locator('[data-action="practice"]').click();
        await page.locator('[data-action="launch"]').click();
        await page.waitForFunction(
          () => window.__VN?.getSnapshot().mode === 'racing',
          null,
          { timeout: 90000 },
        );
        await page.keyboard.press('Escape');
        await page.locator('#home').click();
        const paused = await snapshot(page);
        for (const selector of [
          '.menu-selection[data-action="ship-step"]',
          '.picker-tabs [data-action="ship-step"]',
        ]) {
          await page.locator('[data-level="worldspire"]').click();
          await page.locator(selector).focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            () => window.__VN_FRONTEND.getState().preview?.selected,
          );
          assert.equal((await front(page)).screen, 'setup');
          assert.equal((await front(page)).selected, 'worldspire');
          const after = await snapshot(page);
          assert.equal(after.mode, 'paused');
          assert.equal(after.tick, paused.tick);
          assert.deepEqual(after.vehicle, paused.vehicle);
          await page.locator('.picker-tabs [data-action="circuits"]').click();
        }
      },
    );
    await check(
      'ship inspector loads no track resources and opens a selected sprint',
      async (page) => {
        const trackRequests = [];
        const auditionRequests = [];
        page.on('request', (request) => {
          const path = new URL(request.url()).pathname;
          if (
            /\/src\/ships\/(?:pickup-|engine-preview|inspection-framing)|\/src\/audio\/(?:sound-panel|sound-preview|sounds)\.|\/assets\/(?:pickup-inspector|sound-panel)-|\/audio\/sfx\/|\/(?:aegis-activate|arc-activate|arc-hit|repulsor-charge|repulsor-fire|repulsor-hit|shield-block|ship-impact)-[^/]+\.wav$/.test(
              path,
            )
          )
            auditionRequests.push(path);
          if (
            /\/src\/core\/game\.js|\/src\/physics\/|\/src\/levels\/[^/]+\/(?!metadata\.js)|\/assets\/game-[^/]+\.js|\/assets\/levels\//.test(
              path,
            ) &&
            !/\/audio\/.*\.(?:mp3|ogg)$/.test(path)
          )
            trackRequests.push(path);
        });
        await page.goto(url('level=halcyon'));
        await page.locator('[data-level="worldspire"]').click();
        await page.evaluate(() => {
          window.enteredScreens = [];
          new MutationObserver(() => {
            window.enteredScreens.push(document.body.dataset.screen);
          }).observe(document.body, {
            attributes: true,
            attributeFilter: ['data-screen'],
          });
        });
        await page.locator('[data-action="inspect"]').click();
        await page.waitForFunction(
          () =>
            window.__VN_INSPECTOR?.ready &&
            window.__VN_FRONTEND.getState().screen === 'inspection',
          null,
          { timeout: 90000 },
        );
        assert.equal((await front(page)).selected, 'worldspire');
        assert.equal(await page.locator('#inspection-panel').isVisible(), true);
        assert.equal(await page.locator('#hud').isVisible(), false);
        for (const name of ['driving', 'autoRotate'])
          assert.equal(
            await page
              .locator(`[data-preview="${name}"]`)
              .getAttribute('aria-pressed'),
            'true',
          );
        await page.locator('[data-preview="boost"]').click();
        await page.locator('canvas#world').focus();
        await page.keyboard.press('Enter');
        const inspected = await snapshot(page);
        assert.equal(inspected.mode, 'inspection');
        assert.deepEqual(
          auditionRequests,
          [],
          'normal inspection loads no pickup audition code, target tools or SFX',
        );
        assert.equal(
          await page.locator('.inspection-pickups, [data-sound-panel]').count(),
          0,
        );
        assert.deepEqual(
          trackRequests,
          [],
          'no track implementation, physics, or level assets loaded',
        );
        assert.equal(
          await page.evaluate(() => !!window.__VN),
          false,
          'inspector never creates a race runtime',
        );
        assert.equal((await front(page)).loadedId, null);
        assert.equal(
          await page.evaluate(() => window.enteredScreens.includes('race')),
          false,
        );
        await page.locator('#inspect-back').click();
        assert.equal((await front(page)).screen, 'home');
        assert.equal((await front(page)).selected, 'worldspire');
      },
      { width: 1440, height: 900 },
      { quality: 'high', reducedMotion: false },
    );
    await check(
      'menu inspector preserves selections, music and a paused session',
      async (page) => {
        await page.goto(url('level=vesper'));
        await page.locator('[data-level="halcyon"]').click();
        await page.evaluate(() => {
          window.retainedPlayer = document.querySelector('[data-music-player]');
        });
        await page.locator('[data-action="inspect"]').click();
        await page.waitForFunction(
          () =>
            window.__VN_INSPECTOR?.ready &&
            window.__VN_FRONTEND.getState().screen === 'inspection',
          null,
          { timeout: 90000 },
        );
        assert.equal(await page.evaluate(() => !!window.__VN), false);
        assert.equal((await front(page)).loadedId, null);
        assert.equal(await page.locator('[data-preview="heat"]').count(), 0);
        assert.equal(await page.locator('#inspect-start').isVisible(), false);
        assert.match(
          await page.locator('#inspect-back').textContent(),
          /Back to race setup/,
        );
        assert.equal(
          await page.evaluate(
            () =>
              window.retainedPlayer ===
              document.querySelector('[data-music-player]'),
          ),
          true,
        );
        await page
          .locator('#inspection-fleet-picker [data-ship="shrike"]')
          .click();
        await page.waitForFunction(
          () => window.__VN_INSPECTOR.getSnapshot().ship.id === 'shrike',
        );
        await page.locator('#inspect-back').click();
        assert.equal((await front(page)).screen, 'home');
        assert.equal((await front(page)).shipId, 'shrike');
        assert.equal(
          await page
            .locator('[data-action="inspect"]')
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.locator('[data-action="practice"]').click();
        await page.locator('[data-action="launch"]').click();
        await booted(page);
        await page.waitForFunction(
          () => window.__VN.getSnapshot().mode === 'racing',
        );
        await page.keyboard.press('i');
        assert.equal((await snapshot(page)).mode, 'racing');
        await page.keyboard.press('Escape');
        await page.locator('#home').click();
        const paused = await snapshot(page);
        await page.evaluate(() => {
          window.retainedRuntime = window.__VN;
        });
        await page.locator('[data-level="worldspire"]').click();
        await page.locator('[data-action="inspect"]').click();
        await inspectorReady(page);
        assert.equal((await snapshot(page)).mode, 'inspection');
        assert.equal(
          await page.evaluate(() => window.retainedRuntime === window.__VN),
          true,
        );
        await page
          .locator('#inspection-fleet-picker [data-ship="needle"]')
          .click();
        await page.waitForFunction(
          () => window.__VN_INSPECTOR.getSnapshot().ship.id === 'needle',
        );
        await page.keyboard.press('Escape');
        assert.equal((await front(page)).shipId, 'needle');
        assert.equal((await front(page)).screen, 'home');
        assert.equal((await front(page)).selected, 'worldspire');
        assert.equal((await front(page)).loadedId, 'halcyon');
        const restored = await snapshot(page);
        assert.equal(restored.mode, 'paused');
        assert.equal(restored.tick, paused.tick);
        assert.deepEqual(restored.vehicle, paused.vehicle);
        await page.locator('[data-action="resume-session"]').click();
        assert.equal((await snapshot(page)).mode, 'paused');
        assert.equal((await snapshot(page)).tick, paused.tick);
        await page.locator('#resume').click();
        assert.equal((await snapshot(page)).mode, 'racing');
      },
    );
    await check(
      'standalone inspector retries failed ship loading',
      async (page) => {
        await page.route('**/assets/ships/needle/needle.glb', (route) =>
          route.abort(),
        );
        await page.goto(url('inspect=1&ship=needle'));
        await page.locator('.transfer-status.failed').waitFor();
        assert.equal(await page.evaluate(() => !!window.__VN), false);
        assert.equal(await page.locator('canvas#world').count(), 0);
        assert.equal(await page.locator('.loading-card').count(), 0);
        assert.doesNotMatch(
          await page.locator('.transfer-status').textContent(),
          /Halcyon|circuit|road/i,
        );
        await page.unrouteAll({ behavior: 'wait' });
        await page.locator('[data-action="retry"]').click();
        await inspectorReady(page);
        assert.equal((await snapshot(page)).ship.id, 'needle');
        await page.locator('#inspect-back').click();
        assert.equal((await front(page)).screen, 'home');
        assert.equal(await page.locator('canvas#world').count(), 0);
      },
    );
    await check(
      'direct inspector, developer launcher and jump-test contract',
      async (page) => {
        await page.goto(url('inspect=1&ship=shrike&level=halcyon'));
        await page.waitForFunction(
          () =>
            window.__VN_INSPECTOR?.ready &&
            window.__VN_FRONTEND.getState().screen === 'inspection',
          null,
          { timeout: 90000 },
        );
        assert.equal((await snapshot(page)).ship.id, 'shrike');
        assert.equal(await page.locator('#title-panel').isVisible(), false);
        await page.locator('#inspect-back').click();
        assert.equal((await front(page)).screen, 'home');
        assert.equal(new URL(page.url()).searchParams.has('inspect'), false);
        await page.goto(url('level=halcyon&capture=1&music=0'));
        await booted(page);
        assert.equal(await page.locator('.developer-note').isVisible(), true);
        await page.locator('.developer-note button').click();
        assert.equal((await front(page)).screen, 'home');
        assert.equal(new URL(page.url()).searchParams.has('capture'), false);
        await page.goto(url('level=saffron&test=jump&case=approach&music=0'));
        await booted(page);
        const result = await page.evaluate(() => {
          window.__VN.test.reset('approach');
          return window.__VN.test.step(2);
        });
        assert.equal(result.tick, 2);
        assert.equal(result.case, 'approach');
        assert.deepEqual(result.errors, []);
      },
    );
    await check(
      'Vesper Up-only race keeps ordinary bumps on the road',
      async (page) => {
        await page.goto(url('level=vesper&music=0'));
        await page.locator('[data-action="launch"]').click();
        await booted(page);
        await page.waitForFunction(
          () => window.__VN.getSnapshot().mode === 'racing',
          null,
          { timeout: 15000 },
        );
        await page.keyboard.down('ArrowUp');
        await page.waitForFunction(
          () => window.__VN.getSnapshot().vehicle.time >= 8,
          null,
          { timeout: 30000 },
        );
        await page.keyboard.up('ArrowUp');
        await page.evaluate(() => window.__VN.pause());
        const driven = await snapshot(page);
        assert.equal(driven.competition.standings.length, RACE_FIELD_SIZE);
        assert.equal(driven.runtime.state.motion.magnetic.roadRecovery, null);
        assert.equal(
          driven.events.some(
            ({ type }) => type === 'road-departure' || type === 'road-recovery',
          ),
          false,
        );
        assert.ok(
          driven.vehicle.distance > 300,
          'ordinary contact preserves forward progress',
        );
        assert.ok(Math.abs(driven.vehicle.lateral) < 14);
        assert.deepEqual(driven.errors, []);
      },
    );
    await check('Vesper art-pass and return from free camera', async (page) => {
      await page.goto(url('artPass=1&level=vesper'));
      await booted(page);
      await page.waitForFunction(
        () => window.__VN.getSnapshot().mode === 'fly',
      );
      assert.equal(await page.locator('[data-music-player]').count(), 0);
      assert.ok(await page.locator('#fly-settings').isVisible());
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      assert.equal((await front(page)).screen, 'review');
      assert.ok(await page.locator('.developer-note').isVisible());
      assert.match(
        await page.evaluate(() => window.__VN.getArtPassURL()),
        /artPass=1/,
      );
    });
    await check('unknown circuit recovery and cancelled load', async (page) => {
      await page.goto(url('level=does-not-exist'));
      await page.locator('.transfer-status.failed').waitFor();
      await page.locator('[data-action="cancel"]').click();
      assert.equal((await front(page)).screen, 'home');
      await page.locator('[data-level="halcyon"]').click();
      // Hold the lazy runtime import in dev or built output, then release it after cancel.
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await page.route(
        /\/(?:src\/(?:core\/game|ships\/inspector)\.js|assets\/(?:game|inspector)-[^/]+\.js)(?:\?|$)/,
        async (route) => {
          await gate;
          await route.continue().catch(() => {});
        },
      );
      try {
        for (const [view, action, escape] of [
          ['home', 'launch', false],
          ['setup', 'launch', true],
          ['circuits', 'launch', false],
          ['setup', 'practice', false],
          ['circuits', 'practice', true],
          ['circuits', 'inspect', false],
          ['setup', 'inspect', true],
        ]) {
          if (action === 'practice')
            await page.locator('[data-action="practice"]').click();
          if (view !== 'home')
            await page
              .locator(
                `.picker-tabs [data-action="${view === 'setup' ? 'ship-step' : 'circuits'}"]`,
              )
              .click();
          await page
            .locator(
              `[data-action="${action === 'practice' ? 'launch' : action}"]`,
            )
            .click();
          assert.equal((await front(page)).screen, 'loading');
          if (escape) await page.keyboard.press('Escape');
          else await page.locator('[data-action="cancel"]').click();
          assert.equal((await front(page)).screen, view);
          assert.equal((await front(page)).selected, 'halcyon');
          assert.equal(
            await page
              .locator(
                `.picker-tabs [data-action="${view === 'setup' ? 'ship-step' : 'circuits'}"]`,
              )
              .getAttribute('aria-pressed'),
            'true',
          );
        }
      } finally {
        release();
        await page.unrouteAll({ behavior: 'wait' });
      }
      await page.waitForFunction(
        () => !window.__VN_FRONTEND.getState().loading,
      );
      assert.equal(await page.locator('canvas#world').count(), 0);
    });
    await check(
      'failed fleet decode retries without poisoning cache',
      async (page) => {
        await page.route(
          '**/assets/ships/decoder/basis_transcoder.wasm',
          (route) => route.abort(),
        );
        await page.goto(url('level=halcyon&music=0'));
        await page.waitForFunction(
          () => window.__VN_FRONTEND?.getState().preload.failed?.length === 4,
          null,
          { timeout: 60000 },
        );
        await page.unrouteAll({ behavior: 'wait' });
        await page.locator('.retry-fleet').click();
        await fleetReady(page);
        await page.locator('[data-action="ship-step"]').first().click();
        const retry = page.locator('.ship-preview-status button');
        if (await retry.isVisible()) await retry.click();
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().preview?.selected === 'kestrel',
        );
      },
    );
  }
  const recordsViewports = [
    ...(!flags.includes('--responsive') ? [{ width: 1024, height: 768 }] : []),
    ...(!flags.includes('--desktop')
      ? [
          { width: 390, height: 844 },
          { width: 320, height: 700 },
        ]
      : []),
  ];
  for (const viewport of recordsViewports) {
    await check(
      `record rows filter and set up trials without loading worlds ${viewport.width}×${viewport.height}`,
      async (page) => {
        await page.goto(url('level=halcyon&music=0'));
        // Valid saved-record fixtures exercise a long list without running twelve races.
        await page.evaluate((trackId) => {
          for (let i = 0; i < 12; i++) {
            const identity = {
              track: trackId,
              ship: { id: i % 2 ? 'shrike' : 'needle', version: 'fixture' },
              version: `fixture-${i}`,
              physics: 3,
              rules: 'menu fixture',
              format: 'circuit',
              laps: 3,
            };
            let hash = 2166136261;
            for (const c of JSON.stringify(identity))
              hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
            const duration = 180 + i;
            localStorage.setItem(
              `vector-nova.trial.v1.${(hash >>> 0).toString(16)}`,
              JSON.stringify({
                version: 1,
                identity,
                duration,
                laps: Array(3).fill(duration / 3),
                splits: Array.from(
                  { length: 9 },
                  (_, n) => (duration * (n + 1)) / 9,
                ),
              }),
            );
          }
        }, createHalcyonLevel().createTrack().id);
        await page.locator('[data-action="records"]').click();
        assert.equal(await page.locator('.records-list li').count(), 12);
        assert.equal(await page.locator('.record-course img').count(), 12);
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('.records-panel').scrollHeight >
              document.querySelector('.records-panel').clientHeight + 1,
          ),
          false,
          'records must use outer-page scrolling',
        );
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('#front-shell').scrollWidth > innerWidth,
          ),
          false,
        );
        await page
          .locator('[data-record-filter="ship"]')
          .selectOption('needle');
        assert.equal(await page.locator('.records-list li').count(), 6);
        await page
          .locator('[data-record-filter="track"]')
          .selectOption('orbital');
        assert.match(
          await page.locator('.records-empty').textContent(),
          /No records match/,
        );
        await page
          .locator('[data-record-filter="track"]')
          .selectOption('halcyon');
        await page.locator('[data-record-key]').last().click();
        assert.equal((await front(page)).intent, 'time-trial');
        assert.equal((await front(page)).selected, 'halcyon');
        assert.equal((await front(page)).shipId, 'needle');
        assert.equal((await front(page)).loadedId, null);
        assert.equal(await page.evaluate(() => !!window.__VN), false);
      },
      viewport,
    );
  }
  if (!flags.includes('--desktop')) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await check(
        `championship uses the same compact menu ${viewport.width}×${viewport.height}`,
        async (page) => {
          await page.goto(url('level=halcyon&music=0'));
          const navigation = () => page.locator('.mode-picker').boundingBox();
          const original = await navigation();
          for (const action of [
            'cup-hub',
            'time-trial',
            'practice',
            'quick-race',
            'cup-hub',
          ]) {
            await page.locator(`[data-action="${action}"]`).click();
            assert.equal((await front(page)).screen, 'home');
            assert.deepEqual(await navigation(), original);
          }
          await page.locator('.menu-selection[data-action="circuits"]').click();
          await page.locator('[data-cup="apex"]').click();
          assert.equal(await page.locator('.cup-route li').count(), 4);
          await page
            .locator('.picker-header [data-action="home"]')
            .last()
            .click();
          assert.equal((await front(page)).intent, 'cup');
          assert.match(
            await page
              .locator('.menu-selection[data-action="circuits"]')
              .textContent(),
            /Apex Cup/,
          );
          await page.locator('[data-action="ship-step"]').click();
          await page.locator('[data-ship="shrike"]').click();
          assert.equal(
            await page.locator('[data-action="cup-start"]').count(),
            1,
          );
          await page
            .locator('.picker-header [data-action="home"]')
            .last()
            .click();
          assert.equal((await front(page)).intent, 'cup');
          assert.equal((await front(page)).shipId, 'shrike');
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          assert.equal(await page.evaluate(() => !!window.__VN), false);
        },
        viewport,
      );
    }
    for (const viewport of [
      { width: 800, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await check(
        `compact keyboard menu ${viewport.width}×${viewport.height}`,
        async (page) => {
          const press = async (key, selector) => {
            await page.keyboard.press(key);
            if (selector)
              assert.equal(
                await page
                  .locator(selector)
                  .evaluate((el) => el === document.activeElement),
                true,
                `focus after ${key} should be on ${selector}`,
              );
          };
          await page.goto(url('level=halcyon'));
          await fleetReady(page);
          await page.locator('.menu-selection[data-action="circuits"]').focus();
          await press('Enter', '[data-level="halcyon"]');
          await press('End', '[data-level="umbra"]');
          await press('Space', '[data-level="umbra"]');
          assert.equal((await front(page)).selected, 'umbra');
          await press('Escape', '.menu-selection[data-action="circuits"]');
          await press('ArrowDown', '.menu-selection[data-action="ship-step"]');
          await press('Enter', 'button[data-ship="kestrel"]');
          await press('End', 'button[data-ship="needle"]');
          await press('Enter', 'button[data-ship="needle"]');
          assert.equal((await front(page)).shipId, 'needle');
          await press('Escape', '.menu-selection[data-action="ship-step"]');
          await press('ArrowDown', '[data-action="launch"]');
          await press('ArrowDown', '[data-difficulty="easy"]');
          await press('ArrowRight', '[data-difficulty="medium"]');
          await press('ArrowDown', '[data-action="records"]');
          await press('Enter', '[data-record-filter="track"]');
          assert.equal(
            await page.locator('#front-shell').getAttribute('class'),
            'cinematic-menu',
          );
          assert.equal(await page.locator('.menu-backdrop img').count(), 1);
          await page
            .locator('[data-record-filter="ship"]')
            .selectOption('shrike');
          await press('Escape', '[data-action="records"]');
          await press('ArrowDown', '[data-action="inspect"]');
          await press('ArrowDown', '[data-action="settings"]');
          await press('Space', '[data-action="settings-back"]');
          await press('Tab', '[data-setting="quality"]');
          await press('Escape', '[data-action="settings"]');
          await press('Tab', '.music-previous');
          await press('Shift+Tab', '[data-action="settings"]');
          assert.equal(await page.evaluate(() => !!window.__VN), false);
        },
        viewport,
      );
    }
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 768, height: 768 },
    ]) {
      await check(
        `standalone inspector touch ${viewport.width}×${viewport.height}`,
        async (page) => {
          const loads = [];
          page.on('request', (request) => {
            const path = new URL(request.url()).pathname;
            if (
              /\/src\/core\/game\.js|\/assets\/game-[^/]+\.js|\/assets\/levels\/(?!halcyon\/audio\/)/.test(
                path,
              )
            )
              loads.push(path);
          });
          await page.goto(url('level=shatterline&dev=1'));
          const entry = page.locator('[data-action="inspect"]');
          if (viewport.width < 760) await entry.tap();
          else await entry.click();
          await inspectorReady(page);
          assert.equal(await page.evaluate(() => !!window.__VN), false);
          assert.equal((await front(page)).loadedId, null);
          assert.deepEqual(loads, []);
          await page.locator('[data-ship="bastion"]').click();
          await page.waitForFunction(
            () => window.__VN_INSPECTOR.getSnapshot().ship.id === 'bastion',
          );
          await page.getByRole('tab', { name: 'AI racers' }).click();
          await page.locator('[data-rival="kite"]').click();
          await page.waitForFunction(
            () =>
              window.__VN_INSPECTOR.getSnapshot().inspection.rivalId === 'kite',
          );
          const back = await page.locator('#inspect-back').boundingBox();
          assert.ok(back.y >= 0 && back.y + back.height <= viewport.height);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
          );
          await page.locator('#inspect-back').click();
          assert.equal((await front(page)).shipId, 'bastion');
          assert.equal((await front(page)).selected, 'shatterline');
          assert.equal(await page.locator('canvas#world').count(), 0);
        },
        viewport,
      );
    }
    for (const viewport of [
      { width: 768, height: 768 },
      { width: 390, height: 844 },
      { width: 320, height: 700 },
    ]) {
      await check(
        `separate pickers and persistent Tunes ${viewport.width}×${viewport.height}`,
        async (page) => {
          await page.goto(url('level=halcyon'));
          await fleetReady(page);
          assert.equal(
            (await front(page)).preview,
            null,
            'preload should not require opening Ship',
          );
          assert.equal(await page.evaluate(() => !!window.__VN), false);
          assert.equal((await front(page)).screen, 'home');
          await menuFits(page);
          assert.equal(
            await page
              .locator('.menu-wordmark')
              .evaluate((el) => getComputedStyle(el).fontSize),
            '32px',
          );
          assert.equal(await page.locator('.menu-picker').count(), 0);
          assert.equal(await page.locator('.music-heading').isVisible(), true);
          await page.locator('[data-action="ship-step"]').click();
          await page.waitForFunction(
            () =>
              window.__VN_FRONTEND.getState().preview?.selected === 'kestrel',
          );
          const layout = await page.evaluate(() => ({
            height: document.querySelector('.ship-preview-slot').clientHeight,
            overflow: document.documentElement.scrollWidth > innerWidth,
            columns: getComputedStyle(
              document.querySelector('.ship-metrics'),
            ).gridTemplateColumns.split(' ').length,
            status:
              document.querySelector('.transfer-status').parentElement
                .className,
          }));
          assert.ok(layout.height >= 70 && layout.height < viewport.height);
          assert.equal(layout.overflow, false);
          assert.equal(layout.columns, 1);
          assert.match(layout.status, /ship-transfer/);
          assert.equal(await page.locator('.ship-metrics > div').count(), 5);
          assert.equal(
            await page.evaluate(() =>
              [...document.querySelectorAll('#front-shell *')].some(
                (e) =>
                  e.clientHeight > 0 &&
                  ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) &&
                  e.scrollHeight > e.clientHeight + 1,
              ),
            ),
            false,
            'no nested menu scrollers',
          );
          await menuFits(page);
          await page.locator('[data-action="circuits"]').click();
          assert.equal((await front(page)).screen, 'circuits');
          await menuFits(page);
          if (viewport.width < 760)
            await page.locator('[data-level="glasswake"]').tap();
          else await page.locator('[data-level="glasswake"]').click();
          assert.equal((await front(page)).screen, 'circuits');
          assert.equal((await front(page)).selected, 'glasswake');
          assert.equal(
            await page
              .locator('[data-level="glasswake"]')
              .getAttribute('aria-pressed'),
            'true',
          );
          assert.equal(
            await page.locator('#front-shell').evaluate((el) => el.scrollTop),
            0,
            'new picker starts at the top',
          );
          await page.locator('[data-action="home"]').first().click();
          assert.equal((await front(page)).screen, 'home');
          assert.match(
            await page.locator('[data-action="circuits"]').textContent(),
            /Glasswake Comet/,
          );
        },
        viewport,
      );
    }
  }
} finally {
  await browser.close();
}
