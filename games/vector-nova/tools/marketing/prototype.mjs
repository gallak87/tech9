import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import {
  mkdir,
  writeFile,
  appendFile,
  access,
  readFile,
  copyFile,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { assembleTrailer } from './trailer.mjs';

// Explicit capture of a dedicated game tab using an isolated developer profile.
const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    "node tools/marketing/prototype.mjs [--output DIRECTORY] [--reuse-from DIRECTORY] [--shots FILE] [--capture-only] [--assemble-only]\nCaptures the configured gameplay takes, then assembles the selected edit.\n--assemble-only reuses the output directory's saved takes.\nVN_URL optionally selects an existing dev server; otherwise starts and closes its own.",
  );
  process.exit(0);
}
if (
  args.some(
    (a, i) =>
      ![
        '--output',
        '--reuse-from',
        '--shots',
        '--capture-only',
        '--assemble-only',
      ].includes(a) &&
      !['--output', '--reuse-from', '--shots'].includes(args[i - 1]),
  )
)
  throw new Error('Unknown argument. Use --help.');
const outputIndex = args.indexOf('--output');
if (outputIndex >= 0 && !args[outputIndex + 1])
  throw new Error('--output requires a directory.');
const output = resolve(
  root,
  outputIndex >= 0 ? args[outputIndex + 1] : '.experiments/marketing/trailer',
);
const captureOnly = args.includes('--capture-only');
const option = (key) => {
  const index = args.indexOf(key);
  if (index < 0) return null;
  if (!args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error(`${key} requires a value.`);
  return resolve(root, args[index + 1]);
};
const config = JSON.parse(
  await readFile(
    option('--shots') ?? join(root, 'marketing/edit-plan.json'),
    'utf8',
  ),
);
if (config.kind !== 'trailer') throw new Error('Expected a trailer edit plan.');
const movie = join(output, config.outputFile ?? 'vector-nova-trailer.mp4');
const reuseDirectory = option('--reuse-from');
const reuseManifest = reuseDirectory
  ? JSON.parse(await readFile(join(reuseDirectory, 'manifest.json'), 'utf8'))
  : null;
const assembleOnly = args.includes('--assemble-only');
try {
  await access(movie);
  if (!assembleOnly) throw new Error(`Refusing to overwrite ${movie}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function command(program, commandArgs, options = {}) {
  return new Promise((done, reject) => {
    const child = spawn(program, commandArgs, { cwd: root, ...options });
    let stdout = '',
      stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d;
    });
    child.stderr?.on('data', (d) => {
      stderr = (stderr + d).slice(-20000);
    });
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0
        ? done(stdout)
        : reject(new Error(`${program} exited ${code}\n${stderr}`)),
    );
  });
}
const shots = config.captureShots;
if (
  !Array.isArray(shots) ||
  !shots.length ||
  new Set(shots.map((s) => s.id)).size !== shots.length ||
  shots.some(
    (s) =>
      !/^[a-z][a-z0-9-]*$/.test(s.id) ||
      !(s.seconds > 0 && s.seconds <= 60) ||
      !(s.preroll >= 0) ||
      !s.state,
  )
)
  throw new Error('Invalid capture shot list.');
const manifest = assembleOnly
  ? JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'))
  : {
      createdAt: new Date().toISOString(),
      sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      sourceStatus: execFileSync('git', ['status', '--short', '--', '.'], {
        cwd: root,
        encoding: 'utf8',
      }).trim(),
      backend:
        'Chrome current-tab getDisplayMedia + direct Web Audio tap + MediaRecorder',
      target: {
        width: 1920,
        height: 1080,
        fps: config.fps,
        seconds: config.frames / config.fps,
      },
      renderingViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
      music: { ...config.music, provisional: true },
      editId: config.id,
      note: 'Browser prototype; real-time AI steering through the standard controller input. No native desktop capture. No shipping game changes.',
      shots: [],
    };
let browser, ownedServer;
let base = process.env.VN_URL;
try {
  if (!assembleOnly) {
    if (!base) {
      const port = await new Promise((done, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          const chosen = server.address().port;
          server.close(() => done(chosen));
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
      for (let i = 0; i < 100; i++) {
        try {
          ready = (await fetch(base)).ok;
        } catch {
          /* starting */
        }
        if (ready) break;
        if (ownedServer.exitCode !== null)
          throw new Error('Owned Vite server exited during startup.');
        await sleep(150);
      }
      if (!ready) throw new Error('Local game server did not become ready.');
    }
    browser = await chromium.launch({
      channel: process.env.VN_BROWSER_CHANNEL ?? 'chrome',
      headless: false,
      args: [
        '--mute-audio',
        '--window-size=1600,1000',
        '--window-position=0,0',
        '--auto-accept-this-tab-capture',
        '--auto-select-tab-capture-source-by-title=VN Marketing Capture',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      localStorage.setItem(
        'vector-nova.settings',
        JSON.stringify({
          quality: 'high',
          volume: 0.6,
          reducedMotion: false,
          difficulty: 'easy',
          steeringDeadZone: 0,
          controllerPreset: 'classic',
        }),
      );
      // Capture the game's actual master bus before physical-device muting. The
      // normal output stays connected; Chrome --mute-audio keeps the host quiet.
      const original = AudioNode.prototype.connect;
      const taps = new WeakMap();
      window.__VN_MARKETING_TAPS = [];
      AudioNode.prototype.connect = function (...connectArgs) {
        const result = original.apply(this, connectArgs);
        if (connectArgs[0] === this.context.destination) {
          let tap = taps.get(this.context);
          if (!tap) {
            tap = this.context.createMediaStreamDestination();
            taps.set(this.context, tap);
            window.__VN_MARKETING_TAPS.push({
              context: this.context,
              stream: tap.stream,
              bus: new Error().stack.includes('/src/pickups/audio.js')
                ? 'devices'
                : 'race',
            });
          }
          original.call(this, tap);
        }
        return result;
      };
    });
    const page = await context.newPage();
    page.on('pageerror', (error) =>
      console.error(`CAPTURE PAGE ERROR: ${error.message}`),
    );
    for (const shot of shots) {
      if (shot.importFrom) {
        const directory = resolve(root, shot.importFrom.directory);
        const savedManifest = JSON.parse(
          await readFile(join(directory, 'manifest.json'), 'utf8'),
        );
        const saved = savedManifest.shots.find(
          (s) => s.id === shot.importFrom.id,
        );
        if (!saved || saved.seconds !== shot.seconds)
          throw new Error(`Invalid imported source ${shot.id}`);
        await copyFile(
          join(directory, `${saved.id}.webm`),
          join(output, `${shot.id}.webm`),
        );
        manifest.shots.push({
          ...saved,
          id: shot.id,
          importedFrom: directory,
          sourceRevision: savedManifest.sourceRevision,
        });
        await writeFile(
          join(output, 'manifest.json'),
          JSON.stringify(manifest, null, 2),
        );
        console.log(`IMPORT ${shot.id}`);
        continue;
      }
      const prior = reuseManifest?.shots.find(
        (saved) =>
          saved.id === shot.id &&
          saved.mode === shot.mode &&
          saved.level === shot.level &&
          saved.exotic === shot.exotic &&
          saved.engineGain === shot.engineGain &&
          saved.upgrades === shot.upgrades &&
          saved.requireValidLap === shot.requireValidLap &&
          JSON.stringify(saved.driver) === JSON.stringify(shot.driver) &&
          JSON.stringify(saved.equipment) === JSON.stringify(shot.equipment) &&
          saved.seconds === shot.seconds &&
          saved.preroll === shot.preroll &&
          Boolean(saved.aiSpeed) === Boolean(shot.aiSpeed) &&
          Object.keys(shot.state).every(
            (key) => saved.state[key] === shot.state[key],
          ),
      );
      if (prior) {
        if (reuseDirectory !== output)
          await copyFile(
            join(reuseDirectory, `${shot.id}.webm`),
            join(output, `${shot.id}.webm`),
          );
        manifest.shots.push({ ...prior, reusedFrom: reuseDirectory });
        await writeFile(
          join(output, 'manifest.json'),
          JSON.stringify(manifest, null, 2),
        );
        console.log(`REUSE ${shot.id}`);
        continue;
      }
      console.log(`BOOT ${shot.id}`);
      const raw = join(output, `${shot.id}.webm`);
      await writeFile(raw, Buffer.alloc(0));
      // Each page navigation replaces the old recorder binding cleanly.
      await page.exposeFunction(`writeCapture_${shot.id}`, (chunk) =>
        appendFile(raw, Buffer.from(chunk, 'base64')),
      );
      await page.exposeFunction(`cameraCapture_${shot.id}`, () =>
        page.keyboard.press('c'),
      );
      await page.goto(
        new URL(
          `/?dev=2&ship=kestrel&exotic=${shot.exotic ?? 'shrike'}&equipment=${shot.equipment?.join(',') ?? 'jump,injector'}&upgrades=${shot.upgrades ?? 0}&level=${shot.level ?? shot.id}&music=0`,
          base,
        ).href,
      );
      await page.locator('[data-action="launch"]').click();
      await page.waitForFunction(
        () => window.__VN?.ready && !window.__VN.getSnapshot().ship.loading,
        null,
        { timeout: 180000 },
      );
      await page.addStyleTag({
        content:
          '.sound-panel,.dev-tools{display:none!important}body{cursor:none!important}',
      });
      await page.evaluate(
        async ({
          state,
          binding,
          cameraBinding,
          aiSpeed,
          race,
          engineGain,
          driver,
        }) => {
          document.title = 'VN Marketing Capture';
          const game = window.__VN;
          const track = game.getTrack();
          if (race) {
            const { RACE_OPPONENTS } = await import('/src/race/roster.js');
            game.startCup({
              difficulty: 'hard',
              eventIndex: 2,
              eventCount: 3,
              gridOrder: [...RACE_OPPONENTS.map((r) => r.id), 'player'],
            });
            if (driver.raceSetup) game.devSetup(driver.raceSetup);
          } else {
            track.scenarios.__marketing_clip = {
              ...state,
              lateral: state.lateral ?? 0,
              heading: state.heading ?? 0,
            };
            game.loadScenario('__marketing_clip', 7);
          }
          game.pause();
          const { getRacerControl } = await import('/src/race/racers.js');
          const pad = {
            id: 'VN Marketing Driver',
            index: 0,
            connected: true,
            mapping: 'standard',
            axes: [0, 0, 0, 0],
            buttons: Array.from({ length: 17 }, () => ({
              pressed: false,
              touched: false,
              value: 0,
            })),
          };
          Object.defineProperty(navigator, 'getGamepads', {
            configurable: true,
            value: () => [pad],
          });
          const drive = {
            enabled: false,
            samples: [],
            intervals: [],
            lastFrame: 0,
            lastSample: 0,
            weaponEvents: [],
            maxVisibleRivals: 0,
            racingStartedAt: null,
            fireAt: null,
            currentVisibleRivals: 0,
            cameraRequested: false,
            cameraActions: [],
            hitTargets: [],
            controlErrors: [],
          };
          const seenEvents = new Set();
          const frontend = window.__VN_FRONTEND?.getState();
          drive.profile = frontend
            ? {
                shipId: frontend.shipId,
                claims: frontend.career.state.claims.length,
                exoticShip: frontend.career.state.exoticShip,
                loadout: frontend.career.state.loadouts[frontend.shipId],
              }
            : null;
          const motionOf = (s) =>
            s.runtime.state.flight?.mode ?? s.runtime.state.mode;
          window.__VN_MARKETING_DRIVER = drive;
          const compact = () => {
            const s = game.getSnapshot();
            return {
              tick: s.tick,
              mode: s.mode,
              lap: s.lap,
              vehicle: {
                shipId: s.vehicle.shipId,
                enhancements: s.vehicle.enhancements,
                distance: s.vehicle.distance,
                lateral: s.vehicle.lateral,
                heading: s.vehicle.heading,
                speed: s.vehicle.speed,
                resetCount: s.vehicle.resetCount,
              },
              motion: motionOf(s),
              camera: s.camera,
              hazardContact: {
                id: s.runtime.state.contactId ?? null,
                seconds: s.runtime.state.contactSeconds ?? 0,
              },
              leviathan: s.environment.leviathan,
              zephyr: s.runtime.state.zephyr,
              competition: s.competition,
              equipment: s.vehicle.equipment,
              devices: s.environment.devices,
              visibleRivals: drive.currentVisibleRivals,
              events: s.events.slice(-6),
              errors: s.errors,
            };
          };
          window.__VN_MARKETING_SNAPSHOT = compact;
          const frame = (now) => {
            if (drive.enabled) {
              const s = game.getSnapshot();
              if (s.mode === 'racing' && drive.racingStartedAt === null)
                drive.racingStartedAt = now;
              const elapsed =
                drive.racingStartedAt === null
                  ? -1
                  : (now - drive.racingStartedAt) / 1000;
              const rivals =
                s.competition?.standings?.filter((r) => r.id !== 'player') ??
                [];
              const aimTarget =
                race && driver.fire !== false && drive.fireAt === null
                  ? rivals
                      .filter(
                        (r) =>
                          r.distance - s.vehicle.distance > 8 &&
                          r.distance - s.vehicle.distance < 100,
                      )
                      .sort((a, b) => a.distance - b.distance)[0]
                  : null;
              const laneEntry = driver.laneSchedule
                ?.filter((entry) => s.vehicle.distance >= entry.distance)
                .at(-1);
              const lane = laneEntry?.lane ?? driver.lane ?? (race ? -4 : 0);
              const c = getRacerControl(s.vehicle, track, {
                difficulty: 'hard',
                lane: aimTarget ? aimTarget.lateral : lane,
                pace: driver.pace ?? 1,
                nearby: race && !aimTarget ? rivals : [],
                runtime: {
                  pose: () => ({
                    grounded: motionOf(s) === 'magnetic',
                  }),
                },
              });
              pad.axes[0] = c.steer;
              for (const [button, value] of [
                [7, aiSpeed ? c.throttle : 1],
                [6, aiSpeed ? c.brake : 0],
                [
                  0,
                  driver.boost === false
                    ? 0
                    : Array.isArray(driver.boost)
                      ? Number(
                          driver.boost.some(
                            ([from, to]) => elapsed >= from && elapsed < to,
                          ),
                        )
                      : race
                        ? Number(elapsed >= 8 && elapsed < 11)
                        : aiSpeed
                          ? Number(c.boost)
                          : 0,
                ],
                [1, Number(c.airbrake)],
              ]) {
                pad.buttons[button] = {
                  value,
                  pressed: value > 0.5,
                  touched: value > 0,
                };
              }
              if (race) {
                const aligned = rivals.some((r) => {
                  const gap = r.distance - s.vehicle.distance;
                  return (
                    gap > 8 &&
                    gap < 80 &&
                    Math.abs(
                      r.lateral -
                        s.vehicle.lateral -
                        Math.tan(s.vehicle.heading) * gap,
                    ) < 2.5
                  );
                });
                if (
                  drive.fireAt === null &&
                  driver.fire !== false &&
                  elapsed > (driver.fireAfter ?? 2.2) &&
                  (aligned || elapsed > 6)
                )
                  drive.fireAt = now;
                const fire = drive.fireAt !== null && now - drive.fireAt < 180;
                pad.buttons[2] = {
                  value: Number(fire),
                  pressed: fire,
                  touched: fire,
                };
                for (const event of s.events) {
                  if (
                    ![
                      'equipment-activate',
                      'combat-fire',
                      'combat-hit',
                      'combat-contact',
                      'combat-confirm',
                    ].includes(event.type)
                  )
                    continue;
                  const key = JSON.stringify(event);
                  if (!seenEvents.has(key)) {
                    seenEvents.add(key);
                    drive.weaponEvents.push(event);
                    if (
                      event.type === 'combat-confirm' &&
                      event.payload.source === 'player' &&
                      (driver.cameraWeapon === 'lance'
                        ? event.payload.equipment === 'lance'
                        : event.payload.kind === 'arc' &&
                          event.payload.equipment !== 'lance') &&
                      !event.payload.shielded
                    ) {
                      const target = rivals.find(
                        (r) => r.id === event.payload.target,
                      );
                      if (target && target.distance > s.vehicle.distance)
                        drive.hitTargets.push({
                          id: target.id,
                          event,
                          confirmedAt: now,
                        });
                    }
                  }
                }
                if (now - drive.lastSample >= 100) {
                  const { camera } = game.getScene();
                  let visible = 0;
                  for (const rival of rivals) {
                    const gap = rival.distance - s.vehicle.distance;
                    if (gap < 0 || gap > 300) continue;
                    const p = track.sample(rival.distance);
                    const v = camera.position
                      .clone()
                      .copy(p.position)
                      .addScaledVector(p.right, rival.lateral)
                      .addScaledVector(p.up, 0.72)
                      .project(camera);
                    if (
                      Math.abs(v.x) < 0.95 &&
                      Math.abs(v.y) < 0.95 &&
                      v.z > -1 &&
                      v.z < 1
                    )
                      visible++;
                  }
                  drive.maxVisibleRivals = Math.max(
                    drive.maxVisibleRivals,
                    visible,
                  );
                  drive.currentVisibleRivals = visible;
                }
              }
              const playerPosition = s.competition?.standings?.find(
                (r) => r.id === 'player',
              )?.position;
              const passedTarget = drive.hitTargets.find((hit) => {
                const target = rivals.find((r) => r.id === hit.id);
                return (
                  target &&
                  target.distance < s.vehicle.distance - 1 &&
                  playerPosition < target.position
                );
              });
              const cameraDue =
                (driver.cameraAfterPass && passedTarget) ||
                (Number.isFinite(driver.cameraAt) &&
                  elapsed >= driver.cameraAt);
              if (cameraDue && !drive.cameraRequested) {
                drive.cameraRequested = true;
                const requestedAt = now;
                window[cameraBinding]()
                  .then(() =>
                    drive.cameraActions.push({
                      key: 'C',
                      requestedAt,
                      completedAt: performance.now(),
                      passedTarget: passedTarget?.id ?? null,
                      mode: game.getSnapshot().camera.mode,
                    }),
                  )
                  .catch((error) => drive.controlErrors.push(String(error)));
              }
              if (drive.lastFrame) drive.intervals.push(now - drive.lastFrame);
              drive.lastFrame = now;
              if (now - drive.lastSample >= 100) {
                drive.samples.push({ now, ...compact() });
                drive.lastSample = now;
              }
            }
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
          const button = document.createElement('button');
          button.id = 'marketing-record';
          button.textContent = 'Start prototype take';
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
              const settings = video.getSettings();
              if (settings.displaySurface !== 'browser') {
                stream.getTracks().forEach((t) => t.stop());
                throw new Error('Refusing non-tab capture.');
              }
              if (Math.abs(settings.width / settings.height - 16 / 9) > 0.02) {
                stream.getTracks().forEach((t) => t.stop());
                throw new Error(
                  `Capture aspect ratio is ${settings.width}x${settings.height}; resize the browser before recording.`,
                );
              }
              const taps = [...window.__VN_MARKETING_TAPS];
              if (!taps.length) {
                stream.getTracks().forEach((t) => t.stop());
                throw new Error('Game audio master taps are not ready.');
              }
              const mixContext = new AudioContext({ sampleRate: 48000 });
              const mixOutput = mixContext.createMediaStreamDestination();
              for (const tap of taps) {
                await tap.context.resume();
                const gain = mixContext.createGain();
                gain.gain.value = tap.bus === 'race' ? engineGain : 1;
                mixContext
                  .createMediaStreamSource(tap.stream)
                  .connect(gain)
                  .connect(mixOutput);
              }
              await mixContext.resume();
              const audio = mixOutput.stream.getAudioTracks()[0];
              const mix = new MediaStream([video, audio]);
              const recorder = new MediaRecorder(mix, {
                mimeType: 'video/webm;codecs=vp9,opus',
                videoBitsPerSecond: 24000000,
                audioBitsPerSecond: 192000,
              });
              const capture = {
                settings,
                video,
                audioBuses: taps.length,
                busMix: taps.map((t) => ({
                  bus: t.bus,
                  gain: t.bus === 'race' ? engineGain : 1,
                })),
                mimeType: recorder.mimeType,
                pending: Promise.resolve(),
                done: false,
              };
              window.__VN_MARKETING_RECORDING = capture;
              recorder.ondataavailable = (event) => {
                if (!event.data.size) return;
                capture.pending = capture.pending.then(async () => {
                  // A video MIME type can itself contain a comma (vp9,opus).
                  const encoded = await new Promise((done, reject) => {
                    const reader = new FileReader();
                    reader.onerror = () => reject(reader.error);
                    reader.onload = () =>
                      done(
                        reader.result.slice(
                          reader.result.indexOf(';base64,') + 8,
                        ),
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
                mix.getTracks().forEach((t) => t.stop());
                await mixContext.close();
                capture.done = true;
              };
              capture.stop = () => recorder.stop();
              button.remove();
              recorder.start(500);
              capture.startedAt = performance.now();
              capture.active = true;
            } catch (error) {
              window.__VN_MARKETING_ERROR = String(error);
            }
          };
        },
        {
          state: shot.state,
          binding: `writeCapture_${shot.id}`,
          cameraBinding: `cameraCapture_${shot.id}`,
          aiSpeed: shot.aiSpeed,
          race: shot.mode === 'race',
          engineGain: shot.engineGain ?? 1,
          driver: shot.driver ?? {},
        },
      );
      await page.bringToFront();
      await page.click('#marketing-record');
      await page.waitForFunction(
        () =>
          window.__VN_MARKETING_RECORDING?.active ||
          window.__VN_MARKETING_ERROR,
        null,
        { timeout: 20000 },
      );
      const captureError = await page.evaluate(
        () => window.__VN_MARKETING_ERROR,
      );
      if (captureError) throw new Error(captureError);
      // Chrome's sharing infobar consumes window height after capture begins.
      // Grow only our own window to preserve the entire emulated game viewport.
      const cdp = await context.newCDPSession(page);
      await page.waitForTimeout(300);
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await page.evaluate(() => ({
          settings: window.__VN_MARKETING_RECORDING.video.getSettings(),
          width: innerWidth,
        }));
        const missing =
          (current.settings.width * 9) / 16 - current.settings.height;
        if (Math.abs(missing) <= 2) break;
        const { windowId, bounds } = await cdp.send(
          'Browser.getWindowForTarget',
        );
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
      const framing = await page.evaluate(() => {
        const r = window.__VN_MARKETING_RECORDING;
        r.settings = r.video.getSettings();
        return r.settings;
      });
      if (Math.abs(framing.width / framing.height - 16 / 9) > 0.005)
        throw new Error(
          `Tab capture clipped the game viewport: ${framing.width}x${framing.height}`,
        );
      if (shot.driver?.camera === 'vista') {
        await page.keyboard.press('c');
        const cameraMode = await page.evaluate(
          () => window.__VN.getSnapshot().camera.mode,
        );
        if (cameraMode !== 'vista')
          throw new Error(`${shot.id}: C did not activate vista camera.`);
      }
      await page.evaluate(async () => {
        window.__VN.resume();
        await new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        );
        window.__VN_MARKETING_DRIVER.enabled = true;
      });
      await page.waitForTimeout(shot.preroll * 1000);
      const start = await page.evaluate(() => ({
        offset:
          (performance.now() - window.__VN_MARKETING_RECORDING.startedAt) /
          1000,
        state: window.__VN_MARKETING_SNAPSHOT(),
      }));
      console.log(`CAPTURE ${shot.id} ${shot.seconds}s`);
      await page.waitForTimeout(shot.seconds * 1000);
      const take = await page.evaluate(() => {
        const drive = window.__VN_MARKETING_DRIVER;
        const r = window.__VN_MARKETING_RECORDING;
        const result = {
          capture: {
            settings: r.settings,
            audioBuses: r.audioBuses,
            busMix: r.busMix,
            mimeType: r.mimeType,
          },
          end: window.__VN_MARKETING_SNAPSHOT(),
          samples: drive.samples,
          frameIntervals: drive.intervals,
          metrics: window.__VN.getMetrics(),
          profile: drive.profile,
          weaponEvents: drive.weaponEvents,
          maxVisibleRivals: drive.maxVisibleRivals,
          cameraActions: drive.cameraActions,
          hitTargets: drive.hitTargets,
          controlErrors: drive.controlErrors,
          greenAtRawSeconds: (drive.racingStartedAt - r.startedAt) / 1000,
        };
        r.stop();
        drive.enabled = false;
        window.__VN.pause();
        return result;
      });
      await page.waitForFunction(
        () => window.__VN_MARKETING_RECORDING.done,
        null,
        { timeout: 30000 },
      );
      const recorderError = await page.evaluate(
        () => window.__VN_MARKETING_RECORDING.error,
      );
      if (recorderError)
        throw new Error(`${shot.id} recorder: ${recorderError}`);
      await writeFile(
        join(output, `${shot.id}-take.json`),
        JSON.stringify(
          {
            ...shot,
            inPoint: start.offset,
            greenAtSeconds: take.greenAtRawSeconds - start.offset,
            start: start.state,
            ...take,
          },
          null,
          2,
        ),
      );
      if (take.end.errors.length)
        throw new Error(`${shot.id}: ${take.end.errors.join('; ')}`);
      if (take.controlErrors.length)
        throw new Error(`${shot.id}: ${take.controlErrors.join('; ')}`);
      if (shot.requireValidLap && take.end.lap?.valid !== true)
        throw new Error(`${shot.id}: staged take does not have a valid lap.`);
      if (
        shot.upgrades === 3 &&
        (take.profile?.shipId !== 'kestrel' ||
          take.profile?.claims !== 28 ||
          take.profile?.exoticShip !== 'kestrel' ||
          JSON.stringify(take.end.equipment) !==
            JSON.stringify(shot.equipment) ||
          Object.values(take.end.vehicle.enhancements ?? {}).some(
            (rank) => rank !== 3,
          ))
      )
        throw new Error(
          `${shot.id}: finale profile/loadout does not match Garage.`,
        );
      if (
        shot.driver?.cameraAfterPass &&
        !take.cameraActions.some(
          (action) => action.passedTarget && action.mode === 'vista',
        )
      )
        throw new Error(
          `${shot.id}: no verified hit/pass-triggered C camera change.`,
        );
      // Equipment activation is emitted only after combat.fireLance succeeds.
      // Its synchronous combat-fire can be consumed before the next RAF sample.
      if (
        shot.mode === 'race' &&
        (!take.end.competition?.enabled ||
          take.end.competition.standings.length !== 10 ||
          take.maxVisibleRivals < (shot.minVisibleRivals ?? 3) ||
          (shot.driver?.fire !== false &&
            !take.weaponEvents.some(
              (e) =>
                e.type === 'equipment-activate' && e.payload?.kind === 'lance',
            )))
      )
        throw new Error(
          `${shot.id}: missing visible rival field or verified Lance shot: ${JSON.stringify({ visible: take.maxVisibleRivals, events: take.weaponEvents })}`,
        );
      if (
        take.end.vehicle.resetCount !== start.state.vehicle.resetCount ||
        take.samples.some((s) => s.motion === 'recovery')
      )
        throw new Error(
          `${shot.id}: recovery during the take; choose a cleaner approach.`,
        );
      if (
        take.end.mode !== 'racing' ||
        take.end.vehicle.distance - start.state.vehicle.distance < 50
      )
        throw new Error(`${shot.id}: stalled or suspended take.`);
      take.raw = JSON.parse(
        await command('ffprobe', [
          '-v',
          'error',
          '-count_packets',
          '-show_entries',
          'stream=codec_type,width,height,nb_read_packets,sample_rate,channels',
          '-show_entries',
          'format=duration,size',
          '-of',
          'json',
          raw,
        ]),
      );
      const frameTimes = (
        await command('ffprobe', [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'packet=pts_time',
          '-of',
          'csv=p=0',
          raw,
        ])
      )
        .trim()
        .split('\n')
        .map(Number)
        .filter(Number.isFinite);
      take.raw.videoDuration = frameTimes.at(-1) - frameTimes[0] + 1 / 60;
      if (take.raw.videoDuration < shot.seconds + start.offset - 0.3)
        throw new Error(`${shot.id}: raw recording is too short.`);
      manifest.shots.push({
        ...shot,
        inPoint: start.offset,
        greenAtSeconds: take.greenAtRawSeconds - start.offset,
        start: start.state,
        ...take,
      });
      await writeFile(
        join(output, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );
      console.log(
        `SAVED ${shot.id}: ${take.capture.settings.width}x${take.capture.settings.height}, ${take.end.tick - start.state.tick} physics ticks`,
      );
    }
    await context.close();
    await browser.close();
    browser = null;
  }
  if (!captureOnly) {
    manifest.result = await assembleTrailer({
      root,
      output,
      manifest,
      config,
      command,
    });
    await writeFile(
      join(output, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
    console.log(JSON.stringify({ movie, result: manifest.result }, null, 2));
  }
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
