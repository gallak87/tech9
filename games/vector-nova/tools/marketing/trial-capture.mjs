import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  installNativeAudioTap,
  startTabRecording,
  stopTabRecording,
} from './tab-recorder.mjs';

// Genuine records: production countdown, fixed-step physics, checkpoints and
// persistence. The only automation is ordinary standard-gamepad input.
const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node tools/marketing/trial-capture.mjs [--record] [--output DIRECTORY] [--level halcyon] [--ship kestrel] [--diagnostic-seconds 30]\nDefault: headless real-time full-lap rehearsal. --record: headed dedicated-tab capture with native game audio. --diagnostic-seconds runs at most 30 seconds of input/motion diagnostics without creating records or a movie. VN_URL reuses an existing server; otherwise starts and closes an owned server.',
  );
  process.exit(0);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const output = resolve(
  root,
  option('--output', '.experiments/marketing/trial-capture'),
);
const level = option('--level', 'halcyon');
const ship = option('--ship', 'kestrel');
const record = args.includes('--record');
const diagnosticSeconds = Number(option('--diagnostic-seconds', '0'));
assert.ok(
  Number.isFinite(diagnosticSeconds) &&
    diagnosticSeconds >= 0 &&
    diagnosticSeconds <= 30,
);
assert.ok(
  !record || diagnosticSeconds === 0,
  'Diagnostics never create a partial movie.',
);
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
      {
        cwd: root,
        stdio: 'ignore',
        env: {
          ...process.env,
          VN_VITE_CACHE_DIR: `node_modules/.vite-marketing-${port}`,
        },
      },
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
    },
    { record },
  );
  await installNativeAudioTap(context);
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
    const T = await import('/node_modules/three/build/three.module.js');
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
    const ghostRoot = game
      .getScene()
      .scene.getObjectByName('Personal best ghost / non-colliding');
    const ghostPosition = new T.Vector3();
    const playerPosition = new T.Vector3();
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
          if (s.lap.lap >= 3) state.runoutUntil = now + 3500;
        }
        if (state.runoutUntil !== null && now >= state.runoutUntil) {
          state.enabled = false;
          pad.axes[0] = 0;
          pad.buttons = pad.buttons.map(() => button(0));
          game.pause();
          state.done = true;
          return;
        }
        const motion = s.runtime.state.motion ?? s.runtime.state;
        const mode = motion.flight?.mode ?? motion.mode;
        // Plain magnetic bodies have no mode field. Only an explicit airborne
        // runtime should suppress the ordinary ground driver's steering.
        const grounded = mode == null || mode === 'magnetic';
        const control = getRacerControl(s.vehicle, track, {
          difficulty: 'hard',
          // A real line change after the flying lap lets its newly saved ghost
          // become visible beside us instead of fading at exact hull overlap.
          lane: s.lap.lap >= 3 ? 7 : 0,
          pace: 1,
          runtime: { pose: () => ({ grounded }) },
        });
        // Run the flying lap at the ordinary hard driver's full pace. Do not
        // pace or brake against the standing ghost. Settle boost before the line
        // and keep the actual run-out at normal cruise for an even engine tail.
        if (
          s.lap.lap === 1 ||
          (s.lap.lap === 2 && s.vehicle.distance >= track.length * 2 - 350) ||
          s.lap.lap >= 3
        )
          control.boost = false;
        pad.axes[0] = control.steer;
        for (const [index, value] of [
          [7, control.throttle],
          [6, control.brake],
          [0, Number(control.boost)],
          [1, Number(control.airbrake)],
        ])
          pad.buttons[index] = button(value);
        let ghost = null;
        if (s.lap.lap >= 3 && trial?.ghostStart === 'flying' && ghostRoot) {
          ghostRoot.getWorldPosition(ghostPosition);
          const screen = ghostPosition.clone().project(game.getScene().camera);
          const opacity = ghostRoot.children[0]?.material?.opacity ?? 0;
          ghost = {
            world: ghostPosition.toArray(),
            screen: screen.toArray(),
            visible: ghostRoot.visible,
            opacity,
            inFrame:
              ghostRoot.visible &&
              opacity >= 0.04 &&
              Math.abs(screen.x) <= 1 &&
              Math.abs(screen.y) <= 1 &&
              screen.z > -1 &&
              screen.z < 1,
            separation: ghostPosition.distanceTo(
              playerPosition.fromArray(s.ship.position),
            ),
          };
        }
        if (s.lap.lap >= 3)
          state.ghostFrames.push({
            now,
            lap: s.lap.lap,
            elapsed: trial.elapsed,
            ghostStart: trial.ghostStart,
            ghost,
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
            motionMode: mode ?? 'magnetic',
            ghost,
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
    await startTabRecording(page, {
      outputFile: join(output, 'trial-race.webm'),
      title: 'VN Genuine Time Trial Capture',
      audioGain: 0.55,
    });
    await page.evaluate(() => {
      window.__VN_TRIAL_RECORDING = window.__VN_TAB_RECORDING;
    });
  }
  console.log(
    `START ${level}/${ship}: length ${initial.track.length.toFixed(1)}m, real-time standard input, stock Time Trial`,
  );
  await page.evaluate(() => window.__VN_TRIAL_CAPTURE.start());
  let done = false;
  for (
    let poll = 0;
    poll < (diagnosticSeconds ? Math.ceil(diagnosticSeconds / 5) : 120) &&
    !done;
    poll++
  ) {
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
        lateral: s.vehicle.lateral,
        heading: s.vehicle.heading,
        input: s.input,
        motionMode:
          (s.runtime.state.motion ?? s.runtime.state).mode ?? 'magnetic',
        valid: s.lap.valid,
        errors: state.errors,
      };
    });
    done = progress.done;
    console.log(JSON.stringify(progress));
  }
  if (diagnosticSeconds) {
    const diagnostic = await page.evaluate(() => {
      window.__VN.pause();
      return {
        ...window.__VN_TRIAL_CAPTURE,
        start: undefined,
        final: window.__VN.getSnapshot(),
      };
    });
    await writeFile(
      join(output, 'diagnostic.json'),
      JSON.stringify({ faults, ...diagnostic }, null, 2),
    );
    assert.deepEqual(faults, []);
    assert.deepEqual(diagnostic.errors, []);
    console.log(`Diagnostic saved to ${join(output, 'diagnostic.json')}`);
  } else {
    if (record) {
      await stopTabRecording(page);
      const recording = await page.evaluate(() => {
        const recording = window.__VN_TRIAL_RECORDING;
        const drive = window.__VN_TRIAL_CAPTURE;
        const firstVisible = drive.ghostFrames.find(
          (frame) => frame.ghostStart === 'flying' && frame.ghost?.inFrame,
        );
        return {
          settings: recording.settings,
          audioBuses: recording.audioBuses,
          error: recording.error ?? null,
          greenAtRawSeconds: (drive.startedAt - recording.startedAt) / 1000,
          secondFinishAtRawSeconds:
            (drive.completions[1].wallTime - recording.startedAt) / 1000,
          excerptInPoint:
            (drive.completions[1].wallTime - recording.startedAt) / 1000 - 1,
          secondFinishAtExcerptSeconds: 1,
          excerptSeconds: 4,
          postLineGhostFirstVisibleAtRawSeconds: firstVisible
            ? (firstVisible.now - recording.startedAt) / 1000
            : null,
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
        flyingLap: 'ordinary hard-driver pace, no standing-ghost pacing',
        finalApproachBoostOffMetres: 350,
        postLineRunoutSeconds: 3.5,
        postLineTargetLaneMetres: 7,
        excerptLineCrossingSeconds: 1,
      },
      method:
        'A genuine standing warm-up followed by a full-pace flying lap and 3.5 seconds of the next lap. Ordinary virtual standard-gamepad input and unmodified stock Time Trial production runtime; no ghost pacing, scenario, finish, checkpoint, timer or ghost seeding.',
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
    assert.equal(captured.completions[1].start, 'flying');
    assert.equal(captured.final.timeTrial.ghostStart, 'flying');
    const postLineFrames = captured.ghostFrames.filter(
      (frame) => frame.elapsed >= 0.1 && frame.elapsed <= 3,
    );
    const readableFrames = postLineFrames.filter(
      (frame) => frame.ghostStart === 'flying' && frame.ghost?.inFrame,
    );
    assert.ok(
      postLineFrames.length >= 30 &&
        readableFrames.length >= 15 &&
        readableFrames.length / postLineFrames.length >= 0.3,
      'The genuine flying ghost appears visibly after the line in the next lap.',
    );
    const flying = captured.completions[1];
    assert.ok(
      captured.samples
        .filter(
          (sample) =>
            sample.now >= flying.wallTime - 1000 &&
            sample.now <= flying.wallTime + 3000,
        )
        .every((sample) => !sample.input.boost && !sample.vehicle.boosting),
      'The line crossing and post-line ghost reveal have steady boost-free audio.',
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
  }
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((done) => server.once('close', done));
  }
}
