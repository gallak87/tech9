import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { seedInterceptorCareer } from '../interceptor-career-seed.mjs';
import {
  installNativeAudioTap,
  startTabRecording,
  stopTabRecording,
} from './tab-recorder.mjs';

// The live production session supplies every motion, attack, contact and damage
// result. This runner supplies only ordinary standard-gamepad inputs at real
// speed; neither a fixed-step accelerator nor a combat-state seed is used.
const { values } = parseArgs({
  options: {
    record: { type: 'boolean', default: false },
    output: {
      type: 'string',
      default: '.experiments/marketing/rc4/interceptor-scout',
    },
    url: { type: 'string', default: process.env.VN_URL },
    quality: { type: 'string', default: 'high' },
    difficulty: { type: 'string', default: 'medium' },
    ship: { type: 'string', default: 'kestrel' },
    seconds: { type: 'string', default: '100' },
    help: { type: 'boolean', default: false },
  },
});
if (values.help) {
  console.log(
    'VN_URL=<server> node tools/marketing/interceptor-capture.mjs [--record] [--output DIRECTORY] [--quality high|low] [--difficulty easy|medium|hard] [--ship kestrel]\nDefault: muted headless real-time rehearsal. --record captures a dedicated visible game tab and native effects, with music disabled. The saved markers identify a real dodge/core-hit encounter.',
  );
  process.exit(0);
}
assert.ok(values.url, 'Supply VN_URL or --url for an existing dev server.');
assert.ok(['high', 'low'].includes(values.quality));
assert.ok(['easy', 'medium', 'hard'].includes(values.difficulty));
assert.ok(['shrike', 'bastion', 'needle', 'kestrel'].includes(values.ship));
const timeout = Number(values.seconds);
assert.ok(Number.isFinite(timeout) && timeout >= 15 && timeout <= 240);
const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, values.output);
const provenance = {
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  checkout: root,
  serverUrl: values.url,
  // A separate VN_URL may serve another checkout. Retain that distinction;
  // capture operators verify its runtime revision before accepting the take.
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
  staging:
    'Isolated Horizon Cup prerequisite and selected ship claim only; no motion, attack, health or contact seeds.',
};
for (const name of ['interceptor.webm', 'capture.json']) {
  try {
    await access(join(output, name));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(`Refusing to overwrite ${join(output, name)}.`);
}
await mkdir(output, { recursive: true });
const title = 'VN RC4 Interceptor Capture';
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
    ({ quality, difficulty }) => {
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
    { quality: values.quality, difficulty: values.difficulty },
  );
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', (error) => faults.push(error.stack ?? error.message));
  await seedInterceptorCareer(page, 'interceptor');
  await page.goto(
    new URL('/?intro=0&level=interceptor&music=0', values.url).href,
  );
  await page.waitForFunction(
    () => window.__VN_FRONTEND?.getState().screen === 'home',
  );
  await page.evaluate(async (ship) => {
    const { createCareerSlots } = await import('/src/progression/careers.js');
    const { PROFILE_KEY } = await import('/src/progression/profile.js');
    const { saveShipSelection } = await import('/src/ships/catalog.js');
    const careers = createCareerSlots();
    const storage = careers.storageFor(1);
    const profile = JSON.parse(storage.getItem(PROFILE_KEY));
    if (ship !== 'shrike' && !profile.claims.includes(`ship-${ship}`))
      profile.claims.push(`ship-${ship}`);
    storage.setItem(PROFILE_KEY, JSON.stringify(profile));
    saveShipSelection(ship, storage);
  }, values.ship);
  await page.reload();
  await page.locator('[data-action="interceptor"]').click();
  await page.locator('[data-level="interceptor"]').click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(
    () => window.__VN?.ready && !window.__VN.getSnapshot().ship.loading,
    null,
    { timeout: 180000 },
  );
  await page.evaluate(async () => {
    const game = window.__VN;
    game.pause();
    const track = game.getTrack();
    const { getRacerControl } = await import('/src/race/racers.js');
    const button = (value) => ({
      value,
      pressed: value > 0.5,
      touched: value > 0,
    });
    const pad = {
      id: 'VN RC4 Goliath Driver',
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
    const capture = {
      enabled: false,
      done: false,
      startedAt: null,
      recordingStartedAt: null,
      firstRacingAt: null,
      samples: [],
      markers: [],
      events: [],
      intervals: [],
      errors: [],
      successfulAttack: null,
      endAt: null,
      lastSample: -Infinity,
      lastFrame: null,
      lastPhase: null,
      lastHealth: null,
    };
    window.__VN_INTERCEPTOR_CAPTURE = capture;
    const seen = new Set();
    const mark = (id, now, snapshot, extra = {}) => {
      capture.markers.push({
        id,
        now,
        time: snapshot.interceptor.elapsed,
        attackIndex: snapshot.interceptor.counterattack.attackIndex,
        health: snapshot.interceptor.health,
        lateral: snapshot.vehicle.lateral,
        gap: snapshot.interceptor.gap,
        ...extra,
      });
    };
    const frame = (now) => {
      if (!capture.enabled) {
        requestAnimationFrame(frame);
        return;
      }
      try {
        const snapshot = game.getSnapshot();
        const mission = snapshot.interceptor;
        const attack = mission.counterattack;
        if (capture.lastFrame !== null)
          capture.intervals.push(now - capture.lastFrame);
        capture.lastFrame = now;
        if (snapshot.mode === 'racing' && capture.firstRacingAt === null) {
          capture.firstRacingAt = now;
          mark('racing', now, snapshot);
        }
        if (attack.phase !== capture.lastPhase) {
          mark(attack.phase, now, snapshot, {
            aimLanes: attack.aimLanes,
            exposed: attack.exposed,
            pressureHits: attack.pressureHits,
          });
          capture.lastPhase = attack.phase;
        }
        for (const event of snapshot.events) {
          if (
            !/interceptor|combat-fire|combat-hit|equipment-activate/.test(
              event.type,
            )
          )
            continue;
          const key = `${event.tick}:${event.type}:${JSON.stringify(event.payload)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          capture.events.push({ now, ...event });
          if (
            event.type === 'interceptor-hit' &&
            event.payload.source === 'player' &&
            event.payload.equipment === 'lance' &&
            event.payload.weakPoint
          ) {
            mark('player-core-hit', now, snapshot, {
              hit: event.payload,
              started: attack.started,
            });
            if (capture.successfulAttack === null) {
              capture.successfulAttack = attack.attackIndex;
              capture.endAt = attack.started + 10;
            }
          }
        }
        if (capture.lastHealth !== mission.health) {
          if (capture.lastHealth !== null)
            mark('health-drop', now, snapshot, {
              previousHealth: capture.lastHealth,
              lastHit: mission.lastHit,
            });
          capture.lastHealth = mission.health;
        }
        if (now - capture.lastSample >= 50) {
          const boss = snapshot.competition.standings.find(
            (racer) => racer.id === mission.targetId,
          );
          capture.samples.push({
            now,
            time: mission.elapsed,
            mode: snapshot.mode,
            health: mission.health,
            playerDamage: mission.playerDamage,
            alliedDamage: mission.alliedDamage,
            boss,
            gap: mission.gap,
            phase: attack.phase,
            attackIndex: attack.attackIndex,
            phaseElapsed: attack.phaseElapsed,
            aimLanes: attack.aimLanes,
            shots: attack.shots,
            exposed: attack.exposed,
            pressureHits: attack.pressureHits,
            player: {
              distance: snapshot.vehicle.distance,
              lateral: snapshot.vehicle.lateral,
              heading: snapshot.vehicle.heading,
              speed: snapshot.vehicle.speed,
              reserve: snapshot.vehicle.energy,
              resetting: snapshot.vehicle.resetCount,
            },
            input: snapshot.input,
            camera: snapshot.camera.mode,
            errors: snapshot.errors,
          });
          capture.lastSample = now;
        }
        if (
          (capture.endAt !== null && mission.elapsed >= capture.endAt) ||
          mission.result
        ) {
          capture.done = true;
          capture.enabled = false;
          pad.axes[0] = 0;
          pad.buttons = pad.buttons.map(() => button(0));
          game.pause();
          return;
        }
        // Goliath freezes its aimed lanes before firing. Move to the farthest
        // ordinary supported lane, then recenter after its final real shot so
        // the upcoming rear-core window can receive an actual Lance contact.
        const edge = Math.min(13, track.width / 2 - 4);
        const aimLanes = attack.aimLanes?.length ? attack.aimLanes : [0];
        const safety = (lane) =>
          Math.min(...aimLanes.map((aim) => Math.abs(aim - lane)));
        const lane =
          attack.locked && attack.warning && attack.shots < attack.blasts
            ? [-edge, 0, edge].sort((a, b) => safety(b) - safety(a))[0]
            : mission.targetLateral;
        const control = getRacerControl(snapshot.vehicle, track, {
          difficulty: 'hard',
          pace: 1,
          lane,
          devices: [],
          nearby: [],
        });
        control.boost = mission.gap > 36 && snapshot.vehicle.energy > 10;
        const alignment =
          mission.targetLateral -
          snapshot.vehicle.lateral -
          Math.tan(snapshot.vehicle.heading) * mission.gap;
        control.equipment1 =
          attack.exposed &&
          attack.phaseElapsed > 0.4 &&
          Math.abs(alignment) < 1.1;
        control.equipment2 = snapshot.vehicle.energy < 45;
        pad.axes[0] = control.steer;
        for (const [index, value] of [
          [7, control.throttle],
          [6, control.brake],
          [0, Number(control.boost)],
          [1, Number(control.airbrake)],
          [2, Number(control.equipment1)],
          [3, Number(control.equipment2)],
        ])
          pad.buttons[index] = button(value);
        if (snapshot.errors.length) throw new Error(snapshot.errors.join('; '));
      } catch (error) {
        capture.errors.push(error.stack ?? error.message);
        capture.done = true;
        capture.enabled = false;
        game.pause();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    capture.start = (recordingStartedAt = null) => {
      capture.startedAt = performance.now();
      capture.recordingStartedAt = recordingStartedAt;
      capture.enabled = true;
      game.resume();
    };
  });
  const initial = await page.evaluate(() => window.__VN.getSnapshot());
  assert.equal(initial.vehicle.shipId, values.ship);
  assert.equal(initial.interceptor.bossId, 'goliath');
  assert.equal(initial.interceptor.difficulty, values.difficulty);
  assert.equal(initial.interceptor.playerDamage, 0);
  assert.equal(initial.interceptor.elapsed, 0);
  let recording = null;
  if (values.record)
    recording = await startTabRecording(page, {
      outputFile: join(output, 'interceptor.webm'),
      title,
    });
  await page.evaluate(
    (startedAt) => window.__VN_INTERCEPTOR_CAPTURE.start(startedAt),
    recording?.startedAt ?? null,
  );
  const deadline = Date.now() + timeout * 1000;
  let done = false;
  const screenshots = new Set();
  while (!done && Date.now() < deadline) {
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => {
      const capture = window.__VN_INTERCEPTOR_CAPTURE;
      const mission = window.__VN.getSnapshot().interceptor;
      return {
        done: capture.done,
        phase: mission.counterattack.phase,
        index: mission.counterattack.attackIndex,
        time: mission.elapsed,
        health: mission.health,
        hit: mission.lastHit,
        error: capture.errors.at(-1),
      };
    });
    done = state.done;
    if (
      !values.record &&
      state.phase !== 'idle' &&
      !screenshots.has(state.phase)
    ) {
      screenshots.add(state.phase);
      await page.screenshot({ path: join(output, `${state.phase}.png`) });
      console.log(JSON.stringify(state));
    }
  }
  if (values.record) recording = await stopTabRecording(page);
  const capture = await page.evaluate(() => {
    const capture = window.__VN_INTERCEPTOR_CAPTURE;
    const snapshot = window.__VN.getSnapshot();
    const firstHit = capture.markers.find(
      (marker) => marker.id === 'player-core-hit',
    );
    const attack = firstHit
      ? capture.markers.find(
          (marker) =>
            marker.id === 'telegraph' &&
            marker.attackIndex === firstHit.attackIndex,
        )
      : null;
    const raw = (now) =>
      capture.recordingStartedAt === null
        ? null
        : (now - capture.recordingStartedAt) / 1000;
    return {
      ...capture,
      start: undefined,
      final: snapshot,
      excerpt: attack
        ? {
            attackIndex: attack.attackIndex,
            startAtWallTime: attack.now - 1300,
            inPoint: raw(attack.now - 1300),
            seconds: 10,
            telegraph: raw(attack.now),
            coreHit: raw(firstHit.now),
            coreHitExcerptSeconds: (firstHit.now - attack.now + 1300) / 1000,
          }
        : null,
      markers: capture.markers.map((marker) => ({
        ...marker,
        rawTime: raw(marker.now),
      })),
    };
  });
  await writeFile(
    join(output, 'capture.json'),
    JSON.stringify(
      {
        level: 'interceptor',
        ship: values.ship,
        quality: values.quality,
        difficulty: values.difficulty,
        record: values.record,
        provenance,
        recording,
        faults,
        ...capture,
      },
      null,
      2,
    ),
  );
  assert.ok(
    done,
    'A complete native attack/core-hit encounter finished before timeout.',
  );
  assert.deepEqual(faults, []);
  assert.deepEqual(capture.errors, []);
  assert.ok(
    capture.excerpt,
    'A real player Lance contact hit the exposed core.',
  );
  const phases = capture.markers
    .filter((marker) => marker.attackIndex === capture.excerpt.attackIndex)
    .map((marker) => marker.id);
  for (const phase of [
    'telegraph',
    'turning-back',
    'firing',
    'turning-forward',
    'breach',
    'player-core-hit',
  ])
    assert.ok(phases.includes(phase), `Recorded native phase: ${phase}`);
  const encounter = capture.samples.filter(
    (sample) => sample.attackIndex === capture.excerpt.attackIndex,
  );
  assert.ok(
    encounter.every((sample) => sample.pressureHits === 0),
    'The accepted encounter avoids both native pressure shots.',
  );
  assert.ok(
    encounter.every((sample) => sample.player.resetting === 0),
    'The accepted encounter contains no recovery reset.',
  );
  assert.ok(
    capture.final.interceptor.playerDamage >= 54,
    'Native critical damage was applied.',
  );
  console.log(
    JSON.stringify(
      {
        output,
        excerpt: capture.excerpt,
        damage: capture.final.interceptor.playerDamage,
        coreHits: capture.markers.filter(
          (marker) => marker.id === 'player-core-hit',
        ).length,
        intervals: capture.intervals.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
