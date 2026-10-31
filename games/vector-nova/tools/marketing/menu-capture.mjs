import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import {
  access,
  appendFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createCareerSlots,
  createMemoryStorage,
} from '../../src/progression/careers.js';
import { createDeveloperSession } from '../../src/progression/developer.js';
import { readTrialRecords } from '../../src/race/time-trial.js';

const root = resolve(import.meta.dirname, '../..');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const sourceIds = ['intro', 'menu-circuits', 'menu-cups-trial', 'menu-garage'];

function storageEntries(storage) {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index);
    return [key, storage.getItem(key)];
  });
}

async function trialFixture(path) {
  if (!path) return null;
  const fixture = JSON.parse(await readFile(resolve(root, path), 'utf8'));
  if (
    !Array.isArray(fixture.storageEntries) ||
    !fixture.storageEntries.length ||
    fixture.storageEntries.some(
      (entry) =>
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        !entry[0].startsWith('vector-nova.trial.v1.') ||
        typeof entry[1] !== 'string',
    ) ||
    !fixture.provenance ||
    typeof fixture.level !== 'string' ||
    typeof fixture.ship !== 'string'
  )
    throw new Error(
      'Expected genuine logical trial storage entries and provenance.',
    );
  const storage = createMemoryStorage();
  for (const [key, value] of fixture.storageEntries)
    storage.setItem(key, value);
  const records = readTrialRecords(storage);
  if (
    !records.length ||
    records.some((record) => !record.saved || !record.ghostSaved) ||
    !records.some((record) => record.identity.ship.id === fixture.ship)
  )
    throw new Error(
      'The fixture must contain a persisted, valid personal ghost.',
    );
  return {
    ...fixture,
    source: resolve(root, path),
    records: records.map(({ key, duration, identity, ghostSaved }) => ({
      key,
      duration,
      identity,
      ghostSaved,
    })),
  };
}

function showcaseSeed(id, fixture) {
  if (id === 'intro') return [];
  const source = createMemoryStorage();
  const careers = createCareerSlots({ storage: () => source });
  careers.create(1);
  const selected = careers.storageFor(1);
  const parameters = new URLSearchParams({
    dev: '2',
    ship: 'kestrel',
    exotic: 'kestrel',
    equipment: 'jump,injector,deflector,lance',
  });
  if (id !== 'menu-garage') parameters.set('upgrades', '1');
  const showcase = createDeveloperSession(parameters).storage();
  for (const [key, value] of storageEntries(showcase))
    selected.setItem(key, value);
  selected.setItem('vector-nova.ship', 'kestrel');
  selected.setItem('vector-nova.circuit', fixture?.level ?? 'nacre');
  if (id === 'menu-cups-trial')
    for (const [key, value] of fixture.storageEntries)
      selected.setItem(key, value);
  return storageEntries(source);
}

async function command(program, args) {
  return new Promise((done, reject) => {
    const child = spawn(program, args, { cwd: root });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr = (stderr + data).slice(-12000);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? done(stdout)
        : reject(new Error(`${program} exited ${code}\n${stderr}`)),
    );
  });
}

function installMenuCapture({ seed, visiblePointer }) {
  for (const [key, value] of seed) localStorage.setItem(key, value);
  localStorage.setItem(
    'vector-nova.music',
    JSON.stringify({ volume: 0.4, collapsed: true }),
  );
  if (visiblePointer) {
    // Tab sharing omits Playwright's virtual OS cursor. Show a plain cursor at
    // the real pointer-event coordinates so the recorded browsing is visible.
    let cursor;
    document.addEventListener('pointermove', (event) => {
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.setAttribute('aria-hidden', 'true');
        cursor.dataset.capturePointer = '';
        cursor.style.cssText =
          'position:fixed;left:0;top:0;width:18px;height:26px;z-index:2147483647;pointer-events:none';
        cursor.innerHTML =
          '<svg viewBox="0 0 18 26" width="18" height="26"><path d="M1 1v20l5-5 4 9 4-2-4-9h7Z" fill="#101010" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
        document.body.append(cursor);
      }
      cursor.style.transform = `translate(${event.clientX}px,${event.clientY}px)`;
    });
  }
  localStorage.setItem(
    'vector-nova.settings',
    JSON.stringify({
      quality: 'high',
      volume: 0.6,
      reducedMotion: false,
      difficulty: 'hard',
      steeringDeadZone: 0,
      controllerPreset: 'classic',
    }),
  );
  const connect = AudioNode.prototype.connect;
  const taps = new WeakMap();
  window.__VN_MENU_AUDIO = [];
  AudioNode.prototype.connect = function (...args) {
    const result = connect.apply(this, args);
    if (args[0] === this.context.destination) {
      let tap = taps.get(this.context);
      if (!tap) {
        tap = this.context.createMediaStreamDestination();
        taps.set(this.context, tap);
        window.__VN_MENU_AUDIO.push({
          context: this.context,
          stream: tap.stream,
        });
      }
      connect.call(this, tap);
    }
    return result;
  };
}

async function snapshot(page) {
  return page.evaluate(() => {
    const state = window.__VN_FRONTEND?.getState();
    if (!state)
      return {
        screen:
          document.querySelector('#front-shell')?.dataset.entryStage ?? null,
        preview: document.querySelector('.entry-ship .ship-preview')
          ? { ...document.querySelector('.entry-ship .ship-preview').dataset }
          : null,
        startVisible: !!document
          .querySelector('.entry-continue')
          ?.getClientRects().length,
        tabs: document.querySelectorAll('.entry-tab').length,
        musicPaused:
          document.querySelector('[data-music-player] audio')?.paused ?? true,
        shipOpacity: document.querySelector('.entry-ship .ship-preview')
          ? getComputedStyle(
              document.querySelector('.entry-ship .ship-preview'),
            ).opacity
          : null,
      };
    const framing = Object.fromEntries(
      [
        ['progress', '.career-progress'],
        ['preview', '.ship-preview'],
        ['stats', '.garage-performance'],
        ['capacity', '.garage-equipment-count'],
      ].map(([name, selector]) => {
        const element = document.querySelector(selector);
        const box = element?.getBoundingClientRect();
        return [
          name,
          box
            ? {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                inFrame:
                  box.width > 0 &&
                  box.height > 0 &&
                  box.x >= 0 &&
                  box.y >= 0 &&
                  box.right <= innerWidth &&
                  box.bottom <= innerHeight,
              }
            : null,
        ];
      }),
    );
    return {
      screen: state.screen,
      intent: state.intent,
      selected: state.selected,
      previewLevelId: state.previewLevelId,
      selectedCup: state.selectedCup,
      shipId: state.shipId,
      preview: state.preview,
      loading: state.loading,
      error: state.error,
      progress:
        document.querySelector('.career-progress')?.textContent.trim() ?? null,
      rewards: Number(
        document
          .querySelector('.career-progress-bar')
          ?.getAttribute('aria-valuenow') ?? NaN,
      ),
      ship: document.querySelector('.ship-details h1')?.textContent ?? null,
      role: document.querySelector('.garage-role')?.textContent ?? null,
      equipment:
        document.querySelector('.garage-equipment-count')?.textContent.trim() ??
        null,
      records: [...document.querySelectorAll('.records-list li')].map(
        (row) => ({
          description: row
            .querySelector('.record-description')
            ?.textContent.trim(),
          best: row.querySelector('strong')?.textContent.trim(),
          track: row.querySelector('[data-record-key]')?.dataset.recordTrack,
          ship: row.querySelector('[data-record-key]')?.dataset.recordShip,
        }),
      ),
      framing,
    };
  });
}

async function settledImages(page) {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('#front-shell img')].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    null,
    { timeout: 120000 },
  );
  await page.waitForTimeout(120);
}

async function readyShip(page, id) {
  await page.waitForFunction(
    (id) => {
      const state = window.__VN_FRONTEND.getState();
      return (
        state.preview?.selected === id &&
        !state.preview.loading &&
        !state.preview.error
      );
    },
    id,
    { timeout: 120000 },
  );
  await page.waitForTimeout(200);
}

async function glide(
  page,
  selector,
  pointer,
  duration = 360,
  { x = 0.55, y = 0.55 } = {},
) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing pointer target ${selector}`);
  const destination = {
    x: box.x + box.width * x,
    y: box.y + box.height * y,
  };
  const origin = { ...pointer };
  const steps = 18;
  const started = performance.now();
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const eased = t * t * (3 - 2 * t);
    await page.mouse.move(
      origin.x + (destination.x - origin.x) * eased,
      origin.y + (destination.y - origin.y) * eased,
    );
    const wait = started + (duration * step) / steps - performance.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
  Object.assign(pointer, destination);
  return target;
}

async function createRecorder(page, context, raw, binding) {
  await writeFile(raw, Buffer.alloc(0));
  await page.exposeFunction(binding, (chunk) =>
    appendFile(raw, Buffer.from(chunk, 'base64')),
  );
  await page.evaluate((binding) => {
    const button = document.createElement('button');
    button.id = 'marketing-record';
    button.textContent = 'Record menu take';
    button.style =
      'position:fixed;left:20px;top:90px;z-index:99999;padding:16px';
    document.body.append(button);
    button.onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          monitorTypeSurfaces: 'exclude',
          surfaceSwitching: 'exclude',
          video: {
            displaySurface: 'browser',
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
            frameRate: { ideal: 60, max: 60 },
            cursor: 'always',
          },
          audio: false,
        });
        const video = stream.getVideoTracks()[0];
        if (video.getSettings().displaySurface !== 'browser') {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error('Refusing non-tab capture.');
        }
        const mixer = new AudioContext({ sampleRate: 48000 });
        const output = mixer.createMediaStreamDestination();
        // Menus currently produce no sounds when music is disabled. Retain a
        // silent real-time audio track rather than fabricating interface clicks.
        const silence = mixer.createConstantSource();
        silence.offset.value = 0;
        silence.connect(output);
        silence.start();
        const taps = window.__VN_MENU_AUDIO;
        for (const tap of taps) {
          await tap.context.resume();
          mixer.createMediaStreamSource(tap.stream).connect(output);
        }
        await mixer.resume();
        const combined = new MediaStream([
          video,
          output.stream.getAudioTracks()[0],
        ]);
        const recorder = new MediaRecorder(combined, {
          mimeType: 'video/webm;codecs=vp9,opus',
          videoBitsPerSecond: 24000000,
          audioBitsPerSecond: 192000,
        });
        const capture = {
          video,
          startedAt: 0,
          done: false,
          pending: Promise.resolve(),
          audioBuses: taps.length,
          error: null,
        };
        window.__VN_MENU_RECORDING = capture;
        recorder.ondataavailable = (event) => {
          if (!event.data.size) return;
          capture.pending = capture.pending.then(async () => {
            const encoded = await new Promise((done, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(reader.error);
              reader.onload = () =>
                done(
                  reader.result.slice(reader.result.indexOf(';base64,') + 8),
                );
              reader.readAsDataURL(event.data);
            });
            await window[binding](encoded);
          });
        };
        recorder.onerror = (event) => {
          capture.error = String(event.error);
        };
        recorder.onstop = async () => {
          try {
            await capture.pending;
          } catch (error) {
            capture.error = String(error);
          }
          combined.getTracks().forEach((track) => track.stop());
          silence.stop();
          await mixer.close();
          capture.done = true;
        };
        capture.stop = () => recorder.stop();
        button.remove();
        recorder.start(500);
        capture.startedAt = performance.now();
        capture.active = true;
      } catch (error) {
        window.__VN_MENU_RECORD_ERROR = String(error);
      }
    };
  }, binding);
  await page.bringToFront();
  await page.locator('#marketing-record').click();
  await page.waitForFunction(
    () => window.__VN_MENU_RECORDING?.active || window.__VN_MENU_RECORD_ERROR,
    null,
    { timeout: 20000 },
  );
  const error = await page.evaluate(() => window.__VN_MENU_RECORD_ERROR);
  if (error) throw new Error(error);
  const cdp = await context.newCDPSession(page);
  await page.waitForTimeout(300);
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await page.evaluate(() => ({
      settings: window.__VN_MENU_RECORDING.video.getSettings(),
      width: innerWidth,
    }));
    const missing = (current.settings.width * 9) / 16 - current.settings.height;
    if (Math.abs(missing) <= 2) break;
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: {
        height:
          bounds.height +
          Math.ceil(missing / (current.settings.width / current.width)),
      },
    });
    await page.waitForTimeout(250);
  }
  await cdp.detach();
  const framing = await page.evaluate(() =>
    window.__VN_MENU_RECORDING.video.getSettings(),
  );
  if (Math.abs(framing.width / framing.height - 16 / 9) > 0.005)
    throw new Error(
      `Menu tab capture clipped: ${framing.width}x${framing.height}`,
    );
  return framing;
}

async function flow(page, id, mark, pointer, fixture) {
  const click = async (selector) => {
    await glide(page, selector, pointer);
    await page.mouse.click(pointer.x, pointer.y);
    await settledImages(page);
  };
  if (id === 'menu-circuits') {
    await mark('main-progress');
    await glide(page, '[data-action="circuits"]', pointer, 650);
    await page.waitForTimeout(1450);
    await click('[data-action="circuits"]');
    for (const level of ['glasswake', 'colossus', 'helion']) {
      await mark(`circuit-${level}-approach`);
      await glide(page, `[data-level="${level}"]`, pointer, 360, { x: 0.13 });
      await page.waitForFunction(
        (level) => window.__VN_FRONTEND.getState().previewLevelId === level,
        level,
      );
      await settledImages(page);
      await mark(`circuit-${level}`);
      await page.waitForTimeout(1400);
      await mark(`circuit-${level}-hold-end`);
    }
    await page.mouse.click(pointer.x, pointer.y);
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().selected === 'helion',
    );
    await settledImages(page);
    await mark('selected-helion');
    await page.waitForTimeout(1000);
  } else if (id === 'menu-cups-trial') {
    await mark('main-before-cups');
    await page.waitForTimeout(500);
    await click('[data-action="cup-hub"]');
    await mark('cup-browse-start');
    await glide(page, '[data-cup="frontier"]', pointer);
    await settledImages(page);
    await mark('cup-frontier-hover');
    await page.waitForTimeout(800);
    await mark('cup-horizon-approach');
    await glide(page, '[data-cup="horizon"]', pointer);
    await settledImages(page);
    await mark('cup-horizon-hover');
    await page.waitForTimeout(800);
    await page.mouse.click(pointer.x, pointer.y);
    await settledImages(page);
    await mark('cup-horizon-details');
    await page.waitForTimeout(2300);
    await click('[data-action="time-trial"]');
    await mark('time-trial-mode');
    await page.waitForTimeout(1400);
    await click('[data-action="records"]');
    await page.waitForFunction(
      () => window.__VN_FRONTEND.getState().screen === 'records',
    );
    await page.waitForFunction(
      ({ level, ship }) =>
        [...document.querySelectorAll('.records-list [data-record-key]')].some(
          (button) =>
            button.dataset.recordTrack === level &&
            button.dataset.recordShip === ship,
        ),
      { level: fixture.level, ship: fixture.ship },
    );
    await settledImages(page);
    await mark('time-trial-records');
    await glide(page, '[data-record-filter="track"]', pointer);
    await page
      .locator('[data-record-filter="track"]')
      .selectOption(fixture.level);
    await mark('time-trial-filtered-records');
    await glide(page, '.records-list li:first-child', pointer, 450);
    await page.waitForTimeout(2300);
    await mark('time-trial-records-hold-end');
  } else if (id === 'menu-garage') {
    await mark('all-28-progress');
    await page.waitForTimeout(2000);
    await click('[data-action="garage-tab"]');
    await readyShip(page, 'kestrel');
    await mark('garage-open');
    for (const ship of ['bastion', 'needle', 'kestrel']) {
      await mark(`ship-${ship}-approach`);
      await glide(page, `button[data-ship="${ship}"]`, pointer);
      await readyShip(page, ship);
      await mark(`ship-${ship}-stats`);
      await page.waitForTimeout(1800);
      await mark(`ship-${ship}-hold-end`);
    }
    await page.mouse.click(pointer.x, pointer.y);
    await readyShip(page, 'kestrel');
    await page.waitForFunction(
      () =>
        document
          .querySelector('button[data-ship="kestrel"]')
          ?.getAttribute('aria-pressed') === 'true' &&
        /4\s*\/\s*4.*Quad Core/.test(
          document.querySelector('.garage-equipment-count')?.textContent,
        ),
    );
    await mark('kestrel-selected-quad-core');
    await glide(page, '.garage-equipment-count', pointer, 700, { x: 1.15 });
    await page.waitForTimeout(3300);
    await mark('kestrel-loadout-hold-end');
  } else throw new Error(`Unknown menu flow ${id}`);
}

async function pauseMusic(page) {
  await page.evaluate(() => {
    const player = document.querySelector('[data-music-player]');
    const audio = player?.querySelector('audio');
    if (audio && !audio.paused) player.querySelector('.music-play').click();
    if (player && !player.classList.contains('is-collapsed'))
      player.querySelector('.music-expand').click();
  });
}

async function startTitle(page) {
  await page.evaluate(async () => {
    window.__VN_TITLE_STARTED_AT = performance.now();
    await window.__VN_TITLE_MODULE.startEntry(document.querySelector('#app'));
    const audio = document.querySelector('[data-music-player] audio');
    if (audio && !audio.paused) document.querySelector('.music-play').click();
    await new Promise((done) =>
      requestAnimationFrame(() => {
        window.__VN_TITLE_FIRST_FRAME = performance.now();
        done();
      }),
    );
  });
  await page.waitForFunction(
    () =>
      document.querySelector('#front-shell')?.dataset.entryStage === 'intro',
  );
}

export async function captureMenus({
  output = resolve(root, '.experiments/marketing/rc2-menu'),
  flowOnly = false,
  base = process.env.VN_URL,
  only = sourceIds,
  recordFixture = null,
} = {}) {
  if (
    !only.length ||
    new Set(only).size !== only.length ||
    only.some((id) => !sourceIds.includes(id))
  )
    throw new Error(`Choose source ids from ${sourceIds.join(', ')}.`);
  const fixture = await trialFixture(recordFixture);
  if (only.includes('menu-cups-trial') && !fixture)
    throw new Error(
      '--record-fixture is required for populated Time Trial records.',
    );
  output = resolve(root, output);
  await mkdir(output, { recursive: true });
  if (!flowOnly) {
    try {
      await access(join(output, 'manifest.json'));
      throw new Error(`Refusing to overwrite ${output}/manifest.json`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    kind: 'intro-menu-sources',
    flowOnly,
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    sourceStatus: execFileSync('git', ['status', '--short', '--', '.'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    backend:
      'Chrome dedicated-tab getDisplayMedia, no microphone; native music paused; actual menu audio only',
    renderingViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
    pointer:
      'Menus draw a plain noninteractive arrow at actual pointermove coordinates because Chrome tab sharing omits the virtual OS cursor; native cursor hidden. Intro has no pointer.',
    profile:
      'isolated throwaway Career1, showroom dev2 profile copied into dev1 memory: first two chunks16/28, final Garage28/28; Quad Core Kestrel; genuine trial entries copied unchanged; personal careers untouched',
    trialFixture: fixture
      ? {
          source: fixture.source,
          provenance: fixture.provenance,
          records: fixture.records,
        }
      : null,
    shots: [],
  };
  let ownedServer, browser;
  try {
    if (!base) {
      const port = await new Promise((done, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          server.close(() => done(port));
        });
      });
      base = `http://127.0.0.1:${port}`;
      ownedServer = spawn(
        process.execPath,
        [
          join(root, 'node_modules/vite/bin/vite.js'),
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort',
        ],
        { cwd: root, stdio: 'ignore' },
      );
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          ready = (await fetch(base)).ok;
        } catch {
          /* starting */
        }
        if (ready) break;
        if (ownedServer.exitCode !== null)
          throw new Error('Owned Vite server exited.');
        await sleep(150);
      }
      if (!ready) throw new Error('Local game server did not become ready.');
    }
    browser = await chromium.launch({
      channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
      headless: flowOnly,
      args: [
        '--mute-audio',
        '--window-size=1600,1000',
        '--window-position=0,0',
        '--auto-accept-this-tab-capture',
        '--auto-select-tab-capture-source-by-title=VN Menu Capture',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    for (const id of only) {
      console.log(`SOURCE ${id}`);
      const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 1,
      });
      await context.addInitScript(installMenuCapture, {
        seed: showcaseSeed(id, fixture),
        visiblePointer: id !== 'intro',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error(error.message);
      });
      const url = new URL('/?dev=1&ship=kestrel&level=nacre', base);
      if (id === 'intro') {
        await page.route('**/src/core/main.js*', (route) =>
          route.fulfill({ contentType: 'text/javascript', body: '' }),
        );
        await page.goto(base);
        // Load production modules/models before recording, then let the actual
        // entry own its native five-second fade. No replay hooks or fake title.
        await page.evaluate(async () => {
          window.__VN_TITLE_MODULE = await import('/src/frontend/entry.js');
          await import('/src/frontend/ship-preview.js');
          const { loadShipModel } = await import('/src/ships/model-cache.js');
          await loadShipModel('kestrel');
        });
      } else {
        if (id === 'menu-cups-trial')
          url.searchParams.set('level', fixture.level);
        await page.goto(url.href);
        await page.waitForFunction(
          () => window.__VN_FRONTEND?.getState().screen === 'home',
        );
        await page.waitForFunction(
          () => window.__VN_FRONTEND.getState().preload.fraction === 1,
          null,
          { timeout: 180000 },
        );
        await settledImages(page);
        await pauseMusic(page);
      }
      await page.evaluate(() => {
        document.title = 'VN Menu Capture';
      });
      await page.addStyleTag({
        content:
          '.sound-panel,.dev-tools,[data-action="inspect"]{display:none!important}html,body,body *{cursor:none!important}',
      });
      if (id !== 'intro') {
        const expectedRewards = id === 'menu-garage' ? '28' : '16';
        await page.waitForFunction(
          (expectedRewards) =>
            document
              .querySelector('.career-progress-bar')
              ?.getAttribute('aria-valuenow') === expectedRewards,
          expectedRewards,
        );
        const progressBox = await page
          .locator('.career-progress')
          .boundingBox();
        if (
          !progressBox ||
          progressBox.y < 0 ||
          progressBox.y + progressBox.height > 900
        )
          throw new Error(
            'Career progress bar is outside the recording viewport.',
          );
      }
      const pointer = { x: 1540, y: 850 };
      await page.mouse.move(pointer.x, pointer.y);
      const capture = flowOnly
        ? null
        : await createRecorder(
            page,
            context,
            join(output, `${id}.webm`),
            `writeMenu_${id}`,
          );
      await page.mouse.move(pointer.x, pointer.y);
      await page.waitForTimeout(100);
      const rawStartedAt = await page.evaluate(
        () => window.__VN_MENU_RECORDING?.startedAt ?? performance.now(),
      );
      if (id === 'intro') await startTitle(page);
      const inPoint = await page.evaluate(
        ({ start, intro }) =>
          ((intro ? window.__VN_TITLE_FIRST_FRAME : performance.now()) -
            start) /
          1000,
        { start: rawStartedAt, intro: id === 'intro' },
      );
      const actions = [];
      const mark = async (name) => {
        const rawSeconds = await page.evaluate(
          (start) => (performance.now() - start) / 1000,
          rawStartedAt,
        );
        actions.push({
          id: name,
          at: rawSeconds - inPoint,
          rawSeconds,
          state: await snapshot(page),
          pointer: { ...pointer },
        });
        console.log(`MARK ${id} ${name} ${(rawSeconds - inPoint).toFixed(3)}`);
      };
      const start = await snapshot(page);
      if (id === 'intro') {
        await mark('title-background-and-reveal');
        await page.waitForFunction(
          () =>
            document.querySelector('.entry-ship .ship-preview')?.dataset
              .state === 'ready',
          null,
          { timeout: 120000 },
        );
        await mark('title-ship-ready');
        const remaining = await page.evaluate(
          () => 5700 - (performance.now() - window.__VN_TITLE_STARTED_AT),
        );
        if (remaining > 0) await page.waitForTimeout(remaining);
        await mark('title-reveal-complete-handle');
      } else await flow(page, id, mark, pointer, fixture);
      const seconds =
        (await page.evaluate(
          (start) => (performance.now() - start) / 1000,
          rawStartedAt,
        )) - inPoint;
      const end = await snapshot(page);
      if (
        id === 'intro' &&
        (end.screen !== 'intro' ||
          !end.startVisible ||
          end.tabs ||
          !end.musicPaused ||
          Number(end.shipOpacity) < 0.99)
      )
        throw new Error(
          'Native title reveal, paused transport or manual Start changed during capture.',
        );
      if (
        id === 'menu-garage' &&
        ['preview', 'stats', 'capacity'].some(
          (key) => !end.framing[key]?.inFrame,
        )
      )
        throw new Error(
          'Garage ship, stats or Quad Core capacity is outside the recording viewport.',
        );
      if (errors.length || end.error)
        throw new Error(
          `Menu runtime error: ${[...errors, end.error].filter(Boolean).join('; ')}`,
        );
      const take = {
        id,
        seconds,
        inPoint,
        mode: id === 'intro' ? 'intro' : 'menu',
        state: {},
        actions,
        capture,
        start,
        end,
      };
      if (!flowOnly) {
        await page.evaluate(() => window.__VN_MENU_RECORDING.stop());
        await page.waitForFunction(
          () => window.__VN_MENU_RECORDING.done,
          null,
          { timeout: 30000 },
        );
        const status = await page.evaluate(() => ({
          error: window.__VN_MENU_RECORDING.error,
          audioBuses: window.__VN_MENU_RECORDING.audioBuses,
        }));
        if (status.error) throw new Error(status.error);
        take.audioBuses = status.audioBuses;
        take.raw = JSON.parse(
          await command('ffprobe', [
            '-v',
            'error',
            '-count_packets',
            '-show_entries',
            'stream=codec_type,width,height,nb_read_packets,sample_rate,channels',
            '-of',
            'json',
            join(output, `${id}.webm`),
          ]),
        );
      }
      manifest.shots.push(take);
      await writeFile(
        join(output, flowOnly ? 'flow-manifest.json' : 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );
      console.log(`SAVED ${id} ${seconds.toFixed(3)}s`);
      await context.close();
    }
    return manifest;
  } finally {
    await browser?.close();
    if (ownedServer && ownedServer.exitCode === null) {
      ownedServer.kill('SIGTERM');
      await Promise.race([
        new Promise((done) => ownedServer.once('exit', done)),
        sleep(2000),
      ]);
      if (ownedServer.exitCode === null) ownedServer.kill('SIGKILL');
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.includes('--help'))
    console.log(
      `node tools/marketing/menu-capture.mjs [--output DIRECTORY] [--only ${sourceIds.join(',')}] [--record-fixture FILE] [--flow-only]\nCaptures the real title reveal and three isolated menu source takes, preserving pointer travel around settled markers.\n--record-fixture supplies genuine logical Time Trial record/ghost entries with provenance; required for menu-cups-trial.\n--flow-only verifies selected flows headless, without recording. VN_URL may select an existing server.`,
    );
  else {
    const options = {};
    for (let index = 0; index < args.length; index++) {
      const flag = args[index];
      if (flag === '--flow-only') continue;
      if (
        !['--output', '--only', '--record-fixture'].includes(flag) ||
        !args[index + 1] ||
        args[index + 1].startsWith('--') ||
        options[flag]
      )
        throw new Error('Invalid argument. Use --help.');
      options[flag] = args[++index];
    }
    const manifest = await captureMenus({
      output: options['--output'],
      only: options['--only']?.split(','),
      recordFixture: options['--record-fixture'],
      flowOnly: args.includes('--flow-only'),
    });
    console.log(
      JSON.stringify(
        {
          shots: manifest.shots.map(({ id, seconds, actions }) => ({
            id,
            seconds,
            actions: actions.map(({ id, at }) => ({ id, at })),
          })),
        },
        null,
        2,
      ),
    );
  }
}
