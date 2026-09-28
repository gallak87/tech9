import { chromium } from 'playwright';
import { mkdir, writeFile, open, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Staging checks exercise the shipped controls. Scenario setup and observation are
// the only uses of the debug API; no check sets speed/steering directly.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseURL = process.env.VN_URL || 'http://127.0.0.1:5179';
const output = path.resolve(
  root,
  process.env.VN_EVIDENCE ||
    `.experiments/${new Date().toISOString().replaceAll(':', '-')}`,
);
const seed = 47219;
await mkdir(output, { recursive: true });
const report = {
  created: new Date().toISOString(),
  baseURL,
  seed,
  output,
  environment: {
    hostPlatform: os.platform(),
    hostRelease: os.release(),
    hostArchitecture: os.arch(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    systemMemoryGiB: +(os.totalmem() / 2 ** 30).toFixed(2),
    node: process.version,
    headless: process.env.VN_HEADED !== '1',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    performanceCaveat:
      'Automation timings describe this host/browser only. Headless or software rendering is not proof of the representative desktop GPU target.',
  },
  checks: [],
  captures: [],
  snapshots: {},
  metrics: {},
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  httpErrors: [],
  metricCollectionNote:
    'Frame metrics include screenshot capture overhead; this is functional evidence, not a controlled performance benchmark.',
  unverified: [
    'Physical gamepad input',
    'Physical mobile devices',
    'Human assessment of driving feel',
    'Audio listening (hidden functional checks do not assess the mix)',
    'Game expansion beyond the first-level Gate 2 scope',
  ],
};
let browser;
let context;
let page;
const check = (name, pass, detail = {}) =>
  report.checks.push({ name, status: pass ? 'pass' : 'fail', ...detail });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchOK = async () => {
  try {
    return (await fetch(baseURL, { signal: AbortSignal.timeout(1200) })).ok;
  } catch {
    return false;
  }
};
async function ensureServer() {
  if (await fetchOK()) return;
  const isPreview = new URL(baseURL).port === '5180';
  if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
    throw new Error(
      'Remote VN_URL unavailable; not starting a local server for it.',
    );
  const log = await open(path.join(output, 'server.log'), 'a');
  const child = spawn('npm', ['run', isPreview ? 'preview' : 'dev'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    env: process.env,
  });
  child.unref();
  await log.close();
  report.serverStarted = {
    pid: child.pid,
    script: isPreview ? 'preview' : 'dev',
    keptRunning: true,
  };
  for (let i = 0; i < 60; i++) {
    if (await fetchOK()) return;
    await sleep(250);
  }
  throw new Error(
    `Server did not become available at ${baseURL}; see server.log`,
  );
}
function monitor(p, label) {
  p.on('console', (message) => {
    if (message.type() === 'error')
      report.consoleErrors.push({ page: label, text: message.text() });
  });
  p.on('pageerror', (error) =>
    report.pageErrors.push({ page: label, text: error.message }),
  );
  p.on('requestfailed', (request) =>
    report.failedRequests.push({
      page: label,
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  p.on('response', (response) => {
    if (response.status() >= 400)
      report.httpErrors.push({
        page: label,
        url: response.url(),
        status: response.status(),
      });
  });
}
async function snapshot(label, p = page) {
  const value = await p.evaluate(() => window.__VN.getSnapshot());
  report.snapshots[label] = value;
  return value;
}
async function capture(name, p = page) {
  const destination = path.join(output, `${name}.png`);
  await p.screenshot({ path: destination });
  report.captures.push({ name, path: destination });
}
async function scenario(name, camera = 'chase') {
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Space');
  await page.evaluate(
    ({ name, seed, camera }) => {
      window.__VN.loadScenario(name, seed);
      window.__VN.setCamera(camera);
    },
    { name, seed, camera },
  );
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 10, y: 10 }, force: true });
  await page.waitForTimeout(160);
}
async function hold(keys, duration, label, frameCount = 0) {
  const started = Date.now();
  for (const key of keys) await page.keyboard.down(key);
  try {
    if (frameCount) {
      for (let i = 0; i < frameCount; i++) {
        await page.waitForTimeout(duration / frameCount);
        await capture(`${label}-${String(i).padStart(2, '0')}`);
      }
    } else await page.waitForTimeout(duration);
    return await snapshot(label);
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
    (report.inputPlayback ||= []).push({
      keys,
      requestedDurationMs: duration,
      observedDurationMs: Date.now() - started,
      label,
    });
  }
}
function vehicle(s) {
  return s.vehicle || {};
}
function finiteVehicle(s) {
  return ['distance', 'lateral', 'speed', 'heading', 'energy'].every((k) =>
    Number.isFinite(vehicle(s)[k]),
  );
}

try {
  await ensureServer();
  const launchOptions = {
    headless: report.environment.headless,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  };
  if (process.env.VN_BROWSER_PATH)
    launchOptions.executablePath = process.env.VN_BROWSER_PATH;
  else if (process.env.VN_BROWSER_CHANNEL)
    launchOptions.channel = process.env.VN_BROWSER_CHANNEL;
  else {
    try {
      await access(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      );
      launchOptions.channel = 'chrome';
    } catch {
      /* Playwright-managed Chromium is the fallback. */
    }
  }
  browser = await chromium.launch(launchOptions);
  report.environment.browser = browser.version();
  report.environment.launch = launchOptions;
  context = await browser.newContext({
    viewport: report.environment.viewport,
    deviceScaleFactor: 1,
  });
  page = await context.newPage();
  monitor(page, 'main');
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__VN?.ready === true, undefined, {
    timeout: 45000,
  });
  report.environment.graphics = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory || null,
      gpuVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
      gpuRenderer: debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : null,
      webGLVersion: gl?.getParameter(gl.VERSION),
      gamepadsPresent: [...(navigator.getGamepads?.() || [])].filter(Boolean)
        .length,
    };
  });
  check('Runtime explicitly ready', true);
  await snapshot('launch');
  await capture('00-launch');
  await page.locator('#start').focus();
  await page.keyboard.press('Enter');
  check(
    'Title supports keyboard start',
    (await snapshot('keyboard-start')).mode === 'racing',
  );

  await scenario('inspection', 'inspection');
  await page.waitForTimeout(900);
  await capture('01-ship-inspection');
  await snapshot('inspection');
  await scenario('staging', 'vista');
  await page.waitForTimeout(700);
  await capture('02-circuit-vista');

  // Stable seeded initial state is compared while paused; clocks/UI timing are excluded.
  const initialStates = [];
  for (let i = 0; i < 2; i++)
    initialStates.push(
      await page.evaluate((seed) => {
        window.__VN.loadScenario('staging', seed);
        window.__VN.pause();
        const s = window.__VN.getSnapshot();
        return {
          seed: s.seed,
          vehicle: s.vehicle,
          lap: s.lap,
          checkpoint: s.checkpoint,
        };
      }, seed),
    );
  check(
    'Seeded scenario initializes reproducibly',
    JSON.stringify(initialStates[0]) === JSON.stringify(initialStates[1]),
    { states: initialStates },
  );

  await scenario('staging');
  const start = await snapshot('control-start');
  const throttle = await hold(['ArrowUp'], 1150, 'throttle', 3);
  check(
    'Real throttle moves and accelerates the ship',
    vehicle(throttle).distance > vehicle(start).distance &&
      vehicle(throttle).speed > vehicle(start).speed,
    { before: vehicle(start), after: vehicle(throttle) },
  );
  const steer = await hold(['ArrowUp', 'ArrowRight'], 360, 'steer');
  check(
    'Right arrow moves toward the driver screen-right',
    vehicle(steer).heading < vehicle(throttle).heading - 0.003 &&
      vehicle(steer).lateral < vehicle(throttle).lateral - 0.05 &&
      steer.camera.playerScreenX - steer.camera.roadScreenX >
        throttle.camera.playerScreenX - throttle.camera.roadScreenX + 0.02,
  );
  const boostStart = await snapshot('boost-start');
  const boost = await hold(['ArrowUp', 'Shift'], 500, 'boost', 2);
  check(
    'Real boost spends energy',
    vehicle(boost).energy < vehicle(boostStart).energy,
    { before: vehicle(boostStart).energy, after: vehicle(boost).energy },
  );
  const brakeStart = await snapshot('brake-start');
  const brake = await hold(['ArrowDown'], 550, 'brake');
  check(
    'Real brake reduces speed',
    vehicle(brake).speed < vehicle(brakeStart).speed,
    { before: vehicle(brakeStart).speed, after: vehicle(brake).speed },
  );

  for (const name of ['bank-rest', 'slope-rest']) {
    await scenario(name);
    const before = await snapshot(`${name}-before`);
    check(
      `${name}: fixture is a genuine slope`,
      before.track.scenarios.includes(name) &&
        (name === 'bank-rest'
          ? Math.abs(before.trackFrame.bank) > 0.4
          : Math.abs(before.trackFrame.grade) > 0.02),
    );
    await page.waitForTimeout(2000);
    const after = await snapshot(`${name}-after`);
    check(
      `${name}: parked ship does not drift`,
      before.vehicle.distance === after.vehicle.distance &&
        before.vehicle.lateral === after.vehicle.lateral &&
        after.vehicle.speed === 0,
    );
  }
  await scenario('staging');
  const w = await hold(['w'], 900, 'wasd-throttle');
  const d = await hold(['w', 'd'], 350, 'wasd-right');
  const a = await hold(['w', 'a'], 650, 'wasd-left');
  check(
    'WASD has the same correct steering directions as arrows',
    d.vehicle.lateral < w.vehicle.lateral &&
      a.vehicle.lateral > d.vehicle.lateral,
  );

  await scenario('fast-corner');
  await hold(['ArrowUp', 'ArrowLeft', 'Space'], 350, 'airbrake');
  await capture('03-fast-corner');
  report.inputLog = await page.evaluate(() => window.__VN.getInputLog());
  const airbrakeLogged = report.inputLog.some?.(
    (entry) => entry.input?.airbrake > 0 || entry.airbrake > 0,
  );
  check(
    'Space airbrake reaches fixed-step input log',
    Boolean(airbrakeLogged),
    { logEntries: report.inputLog.length },
  );
  await scenario('bank');
  await hold(['ArrowUp'], 550, 'bank', 2);
  await capture('04-banked-track');
  const bank = await snapshot('bank-final');
  check('Bank scenario stays finite', finiteVehicle(bank));
  await scenario('impact');
  await hold(['ArrowUp', 'ArrowRight'], 550, 'impact');
  await capture('05-wall-contact');
  const impact = await snapshot('impact-final');
  check('Impact scenario stays finite', finiteVehicle(impact));
  check(
    'Wall contact emits impact feedback',
    impact.events?.some((event) => event.type === 'impact'),
  );
  await page.keyboard.press('r');
  await page.waitForTimeout(120);
  const recovered = await snapshot('recovery');
  check(
    'Real recovery recentres and invalidates the lap',
    recovered.vehicle.resetCount > impact.vehicle.resetCount &&
      Math.abs(recovered.vehicle.lateral) < 0.1 &&
      recovered.lap.valid === false,
  );
  check(
    'Recovery session is rejected by replay capture',
    await page.evaluate(() => {
      try {
        window.__VN.getReplay();
        return false;
      } catch {
        return true;
      }
    }),
  );

  await page.evaluate(() => window.__VN.pause());
  const pausedBefore = await snapshot('paused-before');
  await hold(['ArrowUp', 'Shift'], 400, 'paused-after');
  const pausedAfter = report.snapshots['paused-after'];
  check(
    'Pause freezes vehicle distance and race clock',
    vehicle(pausedBefore).distance === vehicle(pausedAfter).distance &&
      vehicle(pausedBefore).time === vehicle(pausedAfter).time,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(
    'Escape resumes a paused session',
    (await snapshot('escape-after-pause')).mode === 'racing',
  );

  await scenario('staging');
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurBefore = await snapshot('blur-before');
  await page.waitForTimeout(350);
  const blurAfter = await snapshot('blur-after');
  await page.keyboard.up('ArrowUp');
  check(
    'Focus loss freezes race',
    vehicle(blurBefore).distance === vehicle(blurAfter).distance &&
      vehicle(blurBefore).time === vehicle(blurAfter).time,
  );

  await page.evaluate(() => window.__VN.restart());
  await page.waitForTimeout(150);
  const restarted = await snapshot('restart');
  check('Restart produces finite staging state', finiteVehicle(restarted));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await capture('06-mobile-layout');
  report.responsive = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    document: [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ],
    canvas: (() => {
      const r = document.querySelector('canvas').getBoundingClientRect();
      return [r.width, r.height];
    })(),
  }));
  check(
    'Mobile viewport does not overflow horizontally',
    report.responsive.document[0] <= 390,
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await scenario('staging');
  await hold(['ArrowUp'], 500, 'final-race');
  await capture('07-in-race');
  report.metrics = await page.evaluate(() => window.__VN.getMetrics());
  await page.evaluate(() => window.__VN.pause());
  const replayResult = await page.evaluate(() => {
    const before = window.__VN.getSnapshot(),
      replay = window.__VN.getReplay();
    const after = window.__VN.playReplay(replay);
    let incompatibleRejected = false;
    try {
      window.__VN.playReplay({ ...replay, physicsVersion: -1 });
    } catch {
      incompatibleRejected = true;
    }
    return { before, after, replay, incompatibleRejected };
  });
  check(
    'Recorded tick input replay reproduces vehicle and lap state',
    JSON.stringify(replayResult.before.vehicle) ===
      JSON.stringify(replayResult.after.vehicle) &&
      JSON.stringify(replayResult.before.lap) ===
        JSON.stringify(replayResult.after.lap),
  );
  check('Incompatible replay is rejected', replayResult.incompatibleRejected);
  report.replay = replayResult;

  const storageContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  await storageContext.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem'])
      Storage.prototype[method] = () => {
        throw new DOMException(
          'Storage disabled by verification scenario',
          'SecurityError',
        );
      };
  });
  const storagePage = await storageContext.newPage();
  monitor(storagePage, 'storage-unavailable');
  await storagePage.goto(baseURL, { waitUntil: 'networkidle' });
  await storagePage.waitForFunction(
    () => window.__VN?.ready === true,
    undefined,
    { timeout: 30000 },
  );
  const storageSnapshot = await snapshot('storage-unavailable', storagePage);
  check(
    'Unavailable storage preserves ready runtime',
    Boolean(storageSnapshot),
  );
  await storageContext.close();
  check('No uncaught runtime exceptions', report.pageErrors.length === 0);
  check('No browser console errors', report.consoleErrors.length === 0);
  check(
    'No failed asset requests or HTTP errors',
    report.failedRequests.length === 0 && report.httpErrors.length === 0,
  );
} catch (error) {
  report.fatal = { message: error.message, stack: error.stack };
  check('Harness completes', false, { error: error.message });
  if (page) {
    try {
      await capture('failure');
    } catch {
      /* Preserve original failure. */
    }
  }
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  report.finished = new Date().toISOString();
  report.result = report.checks.some((c) => c.status === 'fail')
    ? 'fail'
    : 'pass';
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        result: report.result,
        report: path.join(output, 'report.json'),
        video: report.video,
        checks: report.checks.map(({ name, status }) => ({ name, status })),
        fatal: report.fatal?.message,
      },
      null,
      2,
    ),
  );
  process.exitCode = report.result === 'pass' ? 0 : 1;
}
