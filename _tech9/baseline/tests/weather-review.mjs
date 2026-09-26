import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { openScene, root, argument } from './lib/browser.mjs';
const pass = argument('pass', '1');
const output = path.resolve(root, '../.artifacts/weather', `pass-${pass}`);
await mkdir(output, { recursive: true });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const h = await openScene({
  mode: 'preview',
  recordVideoDir: path.join(output, 'video'),
});
const { page, snapshot } = h;
const report = {
  commit,
  pass,
  environment: h.environment,
  segments: [],
  captures: [],
  note: 'Video records real input, transitions and exploration. Ordered motion PNG sequences are sampled from the running scene; timestamps are simulation time. Do not infer full-rate smoothness from a single still.',
};
const video = page.video();
const start = Date.now();
let clean = false;
async function hud(value) {
  if (clean !== value) {
    await page.locator('canvas').focus();
    await page.keyboard.press('h');
    clean = value;
    await page.waitForTimeout(400);
  }
}
async function capture(name) {
  await hud(true);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  report.captures.push({
    name,
    videoSeconds: (Date.now() - start) / 1000,
    snapshot: await snapshot(),
  });
}
async function preset(name, settle = 4300) {
  await hud(false);
  await page.locator(`[data-preset="${name}"]`).click();
  report.segments.push({
    action: `preset ${name}`,
    seconds: (Date.now() - start) / 1000,
  });
  await page.waitForTimeout(settle);
}
async function motion(name) {
  await hud(true);
  for (let frame = 0; frame < 6; frame++) {
    await page.screenshot({
      path: path.join(output, `motion-${name}-${frame}.png`),
      clip: { x: 340, y: 190, width: 900, height: 690 },
    });
    report.captures.push({
      name: `motion-${name}-${frame}`,
      videoSeconds: (Date.now() - start) / 1000,
      time: (await snapshot()).weather.time,
    });
    await page.waitForTimeout(120);
  }
}
async function explore(name) {
  await hud(true);
  report.segments.push({
    action: `real-input ${name} exploration`,
    seconds: (Date.now() - start) / 1000,
  });
  await page.locator('canvas').click({ position: { x: 850, y: 650 } });
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  await page.mouse.move(850, 600);
  await page.mouse.down();
  await page.mouse.move(1030, 610, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await capture(`explore-${name}`);
  await hud(false);
  await page.locator('[data-weather-view="trail"]').click();
}
try {
  await page.locator('[data-setting="quality"]').selectOption('balanced');
  await page.locator('#close-panel').click();
  await preset('clear', 800);
  await capture('clear-trail');
  await explore('clear');
  await preset('drizzle');
  await capture('drizzle-trail');
  await preset('rain', 6500);
  await capture('rain-trail');
  await motion('rain');
  await explore('rain');
  for (const [view, label] of [
    ['weatherRock', 'rock'],
    ['weatherShelter', 'shelter'],
  ]) {
    await hud(false);
    await page.locator(`[data-weather-view="${view}"]`).click();
    await page.waitForTimeout(500);
    await capture(`rain-${label}`);
  }
  await hud(false);
  await page.locator('[data-weather-view="trail"]').click();
  await preset('winter', 5200);
  await capture('winter-trail');
  await explore('winter');
  for (const [view, label] of [
    ['weatherRock', 'rock'],
    ['weatherShelter', 'shelter'],
  ]) {
    await hud(false);
    await page.locator(`[data-weather-view="${view}"]`).click();
    await page.waitForTimeout(500);
    await capture(`winter-${label}`);
  }
  await hud(false);
  await page.locator('[data-weather-view="trail"]').click();
  await preset('snowfall');
  await capture('snowfall-trail');
  await motion('snow');
  await explore('snowfall');
  await preset('clear', 4500);
  await hud(false);
  await page.locator('#weather-details summary').click();
  await page.locator('[data-weather="wind"]').focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(4000);
  await motion('wind');
  await hud(false);
  await page.locator('#weather-sound').click();
  await page.locator('[data-preset="rain"]').click();
  await page.waitForTimeout(1500);
  await page.locator('#weather-sound').click();
  await capture('rain-transition');
  assert.deepEqual(h.errors, {
    console: [],
    page: [],
    requests: [],
    webgl: [],
  });
  report.errors = h.errors;
} finally {
  await h.close();
  report.video = await video.path();
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
}
console.log(
  JSON.stringify({
    commit,
    output,
    video: report.video,
    captures: report.captures.length,
    errors: report.errors,
  }),
);
