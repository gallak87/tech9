import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { access, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

function installMenuCapture() {
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
    const state = window.__VN_FRONTEND.getState();
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

async function glide(page, selector, pointer, duration = 420) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing pointer target ${selector}`);
  const destination = {
    x: box.x + box.width * 0.55,
    y: box.y + box.height * 0.55,
  };
  const origin = { ...pointer };
  const steps = 18;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const eased = t * t * (3 - 2 * t);
    await page.mouse.move(
      origin.x + (destination.x - origin.x) * eased,
      origin.y + (destination.y - origin.y) * eased,
    );
    await page.waitForTimeout(duration / steps);
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

async function flow(page, id, mark, pointer) {
  const click = async (selector) => {
    const target = await glide(page, selector, pointer);
    await target.click();
    await settledImages(page);
  };
  if (id === 'menu-circuits') {
    await mark('main-progress');
    await page.waitForTimeout(2000);
    await click('[data-action="circuits"]');
    for (const level of ['glasswake', 'colossus', 'helion']) {
      await glide(page, `[data-level="${level}"]`, pointer);
      await page.waitForFunction(
        (level) => window.__VN_FRONTEND.getState().previewLevelId === level,
        level,
      );
      await settledImages(page);
      await mark(`circuit-${level}`);
      await page.waitForTimeout(1600);
    }
    await page.locator('[data-level="helion"]').click();
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
    await glide(page, '[data-cup="horizon"]', pointer);
    await mark('cup-horizon-hover');
    await page.waitForTimeout(800);
    await page.locator('[data-cup="horizon"]').click();
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
    await mark('time-trial-records');
    await page.waitForTimeout(2300);
  } else if (id === 'menu-garage') {
    await mark('all-28-progress');
    await page.waitForTimeout(2000);
    await click('[data-action="garage-tab"]');
    await readyShip(page, 'kestrel');
    await mark('garage-open');
    for (const ship of ['bastion', 'needle', 'kestrel']) {
      await glide(page, `button[data-ship="${ship}"]`, pointer);
      await readyShip(page, ship);
      await mark(`ship-${ship}-stats`);
      await page.waitForTimeout(1800);
    }
    await page.locator('button[data-ship="kestrel"]').click();
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
    await page.waitForTimeout(3400);
  } else throw new Error(`Unknown menu flow ${id}`);
}

export async function captureMenus({
  output = resolve(root, '.experiments/marketing/interwoven-menu-v1'),
  flowOnly = false,
  base = process.env.VN_URL,
} = {}) {
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
    kind: 'menu-sources',
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
      'Chrome dedicated-tab getDisplayMedia, no microphone; music disabled; actual menu audio only',
    renderingViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
    profile:
      'isolated dev=2: first two chunks upgrades=1 (16/28 rewards), final Garage all28; Quad Core Kestrel; player career untouched',
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
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(installMenuCapture);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    for (const id of ['menu-circuits', 'menu-cups-trial', 'menu-garage']) {
      console.log(`MENU ${id}`);
      const url = new URL(
        '/?dev=2&ship=kestrel&exotic=kestrel&level=nacre&music=0',
        base,
      );
      if (id !== 'menu-garage') url.searchParams.set('upgrades', '1');
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
      await page.evaluate(() => {
        document.title = 'VN Menu Capture';
      });
      await page.addStyleTag({
        content:
          '.sound-panel,.dev-tools,[data-action="inspect"]{display:none!important}',
      });
      const expectedRewards = id === 'menu-garage' ? '28' : '16';
      await page.waitForFunction(
        (expectedRewards) =>
          document
            .querySelector('.career-progress-bar')
            ?.getAttribute('aria-valuenow') === expectedRewards,
        expectedRewards,
      );
      const progressBox = await page.locator('.career-progress').boundingBox();
      if (
        !progressBox ||
        progressBox.y < 0 ||
        progressBox.y + progressBox.height > 900
      )
        throw new Error(
          'Career progress bar is outside the recording viewport.',
        );
      const pointer = { x: 25, y: 25 };
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
      const inPoint = await page.evaluate(
        (start) => (performance.now() - start) / 1000,
        rawStartedAt,
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
        });
        console.log(`MARK ${id} ${name} ${(rawSeconds - inPoint).toFixed(3)}`);
      };
      const start = await snapshot(page);
      await flow(page, id, mark, pointer);
      const seconds =
        (await page.evaluate(
          (start) => (performance.now() - start) / 1000,
          rawStartedAt,
        )) - inPoint;
      const end = await snapshot(page);
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
        mode: 'menu',
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
      'node tools/marketing/menu-capture.mjs [--output DIRECTORY] [--flow-only]\nCaptures three isolated menu source takes with settled action markers.\n--flow-only verifies the same flows headless, without recording. VN_URL may select an existing server.',
    );
  else {
    const outputIndex = args.indexOf('--output');
    if (
      args.some(
        (arg, index) =>
          !['--output', '--flow-only'].includes(arg) &&
          args[index - 1] !== '--output',
      ) ||
      (outputIndex >= 0 &&
        (!args[outputIndex + 1] || args[outputIndex + 1].startsWith('--')))
    )
      throw new Error('Invalid argument. Use --help.');
    const manifest = await captureMenus({
      output: outputIndex >= 0 ? args[outputIndex + 1] : undefined,
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
