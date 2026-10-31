import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { access, appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

// Genuine records: production countdown, fixed-step physics, checkpoints and
// persistence. The only automation is ordinary standard-gamepad input.
const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node tools/marketing/trial-capture.mjs [--record] [--output DIRECTORY] [--level halcyon] [--ship kestrel]\nDefault: headless real-time full-lap rehearsal. --record: headed dedicated-tab capture with native game audio. VN_URL reuses an existing server; otherwise starts and closes an owned server.',
  );
  process.exit(0);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const output = resolve(
  root,
  option('--output', '.experiments/marketing/rc2-trial'),
);
const level = option('--level', 'halcyon');
const ship = option('--ship', 'kestrel');
const record = args.includes('--record');
for (const name of ['trial-fixture.json', 'trial-race.webm']) {
  const path = join(output, name);
  try {
    await access(path);
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(
    `Refusing to overwrite ${path}. Choose a fresh --output directory.`,
  );
}
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let base = process.env.VN_URL;
let browser, server;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void browser?.close();
    if (server?.exitCode === null) server.kill('SIGTERM');
  });
await mkdir(output, { recursive: true });
try {
  if (!base) {
    const port = await new Promise((done, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const port = probe.address().port;
        probe.close(() => done(port));
      });
    });
    base = `http://127.0.0.1:${port}`;
    server = spawn(
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
        /* Starting. */
      }
      if (ready) break;
      if (server.exitCode !== null)
        throw new Error('Owned Vite server exited.');
      await sleep(150);
    }
    assert.ok(ready, 'Owned Vite server became ready.');
  }
  browser = await chromium.launch({
    channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
    headless: !record,
    args: [
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1600,1000',
      '--window-position=0,0',
      '--auto-accept-this-tab-capture',
      '--auto-select-tab-capture-source-by-title=VN Genuine Time Trial Capture',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ({ record }) => {
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({
          quality: record ? 'high' : 'low',
          volume: 0.6,
          reducedMotion: false,
          steeringDeadZone: 0,
          controllerPreset: 'classic',
        }),
      );
      const original = AudioNode.prototype.connect;
      const taps = new WeakMap();
      window.__VN_TRIAL_AUDIO = [];
      AudioNode.prototype.connect = function (...args) {
        const result = original.apply(this, args);
        if (args[0] === this.context.destination) {
          let tap = taps.get(this.context);
          if (!tap) {
            tap = this.context.createMediaStreamDestination();
            taps.set(this.context, tap);
            window.__VN_TRIAL_AUDIO.push({
              context: this.context,
              stream: tap.stream,
            });
          }
          original.call(this, tap);
        }
        return result;
      };
    },
    { record },
  );
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (error) => faults.push(error.message));
  await page.goto(`${base}/?music=0`);
  await page.evaluate(
    async ({ ship }) => {
      const { createCareerSlots } = await import('/src/progression/careers.js');
      const { PROFILE_KEY } = await import('/src/progression/profile.js');
      const { saveShipSelection } = await import('/src/ships/catalog.js');
      const careers = createCareerSlots();
      careers.create(1);
      careers.rename(1, 'Trailer Time Trial');
      const storage = careers.storageFor(1);
      // Unlock only the chosen hull in this fresh browser context. No races,
      // timers, checkpoints, records or ghost samples are seeded.
      const profile = JSON.parse(storage.getItem(PROFILE_KEY));
      if (ship !== 'shrike') profile.claims.push(`ship-${ship}`);
      storage.setItem(PROFILE_KEY, JSON.stringify(profile));
      saveShipSelection(ship, storage);
    },
    { ship },
  );
  await page.goto(`${base}/?intro=0&level=${level}&music=0`);
  await page.locator('[data-action="time-trial"]').first().click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () => window.__VN?.ready && !window.__VN.getSnapshot().ship.loading,
    null,
    { timeout: 180000 },
  );
  await page.evaluate(async () => {
    const game = window.__VN;
    game.pause();
    const { getRacerControl } = await import('/src/race/racers.js');
    const { createCareerSlots } = await import('/src/progression/careers.js');
    const { readTrialRecords, readTrialBest } =
      await import('/src/race/time-trial.js');
    const T = await import('/node_modules/three/build/three.module.js');
    const careers = createCareerSlots();
    const storage = careers.storageFor(careers.active().id);
    const track = game.getTrack();
    const button = (value) => ({
      value,
      pressed: value > 0.5,
      touched: value > 0,
    });
    const pad = {
      id: 'VN Genuine Trial Driver',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => button(0)),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });
    const state = {
      enabled: false,
      done: false,
      samples: [],
      firstLap: [],
      completions: [],
      errors: [],
      lastLap: 1,
      lastSample: -Infinity,
      ghostFrames: [],
      startedAt: null,
      intervals: [],
      lastFrame: null,
      runoutUntil: null,
    };
    window.__VN_TRIAL_CAPTURE = state;
    let reference = null;
    const projection = new T.PerspectiveCamera();
    const ghostPosition = new T.Vector3();
    const lerpSample = (samples, time) => {
      let low = 0,
        high = samples.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (samples[middle].elapsed <= time) low = middle;
        else high = middle;
      }
      const a = samples[low],
        b = samples[high];
      const t = Math.max(
        0,
        Math.min(1, (time - a.elapsed) / (b.elapsed - a.elapsed)),
      );
      return {
        distance: a.distance + (b.distance - a.distance) * t,
        speed: a.speed + (b.speed - a.speed) * t,
        boost: a.boost,
      };
    };
    const frame = (now) => {
      if (!state.enabled) {
        requestAnimationFrame(frame);
        return;
      }
      try {
        const s = game.getSnapshot();
        if (s.mode === 'racing' && state.startedAt === null)
          state.startedAt = now;
        if (state.lastFrame !== null)
          state.intervals.push(now - state.lastFrame);
        state.lastFrame = now;
        const trial = s.timeTrial;
        if (trial && s.lap.lap !== state.lastLap) {
          const completed = structuredClone(trial.lastLap);
          state.completions.push({
            ...completed,
            wallTime: now,
            videoTime:
              state.startedAt === null ? null : (now - state.startedAt) / 1000,
          });
          state.lastLap = s.lap.lap;
          if (!completed.playerValid)
            throw new Error(`Invalid completed lap ${completed.lap}.`);
          if (s.lap.lap === 2) {
            state.firstLap.push({
              elapsed: completed.playerTotalTime,
              distance: track.length,
              speed: s.vehicle.speed,
              boost: s.vehicle.boosting,
            });
            const record = readTrialRecords(storage).find(
              (record) => record.identity.start === 'standing',
            );
            reference = readTrialBest(record.identity, storage);
          }
          if (s.lap.lap >= 3) state.runoutUntil = now + 1200;
        }
        if (state.runoutUntil !== null && now >= state.runoutUntil) {
          state.enabled = false;
          pad.axes[0] = 0;
          pad.buttons = pad.buttons.map(() => button(0));
          game.pause();
          state.done = true;
          return;
        }
        const mode = s.runtime.state.flight?.mode ?? s.runtime.state.mode;
        const control = getRacerControl(s.vehicle, track, {
          difficulty: 'hard',
          lane: 0,
          pace: 1,
          runtime: { pose: () => ({ grounded: mode === 'magnetic' }) },
        });
        let referenceGap = null;
        if (s.mode === 'racing' && s.lap.lap === 1) {
          // A clean cruise lap leaves genuine reserve for following the saved
          // ghost closely on lap two. The player's boost remains available.
          control.boost = false;
          state.firstLap.push({
            elapsed: trial.elapsed,
            distance: s.vehicle.distance,
            speed: s.vehicle.speed,
            boost: s.vehicle.boosting,
          });
        } else if (
          s.mode === 'racing' &&
          s.lap.lap === 2 &&
          state.firstLap.length > 2
        ) {
          // Brake/throttle normally to follow our actual prior lap, keeping the
          // cyan personal ghost ahead in the native chase view near the line.
          const ref = lerpSample(state.firstLap, trial.elapsed);
          referenceGap = ref.distance - (s.vehicle.distance - track.length);
          const targetSpeed = Math.max(
            0,
            ref.speed + (referenceGap - 18) * 0.8,
          );
          control.throttle = s.vehicle.speed <= targetSpeed + 1 ? 1 : 0;
          control.brake = Math.max(
            0,
            Math.min(1, (s.vehicle.speed - targetSpeed - 1) / 18),
          );
          control.boost =
            trial.elapsed < reference.duration - 8 &&
            control.brake === 0 &&
            targetSpeed > s.vehicle.speed + 3 &&
            s.vehicle.energy > 8;
        }
        if (s.lap.lap >= 3) control.boost = false;
        pad.axes[0] = control.steer;
        for (const [index, value] of [
          [7, control.throttle],
          [6, control.brake],
          [0, Number(control.boost)],
          [1, Number(control.airbrake)],
        ])
          pad.buttons[index] = button(value);
        let ghost = null;
        if (
          s.lap.lap === 2 &&
          reference?.samples?.length > 2 &&
          trial.elapsed <= reference.duration
        ) {
          const samples = reference.samples;
          let low = 0,
            high = samples.length - 1;
          while (high - low > 1) {
            const mid = (low + high) >> 1;
            if (samples[mid][0] <= trial.elapsed) low = mid;
            else high = mid;
          }
          const a = samples[low],
            b = samples[high];
          const t = Math.max(
            0,
            Math.min(1, (trial.elapsed - a[0]) / (b[0] - a[0])),
          );
          ghostPosition
            .fromArray(a, 1)
            .lerp(new T.Vector3().fromArray(b, 1), t);
          const world = ghostPosition.toArray();
          projection.fov = s.camera.fov;
          projection.aspect = innerWidth / innerHeight;
          projection.updateProjectionMatrix();
          projection.position.fromArray(s.camera.position);
          projection.quaternion.fromArray(s.camera.quaternion);
          projection.updateMatrixWorld();
          const screen = ghostPosition.clone().project(projection);
          ghost = {
            world,
            screen: screen.toArray(),
            inFrame:
              Math.abs(screen.x) <= 1 &&
              Math.abs(screen.y) <= 1 &&
              screen.z > -1 &&
              screen.z < 1,
            separation: ghostPosition.distanceTo(
              new T.Vector3().fromArray(s.ship.position),
            ),
          };
        }
        if (
          s.lap.lap === 2 &&
          trial.elapsed >= (reference?.duration ?? Infinity) - 6
        )
          state.ghostFrames.push({
            elapsed: trial.elapsed,
            ghost,
            referenceGap,
          });
        if (now - state.lastSample >= 100) {
          state.samples.push({
            now,
            mode: s.mode,
            tick: s.tick,
            lap: s.lap,
            timeTrial: trial,
            vehicle: s.vehicle,
            input: s.input,
            ghost,
            referenceGap,
            camera: s.camera.mode,
            events: s.events.slice(-10),
            errors: s.errors,
          });
          state.lastSample = now;
        }
        if (s.errors.length) throw new Error(s.errors.join('; '));
      } catch (error) {
        state.errors.push(error.message);
        state.enabled = false;
        state.done = true;
        game.pause();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    state.start = () => {
      state.enabled = true;
      game.resume();
    };
  });
  const initial = await page.evaluate(() => window.__VN.getSnapshot());
  assert.equal(initial.vehicle.shipId, ship);
  assert.equal(initial.competition.enabled, false);
  assert.equal(initial.timeTrial.best, null);
  assert.equal(initial.vehicle.distance, 0);
  assert.equal(initial.vehicle.energy, 100);
  if (record) {
    const raw = join(output, 'trial-race.webm');
    await writeFile(raw, Buffer.alloc(0));
    await page.exposeFunction('writeTrialCapture', (chunk) =>
      appendFile(raw, Buffer.from(chunk, 'base64')),
    );
    await page.evaluate(() => {
      document.title = 'VN Genuine Time Trial Capture';
      const button = document.createElement('button');
      button.id = 'record-trial';
      button.textContent = 'Record genuine Time Trial';
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
              cursor: 'never',
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
          if (!window.__VN_TRIAL_AUDIO.length)
            throw new Error('No native game audio taps.');
          for (const tap of window.__VN_TRIAL_AUDIO) {
            await tap.context.resume();
            const gain = mixer.createGain();
            gain.gain.value = 0.55;
            mixer
              .createMediaStreamSource(tap.stream)
              .connect(gain)
              .connect(output);
          }
          await mixer.resume();
          const mix = new MediaStream([
            video,
            output.stream.getAudioTracks()[0],
          ]);
          const recorder = new MediaRecorder(mix, {
            mimeType: 'video/webm;codecs=vp9,opus',
            videoBitsPerSecond: 24000000,
            audioBitsPerSecond: 192000,
          });
          const capture = {
            pending: Promise.resolve(),
            video,
            done: false,
            settings: video.getSettings(),
            audioBuses: window.__VN_TRIAL_AUDIO.length,
          };
          window.__VN_TRIAL_RECORDING = capture;
          recorder.ondataavailable = (event) => {
            if (!event.data.size) return;
            capture.pending = capture.pending.then(async () => {
              const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(reader.error);
                reader.onload = () =>
                  resolve(
                    reader.result.slice(reader.result.indexOf(';base64,') + 8),
                  );
                reader.readAsDataURL(event.data);
              });
              await window.writeTrialCapture(data);
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
            mix.getTracks().forEach((track) => track.stop());
            await mixer.close();
            capture.done = true;
          };
          capture.stop = () => recorder.stop();
          button.remove();
          recorder.start(500);
          capture.startedAt = performance.now();
          capture.active = true;
        } catch (error) {
          window.__VN_TRIAL_RECORDING_ERROR = String(error);
        }
      };
    });
    await page.addStyleTag({
      content:
        '.sound-panel,.dev-tools{display:none!important}body{cursor:none!important}',
    });
    await page.bringToFront();
    await page.locator('#record-trial').click();
    await page.waitForFunction(
      () =>
        window.__VN_TRIAL_RECORDING?.active ||
        window.__VN_TRIAL_RECORDING_ERROR,
      null,
      { timeout: 20000 },
    );
    const error = await page.evaluate(() => window.__VN_TRIAL_RECORDING_ERROR);
    if (error) throw new Error(error);
    const cdp = await context.newCDPSession(page);
    await page.waitForTimeout(300);
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await page.evaluate(() => ({
        settings: window.__VN_TRIAL_RECORDING.video.getSettings(),
        width: innerWidth,
      }));
      const missing =
        (current.settings.width * 9) / 16 - current.settings.height;
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
    const settings = await page.evaluate(() => {
      const capture = window.__VN_TRIAL_RECORDING;
      capture.settings = capture.video.getSettings();
      return capture.settings;
    });
    assert.ok(
      Math.abs(settings.width / settings.height - 16 / 9) <= 0.005,
      `Unclipped 16:9 capture: ${settings.width}x${settings.height}`,
    );
  }
  console.log(
    `START ${level}/${ship}: length ${initial.track.length.toFixed(1)}m, real-time standard input, stock Time Trial`,
  );
  await page.evaluate(() => window.__VN_TRIAL_CAPTURE.start());
  let done = false;
  for (let poll = 0; poll < 120 && !done; poll++) {
    await page.waitForTimeout(5000);
    const progress = await page.evaluate(() => {
      const state = window.__VN_TRIAL_CAPTURE;
      const s = window.__VN.getSnapshot();
      return {
        done: state.done,
        lap: s.lap.lap,
        seconds: s.timeTrial.elapsed,
        distance: s.vehicle.distance,
        speed: s.vehicle.speed,
        referenceGap: state.samples.at(-1)?.referenceGap ?? null,
        valid: s.lap.valid,
        errors: state.errors,
      };
    });
    done = progress.done;
    console.log(JSON.stringify(progress));
  }
  if (record) {
    await page.evaluate(() => window.__VN_TRIAL_RECORDING.stop());
    await page.waitForFunction(() => window.__VN_TRIAL_RECORDING.done, null, {
      timeout: 30000,
    });
    const recording = await page.evaluate(() => {
      const recording = window.__VN_TRIAL_RECORDING;
      const drive = window.__VN_TRIAL_CAPTURE;
      return {
        settings: recording.settings,
        audioBuses: recording.audioBuses,
        error: recording.error ?? null,
        greenAtRawSeconds: (drive.startedAt - recording.startedAt) / 1000,
        secondFinishAtRawSeconds:
          (drive.completions[1].wallTime - recording.startedAt) / 1000,
      };
    });
    await writeFile(
      join(output, 'recording.json'),
      JSON.stringify(recording, null, 2),
    );
    assert.equal(recording.error, null);
  }
  const captured = await page.evaluate(async () => {
    const { createCareerSlots } = await import('/src/progression/careers.js');
    const { readTrialRecords } = await import('/src/race/time-trial.js');
    const careers = createCareerSlots();
    const storage = careers.storageFor(1);
    const state = window.__VN_TRIAL_CAPTURE;
    const storageEntries = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key.startsWith('vector-nova.trial.v1.'))
        storageEntries.push([key, storage.getItem(key)]);
    }
    return {
      storageEntries,
      records: readTrialRecords(storage),
      completions: state.completions,
      samples: state.samples,
      ghostFrames: state.ghostFrames,
      intervals: state.intervals,
      errors: state.errors,
      final: window.__VN.getSnapshot(),
    };
  });
  const provenance = {
    generatedAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    sourceStatus: execFileSync('git', ['status', '--short', '--', '.'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    driver: {
      firstLapBoost: false,
      secondLapTargetGhostGapMetres: 18,
      finalEightSecondsBoost: false,
    },
    method:
      'Two full real-time laps through ordinary virtual standard-gamepad input and unmodified stock Time Trial production runtime. No scenario, finish, checkpoint, timer or ghost seeding.',
    career:
      'Fresh isolated browser Career 1; only chosen hull unlocked for selection. No personal browser profile or saves.',
    completions: captured.completions,
    rules: captured.records.map((record) => record.identity.rules),
  };
  await writeFile(
    join(output, 'rehearsal.json'),
    JSON.stringify({ provenance, ...captured }, null, 2),
  );
  assert.ok(done, 'Both full laps completed before timeout.');
  assert.deepEqual(faults, []);
  assert.deepEqual(captured.errors, []);
  assert.equal(captured.completions.length, 2);
  assert.ok(
    captured.completions.every(
      (lap) => lap.playerValid && lap.saved?.ghostSaved,
    ),
  );
  assert.ok(
    captured.records.length >= 2 &&
      captured.records.every((record) => record.saved && record.ghostSaved),
  );
  assert.ok(captured.final.vehicle.resetCount === 0);
  const finishTime = captured.completions[1].playerTotalTime;
  const finishFrames = captured.ghostFrames.filter(
    (frame) =>
      frame.elapsed >= finishTime - 3.3 && frame.elapsed <= finishTime - 0.1,
  );
  const readableFrames = finishFrames.filter(
    (frame) =>
      frame.ghost?.inFrame &&
      frame.ghost.separation >= 7 &&
      frame.ghost.separation <= 65,
  );
  assert.ok(
    finishFrames.length >= 30 &&
      readableFrames.length / finishFrames.length >= 0.8,
    'Genuine ghost stays readable in the four-second finish excerpt.',
  );
  if (record)
    assert.ok(
      captured.samples
        .filter(
          (sample) =>
            sample.lap.lap === 2 && sample.timeTrial.elapsed >= finishTime - 4,
        )
        .every((sample) => !sample.input.boost && !sample.vehicle.boosting),
      'Final finish excerpt has no boost toggles.',
    );
  const fixture = {
    storageEntries: captured.storageEntries,
    provenance,
    level,
    ship,
  };
  await writeFile(
    join(output, 'trial-fixture.json'),
    JSON.stringify(fixture, null, 2),
  );
  console.log(
    `PASS ${captured.completions.map((lap) => `${lap.start} ${lap.playerTotalTime.toFixed(3)}s`).join(' / ')}; ${captured.records.length} persisted ghosts; fixture ${join(output, 'trial-fixture.json')}`,
  );
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((done) => server.once('close', done));
  }
}
