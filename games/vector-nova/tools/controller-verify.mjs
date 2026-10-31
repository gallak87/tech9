import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  createCareerSlots,
  createMemoryStorage,
  CAREER_SLOTS_KEY,
} from '../src/progression/careers.js';

// Synthetic standard hardware at the browser boundary; no shipped test hooks.
// Run --responsive only after desktop implementation/verification is final.
if (!process.env.VN_URL)
  throw new Error('Set VN_URL to this checkout’s server.');
const responsive = process.argv.includes('--responsive');
const tunes = process.argv.includes('--tunes');
const audioSettings = process.argv.includes('--audio');
const career = process.argv.includes('--career');
const desktopControls = process.argv.includes('--desktop-controls');
const careerStorage = createMemoryStorage();
createCareerSlots({ storage: () => careerStorage, now: () => 1 }).create(1);
const careerSeed = Array.from({ length: careerStorage.length }, (_, index) => {
  const key = careerStorage.key(index);
  return [key, careerStorage.getItem(key)];
});
const browser = await chromium.launch({
  args: ['--mute-audio'],
  headless: true,
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : { channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome' }),
});
const context = await browser.newContext({
  hasTouch: responsive,
  viewport: responsive
    ? { width: 390, height: 844 }
    : { width: 1440, height: 1000 },
});
const errors = [];
try {
  await context.addInitScript(
    ({ careerSeed, registryKey, tunes, audioSettings }) => {
      if (localStorage.getItem(registryKey) === null)
        for (const [key, value] of careerSeed) localStorage.setItem(key, value);
      if (tunes && !localStorage.getItem('vector-nova.music'))
        localStorage.setItem(
          'vector-nova.music',
          JSON.stringify({ song: 'ionwake', volume: 0.4, collapsed: true }),
        );
      if (!localStorage.getItem('vector-nova.settings'))
        localStorage.setItem(
          'vector-nova.settings',
          JSON.stringify({
            quality: 'low',
            volume: audioSettings ? 0.6 : 0,
            masterVolume: audioSettings ? 0.8 : 1,
            musicVolume: audioSettings ? 0.5 : 0.4,
            reducedMotion: true,
          }),
        );
      if (audioSettings) localStorage.setItem('startUpMusicOn', 'false');
      window.__controllerTest = {
        id: 'Synthetic standard controller',
        index: 0,
        connected: true,
        mapping: 'standard',
        axes: [0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      };
      Object.defineProperty(navigator, 'getGamepads', {
        configurable: true,
        value: () =>
          window.__controllerTest.connected ? [window.__controllerTest] : [],
      });
    },
    { careerSeed, registryKey: CAREER_SLOTS_KEY, tunes, audioSettings },
  );
  if (desktopControls)
    await context.addInitScript(() => {
      // Renderer contract test only; native availability is checked in the Electron probe.
      let fullscreen = false;
      const listeners = new Set();
      window.__setNativeFullscreen = (value) => {
        fullscreen = value;
        for (const listener of listeners) listener(fullscreen);
      };
      window.vectorNovaDesktop = {
        getFullscreen: async () => fullscreen,
        onFullscreenChange: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        toggleFullscreen: () => window.__setNativeFullscreen(!fullscreen),
        quit() {},
      };
    });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const settleInput = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const snapshot = () => page.evaluate(() => window.__VN.getSnapshot());
  const button = async (index, value) => {
    await page.evaluate(
      ({ index, value }) => {
        window.__controllerTest.buttons[index] = {
          value,
          pressed: value > 0.5,
        };
      },
      { index, value },
    );
    await settleInput();
  };
  const tap = async (index) => {
    await button(index, 1);
    await button(index, 0);
  };
  const axis = async (x) => {
    await page.evaluate((x) => {
      window.__controllerTest.axes[0] = x;
    }, x);
    await settleInput();
  };
  const neutral = async () => {
    await page.evaluate(() => {
      window.__controllerTest.axes = [0, 0];
      for (const b of window.__controllerTest.buttons) {
        b.pressed = false;
        b.value = 0;
      }
    });
    await settleInput();
  };
  const navigate = async (selector) => {
    for (let i = 0; i < 40; i++) {
      if (
        await page.evaluate(
          (selector) => document.activeElement?.matches(selector),
          selector,
        )
      )
        return;
      const navigation = await page.evaluate((selector) => {
        const wanted = document.querySelector(selector);
        const music = document.querySelector(
          '[data-music-player][data-menu-active]',
        );
        return {
          leaveMusic: !!music && !music.contains(wanted),
          wantedHeader: !!wanted?.closest('.menu-top-tabs'),
          focusedHeader: !!document.activeElement?.closest('.menu-top-tabs'),
        };
      }, selector);
      await tap(
        navigation.leaveMusic
          ? 1
          : navigation.wantedHeader
            ? navigation.focusedHeader
              ? 15
              : 12
            : 13,
      );
    }
    throw new Error(
      `Controller could not reach ${selector}; focused ${await page.evaluate(() => document.activeElement.outerHTML)}`,
    );
  };
  const waitMode = (mode) =>
    page.waitForFunction(
      (mode) => window.__VN?.getSnapshot().mode === mode,
      mode,
      { timeout: 90000 },
    );
  if (audioSettings) {
    const approximate = (actual, expected, message) =>
      assert.ok(
        Math.abs(actual - expected) < 1e-8,
        `${message}: ${actual} != ${expected}`,
      );
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('vector-nova.settings')),
      );
    const audioVolume = () =>
      page.locator('audio').evaluate((audio) => audio.volume);
    const settingsRange = (key) => page.locator(`[data-setting="${key}"]`);
    const viewports = responsive
      ? [
          { width: 390, height: 844 },
          { width: 320, height: 700 },
          { width: 844, height: 390 },
        ]
      : [{ width: 1440, height: 1000 }];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(
        new URL('?intro=0&level=halcyon', process.env.VN_URL).href,
      );
      await page.locator('[data-action="settings"]').waitFor();
      await navigate('[data-action="settings"]');
      await tap(0);
      for (const [key, label] of [
        ['masterVolume', 'Master volume'],
        ['volume', 'Game effects'],
        ['musicVolume', 'Tunes'],
      ]) {
        const range = settingsRange(key);
        assert.equal(await range.getAttribute('type'), 'range');
        assert.equal(await range.getAttribute('aria-label'), label);
        await navigate(`[data-setting="${key}"]`);
        const before = Number(await range.inputValue());
        const direction = before < 1 ? 1 : -1;
        const step = Number(await range.getAttribute('step'));
        await tap(direction > 0 ? 15 : 14);
        const next = Number(await range.inputValue());
        approximate(
          next,
          before + direction * step,
          `${key} controller adjustment`,
        );
        approximate((await stored())[key], next, `${key} persists live`);
        assert.equal(
          await page.locator(`[data-setting-output="${key}"]`).textContent(),
          `${Math.round(next * 100)}%`,
          `${key} output tracks its lane`,
        );
        const settings = await stored();
        approximate(
          await audioVolume(),
          settings.masterVolume * settings.musicVolume,
          'Tunes obeys master and its own lane',
        );
        approximate(
          Number(
            await page.locator('[aria-label="Music volume"]').inputValue(),
          ),
          settings.musicVolume,
          'player displays raw Tunes lane',
        );
        await range.scrollIntoViewIfNeeded();
        const box = await range.boundingBox();
        assert.ok(
          box.x >= 0 && box.x + box.width <= viewport.width + 1,
          `${key} fits ${viewport.width}x${viewport.height}`,
        );
        assert.ok(
          box.y >= 0 && box.y + box.height <= viewport.height + 1,
          `${key} scrolls fully into view`,
        );
      }
      // Native keyboard changes use the same live input path as controller input.
      await settingsRange('masterVolume').focus();
      await page.keyboard.press('Home');
      approximate(await audioVolume(), 0, 'master zero silences Tunes');
      approximate(
        (await stored()).masterVolume,
        0,
        'keyboard master mute persists',
      );
      await page.keyboard.press('End');
      approximate(
        await audioVolume(),
        (await stored()).musicVolume,
        'master full restores raw Tunes gain',
      );
      const effects = (await stored()).volume;
      await page.keyboard.press('Escape');
      assert.ok(
        await page
          .locator('[data-action="settings"]')
          .evaluate((element) => element === document.activeElement),
        'Settings Back restores opener',
      );
      await navigate('[data-action="tunes"]');
      await tap(0);
      await navigate('[aria-label="Music volume"]');
      const playerBefore = Number(
        await page.locator('[aria-label="Music volume"]').inputValue(),
      );
      const direction = playerBefore < 1 ? 1 : -1;
      await tap(direction > 0 ? 15 : 14);
      const playerAfter = Number(
        await page.locator('[aria-label="Music volume"]').inputValue(),
      );
      approximate(
        playerAfter,
        playerBefore + direction * 0.01,
        'player controller Tunes adjustment',
      );
      approximate(
        (await stored()).musicVolume,
        playerAfter,
        'player updates shared Tunes preference',
      );
      approximate(
        (await stored()).volume,
        effects,
        'Tunes adjustment preserves Game effects',
      );
      await tap(1);
      assert.ok(
        await page
          .locator('[data-action="tunes"]')
          .evaluate((element) => element === document.activeElement),
        'Tunes Back restores opener',
      );
      await navigate('[data-action="settings"]');
      await tap(0);
      approximate(
        Number(await settingsRange('musicVolume').inputValue()),
        playerAfter,
        'Settings reflects player Tunes change',
      );
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector('#front-shell').scrollWidth <=
            innerWidth + 1,
        ),
        true,
        'audio Settings have no horizontal overflow',
      );
      assert.equal(
        await page.locator('canvas#world').count(),
        0,
        'audio Settings never load a game world',
      );
      await page.reload();
      await page.locator('[data-action="settings"]').waitFor();
      await page.locator('[data-action="settings"]').click();
      approximate(
        Number(await settingsRange('musicVolume').inputValue()),
        playerAfter,
        'shared Tunes preference survives reload',
      );
      approximate(
        await audioVolume(),
        playerAfter,
        'effective gain survives reload',
      );
      console.log(
        `PASS audio Settings ${viewport.width}x${viewport.height}: keyboard/controller lanes, master mute, shared Tunes gain, persistence and focus return`,
      );
    }
  } else if (desktopControls) {
    await page.goto(new URL('?intro=0', process.env.VN_URL).href);
    await page.waitForFunction(() =>
      document.querySelector('.entry-continue, .race-menu'),
    );
    if (await page.locator('.entry-continue').count()) {
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      await page.locator('[data-career-slot="1"]').click();
    }
    const floating = '.desktop-window-controls button';
    await page.locator(floating).waitFor();
    assert.equal(
      await page
        .locator('.menu-links [data-action="desktop-fullscreen"]')
        .count(),
      0,
    );
    await navigate(floating);
    await tap(0);
    assert.equal(
      await page.locator(floating).getAttribute('aria-pressed'),
      'true',
    );
    await page.keyboard.press('Enter');
    assert.equal(
      await page.locator(floating).getAttribute('aria-pressed'),
      'false',
    );
    await page.locator('[data-action="settings"]').click();
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 800, height: 600 },
      { width: 2560, height: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      await page.locator(floating).focus();
      const box = await page.locator(floating).boundingBox();
      const tunesBox = await page.locator('[data-music-player]').boundingBox();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width);
      assert(
        box.x + box.width <= tunesBox.x,
        'fullscreen stays clear of Tunes',
      );
      const back = await page
        .locator('[data-action="settings-back"]')
        .boundingBox();
      assert(
        box.x >= back.x + back.width ||
          box.y + box.height <= back.y ||
          box.y >= back.y + back.height,
        'fullscreen stays clear of Back',
      );
    }
    if (process.env.VN_EVIDENCE)
      await page.screenshot({
        path: process.env.VN_EVIDENCE.replace('.png', '-menu.png'),
      });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('[data-action="inspect"]').count(),
      0,
      'compiled desktop omits developer inspector',
    );
    await page.locator('[data-action="garage-tab"]').click();
    await page.locator('.dedicated-garage').waitFor();
    await navigate(floating);
    await tap(0);
    assert.equal(
      await page.locator(floating).getAttribute('aria-pressed'),
      'true',
    );
    await tap(1);
    await page.locator('[data-action="practice"]').click();
    await page.locator('[data-action="launch"]').click();
    await page.waitForFunction(
      () =>
        document.body.dataset.screen === 'race' &&
        document.querySelector('#hud:not(.hidden)'),
      null,
      { timeout: 90000 },
    );
    assert.equal(
      await page.locator(floating).count(),
      0,
      'no floating control during race',
    );
    await tap(9);
    await page.locator('#pause-panel:not(.hidden)').waitFor();
    const checkbox = '#pause-panel [data-desktop-fullscreen]';
    assert(
      await page.locator(checkbox).isChecked(),
      'pause reflects fullscreen from Garage',
    );
    await navigate(checkbox);
    await tap(0);
    assert.equal(await page.locator(checkbox).isChecked(), false);
    await page.evaluate(() => window.__setNativeFullscreen(true));
    assert(
      await page.locator(checkbox).isChecked(),
      'native shortcut updates checkbox',
    );
    await page.keyboard.press('Space');
    assert.equal(await page.locator(checkbox).isChecked(), false);
    await page.locator('#pause-settings').click();
    await page.locator(floating).waitFor();
    assert.equal(
      await page.locator(floating).getAttribute('aria-pressed'),
      'false',
    );
    await page.evaluate(() => window.__setNativeFullscreen(true));
    assert.equal(
      await page.locator(floating).getAttribute('aria-label'),
      'Exit fullscreen',
    );
    await page.keyboard.press('Escape');
    assert(
      await page.locator(checkbox).isChecked(),
      'pause state remains synchronized after Settings',
    );
    assert(await page.locator('#pause-panel:not(.hidden)').isVisible());
    if (process.env.VN_EVIDENCE)
      await page.screenshot({ path: process.env.VN_EVIDENCE });
    console.log(
      'PASS desktop controls: setup, Settings, Garage, pause, keyboard/controller access, native state updates, 800–2560px layout',
    );
  } else if (career) {
    await page.goto(new URL('?intro=0&music=0', process.env.VN_URL).href);
    await page.locator('[data-action="career"]').waitFor();
    await navigate('[data-action="career"]');
    await tap(0);
    const rules = page.locator('details.career-rules');
    const summary = rules.locator('summary');
    assert.equal(await rules.getAttribute('open'), null);
    await navigate('.career-rules summary');
    assert.ok(
      await summary.evaluate((element) => element === document.activeElement),
      'controller reaches the native reward explanation',
    );
    await tap(0);
    assert.ok(await rules.locator('.career-intro').isVisible());
    await tap(0);
    assert.equal(await rules.locator('.career-intro').isVisible(), false);
    await tap(0);
    assert.ok(await rules.locator('.career-intro').isVisible());
    await tap(1);
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
      'home',
    );
    assert.ok(
      await page
        .locator('.menu-top-tabs [data-action="career"]')
        .evaluate((element) => element === document.activeElement),
      'controller Back restores the Career tab',
    );
    assert.equal(await page.locator('canvas#world').count(), 0);
    console.log(
      'PASS Career: controller reaches/toggles reward explanation and Back restores its tab',
    );
  } else if (tunes) {
    const releasedTunes = async (selector) => {
      assert.equal(
        await page.locator('[data-music-player][data-menu-active]').count(),
        0,
        'closed Tunes must release its controller scope',
      );
      const opener = page.locator(selector);
      assert.ok(
        await opener.evaluate((element) => element === document.activeElement),
        'closed Tunes restores its opener',
      );
      if ((await opener.getAttribute('aria-expanded')) !== null)
        assert.equal(await opener.getAttribute('aria-expanded'), 'false');
    };
    const moveFromTunesTab = async () => {
      await tap(15);
      assert.ok(
        await page
          .locator('.menu-top-tabs [data-action="switch-career"]')
          .evaluate((element) => element === document.activeElement),
        'next D-pad input reaches Switch career in the underlying navigation',
      );
      await tap(15);
      assert.ok(
        await page
          .locator('.menu-top-tabs [data-action="race-tab"]')
          .evaluate((element) => element === document.activeElement),
        'next D-pad input reaches the underlying menu',
      );
    };
    await page.goto(new URL('?intro=0&level=halcyon', process.env.VN_URL).href);
    await page.locator('[data-action="tunes"]').waitFor();
    // A real browser gesture unlocks HTML audio; the pad remains synthetic.
    await page.keyboard.press('Tab');
    const setupScreen = await page.evaluate(
      () => window.__VN_FRONTEND.getState().screen,
    );
    await navigate('[data-action="tunes"]');
    await tap(0);
    assert(
      await page
        .locator('.music-play')
        .evaluate((el) => el === document.activeElement),
    );
    assert.equal(
      await page.locator('[data-music-player][data-menu-active]').count(),
      1,
    );
    assert.ok(await page.locator('#music-controls').isVisible());
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
      setupScreen,
      'Tunes expands over the current screen',
    );
    assert.equal(
      await page
        .locator('.menu-top-tabs [aria-pressed="true"]')
        .getAttribute('data-action'),
      'race-tab',
    );
    assert.equal(await page.locator('.music-song').inputValue(), 'blue-hour');
    assert.equal(
      await page.evaluate(() =>
        ['song', 'volume'].some((key) =>
          Object.hasOwn(
            JSON.parse(localStorage.getItem('vector-nova.music')),
            key,
          ),
        ),
      ),
      false,
    );
    if (await page.locator('audio').evaluate((el) => el.paused)) await tap(0);
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    await navigate('[aria-label="Music volume"]');
    const volume = await page
      .locator('[aria-label="Music volume"]')
      .inputValue();
    await tap(15);
    assert.equal(
      await page.locator('audio').evaluate((el) => el.volume),
      Math.round((Number(volume) + 0.01) * 100) / 100,
    );
    const song = await page.locator('.music-song').inputValue();
    await navigate('.music-song');
    await tap(15);
    assert.notEqual(await page.locator('.music-song').inputValue(), song);
    await tap(8);
    await page.waitForFunction(() => document.querySelector('audio').paused);
    await tap(8); // View works even with a select focused.
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    assert.equal(
      await page.evaluate(() =>
        ['song', 'volume'].some((key) =>
          Object.hasOwn(
            JSON.parse(localStorage.getItem('vector-nova.music')),
            key,
          ),
        ),
      ),
      false,
      'song changes stay in memory and volume lives in shared Settings',
    );
    await navigate('.music-loop');
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(
        () => !!document.activeElement.closest('[data-music-player]'),
      ),
      true,
      'floating Tunes retains keyboard focus until dismissed',
    );
    await tap(1);
    assert(
      await page
        .locator('[data-action="tunes"]')
        .evaluate((el) => el === document.activeElement),
    );
    assert.equal(
      await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
      setupScreen,
      'controller Back closes Tunes without navigating',
    );
    await releasedTunes('[data-action="tunes"]');
    await moveFromTunesTab();
    for (const selector of [
      '[aria-label="Music volume"]',
      '[aria-label="Music position"]',
      '.music-shuffle',
      '.music-loop',
    ]) {
      await navigate('[data-action="tunes"]');
      await tap(0);
      await page.locator(`${selector}:not(:disabled)`).waitFor();
      await navigate(selector);
      await tap(1);
      await releasedTunes('[data-action="tunes"]');
      await moveFromTunesTab();
      assert.equal(
        await page.evaluate(() => window.__VN_FRONTEND.getState().screen),
        setupScreen,
      );
    }
    if (responsive)
      for (const viewport of [
        { width: 844, height: 390 },
        { width: 390, height: 844 },
      ]) {
        await navigate('[data-action="tunes"]');
        await tap(0);
        await navigate('[aria-label="Music volume"]');
        await page.setViewportSize(viewport);
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-music-player][data-menu-active]'),
        );
        await releasedTunes('[data-action="tunes"]');
        await moveFromTunesTab();
      }
    await page.locator('[data-action="practice"]').click();
    await page.locator('[data-action="launch"]').click();
    await waitMode('racing');
    if (!responsive)
      assert(
        await page.locator('#legend').isVisible(),
        'browser keeps shortcut strip',
      );
    await button(8, 1);
    await page.waitForTimeout(650);
    assert(
      await page.locator('audio').evaluate((el) => el.paused),
      'holding View toggles once',
    );
    assert.equal((await snapshot()).mode, 'racing');
    await button(8, 0);
    await tap(8);
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    await tap(9);
    await waitMode('paused');
    const tick = (await snapshot()).tick;
    await navigate('#pause-tunes');
    await tap(0);
    assert(
      await page
        .locator('.music-play')
        .evaluate((el) => el === document.activeElement),
    );
    assert(await page.locator('#music-controls').isVisible());
    await navigate('[aria-label="Music volume"]');
    const before = await page.locator('audio').evaluate((el) => el.volume);
    await tap(14);
    assert.equal(
      await page.locator('audio').evaluate((el) => el.volume),
      Math.round((before - 0.01) * 100) / 100,
    );
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      assert(
        await page.evaluate(
          () => !!document.activeElement.closest('[data-music-player]'),
        ),
        'Tunes traps Tab',
      );
    }
    assert.equal(
      (await snapshot()).tick,
      tick,
      'Tunes never advances paused simulation',
    );
    await tap(1);
    await releasedTunes('#pause-tunes');
    assert(
      await page
        .locator('#pause-tunes')
        .evaluate((el) => el === document.activeElement),
    );
    assert.equal((await snapshot()).mode, 'paused');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert(
      await page
        .locator('.music-next')
        .evaluate((el) => el === document.activeElement),
    );
    await page.keyboard.press('Escape');
    await releasedTunes('#pause-tunes');
    assert(
      await page
        .locator('#pause-tunes')
        .evaluate((el) => el === document.activeElement),
    );
    await page.keyboard.press('Shift+Tab');
    assert(
      await page
        .locator('#pause-settings')
        .evaluate((el) => el === document.activeElement),
    );
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await tap(9);
    assert.equal(
      (await snapshot()).mode,
      'paused',
      'Start closes Tunes before resuming',
    );
    if (responsive) {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        await navigate('#pause-tunes');
        await tap(0);
        for (const selector of [
          '.music-play',
          '.music-song',
          '[aria-label="Music volume"]',
        ]) {
          const box = await page.locator(selector).boundingBox();
          assert(
            box &&
              box.x >= 0 &&
              box.x + box.width <= viewport.width &&
              box.y >= 0 &&
              box.y + box.height <= viewport.height,
            `${selector} fits ${viewport.width}x${viewport.height}`,
          );
        }
        await tap(1);
        await releasedTunes('#pause-tunes');
      }
    }
    if (process.env.VN_EVIDENCE) {
      await navigate('#pause-tunes');
      await tap(0);
      await page.screenshot({ path: process.env.VN_EVIDENCE });
      await tap(1);
    }
    await tap(9);
    await waitMode('racing');
    console.log(
      'PASS Tunes: Blue Hour startup, floating setup/pause access, controller transport/song/volume, View while driving, keyboard focus/back, paused simulation' +
        (responsive ? ', portrait/landscape' : ''),
    );
  } else {
    await page.goto(
      new URL('?intro=0&level=halcyon&music=0', process.env.VN_URL).href,
    );
    await page.locator('[data-action="settings"]').waitFor();
    await navigate('[data-action="settings"]');
    await tap(0);
    assert.equal(
      await page.locator('[data-action="resume-session"]').count(),
      0,
      'no resume without a session',
    );
    await navigate('[data-setting="controllerPreset"]');
    await tap(15);
    assert.equal(
      await page.locator('[data-setting="controllerPreset"]').inputValue(),
      'shoulders',
    );
    await navigate('[data-setting="steeringDeadZone"]');
    await tap(15);
    assert.equal(await page.locator('#dead-zone-value').textContent(), '16%');
    await axis(0.1);
    assert.equal(await page.locator('[data-stick-value]').textContent(), '10%');
    assert.equal(
      await page.locator('[data-steering-value]').textContent(),
      '0%',
    );
    await axis(0.58); // brief input, below the menu repeat delay
    assert.equal(
      await page.locator('[data-steering-value]').textContent(),
      '50%',
    );
    await neutral();
    await navigate('[data-action="controller-reset"]');
    await tap(0);
    assert.equal(
      await page.locator('[data-setting="controllerPreset"]').inputValue(),
      'classic',
    );
    assert.equal(await page.locator('#dead-zone-value').textContent(), '15%');
    if (responsive) {
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await page.setViewportSize(viewport);
        for (const selector of [
          '[data-setting="controllerPreset"]',
          '[data-setting="steeringDeadZone"]',
          '[data-action="controller-reset"]',
        ]) {
          await page.locator(selector).focus();
          await page.locator(selector).scrollIntoViewIfNeeded();
          const box = await page.locator(selector).boundingBox();
          assert.ok(
            box.x >= 0 && box.x + box.width <= viewport.width,
            `${selector} fits at ${viewport.width}`,
          );
        }
        assert.equal(
          await page.evaluate(
            () =>
              document.querySelector('#front-shell').scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      console.log(
        'PASS controller settings: portrait/landscape layout, focus, preset, slider, live meter and reset',
      );
    } else {
      await tap(1);
      await page.locator('[data-action="practice"]').click();
      await page.locator('[data-action="launch"]').click();
      await waitMode('racing');
      await page.waitForTimeout(250);
      for (const [preset, throttle, boost, airbrake, index] of [
        ['classic', 7, 0, 1, 0],
        ['shoulders', 7, 5, 4, 1],
        ['arcade', 0, 7, 1, 2],
      ]) {
        await tap(9);
        await waitMode('paused');
        if (index > 0) {
          await navigate('#restart');
          await tap(0);
          await waitMode('racing');
          await tap(9);
          await waitMode('paused');
        }
        const tick = (await snapshot()).tick;
        if (index === 0) {
          for (
            let step = 0;
            step < 20 &&
            !(await page.evaluate(
              () => document.activeElement.id === 'pause-settings',
            ));
            step++
          )
            await page.keyboard.press('Tab');
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            'pause-settings',
          );
          await page.keyboard.press('Enter');
        } else {
          await navigate('#pause-settings');
          await tap(0);
        }
        assert.match(
          await page.locator('[data-action="resume-session"]').textContent(),
          /Resume Practice/,
        );
        assert.equal(await page.locator('#pause-explore').count(), 0);
        await navigate('[data-setting="controllerPreset"]');
        await tap(14);
        await tap(14);
        for (let i = 0; i < index; i++) await tap(15);
        assert.equal(
          await page.locator('[data-setting="controllerPreset"]').inputValue(),
          preset,
        );
        assert.equal(
          await page.locator('[data-controller-action="boost"]').textContent(),
          ['A', 'RB', 'RT'][index],
        );
        await navigate('[data-setting="steeringDeadZone"]');
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(
          () => document.querySelector('#dead-zone-value').textContent === '1%',
        );
        for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight');
        await page.waitForFunction(
          () =>
            document.querySelector('#dead-zone-value').textContent === '15%',
        );
        assert.equal(
          (await snapshot()).tick,
          tick,
          'settings never advances the race',
        );
        await page.keyboard.press('Escape');
        assert.equal(
          (await snapshot()).mode,
          'paused',
          'Escape restores pause, without resuming accidentally',
        );
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          'pause-settings',
        );
        await page.keyboard.press('Enter');
        await navigate('[data-action="resume-session"]');
        await tap(0);
        await waitMode('paused');
        await button(0, 1); // held confirm must not become boost/throttle
        await waitMode('racing');
        assert.equal((await snapshot()).input.throttle, 0);
        assert.equal((await snapshot()).input.boost, false);
        await button(0, 0);
        await button(throttle, 0.7);
        assert.equal((await snapshot()).input.throttle, 0.7);
        const speed = (await snapshot()).vehicle.speed;
        await page.waitForTimeout(650);
        assert.ok(
          (await snapshot()).vehicle.speed > speed,
          `${preset}: real throttle accelerates`,
        );
        await button(boost, 1);
        assert.equal((await snapshot()).input.boost, true);
        await button(boost, 0);
        await button(airbrake, 1);
        assert.equal((await snapshot()).input.airbrake, true);
        await button(airbrake, 0);
        await button(6, 0.6);
        assert.equal((await snapshot()).input.brake, 0.6);
        await neutral();
        await axis(0.15);
        assert.equal((await snapshot()).input.steer, 0);
        await axis(-0.575);
        assert.ok(Math.abs((await snapshot()).input.steer + 0.5) < 1e-10);
        await neutral();
        const camera = (await snapshot()).camera.mode;
        await button(11, 1);
        const changed = (await snapshot()).camera.mode;
        assert.notEqual(changed, camera);
        await page.waitForTimeout(300);
        assert.equal(
          (await snapshot()).camera.mode,
          changed,
          'held right-stick click changes camera once',
        );
        await button(11, 0);
        await tap(11);
        assert.equal((await snapshot()).camera.mode, camera);
        console.log(
          `PASS ${preset}: controller Settings navigation, retained session, live mapping, throttle/brake/boost/airbrake/steer, held confirm and camera edge`,
        );
      }
      await tap(9);
      await navigate('#restart');
      await tap(0);
      // Inspect only the lights until green: diagnostics must not do input polling
      // on behalf of the runtime while testing release/repress during countdown.
      await page
        .locator('#start-lights[data-step="3"]')
        .waitFor({ state: 'visible' });
      await button(0, 1);
      await button(7, 1);
      await page.waitForFunction(
        () => document.querySelector('#start-lights').dataset.step === '0',
      );
      assert.equal((await snapshot()).input.throttle, 1);
      assert.equal((await snapshot()).input.boost, true);
      await neutral();
      assert.equal((await snapshot()).input.throttle, 0);
      assert.equal((await snapshot()).input.boost, false);
      console.log(
        'PASS controller release/repress and held throttle/boost through countdown',
      );
      await page.evaluate(() => {
        window.__controllerTest.connected = false;
      });
      await waitMode('paused');
      await page.evaluate(() => {
        window.__controllerTest.buttons[9] = { value: 1, pressed: true };
        window.__controllerTest.buttons[0] = { value: 1, pressed: true };
        window.__controllerTest.connected = true;
      });
      await page.waitForTimeout(150);
      assert.equal(
        (await snapshot()).mode,
        'paused',
        'reconnect with A/Start held cannot auto-resume',
      );
      await neutral();
      await navigate('#pause-settings');
      await tap(0);
      await navigate('[data-setting="steeringDeadZone"]');
      await tap(15);
      assert.equal(await page.locator('#dead-zone-value').textContent(), '16%');
      await page.reload();
      await page.locator('[data-action="settings"]').waitFor();
      await page.keyboard.press('s');
      assert.equal(
        await page.locator('[data-setting="controllerPreset"]').inputValue(),
        'arcade',
      );
      assert.equal(
        await page.locator('[data-setting="steeringDeadZone"]').inputValue(),
        '0.16',
      );
      console.log(
        'PASS controller disconnect/reconnect and saved preferences after reload',
      );
      // The retained Settings action works for every session kind, including cups.
      for (const [action, resume] of [
        ['quick-race', 'Quick Race'],
        ['time-trial', 'Time Trial'],
        ['championships', 'Cup Race'],
      ]) {
        await page.keyboard.press('Escape');
        const mode = page.locator(`[data-action="${action}"]`);
        if (action === 'championships') {
          await page.locator('[data-action="cup-hub"]').click();
          await page.locator('[data-action="cup-start"]').click();
        } else {
          await mode.click();
          await page.locator('[data-action="launch"]').click();
        }
        await waitMode('racing');
        await tap(9);
        await navigate('#pause-settings');
        await tap(0);
        assert.match(
          await page.locator('[data-action="resume-session"]').textContent(),
          new RegExp(`Resume ${resume}`),
        );
        await navigate('[data-action="resume-session"]');
        await tap(0);
        await waitMode('paused');
        await page.locator('#home').click();
        await page.locator('[data-action="settings"]').click();
        console.log(
          `PASS ${resume}: Settings retains the session and resume action`,
        );
      }
    }
  }
  assert.deepEqual(errors, [], 'uncaught browser errors');
} finally {
  await context.close();
  await browser.close();
}
