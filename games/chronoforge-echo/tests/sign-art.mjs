import {reviewRoot} from '../scripts/review-output.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL('../', import.meta.url).pathname;
const before = process.argv.includes('--before');
const report = { method: 'Actual production drawWorld at 960×540 logical coordinates, 1920×1080 backing. Camera/party-position and cleared-encounter fixtures isolate existing sign locations; no earned-progression claim. Sign objects and domestic furniture are not mutated.', phase: before ? 'before' : 'after', captures: [], errors: [] };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.routeWebSocket('**/*', socket => { socket.send('{"type":"connected"}'); socket.onMessage(() => {}); });
try {
  await page.goto('http://127.0.0.1:4321/?test=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ECHO_READY__);
  const cases = await page.evaluate(async () => {
    const { ALL_SCENES } = await import('/src/world.js');
    return Object.values(ALL_SCENES).flatMap(scene => scene.objects.filter(o => o.type === 'sign').map(o => ({ scene: scene.id, biome: scene.biome, interior: !!scene.interior, id: o.id, name: o.name, x: o.x, y: o.y, dialogue: o.dialogue })));
  });
  assert.equal(cases.length, 9); assert.ok(cases.every(c => !c.interior)); report.covered = cases;
  await page.evaluate(() => { __ECHO__.preset('party'); __ECHO__.game.resetSession(); __ECHO__.game.update = () => {}; });
  for (const target of before ? cases.filter(c => c.id === 'ember_forest_sign') : cases) {
    const actual = await page.evaluate(target => {
      __ECHO__.goto(target.scene); const g = __ECHO__.game;
      for (const object of g.scene.objects) if (object.type === 'encounter') g.state.cleared[object.id] = true;
      const position = g.safePoint(g.scene, target.x - 75, target.y + 27); Object.assign(g.state, position);
      g.state.facing = 'right'; g.resetFollowers(); g.updateCamera(true); g.near = g.scene.objects.find(o => o.id === target.id); g.ui.render();
      return { ...target, camera: { ...g.camera }, statePosition: { x: g.state.x, y: g.state.y }, sceneSize: [g.scene.width, g.scene.height] };
    }, target);
    await page.waitForTimeout(80);
    const file = `${before ? 'before-' : ''}${target.id}.png`;
    await page.screenshot({ path: reviewRoot + 'sign-refresh/' + file }); report.captures.push({ file, ...actual });
  }
  if (!before) {
    const domestic = await page.evaluate(async () => {
      const { ALL_SCENES } = await import('/src/world.js');
      const scene = Object.values(ALL_SCENES).find(s => s.kind === 'house');
      const letter = scene.objects.find(o => o.domestic && o.id.endsWith('_letter'));
      __ECHO__.goto(scene.id); const g = __ECHO__.game; Object.assign(g.state, g.safePoint(scene, letter.x - 90, letter.y + 45)); g.resetFollowers(); g.updateCamera(true); g.near = letter; g.ui.render();
      return { scene: scene.id, letter: { id: letter.id, type: letter.type, domestic: letter.domestic }, signs: scene.objects.filter(o => o.type === 'sign').length };
    });
    assert.equal(domestic.letter.type, 'console'); assert.ok(domestic.letter.domestic); assert.equal(domestic.signs, 0); report.domestic = domestic;
    await page.waitForTimeout(80); await page.screenshot({ path: reviewRoot + 'sign-refresh/domestic-letter-unchanged.png' });
    report.assets = await page.evaluate(() => __ECHO__.snapshot().assets);
    assert.ok(report.assets.loaded.some(a => a.id === 'road_waymarker')); assert.deepEqual(report.assets.errors, []);
  }
  assert.deepEqual(report.errors, []); report.result = 'pass';
} catch (error) { report.result = 'fail'; report.failure = String(error); process.exitCode = 1; }
finally { await fs.writeFile(reviewRoot + 'sign-refresh/' + (before ? 'before' : 'results') + '.json', JSON.stringify(report, null, 2)); await browser.close(); console.log(JSON.stringify({ result: report.result, failure: report.failure, captures: report.captures.length, assetCount: report.assets?.loaded.length, errors: report.errors })); }
