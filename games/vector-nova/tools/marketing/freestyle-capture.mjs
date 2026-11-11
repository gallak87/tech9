import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import createLevel from '../../src/levels/launchworks/index.js';
import { createDeviceRuntime } from '../../src/pickups/runtime.js';
import { createVehicleState } from '../../src/physics/index.js';
import {
  CAREER_SLOTS_KEY,
  createCareerSlots,
  createMemoryStorage,
} from '../../src/progression/careers.js';
import {
  createProfileStore,
  PROFILE_KEY,
} from '../../src/progression/profile.js';
import { saveShipSelection } from '../../src/ships/catalog.js';
import { createStuntPilot } from './freestyle-driver.mjs';
import {
  installNativeAudioTap,
  startTabRecording,
  stopTabRecording,
} from './tab-recorder.mjs';

const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node tools/marketing/freestyle-capture.mjs [--rehearse | --browser-rehearse | --record] [--full-approach] [--output DIRECTORY] [--transfer 3] [--trick roll|corkscrew] [--hold-seconds 2.4] [--ship kestrel]\nDefault: CPU-only native flight/contact rehearsal at 60 Hz input. --full-approach genuinely drives all earlier transfers from rest, retaining the correct chain/HUD before recording the chosen transfer. Corkscrew holds the normal left/down combo; 4s allows two turns on Veil Bore. --browser-rehearse runs the real-time standard-pad driver in muted headless Chrome. --record captures a dedicated headed tab with native game audio. VN_URL reuses an existing server. The isolated normal career has Founders Cup and the requested hull; developer HUD stays absent.',
  );
  process.exit(0);
}
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const output = resolve(
  root,
  option('--output', '.experiments/marketing/rc4/freestyle-rehearsal'),
);
const transfer = Number(option('--transfer', '3'));
const rollSeconds = Number(
  option('--hold-seconds', option('--roll-seconds', '2.4')),
);
const trick = option('--trick', 'roll');
const ship = option('--ship', 'kestrel');
assert.ok(Number.isInteger(transfer) && transfer >= 1 && transfer <= 5);
assert.ok(rollSeconds >= 0.5 && rollSeconds <= 4.5);
assert.ok(['roll', 'corkscrew'].includes(trick));
const record = args.includes('--record');
const browserRehearse = args.includes('--browser-rehearse');
const fullApproach = args.includes('--full-approach');
await mkdir(output, { recursive: true });

function validate(take) {
  assert.equal(take.errors.length, 0, take.errors.join('; '));
  assert.ok(take.markers.launch, 'Native launch was observed.');
  assert.ok(take.markers.trick, 'A complete native trick was recognized.');
  assert.ok(take.markers.contact, 'Native receiver contact was observed.');
  assert.ok(take.markers.bank, 'Native sustained-support score bank occurred.');
  assert.ok(
    take.bank.tricks.filter((kind) => kind === trick).length >=
      (trick === 'corkscrew' ? 2 : 1),
    'The selected complete native trick sequence was banked.',
  );
  assert.equal(take.bank.landed, true);
  assert.equal(take.bank.clean, true, 'The native receiver catch is clean.');
  if (take.fullApproach)
    assert.equal(
      take.bank.chain,
      transfer,
      'Earlier real catches retain the chain.',
    );
  assert.ok(
    take.maxAirScore >= 800,
    'Air score grows visibly during rotation.',
  );
  assert.equal(take.recoveries, 0, 'No recovery teleport occurs.');
  assert.ok(take.markers.contact.time - take.markers.launch.time >= 3.8);
}

function mark(events, state, markers) {
  for (const event of events) {
    if (event.payload?.id !== `transfer-${transfer}`) continue;
    let key = {
      'jump-launch': 'launch',
      'freestyle-trick': 'trick',
      'jump-transfer': 'contact',
      'freestyle-bank': 'bank',
    }[event.type];
    if (key === 'trick' && event.payload.ordinal > 1)
      key = `trick${event.payload.ordinal}`;
    if (key && !markers[key])
      markers[key] = { time: state.time, event: structuredClone(event) };
  }
}

if (!record && !browserRehearse) {
  const level = createLevel();
  const track = level.createTrack();
  const collisionWorld = await level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const runtime = createDeviceRuntime({
    track,
    devices: level.racing.createDevices(track),
    equipmentEnabled: false,
    motion: level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    }),
  });
  try {
    const state = {
      ...createVehicleState(ship),
      ...track.scenarios[fullApproach ? 'staging' : `jump${transfer}-approach`],
    };
    runtime.reset({ state, seed: 7 });
    const driver = createStuntPilot(track, { transfer, rollSeconds, trick });
    const take = {
      backend: 'CPU native triangles/dynamics, ordinary held inputs at 60 Hz',
      transfer,
      label: track.jumps[transfer - 1].label,
      ship,
      rollSeconds,
      fullApproach,
      trick,
      markers: {},
      bank: null,
      maxAirScore: 0,
      recoveries: 0,
      errors: [],
      samples: [],
    };
    let control;
    for (let tick = 0; tick < (fullApproach ? 18000 : 2400); tick++) {
      const motion = runtime.snapshot();
      if (tick % 2 === 0)
        control = driver({ state, motion, pose: runtime.pose(1) });
      const events = runtime.advance(state, control, 1 / 120);
      mark(events, state, take.markers);
      take.recoveries += events.filter(
        (event) => event.type === 'road-recovery',
      ).length;
      const fs = motion.freestyle ?? motion.motion?.freestyle;
      take.maxAirScore = Math.max(
        take.maxAirScore,
        fs?.flight?.rotationPoints ?? 0,
      );
      const bank = events.find(
        (event) =>
          event.type === 'freestyle-bank' &&
          event.payload.id === `transfer-${transfer}`,
      );
      if (bank) take.bank = bank.payload;
      if (tick % 12 === 0)
        take.samples.push({
          time: state.time,
          speed: state.speed,
          distance: state.distance,
          angular: fs.angular,
          airScore: fs.flight?.rotationPoints ?? 0,
          tricks: fs.flight?.tricks ?? [],
          grounded: runtime.pose(1)?.grounded,
        });
      if (take.bank && state.time >= take.markers.bank.time + 2.7) break;
      if (events.some((event) => event.type === 'jump-miss')) {
        take.errors.push('Native jump miss.');
        break;
      }
    }
    validate(take);
    await writeFile(
      join(output, 'rehearsal.json'),
      JSON.stringify(take, null, 2),
    );
    console.log(JSON.stringify({ ...take, samples: undefined }, null, 2));
  } finally {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  }
  process.exit(0);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let base = process.env.VN_URL;
let browser, server;
try {
  if (!base) {
    const port = await new Promise((done, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const chosen = probe.address().port;
        probe.close(() => done(chosen));
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
  const title = 'VN RC4 Freestyle Capture';
  browser = await chromium.launch({
    channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
    headless: !record,
    args: [
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1600,1000',
      '--window-position=0,0',
      '--auto-accept-this-tab-capture',
      `--auto-select-tab-capture-source-by-title=${title}`,
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const memory = createMemoryStorage();
  const careers = createCareerSlots({ storage: () => memory });
  careers.create(1);
  careers.rename(1, 'Trailer Freestyle');
  const careerStorage = careers.storageFor(1);
  const profile = createProfileStore(() => careerStorage);
  profile.recordCup('founders');
  const seededProfile = JSON.parse(careerStorage.getItem(PROFILE_KEY));
  if (ship !== 'shrike' && !seededProfile.claims.includes(`ship-${ship}`))
    seededProfile.claims.push(`ship-${ship}`);
  careerStorage.setItem(PROFILE_KEY, JSON.stringify(seededProfile));
  saveShipSelection(ship, careerStorage);
  const seed = Array.from({ length: memory.length }, (_, index) => {
    const key = memory.key(index);
    return [key, memory.getItem(key)];
  });
  await installNativeAudioTap(context);
  await context.addInitScript(
    ({ record, seed, registryKey }) => {
      if (localStorage.getItem(registryKey) === null)
        for (const [key, value] of seed) localStorage.setItem(key, value);
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
    { record, seed, registryKey: CAREER_SLOTS_KEY },
  );
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (error) => faults.push(error.message));
  await page.goto(`${base}/?intro=0&level=launchworks&music=0`);
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () => window.__VN?.ready && !window.__VN.getSnapshot().ship.loading,
    null,
    { timeout: 180000 },
  );
  assert.equal(await page.locator('.fs-diagnostics,.fs-practice').count(), 0);
  await page.evaluate(
    async ({ transfer, rollSeconds, fullApproach, trick }) => {
      const game = window.__VN;
      if (fullApproach) game.restart();
      else game.loadScenario(`jump${transfer}-approach`, 7);
      game.pause();
      const { createStuntPilot } =
        await import('/tools/marketing/freestyle-driver.mjs');
      const T = await import('/node_modules/three/build/three.module.js');
      const track = game.getTrack();
      const driver = createStuntPilot(track, { transfer, rollSeconds, trick });
      const button = (value) => ({
        value,
        pressed: value > 0.5,
        touched: value > 0,
      });
      const pad = {
        id: 'VN Freestyle Trailer Driver',
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
      const take = {
        enabled: false,
        done: false,
        startedAt: null,
        preparing: fullApproach,
        approachReady: !fullApproach,
        priorLegs: [],
        markers: {},
        bank: null,
        maxAirScore: 0,
        recoveries: 0,
        errors: [],
        intervals: [],
        samples: [],
      };
      window.__VN_FREESTYLE_CAPTURE = take;
      let lastFrame = null,
        lastSample = -Infinity,
        seenEvents = 0;
      const frame = (now) => {
        if (!take.enabled) {
          requestAnimationFrame(frame);
          return;
        }
        try {
          const s = game.getSnapshot();
          const motion = s.runtime.state.motion ?? s.runtime.state;
          const fs = motion.freestyle;
          if (lastFrame !== null) take.intervals.push(now - lastFrame);
          lastFrame = now;
          for (const event of s.events.slice(seenEvents)) {
            let key = {
              'jump-launch': 'launch',
              'freestyle-trick': 'trick',
              'jump-transfer': 'contact',
              'freestyle-bank': 'bank',
            }[event.type];
            if (key === 'trick' && event.payload.ordinal > 1)
              key = `trick${event.payload.ordinal}`;
            const selected = event.payload?.id === `transfer-${transfer}`;
            if (key && selected && !take.markers[key])
              take.markers[key] = {
                time: s.vehicle.time,
                wallTime: now,
                event,
              };
            if (event.type === 'freestyle-bank' && selected)
              take.bank = event.payload;
            if (event.type === 'road-recovery') take.recoveries++;
            if (event.type === 'jump-miss')
              throw new Error('Native transfer miss.');
          }
          seenEvents = s.events.length;
          if (
            take.preparing &&
            fs.legs.length === transfer - 1 &&
            !fs.flight &&
            s.vehicle.distance >=
              track.scenarios[`jump${transfer}-approach`].distance
          ) {
            take.priorLegs = structuredClone(fs.legs);
            take.preparing = false;
            take.approachReady = true;
            take.enabled = false;
            pad.axes = [0, 0, 0, 0];
            pad.buttons = pad.buttons.map(() => button(0));
            game.pause();
            requestAnimationFrame(frame);
            return;
          }
          take.maxAirScore = Math.max(
            take.maxAirScore,
            fs?.flight?.rotationPoints ?? 0,
          );
          if (s.errors.length) throw new Error(s.errors.join('; '));
          const control = driver({
            state: s.vehicle,
            motion,
            pose: {
              position: new T.Vector3().fromArray(s.ship.position),
              quaternion: new T.Quaternion().fromArray(s.ship.quaternion),
            },
          });
          pad.axes = [
            control.steer,
            0,
            control.aerialRoll,
            -control.aerialPitch,
          ];
          for (const [index, value] of [
            [7, control.throttle],
            [6, control.brake],
            [0, Number(control.boost)],
            [1, Number(control.airbrake)],
            [2, Number(control.aerialYaw > 0.5)],
            [3, Number(control.aerialYaw < -0.5)],
          ])
            pad.buttons[index] = button(value);
          if (now - lastSample >= 80) {
            take.samples.push({
              now,
              time: s.vehicle.time,
              speed: s.vehicle.speed,
              distance: s.vehicle.distance,
              angular: fs.angular,
              airScore: fs.flight?.rotationPoints ?? 0,
              tricks: fs.flight?.tricks ?? [],
              pose: s.ship,
              input: s.input,
              score: fs.score,
              payoff: document.querySelector('.fs-grade')?.textContent,
            });
            lastSample = now;
          }
          if (take.bank && now - take.markers.bank.wallTime >= 2700) {
            take.enabled = false;
            take.done = true;
            pad.axes = [0, 0, 0, 0];
            pad.buttons = pad.buttons.map(() => button(0));
            return;
          }
          if (now - take.startedAt > (take.preparing ? 120000 : 20000))
            throw new Error('Freestyle transfer exceeded capture bound.');
        } catch (error) {
          take.errors.push(error.message);
          take.enabled = false;
          take.done = true;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      take.start = () => {
        take.startedAt = performance.now();
        take.intervals = [];
        take.samples = [];
        take.maxAirScore = 0;
        lastFrame = null;
        lastSample = -Infinity;
        take.enabled = true;
        game.resume();
      };
    },
    { transfer, rollSeconds, fullApproach, trick },
  );
  await page.addStyleTag({
    content:
      '.sound-panel,.dev-tools{display:none!important}body{cursor:none!important}',
  });
  await page.waitForTimeout(record ? 5000 : 1500);
  if (fullApproach) {
    await page.evaluate(() => window.__VN_FREESTYLE_CAPTURE.start());
    await page.waitForFunction(
      () =>
        window.__VN_FREESTYLE_CAPTURE.approachReady ||
        window.__VN_FREESTYLE_CAPTURE.done,
      null,
      { timeout: 130000 },
    );
    const prepared = await page.evaluate(() => ({
      ready: window.__VN_FREESTYLE_CAPTURE.approachReady,
      legs: window.__VN_FREESTYLE_CAPTURE.priorLegs,
      errors: window.__VN_FREESTYLE_CAPTURE.errors,
    }));
    assert.equal(prepared.ready, true, prepared.errors.join('; '));
    assert.equal(prepared.legs.length, transfer - 1);
    assert.ok(prepared.legs.every((leg) => leg.landed));
    console.log(
      `Native approach ready after ${prepared.legs.length} real catches.`,
    );
  }
  let recording;
  if (record)
    recording = await startTabRecording(page, {
      outputFile: join(output, 'freestyle.webm'),
      title,
    });
  await page.evaluate(() => window.__VN_FREESTYLE_CAPTURE.start());
  await page.waitForFunction(() => window.__VN_FREESTYLE_CAPTURE.done, null, {
    timeout: 30000,
  });
  if (record) recording = { ...recording, ...(await stopTabRecording(page)) };
  const take = await page.evaluate(() => {
    const take = window.__VN_FREESTYLE_CAPTURE;
    return { ...take, start: undefined };
  });
  take.errors.push(...faults);
  Object.assign(take, {
    transfer,
    ship,
    rollSeconds,
    fullApproach,
    trick,
    backend: 'Real-time standard controller; normal production Freestyle HUD',
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    recording,
  });
  if (recording) {
    for (const marker of Object.values(take.markers))
      marker.rawSeconds = (marker.wallTime - recording.startedAt) / 1000;
    const inPoint = (take.startedAt - recording.startedAt) / 1000 + 0.1;
    take.excerpt = {
      inPoint,
      seconds: Math.min(9, recording.duration - inPoint - 0.05),
      markers: structuredClone(take.markers),
    };
  }
  take.frameIntervals = take.intervals;
  delete take.intervals;
  await writeFile(
    join(output, record ? 'capture.json' : 'rehearsal-browser.json'),
    JSON.stringify(take, null, 2),
  );
  validate(take);
  console.log(
    JSON.stringify(
      { ...take, samples: undefined, frameIntervals: undefined },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (server?.exitCode === null) server.kill('SIGTERM');
}
