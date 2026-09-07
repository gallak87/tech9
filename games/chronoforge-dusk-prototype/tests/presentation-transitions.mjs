// Focused presentation/lifecycle regressions. Run with Node 22 and managed Playwright.
// Rendering is covered by battle-stage.mjs; this suite keeps world.update and all
// presentation/game/DOM behavior active while suppressing expensive WebGL draws.
// GAME_URL defaults to dev; GAME_DIST optionally serves an isolated production build.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const artifacts = process.env.QA_ARTIFACTS || '/tmp/dusk-presentation-transitions';
const report = { started: new Date().toISOString(), checks: [], errors: [] };
await fs.mkdir(artifacts, { recursive: true });
let server;
if (process.env.GAME_DIST) {
  const root = path.resolve(process.env.GAME_DIST);
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp' };
  server = http.createServer(async (req, res) => {
    const file = path.resolve(root, `.${decodeURIComponent(req.url.split('?')[0]) === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0])}`);
    if (!file.startsWith(`${root}/`)) { res.writeHead(403); res.end(); return; }
    try { const data = await fs.readFile(file); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(data); }
    catch { res.writeHead(404); res.end('Missing asset'); }
  });
  await new Promise(resolve => server.listen(5203, '127.0.0.1', resolve));
}
const address = new URL(process.env.GAME_URL || (server ? 'http://127.0.0.1:5203/?test=1' : 'http://127.0.0.1:5199/?test=1'));
address.searchParams.set('test', '1'); address.searchParams.delete('battle');
report.url = address.href;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', e => report.errors.push({ type: 'page', message: e.message }));
page.on('console', m => { if (m.type() === 'error') report.errors.push({ type: 'console', message: m.text() }); });
page.on('response', r => { if (r.status() >= 400) report.errors.push({ type: 'network', message: `${r.status()} ${r.url()}` }); });
const watchdog = setTimeout(() => { report.errors.push({ type: 'timeout', message: 'Lifecycle regression exceeded 150 seconds' }); void browser.close(); }, 150000);
const mark = message => { report.checks.push(message); console.log(message); };
const state = () => page.evaluate(() => window.__dusk.snapshot());
const stored = () => page.evaluate(() => localStorage.getItem('chronoforge-dusk-save-v1'));
async function dialogue() { for (let n = 0; n < 8 && await page.locator('[data-action="advance"]').isVisible().catch(() => false); n++) await page.locator('[data-action="advance"]').click(); }
async function menu(tab) { if ((await state()).mode !== 'menu') await page.locator('.journal-button').click(); await page.locator(`.journal-tabs [data-tab="${tab}"]`).click(); }
async function closeMenu() { if ((await state()).mode === 'menu') await page.locator('[data-action="close"]').click(); }
async function rehearsal() { await page.locator('[data-action="practice"]').click(); await page.waitForFunction(() => window.__dusk.game.state.mode === 'battle'); }
async function leave() { await page.locator('[data-action="exit-practice"]:visible').first().click(); await page.waitForFunction(() => window.__dusk.game.state.mode === 'title'); }
async function command(hero, action, category, target) {
  await page.locator(`.combat-hero[data-id="${hero}"]`).click();
  await page.locator(`[data-action="category"][data-id="${category}"]`).click();
  await page.locator(`[data-action="command"][data-id="${action}"]`).click();
  if (await page.locator('[data-action="execute"]').isVisible().catch(() => false)) {
    if (target) await page.locator(`.target-list [data-id="${target}"]`).click();
    await page.locator('[data-action="execute"]').click();
  }
}
async function readyFinalBlow() {
  return page.evaluate(() => {
    const s = window.__dusk.game.state; s.battle.actionDelay = 0;
    s.party.forEach(h => { h.atb = 100; h.hp = h.maxHp; h.statuses = []; });
    s.battle.enemies.forEach((e, i) => { e.hp = i ? 0 : 1; e.atb = 0; });
    return s.battle.enemies[0].id;
  });
}

try {
  await page.goto(address.href);
  await page.waitForFunction(() => !!window.__dusk);
  await page.evaluate(() => { window.__dusk.world.render = () => {}; });
  await page.waitForFunction(() => !!window.__dusk && window.__dusk.world.assetStatus?.ready, null, { timeout: 45000 });
  await page.locator('[data-action="new"]').click(); await dialogue();
  await page.waitForFunction(() => window.__dusk.game.state.mode === 'explore');
  await page.evaluate(() => { window.__dusk.game.state.settings.quality = 'medium'; window.__dusk.world.setQuality('medium'); window.__dusk.game.startBattle('causeway'); });
  await page.waitForFunction(() => window.__dusk.game.state.mode === 'battle');
  await menu('Settings'); await closeMenu(); // Establish the previousMode='battle' regression trigger.
  await command('kaida', 'attack', 'Attack', await readyFinalBlow());
  await page.locator('.result [data-action="victory"]').waitFor({ state: 'visible' });
  await page.locator('[data-action="victory"]').click();
  await page.locator('.travel-controls [data-action="help"]').click(); await dialogue();
  assert.equal((await state()).mode, 'explore'); assert.equal((await state()).battle, null);
  await menu('Save'); assert.ok(await page.locator('[data-action="save"]').isEnabled()); await closeMenu();
  mark('Field guide returns to exploration after a paused battle victory; menus remain usable');

  // Save a distinct story state and retain exact storage bytes throughout every rehearsal.
  await page.evaluate(() => { const s = window.__dusk.game.state; s.player = { x: 2, z: 17 }; s.resources.food = 9; s.inventory.medkit = 7; });
  await menu('Save'); await page.locator('[data-action="save"]').click(); await page.locator('[data-action="title"]').click();
  const originalSave = await stored(); assert.ok(originalSave);
  const originalSettings = (await state()).settings;
  await page.evaluate(() => {
    window.__appliedSettings = {};
    const world = window.__dusk.world, audio = window.__dusk.audio;
    const quality = world.setQuality.bind(world), volumes = audio.setVolumes.bind(audio);
    world.setQuality = value => { window.__appliedSettings.quality = value; return quality(value); };
    audio.setVolumes = (music, sfx) => { window.__appliedSettings.audio = [music, sfx]; return volumes(music, sfx); };
  });
  await rehearsal();
  assert.equal(await page.evaluate(() => window.__dusk.game.save()), false);
  assert.equal(await stored(), originalSave);
  await menu('Settings');
  await page.locator('[data-setting="quality"]').selectOption('low');
  const music = page.locator('[data-setting="music"]'); await music.focus(); await music.press('Home'); await music.press('ArrowRight');
  const sfx = page.locator('[data-setting="sfx"]'); await sfx.focus(); await sfx.press('Home'); await sfx.press('ArrowRight');
  await closeMenu(); await leave();
  assert.deepEqual((await state()).settings, originalSettings);
  const applied = await page.evaluate(() => window.__appliedSettings);
  assert.equal(applied.quality, originalSettings.quality); assert.deepEqual(applied.audio, [originalSettings.music, originalSettings.sfx]);
  assert.equal(await stored(), originalSave);
  mark('Rehearsal blocks saving and exit reapplies the original story audio/quality settings');

  await rehearsal();
  await page.locator('[data-action="category"][data-id="Combos"]').click();
  await page.evaluate(() => {
    window.__latePresentation = { floaters: [], sounds: [] }; window.__watchLatePresentation = false;
    const originalPlay = window.__dusk.audio.play.bind(window.__dusk.audio);
    window.__dusk.audio.play = name => { if (window.__watchLatePresentation && ['attack', 'tech', 'combo', 'triple', 'hit'].includes(name)) window.__latePresentation.sounds.push(name); return originalPlay(name); };
    new MutationObserver(records => { if (window.__watchLatePresentation) for (const r of records) for (const node of r.addedNodes) window.__latePresentation.floaters.push(node.textContent); }).observe(document.querySelector('#floaters'), { childList: true });
    // Synchronous DOM clicks ensure exit happens before the scheduled impact, independent of runner latency.
    document.querySelector('[data-action="command"][data-id="aeon-sunder"]').click();
    document.querySelector('[data-action="exit-practice"]').click();
    window.__watchLatePresentation = true;
  });
  await page.waitForTimeout(1400);
  assert.equal((await state()).mode, 'title');
  assert.deepEqual(await page.evaluate(() => window.__latePresentation), { floaters: [], sounds: [] });
  assert.equal(await stored(), originalSave);
  await page.evaluate(() => { window.__watchLatePresentation = false; });
  mark('Immediate rehearsal exit cancels delayed impact labels and sounds');

  await rehearsal(); await command('kaida', 'attack', 'Attack', await readyFinalBlow());
  await page.locator('.result [data-action="victory"]').waitFor({ state: 'visible' });
  await leave(); assert.equal(await stored(), originalSave);
  mark('Victory result offers a direct rehearsal exit without replaying or changing the story save');

  await rehearsal();
  await page.evaluate(() => {
    const s = window.__dusk.game.state; s.battle.actionDelay = 0;
    s.party.forEach(h => { h.hp = 1; h.atb = 0; h.statuses = []; });
    const e = s.battle.enemies[0]; e.atb = 99.9; e.intent = { name: 'Defeat regression', type: 'all', power: 100, targetId: 'kaida' };
  });
  await page.locator('.result.defeat').waitFor({ state: 'visible' });
  await leave(); assert.equal(await stored(), originalSave);
  mark('Defeat result offers a direct rehearsal exit without retrying or changing the story save');

  await rehearsal();
  await page.evaluate(() => {
    const s = window.__dusk.game.state; s.battle.actionDelay = 0;
    s.party.forEach(h => { h.atb = 0; h.statuses = []; });
    s.party.find(h => h.id === 'vex').hp = 1;
    const e = s.battle.enemies[0]; e.atb = 99.9; e.intent = { name: 'Fallen HUD regression', type: 'attack', power: 100, targetId: 'vex' };
    // Deliberately no render(): enemy updates must refresh the existing portrait themselves.
  });
  await page.waitForFunction(() => window.__dusk.game.state.party.find(h => h.id === 'vex').hp === 0);
  await page.locator('.combat-hero[data-id="vex"].fallen').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-ready="vex"]').innerText(), 'DOWN');
  await page.evaluate(() => { const s = window.__dusk.game.state; s.battle.actionDelay = 0; s.party.find(h => h.id === 'rune').atb = 100; });
  await command('rune', 'item-medkit', 'Items', 'vex');
  await page.waitForFunction(() => !document.querySelector('.combat-hero[data-id="vex"]').classList.contains('fallen') && document.querySelector('[data-ready="vex"]').textContent !== 'DOWN');
  assert.equal((await state()).party.find(h => h.id === 'vex').hp, 80);
  assert.match(await page.locator('[data-hp-text="vex"]').innerText(), /^80\s/);
  await leave(); assert.equal(await stored(), originalSave);
  await page.locator('[data-action="continue"]').click();
  const restored = await state(), saved = JSON.parse(originalSave);
  assert.deepEqual(restored.cleared, saved.cleared); assert.deepEqual(restored.resources, saved.resources); assert.deepEqual(restored.inventory, saved.inventory); assert.deepEqual(restored.player, saved.player);
  mark('Enemy-driven death updates fallen/DOWN state, Medkit revives its dead target, and Continue restores the untouched story');
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
} catch (error) {
  report.errors.push({ type: 'assertion', message: error.stack }); process.exitCode = 1;
  report.failureState = await state().catch(() => null);
  await page.screenshot({ path: path.join(artifacts, 'failure.png'), timeout: 5000 }).catch(() => {});
  console.error(error);
} finally {
  clearTimeout(watchdog); await context.close().catch(() => {}); await browser.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  report.finished = new Date().toISOString(); await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, errors: report.errors, artifacts }, null, 2));
}
