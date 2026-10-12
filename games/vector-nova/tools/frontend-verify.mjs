import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createTrack } from '../src/levels/halcyon/track/model.js';
import { createVehicleState } from '../src/physics/index.js';
import { RACE_GRID, getRacerControl } from '../src/race/racers.js';
import { createHalcyonSimulationRuntime } from '../src/levels/halcyon/device-runtime.js';

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
const snapshot = (page) => page.evaluate(() => window.__VN.getSnapshot());
const booted = (page) =>
  page.waitForFunction(() => window.__VN?.ready, null, { timeout: 90000 });
const fleetReady = (page) =>
  page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().preload.ready === 4,
    null,
    { timeout: 60000 },
  );
async function check(name, fn, viewport = { width: 1440, height: 900 }) {
  if (process.env.VN_CHECK && !new RegExp(process.env.VN_CHECK).test(name))
    return;
  const context = await browser.newContext({ viewport });
  try {
    await context.addInitScript(() =>
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({
          quality: 'low',
          volume: 0,
          reducedMotion: true,
          difficulty: 'easy',
        }),
      ),
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
function finishInputs() {
  const track = createTrack();
  const vehicle = { ...createVehicleState(), ...RACE_GRID.player };
  const runtime = createHalcyonSimulationRuntime({ track });
  const inputs = [];
  try {
    runtime.reset({ reason: 'fresh-lap', state: vehicle });
    while (vehicle.time < 125) {
      const input = getRacerControl(vehicle, track);
      runtime.advance(vehicle, input, 1 / 120);
      runtime.update({});
      inputs.push({ tick: inputs.length, input });
    }
    return inputs;
  } finally {
    runtime.dispose();
  }
}
try {
  if (!flags.includes('--responsive')) {
    await check(
      'setup, hover/keyboard selection, settings and fleet cache',
      async (page) => {
        await page.goto(url('level=halcyon'));
        await fleetReady(page);
        assert.equal(
          await page.evaluate(() => !!window.__VN),
          false,
          'landing loaded a world',
        );
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().preview?.selected === 'kestrel',
        );
        const routes = await page.evaluate(() => window.__VN_FRONTEND.routes);
        const circuits = routes.filter(
          ({ id }) => id !== 'umbra' && id !== 'saffron',
        );
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
        await page.locator('[data-level="vesper"]').hover();
        assert.equal((await front(page)).selected, 'halcyon');
        assert.equal(
          await page.locator('.circuit-hero h2').textContent(),
          'Vesper Canopy',
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
        assert.match(
          await page.locator('.front-content').textContent(),
          /Keyboard/,
        );
        await page.keyboard.press('Escape');
        assert.equal((await front(page)).shipId, 'bastion');
        assert.equal(await page.locator('[data-music-player]').count(), 1);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
      },
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
        await page.keyboard.press('Escape');
        assert.equal((await snapshot(page)).mode, 'paused');
        await page.evaluate(() => {
          window.retainedRuntime = window.__VN;
        });
        await page.locator('#home').click();
        assert.equal((await front(page)).screen, 'circuits');
        await page.locator('[data-action="resume-session"]').click();
        assert.ok(
          await page.evaluate(() => window.__VN === window.retainedRuntime),
        );
        await page.keyboard.press('i');
        assert.equal((await snapshot(page)).mode, 'inspection');
        await page.keyboard.press('Escape');
        assert.equal((await snapshot(page)).mode, 'racing');
        const replay = await page.evaluate(() => {
          window.__VN.pause();
          return window.__VN.getReplay();
        });
        const finished = await page.evaluate(
          (recording) => window.__VN.playReplay(recording),
          { ...replay, inputs: finishInputs() },
        );
        assert.ok(finished.competition.playerFinished);
        await page.evaluate(() => window.__VN.resume());
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().screen === 'results',
          null,
          { timeout: 15000 },
        );
        assert.equal(
          await page.locator('.result-panel h1').textContent(),
          'Winner.',
        );
        assert.equal(await page.locator('canvas#world').isVisible(), true);
        await page.locator('[data-action="continue"]').click();
        await page.keyboard.press('Escape');
        assert.equal((await front(page)).screen, 'race');
        assert.equal((await snapshot(page)).mode, 'paused');
      },
    );
    await check(
      'direct inspector, developer launcher and jump-test contract',
      async (page) => {
        await page.goto(url('inspect=1&ship=shrike&level=halcyon'));
        await page.waitForFunction(
          () => window.__VN?.getSnapshot().mode === 'inspection',
          null,
          { timeout: 90000 },
        );
        assert.equal((await snapshot(page)).ship.id, 'shrike');
        assert.equal(await page.locator('#title-panel').isVisible(), false);
        await page.locator('#inspect-back').click();
        assert.equal((await front(page)).screen, 'circuits');
        assert.equal(new URL(page.url()).searchParams.has('inspect'), false);
        await page.goto(url('level=halcyon&capture=1&music=0'));
        await booted(page);
        assert.equal(await page.locator('.developer-note').isVisible(), true);
        await page.locator('.developer-note button').click();
        assert.equal((await front(page)).screen, 'circuits');
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
      assert.equal((await front(page)).screen, 'circuits');
      await page.locator('[data-level="halcyon"]').click();
      // Hold the lazy runtime import in dev or built output, then release it after cancel.
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
        await page.locator('[data-action="launch"]').click();
        await page.locator('[data-action="cancel"]').click();
        assert.ok(['setup', 'circuits'].includes((await front(page)).screen));
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
        const retry = page.locator('.ship-preview-status button');
        if (await retry.isVisible()) await retry.click();
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().preview?.selected === 'kestrel',
        );
      },
    );
  }
  if (!flags.includes('--desktop')) {
    for (const viewport of [
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await check(
        `collapsed fleet preload and accordion ${viewport.width}×${viewport.height}`,
        async (page) => {
          await page.goto(url('level=halcyon&music=0'));
          await fleetReady(page);
          assert.equal(
            (await front(page)).preview,
            null,
            'preload should not require opening Ship',
          );
          assert.equal(await page.evaluate(() => !!window.__VN), false);
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
          assert.ok(layout.height >= 150 && layout.height < viewport.height);
          assert.equal(layout.overflow, false);
          assert.equal(layout.columns, 1);
          assert.match(layout.status, /ship-transfer/);
          await page.locator('[data-action="circuits"]').click();
          assert.equal((await front(page)).screen, 'circuits');
        },
        viewport,
      );
    }
  }
} finally {
  await browser.close();
}
