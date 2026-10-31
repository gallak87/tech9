import assert from 'node:assert/strict';
import { chromium } from 'playwright';

if (!process.env.VN_URL)
  throw new Error('Set VN_URL to an existing dev server.');
const browser = await chromium.launch({
  headless: true,
  args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  ...(process.env.VN_BROWSER_PATH
    ? { executablePath: process.env.VN_BROWSER_PATH }
    : { channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome' }),
});
const errors = [];
const desktopOnly = process.argv.includes('--desktop');
assert.ok(
  process.argv.slice(2).every((flag) => flag === '--desktop'),
  'Use --desktop or no arguments.',
);
async function mount(page) {
  await page.evaluate(async () => {
    window.music?.dispose();
    document.querySelector('#app').innerHTML =
      '<button id="tunes-opener" aria-controls="music-panel" aria-expanded="false">Tunes</button><button id="startup-gesture">Continue</button>';
    const { createMusicPlayer } = await import('/src/audio/player.js');
    window.navigationCalls = { initial: 0, next: 0 };
    window.startupScreen = true;
    window.music = createMusicPlayer(document.querySelector('#app'), {
      clearInput: () => window.navigationCalls.initial++,
      isMenuVisible: () => true,
      isStartupScreen: () => window.startupScreen,
    });
    window.audioIdentity = document.querySelector('[data-music-player] audio');
  });
}
async function setup({ blocked = false, delayed = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(
    ({ blocked, delayed }) => {
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({ musicVolume: 0.37, masterVolume: 0.5 }),
      );
      localStorage.setItem(
        'vector-nova.music',
        JSON.stringify({
          song: 'phase-shift',
          volume: 0.37,
          repeat: true,
          shuffle: true,
          collapsed: false,
        }),
      );
      if (blocked || delayed) {
        const play = HTMLMediaElement.prototype.play;
        window.playAttempts = 0;
        HTMLMediaElement.prototype.play = function () {
          window.playAttempts++;
          if (window.playAttempts === 1) {
            if (delayed)
              return new Promise((resolve, reject) => {
                window.releasePendingPlay = () =>
                  play.call(this).then(resolve, reject);
                window.rejectPendingPlay = () =>
                  reject(new DOMException('Blocked', 'NotAllowedError'));
              });
            return Promise.reject(
              new DOMException('Blocked', 'NotAllowedError'),
            );
          }
          return play.call(this);
        };
      }
    },
    { blocked, delayed },
  );
  const page = await context.newPage();
  // This module-only fixture must not disappear when another parallel task
  // edits an unrelated imported module on the shared checkout.
  await page.routeWebSocket('**', () => {});
  page.on('pageerror', (error) => errors.push(error.message));
  // Exercise only the production music module, without starting a game or career.
  await page.route('**/src/core/main.js*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.goto(process.env.VN_URL);
  await mount(page);
  return { context, page };
}
const audioPlaying = (page) =>
  page.waitForFunction(() => {
    const audio = document.querySelector('[data-music-player] audio');
    return !audio.paused && audio.currentTime > 0.03;
  });
const stored = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('vector-nova.music')));
async function released(page) {
  assert.equal(await page.locator('[data-menu-active]').count(), 0);
  assert.equal(
    await page.locator('#tunes-opener').getAttribute('aria-expanded'),
    'false',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'tunes-opener',
  );
  assert.equal(await page.locator('#music-controls').isVisible(), false);
}

try {
  const { context, page } = await setup();
  try {
    assert.equal(await page.locator('.music-song').inputValue(), 'blue-hour');
    assert.deepEqual(await stored(page), {
      repeat: true,
      shuffle: true,
      collapsed: false,
    });
    await audioPlaying(page);
    assert.ok(
      await page.evaluate(() =>
        window.audioIdentity.currentSrc.endsWith('/blue-hour-preview.mp3'),
      ),
    );
    console.log(
      'PASS Blue Hour starts automatically and saved song is removed',
    );

    await page.locator('.music-song').selectOption('phase-shift');
    await audioPlaying(page);
    assert.equal(Object.hasOwn(await stored(page), 'song'), false);
    await page.evaluate(() => {
      window.music.configureNavigation({
        clearInput: () => window.navigationCalls.next++,
        isMenuVisible: () => true,
      });
      window.music.open(document.querySelector('#tunes-opener'));
    });
    assert.equal(await page.locator('[data-menu-active]').count(), 1);
    assert.ok(await page.locator('#music-controls').isVisible());
    assert.ok(await page.locator('.music-song').isVisible());
    const before = await page.evaluate(() => window.audioIdentity.currentTime);
    await page.waitForTimeout(180);
    assert.ok(
      await page.evaluate(
        (before) =>
          document.querySelector('[data-music-player] audio') ===
            window.audioIdentity && window.audioIdentity.currentTime > before,
        before,
      ),
    );
    await page.locator('.music-play').focus();
    assert.equal(await page.evaluate(() => window.navigationCalls.initial), 0);
    assert.ok(await page.evaluate(() => window.navigationCalls.next > 0));
    await page.locator('.music-loop').focus();
    for (let index = 0; index < 14; index++) {
      await page.keyboard.press('Tab');
      assert.ok(
        await page.evaluate(
          () => !!document.activeElement.closest('[data-music-player]'),
        ),
        'expanded Tunes retains keyboard focus',
      );
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-menu-active]').count(), 0);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      'tunes-opener',
    );
    await page.evaluate(() => {
      window.music.open(document.querySelector('#tunes-opener'));
      window.music.close();
    });
    assert.equal(await page.locator('[data-menu-active]').count(), 0);
    assert.equal(await page.locator('.music-song').inputValue(), 'phase-shift');
    assert.ok(await page.evaluate(() => !window.audioIdentity.paused));
    console.log(
      'PASS callback handoff and floating Tunes retain audio, track and focus',
    );

    for (const selector of [
      '[aria-label="Music volume"]',
      '[aria-label="Music position"]',
      '.music-shuffle',
      '.music-loop',
    ]) {
      await page.evaluate(() =>
        window.music.open(document.querySelector('#tunes-opener')),
      );
      assert.equal(
        await page.locator('#tunes-opener').getAttribute('aria-expanded'),
        'true',
      );
      await page.locator(selector).focus();
      await page.keyboard.press('Escape');
      await released(page);
    }
    console.log(
      'PASS Escape releases Tunes scope from volume, seek, shuffle and repeat',
    );

    for (const viewport of desktopOnly
      ? []
      : [
          { width: 390, height: 844 },
          { width: 1440, height: 1000 },
        ]) {
      await page.evaluate(() =>
        window.music.open(document.querySelector('#tunes-opener')),
      );
      await page.locator('[aria-label="Music volume"]').focus();
      await page.setViewportSize(viewport);
      await page.waitForFunction(
        () => !document.querySelector('[data-music-player][data-menu-active]'),
      );
      await released(page);
    }
    if (!desktopOnly)
      console.log(
        'PASS resize from Tunes detail restores opener and releases focus scope',
      );

    await page.evaluate(async () => {
      const { saveSettings } = await import('/src/progression/index.js');
      saveSettings({ masterVolume: 0.25, musicVolume: 0.62 });
    });
    assert.equal(
      await page.locator('[aria-label="Music volume"]').inputValue(),
      '0.62',
    );
    assert.equal(await page.evaluate(() => window.audioIdentity.volume), 0.155);
    await page.evaluate(() =>
      window.music.open(document.querySelector('#tunes-opener')),
    );
    await page.locator('[aria-label="Music volume"]').evaluate((control) => {
      control.value = '0.58';
      control.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(
      await page.evaluate(
        async () =>
          (await import('/src/progression/index.js')).loadSettings()
            .musicVolume,
      ),
      0.58,
    );
    assert.equal(await page.evaluate(() => window.audioIdentity.volume), 0.145);
    assert.equal(Object.hasOwn(await stored(page), 'volume'), false);
    console.log(
      'PASS Tunes lane and shared settings stay synchronized beneath Master',
    );

    // A media tick during a physical press must keep the hit target mounted.
    const glyph = page.locator('.music-play svg');
    const box = await glyph.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.evaluate(() =>
      window.audioIdentity.dispatchEvent(new Event('timeupdate')),
    );
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.audioIdentity.paused), true);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('startUpMusicOn')),
      'false',
    );
    await page.locator('#startup-gesture').click();
    await page.evaluate(() => window.music.startWithGame());
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.audioIdentity.paused), true);
    console.log(
      'PASS one Pause survives a media tick, later gestures and game launch',
    );

    // Reload the app origin without changing its saved startup choice.
    await page.reload();
    await mount(page);
    assert.equal(await page.locator('.music-song').inputValue(), 'blue-hour');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.audioIdentity.paused), true);
    await page.locator('#startup-gesture').click();
    await page.evaluate(() => window.music.startWithGame());
    assert.equal(await page.evaluate(() => window.audioIdentity.paused), true);
    await page.locator('.music-play').click();
    await audioPlaying(page);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('startUpMusicOn')),
      'true',
    );
    await page.evaluate(() => {
      window.startupScreen = false;
      window.music.togglePlayback();
    });
    assert.equal(
      await page.evaluate(() => localStorage.getItem('startUpMusicOn')),
      'true',
      'a later in-game pause does not rewrite the startup choice',
    );
    await page.evaluate(() => window.music.startWithGame());
    assert.equal(await page.evaluate(() => window.audioIdentity.paused), true);
    await page.reload();
    await mount(page);
    await audioPlaying(page);
    assert.equal(await page.locator('.music-song').inputValue(), 'blue-hour');
    assert.equal(Object.hasOwn(await stored(page), 'song'), false);
    console.log(
      'PASS startup Pause/Play persists across reload while later session pause stays local',
    );
  } finally {
    await context.close();
  }

  for (const target of ['#startup-gesture', '.music-play', 'keyboard']) {
    const { context, page } = await setup({ blocked: true });
    try {
      await page.waitForFunction(() => window.playAttempts === 1);
      if (target === 'keyboard') await page.keyboard.press('KeyM');
      else await page.locator(target).click();
      await audioPlaying(page);
      assert.equal(await page.evaluate(() => window.playAttempts), 2);
      assert.equal(await page.locator('.music-song').inputValue(), 'blue-hour');
      console.log(`PASS blocked startup retries once through ${target}`);
    } finally {
      await context.close();
    }
  }
  for (const completion of ['releasePendingPlay', 'rejectPendingPlay']) {
    const { context, page } = await setup({ delayed: true });
    try {
      await page.waitForFunction(() => window.playAttempts === 1);
      assert.equal(
        await page.locator('.music-play').getAttribute('aria-label'),
        'Pause music',
      );
      await page.locator('.music-play').click();
      assert.equal(
        await page.evaluate(() => localStorage.getItem('startUpMusicOn')),
        'false',
      );
      await page.evaluate((completion) => {
        void window[completion]();
      }, completion);
      await page.waitForTimeout(200);
      await page.locator('#startup-gesture').click();
      await page.evaluate(() => window.music.startWithGame());
      await page.waitForTimeout(120);
      assert.equal(
        await page.evaluate(() => window.audioIdentity.paused),
        true,
      );
      assert.equal(await page.evaluate(() => window.playAttempts), 1);
      assert.equal(
        await page.locator('.music-play').getAttribute('aria-label'),
        'Play music',
      );
      console.log(
        `PASS one Pause cancels pending playback through ${completion}`,
      );
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
