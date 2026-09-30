import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrack } from '../src/levels/halcyon/track/index.js';
import { STEERING_ASSIST } from '../src/physics/index.js';

// Verification-only driver: reads state and sends real keyboard events. This is
// not included in the application and never teleports or modifies race state.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(
  root,
  process.env.VN_EVIDENCE ||
    `.experiments/lap-${new Date().toISOString().replaceAll(':', '-')}`,
);
const url = process.env.VN_URL || 'http://127.0.0.1:5179';
await mkdir(output, { recursive: true });
const track = createTrack();
const report = {
  url,
  output,
  method:
    'A verification controller reads snapshots and the owned track model, then presses actual keyboard controls. No simulation writes after seeded scenario setup.',
  performanceCaveat:
    'Headless browser timings include screenshot capture overhead. Foreground desktop certification and physical-device input/audio testing are separate.',
  errors: [],
  samples: [],
  captures: [],
};
const browser = await chromium.launch({
  channel: process.env.VN_BROWSER_CHANNEL || 'chrome',
  headless: process.env.VN_HEADED !== '1',
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on('pageerror', (error) => report.errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error')
    report.errors.push({ text: message.text(), location: message.location() });
});
const pressed = new Set();
async function keys(next) {
  const desired = new Set(next);
  for (const key of pressed)
    if (!desired.has(key)) {
      await page.keyboard.up(key);
      pressed.delete(key);
    }
  for (const key of desired)
    if (!pressed.has(key)) {
      await page.keyboard.down(key);
      pressed.add(key);
    }
}
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__VN?.ready === true, undefined, {
    timeout: 45000,
  });
  await page.evaluate(() => {
    window.__VN.loadScenario('staging', 47219);
    window.__VN.setCamera('chase');
  });
  await page
    .locator('#world')
    .click({ position: { x: 960, y: 540 }, force: true });
  let steeringDebt = 0;
  const captured = new Set();
  const start = Date.now();
  while (Date.now() - start < 110000) {
    const snapshot = await page.evaluate(() => window.__VN.getSnapshot());
    const s = snapshot.vehicle;
    if (snapshot.lap.lap > 1) {
      report.completed = snapshot;
      break;
    }
    if (snapshot.mode !== 'racing')
      throw new Error(`Race interrupted: ${snapshot.mode}`);
    const road = track.sample(s.distance);
    const curvatureAhead = Math.max(
      Math.abs(road.curvature),
      Math.abs(track.sample(s.distance + 30).curvature),
      Math.abs(track.sample(s.distance + 60).curvature),
    );
    const targetSpeed = Math.min(112, 1.15 / Math.max(curvatureAhead, 0.001));
    const speed = Math.max(s.speed, 8);
    const targetLateralVelocity = -s.lateral * 1.4 - s.lateralSpeed * 0.3;
    const desiredHeading = Math.asin(
      clamp(
        (targetLateralVelocity +
          (road.curvature * speed * speed * 0.75 + 9.81 * road.right.y) / 7.2) /
          speed,
        -0.6,
        0.6,
      ),
    );
    const desiredSteer = clamp(
      -(
        track.sample(s.distance + s.speed * 0.15).curvature * s.speed +
        (3 * (desiredHeading - s.heading)) / (1 - STEERING_ASSIST)
      ) / 1.5,
      -1,
      1,
    );
    steeringDebt += desiredSteer;
    const steer = steeringDebt > 0.5 ? 1 : steeringDebt < -0.5 ? -1 : 0;
    steeringDebt -= steer;
    const controls = [s.speed > targetSpeed + 4 ? 'ArrowDown' : 'ArrowUp'];
    if (steer) controls.push(steer > 0 ? 'ArrowRight' : 'ArrowLeft');
    await keys(controls);
    report.samples.push({
      wallMs: Date.now() - start,
      tick: snapshot.tick,
      vehicle: s,
      lap: snapshot.lap,
      controls,
      targetSpeed,
    });
    const distance = s.distance % track.length;
    const label = track.sections.find(
      (section) => distance >= section.start && distance < section.end,
    )?.id;
    if (label && !captured.has(label)) {
      captured.add(label);
      const capture = path.join(output, `${label}.png`);
      await page.screenshot({ path: capture });
      report.captures.push(capture);
    }
    await page.waitForTimeout(40);
  }
  await keys([]);
  await page.evaluate(() => window.__VN.pause());
  report.final = await page.evaluate(() => window.__VN.getSnapshot());
  report.metrics = await page.evaluate(() => window.__VN.getMetrics());
  report.inputLog = await page.evaluate(() => window.__VN.getInputLog());
  report.browser = browser.version();
  await page.screenshot({ path: path.join(output, 'lap-final.png') });
  report.validLap = Boolean(
    report.completed?.events.find(
      (event) => event.type === 'lap' && event.payload.valid,
    ),
  );
  report.lapDuration = report.completed?.lap.lastLap || null;
  report.impacts = report.final.events.filter(
    (event) => event.type === 'impact',
  ).length;
  report.replay = await page.evaluate(() => {
    const before = window.__VN.getSnapshot(),
      recording = window.__VN.getReplay();
    const after = window.__VN.playReplay(recording);
    return {
      matches:
        JSON.stringify(before.vehicle) === JSON.stringify(after.vehicle) &&
        JSON.stringify(before.lap) === JSON.stringify(after.lap),
      inputCount: recording.inputs.length,
      before: { vehicle: before.vehicle, lap: before.lap },
      after: { vehicle: after.vehicle, lap: after.lap },
    };
  });
  report.wallMs = Date.now() - start;
} catch (error) {
  report.fatal = { message: error.message, stack: error.stack };
} finally {
  await context.close();
  await browser.close();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      {
        report: path.join(output, 'report.json'),
        validLap: report.validLap,
        lapDuration: report.lapDuration,
        impacts: report.impacts,
        errors: report.errors,
        fatal: report.fatal?.message,
        wallMs: report.wallMs,
      },
      null,
      2,
    ),
  );
  process.exitCode =
    report.validLap && report.replay?.matches && report.errors.length === 0
      ? 0
      : 1;
}
