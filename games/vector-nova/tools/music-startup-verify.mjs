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
async function setup({ blocked = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript((blocked) => {
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
    if (blocked) {
      const play = HTMLMediaElement.prototype.play;
      window.playAttempts = 0;
      HTMLMediaElement.prototype.play = function () {
        window.playAttempts++;
        if (window.playAttempts === 1)
          return Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
        return play.call(this);
      };
    }
  }, blocked);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  // Exercise only the production music module, without starting a game or career.
  await page.route('**/src/core/main.js*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: '' }),
  );
  await page.goto(process.env.VN_URL);
  await page.evaluate(async () => {
    document.querySelector('#app').innerHTML =
      '<button id="tunes-opener" aria-controls="music-panel" aria-expanded="false">Tunes</button><button id="startup-gesture">Continue</button>';
    const { createMusicPlayer } = await import('/src/audio/player.js');
    window.navigationCalls = { initial: 0, next: 0 };
    window.music = createMusicPlayer(document.querySelector('#app'), {
      clearInput: () => window.navigationCalls.initial++,
      isMenuVisible: () => true,
    });
    window.audioIdentity = document.querySelector('[data-music-player] audio');
  });
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
      volume: 0.37,
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

    for (const viewport of [
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
    console.log(
      'PASS resize from Tunes detail restores opener and releases focus scope',
    );

    await page.locator('.music-play').click();
    assert.equal(await page.evaluate(() => window.audioIdentity.paused), true);
    await page.locator('#startup-gesture').click();
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.audioIdentity.paused), true);
    await page.locator('.music-play').click();
    await audioPlaying(page);
    assert.equal(await page.locator('.music-song').inputValue(), 'phase-shift');
    console.log('PASS explicit Pause is respected during later interactions');

    // Recreate the player against saved preferences without reseeding storage.
    await page.evaluate(async () => {
      window.music.dispose();
      const { createMusicPlayer } = await import('/src/audio/player.js');
      window.music = createMusicPlayer(document.querySelector('#app'));
    });
    assert.equal(await page.locator('.music-song').inputValue(), 'blue-hour');
    assert.equal(Object.hasOwn(await stored(page), 'song'), false);
    await audioPlaying(page);
    console.log(
      'PASS a new app player resets to Blue Hour after session selection',
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
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
