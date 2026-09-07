// Production-browser acceptance test. Launches only Playwright's managed Chromium.
// Run after `npm run build`; GAME_DIST may point to an isolated build snapshot.
// Deterministic setup is limited to travel and a separate defeat/retry scenario.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(process.env.GAME_DIST || path.join(project, 'dist'));
const artifacts = process.env.QA_ARTIFACTS || '/tmp/chronoforge-browser-artifacts';
const port = Number(process.env.QA_PORT || 5202);
const prefix = '/chronoforge-dusk/';
const url = process.env.GAME_URL || `http://127.0.0.1:${port}${prefix}?test=1`;
const results = { url, started: new Date().toISOString(), checks: [], errors: [], screenshots: [], commands: [], layouts: [] };
await fs.mkdir(artifacts, { recursive: true });
let server;
if (!process.env.GAME_URL) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
  server = http.createServer(async (req, res) => {
    const route = decodeURIComponent(req.url.split('?')[0]);
    if (!route.startsWith(prefix)) { res.writeHead(404); res.end('Project prefix required'); return; }
    const file = path.resolve(dist, route.slice(prefix.length) || 'index.html');
    if (!file.startsWith(`${dist}/`)) { res.writeHead(403); res.end(); return; }
    try { const body = await fs.readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end('Missing production asset'); }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
}
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const log = message => { results.checks.push(message); console.log(message); };
async function snapshot(page) { return page.evaluate(() => window.__dusk.snapshot()); }
async function capture(page, name) { const filename = path.join(artifacts, `${name}.png`); await page.screenshot({ path: filename, fullPage: true }); results.screenshots.push(filename); }
function observe(page, label) {
  page.on('pageerror', error => results.errors.push({ label, type: 'page', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') results.errors.push({ label, type: 'console', message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) results.errors.push({ label, type: 'network', message: `${response.status()} ${response.url()}` }); });
}
async function settleDialogue(page) {
  for (let i = 0; i < 12 && await page.locator('[data-action="advance"]').isVisible().catch(() => false); i++) await page.locator('[data-action="advance"]').click();
}
async function begin(page) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__dusk);
  await page.locator('[data-action="new"]').click();
  await settleDialogue(page);
  await page.waitForFunction(() => window.__dusk.game.state.mode === 'explore');
}
async function menu(page, tab) {
  if ((await snapshot(page)).mode !== 'menu') await page.locator('.journal-button').click();
  await page.locator(`.journal-tabs [data-tab="${tab}"]`).click();
  await page.locator('.journal-content').waitFor({ state: 'visible' });
}
async function close(page) { if ((await snapshot(page)).mode === 'menu') await page.locator('[data-action="close"]').click(); }
async function inspectLayout(page, label) {
  const data = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, visibleButtons: [...document.querySelectorAll('button')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').length }));
  results.layouts.push({ label, ...data });
  assert.ok(data.documentWidth <= data.width + 2 && data.bodyWidth <= data.width + 2, `${label}: horizontal page overflow`);
}
const positions = { 'cache-west': [-18, 6], 'cache-east': [17, 1], causeway: [1, 4], garden: [-14, -5], wardens: [12, -12], 'relay-west': [-12, -10], 'relay-east': [12, -17], memory: [-15, -15], boss: [0, -23], mira: [-3, 14], beacon: [0, 12] };
async function travel(page, id, interaction = true) {
  await close(page);
  await page.evaluate(([x, z]) => window.__dusk.teleport(x, z), positions[id]);
  await page.waitForFunction(id => window.__dusk.game.state.mode === 'battle' || window.__dusk.navigation.nearby?.id === id, id, { timeout: 15000 });
  if (interaction && (await snapshot(page)).mode === 'explore') { await page.locator('#interact-prompt').click(); await settleDialogue(page); }
}
async function learn(page, heroId, skillId) {
  await menu(page, 'Skills');
  const button = page.locator(`[data-action="learn"][data-hero="${heroId}"][data-id="${skillId}"]`);
  if (await button.isEnabled()) { await button.click(); assert.ok((await snapshot(page)).party.find(h => h.id === heroId).skills.includes(skillId)); }
}
async function equip(page, heroId, itemId) {
  await menu(page, 'Inventory');
  await page.locator(`[data-action="item"][data-id="${itemId}"]`).click();
  const button = page.locator(`[data-action="equip"][data-hero="${heroId}"]`);
  if (await button.isEnabled()) await button.click();
  assert.ok(Object.values((await snapshot(page)).party.find(h => h.id === heroId).equipment).includes(itemId));
}
async function issue(page, heroId, actionId, targetId) {
  const category = actionId.startsWith('combo-') || actionId === 'aeon-sunder' ? 'Combos' : actionId.startsWith('item-') ? 'Items' : ['attack', 'defend'].includes(actionId) ? 'Attack' : 'Techniques';
  await page.locator(`.combat-hero[data-id="${heroId}"]`).click();
  await page.locator(`[data-action="category"][data-id="${category}"]`).click();
  await page.locator(`[data-action="command"][data-id="${actionId}"]`).click();
  if (await page.locator('[data-action="execute"]').isVisible().catch(() => false)) {
    if (targetId) await page.locator(`.target-list [data-action="target"][data-id="${targetId}"]`).click();
    await page.locator('[data-action="execute"]').click();
  }
  results.commands.push({ encounter: (await snapshot(page)).battle?.id, heroId, actionId, targetId });
}
async function fight(page, id) {
  await page.waitForFunction(id => window.__dusk.game.state.mode === 'battle' && window.__dusk.game.state.battle.id === id, id);
  const uses = { kaida: 0, vex: 0, rune: 0 };
  for (let count = 0; count < 170; count++) {
    await page.waitForFunction(() => { const s = window.__dusk.game.state; return s.mode !== 'battle' || (!(s.battle.actionDelay > 0) && s.party.every(h => h.hp <= 0 || h.atb >= 100)); }, null, { timeout: 25000 });
    const s = await snapshot(page);
    if (s.mode !== 'battle') { assert.equal(s.mode, 'victory', `${id}: crew should win using available resources`); break; }
    const actions = await page.evaluate(() => Object.fromEntries(window.__dusk.game.state.party.map(h => [h.id, window.__dusk.game.getActions(h.id)])));
    const available = (heroId, actionId) => actions[heroId].find(a => a.id === actionId)?.available;
    const alive = s.party.filter(h => h.hp > 0), target = s.battle.enemies.find(e => e.hp > 0), wounded = s.party.find(h => h.hp < h.maxHp * 0.42);
    const novel = ['combo-kaida-vex', 'combo-kaida-rune', 'combo-vex-rune'].find(actionId => !results.commands.some(c => c.actionId === actionId) && alive.some(h => available(h.id, actionId)));
    let command;
    if (wounded && s.inventory.medkit > 0) command = [alive.sort((a, b) => uses[a.id] - uses[b.id])[0].id, 'item-medkit', wounded.id];
    else if (id === 'boss' && s.battle.phase >= 3 && available('kaida', 'aeon-sunder')) command = ['kaida', 'aeon-sunder'];
    else if (novel) command = [alive.find(h => available(h.id, novel)).id, novel, target.id];
    else if (id === 'boss' && target.intent.type === 'all' && !s.party.find(h => h.id === 'kaida').statuses.some(s => s.id === 'shield') && available('rune', 'aegis-pulse')) command = ['rune', 'aegis-pulse'];
    else {
      const actor = alive.sort((a, b) => uses[a.id] - uses[b.id])[0];
      const technique = actor.id === 'kaida' ? 'arc-cut' : actor.id === 'vex' ? 'gravity-well' : null;
      command = [actor.id, technique && available(actor.id, technique) ? technique : 'attack', target.id];
    }
    await issue(page, ...command);
    const participants = actions[command[0]].find(a => a.id === command[1])?.participants || [command[0]];
    for (const heroId of participants) uses[heroId]++;
    if (count === 2) await capture(page, `desktop-${id}-battle`);
  }
  const won = await snapshot(page);
  assert.equal(won.mode, 'victory', `${id}: command limit exceeded`);
  assert.ok(won.cleared.includes(id));
  assert.ok(await page.locator('.reward-row').innerText());
  await capture(page, `desktop-${id}-victory`);
  await page.locator('[data-action="victory"]').click();
  log(`Won ${id} through DOM commands; ${won.battle.turn} enemy actions; crew levels ${won.party.map(h => h.level).join('/')}`);
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await desktop.newPage(); observe(page, 'desktop');
  try {
    await begin(page); await capture(page, 'desktop-explore');
    const before = (await snapshot(page)).player;
    await page.keyboard.down('d'); await page.waitForTimeout(650); await page.keyboard.up('d');
    assert.ok((await snapshot(page)).player.x > before.x + 0.3); log('Keyboard exploration moves the crew');
    for (const tab of ['Map', 'Party', 'Inventory', 'Skills', 'Settlement', 'Quests', 'Save', 'Settings']) { await menu(page, tab); await inspectLayout(page, `desktop-${tab}`); await capture(page, `desktop-${tab.toLowerCase()}`); }
    await page.locator('[data-setting="quality"]').selectOption('medium');
    await page.locator('[data-setting="battleSpeed"]').selectOption('1.4');
    assert.equal((await snapshot(page)).settings.quality, 'medium');
    log('All eight desktop journal tabs and visual/battle settings work');
    for (const [heroId, skillId] of [['kaida', 'tempered-edge'], ['vex', 'void-focus'], ['rune', 'reinforced']]) await learn(page, heroId, skillId);
    await travel(page, 'cache-west'); await travel(page, 'cache-east');
    await equip(page, 'kaida', 'dawn-charm'); await equip(page, 'vex', 'relay-mail');
    await menu(page, 'Settlement'); await page.locator('[data-action="build"]').click();
    assert.equal((await snapshot(page)).settlement.beacon, 1); log('Discovery loot, equipment controls, skill nodes, and beacon construction work');
    await close(page); await travel(page, 'causeway'); await fight(page, 'causeway');
    await equip(page, 'kaida', 'sunsteel-edge');
    await menu(page, 'Save'); await page.locator('[data-action="save"]').click();
    const saved = await snapshot(page); await page.locator('[data-action="title"]').click();
    await page.locator('[data-action="continue"]').click();
    assert.deepEqual((await snapshot(page)).cleared, saved.cleared); assert.equal((await snapshot(page)).party[0].equipment.weapon, 'sunsteel-edge');
    log('Save, return to title, and Continue preserve progression and equipment');
    await travel(page, 'garden'); await fight(page, 'garden');
    await equip(page, 'vex', 'void-prism'); await learn(page, 'vex', 'event-horizon');
    await travel(page, 'relay-west'); await travel(page, 'memory');
    await travel(page, 'wardens'); await fight(page, 'wardens');
    await equip(page, 'rune', 'warden-driver'); await learn(page, 'rune', 'fortress'); await learn(page, 'kaida', 'afterimage');
    await travel(page, 'relay-east');
    await menu(page, 'Settlement'); await page.locator('[data-action="build"]').click();
    assert.equal((await snapshot(page)).settlement.beacon, 2);
    await close(page); await travel(page, 'boss'); await fight(page, 'boss');
    assert.equal((await snapshot(page)).mode, 'ending');
    assert.ok(results.commands.some(c => c.actionId === 'aeon-sunder')); await capture(page, 'desktop-ending');
    await page.locator('[data-action="ending-explore"]').click();
    assert.equal((await snapshot(page)).mode, 'explore');
    log('Complete chapter ends, all three pair combinations and Aeon Sunder executed legally, post-ending exploration works');
  } catch (error) { results.errors.push({ label: 'desktop', type: 'test', message: error.stack }); await capture(page, 'desktop-failure'); }
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage(); observe(phone, 'mobile');
  try {
    await begin(phone); await capture(phone, 'mobile-explore'); await inspectLayout(phone, 'mobile-explore');
    const stick = await phone.locator('#joystick').boundingBox(); assert.ok(stick, 'touch stick should be visible');
    const before = (await snapshot(phone)).player;
    await phone.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2); await phone.mouse.down(); await phone.mouse.move(stick.x + stick.width - 4, stick.y + stick.height / 2); await phone.waitForTimeout(650); await phone.mouse.up();
    assert.ok((await snapshot(phone)).player.x > before.x + 0.3); log('Mobile joystick moves the crew through pointer input');
    for (const tab of ['Map', 'Party', 'Inventory', 'Skills', 'Settlement', 'Quests', 'Save', 'Settings']) { await menu(phone, tab); await inspectLayout(phone, `mobile-${tab}`); await capture(phone, `mobile-${tab.toLowerCase()}`); }
    await close(phone); await travel(phone, 'causeway');
    await phone.waitForFunction(() => window.__dusk.game.state.party.every(h => h.atb >= 100));
    const enemyId = (await snapshot(phone)).battle.enemies[0].id;
    await issue(phone, 'kaida', 'arc-cut', enemyId); await capture(phone, 'mobile-battle'); await inspectLayout(phone, 'mobile-battle');
    await menu(phone, 'Save'); assert.equal(await phone.locator('[data-action="save"]').isEnabled(), false); await close(phone);
    // Separate deterministic defeat setup tests the real enemy update, defeat modal, and retry button.
    await phone.evaluate(() => { const g = window.__dusk.game; for (const h of g.state.party) { h.hp = 1; h.atb = 0; } const enemy = g.state.battle.enemies[0]; enemy.atb = 99.9; enemy.intent = { name: 'Retry test', type: 'all', power: 20, targetId: 'kaida' }; });
    await phone.locator('[data-action="retry"]').waitFor({ state: 'visible' }); await capture(phone, 'mobile-defeat');
    await phone.locator('[data-action="retry"]').click();
    assert.ok((await snapshot(phone)).party.every(h => h.hp === h.maxHp));
    await capture(phone, 'mobile-retry'); log('Mobile menus, combat target/execute, battle save restrictions, defeat, and retry work');
  } catch (error) { results.errors.push({ label: 'mobile', type: 'test', message: error.stack }); await capture(phone, 'mobile-failure'); }
  await mobile.close();
} finally {
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
  results.finished = new Date().toISOString();
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ checks: results.checks.length, commands: results.commands.length, errors: results.errors, artifacts }, null, 2));
}
assert.equal(results.errors.length, 0, 'Browser acceptance failures; inspect report.json and screenshots');
