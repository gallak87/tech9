import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import {
  CAREER_SLOTS_KEY,
  createCareerSlots,
  createMemoryStorage,
} from '../../src/progression/careers.js';
import {
  createProfileStore,
  PROFILE_KEY,
  shipUnlocked,
} from '../../src/progression/profile.js';
import { modeUnlockRequirement } from '../../src/levels/access.js';
import { saveShipSelection, SHIPS } from '../../src/ships/catalog.js';
import {
  installNativeAudioTap,
  startTabRecording,
  stopTabRecording,
} from './tab-recorder.mjs';

// Only standard-gamepad inputs are automated. The actual production session
// owns the field, contacts, physical progress, countdown and rival extraction.
const { values } = parseArgs({
  options: {
    record: { type: 'boolean', default: false },
    output: {
      type: 'string',
      default: '.experiments/marketing/rc5/eliminator-scout',
    },
    url: { type: 'string', default: process.env.VN_URL },
    level: { type: 'string', default: 'eliminator-saffron' },
    ship: { type: 'string', default: 'kestrel' },
    quality: { type: 'string', default: 'high' },
    difficulty: { type: 'string', default: 'easy' },
    'boost-lead': { type: 'string', default: '2' },
    'follow-gap': { type: 'string', default: '14' },
    'follow-lane': { type: 'string', default: '0' },
    'require-escape': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});
if (values.help) {
  console.log(
    'VN_URL=<server> node tools/marketing/eliminator-capture.mjs [--record] [--level eliminator-saffron|eliminator-glasswake] [--ship kestrel] [--output DIRECTORY] [--require-escape]\nDefault: muted headless real-time rehearsal. --record captures a dedicated game tab and native audio. The runner attempts a last-place escape before a real cut; metadata distinguishes an earned escape from the fallback ordinary rival cut. No clock, field, placement or elimination data is seeded.',
  );
  process.exit(0);
}
assert.ok(
  values.url,
  'Supply VN_URL or --url for a server serving this checkout.',
);
assert.ok(
  ['eliminator-saffron', 'eliminator-glasswake'].includes(values.level),
);
assert.ok(
  SHIPS.some(({ id }) => id === values.ship),
  'Choose a ship from the course build’s fleet.',
);
assert.ok(['high', 'low'].includes(values.quality));
assert.ok(['easy', 'medium', 'hard'].includes(values.difficulty));
const driverOptions = {
  boostLead: Number(values['boost-lead']),
  followingGap: Number(values['follow-gap']),
  followingLane: Number(values['follow-lane']),
};
assert.ok(driverOptions.boostLead >= 1 && driverOptions.boostLead <= 6);
assert.ok(driverOptions.followingGap >= 0 && driverOptions.followingGap <= 50);
assert.ok(Math.abs(driverOptions.followingLane) <= 18);
const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, values.output);
for (const name of ['eliminator.webm', 'capture.json']) {
  try {
    await access(join(output, name));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(`Refusing to overwrite ${join(output, name)}.`);
}
await mkdir(output, { recursive: true });
const provenance = {
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  checkout: root,
  serverUrl: values.url,
  revisionScope: 'Capture checkout; verify the supplied server serves it.',
  runtimeWorkingTreeChanges: execFileSync(
    'git',
    [
      'status',
      '--short',
      '--',
      'src',
      'public',
      'index.html',
      'package.json',
      'package-lock.json',
      'vite.config.js',
    ],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean),
  inputs:
    'Ordinary standard-gamepad input through the native real-time session.',
  staging: `Isolated Frontier Cup and preceding course prerequisites plus ${values.ship} selection only; no field, motion, clock, placement or cut seeds.`,
};
const memory = createMemoryStorage();
const careers = createCareerSlots({ storage: () => memory, now: () => 1 });
careers.create(1);
careers.rename(1, 'Trailer Eliminator');
const storage = careers.storageFor(1);
const profileStore = createProfileStore(() => storage);
profileStore.recordCup('frontier');
const mode = modeUnlockRequirement('eliminator');
for (const previous of mode.levelIds.slice(
  0,
  mode.levelIds.indexOf(values.level),
))
  assert.ok(profileStore.recordCourseFinish(previous));
const profile = JSON.parse(storage.getItem(PROFILE_KEY));
if (!shipUnlocked(profile, values.ship))
  profile.claims.push(`ship-${values.ship}`);
storage.setItem(PROFILE_KEY, JSON.stringify(profile));
saveShipSelection(values.ship, storage);
const seed = Array.from({ length: memory.length }, (_, i) => {
  const key = memory.key(i);
  return [key, memory.getItem(key)];
});
const title = 'VN RC5 Eliminator Capture';
const browser = await chromium.launch({
  channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
  headless: !values.record,
  args: [
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1600,1000',
    '--window-position=0,0',
    '--auto-accept-this-tab-capture',
    `--auto-select-tab-capture-source-by-title=${title}`,
  ],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await installNativeAudioTap(context);
  await context.addInitScript(
    ({ seed, registry, quality, difficulty }) => {
      if (localStorage.getItem(registry) === null)
        for (const [key, value] of seed) localStorage.setItem(key, value);
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({
          quality,
          difficulty,
          volume: 0.6,
          reducedMotion: false,
          steeringDeadZone: 0,
          controllerPreset: 'classic',
        }),
      );
    },
    {
      seed,
      registry: CAREER_SLOTS_KEY,
      quality: values.quality,
      difficulty: values.difficulty,
    },
  );
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
  const url = new URL('/', values.url);
  url.search = new URLSearchParams({
    intro: '0',
    level: values.level,
    music: '0',
  }).toString();
  await page.goto(url.href);
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  await page.locator('[data-action="eliminator"]').click();
  await page.locator(`[data-level="${values.level}"]`).click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () => window.__VN?.ready && !window.__VN.getSnapshot().ship.loading,
    null,
    { timeout: 180000 },
  );
  await page.evaluate(async (options) => {
    const game = window.__VN;
    game.pause();
    const track = game.getTrack();
    const { createEliminatorCaptureDriver } =
      await import('/tools/marketing/eliminator-driver.mjs');
    const pilot = createEliminatorCaptureDriver(options);
    const button = (value) => ({
      value,
      pressed: value > 0.5,
      touched: value > 0,
    });
    const pad = {
      id: 'VN RC5 Eliminator Driver',
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
      startedAt: null,
      recordingStartedAt: null,
      samples: [],
      markers: [],
      cuts: [],
      passes: [],
      errors: [],
      intervals: [],
      lastFrame: null,
      lastSample: -Infinity,
      lastRisk: null,
      previousRows: null,
      acceptedCut: null,
      maxVisibleRivals: 0,
      racingAt: null,
    };
    window.__VN_ELIMINATOR_CAPTURE = state;
    const mark = (id, now, snapshot, extra = {}) =>
      state.markers.push({
        id,
        now,
        time: snapshot.eliminator.elapsed,
        position: snapshot.eliminator.playerPosition,
        remaining: snapshot.eliminator.remaining,
        ...extra,
      });
    const frame = (now) => {
      if (!state.enabled) {
        requestAnimationFrame(frame);
        return;
      }
      try {
        const snapshot = game.getSnapshot(),
          event = snapshot.eliminator;
        if (state.lastFrame !== null)
          state.intervals.push(now - state.lastFrame);
        state.lastFrame = now;
        if (snapshot.mode === 'racing' && state.racingAt === null) {
          state.racingAt = now;
          mark('racing', now, snapshot);
        }
        if (event.atRiskId !== state.lastRisk) {
          mark('at-risk-change', now, snapshot, { atRiskId: event.atRiskId });
          state.lastRisk = event.atRiskId;
        }
        const rows = snapshot.competition.standings.filter(
          (row) => row.id !== 'player' && !row.eliminated,
        );
        const motion = snapshot.runtime.state.motion ?? snapshot.runtime.state;
        const movementMode = motion.flight?.mode ?? motion.mode;
        const { input, intent } = pilot({
          state: snapshot.vehicle,
          track,
          event,
          opponents: rows,
          runtime: {
            pose: () => ({
              grounded: movementMode == null || movementMode === 'magnetic',
            }),
          },
        });
        if (state.previousRows)
          for (const rival of rows) {
            const before = state.previousRows.find(
              (row) => row.id === rival.id,
            );
            if (before?.gap > 0 && rival.distance < snapshot.vehicle.distance) {
              const pass = {
                id: rival.id,
                now,
                time: event.elapsed,
                position: event.playerPosition,
                previousGap: before.gap,
                gap: rival.distance - snapshot.vehicle.distance,
              };
              state.passes.push(pass);
              mark('physical-pass', now, snapshot, {
                rivalId: pass.id,
                previousGap: pass.previousGap,
                gap: pass.gap,
              });
            }
          }
        state.previousRows = rows.map((row) => ({
          id: row.id,
          gap: row.distance - snapshot.vehicle.distance,
        }));
        for (const cut of event.eliminated)
          if (!state.cuts.some((seen) => seen.id === cut.id)) {
            const observed = { ...cut, now };
            state.cuts.push(observed);
            mark('native-cut', now, snapshot, { cut: observed });
            if (cut.id !== 'player') state.acceptedCut ??= observed;
          }
        let visibleRivals = 0;
        const { camera } = game.getScene();
        for (const rival of rows) {
          const gap = rival.distance - snapshot.vehicle.distance;
          if (gap < -10 || gap > 300) continue;
          const road = track.sample(rival.distance);
          const projected = road.position
            .clone()
            .addScaledVector(road.right, rival.lateral)
            .addScaledVector(road.up, 0.72)
            .project(camera);
          if (
            Math.abs(projected.x) < 0.95 &&
            Math.abs(projected.y) < 0.95 &&
            projected.z > -1 &&
            projected.z < 1
          )
            visibleRivals++;
        }
        state.maxVisibleRivals = Math.max(
          state.maxVisibleRivals,
          visibleRivals,
        );
        if (now - state.lastSample >= 50) {
          state.samples.push({
            now,
            time: event.elapsed,
            mode: snapshot.mode,
            event,
            rows,
            vehicle: snapshot.vehicle,
            input: snapshot.input,
            intent,
            camera: snapshot.camera.mode,
            visibleRivals,
            errors: snapshot.errors,
          });
          state.lastSample = now;
        }
        if (
          (state.acceptedCut && event.elapsed >= state.acceptedCut.at + 2) ||
          event.result
        ) {
          state.enabled = false;
          state.done = true;
          pad.axes[0] = 0;
          pad.buttons = pad.buttons.map(() => button(0));
          game.pause();
          return;
        }
        pad.axes[0] = input.steer;
        for (const [index, value] of [
          [7, input.throttle],
          [6, input.brake],
          [0, Number(input.boost)],
          [1, Number(input.airbrake)],
        ])
          pad.buttons[index] = button(value);
        if (snapshot.errors.length) throw new Error(snapshot.errors.join('; '));
      } catch (error) {
        state.errors.push(error.stack ?? error.message);
        state.enabled = false;
        state.done = true;
        game.pause();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    state.start = (recordingStartedAt = null) => {
      state.recordingStartedAt = recordingStartedAt;
      state.startedAt = performance.now();
      state.enabled = true;
      game.resume();
    };
  }, driverOptions);
  const initial = await page.evaluate(() => window.__VN.getSnapshot());
  assert.equal(initial.vehicle.shipId, values.ship);
  assert.equal(initial.eliminator.elapsed, 0);
  assert.equal(initial.eliminator.remaining, 10);
  assert.equal(initial.competition.difficulty, values.difficulty);
  let recording = null;
  if (values.record)
    recording = await startTabRecording(page, {
      outputFile: join(output, 'eliminator.webm'),
      title,
    });
  await page.evaluate(
    (at) => window.__VN_ELIMINATOR_CAPTURE.start(at),
    recording?.startedAt ?? null,
  );
  const deadline = Date.now() + 60000;
  let done = false,
    lastCutCount = 0;
  while (!done && Date.now() < deadline) {
    await page.waitForTimeout(250);
    const progress = await page.evaluate(() => ({
      done: window.__VN_ELIMINATOR_CAPTURE.done,
      ...window.__VN.getSnapshot().eliminator,
    }));
    done = progress.done;
    if (progress.eliminated.length > lastCutCount) {
      console.log(
        JSON.stringify({
          time: progress.elapsed,
          cuts: progress.eliminated,
          remaining: progress.remaining,
        }),
      );
      if (!values.record)
        await page.screenshot({ path: join(output, 'native-cut.png') });
      lastCutCount = progress.eliminated.length;
    }
  }
  if (values.record) recording = await stopTabRecording(page);
  const capture = await page.evaluate(() => {
    const state = window.__VN_ELIMINATOR_CAPTURE;
    const cut = state.acceptedCut;
    const raw = (now) =>
      state.recordingStartedAt === null
        ? null
        : (now - state.recordingStartedAt) / 1000;
    const danger =
      cut &&
      state.samples.filter(
        (sample) =>
          sample.time >= cut.at - 4.5 &&
          sample.time < cut.at &&
          sample.event.atRiskId === 'player',
      );
    const pass =
      cut &&
      state.passes.find(
        (candidate) =>
          candidate.id === cut.id &&
          candidate.time > cut.at - 4.5 &&
          candidate.time <= cut.at,
      );
    return {
      ...state,
      start: undefined,
      final: window.__VN.getSnapshot(),
      lastPlaceEscape: !!(danger?.length && pass),
      passedCutRival: pass ?? null,
      excerpt: cut
        ? {
            inPoint: raw(cut.now) === null ? null : raw(cut.now) - 4.5,
            seconds: 6,
            cutRawSeconds: raw(cut.now),
            cutExcerptSeconds: 4.5,
            passExcerptSeconds: pass ? (pass.now - cut.now) / 1000 + 4.5 : null,
            eliminatedId: cut.id,
          }
        : null,
      markers: state.markers.map((marker) => ({
        ...marker,
        rawTime: raw(marker.now),
      })),
    };
  });
  await writeFile(
    join(output, 'capture.json'),
    JSON.stringify(
      {
        level: values.level,
        ship: values.ship,
        quality: values.quality,
        difficulty: values.difficulty,
        record: values.record,
        provenance,
        driverOptions,
        recording,
        faults,
        ...capture,
      },
      null,
      2,
    ),
  );
  assert.ok(done, 'The native cut encounter completed before timeout.');
  assert.deepEqual(faults, []);
  assert.deepEqual(capture.errors, []);
  assert.ok(
    capture.excerpt,
    'A real rival was removed by the unchanged countdown.',
  );
  assert.equal(capture.final.vehicle.resetCount, 0);
  assert.ok(
    !capture.final.eliminator.result,
    'The player remained in the live contest.',
  );
  const windowSamples = capture.samples.filter(
    (sample) =>
      sample.time >= capture.acceptedCut.at - 4.5 &&
      sample.time <= capture.acceptedCut.at + 1.5,
  );
  assert.ok(
    windowSamples.some((sample) => sample.visibleRivals >= 1),
    'The edited encounter contains visible racing traffic.',
  );
  if (values['require-escape'])
    assert.ok(
      capture.lastPlaceEscape,
      'The actual passed rival was cut after the player escaped last place.',
    );
  console.log(
    JSON.stringify(
      {
        output,
        excerpt: capture.excerpt,
        lastPlaceEscape: capture.lastPlaceEscape,
        maxVisibleRivals: capture.maxVisibleRivals,
        remaining: capture.final.eliminator.remaining,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
